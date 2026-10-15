# 認証・DB検証記録

状態: R3の保存競合と検証不足を修正・検証済み。R4独立レビューとAstra受入待ち。
設計: [AUTH-DB-DESIGN-20260930.md](../design/AUTH-DB-DESIGN-20260930.md)

## 開始時点

`docs/reviews/auth-db-baseline-20260930.json`の258ファイルを保存。src/publicは直前受入済みarrow-scroll最終snapshotと変更0。
開始時検証として直前のtype-check成功、92ファイル/1278テスト成功、build成功を再利用。既存の500kB bundle警告を区別する。

## 先行ブラウザ確認

Codex内ブラウザ、確認用tab10、`http://127.0.0.1:5175/`。利用者の既存tab5は直接操作していない。

- 未設定状態でゲストのホームが表示される。
- ヘッダーからアカウント画面を開き、ローカル管理者でログインできる。
- 表示名を「開発確認用」へ変更し、ページ再読み込み後も表示名とログイン状態が維持された。
- 確認後の表示名は「システム管理者」へ復元し、ログアウトでゲストへ戻った。
- modal初期Shift+Tabは末尾ボタンへ移動。保存時に一時的にfocusがbodyへ落ちても、次Tabでmodal先頭へ戻る。
- Escapeで閉じるとヘッダーのアカウントボタンへfocusが戻る。
- ガイド練習中のmodal表示では、時間経過とDown/Up/Z操作を行っても組の盤面内位置・向きが変わらず停止を確認。背後ページは矢印キーでスクロールしたため、背景スクロール固定の修正後に再確認する。
- 開発中のVite設定・依存変更によるHMR/reloadが一度発生。最終コードでゲーム切替と一時停止を再確認する。

追加修正後の再確認:

- ページ更新なしのローカルlogin→logout→loginが成功し、最後はlogout済み。
- modal表示中、Downを2回押してもscrollTopは0のまま、body overflowはhidden。閉じると元の空値へ復帰。
- スコアアタック中のmodal表示では、Down/Up/Zと時間経過の前後スクリーンショットで盤面・組位置が一致。閉じるとcanvasへfocusが戻る。
- 通常ホームではEscapeでヘッダーのアカウントボタンへ戻る。
- 確認用tab10を閉じた。viewportの変更は実施していない。

## 外部接続

利用者が新規Supabase `fqzvthxzupjjkhpuwvst` を作成済み。公開キー・SQL適用・Google/GitHub設定・実ログインは未完了。
Codex内でダッシュボードURLを確認したところサインイン画面へ移動したため、こちらから管理設定を取得できなかった。確認用Supabase tab9は閉じた。

## 最終検証・レビュー

R1の新規Sol3名による独立レビューとAstra確認は完了。確認済み4件の修正と再検証をSolが完了し、編集停止済み。

実装途中の全件確認: `bun run test --maxWorkers=2`で98ファイル/1289テスト成功、95.86秒。front/scripts/serverの型検査とbuild成功（既存500kB警告）。最初の既定並列実行では1280成功/9タイムアウト（既存重いbenchmark8件、PGlite1件）が発生したため、ゲーム実装と既存時間制限を変更せずワーカー数を2に制限して同一全件を確認した。最終変更後の結果は別途追記する。

親が開始baselineと比較し、`src/game/`141ファイルの変更0を確認。

R1検証（Sol、親が`.local/auth-validation-20260930.txt`を確認）:

- `bun run test --maxWorkers=2 --reporter=dot`: 102ファイル/1304テスト成功、96.86秒。その後`src/auth/account.test.ts`の型castとArray.at→popだけを修正し、同ファイル1テスト再確認成功。
- `bun run type-check`、`bun run type-check:server`、`bun run type-check:scripts`: 成功。
- `bun run build`: 成功。既存500kB警告とNode SQLite ExperimentalWarning。
- SQLite実DB永続化/再起動失効/8時間期限、HTTP API、CSRF/Origin/Host/peer/public bind/preview/DBファイル遮断、PGlite新規/旧移行、OAuth callback/query/hash/一度交換、React状態競合と実DOMを含む。
- 途中で新規期限テストの時間進行を8時間未満に設定したテスト側ミスが1件あり、修正後の全件成功に含む。既存ゲームの実装や時間制限は変更していない。

外部SupabaseのSQL適用とGoogle/GitHubログインは未検証として残す。

R1独立レビュー: 新規Sol3名とAstraでP2 4件を確認して修正へ差戻し。R1コード未受入。指摘と部分棄却は [R1判定](auth-db-r1-review.md)。293 source/generated hashの不一致0。

