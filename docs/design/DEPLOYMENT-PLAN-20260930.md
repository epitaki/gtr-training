# CI連動デプロイの後続計画

状態: 別タスク登録済み、実装未着手。先行するローカルSupabase移行は実装・R1受入完了。2026-09-30に利用者の指示で一度作業を終了し、本タスクは次回以降の指示待ち。
Habitica: `8ced9e6b-9aa8-46f3-b3d6-3e949b0278da`（優先度: 高、本体未完了）。
関連: [ローカルSupabase移行](../development/LOCAL-SUPABASE-DEVELOPMENT-20260930.md)、認証タスク`8503d097-3ae1-4d72-9bf9-aad9eaff9233`。

## 方針

- PR作成/更新では型・テスト・build・DB migrationの検証を実施する。
- mainへマージされた当該commitのCI成功を本番デプロイのトリガーとする。
- 本番は後方互換のDB migration成功後にアプリを公開する。失敗時は公開しない。二つの独立した自動公開機能が順不同に動かないよう統合する。
- ローカル管理者の初期化/昇格・開発seedは本番に適用しない。
- 同一commitの追跡、並行/重複公開の制御、環境ごとの秘密情報分離、公開後の疎通確認と失敗時の復旧手順を用意する。
- 列削除などの破壊的DB変更は、旧アプリが依存しなくなった後の別段階とする。

## 実装前に決める項目

公開先サービス、GitHubの環境・branch保護と利用可能な認証方式、staging/previewの必要性を確認する。今回workflow作成・secret登録・本番DB変更・公開は行わない。

## 完了条件

CI失敗時の非公開、同一commitでのDB→アプリ順序、秘密分離、競合制御、疎通/復旧を検証する。実装時はAstra設計・Sol実装・新規Sol3名独立レビュー・Astra受入を行い、docs/Habiticaを更新・再取得確認する。

登録後にGETで本文一致・本体未完了を確認済み。

参考: [Supabaseの環境管理とCI/CD](https://supabase.com/docs/guides/deployment/managing-environments)

## 2026-10-15 再開とセキュリティ監査

利用者からリリース着手と、その前の全体セキュリティ確認を依頼された。監査・修正・全1,793テスト/型/build/実DB/実HTTP/Chrome確認を完了し、20261015000000_pre_release_securityをクラウドへ適用した。旧APIの一般権限を閉じ、画像数を最大10件に制限。公開はまだ行っていない。公開先/ドメインの回答待ち。

公開前に本番HTTPS URLとSupabaseの正確な戻り先、Googleの同意画面の公開状態、HTTPS/CSP等の実配信ヘッダー、監査済み作業コピーを含む同一commitのCI/DB/公開順序を確認する。bracesのビルド専用未修正勧告1件は上流を追跡する。新しい作業は現行AGENTS.mdの運用に従い、旧モデル分業の記述を必須としない。[監査報告](../reviews/PRE-RELEASE-SECURITY-AUDIT-20261015.md)。

## 2026-10-15 push・リリース指示

利用者がpushとリリースを明示指示。GitHubの管理/push権限とremote main=0ff8cc9を確認。監査済み作業コピーの既存変更をまとめてコミットする。秘密値、ローカル個人設定、生成キャッシュを含めない。公開先は未設定のため確認中。型/テスト/buildの監査時成功記録を保持し、公開設定変更に必要な再検証を行う。クラウドDBの監査migrationは適用済み。公開設定・本番URL・戻り先・疎通・CI連動は完了後に記録する。

### CIの先行実装

公開先の回答待ちの間に、pull_request/main push/workflow_dispatchの検証CIを追加。contents:read、checkout認証保持なし、第三者Actionは確認済みの完全SHA固定。Bun 1.4.0/frozen lockfileで型、CLI型、全テスト（SQL/RLSのPGliteを含む）、buildを順に実行する。mainのdist成果物を当該commit名で7日保持する。PRへ管理秘密値は渡さず、公開用Supabase URL/anon keyはrepository variablesで設定する。DB→本番公開jobは公開先確定後に追加する。
