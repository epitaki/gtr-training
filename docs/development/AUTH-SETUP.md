# 認証・ユーザーDBのセットアップ

現在の状態（2026-10-15）: Google/GitHubの実OAuth、プロフィール/画像、本人専用履歴をクラウドで利用可能。リリース前監査で旧APIの権限撤去・画像10件上限を追加し、20261015000000_pre_release_securityまでの共通migrationを適用・読み取り確認済み。公開URLと本番OAuthの受入はリリース作業で行う。[セキュリティ監査](../reviews/PRE-RELEASE-SECURITY-AUDIT-20261015.md)。

ローカルSupabase移行も受入済み。[移行検証](../reviews/LOCAL-SUPABASE-VALIDATION-20260930.md)。以下の2026-09-30/10-04のクラウド未設定・未適用の記述は当時の経緯であり、現在の状態は上記を参照する。

新規プロジェクトはsupabase/migrationsの全ファイルを時刻順に適用する。初期SQLだけでは現在の履歴/画像/公開前の権限制限は揃わない。Client Secret・管理トークンはVITE_変数やGitへ入れない。旧scores/replaysの公開APIは現在無効であり、本人履歴はscore_attack_gamesを使用する。

## ローカル開発の起動

コード・Git・Bun・ViteはWindowsで動かし、PostgreSQL/AuthなどのSupabaseサービスはDocker DesktopのWSL2基盤で動かす。ローカルDBとクラウドDBのデータは同期しない。

1. Docker Desktopを起動する。WSL2バックエンドを使い、SettingsのNetworkでPort binding behaviorを「Localhost by default」にする。このPCではDocker Desktop 4.93.0をその設定に変更した。
2. `bun install`で固定版Supabase CLIを含む依存を用意する。
3. `bun run supabase:start`でこのPC専用のSupabaseを起動する。初回はコンテナ取得に時間がかかる。
4. `bun run supabase:migrate`で未適用の共通migrationをローカルDBへ適用する。
5. `bun run supabase:admin-init`でパスワードなしの固定ローカル管理者を初期化する。繰り返しても表示名を上書きしない。
6. `bun run dev --host 127.0.0.1 --port 5175`でアプリを起動し、アカウント画面からローカル管理者でログインする。

`bun run supabase:stop`はデータを保持して停止する。`bun run supabase:status`は接続設定を再生成する。起動処理にDB resetは含めない。APIは`http://127.0.0.1:54321`、PostgreSQLは`127.0.0.1:54322`を使う。Docker公開ポートはloopback専用ネットワークとDocker Desktopのlocalhost既定設定で限定する。コマンドは起動後の実ポートを確認し、127.0.0.1/::1以外を検出すると停止・失敗する。設定が戻った場合はこの検査を外さずDockerの設定を確認する。

ローカル設定はCLI statusから`.local/supabase/.env`へ生成する。公開URL/anon keyと、開発サーバー専用の`LOCAL_SUPABASE_SERVICE_ROLE_KEY`を含むため共有・Git登録しない。キーの値をコマンド出力へ表示しない。ローカルモードはこのディレクトリだけを設定元にし、root `.env.local`にあるクラウド設定を保全する。bunfig.tomlのenv=falseでBunによるroot envの自動読込を止め、Viteが環境別に読む。明示した環境変数とローカル設定が異なる場合は起動を拒否する。

クラウドへ接続して開発する場合だけ`bun run dev:cloud --host 127.0.0.1 --port 5175`を使う。通常の`dev`はlocaldevモード、`dev:cloud`はcloudモード。認証の保存領域を接続環境ごとに分ける。localdevモードの本番buildは拒否し、通常の`bun run build`にはローカル管理者APIを含めない。

## 使用するサービス

通常ユーザーの認証はSupabase Auth経由でGoogle/GitHubに任せ、アプリにはパスワード入力・保存機能を設けない。プロフィールはSupabaseのPostgreSQLに保存する。ログインしなくてもゲームは利用できる。

停止中の旧Supabaseプロジェクトからデータを引き継がないことを利用者が指定済み。新規プロジェクトを使用する。旧プロジェクトの削除は不要。

