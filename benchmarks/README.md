# Advisor benchmark

配置推薦ロジックを固定seed・固定初手分類で比較するためのベンチマークです。

## 品質評価の方針

GTR完成を第一目的とし、**人間らしい構築手順を主要な必須評価軸**として併せて確認します。
基準は[品質・人間らしい手順の評価基準](../docs/specs/GTR-QUALITY-CRITERIA.md)に集約しています。
500ゲームの70%基準は必要条件であり、達成しただけで手順の品質まで合格とはしません。

測定は「人間と同じ盤面での推薦比較」「ガイドに従い続けた500ゲーム」「原因を説明できる局面確認」を分けます。
一致率・ちぎり・本線参加率などは別々に報告し、未実装の自然さ指標を自動計測済みと扱いません。

## 人間の手順との比較

繰り返し使う原譜面・目録・動画確認メモの保存方針は[ぷよ譜ライブラリ](human/README.md)を参照してください。
人間の手は観測資料であり、正解手の一覧ではありません。

ランダム生成とは別に、`human/gtr-openings-500-v1.json` に公開対戦の配置付き記録500本を保存しています。
5選手、重複キー除去、当初の分析399本・検証101本です（現在は結果閲覧済みの固定回帰集合）。先折りは95本で、後折り・未分類も含みます。
映像500試合を全手確認したデータではありません。年代や出典、除外条件は
[調査記録](../docs/research/GTR-HUMAN-PLAY-STUDY.md)を参照してください。

```powershell
bun scripts/human/compare-human-openings.ts all benchmarks/results/human-500-current.json benchmarks/human/gtr-openings-500-v1.json
```

同じ人間盤面に対してCURRENT/NEXT/NEXT2だけで推薦を出します。一致率は診断指標であり、勝率や連鎖成功率ではありません。

先折り／後折り／未分類、選手、教材計画との整合を分け、設置後・消去前の同一盤面で比較します。
既存101本は前回調整時には未使用でしたが、結果は閲覧済みです。次の改良では固定回帰として扱い、
その結果に合わせて係数を調整した場合は、別の未使用集合なしに汎化を主張しません。

## コマンド

```powershell
# 通常ツモと悪条件ツモを計測して benchmarks/results/advisor-current.json へ保存
bun run benchmark:advisor

# CI向け小規模スモーク計測（ファイルは保存しない）
bun run benchmark:advisor:ci

# 保存済み基準と同じ条件で現在ロジックを実行し、差分を表示
bun run benchmark:advisor:compare

# 保存したゲームを同じツモ・配置で再生
bun run benchmark:advisor:replay -- --report benchmarks/baseline/advisor-v3.json --mode random --game 0

# game indexの代わりに保存済みgame seedでも選択可能
bun run benchmark:advisor:replay -- --report benchmarks/baseline/advisor-v3.json --mode random --game-seed 2309076387

# 既に保存した任意の2レポートを比較し、差分JSONも保存
bun scripts/benchmark/benchmark-advisor.ts compare --baseline old.json --current new.json --output diff.json
```

直接実行する場合はseed、試行数、手数、モード、初手分類を変更できます。

```powershell
bun scripts/benchmark/benchmark-advisor.ts run --seed 20260904 --games 60 --turns 20 --modes random,adversarial
```

## モード

- `random`: 4色から独立かつ一様に供給する。
- `adversarial`: 現在不足している教材色を避けられる間は避けて供給する。

両モードで同じgame indexには同じ初手分類とgame seedを割り当てる。既定では
`AAAB`、`AABB`、`ABAB`、`ABAC`、`AABC`、`AAAA`を均等に評価するため、
モード差をツモ供給方法の差として比較できる。任意指定では4色すべてが異なる`ABCD`も
受け付ける。未知、重複、値不足のCLIオプションは計測条件の取り違えを防ぐため拒否する。
実ゲームと条件を揃えるため、初手2組に続く最初のNEXTNEXTまでは両モード共通の
ランダムツモとし、その後に追加するツモからモード別供給を適用する。

## 指標の定義

