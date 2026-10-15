# ローカル開発環境をSupabaseへ統一する

日付: 2026-09-30
状態: ローカルSupabase移行の実装・検証・R1受入完了。[検証記録](../reviews/LOCAL-SUPABASE-VALIDATION-20260930.md)／[最終判定](../reviews/local-supabase-r1-review.md)。
Habitica: `65f80be6-edc5-4f4e-a6ed-e43393bb3989`（優先度: 高、本体・8/8チェック完了、再取得確認済み）。
関連: 認証・ユーザーDBタスク `8503d097-3ae1-4d72-9bf9-aad9eaff9233`、[既存認証設計](../design/AUTH-DB-DESIGN-20260930.md)、[セットアップ](AUTH-SETUP.md)。

## 依頼と実装範囲

利用者はローカル開発でもPostgreSQLを使い、開発環境をSupabaseへ寄せる方針を指定。先にタスクと設計文書を登録し、その後の実装開始指示に従って移行する。

追記: その記録完了後、利用者が「deploy設定は別タスクとして切っておいてローカル開発の実装に取り掛かって」と指示。以降は本タスクを実装する。[デプロイ設定](../design/DEPLOYMENT-PLAN-20260930.md)は別タスク`8ced9e6b-9aa8-46f3-b3d6-3e949b0278da`へ登録済み。

Astra `/root/local_supabase_design`（gpt-6-astra）が既存実装と設計を確認し、Solが実装。新規Sol3名の独立レビューとAstra最終受入をR1で完了し、確認済み必須修正0件。型3種・105ファイル1318テスト・build・実API23項目・画面/永続化/停止時ゲスト検証に成功。既存認証のR5受入とは別に、この移行を検証・受入した。

## 開始時点と移行先

| 対象 | 開始時点 | 移行後の方針 |
|---|---|---|
| コード・Git・Bun・Vite | Windows | Windowsを維持 |
| 開発DB | 管理者はSQLite、通常ユーザー用接続先はクラウドSupabase | Docker DesktopのWSL2基盤でローカルSupabase/PostgreSQL |
| 管理者認証 | 開発APIの独自cookieセッション | ローカルSupabase Authの固定開発ユーザー |
| プロフィール | SQLiteとSupabaseの別経路 | Supabase Auth・public.profiles・RLSを共用 |
| DB構造の正本 | sql/initial-setup.sql | supabase/migrations/の共通migration |
| データ | PCとクラウドに分離 | 分離を維持し、自動同期しない |

開始時点ではDockerが未導入だったため、署名を確認した公式Docker Desktop 4.93.0をユーザー別に導入。WSL2 2.7.14.0、Engine 29.8.1/linuxの応答成功を確認。詳細は[検証記録](../reviews/LOCAL-SUPABASE-VALIDATION-20260930.md)。

新規クラウドprojectは`fqzvthxzupjjkhpuwvst`。公開キー設定とAuth疎通は確認済み。直近の公開API確認ではGoogle/GitHub未有効、profilesは404/PGRST205。クラウド初期SQL・provider設定・実OAuthの残件は関連する認証タスクに保持する。

## 設計契約

1. アプリはパスワードを管理しない。通常ユーザーはGoogle/GitHub OAuth、開発専用固定管理者はローカルSupabaseのAuthユーザーとプロフィールとして扱う。
2. ローカル管理者のプロフィール取得・表示名更新・ログアウトは通常のSupabase経路に統一する。SQLite保存、独自cookieセッション、現行backendSelectionの二重管理は非使用へ移行する。既存のbackend識別を変更する際は接続環境とAuth user idで混同を防ぐ。
3. 共通migrationはprofiles・scores・replays・RLS・列権限の既存契約を保持する。管理者作成/昇格は共通migrationに入れず、ローカル専用初期化へ分離する。sql/initial-setup.sqlとの二重管理を残さない扱いを実装時に確定する。
4. ローカル管理者ログインAPIはDEV・preview除外・実listen/peer/Host/Origin/CSRF検証を維持する。接続先もローカルSupabaseへ限定し、クラウドURLでは有効化できない。Docker公開ポート自体もloopbackへ限定する。
5. 開発の既定接続をローカルにし、クラウドへの開発接続は明示的な選択にする。現在の.env.localのリモート設定は保全し、ローカルモードへ暗黙に混入させない。URL・公開キー・認証ストレージを接続環境ごとに分離する。
6. 管理用サービスキーはサーバーだけで扱う。VITE_変数・クライアント配信・ログ・Gitへ入れない。既存の公開環境変数ガードを維持する。
7. ローカルDBが停止していてもゲストプレイを維持する。クラウドまたはSQLiteへの自動fallbackは行わない。
8. 既存SQLiteファイルとデータを削除・自動移行しない。起動時のDB resetや、クラウドへの自動migration適用も行わない。接続先切替前に既存設定を保全する。

