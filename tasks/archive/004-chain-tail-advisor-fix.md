# 004: 連鎖尾アドバイザー改善

## ステータス: 完了

## 問題点

CHAIN_TAILフェーズの推薦が機能しない：

1. **chainTailスコアが支配的**: 重み3.0 × 高生スコア(50+) = 150+pt が chainSim(1.5 × 26 = 39pt)を圧倒
2. **高さバランスボーナスが逆効果**: 平らに積むほど高評価だが、連鎖には階段状（高さ差）が必要
3. **隣接同色ボーナスが危険**: 4つ以上繋がると即消え（暴発）、連鎖構造が破壊される
4. **connectivityが4+グループを報酬**: GROUP_SIZE_4_PLUS=+15 → 暴発するのに報酬を与えている
5. **chainSim(実際の連鎖数)の影響力が弱すぎる**: 最も重要な指標なのに重み1.5

## 解決方針

### 1. CHAIN_TAIL重みの再調整

```
chainTail:    3.0 → 1.0  (エリアガイドのみ、支配的でなくする)
chainSim:     1.5 → 5.0  (実際の連鎖品質を最重要に)
connectivity: 1.5 → 1.0  (2-3グループ評価は残す)
foldProgress: 0.5 (変更なし)
heightPenalty: 1.0 (変更なし)
```

### 2. chainTailスコアラーの簡素化

**削除するもの:**
- 高さバランスボーナス (BALANCE_PERFECT, BALANCE_GOOD) — 平積みは連鎖に不利
- 隣接同色ボーナス (ADJACENT_SAME_COLOR) — 暴発リスク

**残すもの:**
- CORRECT_COLUMN_BONUS: col3-5への配置ガイド
- TOO_HIGH_PENALTY: 高すぎる位置へのペナルティ

### 3. connectivityスコアラーの修正

```
GROUP_SIZE_2:      10 → 10 (変更なし、連鎖の種)
GROUP_SIZE_3:      25 → 25 (変更なし、連鎖一歩手前)
GROUP_SIZE_4_PLUS: 15 → -20 (ペナルティに変更！暴発は悪)
```

### 4. chainSimスコアの強化

```
PER_CHAIN_BONUS: 8 → 15 (連鎖1つの価値を上げる)
```

## 修正ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/game/PlacementAdvisorConfig.ts` | CHAIN_TAIL重み調整、CHAIN_TAIL定数削減、CONNECTIVITY定数修正、CHAIN_SIM定数調整 |
| `src/game/PlacementAdvisor.ts` | `scoreChainTail()` から高さバランスと隣接同色ボーナスを削除 |

## 検証方法

1. `npm run dev` で開発サーバー起動
2. 初心者用ガイド付きGTR練習を開始
3. 折り返し完成後、連鎖尾フェーズに移行

### テストケース

#### TC-1: 折り返し完成直後
- **期待**: col3-5方向にゴースト表示（右側へ誘導）
- **理由**: CORRECT_COLUMN_BONUSがcol3-5への配置をガイド

#### TC-2: col3-5に数個積んだ状態
- **期待**: 連鎖数が増える位置にゴースト表示
- **理由**: chainSim(重み5.0)が支配的で、連鎖数が増える配置を優先

#### TC-3: 3つ同色が隣接している位置に同色ペア
- **期待**: 4つ目を置く配置は推薦されない（暴発ペナルティ）
- **理由**: GROUP_SIZE_4_PLUS=-20 + WRONG方向のペナルティ
