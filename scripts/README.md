# 開発用スクリプト

プロジェクト直下から実行する。ゲーム本体は `src/`、測定データは `benchmarks/` に置く。
TypeScriptスクリプトの型確認は `bun run type-check:scripts`。画像素材用Pythonは下記の専用検査を使う。

## 分類

| ディレクトリ | 用途 |
|---|---|
| benchmark | 固定seedの測定、範囲測定、失敗再生、初手検査、整理前後の挙動比較 |
| analysis | 保存済みの結果の失敗分類・品質集計・候補置換の実験 |
| human | 人間手順との同盤面比較・集計 |
| shared | 測定時のソース指紋などの共通処理 |
| assets | オリジナルぷよ素材の再生成と検査（Python・Pillow。ゲームからは読み込まない） |

分析・比較用コードをゲーム本体から読み込まない。
ソースファイルを追加・分割した際は `shared/source-fingerprint.ts` の対象も確認する。

### 画像素材

```sh
python -B scripts/assets/build_puyo.py build
python -B -m unittest discover -s scripts/assets -p 'test_*.py' -v
```

Python 3とPillowが必要。`build` は保存済みの編集画素データから素材と確認用画像を再生成する。
`all` は編集画素データも原画から作り直すため、手修正を残したい場合は使わない。
仕様・編集方法は [素材README](../src/assets/puyo/README.md)、原画・契約は [制作記録](../docs/design/PUYO-PIXEL-PRODUCTION.md)。

## よく使う入口

現行画面は完成後に発火せず構築を続ける `ContinuousAdvisor`。
従来の `benchmark:advisor` と以下の発火比較スクリプトは `PlacementAdvisor` 用であり、
現在の画面ガイドを走らせた結果とは区別する。

```sh
bun scripts/benchmark/measure-continuous-guide.ts <new-output.json> [games=500] [startIndex=0]
bun scripts/benchmark/merge-continuous-guide.ts <new-output.json> <shard.json> ...
```

seed 20260904・従来と共通の4色供給/初手順・最大20手で実際のガイド入口を走らせる。
土台5連鎖・100点は実際の確定盤面のみ、全ゲーム分母で1局1回集計。
完成後の継続手数と土台喪失、消去、推薦なし、閉塞を保存する。
`conditionalExtension` は仮置き1〜2個での接続見込みであり、実連鎖の達成率に含めない。
2026-09-26以降の尾完成は `guided-pending-head-v1`。実在する尾が横3・L字のキー待ちの後ろへ
接続する場合も物理検証して認める。旧固定発火口判定の結果は上書きせず、前後を同じ判定で再集計する。
判定定義が異なる分割結果は結合しない。キー待ちを発火済み・土台5達成へ加算しない。
発火後の平均余りは未測定のnull。既存結果への上書きを拒否し、採点器・供給・測定器の指紋を保存する。
旧方式とは停止条件が異なるため、旧実発火率・旧余り平均との同条件比較とは呼ばない。
分割実行はゲーム番号ごとの同じ供給を使い、各ゲームを空盤面から実行する。
結合では指紋・測定条件・連続するゲーム番号・seed・初手分類を確認し、欠落や重複を拒否する。
並列測定中の待ち時間は無負荷のUI速度として使わない。

```sh
bun run benchmark:advisor:ci
bun run benchmark:advisor
bun run benchmark:advisor:replay -- --report <report.json> --mode random --game 0
bun scripts/human/compare-human-openings.ts holdout <output.json> <dataset.json>
bun scripts/analysis/analyze-advisor-failures.ts <random-report.json> <output.json>
bun scripts/analysis/analyze-construction-stalls.ts <random-report-or-prefix-shard.json> <output.json>
bun scripts/analysis/analyze-completion-waits.ts <report.json> <output.json>
bun scripts/analysis/analyze-spare-puyos.ts <report.json> <output.json>
bun scripts/analysis/compare-foundation-quality.ts <before.json> <after.json> <new-output.json>
bun scripts/analysis/audit-foundation-fire-opportunities.ts <report.json> <new-output.json>
bun scripts/analysis/trace-foundation-feedback.ts <feedback.txt> <before.js> <after.js> <new-output.json>
bun scripts/analysis/verify-spare-target.ts <new-output.json> <before.json> <after.json> [<before.json> <after.json> ...]
bun scripts/analysis/analyze-left-connection.ts <report.json> <frozen-before.js> <output.json> [frozen-candidate.js]
bun scripts/analysis/analyze-tall-wells.ts <report.json> <frozen-pre-D.js> <output.json> [prefix-games=250]
```

