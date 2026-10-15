# 015-B pixel puyo asset bundle

This directory contains the production atlas and manifest. The 015-C renderer
loads this atlas in both game modes; runtime integration is specified in
`docs/design/PUYO-PIXEL-INTEGRATION.md`. All sprites are original generated art
normalized to editable, indexed pixels; the generated master PNGs are never
modified by the build.

## Rebuild and verify

From the repository root, with Python 3 and Pillow installed:

```sh
python -B scripts/assets/build_puyo.py build
python -B -m unittest discover -s scripts/assets -p 'test_*.py' -v
```

`build` reads the editable `assets/puyo/source/production-v1/pixels.json` and
recreates `atlas.png`, `manifest.json`, and the source-directory
`qa-preview.png`/`qa-preview.html`. The output is deterministic. The QA files
show all four colors and 16 stable and entering connection masks, examples of groups and
nonconnections, motion, particles, 36/24/16px mini display sizes, and guide
opacity over dark and light backgrounds. Open `qa-preview.html` to zoom the
pixel grid. These are static asset checks, not integrated gameplay checks.

The `connection-v2/` folder holds the frozen pre-repair atlas, manifest, and
QA preview. Each normal build also regenerates `before-after.png` and its
zoomable HTML view from that frozen atlas and the current atlas. It compares
horizontal, vertical, L, 2×2, T, and cross groups for all four colors on
light and dark backgrounds, with adjoining 48px board cells.

For an intentional connection-only resynthesis, run
`python -B scripts/assets/build_puyo.py reconnect`, then `build` and the tests.
`reconnect` verifies both original master hashes and the recorded cross crop
rectangles. It reads saved idle pixels, resamples only the approved cross
parts, and updates only `connect/*` and `connect-enter/*` rows in `pixels.json`.
Running it again leaves the file unchanged. The inactive directions and exact
face region remain identical to the saved idle image. At each active side,
the 8px seam widens through 10px and 12px shoulders; the former internal
body rim and transparent cuts become body color. Green uses its bright body
swatch for the seam, while the other three colors use their middle swatch.

Only when intentionally re-extracting from the unmodified generated masters,
run `python -B scripts/assets/build_puyo.py all`. This replaces `pixels.json`
before rebuilding. `extract` alone updates that source without creating PNGs.
Edit indexed rows or palettes in `pixels.json` for a hand correction, then run
`build` and the tests. Index `0` is transparent and `1..7` select the color's
seven opaque hex RGB swatches. Each sprite is an array of equal-width string
rows. Provenance includes exact source rectangles and SHA-256 hashes for
`motion-master.png` and `parts-master.png`. The two mini sizes come from
different generated columns; individual particles come from three separate
objects in the particle column. The `faceSampling` source metadata records
each generated mini's left-eye, right-eye and mouth rectangles and where each
dark-ink mask was placed after nearest-neighbor reduction. This keeps the
four expressions distinct at both 12px and 8px without redrawing them.
Parts are selected as connected artwork around each nominal cell center and
then cropped to their full bounds. This preserves the yellow connection
part's top pixels above its nominal row and excludes them from the blue part.

## Consumer contract for 015-C

`manifest.json` maps names such as `red/connect/6`, `red/connect-enter/6`,
`red/fall/1`, `red/land/0`, `red/clear/2`, `red/mini12`, `red/mini8`, and
`red/particle/0` to `[x,y,width,height]` atlas rectangles. `aliasOf` marks
identical pixel data sharing a rectangle. All frames use centered origin
`[0.5,0.5]`; ordinary frames need no trim or rotation. The connection-onset
overlay below does copy fixed subrectangles. The atlas leaves two
transparent pixels on every side of each occupied rectangle. Its alpha is
binary, so guide opacity 0.3/0.4 belongs to the renderer. The manifest's
`timing` maps existing gravity, landing, emphasis and fade stages to frames;
it requests no new physics delay. Connect bits are up=1, right=2, down=4,
left=8. Opposing eight-pixel boundary windows at coordinates 8..15 have
identical opaque RGBA. Each color uses at most seven opaque colors. Use nearest
neighbor scaling: 24→48 for the board, 12→36 for NEXT, 12→24 for centered
NEXT2, and 8→16 for lesson cells. Particles are 6px source squares.

Connection timing uses half-open intervals `[startMs,endMs)`. During existing
80ms landing, show `land/0` for 0–40ms and `land/1` for 40–64ms. In the
normal-body portion at 64–80ms, show `connect-enter` only on individuals that
gained a real same-color adjacency, including stationary neighbours; then
show stable `connect` from 80ms. Old connections do not replay enter. When
there is no land phase, the existing 120ms emphasis phase shows `clear/0`
on clear targets first; other newly connected individuals show enter for
0–40ms and stable connect afterward. A zero-chain outcome with no playback
stage uses stable connect immediately. Clear takes priority, and clear,
cancel or a board change invalidates old enter state. Compare actual
individual relationships after gravity and exclude pieces still moving;
colors at fixed cells alone are insufficient. The 16ms landing enter window
may not be observed in every rendered frame. 015-C applies this mapping
inside the existing phases; this bundle only declares the contract.

When new and old connections coexist, use `connect/currentMask` as the base.
`connectionComposition.shoulderRects` in the manifest lists frame-local
`[x,y,width,height]` rectangles: up bit 1 is `[8,2,8,1]`, right bit 2 is
`[21,8,1,8]`, down bit 4 is `[8,21,8,1]`, and left bit 8 is `[2,8,1,8]`.
For each bit in `newAdjacencyMask`, copy only that rectangle from
`connect-enter/currentMask`. The new mask must be a subset of currentMask.
New mask 0 uses stable connect; when every current edge is new, the full
enter frame is equivalent. With a prior right connection (mask 2), then a
new upper connection (current 3, new 1), only the upper shoulder changes;
the right shoulder stays stable. A replacement of the upper neighboring
individual can also yield current 3, new 1 even when the prior mask was 3.
Determine new edges from actual individual relationships, never from a
simple color-mask difference. The static QA sheet compares stable, mixed
and full-enter examples. Runtime composition belongs to 015-C.
