# ガイド完成度の追加改善（2026-09-18）

前回の70%目標達成後に、発火の取りこぼしと計算負荷を改善した記録。
前回の独立レビュー記録は [ADVISOR-GOAL70-REVIEW.md](ADVISOR-GOAL70-REVIEW.md) に保存し、今回の変更へのレビュー結果とは区別する。

## 変更内容

- 骨格に一致しない自由形では、既に本線5連鎖を発火できても、汎用スコアが追加の構築を優先する局面があった。
- 連鎖尾完成、本線5連鎖以上、現在の組ぷよによる本線の実発火、発火後に出現セルが空くことを条件に、骨格探索と同じ終端優先度を適用した。
- 発火の検証は既存の物理シミュレーターと段ごとの元ぷよ照合を使用。独立した副次消去がない発火を優先する。未到着の発火色を到着済みとして扱わない。
- 列データへの変換と不足色の集計で、一時配列・Mapの生成を削減した。骨格3種類、探索幅32、CURRENT/NEXT/NEXT2の範囲は維持した。

## 測定条件と結果

通常ランダム4色、最大20手、既定の初手6分類をできるだけ均等に割り当てる。
500局では分類ごとに83または84局、別seedの120局では各20局。
連鎖尾はY字・L字・座布団の適応型完成判定、5連鎖以上は推薦による本線の実発火で数える。
各率の分母は成功局に限らず全局。ツモ生成・成功条件・集計実装は変更していない。

| seed / 局数 | 連鎖尾完成（前 → 後） | 本線5連鎖以上（前 → 後） | 意図しない消去（前 → 後） |
|---|---|---|---|
| 20260904 / 500局 | 475 → 475局（95.0%） | 386 → 390局（77.2% → 78.0%） | 1 → 1局（0.2%） |
| 20260918 / 120局 | 118 → 118局（98.3%） | 98 → 98局（81.7%） | 0 → 0局 |

両seedでゲームオーバーは0局。500局の本線実発火全体（5連鎖未満も含む）は390局から394局へ増えた。
発火しなかった4局（game index 99・158・256・377）が、それぞれ14・19・15・18手目に5連鎖を発火した。
既に成功していた2局も、192は18手目から17手目、291は17手目から12手目へ発火が早まった。
連鎖尾完成・5連鎖以上のどちらについても、前回成功から今回失敗へ変わった局は0局。

500局ではなお25局が連鎖尾未完成、110局が5連鎖実発火未達であり、完全解決ではない。
これらは同じ局を含む別々の指標で、足し合わせない。2つの固定seedによる検証であり、
任意のツモ系列に対する成功率保証や悪条件モードの改善を意味しない。

### 結果ファイル

- 前回500局: [goal70-current.json](../../benchmarks/results/goal70-current.json)（上書きせず保存）
- 今回500局: [quality-20260918-primary.json](../../benchmarks/results/quality-20260918-primary.json)
- 別seed改善前: [quality-20260918-before.json](../../benchmarks/results/quality-20260918-before.json)
- 別seed改善後: [quality-20260918-after.json](../../benchmarks/results/quality-20260918-after.json)

```powershell
bun scripts/benchmark/benchmark-advisor.ts run --seed 20260904 --games 500 --turns 20 --modes random --output benchmarks/results/quality-20260918-primary.json
bun scripts/benchmark/benchmark-advisor.ts run --seed 20260918 --games 120 --turns 20 --modes random --output benchmarks/results/quality-20260918-after.json
bun scripts/benchmark/benchmark-advisor.ts compare --baseline benchmarks/results/goal70-current.json --current benchmarks/results/quality-20260918-primary.json
bun scripts/benchmark/benchmark-advisor.ts compare --baseline benchmarks/results/quality-20260918-before.json --current benchmarks/results/quality-20260918-after.json
```

## 検証

- 前回500局のgame index 99・158・256・377を回帰テスト化。修正前は4ケースとも発火の期待に失敗し、修正後は通過した。
- 発火色がCURRENTにないケース、3通りの色の入れ替え、既存のY・L・座布団と副次消去の優先度を検証。
- 歴史的baselineの配置と物理結果は維持。新推薦と旧推薦が異なるときだけ新推薦の発火注釈の差を許容し、保存配置自体の発火注釈は別途一致を確認する。
- 全164テスト（19ファイル）、アプリ型検査、ベンチマーク型検査、ビルドが成功。既存の約1.55MBの出力サイズ警告は残る。
- 測定と同時実行した再生テストが5秒上限を超えたため、2局まとめていた検証を局別に分割した。検証項目や時間上限は緩めていない。

保存した620局・10,582手は、レポート検証器で設定・ツモ・配置・消去後盤面・集計を検証した。
さらに推薦順位の再計算とは別に、全実発火492件で標準発火点への着地、基準本線の連鎖数、
各段で消える元ぷよ、発火後の出現セルを照合し、全局の連鎖尾初完成手を再判定した。
改善前後のseed・初手・重なる手数のツモも一致した。
新しい500局の改善4例と未達成1例、別seedの成功1例と未達成1例は、
現在の推薦・スコアまで含む再生で一致した。

## 速度の参考測定

前回500局の先頭12局から1・6・11手目の計36局面を使用。同一プロセスで4周し、
初回を除く3周（108回の推薦計算）の合計は1999.27msから1862.01msへ約6.9%短縮した。
比較対象は発火優先の修正後、配列・集計最適化の前後。Bun上の単一環境の参考値であり、
ブラウザの描画速度やすべての局面での短縮を保証するものではない。
全4周・前後の推薦全体のSHA256は同じで、この36局面の順位・スコア・注釈は変わらなかった。

`99c4db732a328bbacb47927f95cf55bb65226f28340bf021a12b4496ba76df49`

## 採用しなかった試案

- 5連鎖骨格を5種類追加する案: 別seed120局で5連鎖98局のまま、連鎖尾が118局から116局へ減少したため撤回した。[試行結果](../../benchmarks/results/quality-20260918-expanded-trial.json) は記録として残す。
- 探索深度ごとの盤面評価キャッシュ: 上記36局面の実測で遅くなったため撤回した。

## 変更対象の識別

- PlacementAdvisor SHA256: `B3AF85AEFE3673817CA9B47EABF42D41ED5483B8A1CE3DFDC2CA4194CC40D545`
- FiveChainPlanner SHA256: `3D9FEE4EA0CF7680DEAC8EAB0118764A8F54D579126414680C0455577497D6D2`
- 前回500局JSON SHA256: `326FDAA4CCA0708D47241D332F435D483FFDA420456DF1FFAD36913D0BC9B8E1`
- TailPlanner・AdvisorBenchmark・GuidedPracticeSceneは今回開始時と同一のハッシュであることを確認した。
