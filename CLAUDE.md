# CLAUDE.md

このファイルは、このリポジトリでコードを扱う際のClaude Code (claude.ai/code) へのガイダンスを提供します。

## プロジェクト概要

GTRトレーニングツール - ぷよぷよの連鎖土台「GTR（グレート田中連鎖）」を楽しく学べるゲーム

**対象GTR**：標準GTRと折り返しGTR（**逆折りGTRは対象外**）

詳細な要件は [REQUIREMENT.md](./REQUIREMENT.md) を参照してください。

## 開発環境セットアップ

### 必要なツール
- Node.js v18以上（推奨: v20 LTS）
- VS Code（推奨エディタ）
- Git

### 推奨VS Code拡張機能
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript Vue Plugin (Volar)

### クイックスタート
```bash
# プロジェクト作成
npm create vite@latest . -- --template react-ts

# 依存関係インストール
npm install phaser@^3.70.0 zustand@^4.5.0
npm install -D tailwindcss@^3.4.0 postcss autoprefixer
npm install -D @types/node vitest @testing-library/react

# Tailwind CSS初期化
npx tailwindcss init -p

# 開発サーバー起動
npm run dev
```

### ビルドコマンド
```bash
# 開発サーバー起動（http://localhost:5173）
npm run dev

# プロダクションビルド
npm run build

# ビルドプレビュー
npm run preview

# テスト実行
npm run test

# 型チェック
npm run type-check
```

## プロジェクト構造

```
gtr-training/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx              # ヘッダー（ロゴ・アカウント）
│   │   │   ├── SideMenu.tsx            # サイドメニュー（モード選択）
│   │   │   └── MainLayout.tsx          # メインレイアウト統合
│   │   ├── TopPage.tsx                 # TOPページ
│   │   ├── TopMenu.tsx                 # TOPページメニュー（旧実装）
│   │   ├── GuidedGame.tsx              # 初心者用ガイド付きGTR練習（900px）
│   │   ├── ScoreAttackGame.tsx         # GTRスコアアタック（640px）
│   │   ├── GameLayout.tsx              # ゲーム全体レイアウト（非使用）
│   │   └── GameBoard.tsx               # Phaserゲーム表示コンテナ（非使用）
│   ├── game/
│   │   ├── GameManager.ts              # Phaserゲーム設定・管理
│   │   ├── PuyoGame.ts                 # スコアアタック用シーン
│   │   ├── GameField.ts                # フィールド管理・連鎖処理
│   │   ├── PuyoPair.ts                 # ぷよペア管理・回転処理・2手制約
│   │   ├── PuyoRenderer.ts             # ぷよテクスチャ生成（通常+ゴースト）
│   │   ├── VisualConfig.ts             # 統一レイアウト・カラー定数
│   │   ├── GTRPatterns.ts              # GTR検出・評価システム
│   │   ├── GTRScoringConfig.ts         # 評価点数設定ファイル
│   │   ├── PlacementAdvisor.ts         # 最適配置推薦アルゴリズム
│   │   ├── PlacementAdvisorConfig.ts   # 推薦スコアリング定数
│   │   ├── GuideManager.ts             # ガイド状態管理
│   │   ├── GTRGuidePatterns.ts         # GTR完成形サンプル集
│   │   ├── GameHistory.ts              # ゲーム履歴管理（巻き戻し用）
│   │   ├── scenes/
│   │   │   ├── MenuScene.ts            # メニューシーン（非使用）
│   │   │   └── GuidedPracticeScene.ts  # ガイド付き練習シーン
│   │   └── types.ts                    # 型定義
│   ├── lib/
│   │   ├── supabase.ts                 # Supabaseクライアント
│   │   └── test-connection.ts          # 接続テスト機能
│   ├── App.tsx                         # メインアプリケーション・SPA構成管理
│   ├── main.tsx                        # エントリーポイント
│   └── index.css                       # Tailwind CSS
├── sql/
│   └── initial-setup.sql               # データベース初期設定
├── docs/
│   ├── README.md                       # ドキュメント一覧
│   ├── GAME-MODES.md                   # ゲームモード仕様書
│   ├── GTR-PATTERNS.md                 # GTRパターン定義
│   ├── GTR-SCORING-SYSTEM.md           # GTR評価システム設計
│   ├── GTR-VISUAL-GUIDE.md             # GTR視覚的ガイド
│   ├── PUYO-GENERATION.md              # 2手制約システム仕様書
│   ├── layout-design.md                # レイアウト設計書
│   └── progress-report.md              # 開発進捗レポート
├── tasks/                              # アクティブな仕様書
│   └── archive/                        # 完了仕様書アーカイブ
├── public/                             # 静的ファイル
└── tests/                              # テストコード（未実装）
```

## UI構成（SPA設計）

