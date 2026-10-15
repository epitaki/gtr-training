# クラウド認証・ユーザーDBの最終受入

2026-10-10。利用者の認証タスク完了依頼を受けて再開。Habitica既存認証タスクの開始記録を更新し、5/7・本体未完了を再取得確認した。

対象は既存Supabaseプロジェクト `fqzvthxzupjjkhpuwvst`。ローカルSupabase移行と認証実装の既存受入を引き継ぎ、クラウドの共通migration、Google/GitHub provider、本人プロフィール保存・再読込・再ログイン・ログアウトを確認する。外部設定と実ログインを確認できるまで残チェックと本体を完了にしない。

既存作業コピーの未コミット変更を保護する。今回の実装開始前は文書と外部タスクの状態記録のみ変更する。秘密情報はリポジトリや証跡へ記録しない。

## 接続調査

- 旧セッションのセットアップでは両provider無効、profiles未適用。現在の公開APIを改めて確認する。
- Supabase管理用接続は利用可能なプラグインを探索し、対象プラグインの接続を提案した。接続前に管理変更は実施しない。
- `.env.local` は現在の主作業コピーと前セッションの作業コピーに存在しない。主作業コピーの `.env` とローカル生成設定は存在する。キー値は出力しない。

## 完了条件

1. 共通3migrationの適用状況と既存データを確認し、未適用だけを適用する。
2. プロフィールの本人権限とローカル管理者のクラウド非導入を確認する。
3. Google/GitHubのOAuth設定と正確なcallback許可を確認する。
4. 各providerでログイン、プロフィール保存と再読込、ログアウト、再ログインを実画面で確認する。
5. 必要な回帰と記録を保存し、Habiticaの残チェックと本体完了を保存後に再取得する。

## 2026-10-10 接続確認と利用者回答

利用者回答: Google/GitHubともOAuthアプリ未作成。Supabaseプラグインは探索結果では未追加・未接続で、追加/接続を提案済み。ローカルに管理接続用のSupabase設定ファイルは見つからず、対象プロジェクトの公開設定APIは認証なしでHTTP401。現在の主作業コピー `.env` は旧プロジェクト `srewvrbqsptlfpmslaab` を参照するため、そのキーで新プロジェクトを操作しない。過去の `.env.local` は現在の作業コピーに残っていない。新プロジェクトの公開キーは管理接続後に取得・Git対象外へ保存する。

## OAuthアプリ登録時の入力

共通のprovider callback: `https://fqzvthxzupjjkhpuwvst.supabase.co/auth/v1/callback`。アプリから認証を開始する環境は `http://127.0.0.1:5175`、アプリ復帰URLは `http://127.0.0.1:5175/?auth_callback=1`。

### GitHub