`analyze-spare-puyos` は共通シミュレーターの消去元位置を使い、発火後に残った各ぷよの
投入手・列・投入段階を追跡する。本線発火全体／5連鎖以上だけを分け、未発火を残数0扱いにしない。
仮完成させた盤面は使わず、全手の保存盤面と追跡結果の一致を検査する。

`compare-foundation-quality` は同条件の保存手順を物理検証し、旧版・新版の確定盤面を
同じ現行採点器で再評価する。土台内5連鎖、右上の有効な段差、両方の同時成立、100点の到達を
1ゲーム1回・全ゲーム分母で集計。実5連鎖成功局内の100点率は別で、分母0はnull。
2026-09-25以降の満点条件は評価範囲内19個。範囲外の相方・伸ばしは土台点に含めない。
既存報告の再採点は新規ゲームの実行ではない。採点器の指紋と両結果の指紋も保存する。

非発火ガイドの保存結果は次の専用比較を使う。

```sh
bun scripts/analysis/compare-continuous-foundations.ts <before.json> <after.json> <new-output.json>
```

両結果のseed・初手順・手数・ゲーム数を揃え、供給と全配置の物理遷移を再計算する。
実在する確定盤面を同じ現行採点器で再採点し、1局1回・全ゲーム分母の土台100点率を比較する。
保存当時の100点件数、現行定義での件数、配置手順が変わったゲームを区別して記録する。
満点時の全盤面接続見込みも別集計するが、仮置きは成功率へ加えない。
2026-09-27の採点版は `masked-foundation-minimal-v2`。右端位置の固定加点を廃止し、
安定した範囲内19個・事前消去なし・コア先頭2段・5連鎖全消しを満点とする。
同じ保存盤面を前後両引数に渡す再採点では、旧記録の100点件数と新定義を比較できるが、
推薦の改善や新たな500ゲーム走行の証拠にはならない。
土台5・尾完成の獲得/喪失ゲームと、実配置のちぎり・高い谷・平均最大列高も併記する。
尾完成も両方の実盤面を共通の現行判定で再集計し、保存当時の件数と区別する。
これらの形状指標は人間らしさ全体の合否点ではない。

```sh
bun scripts/analysis/compare-guided-tail-completion.ts <before.json> <after.json> <new-output.json>
```

尾完成の見落とし補正を、物理・供給を検証した保存手順へ適用する専用診断。
各ゲームの当初の色計画を再構成し、初到達手、旧フラグ、同一判定での獲得・喪失を保存する。
推薦の再実行ではなく、仮完成図も加算しない。

```sh
bun scripts/analysis/audit-perfect-foundation-routes.ts <continuous-report.json> <new-output.json>
```

保存手順の供給・物理を検証後、各時点で見える3組から100点土台への経路があるか調べる。
経路は反実仮想の機会であり成功件数へは加算しない。採否は実際のガイド入口で空盤面から再実行して決める。

`audit-foundation-fire-opportunities` は、実5連鎖を発火したが土台5に到達しなかった保存ゲームの
発火2手前から、当時見える3組だけを列挙する。土台5を保って本線へ実発火する別経路を保存するが、
反実仮想の機会であって成功実績には加算しない。現在手の発火優先や再推薦で採用できるかは別途検証する。
既存の結果は上書きしない。入力と推薦関連ソースの指紋も残す。

`trace-foundation-feedback` は初手から連続した履歴のある報告を対象に、まず記録手順で報告盤面が
再現できるか検証。その後、旧版・新版を同じツモで空盤面から実行し直す。
推薦器へ渡すのは常にCURRENT/NEXT/NEXT2の3組まで。最初の消去または記録済み区間末尾で停止し、
初手からの履歴が欠けた報告では実行を拒否する。両スクリプトとも既存の出力ファイルを上書きしない。

