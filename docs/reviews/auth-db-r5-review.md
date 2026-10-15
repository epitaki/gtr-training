# Auth/DB R5 独立レビュー

対象: `auth-db-r5-snapshot.json`、`72a8b42be104efa4926a3b835d3856f47fbeb01b259171cfcbdeddd91039b23f`。
開始baselineとの差分39ファイル。新規Sol3名（gpt-6-sol、fork none）を順次実行し、実装履歴・相互結果・過去指摘を共有せず読取のみで確認。
3レビュー終了時、親が283 source + 251 generated = 534 hash不変を確認。

## 結果

- Reviewer 1 `/root/auth_db_r5_review_1`: 全体とcaller/tests/設定を確認。指摘なし。
- Reviewer 2 `/root/auth_db_r5_review_2`: 全体とcaller/UI/API/SQL/テストを確認。指摘なし。
- Reviewer 3 `/root/auth_db_r5_review_3`: 全体とcaller/tests/設定を確認。E1 P3: `sql/migrate-legacy-profiles.sql:15`。移行SQLはchar_length(btrim(display_name))だけを検証し、本人API更新で前後空白を含む保存値が51文字以上でも許可する。新規SQLのdisplay_name=btrim(display_name)制約と揃えるよう、既存値正規化・同制約・移行本人UPDATE回帰を提案。

## 親の照合

旧移行SQLはtrim後長さだけ、新規SQLは正規化済み文字列の一致と長さを検査する差が存在。アプリからの更新はtrimされるため、E1は移行済み旧DBへ本人が直接API更新した場合に成立する。ユーザーが選んだ新規プロジェクトにはこの経路を使用しない。仕様の「trim後1〜50文字」が保存文字列の正規化まで含むか、提供する移行の一致を今回の必須修正とするかAstraが判定する。

検証: 型3種、105ファイル1332テスト（maxWorkers=2、111.45秒）、build7.81秒成功。D2/D1の対象回帰24件成功。実Supabase SQL・両OAuth未検証。

## Astra最終判定

`/root/auth_db_r5_acceptance`（gpt-6-astra）が設計・実コード・検証ログ・3レビューを確認。534 hash不一致0、game141差0を再確認。**R5ローカル実装受入可、確認済み必須修正0件。全体は外部検証待ちで未完了。**

- E1は必須修正として不採用。旧移行の保存値に前後空白を許す差は実在するが、設計のtrim後1〜50文字を満たす。本人以外の読取/更新や権限変更に至らず、アプリ更新はtrim済み。今回使う新規DBは正規化制約を使用する。旧移行の保存形式統一は任意の改善候補として記録に留める。
- D2解消: resolved公開変数全体の既知秘密キー検出、ANON固有検証、値非出力と実dev/build回帰を確認。
- D1解消: 保存中disabledとcloud/localの成功/失敗後の入力復帰を確認。
- 追加具体的指摘なし。RLS/列権限/role固定、local接続元・CSRF・session境界、認証競合、guest、ゲーム停止の接続を確認。

5ラウンドでR1〜R4の確認済み指摘を修正し、R5の独立Sol3件とAstraで局所受入。過去の不採用候補は各ラウンド記録に保持する。以降は完了状態の文書・Habitica更新のみで、受入済みapp/tests/config/SQL・生成物は変更しない。

外部残件: 公開キー設定、新規Supabaseへの初期SQL適用・権限確認、Google/GitHub各々の実ログイン/再ログイン/プロフィール変更/ログアウト。既存chunk警告とSQLite ExperimentalWarning、sessionStorage保存不能時の既知の選択持続制約は維持。

Habiticaへ本文とチェック1〜5完了を保存、GETで一致を確認。本体・外部設定6・全体最終記録7は未完了。設計/セットアップの受入状態表示と検証/進捗の記録だけを受入後に更新した。