7連鎖は練習の達成目標・評価比較に含めない。CLIの集計表示・差分評価からも除外する。
version 3の保存形式との互換性のためJSON内の `chain7Rate` は実績統計として維持するが、
増減を改善・悪化や合否へ使わない。各手・各ゲームの実際の連鎖数も書き換えない。
下3段の土台と4段目の伸ばし余地を重視し、上へ積んで7連鎖に届くこと自体には評価目標を設けない。

- `guidedTargetCompletionRate`: GTR本線を含むY字・座布団・L字の適応型連鎖尾が完成したゲームの割合。version 3から実ゲームの`isAdaptiveTailComplete`と統一した。version 2の同名指標は固定支持色のY字限定であり、数値を直接比較しない。
- `chain5Rate`: 推薦1位による本線の実発火で5連鎖以上になったゲームの割合。発火前の仮想連鎖数や独立した副次消去は含めない。
- `actualFireAvailableRate`: 実際の手元ペアに、本線発火と判定される合法配置が一度でも存在したゲームの割合。
- `actualFireRate`: 推薦1位が本線を実発火したゲームの割合。
- `unintendedClearRate`: 本線以外の消去、または本線と同時・後続の独立した副次消去が起きたゲームの割合。
- `averageParticipationRate`: 本線発火直前の盤面ぷよ数に対する、基準本線で消えるぷよ数の割合。独立した副次消去は分子へ含めず、実発火ゲームだけを平均する。
- `averageLeftoverPuyos`: 本線発火後に全盤面へ残ったぷよ数。実発火ゲームだけを平均する。
- `gtrAvoidanceRate`: 固定コア計画が成立不能な局面で、コア外へ置くか計画を復旧した判断の割合。

平均値の対象が0件の場合は0とする。レポートには集計値だけでなく、各ゲームの
ツモ、推薦配置、盤面推移、失敗理由を保存する。`replay`は保存値を現在実装で再計算し、
推薦手、スコア、消去結果、各ターン盤面の差異を報告する。

レポート形式はversionごとに互換性を管理する。CLIは現在のversion 3だけを受け付け、
旧versionや削除済みモードを含むJSONは、比較・再生する前に明示的なエラーで拒否する。
読み込み時は設定・件数・集計の自己整合に加え、固定seedの初手、ツモの連続性、
保存配置による物理的な盤面遷移を検証する。コア判定、教材目標、発火分類、推薦スコア、
悪条件ツモなどAdvisor由来の値は保存時点の計測結果として扱い、現行ロジックでは
再判定しない。これによりロジック変更前のbaselineを比較に使える。保存結果と現行
ロジックの相違を確認するときは、明示的に`replay`を実行する。

## 70%以上の達成基準（2026-09-06）

通常ランダム4色ツモ500局、最大20手、seed `20260904`、既定の初手6分類を均等に割り当てる。
`guidedTargetCompletionRate`と`chain5Rate`がそれぞれ0.70以上（各350局以上）を合格条件とする。
両方の指標の分母は全500局。悪条件モードは別の耐性試験として扱う。ツモの色制限、
先読み範囲を超えた将来のツモ参照、成功局だけの集計は行わない。

これは完成結果の最低基準です。人間らしさの改善、既存手順の回帰、成功率の低下量も別途確認します。
「70%以上なら、それまでの完成率をどこまで落としてもよい」という採用条件ではありません。

```powershell
bun scripts/benchmark/benchmark-advisor.ts run --seed 20260904 --games 500 --turns 20 --modes random --output benchmarks/results/goal70-current.json
```

出現位置 `(2,0)` と `(2,1)` のどちらかが埋まった時点で次手へ進めない。
実ゲーム・計測・再生・レポート検証で同じ判定を使用する。
`advisor-v3.json`は計測定義修正後の小規模基準値であり、500局の目標達成結果ではない。

## 自然な手順の改善報告に含めるもの