## R2検証

Sol実行ログ`.local/auth-validation-r2-20260930.txt`を親が確認。型3種成功、全102ファイル/1310テスト成功（maxWorkers=2、121.08秒）、build成功。既存chunk警告とSQLite ExperimentalWarningのみ。PGliteによるscores/replays契約、失効/CSRF再確認、nonce期限掃除と256件上限、別タブ既存session同期を含む。

親のCodex内ブラウザ確認（tab11/12、ユーザーtab5は直接操作せず）:

- 2タブをguestで開始し、Aでlogin後にBのloginも成功。Bから表示名を保存できた。
- 表示名を「システム管理者」に復元。Bでlogout後、古い認証表示のAで保存するとguestに戻り、再loginボタンが表示された。
- Aでページを再読込せずlogin成功し、最後にlogout。両確認タブを閉じた。
- `src/game/`141ファイルは開始baselineと変更0。

R2の新規Sol3人とAstra確認でB1〜B4（P1 1件/P2 2件/P3 1件）を採用し差し戻し。295 hash不一致0、R1 A1〜A4は解消済み。詳細 [R2判定](auth-db-r2-review.md)。実Supabaseの設定とOAuth確認は引き続き未完了。

## R3検証

Solの`.local/auth-validation-r3-20260930.txt`を親が確認。型3種成功、全105ファイル/1324テスト成功（maxWorkers=2、107.56秒）、build成功（server型検査も含む）。既存chunk警告とSQLite ExperimentalWarningのみ。

- 偽secret/偽service_role JWTによる実dev/buildの配信前拒否。実devはpublishable/anon/未設定、成功buildはpublishable/未設定を確認。anon実buildはこの時点では未実施で、Solログの過大な表現を訂正する。
- OAuth開始前/遷移中のlocal cookie、成功callbackのcloud選択とlocal終了試行、失敗時の非昇格、reload/save/logoutを回帰確認。
- 親が固定前に見つけたsessionStorageの読取可/書込失敗時の選択消失も修正。現在ページの明示選択を優先する。選択保存成功時はlocal終了best effortで他タブ停止を保証せず、保存失敗+終了失敗はエラー。保存不能のまま終了後に別タブが新規local loginし、元タブをreloadした場合には選択持続の制約が残る。
- 同名別identityのdraft、backend切替、同一identity再描画、hook+Dialogのbatched更新を確認。
- 接続診断は公開Auth healthを使い、設定/通信/認可/サービス応答を区別。
- 親のCodex内tab13でguest→local login→reload後の管理者保持→保存→logoutを確認。最後はguest、表示名「システム管理者」、確認タブを閉じた。ユーザーtab5は直接操作していない。
- 親が`src/game/`141ファイルと開始baselineの変更0を再確認。

R3新規Sol3名とAstraでC2 P2保存競合を採用、C1機能要求を棄却して契約訂正C1-Dと拒否分岐回帰、anon実build不足V1を差し戻し。367 hash不一致0。詳細 [R3判定](auth-db-r3-review.md)。実Supabase SQLとGoogle/GitHubの実ログインは依然未検証。

## R4検証

Solは`src/auth/useAccount.ts`と同test、`server/publicEnvGuard.test.ts`の3ファイルを修正。親が`.local/auth-validation-r4-20260930.txt`の実行結果を確認。

- type-check / type-check:server / type-check:scripts成功。
- 全105ファイル/1329テスト成功（maxWorkers=2、111.53秒）。build成功（7.70秒）。既存chunk/SQLite警告。
- useAccount対象19件に、同identity TOKEN_REFRESHED/繰返しSIGNED_INと保存の前後順、未保存draft、別identity/logout/local切替の遅延結果破棄を含む。
- 選択保存成功+local cleanup拒否のcloud/reload/save/logoutと、保存失敗+cleanup拒否のprofileなし/errorを確認。
- 偽publishable/偽anon/未設定の実devとbuild成功をすべて確認。anonの生成物出力もログで確認し、V1を補完。secret/service拒否の回帰も継続。
- 親がgame141ファイルのbaselineとの差0を確認。画面構成は今回変更せず、R3の実画面確認と最新hook+Dialogの自動検証を使用。

R4の新規Sol3名の独立レビューを完了。親が434 source/generated hash不変を確認し、Astraへ実コードと3件の判定を依頼。保存中の追加入力D1と公開環境変数guard範囲D2が候補で、採否待ち。詳細 [R4レビュー](auth-db-r4-review.md)。外部Supabase/OAuthの未検証は維持。

