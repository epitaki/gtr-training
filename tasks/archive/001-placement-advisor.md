# 001: GTR最適配置推薦システム（PlacementAdvisor）

## ステータス: 完了

## 概要

現在のフィールド状態と手持ちぷよペアを分析し、GTR構築に最適な配置位置をゴースト表示で提案する機能を実装する。

## 背景

現在のガイドシステム（GuideManager.ts）は静的なパターン例を表示するのみ。フィールド上の実際のぷよ配置を考慮した動的な推薦は行っていない。初心者にとって「次にどこに置くべきか」が最も重要な情報である。

## GTR折り返しの必須形状（参照: GTRPatterns.ts:210-263）

```
Row 10 (h-3): [A][B]____    ← col0=A, col1=B
Row 11 (h-2): [A][A][B]___  ← col0=A, col1=A, col2=B
Row 12 (h-1): [B][B]____    ← col0=B, col1=B
```

A・Bは異なる色。cols 0-2, rows 10-12 がGTR折り返しエリア。

## 機能要件

### FR-1: 配置候補の列挙と評価

- 全候補（column × rotation = 最大22通り）を列挙する
- 各候補について重力落下後の着地位置をシミュレーションする
- フェーズに応じたスコアリングで最良候補を特定する

### FR-2: ゲームフェーズの自動検出

3つのフェーズを自動判定する：

| フェーズ | 条件 | 目的 |
|---------|------|------|
| `FOLD_BUILDING` | `hasBasicPattern == false` | 折り返し構築 |
| `CHAIN_TAIL` | 折り返し完成、連鎖尾ぷよ < 6 | 連鎖尾構築 |
| `COMPLETION` | 連鎖尾ぷよ >= 6 | GTR完成 |

### FR-3: フェーズ別スコアリング

5つのスコア要素をフェーズ別重みで合算する：

| 要素 | 説明 | FOLD重み | TAIL重み | COMPLETION重み |
|------|------|---------|---------|---------------|
| `foldProgress` | 折り返し目標位置への正しい色配置 | **3.0** | 0.5 | 0.2 |
| `chainTail` | col3-5配置、高さバランス、隣接同色 | 0.3 | **3.0** | 1.0 |
| `connectivity` | 置いたぷよの同色連結サイズ | 1.0 | 1.5 | 2.0 |
| `heightPenalty` | 高すぎる配置へのペナルティ | 1.5 | 1.0 | 1.0 |
| `chainSim` | GTRDetector連鎖数評価 | 0.0 | 1.5 | **3.0** |

### FR-4: ゴースト表示

- 最良候補の着地位置に半透明ぷよ（`puyo-ghost-${color}`）を表示
- alpha: 0.4、depth: 5（操作中ぷよdepth:10の下）
- パルスアニメーション（alpha 0.3↔0.5を繰り返し）

### FR-5: ON/OFF切替

- Gキーでアドバイザーのゴースト表示を切り替え可能
- 画面上にON/OFF状態を表示

### FR-6: ライフサイクル連携

以下のタイミングでアドバイスを更新する：
1. `startGame()` - ゲーム開始時
2. `spawnNextPair()` - 新ペア生成後
3. `rewind()` - 巻き戻し後
4. `resetGame()` - リセット時（クリア）
5. `landCurrentPair()` - 着地時（ゴーストクリア）

## 技術設計

### 新規ファイル

#### `src/game/PlacementAdvisorConfig.ts`（~50行）

スコアリング定数の分離ファイル（GTRScoringConfig.tsと同パターン）。

```typescript
export const ADVISOR_WEIGHTS = {
  fold_building: { foldProgress: 3.0, chainTail: 0.3, connectivity: 1.0, heightPenalty: 1.5, chainSim: 0.0 },
  chain_tail:    { foldProgress: 0.5, chainTail: 3.0, connectivity: 1.5, heightPenalty: 1.0, chainSim: 1.5 },
  completion:    { foldProgress: 0.2, chainTail: 1.0, connectivity: 2.0, heightPenalty: 1.0, chainSim: 3.0 },
}

export const ADVISOR_SCORING = {
  FOLD: {
    CORRECT_COLOR_IN_POSITION: 15,    // 折り返し目標位置に正しい色
    UNDETERMINED_COLOR_IN_POSITION: 10, // 色未確定の目標位置に配置
    WRONG_COLOR_IN_POSITION: -10,     // 間違った色
    IN_FOLD_AREA_BONUS: 5,           // 折り返しエリア内に配置
    TOO_HIGH_ON_FOLD_SIDE: -15,      // 折り返し側で高すぎる
  },
  CHAIN_TAIL: {
    CORRECT_COLUMN_BONUS: 10,  // col3-5に配置
    BALANCE_PERFECT: 15,       // 高さ差≤1
    BALANCE_GOOD: 8,           // 高さ差≤2
    ADJACENT_SAME_COLOR: 8,    // 隣接同色
    TOO_HIGH_PENALTY: -10,     // row9より上
  },
  CONNECTIVITY: {
    GROUP_SIZE_2: 10,
    GROUP_SIZE_3: 25,
    GROUP_SIZE_4_PLUS: 15,     // 4連結は消えるのでフェーズ次第
  },
  HEIGHT: {
    CRITICAL_ZONE: -30,        // row≤2
    WARNING_ZONE: -15,         // row 3-4
    IMBALANCE_PENALTY: -20,    // 列高差>4
  },
}
```