本サイトは**ヘッダー + サイドメニュー + コンテンツエリア**の3領域で構成されるSPAです。

### ヘッダー
- 画面上部の帯状領域
- 左上：サイトロゴ「GTR-training」（クリックでTOP画面に戻る）
- 右上：アカウントアイコン（クリックでAccountMenu展開）

### サイドメニュー
- 画面左側の領域、常に表示
- ゲームモード選択UI
- メニュー項目：
  - GTR training（スコアアタック）
  - 初心者用ガイド付きGTR練習
  - GTR training対戦モード
  - 統計情報

### コンテンツエリア
- サイドメニュー右側の大きな領域
- 選択したモードに応じて表示が切り替わる
- 各モードにそれぞれのTOP画面あり

詳細は [note.md](./note.md) を参照してください。

## 開発ガイドライン

### 言語
- **応答は必ず日本語で行うこと**
- 日本語でのコメントを推奨（プロジェクトが日本語中心のため）

### コード規約
- 関数名・変数名は英語（一般的な命名規則に従う）
- GTR関連の専門用語は統一した表記を使用
- TypeScriptの使用を推奨（型安全性のため）

### 重要な実装ポイント
- **GTRの形**：2列目と3列目を中心とした特徴的な形状
- **ぷよぷよのルール**：4つ繋がりで消去、重力落下
- **学習効果**：視覚的に分かりやすいフィードバック

詳細な設計は [ARCHITECTURE.md](./ARCHITECTURE.md) を参照してください。

## よく使うコマンド

```bash
# 開発サーバー起動（http://localhost:5173）
npm run dev

# プロダクションビルド
npm run build

# ビルドプレビュー
npm run preview

# テスト実行
npm run test

# 型チェック
npm run type-check
```

## 現在の実装状況

### ✅ 完了済み機能

#### **ゲームモード管理**
- **ReactベースのTOPページ**（TopMenu.tsx）
  - モード選択UI（初心者用ガイド付き、GTRスコアアタック）
  - Supabase接続状態表示
  - GTRの説明
- **独立したゲームモード起動**
  - 初心者用ガイド付きGTR練習
  - GTRスコアアタック
  - ESCキーでいつでもTOPページに戻る機能

#### **初心者用ガイド付きGTR練習**
- **ガイド表示システム**（GuideManager.ts）
  - 状態遷移：最初の2手 → 基本形作成 → 連鎖尾作成 → GTR完成形
  - 2手組み合わせパターン別のおすすめ配置表示
  - Y字・L字・階段型連鎖尾のサンプル表示
  - **ガイド表示仕様**：フィールド右側に配置（X座標380px）、フィールドと同じ高さで表示
  - **ぷよアイコン表示**：実際のぷよスプライト表示（A→赤、B→緑、C→青、D→黄）
- **学習支援機能**
  - ↑キー：巻き戻し機能（GameHistory.ts）- 連鎖処理後の状態も正しく復元
  - Pキー：ポーズ機能
  - Fキー：自由落下ON/OFF切り替え（2024年12月更新）
  - リアルタイムガイド更新
  - 詳細評価結果表示（折り返し、連鎖尾、連鎖数、あまりぷよ評価）

#### **GTRスコアアタック**
- **従来の5GTRモード**（PuyoGame.ts）
  - 高速ゲームプレイ
  - GTR評価機能
  - Fキー：自由落下ON/OFF切り替え（2024年12月更新）
  - インタラクティブな評価画面（Space/Escキー操作）

#### **基本ゲームシステム**
- **ぷよペアシステム**
  - 自動落下（800ms間隔）
  - キーボード操作（←→移動、Z左回転、X右回転、↓高速落下）
  - 壁キック実装（壁際での回転補正）
  - **2手目組み合わせ制約**：AAAA、AAAB、ABAB、ABAC、AABC型のみ生成
  - 4色固定（赤・緑・青・黄）

#### **連鎖システム**
- 重力による自然落下
- 4つ以上繋がったぷよの自動消去
- 連鎖による再帰的な消去処理
- スコア計算（消去したぷよ数×10点）

#### **GTR評価システム（note.md仕様）**
- **パターン検出**
  - GTR必須折り返し形状の検出（1-3列目）
  - 連鎖尾形状判定（Y字・L字・階段型）
- **詳細評価**
  - 評価範囲：1-2列目（10-12行目）、3-6列目（9-12行目）
  - 連鎖数評価（最大5連鎖、1連鎖10点）
  - 9行目使用状況評価（右上の立ち具合）
  - あまりぷよ評価（同色連結で高評価、複数色は0点）
- **設定管理**
  - 設定ファイル分離（GTRScoringConfig.ts）でチューニング容易
  - 評価条件分岐にコメント付き