- 変更前に決めた対象軸（H1〜H6）、対象局面、比較条件、許容する別解。
- 同一条件の完成率・実発火率と、失敗も含むゲーム数。
- 人間手順の第1候補／上位3候補一致、ちぎり回数・段差。必要なちぎりは失敗扱いしない。
- 本線参加率、発火後の残り個数、完成／発火手数と、その平均の対象局数。
- 対象軸ごとの改善／同等／悪化／未評価、改善例と悪化例、推薦の理由。
- 未実装の指標、データの偏り、後半手順を評価できていない等の限界。

初手全列挙や報告局面の回帰が、全ゲームでの自然さを保証するわけではありません。
発火点伸ばしの公開図の単ぷよ検証も、組ぷよでの構築成功率とは別です。

## 1,000ゲームの固定コード分割測定

2026-09-20完了の[余剰回収の比較](../docs/records/ADVISOR-NATURAL-1000-20260919.md)では、
変更前後各1,000ゲームを測定しています。成功条件・4色・最大20手・先読み3組は従来と同じです。
前半500を試行用にし、コードを固定してから後半500を実行しました。

`scripts/benchmark/measure-advisor-range.ts` は固定コードのハッシュとゲーム範囲を保存し、
結合時にコード・設定の混在、重複、欠落、保存した物理遷移と集計の不整合を拒否します。
同じgameIndexから同じseed・初手を生成するため、同一コードの500ゲームを1,000ゲームへ拡大できます。
このスクリプトはrandom・20手・従来6初手分類を使い、既定のseedは20260904です。
`run` の末尾に任意のseedを指定して、別のツモ集合を生成することもできます。
同じseed・その他の条件・コードで実行した区間だけを統合できます。

```powershell
# 未使用の名前へコードを固定する（既存の測定コードを上書きしない）
bun build src/benchmark/AdvisorBenchmark.ts --target=bun --outfile=benchmarks/results/experiment-code.js

# 半開区間 [0, 500)、[500, 1000) を同じコードで測定する
bun scripts/benchmark/measure-advisor-range.ts run benchmarks/results/experiment-code.js benchmarks/results/experiment-first.json 0 500 1000
bun scripts/benchmark/measure-advisor-range.ts run benchmarks/results/experiment-code.js benchmarks/results/experiment-second.json 500 1000 1000
bun scripts/benchmark/measure-advisor-range.ts merge benchmarks/results/experiment-code.js benchmarks/results/experiment-full.json benchmarks/results/experiment-first.json benchmarks/results/experiment-second.json

# 完成率に加え、同じ発火ゲームでの余り・2/3列の残り・ちぎりを比較する
bun scripts/analysis/analyze-advisor-quality.ts benchmarks/results/natural-1000-20260919-before.json benchmarks/results/natural-1000-20260919-after.json benchmarks/results/natural-1000-20260919-quality.json
```

`analyze-advisor-quality.ts` は全体、前半500、後半500を別に集計します。
残り個数の改善・悪化ゲーム数、5連鎖以上の獲得・喪失、連鎖数の変化も記録します。
2・3列の残りは実発火直後の値であり、構築途中のすべてのぷよを捨てぷよ扱いする指標ではありません。
ちぎりも配置時の段差の計数であり、不要な操作や実時間の自動判定ではありません。

2026-09-22から同スクリプトは、消去のない構築手の表面形状も集計します。
内側の列が左右より3段以上低ければ深い谷、さらに両隣が5段以上なら高い壁の谷と数えます。
発生手数・構築手あたりの率・該当ゲーム数と、全隣接列の高さ差の合計平均を併記します。
形だけの指標であり、必要な段差や色待ちまで無駄と断定するものではありません。
[平坦さの500ゲーム比較](../docs/records/ADVISOR-SURFACE-20260922.md)に改善・悪化の両方を記録しています。

別seed20260922の[追加500ゲーム調査](../docs/records/ADVISOR-LEARNING-500-20260922.md)では、
前半250を開発に使い、判断ロジックを固定後に後半250で検証した。
色の受け口を広げる試験版は、ちぎり・一部の残りぷよを減らしたものの完成率を下げたため不採用。
標準ロジックは `surface-20260922-v2` のまま。試験結果を採用版の成績と混同しない。
