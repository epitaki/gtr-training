# Auth/DB R2 独立レビュー

対象: `auth-db-r2-snapshot.json`、`4d58835cf4adf97297aa2133c7e810d5d2e55e6be8590d5d720ba1687b454971`。
開始baselineとの差分33ファイル。新規Sol3名（gpt-6-sol、fork none）を利用枠に合わせ順次実行。実装履歴・相互結果・過去指摘を共有していない。
3レビュー終了時に親が278 source + 17 generated = 295 hash不変を確認。

## 結果

- Reviewer 1 `/root/auth_db_r2_review_1`: 全体と周辺を確認。B1 P1: `src/lib/supabase.ts:4`。公開用VITE変数へsecret/service_roleを誤入力すると、runtimeのclient生成拒否より前にViteが秘密値をブラウザコードへ含める。配信/ビルド前の検証が必要。B2 P2: `src/auth/account.ts:25`、`src/auth/useAccount.ts:27`。OAuth callbackと別タブlocal sessionが併存するとlocal profileが優先される。
- Reviewer 2 `/root/auth_db_r2_review_2`: 全体と周辺を確認。B2 P2: `src/auth/useAccount.ts:21`。OAuth待ちの間に別タブでlocal loginしても同じ条件。成功時のidentity切替を明示する。
- Reviewer 3 `/root/auth_db_r2_review_3`: 全体と周辺を確認。B2 P2同上。B3 P2: `src/components/account/AccountDialog.tsx:10`。同じ表示名の別identityへ移ると未保存draftを持ち越し得る。B4 P3: `src/lib/test-connection.ts:12,56`。新SQLで禁止される匿名profiles SELECTと、publishable keyを認めない診断が新契約に合わない。現アプリ呼び出しなし。

## 親の照合

B1: インストール済みViteのbuild置換とdevのimport.meta.env直列化を読取確認。実secretや実.envを使用した再現はしていない。B2のlocal優先分岐を確認。B3はuseAccountがidentityイベントでprofileを一度nullにする点とReactバッチの影響も含め、Astraへ判定を依頼。B4の匿名SELECT/旧keyFormatを確認。

R1のA1〜A4は修正と型3種・全102ファイル1310テスト・build・2タブUI確認済み。実SupabaseのSQL適用/Google/GitHubログインは未検証。

## 判定

Astra `/root/auth_db_r2_acceptance` が実コード・設計・検証・3件を確認し、B1〜B4を採用。P1 1件・P2 2件・P3 1件でR2未受入。295 hash不変、game141変更0をAstraも確認。R1 A1〜A4は修正済みと確認。

- B1: Vite環境変数解決後かつclient変換前にdev/buildを拒否。キーをエラーへ出さない。偽secret/偽service_role JWTの実dev/build拒否と公開key/未設定成功を確認する。実漏洩を確認した指摘ではない。
- B2: callback成功を通常起動/失敗と区別してcloudを採用し、local cookieとの整合をreload後も維持。OAuth開始時だけのlogoutでは遷移中の競合が残る。開始前/遷移中のlocal、成功/失敗/reload/save/logoutを確認。失敗からlocalへの自動切替は追加しない。
- B3: backend+idが変わればdraftを初期化。同一identityの再描画は入力維持。中間nullがcommitされれば問題は解消するため「常に再現」は棄却し、component境界の欠落として採用。実ブラウザ頻度未測定。同名cloud A→B/backend切替とhook+Dialogのbatched更新を確認する。
- B4: 設定/通信/認可を区別する診断へ更新。RLSを緩めない。旧TopMenuには呼出しがあるが現Appから未使用で、現ログイン画面障害ではない。publishable/anon/未設定/正常匿名/通信失敗の回帰を確認する。
