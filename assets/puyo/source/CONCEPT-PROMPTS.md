# 015-B コンセプト制作プロンプト

制作日: 2026-09-26。内蔵image_genで新規生成1回、生成結果への編集2回。API/CLIフォールバックは使用していない。

採用する確認用画像: [puyo-8bit-concept-v1.png](puyo-8bit-concept-v1.png)。ゲーム未実装・本制作前の原案。
元の参考スプライトシートをモデルの入力画像にせず、新規生成した。編集の入力は自分で生成した前段の画像だけ。
最初の生成は周囲の発光と顔の不統一があったため不採用。2回目の編集で緑の顔を区別した。

## 1. 新規生成（全文）

```text
Use case: stylized-concept
Asset type: original 8-bit blob character and animation concept sheet for a falling-pair puzzle training game. This is a visual direction preview, NOT a production-ready atlas.
Primary request: Create a polished, friendly, readable set of FOUR original little pixel-art jelly blobs in red, green, blue, and yellow. Entirely new silhouettes, faces, and shading; do not recreate any existing Puyo Puyo sprites or sheet. No source image is being supplied for copying.
Scene/backdrop: a flat deep ink-purple #171426 presentation board, slightly lighter fine separators only. No textures, scenery or decorative objects. Landscape sheet.
Style: authentic restrained low-resolution 8-bit pixel art: chunky square pixel clusters, stepped silhouettes, no anti-aliasing, no gradients, no glossy 3D, no smooth vector lines. Each main character should feel drawable within about 24x24 logical pixels. Bold readable silhouettes. Simple 3-tone body palette plus dark ink facial features and sparse cream highlights. Only a few large clear eye/mouth pixels, not detailed faces. Soft squat rounded-square jelly body without arms, legs, ears, accessories. Same family but distinct expressions: red alert eyes and tiny offset grin, green softly angled friendly eyes, blue calm half-open eyes, yellow cheery small chevron eyes. No white eye stalks; no franchise-specific face copying.
Layout: three horizontal bands with ample spacing and very restrained uppercase white pixel labels.
TOP BAND label "ORIGINAL / 8-BIT". Four equally sized large idle characters, in order RED, GREEN, BLUE, YELLOW, with small identical-design copies below them to indicate how the design reads small. These are concept-size examples, do NOT print any pixel dimensions.
MIDDLE BAND label "CONNECT". Four separate demonstrations: RED horizontal pair joined with two distinct faces; GREEN vertical pair joined with two distinct faces; BLUE 3-blob L-shaped joined group with exactly three faces; YELLOW 2x2 connected square with exactly four faces. Show same-color bodies forming a continuous clean joint, no gap at the shared edge, while individual cells remain visually countable from the faces. Keep same faces and palette as top band.
BOTTOM BAND label "MOTION". One RED character through five separated states left to right, with small labels "IDLE", "FALL", "LAND", "RECOVER", "POP". Normal shape; modest vertically stretched falling shape; compressed wide landing shape; normal recovery shape; small burst of 5-7 square same-color fragments. Consistent character identity and base position; no speed lines or lightning, no huge glow. Readable subtle deformation.
Constraints: exactly four colors of character, dark background, no purple character, no gray garbage character. Clear flat 8-bit shapes, original identity, no trademark, no watermark. No statements that this is implemented, approved, or dimensionally validated. No complete game UI or board. The essential aim is readable individual blobs and understandable same-color connections in a compact puzzle board.
```

## 2. 発光と顔の不統一を修正（全文）

```text
Edit this concept sheet, preserving its layout, all labels, red/green/blue/yellow family and overall pixel-art character designs. Make the following cleanup only:
1. Completely remove ALL bloom, colored haze, lighting gradients, smoky background, shadows, soft glow and blurred edges. Background must be a perfectly uniform solid dark ink-purple #171426 everywhere except the labels, thin separator lines and hard pixel sprites. Every sprite uses hard crisp square-pixel boundaries; no atmospheric effects around any sprite.
2. The CONNECT row must use the SAME face per color as that color's top IDLE example: every red has the same red eyes and smile, every green the same green eyes/smile, every blue the same blue sleepy eyes/straight mouth, every yellow the same yellow happy chevron eyes/mouth. Keep two red faces, two green faces, three blue faces, four yellow faces. Join each shared orthogonal body edge with a solid same-color bridge; no black gaps between connected neighbors, but no extra blob/cell and no extra face.
3. Simplify sprite shading to solid flat pixel regions, no gradients or smooth soft highlights. Keep sparse square cream highlights, no feathering. The motion row may have a squinting landing face, but other red frames keep their original identity.
Keep the exact three-band composition and the existing text. Do not add decorations, characters or text. This remains a concept preview, not a runtime atlas.
```

## 3. 緑の顔の区別（全文）

```text
Make ONE targeted edit to this original 8-bit character concept sheet. Keep the full composition, all text, background, red characters, blue characters, yellow characters, motion row, colors, scale, silhouettes and shading unchanged. Change ONLY the eyes on every GREEN character (top large green, top small green, and both green characters in the CONNECT vertical pair): replace the round red-like eyes with two clearly readable short dark horizontal dash eyes, gentle relaxed expression. Green should have two simple straight dark horizontal dash eyes and its existing small smile. Use identical green facial design in all four green instances including the small sample. No additional changes. This small distinction must make green identifiable from red even without their colors. Pixel-art, crisp square pixel clusters. No new text, no extra glows.
```

## 出力検査

- PNG、1536×1024、RGB（透明背景の本番素材ではない）。
- SHA-256: `4b97cb13ea07aa6feed65edf69cd10c9e89c51d32cc8c4a47b4977b00d3ff36a`。
- 画像は原出力を変更せずコピーした。ピクセル座標・色数・全フレームの整列を検査済みとはしない。
- 生成サービスのプロンプトとPNGを保存しているが、レイヤー付き原画や本番用フレーム元データの代わりにはならない。

