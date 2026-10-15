# Auth/DB R4 独立レビュー

対象: `auth-db-r4-snapshot.json`、`0e0f29112d6b9854bd32d376fc71da92ac342aa357ab777ea4bc624223be8d3f`。
開始baselineとの差分39ファイル。新規Sol3名（gpt-6-sol、fork none）を順次実行し、実装履歴・相互結果・過去指摘を共有せず読取のみで確認。
3レビュー終了時、親が283 source + 151 generated = 434 hash不変を確認。

## 結果

- Reviewer 1 `/root/auth_db_r4_review_1`: 対象全体・周辺を確認。D1 P2: `src/components/account/AccountDialog.tsx:12`。表示名Aの保存中に入力欄でBへ編集でき、保存Aの成功でdisplay_name依存effectがBを消す。D2 P1: `vite.config.ts:9`。ANON_KEYのみ検査するため、別のVITE_変数に設定されたSupabase secret/service_roleはdevで公開される。
- Reviewer 2 `/root/auth_db_r4_review_2b`: 対象全体・周辺を確認。D1 P2同上。保存中入力を無効にするか新しいdraftを維持する必要がある。
- Reviewer 3 `/root/auth_db_r4_review_3`: 対象全体・周辺、旧SQLとゲーム停止呼出し元を確認。指摘なし。

Reviewer 2の最初の起動はagent thread limitで失敗し、1回のfresh retryで完了。実際のレビューは上記3人。書込を伴う検証・ブラウザ操作はレビュー中に行っていない。

## 親の照合

D1はinputにloading時のdisableがなく、profile.display_name変更で無条件draft同期するため具体的に成立。D2はVite devがconfig.envをすべてimport.meta.envへserializeする経路で成立。ただし元のB1は文書化したANON_KEYの誤設定が中心であり、任意名の公開変数への対策を今回の必須範囲とするかAstraが判定する。既知のSupabase秘密キー形状と任意の秘密情報の検出保証は区別する。

Reviewer 1はcloud表示中からlocal login失敗時に旧profileが残る候補も調べたが、現在UIでその経路を選べないため自身で撤回。最終指摘に含めない。

検証: 型3種、105ファイル1329テスト（maxWorkers=2）、build成功。実Supabase SQL適用・Google/GitHub OAuthは公開キーと外部設定待ち。

## Astra判定

`/root/auth_db_r4_acceptance`（gpt-6-astra）が実コード・設計・検証ログ・3件を確認。434 hash不変、game141差0。R4未受入、D2 P1とD1 P2を採用。R3 C2/C1-D/V1は解消済み。

- D2: 既存設計の公開用環境変数の秘密キー拒否契約として採用。resolved env全体のtrim後sb_secret_接頭辞、JWT payloadのrole=service_roleのみを検出しdev/buildを拒否する。ANON_KEY固有の公開キー検証は維持。通常公開変数は拒否しない。任意秘密・埋込み文字列・ソース直書き検出保証は要求しない。有効ANON_KEY+別名VITE_変数の両種秘密キーで実dev/build拒否・値非出力と通常設定成功を回帰確認。
- D1: loading中inputのdisabledだけで十分。draft revision追加は不要。cloud/localのhook+Dialogで遅延保存中の無効化、成功後の値と再編集、失敗後の入力復帰とdraft保持を検証。既存identity回帰は維持。

Sol修正・検証後、新しいスナップショットで新規Sol3件とAstra受入を行う。外部設定と実ログインの未完了は維持。