AstraがD2 P1とD1 P2を採用。Solが最小修正を実施し、次の検証後に編集停止した。

## R5検証

変更はvite.config.ts、server/publicEnvGuard.test.ts、AccountDialog.tsx、useAccount.test.tsxの4ファイル。親が実行ログ`.local/auth-validation-r5-20260930.txt`を確認。

- 型3種成功、全105ファイル1332テスト成功（maxWorkers=2、111.45秒）、build成功。既存chunk/SQLite警告のみ。
- 対象回帰24件: 別名の公開変数にある偽sb_secret/service_roleを実dev/build前に拒否し、値をエラーへ出さない。通常公開変数とpublishable/anon/未設定のdev/build成功を維持。
- cloud/localのhook+Dialogで、保存中入力disabled、成功後の保存名と再編集、失敗後の入力復帰とdraft保持を確認。既存同一identity更新と別identity切替の回帰も成功。
- game141ファイルの開始baselineとの差0。画面構成は同じで入力disabledのみのため、R3実画面確認と今回のDOM統合回帰を使用。

新しい固定スナップショットで新規Sol3名とAstraの確認を実施する。実Supabase SQL・Google/GitHubの実ログインは公開キーと外部設定待ち。

## R5ローカル受入・残件

新規Sol3人は全体を独立読取確認し、2人は指摘なし、1人が旧DB移行の保存値の前後空白についてE1 P3を提案。Astraが実コードと仕様を照合し、trim後1〜50文字を満たし今回の新規DB経路ではないため必須修正には不採用。差は改善候補として記録する。D2/D1は解消、追加指摘なし、確認済み必須修正0でローカル実装受入完了。

固定ID `72a8b42be104efa4926a3b835d3856f47fbeb01b259171cfcbdeddd91039b23f`。3レビュー後とAstra確認で534 hash不変。受入後は設計/セットアップの状態表示と本記録・進捗のみ更新し、機能仕様・app/tests/config/SQL・生成物は変更していない。詳細 [R5レビューと最終判定](auth-db-r5-review.md)。Astra/Sol分業は5ラウンド完了。

外部の公開キー設定、初期SQL適用、権限確認、Google/GitHub両方の実ログイン/再ログイン/プロフィール変更/ログアウトは未実施。全体完了とは扱わない。

Habitica `8503d097-3ae1-4d72-9bf9-aad9eaff9233`へローカル受入と残件を保存し、GETで本文一致・チェック1〜5完了・6/7未完了・本体未完了を確認済み。チェック7は外部検証後の全体最終記録として残す。認証情報をリポジトリへ保存せず、コミット/push/公開は実施していない。

## 公開接続設定の再開

利用者から新規プロジェクトのPublishable keyを受領。R5受入済みアプリは変更せず、git対象外の.env.localへの設定と実サービスの疎通・設定状態確認を行う。実キーは本文やコミット対象へ記録しない。外部SQLとOAuthは結果確認まで未完了。

確認結果:

- Markdownのエスケープを除いた公開キーと新規project URLを.env.localに保存。git check-ignoreで追跡対象外を確認。キー値は記録へ出力していない。
- Auth health: HTTP 200。公開キーを使った接続成功。
- [公式の公開settings API](https://github.com/supabase/auth/blob/master/internal/api/settings.go): HTTP 200、google=false/github=false/email=true。
- REST profilesのselect=id&limit=0: HTTP 404/PGRST205。schema cacheに対象表が見つからない応答であり、RLSの受入確認ではない。初期SQL適用が必要。
- 既存開発サーバー5175が設定を自動反映。配信済みSupabaseモジュール内の接続先と公開キーの一致を値非出力で確認、HTTP 200。手動再起動は不要だった。
- app/tests/config/SQLの実装変更なし。設定反映と読取疎通に限り、新しい全テストやレビューは起動していない。直前R5受入は維持。

残件は管理画面での初期SQL適用・DB権限確認、Google/GitHub設定、Email provider無効化、callback許可設定、両providerの実ログイン一式。公開キーには管理操作の権限がなく、管理画面のログイン済みセッションもこちらでは利用できないため、SQL Editorで実行するファイルをCodex右側へ開いて引き継ぐ。

この接続確認の結果と残件をHabiticaへ保存し、再取得で本文一致・チェック5/7・本体未完了を確認済み。SQLファイル表示の要求はCodex側でqueuedとなり、表示対象タスクが開かれた際に反映される。
