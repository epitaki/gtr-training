# Production image-generation prompts

2026-09-26 / built-in image_gen. Original artwork only; no commercial sprite-sheet pixels are used.
User approved the concept, then explicitly approved script crop/resize/palette cleanup (「いいよ」).
The first requested transparent source returned RGB with a painted checkerboard; it is not treated as alpha. A subsequent image_gen edit replaced the background with magenta for explicit chroma-key processing. Both accepted source masters retain their unmodified generated pixels here.

## Motion source (first generation)

```text
Use case: identity-preserve
Asset type: production source sprite sheet for our ORIGINAL pixel-art puzzle blobs.
Input image: the supplied sheet is the APPROVED character-design reference. Preserve these original faces, silhouettes and colors, not its presentation board.
Create a clean new SPRITE SOURCE SHEET, 1536x1024, exactly 6 equally spaced columns x4 rows, each invisible cell 256x256. Row1 RED, row2 GREEN, row3 BLUE, row4 YELLOW. Exactly24 isolated sprites, no extra duplicates. GENUINELY TRANSPARENT background with alpha. No dark background, no white background, no checkerboard painted into the image, no labels, no grid, no text, no watermarks.
Columns from left to right:
1 IDLE: approved simple squat rounded pixel jelly body and approved face.
2 FALL: same body slightly stretched vertically and slightly narrower, same face.
3 LAND: same body moderately squashed horizontally, fits within the same cell; keep face readable, no dramatic grin change.
4 BRIGHT: same idle silhouette and same face, with a few larger pale pixel highlights for pre-disappearance; NO glow outside sprite.
5 SPLIT: the body separating into four compact chunky pixel fragments with visible transparent cracks; remnants still recognizable as that color, face disappearing.
6 PARTICLES: 5-7 small square fragments of that row's body color, spaced around the same center, no face, no glow.
Identity: red has two vertical dark eyes with tiny cream eye glints and a small curved smile; green has two straight horizontal dash eyes and small smile; blue has sleepy half-open dark eyes and a short horizontal mouth; yellow has happy chevron eyes and a tiny happy mouth. Keep one face per whole sprite.
Style: strict hard-edged low-resolution 8-bit sprite art using large square pixel clusters, not smooth vector or painting. Each cell design resembles a 24x24 logical pixel canvas enlarged with nearest-neighbor. Limited palette per color (body main, shadow, highlight, cream, ink). No gradients, no blur, no soft shadow, no bloom. Existing distinct approved face styles should be obvious after reduction.
Composition: each sprite centered at x=128 within its256cell; whole idle body fits roughly144x160px, leaves transparent margin. All whole sprites use same bottom baseline near y=208. Falling sprite at most180px tall; squashed sprite at most192px wide. Particles remain within192x192 central footprint. Keep equal offsets from row to row. Each of the24 cell pictures is separate from every adjacent picture.
The output must be only usable isolated sprite art on actual transparency, NOT a demonstration board. No scene or reference-sheet decorations.
```

## Motion source (key background correction, accepted motion-master.png)

```text
Use case: precise-object-edit. Keep all 24 sprites exactly as they are: same shapes, positions, faces, poses, colors, highlights, scales, rows, columns. Change ONLY THE BACKGROUND. Remove the fake checkerboard, all gray shadows outside sprites, and all soft gray halos. Replace every background pixel with perfectly uniform pure chroma-key MAGENTA #FF00FF (RGB255,0,255), including the gaps between split fragments and particles. Use flat solid magenta, no checkerboard, no texture, no shadow, no glow, no gradient. Pixel sprite contours remain hard edged; keep black faces, body shadows and cream highlights inside sprites unchanged. Keep1536x1024 dimensions and the6-column4-row layout, no text. We will key only this flat magenta to alpha during approved asset processing. Do not claim or visualize transparency; deliver actual flat magenta as the background.
```

## Body, connection parts and mini source (accepted parts-master.png)

```text
Use case: identity-preserve.
Asset type: production SOURCE PARTS for our approved ORIGINAL pixel-art jelly characters.
Input image1: approved character design sheet; preserve its four characters and face styles. Input image2: our production motion sheet; preserve its palette and simple chunky outline.
Create one square1024x1024 image with exactly4 columns x4 rows of separate parts. Each invisible cell256x256. Row1 red, row2 green, row3 blue,row4 yellow. Flat solid pure magenta #FF00FF background everywhere around the parts, no checkerboard. No text, no labels, no grid, no softshadows, no bloom, no painted backgroundtexture.
COLUMN1: original idle BODY ONLY without eyes or mouth, keeping its colored body, stepped perimeter and upper-left cream pixel highlight. Squat rounded body matching the approved shape.
COLUMN2: same BODY ONLY with FOUR SHORT STUBBY FLAT CONNECTION TABS, one at top,right,bottom,left. It is one little body intended to join to other identical cells, not four blobs and not a star. No face. Each tab about8 logicalpixels wide on24logicalpixel design; flat tabtips use the same solid body-main color, no face/highlight at tabtips. Keep rest of body identical tocolumn1. Tabs shorterthan bodyradius.
COLUMN3: miniature complete original character with face, a deliberately simplified12x12logicalpixel sprite enlarged nearestneighbor so pixels are obvious. Use bodymain,shadow,cream,ink, no minute details. Red vertical eyes,green dash eyes,blue sleepy eyes,yellow chevrons, simple mouth. No copying commercialsprites.
COLUMN4: even simpler complete8x8logicalpixel teaching-icon version, enlarged with squarepixels. Red2vertical dark eye marks,green2horizontal short dash marks,blue2lower flat drooping marks,yellow2small happy corner marks. Simplify silhouette to roundedsquare, useveryfewpixelclusters. It must look coarse8-bit, not highresolution small.
Center everypart within cell, leave32pxmagenta margins onallsides (including connectiontabs). All artworkhard-edgedpixelstyle, noantialiasingorgradients. 16parts exactly. Facefreebodyparts columns1/2; exactlyoneface permini columns3/4. Preserve originalapproved artfamily. Magenta background is for keyed alpha extraction by an approved deterministic processing pipeline, not partofsprites.
```

