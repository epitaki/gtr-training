"""Independent checks of the emitted PNG and its editable pixel source."""

import copy
import hashlib
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import build_puyo  # noqa: E402
from build_puyo import QA_PATTERNS, compose_connection_qa, draw_connection_comparison, is_magenta, make_atlas, object_crop, validate_data  # noqa: E402


PART_RECTS = {
    "red": {"body": [64, 102, 273, 278], "cross": [350, 70, 590, 295],
            "mini12": [684, 102, 881, 279], "mini8": [999, 100, 1174, 276]},
    "green": {"body": [64, 388, 273, 566], "cross": [351, 357, 590, 583],
              "mini12": [683, 392, 883, 568], "mini8": [999, 392, 1174, 566]},
    "blue": {"body": [63, 679, 275, 859], "cross": [351, 650, 590, 876],
             "mini12": [683, 679, 883, 859], "mini8": [999, 686, 1174, 860]},
    "yellow": {"body": [63, 970, 275, 1149], "cross": [350, 938, 590, 1163],
               "mini12": [680, 971, 881, 1149], "mini8": [999, 970, 1174, 1146]},
}
BASELINE_NONCONNECTION_SHA256 = {
    "red": "a64d6de1e486168287d6578b6dfb1d4765ed7a3c5de81bd0df53a6c56decbd87",
    "green": "2979101d8a7c9baea981ee6d895ff933c29087b0c43921a3990fcf29fc8eef03",
    "blue": "d6aa76f910fc45d46f615014fd28560063bbe6ce60407918854ea5a0b5628b8d",
    "yellow": "c3f0190917360bd4361b019f5e0425e68e2e64e61d6327539a30f778f5b81fa9",
}


class PuyoAssetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / "assets/puyo/source/production-v1/pixels.json").read_text(encoding="utf-8"))
        cls.manifest = json.loads((ROOT / "src/assets/puyo/manifest.json").read_text(encoding="utf-8"))
        cls.atlas = Image.open(ROOT / "src/assets/puyo/atlas.png").convert("RGBA")
        before = ROOT / "assets/puyo/source/production-v1/connection-v2"
        cls.before_manifest = json.loads((before / "before-manifest.json").read_text(encoding="utf-8"))
        cls.before_atlas = Image.open(before / "before-atlas.png").convert("RGBA")

    def frame(self, name):
        x, y, w, h = self.manifest["frames"][name]["rect"]
        return self.atlas.crop((x, y, x + w, y + h))

    def assert_all_active_edges_match(self, atlas):
        """Every active side, including composite and enter masks, uses its peer seam."""
        def edge(name, bit):
            x, y, _, _ = self.manifest["frames"][name]["rect"]
            coords = {1: [(i, 0) for i in range(8, 16)],
                      2: [(23, i) for i in range(8, 16)],
                      4: [(i, 23) for i in range(8, 16)],
                      8: [(0, i) for i in range(8, 16)]}[bit]
            return [atlas.getpixel((x + px, y + py)) for px, py in coords]
        for color in ("red", "green", "blue", "yellow"):
            reference = {bit: edge(f"{color}/connect/{bit}", bit) for bit in (1, 2, 4, 8)}
            self.assertEqual(reference[1], reference[4], color)
            self.assertEqual(reference[2], reference[8], color)
            for prefix in ("connect", "connect-enter"):
                for mask in range(16):
                    for bit in (1, 2, 4, 8):
                        if mask & bit:
                            self.assertEqual(edge(f"{color}/{prefix}/{mask}", bit), reference[bit],
                                             f"{color}/{prefix}/{mask} edge {bit}")

    def test_names_dimensions_and_references(self):
        self.assertEqual(tuple(self.manifest["colors"]), ("red", "green", "blue", "yellow"))
        expected_states = (["idle"] + [f"connect/{i}" for i in range(16)] +
                           [f"connect-enter/{i}" for i in range(16)] +
                           [f"fall/{i}" for i in range(2)] + [f"land/{i}" for i in range(3)] +
                           [f"clear/{i}" for i in range(3)] + ["mini12", "mini8"] +
                           [f"particle/{i}" for i in range(3)])
        expected = {f"{color}/{state}" for color in self.manifest["colors"] for state in expected_states}
        self.assertEqual(set(self.manifest["frames"]), expected)
        for name, frame in self.manifest["frames"].items():
            self.assertEqual(frame["name"], name)
            size = 12 if name.endswith("/mini12") else 8 if name.endswith("/mini8") else 6 if "/particle/" in name else 24
            self.assertEqual(frame["rect"][2:], [size, size], name)
            self.assertEqual(frame["origin"], [0.5, 0.5], name)
            x, y, w, h = frame["rect"]
            self.assertGreaterEqual(x, 2)
            self.assertGreaterEqual(y, 2)
            self.assertLessEqual(x + w + 2, self.atlas.width)
            self.assertLessEqual(y + h + 2, self.atlas.height)
            self.assertIsNotNone(self.frame(name).getbbox(), name)
            if "aliasOf" in frame:
                self.assertIn(frame["aliasOf"], self.manifest["frames"])
                self.assertEqual(frame["rect"], self.manifest["frames"][frame["aliasOf"]]["rect"])

    def test_png_alpha_palette_and_gutters(self):
        self.assertEqual(self.atlas.size, tuple(self.manifest["atlasSize"]))
        self.assertEqual(set(self.atlas.getchannel("A").get_flattened_data()) - {0, 255}, set())
        for color in self.manifest["colors"]:
            pixels = set()
            for name in self.manifest["frames"]:
                if not name.startswith(color + "/"):
                    continue
                frame = self.frame(name)
                pixels.update(px[:3] for px in frame.get_flattened_data() if px[3] == 255)
                x, y, w, h = self.manifest["frames"][name]["rect"]
                self.assertFalse(any(self.atlas.getpixel((xx, yy))[3] for yy in range(y - 2, y + h + 2)
                                     for xx in range(x - 2, x + w + 2)
                                     if not (x <= xx < x + w and y <= yy < y + h)), name)
            self.assertLessEqual(len(pixels), 8, color)
            self.assertFalse(any(r > 105 and b > 105 and g < 145 and b > r * 0.53
                                 for r, g, b in pixels), color)

    def test_connection_seams_margins_and_faces(self):
        self.assert_all_active_edges_match(self.atlas)
        for color in self.manifest["colors"]:
            idle = self.frame(color + "/idle")
            face = [idle.getpixel((x, y)) for y in range(9, 21) for x in range(5, 20)]
            for prefix in ("connect", "connect-enter"):
                for mask in range(16):
                    frame = self.frame(f"{color}/{prefix}/{mask}")
                    self.assertEqual([frame.getpixel((x, y)) for y in range(9, 21) for x in range(5, 20)], face)
                    for bit, coords in ((1, [(x, 0) for x in range(8, 16)]),
                                        (2, [(23, y) for y in range(8, 16)]),
                                        (4, [(x, 23) for x in range(8, 16)]),
                                        (8, [(0, y) for y in range(8, 16)])):
                        values = [frame.getpixel(point) for point in coords]
                        if mask & bit:
                            self.assertEqual(len(set(values)), 1)
                            self.assertEqual(values[0][3], 255)
                        else:
                            self.assertTrue(all(pixel[3] == 0 for pixel in values))
                    for x in range(24):
                        if not mask & 1:
                            self.assertEqual(frame.getpixel((x, 0))[3], 0)
                        if not mask & 4:
                            self.assertEqual(frame.getpixel((x, 23))[3], 0)
                    for y in range(24):
                        if not mask & 2:
                            self.assertEqual(frame.getpixel((23, y))[3], 0)
                        if not mask & 8:
                            self.assertEqual(frame.getpixel((0, y))[3], 0)
                    if prefix == "connect-enter" and mask:
                        stable = self.frame(f"{color}/connect/{mask}")
                        self.assertNotEqual(frame.tobytes(), stable.tobytes(), f"{color}/{mask}")
                        self.assertEqual(frame.getchannel("A").tobytes(), stable.getchannel("A").tobytes())
            # Explicitly compare opposing edge RGB and alpha.
            self.assertEqual([self.frame(f"{color}/connect/2").getpixel((23, y)) for y in range(8, 16)],
                             [self.frame(f"{color}/connect/8").getpixel((0, y)) for y in range(8, 16)])
            self.assertEqual([self.frame(f"{color}/connect/4").getpixel((x, 23)) for x in range(8, 16)],
                             [self.frame(f"{color}/connect/1").getpixel((x, 0)) for x in range(8, 16)])

    def test_connection_shoulders_have_no_old_rim_or_transparent_cut(self):
        # Check the image data independently of the compositing helper. The
        # protected face can legitimately contain black expression pixels.
        def shoulder(bit):
            for depth, width in enumerate((8, 8, 10, 10, 12, 12, 12)):
                for offset in range(width):
                    across = 12 - width // 2 + offset
                    yield {1: (across, depth), 2: (23 - depth, across),
                           4: (across, 23 - depth), 8: (depth, across)}[bit]
        for color in self.manifest["colors"]:
            idle = self.data["sprites"][color]["idle"]
            seam = "5" if color == "green" else "4"
            for mask in range(16):
                active = {(x, y) for bit in (1, 2, 4, 8) if mask & bit
                          for x, y in shoulder(bit) if not (5 <= x < 20 and 9 <= y < 21)}
                for prefix in ("connect", "connect-enter"):
                    rows = self.data["sprites"][color][f"{prefix}/{mask}"]
                    for y in range(24):
                        for x in range(24):
                            if (x, y) in active:
                                self.assertIn(rows[y][x], "4567", f"{color}/{prefix}/{mask} at {x},{y}")
                            else:
                                self.assertEqual(rows[y][x], idle[y][x],
                                                 f"unexpected edit {color}/{prefix}/{mask} at {x},{y}")
                    for bit in (1, 2, 4, 8):
                        if mask & bit:
                            self.assertTrue(all(rows[y][x] == seam for x, y in list(shoulder(bit))[:8]))

    def test_original_internal_outline_is_removed(self):
        samples = (("red/connect/1", 9, 1), ("red/connect/2", 22, 10),
                   ("green/connect/1", 10, 1), ("blue/connect/4", 8, 21),
                   ("yellow/connect/8", 1, 10))
        for name, x, y in samples:
            bx, by, _, _ = self.before_manifest["frames"][name]["rect"]
            old = self.before_atlas.getpixel((bx + x, by + y))
            new = self.frame(name).getpixel((x, y))
            self.assertNotEqual(old, new, name)
            self.assertEqual(new[3], 255)

    def test_only_connection_source_rows_changed_from_baseline(self):
        for color in self.manifest["colors"]:
            unchanged = {name: rows for name, rows in self.data["sprites"][color].items()
                         if not name.startswith(("connect/", "connect-enter/"))}
            digest = hashlib.sha256(json.dumps(unchanged, sort_keys=True,
                                               separators=(",", ":")).encode()).hexdigest()
            self.assertEqual(digest, BASELINE_NONCONNECTION_SHA256[color])
        baseline_source = self.before_manifest["source"]
        self.assertEqual(self.data["masterSha256"], baseline_source["masters"])
        self.assertEqual(self.data["sourceRects"], baseline_source["rectangles"])
        self.assertEqual(self.data["faceSampling"], baseline_source["faceSampling"])
        self.assertEqual(self.data["palettes"],
                         {color: list(swatches) for color, swatches in build_puyo.PALETTES.items()})

    def test_reconnect_is_repeatable_and_preserves_other_source_data(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary)
            original = ROOT / "assets/puyo/source/production-v1"
            for name in ("pixels.json", "motion-master.png", "parts-master.png"):
                shutil.copy2(original / name, source / name)
            first = (source / "pixels.json").read_bytes()
            altered = json.loads(first)
            altered["sprites"]["red"]["connect/1"][1] = (
                altered["sprites"]["red"]["connect/1"][1][:9] + "0" +
                altered["sprites"]["red"]["connect/1"][1][10:])
            (source / "pixels.json").write_text(json.dumps(altered), encoding="utf-8")
            with patch.object(build_puyo, "SOURCE", source):
                build_puyo.reconnect()
                self.assertEqual((source / "pixels.json").read_bytes(), first)
                build_puyo.reconnect()
                self.assertEqual((source / "pixels.json").read_bytes(), first)

    def test_composite_and_enter_edge_corruption_is_rejected(self):
        for name, bit, color in (("blue/connect/3", 2, "blue"),
                                 ("yellow/connect-enter/12", 4, "yellow")):
            corrupted = self.atlas.copy()
            x, y, _, _ = self.manifest["frames"][name]["rect"]
            different_valid_color = (*bytes.fromhex(self.data["palettes"][color][4]), 255)
            for index in range(8, 16):
                px, py = (23, index) if bit == 2 else (index, 23)
                corrupted.putpixel((x + px, y + py), different_valid_color)
            with self.assertRaises(AssertionError):
                self.assert_all_active_edges_match(corrupted)

    def test_mixed_connection_overlay_all_subsets(self):
        composition = self.manifest["connectionComposition"]
        rects = {int(bit): tuple(rect) for bit, rect in composition["shoulderRects"].items()}
        self.assertEqual(rects, {1: (8, 2, 8, 1), 2: (21, 8, 1, 8),
                                 4: (8, 21, 8, 1), 8: (2, 8, 1, 8)})
        self.assertEqual(composition["examples"][0]["currentMask"], 3)
        self.assertEqual(composition["examples"][0]["newAdjacencyMask"], 1)
        self.assertEqual(composition["examples"][1]["priorMask"], 3)
        self.assertEqual(composition["examples"][1]["currentMask"], 3)
        self.assertEqual(composition["examples"][1]["newAdjacencyMask"], 1)
        for color in ("red", "green", "blue", "yellow"):
            for current in range(16):
                stable = self.frame(f"{color}/connect/{current}")
                entering = self.frame(f"{color}/connect-enter/{current}")
                for new in range(16):
                    if new & ~current:
                        with self.assertRaises(ValueError):
                            compose_connection_qa(self.atlas, self.manifest, color, current, new)
                        continue
                    composed = compose_connection_qa(self.atlas, self.manifest, color, current, new)
                    self.assertEqual(composed.getchannel("A").tobytes(), stable.getchannel("A").tobytes())
                    for y in range(24):
                        for x in range(24):
                            copy_enter = any(new & bit and rx <= x < rx + rw and ry <= y < ry + rh
                                             for bit, (rx, ry, rw, rh) in rects.items())
                            expected = entering.getpixel((x, y)) if copy_enter else stable.getpixel((x, y))
                            self.assertEqual(composed.getpixel((x, y)), expected,
                                             f"{color} current={current} new={new} at {x},{y}")
                            if x in (0, 23) or y in (0, 23) or (5 <= x < 20 and 9 <= y < 21):
                                self.assertEqual(composed.getpixel((x, y)), stable.getpixel((x, y)))
                    if new == 0:
                        self.assertEqual(composed.tobytes(), stable.tobytes())
                    if new == current:
                        self.assertEqual(composed.tobytes(), entering.tobytes())
            stable3 = self.frame(f"{color}/connect/3")
            entering3 = self.frame(f"{color}/connect-enter/3")
            mixed = compose_connection_qa(self.atlas, self.manifest, color, 3, 1)
            self.assertNotEqual(mixed.tobytes(), stable3.tobytes())
            self.assertEqual([mixed.getpixel((21, y)) for y in range(8, 16)],
                             [stable3.getpixel((21, y)) for y in range(8, 16)])
            self.assertEqual([mixed.getpixel((x, 2)) for x in range(8, 16)],
                             [entering3.getpixel((x, 2)) for x in range(8, 16)])

    def test_every_qa_group_mask_matches_its_neighbours(self):
        self.assertEqual([name for name, _ in QA_PATTERNS],
                         ["horizontal", "vertical", "L", "2x2", "T", "cross", "different", "diagonal"])
        for name, cells in QA_PATTERNS:
            self.assertEqual(len({(x, y) for x, y, _, _ in cells}), len(cells), name)
            for x, y, color, mask in cells:
                expected = sum(bit for dx, dy, bit in ((0, -1, 1), (1, 0, 2),
                                                       (0, 1, 4), (-1, 0, 8))
                               if any((other_x, other_y, other_color) == (x + dx, y + dy, color)
                                      for other_x, other_y, other_color, _ in cells))
                self.assertEqual(mask, expected, f"{name} at ({x},{y}) {color}")

    def test_all_parts_use_complete_isolated_generated_objects(self):
        source_rects = self.data["sourceRects"]
        master = Image.open(ROOT / "assets/puyo/source/production-v1/parts-master.png").convert("RGB")
        for row, color in enumerate(("red", "green", "blue", "yellow")):
            for col, part in enumerate(("body", "cross", "mini12", "mini8")):
                expected = PART_RECTS[color][part]
                self.assertEqual(source_rects[color][f"parts/{part}"], expected)
                _, box = object_crop(master, col, row, 4, connected=True)
                self.assertEqual(box, expected)
        self.assertEqual(source_rects["blue"]["parts/cross"][3], 876)
        self.assertEqual(source_rects["yellow"]["parts/cross"][1], 938)
        yellow_cap = master.getpixel((472, 938))
        self.assertFalse(is_magenta(yellow_cap))
        self.assertEqual(self.data["sprites"]["blue"]["connect/2"][8][22], "4")
        self.assertEqual(self.data["sprites"]["yellow"]["connect/2"][9][22], "4")
        self.assertEqual(self.data["sprites"]["yellow"]["connect/8"][9][1], "4")

    def test_landing_feet_and_provenance(self):
        for color in self.manifest["colors"]:
            def last_row(name):
                im = self.frame(color + "/" + name)
                return max(y for y in range(im.height) for x in range(im.width) if im.getpixel((x, y))[3])
            self.assertEqual(last_row("idle"), last_row("land/0"))
            self.assertEqual(last_row("idle"), last_row("land/1"))
            self.assertEqual(self.frame(color + "/idle").tobytes(), self.frame(color + "/land/2").tobytes())
        for filename, digest in self.data["masterSha256"].items():
            self.assertEqual(hashlib.sha256((ROOT / "assets/puyo/source/production-v1" / filename).read_bytes()).hexdigest(), digest)

    def test_rebuild_matches_committed_artifacts(self):
        validate_data(self.data)
        rebuilt, manifest = make_atlas(self.data)
        self.assertEqual(rebuilt.tobytes(), self.atlas.tobytes())
        self.assertEqual(manifest, self.manifest)
        encoded = io.BytesIO()
        rebuilt.save(encoded, format="PNG")
        self.assertEqual(encoded.getvalue(), (ROOT / "src/assets/puyo/atlas.png").read_bytes())
        source_path = ROOT / "src/assets/puyo" / self.manifest["source"]["editablePixels"]
        self.assertEqual(source_path.resolve(), (ROOT / "assets/puyo/source/production-v1/pixels.json").resolve())
        comparison = draw_connection_comparison(self.before_atlas, self.before_manifest,
                                                self.atlas, self.manifest)
        comparison_path = ROOT / "assets/puyo/source/production-v1/connection-v2/before-after.png"
        self.assertEqual(comparison.tobytes(), Image.open(comparison_path).convert("RGB").tobytes())

    def test_palette_source_edits_reach_png(self):
        modified = copy.deepcopy(self.data)
        modified["palettes"]["red"][3] = "123456"
        changed, _ = make_atlas(modified)
        self.assertIn((18, 52, 86, 255), set(changed.get_flattened_data()))
        self.assertNotEqual(changed.tobytes(), self.atlas.tobytes())

    def test_exact_source_state_inventory(self):
        states = set(self.data["sprites"]["red"])
        self.assertEqual(len(states), 46)
        self.assertEqual(len(self.manifest["frames"]), 184)
        for color in ("red", "green", "blue", "yellow"):
            for state in states:
                altered = {**self.data, "sprites": {**self.data["sprites"],
                                                   color: {**self.data["sprites"][color]}}}
                altered["sprites"][color].pop(state)
                with self.assertRaisesRegex(ValueError, f"{color}.*{state}"):
                    validate_data(altered)
            for unknown in ("mystery", "connect/16", "connect-enter/16",
                            "fall/2", "land/3", "clear/3", "particle/3"):
                altered = {**self.data, "sprites": {**self.data["sprites"],
                                                   color: {**self.data["sprites"][color],
                                                           unknown: self.data["sprites"][color]["idle"]}}}
                with self.assertRaisesRegex(ValueError, f"{color}.*{unknown}"):
                    validate_data(altered)
        for color in ("red", "green", "blue", "yellow"):
            altered = {**self.data, "sprites": {name: sprites for name, sprites in self.data["sprites"].items()
                                                  if name != color}}
            with self.assertRaisesRegex(ValueError, color):
                validate_data(altered)
            altered = {**self.data, "palettes": {name: palette for name, palette in self.data["palettes"].items()
                                                   if name != color}}
            with self.assertRaisesRegex(ValueError, color):
                validate_data(altered)
        altered = {**self.data, "sprites": {**self.data["sprites"],
                                            "purple": self.data["sprites"]["red"]}}
        with self.assertRaisesRegex(ValueError, "purple"):
            validate_data(altered)
        validate_data(self.data)

    def test_miniatures_retain_distinct_source_faces(self):
        source = self.manifest["source"]["faceSampling"]
        for size in (12, 8):
            faces = {}
            mouths = {}
            for color in ("red", "green", "blue", "yellow"):
                frame = self.frame(f"{color}/mini{size}")
                metadata = source[color][f"mini{size}"]
                samples = metadata["samples"]
                self.assertEqual([sample["role"] for sample in samples],
                                 ["leftEye", "rightEye", "mouth"])
                marks = []
                for sample in samples:
                    sx0, sy0, sx1, sy1 = sample["sourceRect"]
                    cx0, cy0, cx1, cy1 = metadata["sourceCellRect"]
                    self.assertTrue(cx0 <= sx0 < sx1 <= cx1 and cy0 <= sy0 < sy1 <= cy1)
                    x, y, w, h = sample["destinationRect"]
                    marks.append({(xx, yy) for yy in range(y, y + h) for xx in range(x, x + w)
                                  if frame.getpixel((xx, yy))[:3] == (0, 0, 0)})
                    self.assertTrue(marks[-1], f"{color}/mini{size}/{sample['role']}")
                self.assertFalse(marks[0] & marks[1], f"{color}/mini{size}: eyes merged")
                self.assertGreater(min(y for _, y in marks[2]), min(y for _, y in marks[0]))
                mouths[color] = marks[2]
                # Compare only authored ink inside the face, excluding outline and highlights.
                face_box = (2, 3, 10, 10) if size == 12 else (1, 3, 7, 7)
                faces[color] = {(x, y) for y in range(face_box[1], face_box[3])
                                for x in range(face_box[0], face_box[2])
                                if frame.getpixel((x, y))[:3] == (0, 0, 0)}
            self.assertEqual(len({frozenset(points) for points in faces.values()}), 4, size)
            self.assertGreater(len({y for _, y in mouths["green"]}), len({y for _, y in mouths["blue"]}))
            if size == 8:
                self.assertNotEqual(faces["green"], faces["blue"])

    def test_connection_timing_contract_boundaries(self):
        timing = self.manifest["timing"]
        self.assertEqual(timing["connectEnter"]["newPhysicsDelayMs"], 0)
        self.assertEqual(timing["connectEnter"]["intervalConvention"], "[startMs,endMs)")
        self.assertFalse(timing["connectEnter"]["everyRenderFrameObserved"])
        self.assertEqual(timing["connectEnter"]["priority"][0], "clear")
        self.assertIn("cancel", timing["connectEnter"]["invalidateOn"])
        land = timing["land"]
        enter_land = timing["connectEnter"]["land"]
        emphasis = timing["connectEnter"]["emphasisWithoutLand"]
        def land_frame(ms, newly_connected):
            if ms >= land["totalMs"]:
                return "connect"
            normal = next(item["frame"] for item in land["frames"]
                          if item["startMs"] <= ms < item["endMs"])
            if normal != "land/2":
                return normal
            return "connect-enter" if newly_connected and enter_land["enterStartMs"] <= ms < enter_land["enterEndMs"] else "connect"
        self.assertEqual([land_frame(ms, True) for ms in (39, 40, 63, 64, 79, 80)],
                         ["land/0", "land/1", "land/1", "connect-enter", "connect-enter", "connect"])
        self.assertEqual(land_frame(64, False), "connect")
        def emphasis_frame(ms, newly_connected, clear_target):
            if clear_target:
                return emphasis["clearTargetFrame"]
            return ("connect-enter" if newly_connected and
                    emphasis["enterStartMs"] <= ms < emphasis["enterEndMs"] else "connect")
        self.assertEqual([emphasis_frame(ms, True, False) for ms in (0, 39, 40, 119)],
                         ["connect-enter", "connect-enter", "connect", "connect"])
        self.assertEqual(emphasis_frame(0, True, True), "clear/0")
        self.assertEqual(emphasis_frame(40, True, True), "clear/0")
        self.assertEqual(timing["connectEnter"]["zeroChain"]["frame"], "connect")
        self.assertEqual(timing["connectEnter"]["zeroChain"]["delayMs"], 0)

    def test_invalid_source_is_rejected(self):
        for edit in ("bad_pixel", "blank", "wrong_size", "bad_palette"):
            corrupted = copy.deepcopy(self.data)
            rows = corrupted["sprites"]["red"]["idle"]
            if edit == "bad_pixel":
                rows[0] = "x" + rows[0][1:]
            elif edit == "blank":
                rows[:] = ["0" * 24 for _ in range(24)]
            elif edit == "wrong_size":
                rows.pop()
            else:
                corrupted["palettes"]["red"][0] = "not-a-color"
            with self.assertRaises(ValueError):
                validate_data(corrupted)


if __name__ == "__main__":
    unittest.main()
