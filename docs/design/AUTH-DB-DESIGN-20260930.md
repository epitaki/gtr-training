# ログイン・ユーザーDB・ローカル管理者

2026-10-10最終状態: クラウドDB・両provider実OAuth・追加指定の右上モーダルを受入完了。Habitica8/8・本体完了。[最終受入](../reviews/AUTH-CLOUD-VALIDATION-20261010.md)。以下の2026-09-30の未完了記録は当時の状態。


日付: 2026-09-30 / 状態: R5ローカル実装受入済み・外部Supabase/OAuth検証待ち。全体は未完了。
Habitica: `8503d097-3ae1-4d72-9bf9-aad9eaff9233`（本体未完了）。関連する未完了todoを検索し該当なしのため登録。

後続実装: [ローカルSupabase移行](../development/LOCAL-SUPABASE-DEVELOPMENT-20260930.md)を別タスク`65f80be6-edc5-4f4e-a6ed-e43393bb3989`として実装・R1受入完了。以下のSQLite/cookie関連仕様はR5時点の履歴で、現在はローカルSupabase Auth/PostgreSQLと標準セッションに統一済み。起動方法は[セットアップ](../development/AUTH-SETUP.md)、移行の受入は[検証記録](../reviews/LOCAL-SUPABASE-VALIDATION-20260930.md)を参照。外部OAuthの設定/実ログインは本タスクの未完了事項として維持する。

## 依頼と受入範囲

Google・GitHubのOAuthをSupabase Authへ委譲し、アプリはパスワードを保存・入力させない。ユーザープロフィールはPostgreSQLに保存する。未設定でもゲストプレイを維持し、外部サービスなしのローカル開発ではこのPCだけで使える管理者アカウントを提供する。

既存Supabaseプロジェクトは長期停止し管理画面から復帰不可。利用者は「引き継ぐデータはない。新しいプロジェクトを使う」と回答済み。旧プロジェクトの削除・復元は実施しない。新規プロジェクト・OAuth設定と実ログイン検証は外部準備が必要で、未完了工程を完了にしない。

範囲はログイン・ログアウト、アカウント表示、本人の表示名変更、DB初期設定と権限、ローカル管理者。ゲーム同期、ユーザー削除、全ユーザー管理画面、マウス操作は今回追加しない。ゲーム物理・採点・推薦・乱数・ツモ・入力仕様は変更しない。

## データと認証

- クラウド: Supabase Auth PKCE、Google/GitHubのみ。`profiles`はid・display_name・avatar_url・role(user/admin)・作成/更新時刻を持つ。メールをプロフィールに複製しない。providerは認証identityから読む。
- 表示名はtrim後1〜50文字。本人のSELECTと表示名UPDATEだけ許可。RLSに加え列単位GRANTを使い、id/role/avatar/時刻の改ざんや直接INSERT/DELETEを拒否。
- 登録triggerはroleをuserに固定し、編集可能なmetadataから権限を得ない。SECURITY DEFINERは固定search_path・完全修飾名。異常metadataを無害化して登録を妨げない。
- 旧`sql/initial-setup.sql`にはemailをusernameへ保存するtriggerと全員閲覧policyがある。新規SQLと移行を安全な契約に合わせる。移行は旧username/統計を維持し、旧公開policy/広い権限を置換、未使用rankingsからの旧email公開も閉じる。利用者データの移行作業自体は不要。
- 設定が欠ける場合はSupabase clientを作らない。公開キーだけを利用しservice_role/秘密鍵をブラウザ設定へ持ち込まない。
- 秘密キーを公開用環境変数へ誤設定した場合はVite側でclient変換・配信前にdev/buildを拒否し、エラーへキー値を出さない。resolved公開変数のtrim後sb_secret_接頭辞とJWT payloadのservice_roleを対象とし、ANON_KEYには公開キー形式も検証する。任意の秘密文字列や埋込みまで検出する保証ではない。通常の公開変数、未設定ゲストとpublishable/anonは許可する。
- callbackは専用query markerで処理しコードを一度だけ交換。認証queryだけ除去し既存再現hashを保持。OAuth前のhashは同一origin sessionStorageへ退避しApp初回読込前に戻す。任意return URLを設けない。
- 認証状態は未設定/ゲスト/処理中/認証済み/失敗を区別し、ログアウト/切替後の古い非同期プロフィール結果を破棄。
- OAuth callback成功時は選択したcloud identityを確定し、開始前または遷移中に別タブで成立したlocal sessionとの整合をreload後も維持する。callback失敗からlocalへの自動切替は行わない。
- 成功callbackは当該タブでcloudを選択する。sessionStorageへの保存成功時は同タブのreload後も選択を維持し、開発環境のlocal終了はCSRF付きでbest effortとする。他タブのlocal利用停止は保証しない。書込失敗時は現在ページの選択を保持し、local終了に失敗した場合はエラーにする。保存不能のまま終了後に別タブが新しくlocal loginし、その後reloadする場合の選択持続には制約が残る。
- 同一identityのtoken更新や繰返しSIGNED_INでは保存結果や未保存draftを失わない。identity切替/ログアウト後の旧結果は破棄し、古いプロフィール読取が後から保存済みの値を上書きしない。
- 接続診断は設定・通信・認可を区別し、保護されたprofilesの匿名SELECTを疎通確認に使わない。公開キーの判定は実client設定と整合させる。