#### **配置アドバイザー**（PlacementAdvisor）
- フィールド状態+現在のぷよペアから最適配置を推薦
- 3フェーズ自動検出（折り返し構築→連鎖尾→完成）
- 5要素スコアリング（折り返し進捗、連鎖尾、連結、高さ、連鎖シミュ）
- ゴースト表示（半透明ぷよ+パルスアニメーション）
- Gキーで ON/OFF 切替
- 設定ファイル分離（PlacementAdvisorConfig.ts）

#### **UI/UX**
- **レスポンシブデザイン**
  - ガイド付きモード：900×800px（ガイド表示エリア+ゴースト付き）
  - スコアアタック：640×800px
- **ビジュアルシステム**
  - PuyoRenderer: 目付きぷよテクスチャ（3段グラデーション+光沢+ゴースト）
  - VisualConfig: 統一レイアウト定数（48pxセル、カラーパレット）
  - アニメーション：着地バウンス、連鎖消滅+パーティクル、スコアフロート
- **操作フィードバック**
  - インタラクティブな評価画面（Space/Escキー選択）
  - ポーズ画面表示
  - 詳細な操作説明

#### **バックエンド準備**
- Supabase接続・設定完了
- データベース設計（sql/initial-setup.sql）
- 接続テスト機能

### 📝 最近の更新（2024年12月）
- **自由落下ON/OFF機能追加**
  - Fキーで自由落下の有効/無効を切り替え可能
  - 画面上部に現在の状態を表示（ON：緑色、OFF：赤色）
  - 両ゲームモード（初心者用ガイド付き、スコアアタック）で利用可能
- **巻き戻し機能の修正**
  - 連鎖処理後の巻き戻しが正しく動作するよう修正
  - 履歴保存のタイミングを連鎖処理完了後に変更

### 🚧 開発予定機能
- **フリープレイモード**（メニューに表示済み、未実装）
- **ランキングシステム**
  - スコアシステムとSupabaseとの連携
  - グローバルランキング
  - パーソナルレコード
- **ソーシャル機能**
  - ユーザー認証
  - リプレイ共有機能
  - フレンドシステム
- **学習機能強化**
  - GTRガイドの視覚的改善
  - 段階的難易度調整
  - 統計機能（成功率、平均時間等）

## 操作方法

### 共通操作
- **← →** : 左右移動
- **↓** : 高速落下  
- **Z** : 左回転
- **X** : 右回転
- **Space** : GTR評価
- **Esc** : TOPページに戻る

### 初心者用ガイド付きGTR練習
- **↑** : 巻き戻し（1手戻る）
- **P** : ポーズ/再開
- **F** : 自由落下ON/OFF（画面左上に状態表示）
- **G** : 配置アドバイザーON/OFF（推薦位置ゴースト表示）
- **Space** : GTR評価（詳細結果表示）
- **評価画面**：Space（続ける）/ Esc（TOPへ戻る）

### GTRスコアアタック
- **F** : 自由落下ON/OFF（画面右上に状態表示）
- **Space** : GTR評価（インタラクティブ結果画面）
- **評価画面**：Space（ゲーム続行）/ Esc（TOPへ戻る）

## トラブルシューティング

### ゲームが表示されない場合
1. ブラウザを強制リフレッシュ（Ctrl + F5）
2. F12でConsoleを開き、エラーを確認
3. 開発サーバーが起動しているか確認（npm run dev）

### Supabase接続エラー
1. .env ファイルの環境変数を確認
2. SupabaseプロジェクトのURL/APIキーが正しいか確認
3. sql/initial-setup.sql をSupabaseで実行済みか確認

## 参考資料

- [REQUIREMENT.md](./REQUIREMENT.md) - 詳細な要件定義
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 技術設計書
- [TECH_RECOMMENDATION.md](./TECH_RECOMMENDATION.md) - 技術選定の詳細と理由
- [docs/README.md](./docs/README.md) - ドキュメント一覧
- [docs/GAME-MODES.md](./docs/GAME-MODES.md) - ゲームモード仕様書
- [docs/GTR-SCORING-SYSTEM.md](./docs/GTR-SCORING-SYSTEM.md) - GTR評価システム設計
- [docs/PUYO-GENERATION.md](./docs/PUYO-GENERATION.md) - 2手制約システム仕様書
- [note.md](./note.md) - UI設計とSPA構成
- [src/game/GTRScoringConfig.ts](./src/game/GTRScoringConfig.ts) - 評価点数設定ファイル
- [src/game/PlacementAdvisorConfig.ts](./src/game/PlacementAdvisorConfig.ts) - 推薦スコアリング定数
- [src/game/GTRGuidePatterns.ts](./src/game/GTRGuidePatterns.ts) - GTR完成形サンプル集
- ぷよぷよ公式ルール