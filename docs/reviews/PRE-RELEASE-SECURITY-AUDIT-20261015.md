# リリース前セキュリティ監査（2026-10-15）

状態: 監査・修正・検証完了。公開作業は別タスクで継続。公開先と本番URLの回答待ちであり、本サイトはまだ公開していない。

## 対象と方法

Windows側の現在の作業コピーを対象に、認証/OAuth、開発専用管理者API、全DB migrationと実クラウドの権限/RLS/関数、画像Storage、共有URL/保存データ、秘密情報、依存関係、本番成果物を確認した。以前からある未コミット変更は維持し、今回開始時点との差分でレビューした。

ソースの確認だけでなく、ロールを切り替える実SQL回帰、開発サーバーへの実HTTP、実クラウドの読み取り専用メタデータ照会・匿名HTTP、production previewと本人の保存履歴を使う実Chromeで検証した。攻撃的な負荷試験や他ユーザーの実データ取得、実ユーザーデータの削除は行っていない。

## 確認した問題と修正

| ID | 優先度・対象 | 確認内容と対応 |
|---|---|---|
| SEC-01 | 高・依存 | 監査開始時に7パッケージ・8勧告。Vitestを修正版4.1.11へ更新して旧mocker/tinypool依存を除去。未使用のHonoを削除。PostCSS selector parserを7.1.6以降、source-map-jsを1.2.2以降に固定した。全監査は残存1件、production依存の監査は0件。残件は下記。 |
| SEC-02 | 中・秘密ファイル | .secrets/.mcp.jsonをGit対象外かつViteの配信拒否対象に追加。.env.*を包括的に除外し.env.exampleだけ許可。実ファイルと/@fs URLの両方で秘密canaryの取得が403になることを回帰で確認した。現在の実秘密ファイルは作業用Ubuntu側にあり、元からGit対象外・モード600だった。漏洩した実秘密値を発見した指摘ではない。 |
| SEC-03 | 中・公開環境変数 | 既存のSupabase管理キー拒否を、OAuthシークレット/管理トークン/ユーザーJWTと秘密値らしい変数名にも拡張。値をエラーに含めずdev/build前に拒否する。公開anon/publishableキーは引き続き許可する。 |
| SEC-04 | 中・旧DB API | 現在の画面で使わないscores/replaysに匿名の公開SELECTと認証済みユーザーの直接INSERTが残っていた。追加migrationでPUBLIC/anon/authenticatedの権限を撤去し、保存データとテーブルを保持した。現在の本人専用score_attack_gamesは維持する。 |
| SEC-05 | 中・画像の保存量 | 画像は1ファイル256KiB制限だけで個数上限がなかった。所有者ごとのトランザクションロックとRLSで最大10オブジェクトに制限。他人の画像で枠を消費できず、削除で枠が戻る。256pxへの再符号化・WebP限定・非公開バケット・本人だけの操作は維持する。 |
| SEC-06 | 低・権限整理 | トリガー専用SECURITY DEFINER関数の直接EXECUTEを一般ロールから撤去した。これらは元から通常のRPCとして呼び出せる関数ではなく、防御を明確にする整理。新規プロフィール作成と本人の表示名更新が引き続き動くことを実SQLで確認した。 |

DB修正は [20261015000000_pre_release_security.sql](../../supabase/migrations/20261015000000_pre_release_security.sql)。型・関連SQLテスト・全テストの成功後に、実Supabaseへトランザクションで適用しmigration履歴へ記録した。適用後の読み取りで保存されたSQLとの完全一致、画像quota関数/ポリシー、旧API権限撤去を確認。既存のプロフィール/スコア/リプレイ/履歴/画像の件数は不変。画像の実同時アップロードを使う負荷試験はしておらず、ロックとVOLATILE関数の設計・実DB定義・SQL境界回帰で確認した。

## ほかに確認した防御

- 実DBで全対象表のRLSが有効。プロフィール・現在の履歴・画像は本人に限定。一般ユーザーはrole/idを変更できず、表示名/画像パスの列だけ更新可能。公開ビューはない。匿名アクセスは、有効な公開キーでAuth settingsの200を確認してから各保護表の401/42501を検証した。StorageスキーマはData APIに公開されていない。
- Google/GitHubのみ有効。メール・電話・匿名サインイン・手動アカウント結合は無効。PKCE、ユーザー取得による本人確認、環境別セッション、callbackのcode/error除去、refresh token rotationを確認した。未検証の本番条件は下記。
- 開発用管理者APIはlocaldevだけ。loopback・Host/Origin・CSRF nonce・固定認証先・転送拒否・previewでの不在を既存の実HTTP回帰で確認した。
- DB関数は空のsearch_path、auth.uid照合、引数検証、保存サイズ/本人100ゲーム上限・直列化を持つ。クライアント申告の点数は本人用記録であり、競技ランキングの不正対策を保証する仕組みではない。
- 表示名/コメント/エラー等はReactのテキスト表示。アプリにdangerouslySetInnerHTMLやevalの入力経路は見つからなかった。共有コードの長さ/版/色/座標/履歴/乱数等の検証、保存手順の上限、画像の種類/入力サイズ/寸法/出力サイズ・再符号化を確認した。
- Git候補・Git全参照のblob・公開成果物を、一般的な秘密値パターンと保存済みの実秘密値との照合で確認。実秘密値の検出0件。ガードの回帰テストとその差分にある明示的なFAKE文字列は合成fixtureとして別記した。秘密値そのものはログ/証跡に保存していない。この検査は未知のあらゆる秘密値を検出する保証ではない。