## 設計時の確認事項（具体契約は後述）

- Supabase CLIの固定版、Bun経由のWindows実行方法、Docker Desktop/WSL2の実動条件。インストール・OS設定変更・再起動が必要なら具体的な範囲を確認する。
- ローカルAuthユーザーの冪等初期化とパスワードなしログイン。候補はサーバーAdmin APIによるユーザー準備、generateLink、OTP検証、通常Authセッション確立。固定ユーザーのUUID/識別、既存ユーザー照合、Email設定、ログアウト/期限/再起動時の扱いを実スタックで検証して確定する。
- 開発コマンドとenv読込規則。HTTP接続の許可はDEVの明示ローカルURLに限定し、現在のHTTPS検証を無条件に緩めない。
- 起動・停止・非破壊migration適用・ローカル初期化の操作を分ける。通常起動にresetを含めず、停止でデータを保存する。
- 旧SQLiteの表示名を引き継ぐ必要が生じた場合は、後続の明示操作として扱う。

## 実施順序と完了条件

1. 実装開始時点の未コミット変更、ファイルhash/copy、baseline検証を記録する。既存HEAD差分全体を今回の変更として扱わない。
2. Docker/WSL2と固定版CLIを準備し、loopback限定のローカルSupabaseが実起動することを確認する。
3. 共通migrationとローカル初期化を用意する。新規ローカル環境に実適用し、再実行で管理者が重複せず、編集済み表示名を上書きしないことを確認する。
4. 接続設定と認証処理を移行する。固定管理者のログイン・表示名保存・ログアウト・再ログインが成功し、停止/再起動後もプロフィールが残ることを実画面で確認する。
5. 匿名/他人/role改ざんをRLS・列権限で拒否する。公開bind・不正Host/Origin・preview・クラウド宛先で管理者APIを拒否し、サービスキーが配信されないことを確認する。
6. DB停止時のゲスト、環境切替時のセッション分離、OAuth callback、保存競合、アカウント画面によるゲーム停止を回帰確認する。
7. `bun run type-check`、`bun run type-check:server`、`bun run type-check:scripts`、`bun run test --maxWorkers=2`、`bun run build`を確認する。PGliteだけで実Docker/Supabase検証を代替しない。
8. 新規Sol3人が固定対象を独立レビューし、Astraが実コード・設計・全レビュー・検証を受入。確認済み指摘はSolへ戻し、新規3人で再レビューする。必須修正0かつ必要検証成功後にHabiticaとdocsを完了更新し再取得確認する。

Docker未導入や実起動不可の場合は、設定ファイルだけで環境移行完了とせず、未検証範囲と必要な操作を残す。

## 実装開始時の具体契約

Astra `/root/local_supabase_design` が実装開始指示後に読取確認し、以下を確定した。

