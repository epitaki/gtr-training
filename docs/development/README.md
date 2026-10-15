# 開発資料一覧

[文書総合案内に戻る](../README.md)

開発方針、初期アーキテクチャ、文書整理の設計と移動対応表です。現行の依存方向は [PROJECT-STRUCTURE.md](../PROJECT-STRUCTURE.md) を参照してください。

日付は文書・記録の対象時点です。分類や保存場所だけで実装・受入完了を意味しません。

## テストの実行

- `bun run test`：すべての回帰テスト。変更を完了する前はこの全件実行を確認する。
- `bun run test:quick`：長期プレイと実Viteの公開環境検証を除く通常確認。
- `bun run test:slow`：上記2ファイルの重い検証。quickだけでは全件確認にならない。

区分と整理の根拠は [テストの品質整理](../design/TEST-SUITE-QUALITY-20261004.md) を参照。

## 資料

| 文書・データ | 内容 | 対象時点 |
|---|---|---|
| [TEST-SUITE-QUALITY-20261004.md](../design/TEST-SUITE-QUALITY-20261004.md) | テストの品質整理と全件/quick/slow実行 | 2026-10-04 |
| [ADVISOR-SAFETY-AUDIT-20261004.md](ADVISOR-SAFETY-AUDIT-20261004.md) | 009 既存安全性と固定の悪化局・獲得局を照合 | 2026-10-04 |
| [CHAIN-BROWSER-VERIFICATION-20261004.md](CHAIN-BROWSER-VERIFICATION-20261004.md) | 015の実描画・取消・反復検証 | 2026-10-04 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 初期の技術構成と設計経緯 | 継続資料 |
| [ASTRA-SOL-DEVELOPMENT.md](ASTRA-SOL-DEVELOPMENT.md) | 旧Astra / Solの設定・実施記録 | 2026-10-04廃止、過去記録 |
| [DOCUMENTATION-ORGANIZATION-20261003.md](DOCUMENTATION-ORGANIZATION-20261003.md) | ドキュメント整理の設計・検証記録 | 2026-10-03 |
| [DOCUMENTATION-MAP-20261003.md](DOCUMENTATION-MAP-20261003.md) | 旧パスから新パスへの移動対応表 | 2026-10-03 |
| [AUTH-SETUP.md](AUTH-SETUP.md) | 認証・ユーザーDBのセットアップ | 2026-10-04統合・記録 |
| [LOCAL-SUPABASE-DEVELOPMENT-20260930.md](LOCAL-SUPABASE-DEVELOPMENT-20260930.md) | ローカル開発環境をSupabaseへ統一する | 2026-10-04統合・記録 |
| [REMAINING-TASKS-20261004.md](REMAINING-TASKS-20261004.md) | 残件の再開・保存済み実装の統合 | 2026-10-04統合・記録 |