2026-09-30に利用者が新規作成: [Supabaseダッシュボード](https://supabase.com/dashboard/project/fqzvthxzupjjkhpuwvst)。標準API URLは`https://fqzvthxzupjjkhpuwvst.supabase.co`。受領した公開キーをgit対象外の.env.localへ設定し、Auth healthのHTTP 200と開発サーバーへの設定反映を確認済み。DB/OAuth設定は未完了。

実サービスの公開設定はGoogle=false、GitHub=false、Email=true。プロフィール表の存在確認（匿名・0行指定）は404/PGRST205で、APIのschema cacheにprofilesが見つからない。初期SQL適用は未確認のため、クラウド適用は未実施のまま残す。共通DB定義は下記migrationを正本とする。管理画面の認証済みセッションは利用できず、公開キーではSQLやprovider管理設定を変更できない。

## 新しいSupabaseプロジェクト

1. Supabaseダッシュボードで新規プロジェクトを作成する。DB管理用パスワードは利用者が設定・保管する。これはゲーム利用者のパスワードではなく、アプリの環境変数にも保存しない。
2. プロジェクトのURLと公開用のPublishable key（旧形式ならanon key）を取得する。secret key、service_role key、DBパスワードをブラウザ用設定に入れない。
3. 新規DBでは [共通初期migration](../../supabase/migrations/20260930000000_initial.sql) をSQL Editorで実行する。新プロジェクトはこちらを使用するが、今回のローカル移行作業でクラウドへ適用はしない。過去の旧初期SQLが適用済みのDBだけ [sql/migrate-legacy-profiles.sql](../../sql/migrate-legacy-profiles.sql) を使用する。両方を続けて実行しない。実Supabaseへの適用結果は未確認。
4. ローカルの`.env.local`へURLと公開キーを設定する。`VITE_SUPABASE_URL`にURL、`VITE_SUPABASE_ANON_KEY`にPublishable keyまたは従来のanon keyを入れる。`.env.local`はコミットしない。

初期SQLはプロフィールに加え、既存設計の公開スコア/リプレイ用テーブルも用意する。プロフィールは本人だけが閲覧・表示名変更でき、旧メール入りusernameを公開する構成には戻さない。

2026-10-04のスコアアタック履歴には、初期migrationの後に [本人100ゲーム保存](../../supabase/migrations/20261004000000_score_attack_history.sql)、続いて [効率的な手順保存](../../supabase/migrations/20261004001000_compact_score_attack_history.sql) を適用する。公開scores/replaysとは別の本人専用テーブルを使う。ローカルでは2本を非破壊適用し、既存アカウントでの保存・お気に入り・再読込後の履歴と手順を確認済み。クラウドには未適用で、外部OAuthとあわせて既存認証タスクの残件。管理者権限の変更やクラウドへの自動適用は今回行っていない。[機能と受入](../reviews/SCORE-ATTACK-HISTORY-CHECK-20261004.md)。

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-key-or-anon-key>
```

設定後は開発サーバーを再起動する。接続先の変更だけで旧プロジェクトのデータが移ることはない。

## GoogleとGitHub

Supabase側のプロバイダー設定には、それぞれのサービスで作成したOAuthアプリのClient IDとClient Secretが必要。Client SecretはSupabase側へ設定し、このアプリのVITE_環境変数やリポジトリには入れない。

- Google: Google Auth PlatformでWeb applicationのOAuthクライアントを用意し、許可するユーザーと基本プロフィールのscopeを設定。SupabaseのGoogle設定画面に表示されるcallback URLをGoogleのAuthorized redirect URIsへ登録する。
- GitHub: Developer settingsのOAuth Appsでアプリを用意し、Authorization callback URLにSupabaseのcallback URLを登録する。リポジトリ操作権限は要求しない。
- 一般的なプロバイダー側callbackは `https://<project-ref>.supabase.co/auth/v1/callback`。実際のプロジェクト画面の値を確認する。
- SupabaseのAuthentication設定でGoogle/GitHubを有効化する。OAuthだけを利用するためメール/パスワードのEmail providerは無効化する。これは既存ユーザーのいる環境で無断変更しない。
- Supabaseからこのアプリへ戻るURLは別設定。AuthenticationのURL Configurationへ正確なアプリcallbackを登録する。現在の開発環境では`http://127.0.0.1:5175/?auth_callback=1`。localhostでも利用する場合は`http://localhost:5175/?auth_callback=1`も登録する。Site URLはアプリの通常URLとし、本番公開時には本番originと配信pathのcallbackを別途登録する。

OAuthアプリ作成・認証情報入力・アクセス許可はサービス管理画面で利用者の操作が必要になる場合がある。外部設定ができるまで、ローカル管理者とゲストプレイで開発できる。

Google認証は埋め込みブラウザで拒否されることがある。Codex内ブラウザで拒否された場合、Chrome/EdgeでアプリのURLを開き、そこからログインを最初から開始する。PKCEの情報は開始したブラウザに保存されるため、途中の認証URLだけを別ブラウザへ移さない。[Googleのブラウザ要件](https://developers.google.com/identity/protocols/oauth2/policies#browsers)。

## ローカル管理者の扱い

ローカル管理者は、このPC内のSupabase AuthとPostgreSQLに保存する開発専用アカウント。固定UUIDは`00000000-0000-4000-8000-000000000001`、メールは`systemadmin@gtr.local`、初期表示名は「システム管理者」。クラウドのユーザーや管理者権限とは別で、共通migrationには作成・昇格処理を含めない。

初期化コマンドはAdmin APIで本人識別を確認し、パスワードなしでユーザーを用意する。開発用ログインAPIが一時的なmagic linkを検証し、通常のSupabaseセッションをブラウザへ渡す。取得・表示名保存・ログアウトは通常ユーザーと同じSupabase経路を使う。Vite再起動だけではセッションを失効させず、Supabase標準の期限と更新に従う。

APIはlocaldevの開発サーバーだけに登録し、実listen・接続元・Host・Origin・使い捨てnonceを確認する。公開/LAN bind・cloudモード・本番build・previewでは利用できない。上流は固定ローカルAuth URLだけに限定し、redirectを追わない。

旧`.local/auth.sqlite`は削除・自動移行しない。新しいコードでは使用しない。`.local/`とSupabase CLIが生成する`supabase/.temp/`・`.branches/`はGitとVite配信から除外する。CLIが作るdocker.envにも秘密値が入るため、生成物を共有しない。ローカルDBが停止していてもゲストで遊べるが、プロフィール保存はできない。クラウドやSQLiteへ自動切替はしない。

検証コマンドは `bun run type-check`、`bun run type-check:server`、`bun run type-check:scripts`、`bun run test --maxWorkers=2`、`bun run build`。PGliteによるSQLテストとjsdomによる画面テストは開発依存で、本番DBやGoogle/GitHubの代替ではない。

## 動作確認の区別

- ローカル自動テスト: 接続設定分離、開発APIの接続元/nonce検証、認証とプロフィールの競合回帰、PGliteによるSQL権限検証。実Dockerでの初期化・ログイン・データ保持は別途確認する。
- ローカル画面: ゲスト、ローカル管理者ログイン、表示名変更、ログアウト、ゲーム中の画面操作。
- 外部接続: 実SupabaseへSQLを適用し、GoogleとGitHubの両方でログイン/再ログイン/プロフィール変更/ログアウトを確認する。この工程はサービス設定後に実施し、ローカルテスト成功だけで完了扱いにしない。

接続診断は匿名プロフィール読取ではなく[Supabase公式のAuth health endpoint](https://supabase.com/docs/guides/troubleshooting/how-do-i-check-gotrueapi-version-of-a-supabase-project-lQAnOR)を使う。設定不足・通信失敗・公開キー拒否・サービス応答を区別し、疎通成功をSQL設定やOAuth実ログインの完了とは扱わない。

## 公式資料

- [Supabaseの公開キーと秘密キー](https://supabase.com/docs/guides/getting-started/api-keys)
- [Google設定](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [GitHub設定](https://supabase.com/docs/guides/auth/social-login/auth-github)
- [アプリへのリダイレクトURL](https://supabase.com/docs/guides/auth/redirect-urls)