- `dev`は`vite --mode localdev`、envDirは`.local/supabase/`。`dev:cloud`のみ従来root envを使う。既存root `.env.local`を変更しない。localdev buildは拒否。
- `.local/supabase/.env`はCLI statusから値非出力で生成。公開値とサーバー専用LOCAL_SUPABASE_SERVICE_ROLE_KEYを取り違えず、resolved公開値とローカル設定の不一致を起動時に拒否する。HTTP許可はDEV/localdevの固定`http://127.0.0.1:54321`のみ。AuthとOAuthの保存キーは接続環境/URLで分離する。
- 固定Auth UUID `00000000-0000-4000-8000-000000000001`、メールsystemadmin@gtr.local、初期表示名システム管理者。getUserByIdの明確なnot foundのみ作成し、既存UUID/メール/app metadata識別を照合。初期化は明示コマンドのみ、再実行で表示名を変えない。JWT roleはauthenticated、profiles.roleだけadmin。共通migrationには管理者を含めない。
- DEV APIはGET bootstrapとPOST loginへ縮小。既存loopback/Host/Origin/CSRF/nonce期限・上限・使い捨てを保持。preview/cloudには登録しない。上流fetchは固定宛先・redirect拒否。generateLink→別公開clientのverifyOtp→固定user確認後、通常access/refresh tokenのみno-storeで返しブラウザsetSessionへ渡す。上流の生エラー/OTP/secretは返さない。
- SQLite/独自cookie/backendSelectionを実行経路から外し、取得/保存/logoutを単一Supabase経路へ統一。既存の世代・読取/保存revision・draft保護を維持。ローカル管理者表示は接続先だけでなく固定identity/識別で確認。Vite再起動による強制失効は廃止しSupabase標準のセッション期限・更新へ合わせる。
- ローカルAuthは必要なEmail機能を用い、公開signupを無効にする。アプリにメール/パスワード画面を追加せずクラウドのEmail設定は変更しない。
- 共通migrationを正本としsql/initial-setup.sqlの重複実装を撤去、参照/テストを更新。旧DB移行は保管。start/stop/status/非破壊migration適用/admin初期化を分離し、remote link/push/resetを追加しない。
- CLI候補はnpm公式レジストリで確認した安定版2.118.0を固定する。WSL2 2.7.14.0、Ubuntu version2稼働を確認。Windows/UbuntuでdockerはPATHになし。Docker Desktopのユーザー別導入パスも確認してから環境準備する。
- 開始snapshot: docs/reviews/local-supabase-baseline-20260930.json、ID cfb1c78be47aa121eba9d6d3beeafd9d162c604341bcfd6cbfab1b0d9ed733cb、286ファイルcopy。accepted R5のアプリ対象281ファイルとの差0。型3種/105files1332tests/buildの既存成功結果を開始baselineとして再利用する。

固定UUID作成、signup無効時のmagic-link検証、profile昇格/本人列権限、CLI設定互換は実Supabaseで確認済み。起動スクリプトは実公開ポートも検査する。Docker DesktopはLocalhost by default設定が必要だったため環境へ反映。不要なanalytics/vectorは無効化。詳細は[検証記録](../reviews/LOCAL-SUPABASE-VALIDATION-20260930.md)。

## 保護対象と範囲外

ゲーム物理・採点・推薦・乱数・ツモ・キー操作、既存未コミット変更、旧SQLite、クラウドデータを保護する。ゲーム同期、マウス対応、全ユーザー管理画面、WSLへのリポジトリ移動、公開/コミット/pushは含めない。削除済みtasks/は再作成しない。

## 計画登録時点の記録（実装開始前）

- 関連Habitica todoを検索し同内容なし。新規移行タスクを作成し、本文一致と本体未完了をGETで確認。
- 優先度・対象・受入条件・設計参照・8チェック項目を登録。既存認証タスクとは相互参照を付け、外部OAuthの残件を移さない。
- 本書、既存認証設計/セットアップ、プロジェクト構成、docs一覧、進捗を更新済み。関連認証タスクとの相互参照も保存し、両タスクをGETで再取得して本文一致と本体未完了を確認。
- 新タスクは登録・設計整理のチェック1/8のみ完了。実装以降の7項目は未完了。既存R5 snapshotの文書を除く281ファイルと照合し、アプリ・テスト・設定の変更0を確認した。
- 実装・設定切替・DB操作・インストールは未実施。文書のみのためテスト/buildは実行しない。既存R5の105ファイル/1332テスト成功は過去の認証実装の根拠であり、今回の移行の検証ではない。

## 公式資料

- [ローカルSupabaseの起動とloopbackネットワーク](https://supabase.com/docs/guides/local-development)
- [CLI設定](https://supabase.com/docs/guides/local-development/cli/config)
- [共通migrationとseed](https://supabase.com/docs/guides/local-development/database-migrations)
- [Docker DesktopのWSL2基盤](https://docs.docker.com/desktop/features/wsl/)
- [Auth Admin generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink)
