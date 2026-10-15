# Auth/DB R1 独立レビュー

対象: `auth-db-r1-snapshot.json`、`d169b155e5e90be7acecc102078816b700336a54e24bac7a1305c70fd9565688`。
開始baselineとの差分33ファイル。終了時278 source + 15 generatedの293 hash不変を親が確認。
新規Sol(gpt-6-sol、fork none)を枠の都合で順次3名。実装履歴・相互結果を渡していない。

## Reviewer 1

`/root/auth_db_r1_review_1`。全変更と周辺確認、読取のみ。P2: `sql/initial-setup.sql:2`。新規SQLから旧scores/replaysとRLSがなくなり、旧DB契約を維持していない。ゲームデータ定義を保持すべきとの指摘。

## Reviewer 2

`/root/auth_db_r1_review_2b`。全変更と周辺確認、読取のみ。

- P2: `src/auth/useAccount.ts:75`。8時間期限/サーバー再起動でsession無効後の保存/logoutが403になると、古いprofileをreadyで保持し、再読込までUIから再loginへ戻れない。認証失効では再確認してguestへ戻す。
- P2: `server/localAuth/store.ts:60`。未認証GETで発行するnonceは使用しない限り期限切れが回収されず、再読込やOriginなしGETでMapが増える。期限掃除と上限が必要。

## Reviewer 3

`/root/auth_db_r1_review_3`。全変更と周辺確認、読取のみ。P2: `sql/initial-setup.sql:2`。新規SQLからscores/replays/rankingsとRLS/indexがなくなり、旧DB契約の利用時にテーブル不在になる。維持または別SQLを適用手順へ明示する。

## 親の照合と追加候補

- A1: 新規SQLの定義欠落（Review 1/3を統合）。旧初期SQLに3オブジェクトがあり、今回新規SQLはprofilesだけ。現srcにscores/replaysへのSupabaseクエリはなく、現在動作の不具合と初期DB契約の維持を区別してAstra判定を依頼する。
- A2: 期限切れUI復旧（Review 2）。act catchがprofileを保持しstatus readyにするため指摘の条件が成立。
- A3: nonce蓄積（Review 2）。nonceの発行/Map操作を確認し、不要なnonceが期限だけでは回収されない。
- A4: 親の追加P2候補、`src/auth/account.ts:60`。2つのタブをguestで開き、一方でlocal loginするとcookieは共通だが他方のReact状態はguestのまま。他方のlocalLoginはGET sessionで認証済みsessionのCSRFを取得し、続くPOST loginではloginNonce Mapだけを消費するため403。既存有効profileを利用するか、安全にsession更新を許可する必要がある。静的な経路確認のみ、レビュー固定中の書込を伴う再現は未実施。

## 判定

Astra `/root/auth_db_r1_acceptance`（gpt-6-astra）が実コード/設計/全レビューを確認。293 hash不一致0。A1〜A4の4件P2を採用しSolへ差し戻し。R1未受入。外部Supabase SQL・OAuthは引き続き未確認。

- A1は新規scores/replays、FK/RLS/indexの復元を採用。現ゲーム動作回帰ではなく初期DB契約の欠落。旧公開rankings、username=email、公開profilesの復元は設計に反するため棄却。旧移行のrankings保持+REVOKEを維持。
- A2は認証/CSRF不整合を区別してsession再確認し、失効ならguest、有効ならprofile/CSRF再同期。通常の表示名エラーではprofileを保持。遅い再確認結果の世代チェックも必要。
- A3はnonce期限回収と有限の保持上限、一度使用/期限/退避済み拒否の回帰が必要。
- A4はlocalLogin GETで有効profileを取得済みならその結果へ同期し、session CSRFをlogin nonceとしてPOSTしない。2タブと通常再loginの回帰が必要。

ローカルidentityのbackend/local・固定id/system_admin・role/admin命名は設計同等と確認。上記以外の追加必須修正なし。修正後は必要検証、新規Sol3名、Astra再確認を行う。
