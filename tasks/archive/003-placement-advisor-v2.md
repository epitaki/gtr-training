# 003: PlacementAdvisor v2 — テンプレートマッチング方式への改修

## ステータス: 完了

## 問題点

現在の PlacementAdvisor は以下の根本的問題によりほぼ使えない状態：

1. **空フィールドで色推論が不可能**: `inferFoldColors()` が null/null を返し、全候補がほぼ同点
2. **積み順の無視**: GTRは h-1→h-2→h-3 の順で作るが、全ターゲットを同等に扱う
3. **色割り当てが受動的**: 最初のペアでA色/B色を決定できない（フィールドにぷよが無いため）
4. **折り返しボーナスが弱すぎる**: IN_FOLD_AREA_BONUS=5 では連鎖尾やconnectivityスコアに負ける
5. **ブロッキング無罰**: 目標位置に間違った色を置いてもペナルティなし

## 解決方針: テンプレートマッチング方式

折り返し構築フェーズで**抽象的なスコアリング**から**テンプレート直接比較**に変更する。

### GTRテンプレート（7セル）

```
Row h-3: [A][B]____
Row h-2: [A][A][B]___
Row h-1: [B][B]____
```

A, B は異なる色。4色から2色選ぶ → 12通りの色割り当て。

## 技術設計

### scoreFoldProgress() の全面書き換え

```typescript
private static scoreFoldProgress(
  gridAfter: (PuyoColor | null)[][],
  gridBefore: (PuyoColor | null)[][],
  landing: LandingResult,
  mainColor: PuyoColor,
  subColor: PuyoColor
): number
```

#### ステップ1: 最適な色割り当てを探索

フィールド上の既存ぷよと矛盾しない (A, B) の組み合わせをすべて試し、最もスコアの高いものを採用する。

```typescript
const allColors = [PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW]
let bestScore = -Infinity

for (const a of allColors) {
  for (const b of allColors) {
    if (a === b) continue
    const score = this.evaluateTemplate(gridAfter, a, b, landing, mainColor, subColor)
    if (score > bestScore) bestScore = score
  }
}
```

#### ステップ2: evaluateTemplate() — テンプレート一致度評価

```typescript
private static evaluateTemplate(
  grid, colorA, colorB, landing, mainColor, subColor
): number
```

7つのターゲット位置を**積み順の優先度付き**で評価:

| 優先度 | 位置 | 期待色 | 正解ボーナス | 構築順位 |
|--------|------|--------|-------------|---------|
| 1 | (0, h-1) | B | 20 | 最初に埋める |
| 1 | (1, h-1) | B | 20 | 最初に埋める |
| 2 | (0, h-2) | A | 18 | 次に埋める |
| 2 | (1, h-2) | A | 18 | 次に埋める |
| 2 | (2, h-2) | B | 18 | 次に埋める |
| 3 | (0, h-3) | A | 15 | 最後に埋める |
| 3 | (1, h-3) | B | 15 | 最後に埋める |

**評価ルール:**

各ターゲット位置について:
- **既にgridBefore時点で正しい色がある**: +0（既存、今回の配置とは無関係）
- **今回の配置で正しい色を置いた**: +ボーナス（上表）
- **今回の配置で間違った色を置いた**: -25（ブロッキングペナルティ）
- **空のまま**: +0

**前提条件チェック（積み順考慮）:**
- 優先度2の位置に置こうとする際、優先度1が埋まっていなければボーナスを半減
- 優先度3の位置に置こうとする際、優先度2が埋まっていなければボーナスを半減

**既存ぷよとの矛盾チェック:**
- gridBefore上で既にターゲット位置に色があり、(A,B)割り当てと矛盾する場合はその組み合わせのスコアを -Infinity にする

#### ステップ3: 折り返しエリア外ペナルティの強化

FOLD_BUILDINGフェーズ中:
- col0-2, row h-3〜h-1 のエリア外への配置: 1ぷよあたり -5（現在は0）
- col0-2 でrow h-4以上: -20（現在は-15）

### ADVISOR_WEIGHTS の調整

FOLD_BUILDING フェーズ:
```
foldProgress: 4.0  (3.0→4.0 強化)
chainTail:    0.0  (0.3→0.0 無効化)
connectivity: 0.5  (1.0→0.5 弱化)
heightPenalty: 1.5  (変更なし)
chainSim:     0.0  (変更なし)
```

CHAIN_TAIL, COMPLETION は現状維持。

### PlacementAdvisorConfig.ts の変更

```typescript
export const ADVISOR_SCORING = {
  FOLD: {
    // テンプレートマッチボーナス（優先度別）
    PRIORITY_1_MATCH: 20,      // 最下段（h-1）正解
    PRIORITY_2_MATCH: 18,      // 中段（h-2）正解
    PRIORITY_3_MATCH: 15,      // 上段（h-3）正解
    PREREQUISITE_PENALTY: 0.5, // 前提未充足時のボーナス倍率
    WRONG_COLOR_PENALTY: -25,  // 目標位置に間違った色
    OUTSIDE_FOLD_PENALTY: -5,  // 折り返しエリア外（1ぷよあたり）
    TOO_HIGH_ON_FOLD_SIDE: -20,// col0-2でh-4以上
  },
  // CHAIN_TAIL, CONNECTIVITY, HEIGHT, CHAIN_SIM は変更なし
}
```

## 修正ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/game/PlacementAdvisor.ts` | `scoreFoldProgress()` をテンプレートマッチング方式に全面書き換え |
| `src/game/PlacementAdvisorConfig.ts` | FOLD スコアリング定数を入れ替え、FOLD_BUILDING重みを調整 |

## 検証方法

1. `npm run dev` で開発サーバー起動
2. 初心者用ガイド付きGTR練習を開始

### テストケース

#### TC-1: 空フィールド、同色ペア (例: 赤赤)
- **期待**: col0またはcol1の最下段（h-1行目）にゴースト表示
- **理由**: 赤=B と推定 → (0,h-1)=B, (1,h-1)=B を埋めるべき

#### TC-2: 空フィールド、異色ペア (例: 赤緑)
- **期待**: 左下エリア（col0-1, h-1行目）にゴースト表示
- **理由**: 赤=B,緑=A または 赤=A,緑=B のうち高スコアの配置を推薦

#### TC-3: h-1行にBBが埋まっている状態、Aを含むペア
- **期待**: col0またはcol1のh-2行目にゴースト表示
- **理由**: 次の優先度2 → (0,h-2)=A, (1,h-2)=A を埋めるべき

#### TC-4: 折り返し7セル完成後
- **期待**: col3-5方向にゴースト表示（CHAIN_TAILフェーズ移行）

#### TC-5: 目標位置に間違った色を置く候補
- **期待**: その候補のスコアが低く、推薦されない
