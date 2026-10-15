# 機能別モジュール＋レイヤード構成

更新日：2026-10-04（初手解析・完成状態・候補比較の撤去・結果保存を反映）

本プロジェクトは **機能別モジュール＋レイヤード構成** を採用する。
英語では feature-based modules with layered dependencies と説明できる。
これは単一の規格名ではなく、機能でまとめる整理方法と、依存方向を制限する設計を組み合わせた呼び方である。

クリーンアーキテクチャの「画面から計算を独立させる」考え方は取り入れるが、
厳密な Clean Architecture、DDD、Feature-Sliced Design の実装を意味しない。
単一フロントエンド内の構成であり、別サービスや別パッケージへの分割は行わない。

## ディレクトリと責務

```text
src/
├── components/
│   ├── layout/       Reactの外枠・メニュー
│   ├── account/      アカウント画面・プロフィール編集
│   ├── game/         ゲームの表示コンテナ・操作案内
│   └── feedback/     手順フィードバックの画面
├── game/
│   ├── GameManager.ts  Phaserの生成・モード起動
│   ├── core/         盤面・ツモ・履歴・共通連鎖シミュレーター
│   ├── gtr/          GTR検出・結果評価・評価設定
│   ├── advisor/      配置推薦・骨格探索・本線発火判定
│   ├── guide/        ガイドの段階・教材パターン・既存候補の表示投影
│   ├── input/        意味アクション・キー割当・保存・入力元別の押下管理
│   ├── scoreAttack/  10回の固定盤面・セット進捗・Worker採点・手順符号化
│   ├── scenes/       ゲーム進行・入力・Phaser表示の連携
│   ├── rendering/    連鎖再生・個体描画・接続判定・素材登録・表示設定
│   └── feedback/     局面保存・再現URL・検証・共有文・ブラウザ保存
├── assets/puyo/       実行時アトラスとフレーム対応表
├── auth/              認証状態・OAuth callback・本人プロフィールとローカルAPI接続
├── benchmark/        再現可能な測定・人間手順の読み込み
├── lib/              外部サービス接続
└── architecture.test.ts  機能間の依存方向の検査

scripts/
├── assets/           独自素材の再生成・画素検査
├── benchmark/        測定実行・失敗再生・挙動比較
├── analysis/         保存した測定結果の分析・反実仮想実験
├── human/            人間手順との比較・集計
└── shared/           実験コードの指紋など、CLI間の共通処理

assets/puyo/source/    編集可能な画素データ・原画・来歴・素材QA
benchmarks/            基準値・人間手順データ・測定出力
docs/                  品質方針・研究・実装仕様・検証記録
server/localAuth/       Vite localdevだけの管理者ログインAPI・接続元とnonce検証
supabase/              CLI設定・共通migration（profiles/scores/replays/本人用score_attack_games/RLS）
sql/                   旧プロフィール移行・実SQLテスト
```

テストは対象コードと同じディレクトリの `*.test.ts` に置く。
盤面の小規模な回帰データは対象機能の `fixtures/` に置き、実験用の大きなデータは `benchmarks/` に置く。
既存の測定JSONや凍結コードは過去の根拠なので、移動に合わせて内容を書き換えない。

## 依存の方向

画面・進行制御から計算処理を呼ぶ。計算処理から画面へは依存しない。

| 領域 | 依存してよい計算領域 | 禁止する依存例 |
|---|---|---|
| core | core | GTR判定、配置推薦、Phaser、React |
| gtr | core、gtr | 配置推薦、シーン、React |
| advisor | core、gtr、advisor | ガイド管理、シーン、React |
| guide | core、gtr、advisor、guide | シーン、Phaser、React |
| feedback | core、gtr、advisor、feedback | シーン、Phaser、React |
| scoreAttack | core、gtr、advisor、scoreAttack | シーン、Phaser、React |
| input | input | core、gtr、advisor、guide、feedback、scenes、Phaser、React |