#### `src/game/PlacementAdvisor.ts`（~300行）

**公開API:**
```typescript
export class PlacementAdvisor {
  static getAdvice(field: GameField, currentPair: PuyoPair): PlacementAdvice
}
```

**インターフェース:**
```typescript
export interface PlacementAdvice {
  bestPlacement: PlacementScore | null
  allPlacements: PlacementScore[]
  phase: GamePhase
  phaseMessage: string
}

export interface PlacementScore {
  placement: { column: number; rotation: number }
  landing: { mainPos: {x,y}; subPos: {x,y}; valid: boolean }
  totalScore: number
  phase: GamePhase
}

export enum GamePhase {
  FOLD_BUILDING = 'fold_building',
  CHAIN_TAIL = 'chain_tail',
  COMPLETION = 'completion',
}
```

**内部処理フロー:**
1. `detectPhase(grid)` - GTRDetector.detectGTR()を使いフェーズ判定
2. `inferFoldColors(grid)` - フィールド上の既存ぷよからA色・B色を推定
3. 全候補(col × rotation)をループ:
   a. `simulateLanding(grid, col, rotation)` - 着地位置計算
   b. `applyPlacement(grid, landing, colors)` - グリッドクローンに配置
   c. 5つのスコアラーを実行
   d. フェーズ別重みで合算
4. スコア降順ソートし `PlacementAdvice` を返す

**着地シミュレーション:**
- 縦向き(rotation 0,2): 同一列の最下空きを探し、2つ積む
- 横向き(rotation 1,3): 各列独立に最下空きを検索

**折り返し色推論:**
```
A色の候補位置: (0,h-2), (1,h-2), (0,h-3)
B色の候補位置: (0,h-1), (1,h-1), (2,h-2), (1,h-3)
```
最初に見つかった非null色をA/Bとして採用。

### 変更ファイル

#### `src/game/scenes/GuidedPracticeScene.ts`

**追加プロパティ:**
```typescript
private ghostSprites: { main?: Phaser.GameObjects.Sprite; sub?: Phaser.GameObjects.Sprite } = {}
private currentAdvice: PlacementAdvice | null = null
private isAdvisorEnabled: boolean = true
private gKey?: Phaser.Input.Keyboard.Key
private advisorStatusText?: Phaser.GameObjects.Text
```

**追加メソッド:**
- `updateAdvice()` - アドバイス計算 + ゴースト更新
- `updateGhostDisplay()` - ゴーストスプライト描画（パルスtween付き）
- `clearGhostSprites()` - ゴーストスプライト破棄

**フック箇所:**
- `create()` - Gキー登録、アドバイザー状態テキスト追加
- `update()` - Gキー切替処理追加
- `startGame()` 末尾に `updateAdvice()`
- `spawnNextPair()` 末尾に `updateAdvice()`
- `landCurrentPair()` 先頭に `clearGhostSprites()`
- `rewind()` 末尾に `updateAdvice()`
- `resetGame()` に `clearGhostSprites()` と `currentAdvice = null`

## パフォーマンス

- 最大22候補 × グリッドクローン（6×13=78セル）= 低コスト
- `GTRDetector.detectGTR()` は `chainSim` 計算時のみ使用（FOLD_BUILDINGフェーズでは呼ばない）
- 新ペア生成時のみ実行（毎フレームではない）

## 検証方法

1. `npm run dev` で開発サーバー起動
2. 初心者用ガイド付きGTR練習を開始
3. **空フィールド**: 折り返しエリア（左下）にゴーストが表示されること
4. **折り返し構築中**: 折り返しパターンに沿った位置にゴーストが誘導すること
5. **折り返し完成後**: col3-5方向にゴーストが移動すること
6. **Gキー**: ゴースト表示のON/OFFが切り替わること
7. **巻き戻し**: ゴーストが再計算されること
8. **ペア変更時**: 新しいペアの色に応じてゴーストが更新されること

## 依存関係

- `GameField`, `PuyoPair`, `PuyoColor` (types.ts)
- `GTRDetector.detectGTR()` (GTRPatterns.ts) - フェーズ検出と連鎖シミュレーション
- `PuyoRenderer.createGhostTextures()` (PuyoRenderer.ts) - ゴーストテクスチャ（実装済み）
- `FIELD_CONFIG`, `TEXT_STYLES` (VisualConfig.ts) - レイアウト定数
