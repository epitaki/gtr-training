# 002: 連鎖消去時のスプライト同期バグ修正

## ステータス: 完了

## バグ概要

連鎖消去時に、4つ以上繋がっている色以外のぷよも視覚的に消えてしまう。

## 原因分析

### 根本原因

`updateFieldSprites()` が **「グリッドにぷよが存在し、かつスプライトも存在するが色が異なる」** ケースを処理していない。

### 発生メカニズム

`processChain()` 内で以下の処理が連続して実行される：

```
1. applyGravity()       → フィールドデータ上でぷよが落下移動
2. clearConnectedPuyos() → 4つ以上繋がったぷよをフィールドデータから削除
3. 1-2を繰り返し
```

しかし `updateFieldSprites()` は processChain 完了後に1回だけ呼ばれる。この時点でフィールドデータは最終状態だが、スプライト配列は processChain 開始前の状態のままである。

### 具体例

```
processChain前:
  (3,8): 青ぷよ  sprite=青
  (3,9): 緑ぷよ  sprite=緑
  (3,10): 緑ぷよ sprite=緑
  (3,11): 緑ぷよ sprite=緑
  (3,12): 緑ぷよ sprite=緑

processChain後（4緑消去 → 重力適用）:
  (3,8): null    sprite=青（旧）
  (3,9): null    sprite=緑（旧）
  (3,10): null   sprite=緑（旧）
  (3,11): null   sprite=緑（旧）
  (3,12): 青ぷよ  sprite=緑（旧）← 青が落下してきた
```

### updateFieldSprites の処理結果

現在のコードには2つの分岐しかない：

```typescript
if (color && !currentSprite) {
  // ケース1: データあり・スプライトなし → スプライト生成
} else if (!color && currentSprite) {
  // ケース2: データなし・スプライトあり → スプライト消滅アニメーション
}
// ケース3（未処理）: データあり・スプライトあり・色が異なる
```

上記の例での結果：

| 位置 | データ | スプライト | 処理 | 見た目 |
|------|--------|-----------|------|--------|
| (3,8) | null | 青sprite | ケース2 → 消滅アニメ | 青が消える（**本来は落下すべき**） |
| (3,9) | null | 緑sprite | ケース2 → 消滅アニメ | 緑が消える（正しい） |
| (3,10) | null | 緑sprite | ケース2 → 消滅アニメ | 緑が消える（正しい） |
| (3,11) | null | 緑sprite | ケース2 → 消滅アニメ | 緑が消える（正しい） |
| (3,12) | 青 | 緑sprite | **未処理** → 何もしない | 緑のまま表示（**青であるべき**） |

**ユーザーの体験**: 青ぷよが消えた（消えるべきではない）＋ 落下先に古い緑スプライトが残る

## 影響範囲

- `src/game/scenes/GuidedPracticeScene.ts` の `updateFieldSprites()`
- `src/game/PuyoGame.ts` の `updateFieldSprites()`
- 両ファイルに同一のバグが存在する

## 修正方針

### `updateFieldSprites()` に第3の分岐を追加

```typescript
if (color && !currentSprite) {
  // ケース1: 新規スプライト生成
} else if (!color && currentSprite) {
  // ケース2: スプライト消滅（アニメーション付き）
} else if (color && currentSprite && currentSprite.texture.key !== `puyo-${color}`) {
  // ケース3（新規）: 色が変わった → スプライト差し替え
  // 旧スプライトを即座に破棄し、新しい色のスプライトを生成
  currentSprite.destroy()
  const sprite = this.add.sprite(...)
  this.fieldSprites[y][x] = sprite
}
```

### ケース3の動作仕様

- 旧スプライトは消滅アニメーションなしで即座に `destroy()`
- 新しいスプライトを正しい色で生成
- パーティクルは発生させない（消去ではなく移動の結果であるため）
- 着地バウンスも不要（重力落下の結果であるため）

## 修正ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/game/scenes/GuidedPracticeScene.ts` | `updateFieldSprites()` にケース3追加 |
| `src/game/PuyoGame.ts` | `updateFieldSprites()` にケース3追加 |

## 検証方法

1. `npm run dev` で開発サーバー起動
2. 初心者用ガイド付きGTR練習またはスコアアタックを開始
3. 同色ぷよを4つ以上縦に積む（上に別色ぷよを置く）
4. 4つ繋がった色のみが消えることを確認
5. 上にあった別色ぷよが正しく落下して表示されることを確認
6. 連鎖が発生する場合、各段で正しいぷよのみが消えることを確認
7. 消えるべきでないぷよが消えないことを確認
