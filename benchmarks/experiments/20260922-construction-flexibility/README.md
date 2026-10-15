# 不採用：構築途中の色の受け口加点

2026-09-22、追加500ゲームを開発250・検証250へ分けて試したv3。
追加500で尾469→468、5連鎖417→415、従来500でも尾476→471となったため標準ロジックへ採用していない。
残りぷよや一部手順の改善だけで、完成率の低下を容認しない。

ゲーム本体は `surface-20260922-v2` と同一へ戻した。
このフォルダは検証の再利用用で、アプリから読み込まない。`.ts.txt` は当時の実装・12テストの保存である。
結果・失敗例・制約は [実験記録](../../../docs/records/ADVISOR-LEARNING-500-20260922.md) を参照。

## 当時の呼び出し箇所

`FiveChainPlanner.ts` でhelperをimportし、`fit()` の骨格評価で
`matched * 100 - spare * 8 - 不足色コスト - 高さコスト` の直後に加えた。

```ts
const tailFilled = plan.tailHeights.every((height, x) => columns[x].length >= height)
score += constructionFlexibility(columns, plan.columns, tailFilled)
```

続く尾完成判定の同じ高さ条件も `if (tailFilled)` に共通化した。
ソース指紋へhelperを追加していた。標準コードへ戻す際は、これらの追加だけを取り除いた。
既存テストは変更していない。試験版では39ファイル507テストが成功した。

## 固定コードで再測定

```powershell
bun scripts/benchmark/measure-advisor-range.ts run benchmarks/results/learning-500-20260922-v3.js benchmarks/results/new-trial-output.json 0 500 500 20260922
```

凍結エンジンSHA-256：`912e5cd3846c8ec102690c68957cd3390c8793de0d22909c3dc6a8b6f7d34792`。
過去の測定ファイルを上書きしない。後半250件は結果を閲覧済みなので、次の案で未使用検証とは呼ばない。