## ローカル管理者

`server/localAuth/`のVite開発専用APIとSQLiteを使用。現環境Node 22.18.0でnode:sqlite実SQL成功をAstraが確認済み（ExperimentalWarningあり）。既存bun run devのVite/Node経路を維持。

- `command=serve && !isPreview`でだけ登録。本番静的配信/previewではAPI・管理者ログイン不可。
- 実listen先・socket peerのloopback判定、実ポートを含む厳密Host照合、転送ヘッダー拒否。公開/LAN bindでは機能無効。DEV/hostnameのクライアント判定だけに頼らない。
- 更新要求は同一Origin・JSON・専用ヘッダー・サーバーCSRF nonce必須。CORS許可なし。小さいbody上限、no-store、SQLパラメーター束縛。
- ランダムsession ID、HttpOnly/SameSite=Strict/host-only/API限定Path cookie。ログイン時更新、期限・ログアウト・再起動で失効。セッションはサーバー管理。
- SQLiteの固定seedはid=`system_admin`、role=`admin`、backend=`local`の組でローカル専用管理者を表す。要求bodyでid/role等は受け付けない。表示名だけ編集可。クラウドJWTやクラウド管理者へ昇格しない。OAuth障害からの自動切替なし。
- `.local/`にDB、gitignoreとVite配信deny。通常URLと/@fs/経由で漏れないことを検証。
- identityはbackendとidの組で識別。Supabase側backend値は`cloud`、SQLite側は`local`。ローカルとクラウドを混同しない。

## UI

既存ヘッダー右の準備中アイコンをアカウントボタンへ置換。既存8bit配色・枠・44px操作領域・focus表示を維持する。アカウント画面にGoogle/GitHubログイン、設定不足時の説明、ローカル専用管理者ログイン、ログイン後の表示名と保存/ログアウトを表示。本人が選べない権限設定や実装詳細は通常UIへ混ぜない。

アカウント画面を開いている間は既存suspended契約でゲーム入力を止める。閉じる/Escape/フォーカス移動を実装。OAuthでページを離れる際はプレイ途中の状態が失われることを簡潔に案内する。

表示名の編集途中の値はbackend+idへ結び付け、別identityへ切り替われば同じ表示名でも初期化する。同一identityの通常再描画では入力を維持する。保存中は入力を無効にし、成功後に保存名を反映して再編集できる。失敗後は入力を戻しdraftを保持する。

## 所有と開始時点