`verify-spare-target` は同条件・同seedの結果を物理再生検証し、重複ゲームを拒否して
平均余り5個以下、基本形/尾完成/実5連鎖数の維持、ゲームオーバー/意図外消し非増加を確認する。
全保存局面の合法CURRENT配置も列挙し、打てる本線5連鎖の見送りを検出する。
未発火を余り0にせず、個々の成功喪失/獲得/発火遅延を明記する。
既存ファイルは上書きせず、受入条件不達は結果を保存して終了コード1を返す。

`benchmark/measure-advisor-latency.ts <before.js> <after.js> <report.json> <output.json>` は
凍結コードの推薦器をメモリー上で公開し、固定局面を暖機して前後交互に測定する。
重い測定と同時実行した場合は、その事実を結果名・説明に残す。
`benchmark/reserve-spare-holdout.ts <candidate.js> <new-manifest.json> <seed>` は記録済みのseedと
500件のgameSeed重複を検査して、未読検証集合と候補の指紋を予約する。既存ファイルには上書きしない。

ベンチマークCLIの引数は [測定ガイド](../benchmarks/README.md) を参照。
出力は既存の測定結果と別名にして、比較元を上書きしない。

`analyze-construction-stalls` は標準発火・限定発火点伸ばしの仮想5連鎖と、
実際のCURRENTで発火できる5連鎖を区別する。保存された手順は再推薦しない。
番号0から連続する範囲ファイルも物理・ツモの検証を通して分析できるので、
開発用の前半だけを調べ、検証用の後半を開かずに調整できる。

`analyze-completion-waits` は尾完成後に未発火のゲームについて、不足色の集中と
下から置く順序の制約を分け、尾完成直後の実CURRENTの合法な候補も保存する。
理想化した単色供給の期待値は実組ぷよの必要手数ではない。分類タグは重複する。

`analyze-left-connection` は009-C以前の探索省略が起きる盤面を保存し、
省略条件を無条件で除いた反実仮想、任意の凍結候補エンジンとの同盤面比較を行う。
基準の凍結コードをメモリー上だけで変更し、ディスク上のエンジンは書き換えない。
省略条件が一致する版のみ受け入れる。単局面の形状維持をゲーム全体の改善とはみなさず、
採否には同じツモを最初から再実行した500件単位の完成・実発火も用いる。

`analyze-tall-wells` は既知集合の指定した先頭範囲だけを対象に、各ゲームの最初の高い谷と、
先読み発火がある最初の高い谷を保存する。同点候補の現在の高さ・谷・着地・2個の用途を比較する。
009-D以前の終端形状コストのリセット式と内部関数名が一致する凍結コードのみ受け入れる。
候補版を受け入れる汎用評価器ではない。同点の低い合法手があることだけで、
全ゲームの完成を保証しない。採否には `analyze-advisor-quality` による全ゲームと
前後とも発火した同じゲームの比較を併用する。

大きな測定結果の先頭500ゲームを比較元にする場合は、元の平均値を流用せず再集計する。
次の処理は保存済みの物理遷移を検証してから抽出し、新規ファイルへ保存する。

```sh
bun scripts/benchmark/slice-benchmark-report.ts <source-1000.json> <new-prefix-500.json> 500
```

これは再シミュレーションではない。前後の測定条件（seed、初手分類、手数上限、ツモモード）は同じにする。

## 発火点伸ばしの学習用検証

基本形の閉塞報告は `bun scripts/analysis/check-fold-feedback.ts <feedback.txt> <frozen-continuous-before.js> <new-output.json>`
で検証できる。記録手順の物理再現、記録された各盤面での前後推薦、同じ見える3組による空盤面からの
再推薦を分けて保存する。記録された配置を、当時画面が表示した推薦と同一視しない。既存結果へは上書きしない。

```sh
bun scripts/analysis/verify-head-scaffolds.ts [new-output.json]
```

