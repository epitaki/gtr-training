# ドキュメント一覧

GTRトレーニングツールのドキュメントです。

## ドキュメント構成

### プロジェクト概要
- [REQUIREMENT.md](../REQUIREMENT.md) - 要件定義書（全体仕様）
- [ARCHITECTURE.md](../ARCHITECTURE.md) - 技術設計書
- [TECH_RECOMMENDATION.md](../TECH_RECOMMENDATION.md) - 技術選定の詳細と理由
- [BACKEND_COMPARISON.md](../BACKEND_COMPARISON.md) - バックエンド比較分析

### GTR学習ガイド
- [GTR-PATTERNS.md](./GTR-PATTERNS.md) - GTRパターン定義（技術仕様）
- [GTR-VISUAL-GUIDE.md](./GTR-VISUAL-GUIDE.md) - GTR視覚的ガイド（学習用）
- [GTR-SCORING-SYSTEM.md](./GTR-SCORING-SYSTEM.md) - GTR評価システム設計

### ゲーム設計
- [GAME-MODES.md](./GAME-MODES.md) - ゲームモード仕様書
- [layout-design.md](./layout-design.md) - レイアウト設計書
- [PUYO-GENERATION.md](./PUYO-GENERATION.md) - 2手目組み合わせ制約仕様

### 開発者向け
- [CLAUDE.md](../CLAUDE.md) - Claude Code 開発ガイド
- [note.md](../note.md) - UI設計とSPA構成
- [progress-report.md](./progress-report.md) - 開発進捗レポート

### 仕様書管理
- [tasks/](../tasks/) - アクティブな仕様書
- [tasks/archive/](../tasks/archive/) - 完了した仕様書のアーカイブ

## 学習者向け推奨読書順序

### 1. まず概要を掴む
1. [REQUIREMENT.md](../REQUIREMENT.md) - どんなツールなのか

### 2. GTRを学ぶ
1. [GTR-VISUAL-GUIDE.md](./GTR-VISUAL-GUIDE.md) - **まずここから！** 図解で分かりやすく説明
2. [GTR-PATTERNS.md](./GTR-PATTERNS.md) - より詳細な技術仕様

### 3. 実践する
1. ゲームを起動して実際に練習
2. スコア向上を目指す

## 開発者向け推奨読書順序

### 1. プロジェクト理解
1. [REQUIREMENT.md](../REQUIREMENT.md) - 要件定義
2. [ARCHITECTURE.md](../ARCHITECTURE.md) - 技術設計
3. [CLAUDE.md](../CLAUDE.md) - 開発ガイド

### 2. GTRロジック理解
1. [GTR-PATTERNS.md](./GTR-PATTERNS.md) - パターン定義
2. [GTR-SCORING-SYSTEM.md](./GTR-SCORING-SYSTEM.md) - 評価システム
3. `src/game/GTRPatterns.ts` - 検出・評価の実装

### 3. ゲームモード理解
1. [GAME-MODES.md](./GAME-MODES.md) - モード仕様
2. [PUYO-GENERATION.md](./PUYO-GENERATION.md) - ぷよ生成制約

### 4. 実装・拡張
1. 既存コードの理解
2. 仕様書をtasks/に作成
3. 実装後にtasks/archive/へ移動

## GTR対応状況

| GTRタイプ | 対応状況 | 難易度 | 説明 |
|-----------|----------|--------|------|
| 標準GTR | ✅ 対応 | ⭐⭐ | 2-3列目中心の基本形 |
| 折り返しGTR | ✅ 対応 | ⭐⭐⭐ | 1列目を含む発展形 |
| 逆折りGTR | ❌ 対象外 | ⭐⭐⭐⭐⭐ | 複雑すぎるため除外 |
| 変則GTR | ❌ 対象外 | ⭐⭐⭐⭐ | 基本習得を優先 |

## ドキュメント更新履歴

- **2026-02-22**:
  - GAME-MODES.md 更新（PlacementAdvisor、Fキー、Gキー、ビジュアル改善を反映）
  - progress-report.md 全面更新（Phase 2完了を反映）
  - README.md 更新（ドキュメント一覧の整理）
- **2024-11-30**:
  - GTR-SCORING-SYSTEM.md 作成
  - GTR-PATTERNS.md, GTR-VISUAL-GUIDE.md 更新
- **2024-11-24**:
  - layout-design.md 作成
- **2024-08-11**:
  - GAME-MODES.md 作成
  - PUYO-GENERATION.md 作成
- **2024-08-08**:
  - GTR-PATTERNS.md 作成
  - GTR-VISUAL-GUIDE.md 作成
  - docs/README.md 作成

---

質問や改善提案がありましたら、GitHubのIssuesでお知らせください。