- Astra設計: `/root/auth_db_design` (gpt-6-astra)、アプリ編集なし。
- Sol実装: アプリ/auth/account/layout接続/lib/server/SQL/設定/関連テストを一人で所有。親はdocs・Habitica・snapshot・検証調整。
- baseline: `docs/reviews/auth-db-baseline-20260930.json`。258ファイルを一時フォルダーへコピー。既存dirty変更を保護しHEAD差分を今回変更とみなさない。
- 開始時src/publicは直前の受入済みarrow-scroll snapshotと完全一致。基本検証結果を再利用: type-check成功、92ファイル/1278テスト成功、build成功。既存bundle500kB警告あり。

## 検証と完了条件

1. type-check/test/buildとserver型検査。CLI変更ならtype-check:scripts。
2. SQLite実DBのseed・永続化・再起動後プロフィール維持/セッション失効。偽cookie/期限切れ/未認証/role改ざん/CSRF/Origin/Host/peer/公開bindの拒否。
3. 実PostgreSQL実行系で新規/旧SQL移行・本人/他人/匿名/RLS/列権限/不正metadataを検証。DockerなしのPGlite利用可、実Supabase検証とは区別。
4. OAuth callback成功/失敗/二重実行/hash保持、非同期競合、未設定ゲスト動作。
5. ブラウザでローカルログイン/表示名編集/ログアウト/ゲーム中断を確認。本番preview/API遮断/SQLite配信遮断を確認。
6. sourceと生成物を固定し新規Sol3人の独立レビュー、Astraが実コード・全レビュー・検証を確認。確認済み指摘はSol修正後に新規3人で再レビュー。
7. 外部OAuthの実ログインは新規Supabaseとprovider設定後に実行。未実施なら残件としてHabiticaに保持し全体完了にしない。

## 公式資料

- [Supabaseユーザー管理](https://supabase.com/docs/guides/auth/managing-user-data)
- [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [停止プロジェクトの復元期限](https://supabase.com/docs/guides/platform/upgrading#time-limits)

## 進捗

2026-09-30: Astra設計、Sol実装、毎回新規Sol3人の独立レビューとAstra確認を5ラウンド実施。R5で確認済み必須修正0、ローカル受入完了。型3種・105ファイル1332テスト・build成功、ゲーム141ファイル変更0。利用者が新規Supabaseプロジェクト `fqzvthxzupjjkhpuwvst` を作成。公開キー・SQL適用・provider設定・実ログイン確認は未完了。[最終判定](../reviews/auth-db-r5-review.md)／[検証](../reviews/AUTH-VALIDATION-20260930.md)。

新規初期SQLにも既存scores/replaysの構造・RLS・indexを保持する。旧公開rankings/profileは復元しない。local失効/CSRF不整合はsession再確認で復旧し、2タブ共有cookieでは取得済みprofileへ同期する。login nonceは期限回収と有限上限を持つ。

外部接続追記: 公開キー受領・.env.local反映・Auth HTTP 200確認済み。開発サーバーにも反映済み。公開settingsはGoogle/GitHub未有効、Email有効。profilesは404/PGRST205。DB初期SQLとprovider設定・実ログインは管理画面での作業待ち。実装の受入状態は維持する。

## 2026-10-10 右上アカウントモーダル

ログインと本人の表示名編集・保存・ログアウトを右上モーダルへ統合。未ログイン時はヘッダーに「ログイン」、ログイン後は表示名を表示。PC/360pxの配置・Escape/外側クリック・Tab循環とフォーカス復帰を確認。provider失敗がmarkerなしで帰る場合のエラー表示と再現hash保持も修正した。

## 2026-10-15 リリース前の権限制限

旧scores/replaysの公開SELECT/直接INSERTを一般ロールから撤去し、データを保持した。トリガー関数の直接EXECUTEも撤去。現在の本人用履歴RPC/RLSは維持する。画像は既存256KiB/本人専用/WebP制約に加え、所有者別ロックを用いた最大10オブジェクトのRLSを追加。共通migrationは20261015000000_pre_release_security、実クラウドへ適用・再取得確認済み。過去の公開テーブル契約については本節を優先する。[監査](../reviews/PRE-RELEASE-SECURITY-AUDIT-20261015.md)。
