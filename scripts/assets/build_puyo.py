"""Rebuild the 015-B pixel atlas from editable, indexed pixels.

Extraction is an explicit authoring step. Normal builds never read or modify the
generated master art; the JSON rows are the editable source of truth.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from math import ceil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/puyo/source/production-v1"
OUT = ROOT / "src/assets/puyo"
COLORS = ("red", "green", "blue", "yellow")
PALETTES = {
    "red": ("000000", "730006", "bc0710", "f12d28", "ff5650", "ffaaa0", "fff7d8"),
    "green": ("000000", "075018", "078d20", "40d32c", "78e443", "bbf577", "f6fff0"),
    "blue": ("000000", "001466", "0347b8", "1389ec", "42b5ff", "a7e0ff", "f5fcff"),
    "yellow": ("000000", "915000", "d68c00", "ffcb16", "ffe342", "fff09a", "ffffed"),
}
# Pixel digit 0 is transparent; 1..7 index the color's seven opaque swatches.
SWATCHES = {color: [tuple(bytes.fromhex(rgb)) for rgb in values] for color, values in PALETTES.items()}
MOTION = ("idle", "fall", "land", "bright", "split", "particle")
PARTS = ("body", "cross", "mini12", "mini8")
STATES = ("idle", *(f"connect/{n}" for n in range(16)),
          *(f"connect-enter/{n}" for n in range(16)),
          *(f"fall/{n}" for n in range(2)),
          *(f"land/{n}" for n in range(3)),
          *(f"clear/{n}" for n in range(3)), "mini12", "mini8",
          *(f"particle/{n}" for n in range(3)))
TIMINGS = {
    "fall": {"driver": "gravity", "frames": [0, 1], "unit": "individual animation time"},
    "land": {"driver": "land", "totalMs": 80, "intervalConvention": "[startMs,endMs)",
             "frames": [{"frame": "land/0", "startMs": 0, "endMs": 40},
                        {"frame": "land/1", "startMs": 40, "endMs": 64},
                        {"frame": "land/2", "startMs": 64, "endMs": 80}]},
    "clear": {"driver": "emphasis then fade",
              "emphasis": {"durationMs": 120, "frame": 0},
              "fade": {"durationMs": 180, "frames": [
                  {"frame": 1, "startMs": 0, "endMs": 60},
                  {"frame": 2, "startMs": 60, "endMs": 120},
                  {"frame": "particle/*", "startMs": 120, "endMs": 180}]}},
    "connectEnter": {
        "driver": "existing land or emphasis phase", "intervalConvention": "[startMs,endMs)",
        "newPhysicsDelayMs": 0,
        "eligibility": "new real-individual same-color adjacency after gravity; exclude moving individuals; include stationary neighbours whose adjacency increases",
        "priority": ["clear", "land/0 or land/1", "connect-enter", "connect"],
        "land": {"phase": "land", "enterStartMs": 64, "enterEndMs": 80,
                 "stableFromMs": 80, "oldConnections": "connect"},
        "emphasisWithoutLand": {"phase": "emphasis", "clearTargetFrame": "clear/0",
                                "enterStartMs": 0, "enterEndMs": 40,
                                "stableFromMs": 40},
        "zeroChain": {"phase": "none", "frame": "connect", "delayMs": 0},
        "invalidateOn": ["clear", "cancel", "board change"],
        "everyRenderFrameObserved": False,
    },
}
CONNECTION_COMPOSITION = {
    "baseFrame": "{color}/connect/{currentMask}",
    "shoulderSourceFrame": "{color}/connect-enter/{currentMask}",
    "newMaskField": "newAdjacencyMask",
    "newMaskRule": "subset of currentMask; derive from actual neighboring individual relationships, not a difference of color masks",
    "shoulderRects": {"1": [8, 2, 8, 1], "2": [21, 8, 1, 8],
                      "4": [8, 21, 8, 1], "8": [2, 8, 1, 8]},
    "newMaskZero": "use baseFrame unchanged",
    "newMaskEqualsCurrent": "the full shoulderSourceFrame is equivalent",
    "examples": [
        {"priorMask": 2, "currentMask": 3, "newAdjacencyMask": 1,
         "meaning": "new upper relationship; retain stable right shoulder"},
        {"priorMask": 3, "currentMask": 3, "newAdjacencyMask": 1,
         "meaning": "upper neighboring individual replaced; the color mask stayed the same but the relationship is new"},
    ],
    "scope": "asset contract and static QA only; gameplay composition belongs to 015-C",
}
QA_PATTERNS = (
    ("horizontal", ((0, 0, "red", 2), (1, 0, "red", 8))),
    ("vertical", ((0, 0, "green", 4), (0, 1, "green", 1))),
    ("L", ((0, 0, "blue", 6), (1, 0, "blue", 8), (0, 1, "blue", 1))),
    ("2x2", ((0, 0, "yellow", 6), (1, 0, "yellow", 12),
             (0, 1, "yellow", 3), (1, 1, "yellow", 9))),
    ("T", ((0, 0, "red", 2), (1, 0, "red", 14),
           (2, 0, "red", 8), (1, 1, "red", 1))),
    ("cross", ((1, 0, "green", 4), (0, 1, "green", 2),
               (1, 1, "green", 15), (2, 1, "green", 8), (1, 2, "green", 1))),
    ("different", ((0, 0, "red", 0), (1, 0, "blue", 0))),
    ("diagonal", ((0, 0, "yellow", 0), (1, 1, "yellow", 0))),
)


def is_magenta(rgb: tuple[int, int, int]) -> bool:
    r, g, b = rgb
    return r > 105 and b > 105 and g < 145 and b > r * 0.53 and r > g * 1.35 and b > g * 1.35


def object_crop(image: Image.Image, col: int, row: int, columns: int,
                connected: bool = False) -> tuple[Image.Image, list[int]]:
    w, h = image.size
    cell = (col * w // columns, row * h // 4, (col + 1) * w // columns, (row + 1) * h // 4)
    points = [(x, y) for y in range(cell[1], cell[3]) for x in range(cell[0], cell[2])
              if not is_magenta(image.getpixel((x, y))[:3])]
    if not points:
        raise ValueError(f"Empty generated-art cell: {col},{row}")
    if connected:
        # Parts may cross a nominal row boundary. The yellow cross starts at
        # y=938 although its grid row begins at y=940; the blue cell sees that
        # cap. Flooding the part nearest its cell center selects the complete
        # authored object without borrowing pixels from the neighbouring row.
        center_x = (cell[0] + cell[2]) // 2
        center_y = (cell[1] + cell[3]) // 2
        seed = min(points, key=lambda point: (point[0] - center_x) ** 2 + (point[1] - center_y) ** 2)
        visited = {seed}
        todo = [seed]
        points = []
        while todo:
            x, y = todo.pop()
            points.append((x, y))
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                neighbor = (nx, ny)
                if (cell[0] <= nx < cell[2] and 0 <= ny < h and neighbor not in visited
                        and not is_magenta(image.getpixel(neighbor)[:3])):
                    visited.add(neighbor)
                    todo.append(neighbor)
    box = [min(x for x, _ in points), min(y for _, y in points),
           max(x for x, _ in points) + 1, max(y for _, y in points) + 1]
    return image.crop(tuple(box)), box


def index_rgb(rgb: tuple[int, int, int], color: str) -> int:
    if is_magenta(rgb):
        return 0
    r, g, b = rgb
    if max(rgb) < 95:
        return 1  # expression, black or nearly black
    if min(rgb) > 205 and max(rgb) - min(rgb) < 80:
        return 7  # eye glints and highlights
    choices = SWATCHES[color][1:6]
    # Weighted distance guards the hue while normalizing the generated gradients.
    return 2 + min(range(len(choices)), key=lambda i: sum((rgb[j] - choices[i][j]) ** 2 for j in range(3)))


def blank(size: int) -> list[list[int]]:
    return [[0] * size for _ in range(size)]


def raster(crop: Image.Image, color: str, size: int, width: int, height: int,
           left: int | None = None, top: int | None = None) -> list[list[int]]:
    scaled = crop.resize((width, height), Image.Resampling.NEAREST)
    result = blank(size)
    left = (size - width) // 2 if left is None else left
    top = (size - height) // 2 if top is None else top
    for y in range(height):
        for x in range(width):
            result[top + y][left + x] = index_rgb(scaled.getpixel((x, y))[:3], color)
    return result


def add_face(body: list[list[int]], face: list[list[int]]) -> None:
    # Restrict the copy to the expression. Cross-body changes never alter it.
    for y in range(9, 21):
        for x in range(5, 20):
            if face[y][x] in (1, 7):
                body[y][x] = face[y][x]


def connect(base: list[list[int]], cross: list[list[int]], mask: int,
            color: str, entering: bool = False) -> list[list[int]]:
    result = [row[:] for row in base]
    seam = 5 if color == "green" else 4
    # The first two rows are the 8px seam, the next two widen to 10px,
    # and the last three blend into the 12px body. Rotate this one shape
    # for every side so two neighbouring sprites share exactly one bridge.
    for bit in (1, 2, 4, 8):
        if not mask & bit:
            continue
        for depth in range(7):
            half_width = 4 if depth < 2 else 5 if depth < 4 else 6
            for offset in range(-half_width, half_width):
                if bit == 1:
                    x, y = 12 + offset, depth
                elif bit == 2:
                    x, y = 23 - depth, 12 + offset
                elif bit == 4:
                    x, y = 12 + offset, 23 - depth
                else:
                    x, y = depth, 12 + offset
                if 5 <= x < 20 and 9 <= y < 21:
                    continue  # Exact idle face, including its background.
                if depth == 0:
                    result[y][x] = seam
                elif result[y][x] <= 3:
                    # The former body rim and cross cap are internal here.
                    # Keep existing bright body shading wherever possible.
                    result[y][x] = cross[y][x] if cross[y][x] >= 4 else seam
    if entering:
        # A brief lighter shoulder distinguishes connection onset while keeping
        # a continuous tab and the exact same outer seam as the stable frame.
        for bit, points in ((1, [(x, 2) for x in range(8, 16)]),
                            (2, [(21, y) for y in range(8, 16)]),
                            (4, [(x, 21) for x in range(8, 16)]),
                            (8, [(2, y) for y in range(8, 16)])):
            if mask & bit:
                for x, y in points:
                    if result[y][x] not in (0, 1, 7):
                        result[y][x] = 6 if result[y][x] == 5 else 5
    return result


def rows(pixels: list[list[int]]) -> list[str]:
    return ["".join(str(value) for value in row) for row in pixels]


def particle_components(crop: Image.Image, absolute_box: list[int]) -> list[tuple[Image.Image, list[int]]]:
    """Find the three largest authored fragments, each with its own crop."""
    seen = set()
    components = []
    for y in range(crop.height):
        for x in range(crop.width):
            if (x, y) in seen or is_magenta(crop.getpixel((x, y))[:3]):
                continue
            todo = [(x, y)]
            seen.add((x, y))
            points = []
            while todo:
                px, py = todo.pop()
                points.append((px, py))
                for neighbor in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    nx, ny = neighbor
                    if (0 <= nx < crop.width and 0 <= ny < crop.height and neighbor not in seen
                            and not is_magenta(crop.getpixel(neighbor)[:3])):
                        seen.add(neighbor)
                        todo.append(neighbor)
            if len(points) >= 12:
                box = [min(px for px, _ in points), min(py for _, py in points),
                       max(px for px, _ in points) + 1, max(py for _, py in points) + 1]
                components.append((len(points), box))
    components.sort(key=lambda item: (-item[0], item[1][1], item[1][0]))
    if len(components) < 3:
        raise ValueError("Generated particle cell contains fewer than three fragments")
    return [(crop.crop(tuple(box)), [box[0] + absolute_box[0], box[1] + absolute_box[1],
                                      box[2] + absolute_box[0], box[3] + absolute_box[1]])
            for _, box in components[:3]]


def ink_components(crop: Image.Image) -> list[list[int]]:
    """Connected dark marks in the generated miniature's central face ROI."""
    x0, x1 = round(crop.width * 0.18), round(crop.width * 0.82)
    y0, y1 = round(crop.height * 0.3), round(crop.height * 0.8)
    marked = {(x, y) for y in range(y0, y1) for x in range(x0, x1)
              if max(crop.getpixel((x, y))[:3]) < 95}
    components = []
    while marked:
        start = next(iter(marked))
        marked.remove(start)
        todo = [start]
        pixels = [start]
        while todo:
            x, y = todo.pop()
            for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if neighbor in marked:
                    marked.remove(neighbor)
                    todo.append(neighbor)
                    pixels.append(neighbor)
        if len(pixels) >= 8:
            components.append([min(x for x, _ in pixels), min(y for _, y in pixels),
                               max(x for x, _ in pixels) + 1, max(y for _, y in pixels) + 1])
    return sorted(components, key=lambda box: (box[1], box[0]))


