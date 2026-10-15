# クラウド認証・ユーザーDBの実サービス検証

2026-10-10。対象Supabase projectは `fqzvthxzupjjkhpuwvst`。[実施記録](../development/AUTH-CLOUD-COMPLETION-20261010.md)。既存ローカル実装の受入を引き継ぎ、既存の認証・DB実装を引き継ぎ、追加指定の右上モーダルと実サービスで観測した認証失敗の表示だけを変更した。

| 受入項目 | 結果 |
| --- | --- |
| 管理APIから対象projectと初期状態を確認 | 成功、ACTIVE_HEALTHY・初期テーブル/ユーザー/履歴0 |
| 共通3migrationと正規versionの履歴 | 適用・再取得成功 |
| Google/GitHub credentialとprovider設定 | 保存・再取得成功 |
| アプリ復帰URLとEmail provider設定 | 保存・再取得成功、既存ユーザー0でEmail無効化 |
| RLS・本人プロフィール権限・昇格拒否 | 実DB9検証成功、検証ユーザーROLLBACK・残存0 |
| 匿名RESTから本人データを拒否 | profiles/history401、公開scores200 |
| 通常cloudモードでローカル管理者APIを提供しない | HTML fallback、管理者JSON APIなし |
| Googleの実ログインとプロフィール自動生成 | 成功、role=user |
| Googleの表示名保存・再読込・元の名前へ復元 | UIと実DB、再読込で成功 |
| Googleのログアウト・同一ユーザー再ログイン | 成功 |
| GitHubの実ログイン・保存・再読込・復元・ログアウト・再ログイン | 成功、role=user・同一ユーザーを確認 |
| 右上アカウントモーダル | PC/360pxの配置、保存、Escape/外側クリック、Tab循環/フォーカス復帰成功 |
| markerなしで返る認証期限切れエラー | 実観測をもとに表示・query除去・再現hash復元を限定修正 |
| 型検査・サーバー型検査・build | 成功、既存bundle警告あり |
| 全体テスト | 122ファイル1,696テスト成功、失敗0 |

証跡は [auth-cloud-20261010](auth-cloud-20261010/) に保存。秘密値、セッションtoken、メール、元の表示名は証跡へ保存していない。手動のGoogle/GitHub側認証・許可は利用者が操作し、アプリ側の確認とプロフィール保存・復元は通常ChromeのCDPから実画面を操作している。実DBの権限検査はトランザクション内の検証アカウントで行い、全件ROLLBACKした。

全体テストの途中でVite依存キャッシュに504が発生したが、テスト完了後に自分で起動したサーバーを--force再起動し、アプリの表示・OAuth操作を復旧した。本番コードの変更は不要だった。

Habiticaは8/8・本体completed=true・完了本文一致を保存後GETで確認済み。[外部保存確認](auth-cloud-20261010/habitica-completion.json)。主作業フォルダの5175で実GitHubセッション・プロフィール設定の維持を再確認した。