[OAuthアプリ作成](https://github.com/settings/applications/new)で、Application nameに `GTR Training`、Homepage URLに `http://127.0.0.1:5175`、Authorization callback URLに上記共通callbackを入力する。Device Flowは有効にしない。登録後にClient Secretを生成し、Client IDとSecretをSupabase Authentication → Sign In / Providers → GitHubへ直接入力して保存する。Secretはチャットやリポジトリへ貼り付けない。[公式手順](https://supabase.com/docs/guides/auth/social-login/auth-github)。

### Google

[Google Auth Platform](https://console.cloud.google.com/auth/overview)でプロジェクトを選択または作成する。Brandingに `GTR Training` と自分の連絡先メール、AudienceにExternalを設定し、Testingの場合は実ログインするGoogleアカウントをテストユーザーへ登録する。Data Accessはopenid・userinfo.email・userinfo.profileに限定する。ClientsでWeb applicationのクライアントを作成し、Authorized JavaScript originsへ `http://127.0.0.1:5175`、Authorized redirect URIsへ共通callbackを登録する。取得したClient ID/SecretはSupabaseのGoogle providerへ直接入力する。[公式手順](https://supabase.com/docs/guides/auth/social-login/auth-google)。

Supabase URL ConfigurationではSite URLに `http://127.0.0.1:5175`、Redirect URLsにアプリ復帰URLを登録する。provider側callbackとアプリ復帰URLを取り違えない。Email providerの無効化は既存ユーザー・設定を確認してから判断する。

## 管理接続後のDB手順

初期定義は `supabase/migrations/20260930000000_initial.sql`、本人100ゲーム保存は `20261004000000_score_attack_history.sql`、保存形式最適化は `20261004001000_compact_score_attack_history.sql`。管理接続後に適用履歴、publicテーブル、関数、RLS、権限、既存データを取得し、未適用だけをこの順に適用する。初期SQLはCREATE TABLEを含むため、既存定義がある場合に無条件再実行しない。ローカル管理者seedはクラウドへ適用しない。

現時点の外部変更はHabitica開始・進捗本文のみ。クラウドDB/OAuth設定の変更と実ログインは未実施。本体は未完了5/7を維持する。

## GitHub設定の利用者申告

2026-10-10 GitHub設定の案内後、利用者より「終わった」と回答。GitHub OAuth登録とSupabaseへの設定は利用者申告として記録する。こちらからの設定再取得・実ログイン確認は未実施。次はGoogle OAuthアプリ設定とSupabase管理接続、共通migrationと両provider実ログインの確認。5/7・本体未完了を維持。

## Googleクライアント情報の保存確認

利用者が現在のWSL作業コピー `.secrets` へGoogle Client ID/Secretを保存した。項目名とGoogle Client IDの形式、Secret存在を確認し、秘密値は表示しなかった。`.secrets` をowner-only権限600に変更し、現在の作業コピー `.gitignore` へ `/.secrets` を追加した。Google providerへの反映にはSupabase管理API認証が必要で、利用者へ同じファイルの `SUPABASE_ACCESS_TOKEN` 追加を依頼した。管理接続前にproviderやDBを変更しない。

## クラウド反映と実検証

Supabase管理トークンを利用者保存ファイルから読み取り、対象project id/name/statusを確認した。開始時はACTIVE_HEALTHY、publicテーブル・migration履歴・auth.usersはいずれも0件、Google/GitHubは無効でcredentialも未設定。GitHub側の登録完了申告はSupabase設定完了とは異なることを再取得で確認し、利用者が追記した両サービス情報をサービス別の5環境変数名へ整形した。秘密値は出力・記録しない。

共通3migrationを各トランザクションで適用し、Supabase CLI公式と同じmigration履歴構造へ元ファイルのversion/nameを保存・再取得した。プロフィール・スコア・リプレイ・本人ゲーム履歴の4テーブルすべてRLS有効。ローカル管理者seedは導入していない。

両providerを有効化、Email providerを無効化（既存ユーザー0件を事前確認）、Site URLと正確な2callbackを登録。設定の再取得で反映を確認。対象projectのPublishable keyを取得し、前セッション作業コピーのGit対象外.env.localへURLと公開キーだけを保存した。cloudモードで5175のアプリを起動しHTTP200、ローカル管理者APIは提供されないことを確認した。

実DBのトランザクション内だけに検証ユーザー2名を作成し、プロフィール自動生成・role=user、本人だけの読取、本人の表示名保存、他人の更新拒否、admin昇格拒否、保護timestamp更新拒否、匿名読取拒否を検証。ROLLBACK後の検証ユーザー残存0を再取得した。証跡: docs/reviews/auth-cloud-20261010/permissions-check.sql と permissions-check.json。

アプリ型検査・サーバー型検査とbuild成功。全122ファイル1,693テスト成功、失敗0（既存のmaxWorkers2/testTimeout30秒を指定）。既存500kB超bundle警告は継続。アプリ本番ソースの変更はまだない。

実OAuthについて利用者よりGoogleログイン完了申告を受け取ったが、検証用Chromeは準備表示のまま、Supabase auth.users/identitiesも0件だったため実ログイン完了とはまだ判定しない。検証用Chromeの読込と実ログイン先を調査中。タスクは5/7・本体未完了を維持。

### 検証用ブラウザの読み込み復旧

開発サーバーを起動した状態で既存の全体テスト/buildを実行し、共有Vite依存キャッシュとの不整合が発生した。実Chromeのresource一覧でreact/react-dom/jsx-runtimeの504を確認。テスト終了後、自分で起動したcloud-mode ViteのPIDをlistenポートとcommand lineから確認して終了し、`--force` で再起動した。アプリのアカウント画面とGoogle開始ボタンの表示・操作が復旧した。本番コードの修正は不要。利用者へ同じ検証用ChromeでGoogle許可後のアプリ復帰まで確認するよう案内した。

## Google実OAuth受入

利用者が検証用通常Chromeで認証・許可を行い、実Google OAuthのtoken交換HTTP200、本人プロフィールREST HTTP200を観測した。auth.identitiesのgoogle1件と自動生成プロフィールrole=userを実DBから再取得。ブラウザの実セッションをトークン値を表示せずに確認した。

実アカウント画面で表示名を一時的な検証名へ変更・保存し、実DBへ保存されたこと、画面再読込後も保持されたことを確認した。sessionStorageに保持した元の名前へ復元し、保存と再読込後の一致を確認。その後、実ログアウトでセッション削除とゲスト画面へ復帰し、Google再ログインでも同一userの実セッションを確認した。操作中の画面エラー0。証跡: google-acceptance.json、google-profile-save.json、google-profile-persistence.json。

認証済みユーザーの操作とは別に、Publishable keyだけの匿名RESTでprofiles/score_attack_gamesの読取が拒否され、公開scoresの0行問合せは200になることを確認した。秘密値・セッション値・メール・元の表示名は証跡へ保存しない。

Google工程は受入済み。実ログアウト後にGitHub開始ボタンから実OAuthを開始し、利用者のGitHub認証・許可後のアプリ復帰を待っている。全体完了チェックは両provider受入後に更新する。

## 主作業コピーの接続設定

主作業コピー `C:/Users/sunpe/MyProjects/gtr-training` と検証用作業コピーのsrc/server/migration254ファイルが完全一致することを確認した。主作業コピーにも存在しなかったGit対象外.env.localへ同じクラウドURLとPublishable keyを保存した。既存の旧.envと.local/supabase/.envは維持し、通常のlocaldevと明示的なcloudモードの分離を保つ。主作業コピーの本番ソースは変更しない。

## 右上アカウントモーダルへの追加指定

2026-10-10追加指定: ログインとユーザープロフィール設定を右上のアカウントモーダルへまとめる。ヘッダーボタンは未ログイン時「ログイン」、ログイン後は本人表示名を表示。PCではヘッダー直下の右上、スマホでは余白を保つ幅で開く。ゲストのGoogle/GitHub選択、ログイン後の表示名編集・保存・ログアウトを同じ場所で提供する。既存の本人表示名だけの更新権限、Escape/外側クリック/フォーカス復帰/ゲーム停止を維持し、360px幅と実OAuth後の編集を再確認する。

GitHubの最初の許可時はstate期限切れだったが、同じChromeの新しい開始操作で実GitHub OAuthが成功した。現在はGitHub本人のプロフィール保存・復元・再ログインと追加UIの受入を進めている。対象4ソースの開始時内容を一時ディレクトリへ保存した。

追加で、実サービスのstate期限切れが専用markerなしのSite URLへerror/error_code/error_descriptionを返し、既存callback処理がそのエラーを表示しないことを確認した。通常のcodeは専用marker必須を維持し、Supabaseの識別付きエラーをモーダルで表示できるよう限定修正する。期限切れからの新しいGitHub開始は成功済みで、scopeやcredential変更は不要だった。

## GitHubと右上モーダルの受入

GitHubの利用者許可後、最初の帰還はbad_oauth_state（OAuth state has expired）だった。同じChromeから新しい認証要求を開始し、追加のcredential変更なしでGitHub実セッションと本人プロフィールrole=userを確認。表示名保存はUIと実DBで照合し、再読込保持、元の名前へ復元して保存/再読込一致、ログアウトでゲスト、同一ユーザーの再ログインまで成功した。

利用者の追加指定を受け、右上ヘッダーに未ログイン時「ログイン」、ログイン後に本人表示名を表示し、同じモーダルでログインとプロフィール設定を提供する。モーダルをヘッダー下の右上へ配置し、本人表示名編集・保存とログアウトをまとめた。PC1280pxではパネルleft872/top80/right1256、360pxではleft16/top80/right344。横はみ出し0。実画像を個別確認した。Escapeと外側クリックで閉じ、開いたボタンへフォーカス復帰する。Tab/Shift+Tabもモーダル内を循環する。

実際に観測したprovider期限切れは専用auth_callback markerなしでSite URLへ返るため、そのerror/error_codeの組を識別してモーダルに表示し、認証queryだけを除去する修正を加えた。通常のcodeには引き続きmarkerを必要とし、無関係なqueryを消費しない。provider errorでも事前の再現hashを復元する。期限切れURLの再現で実モーダルのエラー表示とquery除去を確認し、通常reloadで既存セッションへ戻した。新規3回帰でこれらを検証する。

今回の変更は本番5ファイルと関連テスト2ファイル。254ファイルの照合で、その他の本番ソースは主作業コピーの開始状態と一致。既存ゲーム物理・推薦・採点・乱数とツモ供給は変更しない。GitHub/モーダルの受入証跡を保存済み、最終全体テストとbuild確認後に外部タスクを完了する。

## 最終ソースの確認

追加変更後の型検査、サーバー型検査、build成功。全122ファイル1,696テスト成功・失敗0（追加3回帰を含む）。主作業フォルダへ開始時ファイルと設定の一致を確認して7ファイルを反映した。主作業フォルダのcloudモードを5175で起動し、実GitHubセッションとプロフィール設定が再読込後も使用できること、360/1280pxで右上モーダルが画面内に収まりエラー0であることを再確認した。既存のbundle警告を記録する。

技術的な受入条件はGoogle/GitHubと追加UIを含めて達成した。Habiticaの全8項目と本体の完了保存・再取得を最後に行う。

## 完了保存の再取得

Habiticaの全8項目と本体の完了を保存し、再取得で8/8・completed=true・完了本文一致を確認した。証跡: ../reviews/auth-cloud-20261010/habitica-completion.json。Google/GitHubと右上モーダルを含む依頼範囲は完了。