`feedback` は純粋な計算だけでなくブラウザ保存・URL操作も含む。
`scoreAttack` は固定盤面を既存採点器で評価し、10回分の順序・合計・再試行を所有する。Workerが計算し、Sceneは提出と次盤面生成、Reactは点数一覧と詳細を表示する。採点結果をプレイ中の状態へ書き戻さない。
`scoreAttack/placementHistory`は確定した色・配置と最終盤面を符号化し、共通ChainSimulatorで手順を復元する。`storageCodec`は点数と採点版を持つ小さい保存形式を所有する。`lib/scoreAttackHistory`が認証済みSupabaseの保存・本人取得・お気に入りを扱い、Reactが保存状態と履歴を表示する。計算層へSupabaseやReactを持ち込まない。本人100ゲーム・FIFO・お気に入り保護・冪等保存はDB関数が同一ユーザーのトランザクションロックで保証する。[設計](design/SCORE-ATTACK-HISTORY-20261004.md)。
`storage.ts` / `replay.ts` のブラウザ依存を、GTR判定や推薦に持ち込まない。
アプリ版の取得に使う `package.json` はデータ参照として許可する。

`scenes` は進行制御と表示をつなぐ場所で、現時点では入力や描画も担当する。
`input` は盤面を参照せず、キー割当と入力状態を意味アクションへ変換する。SceneとGameManagerがその結果を利用し、画面ボタンも同じアクションを送る。
独立した application/use-case 層への全面分割までは行っていない。
`rendering` はcoreの確定済みTraceを表示する利用側。`ChainPlayback`が既存時間と停止理由を管理し、
`PuyoBoardRenderer`が個体・肩overlay・粒を所有、`PuyoConnections`が隣接IDとmaskを計算し、
`PuyoRenderer`がアトラスを登録する。表示のために物理計算や乱数を再実行しない。
結果図は `gtr/GTRChainPreview` が評価範囲だけのコピーから仮想発火Traceを生成し、
`rendering/ResultChainPlayback` が消去順だけを再生する。実プレイの再生・盤面確定には接続しない。
`benchmark` は core・gtr・advisor を利用する利用側であり、ゲーム本体から測定処理を呼び出さない。

`auth`は外部認証・本人プロフィールの状態を所有し、`lib/supabase`と開発専用HTTP APIを利用する。ゲーム計算や入力層へ依存を持ち込まない。アカウント画面による停止はAppから既存の`suspended`契約を使う。
`server/localAuth`は開発サーバーだけに接続し、ブラウザの`src`からimportしない。管理者もSupabase Authの通常セッションを使い、ローカルとクラウドは接続先で分離する。本番静的配信/previewにローカル管理者機能を設けない。詳細は [認証・DB設計](design/AUTH-DB-DESIGN-20260930.md)。

ローカルSupabase移行は[設計](development/LOCAL-SUPABASE-DEVELOPMENT-20260930.md)に従って実装・R1受入完了。共通DB定義は`supabase/migrations/`、ローカル専用初期化は`scripts/local-supabase.ts`に分離し、ブラウザから管理キーを参照させない。Windowsのコードとゲーム層の依存方向を維持する。受入結果は[検証記録](reviews/LOCAL-SUPABASE-VALIDATION-20260930.md)を参照。

依存の一部は `src/architecture.test.ts` で、通常の import/export と Phaser 型の混入を検査する。
動的読み込みや実行時の全依存まで保証する検査ではない。

## ファイルを分ける基準

行数だけで細分化せず、変更理由・入力と出力・テスト対象が独立するときに分割する。

- `advisor/PlacementAdvisor.ts`：候補の列挙・評価・推薦をまとめる入口。
- `advisor/OpeningAnalysis.ts`：初手の型・個数・初出順と色役割。教材も同じ解析を使う。
- `advisor/GTRAnalysis.ts`：両モードで共通の完成表示・現在ペアの本線発火・実在セルの用途。採点や推薦の順位を変更しない。
- `advisor/MainFireAnalysis.ts`：本線発火と巻き込み消去の判定。
- `advisor/FiveChainPlanner.ts` / `TailPlanner.ts`：5連鎖骨格と連鎖尾候補の探索。
- `advisor/types.ts`：推薦関連の型とフェーズ。型だけ必要な利用側はここを参照できる。
- 配置案内は既存のScene・COACH・ゴーストによる1案表示。利用者の最新指定で、3候補比較用の投影モジュール・React欄・通知は撤去した。
- `feedback/GTRIssueReport.ts`：既存利用側向けの公開窓口。
- `feedback/snapshot.ts` / `types.ts` / `constants.ts`：局面の切り出し・データ定義。
- `feedback/replay.ts` / `validation.ts`：再現URLと入力検証。
- `feedback/format.ts` / `storage.ts`：共有文と保存処理。