def miniature(crop: Image.Image, color: str, size: int, source_box: list[int]) -> tuple[list[list[int]], dict]:
    """Resample the three authored face marks separately so neither mouth vanishes."""
    content = 10 if size == 12 else 8
    offset = 1 if size == 12 else 0
    output = raster(crop, color, size, content, content, offset, offset)
    # These are face-only inner pixels; the silhouette and corner highlights stay.
    for y in range(4 if size == 12 else 3, 10 if size == 12 else 7):
        for x in range(2 if size == 12 else 1, 10 if size == 12 else 7):
            if output[y][x] == 1:
                output[y][x] = 4
    components = ink_components(crop)
    if len(components) != 3:
        raise ValueError(f"Expected two authored eyes and one mouth: {color}/mini{size}: {components}")
    mouth = max(components, key=lambda box: box[1])
    eyes = sorted((box for box in components if box is not mouth), key=lambda box: box[0])
    samples = []
    for role, box in zip(("leftEye", "rightEye", "mouth"), (*eyes, mouth)):
        width = max(1, min(3 if size == 12 else 2, ceil((box[2] - box[0]) * content / crop.width)))
        height = max(1, min(3 if size == 12 else 2,
                            ceil((box[3] - box[1]) * (11 if size == 12 else 10) / crop.height)))
        center_y = round((box[1] + box[3]) * content / (2 * crop.height) + offset)
        # Align the two independently sampled eyes with a visible gap at 8px.
        # Their widths/heights and dark-pixel shapes still come from the art.
        if role == "leftEye":
            dx = (3 if size == 8 else 6) - width
        elif role == "rightEye":
            dx = 5 if size == 8 else 7
        else:
            dx = (size - width) // 2
        dy = max(2, min(size - height - 1, center_y - height // 2))
        if role == "mouth":
            dy = max(dy, max(item["destinationRect"][1] + item["destinationRect"][3]
                             for item in samples))
        source_mask = Image.new("L", (box[2] - box[0], box[3] - box[1]))
        for y in range(box[1], box[3]):
            for x in range(box[0], box[2]):
                if max(crop.getpixel((x, y))[:3]) < 95:
                    source_mask.putpixel((x - box[0], y - box[1]), 255)
        scaled = source_mask.resize((width, height), Image.Resampling.NEAREST)
        if not scaled.getbbox():
            raise ValueError(f"Face mark vanished when sampling: {color}/mini{size}/{role}")
        for y in range(height):
            for x in range(width):
                if scaled.getpixel((x, y)):
                    output[dy + y][dx + x] = 1
        samples.append({"role": role,
                        "sourceRect": [box[0] + source_box[0], box[1] + source_box[1],
                                       box[2] + source_box[0], box[3] + source_box[1]],
                        "destinationRect": [dx, dy, width, height],
                        "method": "nearest-neighbor dark-ink mask; source RGB channels < 95"})
    return output, {"sourceCellRect": source_box, "samples": samples}


def extract() -> None:
    motion = Image.open(SOURCE / "motion-master.png").convert("RGB")
    parts = Image.open(SOURCE / "parts-master.png").convert("RGB")
    entries: dict[str, dict] = {}
    crops: dict[str, dict] = {}
    face_samples: dict[str, dict] = {}
    for row, color in enumerate(COLORS):
        m = {name: object_crop(motion, col, row, 6) for col, name in enumerate(MOTION)}
        p = {name: object_crop(parts, col, row, 4, connected=True) for col, name in enumerate(PARTS)}
        crops[color] = {f"motion/{name}": box for name, (_, box) in m.items()}
        crops[color].update({f"parts/{name}": box for name, (_, box) in p.items()})
        body = raster(p["body"][0], color, 24, 22, 22, 1, 1)
        face = raster(m["idle"][0], color, 24, 22, 22, 1, 1)
        cross = raster(p["cross"][0], color, 24, 24, 24)
        add_face(body, face)
        frames: dict[str, list[list[int]]] = {}
        frames["idle"] = body
        for mask in range(16):
            frames[f"connect/{mask}"] = connect(body, cross, mask, color=color)
            frames[f"connect-enter/{mask}"] = connect(body, cross, mask, color, True)
        frames["fall/0"] = body
        frames["fall/1"] = raster(m["fall"][0], color, 24, 16, 22, 4, 1)
        frames["land/0"] = raster(m["land"][0], color, 24, 22, 14, 1, 9)
        frames["land/1"] = raster(m["land"][0], color, 24, 21, 16, 1, 7)
        frames["land/2"] = body
        frames["clear/0"] = raster(m["bright"][0], color, 24, 20, 18, 2, 5)
        frames["clear/1"] = raster(m["split"][0], color, 24, 22, 19, 1, 3)
        frames["clear/2"] = raster(m["split"][0], color, 24, 18, 17, 3, 4)
        frames["mini12"], mini12_sampling = miniature(p["mini12"][0], color, 12, p["mini12"][1])
        frames["mini8"], mini8_sampling = miniature(p["mini8"][0], color, 8, p["mini8"][1])
        face_samples[color] = {"mini12": mini12_sampling, "mini8": mini8_sampling}
        fragments = particle_components(*m["particle"])
        for n, (fragment, box) in enumerate(fragments):
            crops[color][f"motion/particle/{n}"] = box
            frames[f"particle/{n}"] = raster(fragment, color, 6, 5 - n, 5 - n)
        entries[color] = {key: rows(value) for key, value in frames.items()}
    provenance = {name: hashlib.sha256((SOURCE / name).read_bytes()).hexdigest()
                  for name in ("motion-master.png", "parts-master.png")}
    data = {"schema": 1, "pixelEncoding": "row strings of 0..7; 0 transparent, 1..7 palette order",
            "masterSha256": provenance, "sourceRects": crops, "faceSampling": face_samples,
            "palettes": PALETTES,
            "sprites": entries}
    SOURCE.mkdir(parents=True, exist_ok=True)
    (SOURCE / "pixels.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def reconnect() -> None:
    """Recompose only connection rows from saved idle pixels and the verified cross art."""
    path = SOURCE / "pixels.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    validate_data(data)
    for name in ("motion-master.png", "parts-master.png"):
        actual = hashlib.sha256((SOURCE / name).read_bytes()).hexdigest()
        if actual != data["masterSha256"][name]:
            raise ValueError(f"Source master changed: {name}")
    parts = Image.open(SOURCE / "parts-master.png").convert("RGB")
    updated = False
    for row, color in enumerate(COLORS):
        crop, box = object_crop(parts, 1, row, 4, connected=True)
        if box != data["sourceRects"][color]["parts/cross"]:
            raise ValueError(f"Cross source rectangle changed: {color}")
        cross = raster(crop, color, 24, 24, 24)
        idle = [[int(ch) for ch in pixels] for pixels in data["sprites"][color]["idle"]]
        for mask in range(16):
            for entering, prefix in ((False, "connect"), (True, "connect-enter")):
                name = f"{prefix}/{mask}"
                pixels = rows(connect(idle, cross, mask, color, entering))
                if data["sprites"][color][name] != pixels:
                    data["sprites"][color][name] = pixels
                    updated = True
    if updated:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def validate_data(data: dict) -> None:
    if (data.get("schema") != 1 or not isinstance(data.get("sprites"), dict)
            or not isinstance(data.get("palettes"), dict)):
        raise ValueError("Invalid source schema, sprites or palettes")
    missing_colors = sorted(set(COLORS) - set(data["sprites"]))
    extra_colors = sorted(set(data["sprites"]) - set(COLORS))
    if missing_colors or extra_colors:
        raise ValueError(f"Sprite colors missing={missing_colors} unexpected={extra_colors}")
    missing_palettes = sorted(set(COLORS) - set(data["palettes"]))
    extra_palettes = sorted(set(data["palettes"]) - set(COLORS))
    if missing_palettes or extra_palettes:
        raise ValueError(f"Palette colors missing={missing_palettes} unexpected={extra_palettes}")
    for color in COLORS:
        if not isinstance(data["sprites"][color], dict):
            raise ValueError(f"Invalid sprite states for {color}")
        missing = sorted(set(STATES) - set(data["sprites"][color]))
        extra = sorted(set(data["sprites"][color]) - set(STATES))
        if missing or extra:
            raise ValueError(f"Sprite states {color}: missing={missing} unexpected={extra}")
        palette = data["palettes"][color]
        if len(palette) > 8 or len(palette) < 7:
            raise ValueError(f"Invalid palette: {color}")
        if any(len(value) != 6 or any(ch not in "0123456789abcdefABCDEF" for ch in value)
               for value in palette):
            raise ValueError(f"Invalid palette swatch: {color}")
        for name, frame in data["sprites"][color].items():
            size = 12 if name == "mini12" else 8 if name == "mini8" else 6 if name.startswith("particle/") else 24
            if len(frame) != size or any(len(row) != size for row in frame):
                raise ValueError(f"Invalid dimension: {color}/{name}")
            if any(ch not in "01234567" for row in frame for ch in row):
                raise ValueError(f"Invalid pixel: {color}/{name}")
            if not any(ch != "0" for row in frame for ch in row):
                raise ValueError(f"Blank sprite: {color}/{name}")


def make_atlas(data: dict) -> tuple[Image.Image, dict]:
    frames: dict[str, dict] = {}
    names = [(color, state) for color in COLORS for state in data["sprites"][color]]
    cols = 16
    stride = 28  # 24px maximum frame + two transparent pixels on each side
    atlas = Image.new("RGBA", (cols * stride, ((len(names) + cols - 1) // cols) * stride))
    rect_for_pixels: dict[tuple[str, ...], dict] = {}
    for index, (color, state) in enumerate(names):
        pixel_rows = data["sprites"][color][state]
        key = (color, *pixel_rows)
        size = len(pixel_rows)
        if key in rect_for_pixels:
            frames[f"{color}/{state}"] = {**rect_for_pixels[key], "name": f"{color}/{state}",
                                           "aliasOf": rect_for_pixels[key]["name"]}
            continue
        x = (index % cols) * stride + 2
        y = (index // cols) * stride + 2
        palette = [tuple(bytes.fromhex(rgb)) for rgb in data["palettes"][color]]
        for py, row in enumerate(pixel_rows):
            for px, digit in enumerate(row):
                if digit != "0":
                    atlas.putpixel((x + px, y + py), (*palette[int(digit) - 1], 255))
        entry = {"name": f"{color}/{state}", "rect": [x, y, size, size],
                 "origin": [0.5, 0.5], "size": size}
        frames[entry["name"]] = entry
        rect_for_pixels[key] = entry
    manifest = {"schema": 1, "atlas": "atlas.png", "atlasSize": list(atlas.size),
                "gutter": 2, "colors": list(COLORS), "timing": TIMINGS,
                "connectionComposition": CONNECTION_COMPOSITION,
                "source": {"editablePixels": "../../../assets/puyo/source/production-v1/pixels.json",
                           "masters": data["masterSha256"], "rectangles": data["sourceRects"],
                           "faceSampling": data["faceSampling"]},
                "frames": frames}
    return atlas, manifest


def compose_connection_qa(atlas: Image.Image, manifest: dict, color: str,
                          current_mask: int, new_adjacency_mask: int) -> Image.Image:
    """Static asset QA sample of shoulder overlay; 015-C owns runtime drawing."""
    if color not in COLORS or not 0 <= current_mask <= 15 or not 0 <= new_adjacency_mask <= 15:
        raise ValueError("Invalid color or connection mask")
    if new_adjacency_mask & ~current_mask:
        raise ValueError("newAdjacencyMask must be a subset of currentMask")
    def frame(state: str) -> Image.Image:
        x, y, w, h = manifest["frames"][f"{color}/{state}/{current_mask}"]["rect"]
        return atlas.crop((x, y, x + w, y + h))
    stable = frame("connect")
    if new_adjacency_mask == 0:
        return stable
    entering = frame("connect-enter")
    for bit_text, (x, y, w, h) in manifest["connectionComposition"]["shoulderRects"].items():
        if new_adjacency_mask & int(bit_text):
            stable.paste(entering.crop((x, y, x + w, y + h)), (x, y))
    return stable


def draw_qa(atlas: Image.Image, manifest: dict) -> Image.Image:
    # Static proof sheet: source pixels always enlarged by integer nearest-neighbor.
    sheet = Image.new("RGB", (1280, 2220), (31, 35, 54))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    def label(x: int, y: int, message: str) -> None:
        draw.text((x, y), message, fill=(242, 244, 255), font=font)
    def sprite(name: str, x: int, y: int, scale: int, bg=(68, 76, 95), opacity=1.0) -> None:
        rect = manifest["frames"][name]["rect"]
        tile = atlas.crop((rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3]))
        if opacity < 1:
            tile.putalpha(tile.getchannel("A").point(lambda a: round(a * opacity)))
        tile = tile.resize((tile.width * scale, tile.height * scale), Image.Resampling.NEAREST)
        draw.rectangle((x, y, x + tile.width - 1, y + tile.height - 1), fill=bg)
        sheet.paste(tile, (x, y), tile)
    label(20, 10, "015-B PIXEL PUYO - STABLE MASKS 72PX / FOUR COLORS / 16 MASKS")
    for ci, color in enumerate(COLORS):
        label(20, 42 + ci * 228, color.upper())
        for mask in range(16):
            x = 20 + (mask % 8) * 154
            y = 60 + ci * 228 + (mask // 8) * 104
            sprite(f"{color}/connect/{mask}", x, y, 3)
            label(x + 78, y + 24, str(mask))
    label(20, 965, "CONNECTION GROUPS 48PX: horizontal / vertical / L / 2x2 / T / cross / other color / diagonal")
    for pi, (title, cells) in enumerate(QA_PATTERNS):
        bx = 20 + (pi % 4) * 312
        by = 990 + (pi // 4) * 142
        label(bx, by, title)
        for cx, cy, color, mask in cells:
            sprite(f"{color}/connect/{mask}", bx + cx * 48, by + 18 + cy * 48, 2)
    label(20, 1282, "MOTION idle / fall / land / clear / particles    MINI 36 / 24 / 16    GHOST 0.3 / 0.4")
    for ci, color in enumerate(COLORS):
        y = 1300 + ci * 48
        for fi, name in enumerate(("idle", "fall/1", "land/0", "land/1", "clear/0", "clear/1", "clear/2")):
            sprite(f"{color}/{name}", 20 + fi * 57, y, 2)
        for fi, name in enumerate(("particle/0", "particle/1", "particle/2")):
            sprite(f"{color}/{name}", 440 + fi * 24, y + 10, 3)
        sprite(f"{color}/mini12", 550, y + 6, 3)
        sprite(f"{color}/mini12", 610, y + 12, 2)
        sprite(f"{color}/mini8", 670, y + 16, 2)
        sprite(f"{color}/idle", 740, y, 2, opacity=0.3)
        sprite(f"{color}/idle", 800, y, 2, opacity=0.4)
        sprite(f"{color}/idle", 880, y, 2, bg=(229, 232, 240))
        sprite(f"{color}/idle", 940, y, 2, bg=(10, 13, 22))
    label(20, 1510, "CONNECT ENTER 48PX: all 16 masks; lighter connected shoulders, same faces and seams")
    for ci, color in enumerate(COLORS):
        y = 1530 + ci * 76
        label(20, y + 16, color)
        for mask in range(16):
            x = 102 + mask * 73
            sprite(f"{color}/connect-enter/{mask}", x, y, 2)
            label(x + 52, y + 19, str(mask))
    label(20, 1812, "ALIASES: fall/0 = idle; land/2 = idle. Static sample only; 015-C handles gameplay playback.")
    label(20, 1840, "MINI FACE DETAIL and MIXED CONNECTIONS: stable / new-up-only / all-enter at currentMask=3")
    for ci, color in enumerate(COLORS):
        y = 1862 + ci * 86
        label(20, y + 30, color)
        sprite(f"{color}/mini12", 110, y, 6)
        sprite(f"{color}/mini8", 215, y + 4, 8)
        label(315, y + 30, "12px face / 8px face")
        for j, new_mask in enumerate((0, 1, 3)):
            mixed = compose_connection_qa(atlas, manifest, color, 3, new_mask)
            scaled = mixed.resize((72, 72), Image.Resampling.NEAREST)
            x = 580 + j * 110
            draw.rectangle((x, y, x + 71, y + 71), fill=(68, 76, 95))
            sheet.paste(scaled, (x, y), scaled)
            label(x + 76, y + 30, ("0", "1", "3")[j])
    return sheet


def draw_connection_comparison(before: Image.Image, before_manifest: dict,
                               after: Image.Image, after_manifest: dict) -> Image.Image:
    """All colors and join shapes at the actual 48px board-cell size."""
    patterns = QA_PATTERNS[:6]
    sheet = Image.new("RGB", (1920, 1480), (42, 47, 66))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for row, (color, background) in enumerate((color, bg) for color in COLORS
                                               for bg in ((19, 23, 36), (231, 235, 243))):
        y = 12 + row * 184
        ink = (245, 247, 255) if background[0] < 100 else (20, 25, 38)
        for column, (name, cells) in enumerate(patterns):
            x = column * 320 + 8
            draw.rectangle((x, y, x + 311, y + 173), fill=background)
            draw.text((x + 4, y + 2), f"{color} / {name}", fill=ink, font=font)
            for image, manifest, shift, caption in ((before, before_manifest, 0, "BEFORE"),
                                                    (after, after_manifest, 160, "AFTER")):
                draw.text((x + shift + 4, y + 17), caption, fill=ink, font=font)
                for cx, cy, _, mask in cells:
                    rx, ry, w, h = manifest["frames"][f"{color}/connect/{mask}"]["rect"]
                    tile = image.crop((rx, ry, rx + w, ry + h))
                    tile = tile.resize((48, 48), Image.Resampling.NEAREST)
                    sheet.paste(tile, (x + shift + cx * 48, y + 29 + cy * 48), tile)
    return sheet


def build() -> None:
    data = json.loads((SOURCE / "pixels.json").read_text(encoding="utf-8"))
    validate_data(data)
    atlas, manifest = make_atlas(data)
    OUT.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT / "atlas.png")
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    qa = draw_qa(atlas, manifest)
    qa.save(SOURCE / "qa-preview.png")
    compare_dir = SOURCE / "connection-v2"
    before = Image.open(compare_dir / "before-atlas.png").convert("RGBA")
    before_manifest = json.loads((compare_dir / "before-manifest.json").read_text(encoding="utf-8"))
    draw_connection_comparison(before, before_manifest, atlas, manifest).save(compare_dir / "before-after.png")
    (compare_dir / "before-after.html").write_text("""<!doctype html>
<html lang="ja"><meta charset="utf-8"><title>Puyo joins before and after</title>
<style>body{margin:0;padding:16px;background:#101320;color:#f4f5ff;font:16px sans-serif}
img{display:block;width:1920px;max-width:none;image-rendering:pixelated}
.viewport{overflow:auto;max-height:90vh;border:1px solid #656e87}
button{margin:0 8px 12px 0;padding:8px 12px}</style>
<h1>接続部の比較：4色、6形、暗い盤面と明るい盤面</h1>
<p>各セルは実際の盤面と同じ48px。各組の左が修正前、右が修正後。</p>
<button onclick="document.querySelector('img').style.width='1920px'">原寸</button>
<button onclick="document.querySelector('img').style.width='3840px'">2倍</button>
<div class="viewport"><img src="before-after.png" alt="4色の横、縦、L、2×2、T、十字の接続を修正前後で比較"></div>
</html>
""", encoding="utf-8")
    (SOURCE / "qa-preview.html").write_text("""<!doctype html>
<html lang="ja"><meta charset="utf-8"><title>015-B Puyo pixel QA</title>
<style>body{margin:0;padding:16px;background:#101320;color:#f4f5ff;font:16px sans-serif}
img{display:block;width:1280px;max-width:none;image-rendering:pixelated}
.viewport{overflow:auto;max-height:90vh;border:1px solid #656e87}
button{margin:0 8px 12px 0;padding:8px 12px}</style>
<h1>015-B 静的ピクセル素材 QA</h1>
<p>原寸と拡大で輪郭・顔・接続・動き・小サイズ・半透明を確認します。</p>
<button onclick="document.querySelector('img').style.width='1280px'">原寸</button>
<button onclick="document.querySelector('img').style.width='2560px'">2倍</button>
<div class="viewport"><img src="qa-preview.png" alt="全色、16接続、動き、小サイズ、透明ガイドの静的確認表"></div>
</html>
""", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("extract", "reconnect", "build", "all"))
    args = parser.parse_args()
    if args.mode in ("extract", "all"):
        extract()
    if args.mode == "reconnect":
        reconnect()
    if args.mode in ("build", "all"):
        build()