横3・左右L字の独自模式例と、2026-09-25に受け取った2列目の本体色3連結の報告を検証する。
全24色置換、単ぷよの追加、元の土台セルの消去順、15手の記録再生を確認する。
単ぷよ仮置きは実供給やゲームの成功率ではない。推薦ロジックは変更しない。
既存ファイルへは上書きせず、出力には入力・検証器・本体ソースの指紋を保存する。

```sh
bun scripts/analysis/check-head-guide-feedback.ts <frozen-before.js> <new-output.json>
bun scripts/analysis/compare-head-scaffolds.ts <before-continuous.json> <after-continuous.json> <new-output.json>
```

前者は報告15手の再現と、同じ供給を空盤面から再推薦した手順を分けて比較する。
後者は保存済み500ゲームの供給・物理を検証したうえで、本体の早消し接触リスクと
横3・左右L字の条件付き仕込みを集計する。キー待ち期間と、同じ形・色のキーが入り
接続見込みへ移った件数も保存する。実発火・成功率へ加算しない。
どちらも既存の出力へ上書きしない。

```sh
bun scripts/analysis/audit-spare-allocation.ts <continuous-report.json> <new-output.json>
```

保存された推薦後と同じ土台盤面を作れる別配置について、全盤面の仮発火で余剰回収が増える機会を調べる。
基本形・非消去・本線の消去順・現在の完成骨格の維持を確認する。記録の供給と物理を先に検証する。
これは同盤面での反実仮想であり、空盤面からの再推薦結果や成功件数ではない。
採用判断には `measure-continuous-guide` と `compare-continuous-foundations` による別の実走行比較を使う。

## 構成整理の前後比較

### 完成候補拡張の同一盤面・待ち時間比較

```sh
bun scripts/analysis/measure-foundation-guide-latency.ts <before-copy-dir> <before-500.json> <new-output.json>
```

seed20260904の旧版500局から、先頭20局の8・12・16手目（存在する手のみ）を固定して比較する。
供給元・旧版ソースと保存結果の指紋を照合し、同じ盤面・見える3組を旧版／現行版へ渡す。
候補生成を含む初回呼出しを別に記録した後、各盤面を両版で1回ずつ暖機し、順序を交互にした3巡の中央値・p95・最大を保存する。
入力不変・実行前後のソース／入力／検証器指紋を確認し、新規出力だけに保存する。
重い測定・テストが終わってから実行する。Bun上の同一盤面比較であり、ブラウザ操作の待ち時間や端末一般の保証ではない。
推薦品質は別途、前後の `measure-continuous-guide` と `compare-continuous-foundations` で評価する。

### 2026-09-27の土台採点変更・現行ガイドの回帰確認

```sh
bun scripts/analysis/compare-surface-continuous-parity.ts <new-output.json>
```

本件開始時の `benchmarks/results/surface-before-20260927-continuous.js` と現行ContinuousAdvisorを、
固定20局（0〜11、77、98、117、133、144、159、202、371）、seed20260904、4色、最大20手で別々に走らせる。
各手の供給・推薦配置・候補の順番と内部点・盤面・停止理由を比較。採点値や説明文は意図的に変更するため比較対象外。
新規出力のみ受け付け、差分はJSONへ保存したうえで異常終了する。この限定回帰を500局品質測定とは呼ばない。

### 従来の発火型エンジン

変更前・変更後のそれぞれで、別名の凍結エンジンを生成する。

```sh
bun build src/benchmark/AdvisorBenchmark.ts --target=bun --outfile=benchmarks/results/before-engine.js
# 構成変更後
bun build src/benchmark/AdvisorBenchmark.ts --target=bun --outfile=benchmarks/results/after-engine.js
bun scripts/benchmark/compare-engine-behavior.ts benchmarks/results/before-engine.js benchmarks/results/after-engine.js benchmarks/results/behavior-parity.json
```

通常・悪条件モードと7種類の初手を含む42ゲームを、各エンジンで最大20手まで実行する。
推薦配置・点数・全手順・最終盤面・集計結果が完全一致しなければ異常終了する。
これは整理による挙動変化の検査であり、1,000ゲームでの品質評価の代わりではない。