機能全体を無条件でまとめる巨大な `index.ts` は作らない。
互換性のための公開窓口と、内部処理への直接参照を区別する。
使い道の曖昧な `utils/` や `common/` へ集めず、責務を所有する機能内に置く。

## 整理時に変えないもの

### 完成形ギャラリー

`game/guide/GTRCompletionGallery.ts` は固定教材と盤面への変換だけを所有する。
`components/gallery/` は一覧・拡大モーダル・DOM上のドット絵と再生の表示を所有する。
物理計算は既存の `gtr/GTRChainPreview` → `core/ChainSimulator`、消去順の表示は
`rendering/ResultChainPlayback` を再利用する。ゲーム状態・採点・推薦から独立した閲覧機能とする。
一覧の得点は `gtr/GTRPatterns` の共通採点器を呼び、手書き値を持たない。
`gtr/FoundationExtensionExample` は教材の列高・段差の説明と、同色組2組での限定接続例を計算する。
接続探索は開いたモーダルだけで実行し、通常採点や配置推薦の探索へ混ぜない。
`GameManager` は閲覧による一時停止を管理し、各Sceneは既存の入力解除待ちを維持する。

### 共通の保護対象

- ゲームと自動測定は同じ `core/ChainSimulator.ts`、同じ配置推薦を利用する。
- 推薦スコア、GTR完成優先、発火条件、ツモ生成の仕様は構成整理と同時に調整しない。
- 再現URLの形式・保存キー・共有データの版を、ファイル移動だけを理由に変えない。
- `tasks/` を再作成しない。外部タスク管理と設計書を分ける。

## 確認方法

```sh
bun run type-check
bun run type-check:scripts
bun run test
bun run build
bun run benchmark:advisor:ci
```

大きな責務分割では変更前後のエンジンを凍結し、同じツモで手順・点数・最終盤面まで比較する。
方法は [scriptsの使い方](../scripts/README.md)、測定条件は [ベンチマーク](../benchmarks/README.md) を参照。

GTRの強さ・人間らしさを改善する変更と、同じ挙動のまま整理する変更は分けて検証する。

### 2026-09-22 の構成整理の確認結果

- 全28テストファイル・366テスト成功。
- 本体・スクリプトの型確認、プロダクションビルド成功。
- 変更前後各42ゲーム・785手の推薦、点数、盤面、集計が完全一致。
  比較条件と凍結コードのハッシュは `benchmarks/results/structure-20260922-parity.json` に記録。
- 移動後のベンチマークCLI（12ゲーム・上限8手）と人間比較（108局面）が起動・完走。
  これはツールの動作確認であり、新たな完成率・人間らしさの改善を示す測定ではない。
- ビルド時に出力チャンクが500 kBを超える警告あり。今回、読み込み分割の最適化は行っていない。
- プレイ中のブラウザを手動更新・操作する確認は行っていない。

### 2026-10-15 履歴のツモで練習

`core/PairSequence.ts`が色ペア列の型・検証・初期位置への変換を所有し、`scoreAttack/practiceSequence.ts`が保存手順と最終盤面を検証して色列を抽出する。Reactが選択した列をGameManager/GuidedPracticeSceneへ渡す。Sceneは手順の絶対番号と既存PRNGで組を供給する。feedbackの任意practiceSequenceはcoreの型/検証だけを使い、scoreAttackやSceneへ依存しない。[設計](design/HISTORY-GUIDED-PRACTICE-20261015.md)。