## 残る勧告と公開前の条件

1. **braces 3.0.3の上流勧告が1件残る。** [勧告GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)には修正版がない。Tailwindのビルド時のmicromatch/chokidar経由だけで使用し、アプリのユーザー入力から呼ぶ経路はない。公開用の193モジュールを検査し、braces/Vitest/tinypool等を含まないことを確認した。ビルドの入力と実行環境を信頼できる範囲に限定し、上流の修正版を追跡する。警告を抑制して0件扱いにはしていない。
2. **公開URLの設定が必要。** 現在のSupabase Site URLとredirect許可先は127.0.0.1/localhostだけ。公開先決定後に本番HTTPS URLと正確なcallback戻り先を登録し、Google/GitHubの実OAuthを確認する。Google側の同意画面がテストユーザー限定でないこと・必要な公開設定も確認する。Google Consoleの公開状態は今回のSupabase APIからは検証していない。
3. **公開ホスト上のHTTP防御は未検証。** HTTPS強制、CSP、frame-ancestors/X-Frame-Options、nosniff、Referrer-Policy、HSTSは公開先に合わせて設定・実HTTP/ブラウザで確認する。ローカルpreviewの成功を公開ホストの検証の代わりにはしていない。
4. **リリースするソースの確定が必要。** 現在の作業コピーには多数の受入済み未コミット変更がある。古いmainのHEADをそのまま公開せず、監査した変更を含む同一commitでCI・DB migration・公開を追跡する。CIの秘密分離と未信頼PRの実行制御もデプロイ作業で確認する。
5. SupabaseのSecurity Advisor APIは403で利用できなかった。実DBへの読み取り専用メタデータ照会でRLS/ACL/関数/ポリシー/バケットを検証したが、公式Advisor実行済みとは扱わない。

画像10件上限に達した場合は不要な本人画像をStorage APIで整理する。旧画像の掃除失敗が積み重なった場合も、参照中のavatar_pathを保護して管理する。監査のために既存画像を自動削除していない。適用済みmigrationは編集せず、変更は追加migrationで行う。

## 検証と証跡

- 全133ファイル・1,793テスト成功。認証/権限/共有/画像/DB等の関連17ファイル・91テストも成功。テストを削減せず、Vitest更新後も全件実行した。
- 本体/サーバー/CLIの型検査と本番build成功。selector parser更新後もCSS/JS成果物の内容は従来のビルドと同じハッシュだった。
- 実Chromeでproduction版のガイド/共有/URLコピー、Codexレポート非表示、例外/保存POST0件を確認。修正後の実クラウド履歴からも練習開始でき、書込0件。

[今回差分](security-audit-20261015/task-changes.patch)・[全テスト](security-audit-20261015/full-tests.json)・[関連テスト](security-audit-20261015/security-tests.json)・[型](security-audit-20261015/type-check.log)・[CLI型](security-audit-20261015/scripts-type-check.log)・[build](security-audit-20261015/build.log)。

[依存変更前](security-audit-20261015/dependencies-before.json)・[変更後](security-audit-20261015/dependencies-after.json)・[production依存](security-audit-20261015/production-dependencies.json)・[braces経路](security-audit-20261015/braces-dependency-path.txt)・[公開モジュール](security-audit-20261015/bundle-module-check.json)。

[秘密値検査](security-audit-20261015/secret-scan.json)・[Git除外](security-audit-20261015/git-secret-exclusions.json)・[実Auth設定](security-audit-20261015/cloud-auth-settings.json)・[変更前DBメタデータ](security-audit-20261015/cloud-db-metadata.json)・[migration適用確認](security-audit-20261015/cloud-migration-verification.json)・[実ACL確認](security-audit-20261015/cloud-acl-verification.json)・[匿名HTTP](security-audit-20261015/cloud-anonymous-access.json)・[本番Chrome](security-audit-20261015/production-browser.json)・[本人履歴のChrome](security-audit-20261015/final-browser.json)。

一次資料: [Vitestの勧告](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)、[Tinypoolの勧告1](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3)、[勧告2](https://github.com/advisories/GHSA-85c8-ppgw-ccpr)、[Honoの勧告](https://github.com/advisories/GHSA-hxh3-vqpv-xpqv)、[selector parserの勧告](https://github.com/advisories/GHSA-rj75-hqrm-r3gf)、[source-map-jsの勧告](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)、[PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)、[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Storageメタデータの扱い](https://supabase.com/docs/guides/storage/schema/design)。
