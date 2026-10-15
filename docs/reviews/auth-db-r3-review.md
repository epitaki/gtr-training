# Auth/DB R3 独立レビュー

対象: `auth-db-r3-snapshot.json`、`26cc828a8d7765821bf93b6967b2fb8bd60bc10bfc3b903bb6c70a325b4448e5`。
開始baselineとの差分39ファイル。新規Sol3名（gpt-6-sol、fork none）を順次実行し、実装履歴・相互結果・過去指摘を共有せず読取のみで確認。
3レビュー終了時、親が283 source + 84 generated = 367 hash不変を確認。

## 結果

- Reviewer 1 `/root/auth_db_r3_review_1`: 全体・周辺を確認。C1 P2: `src/auth/useAccount.ts:25`。cloud選択を保存できる場合はlocal終了失敗を無視し、cookieが有効なまま別タブで利用できる。終了未確認時の再試行/表示を求める。
- Reviewer 2 `/root/auth_db_r3_review_2`: 全体・周辺を確認。C1 P2同上（27行）。
- Reviewer 3 `/root/auth_db_r3_review_3`: 全体・周辺を確認。C1 P2同上。C2 P2: `src/auth/useAccount.ts:55`。cloud保存中に同一ユーザーのTOKEN_REFRESHEDがgenerationを進めて旧profileを取得すると、後から成功した保存結果が捨てられて旧表示名が残る。同一identityのtoken更新と切替を分ける回帰が必要。

## 親の照合・検証留保

C1の例外無視の経路は成立。ただしR2 AstraのB2契約は「local終了または明示的backend選択をreload後も整合」と両方式を認めていた。現実装はcloud選択を保存できる場合にlocal終了をbest effortとする。親が更新した設計とreview依頼はlocal終了を無条件のように表現しているため、元の受入条件と強すぎる説明を区別してAstraへ判定を依頼する。

C2はTOKEN_REFRESHEDもgenerationを増やす現分岐で成立する。

検証記録の補足: `server/publicEnvGuard.test.ts`の実devはpublishable/anon/未設定を確認するが、成功buildはpublishable/未設定の2ケース。anonの実buildは独立の呼出しがなく、Solログの広い表現をそのまま実行済みとみなさない。失敗buildは偽secret/偽service_roleを確認済み。

## 判定

Astra `/root/auth_db_r3_acceptance` が実コード・設計・3件を確認。367 hash不一致0、game141差0。R3未受入。C2 P2の機能修正1件、C1-D P3の文書訂正と分岐検証、V1の検証追加をSol/親へ差し戻し。

- C2採用: 同一identityのTOKEN_REFRESHED/繰返しSIGNED_INとidentity切替を区別する。遅い旧profileが保存成功の前/後どちらに戻っても旧値で上書きしない。A→B/cloud→local/logoutの世代破棄を維持し、hook+Dialogの未保存draftも同一identity更新で維持する。
- C1の機能修正要求は棄却: 元のR2契約は同タブcloud選択とreload整合で、全タブ/両backendの排他ではない。選択保存成功時はlocal終了best effortでよく、他タブのlocal停止は保証しない。保存失敗時は現ページ選択を保持し、local終了失敗をエラーにする。C1-Dとして設計/検証の過度な無条件表現を訂正。保存成功+cleanup拒否→cloud/reload/save/logout、保存失敗+cleanup拒否→profileなし/errorの回帰を追加する。
- V1採用: 偽anonによる実buildと生成物確認を追加し、テスト名/記録を実施ケースへ合わせる。

105ファイル1324テスト・型3種・build・ローカルUIは成功。実SupabaseのSQL適用・OAuthは未検証。必要修正と検証後、新規Sol3名とAstraで再確認する。
