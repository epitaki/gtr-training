# サイトのUI設計（実装完了：2024年11月24日）

本サイトは**SPA（Single Page Application）**構成で、以下の3領域で構成される：

- ✅ ヘッダー（固定表示）
- ✅ サイドメニュー（固定表示）
- ✅ コンテンツエリア（動的切り替え）

## ヘッダー ✅ 実装完了

画面の上部を帯状に占める領域（高さ64px、固定表示）
- **左上**：サイトロゴ「GTR-training」
- **右上**：アカウントアイコン
- **スタイル**：青紫グラデーション背景（bg-gradient-to-r from-blue-600 to-purple-600）

### サイトロゴ ✅
- クリックでコンテンツがTOP画面に戻る
- ゲームの進行状況はすべて破棄される（確認ダイアログあり）
- 実装：[src/components/layout/Header.tsx](src/components/layout/Header.tsx)

### アカウントアイコン ✅
- クリックでアカウントメニューがドロップダウン表示（Google風）
- メニュー項目：ログイン、新規登録、設定、ヘルプ
- ログイン機能は未実装（表示のみ）

## サイドメニュー ✅ 実装完了

画面の左側の領域（幅256px、固定表示）、ヘッダーの下に配置
- サイドメニューではゲームモードを選択できる
- 選択したゲームモードにコンテンツエリアが切り替わる
- サイドメニューは常に表示される
- **スタイル**：ダークテーマ（bg-gray-900）
- 実装：[src/components/layout/SideMenu.tsx](src/components/layout/SideMenu.tsx)

### メニュー項目
- ✅ **TOP** 🏠 - トップページ
- ✅ **GTR training** ⚡ - スコアアタック
- ✅ **初心者用ガイド** 📚 - ガイド付きGTR練習
- ⏳ **対戦モード** ⚔️ - GTR training対戦（未実装）
- ⏳ **統計情報** 📊 - スコアアタックの履歴、よく使うGTRの形、他ユーザーのGTR分析など（未実装）

## コンテンツエリア ✅ 実装完了

サイドメニューの右の大きな領域、選択したモードに応じて動的に切り替わる
- **背景**：明るいグレー（bg-gray-100）
- **パディング**：適切な余白付き（p-6）
- 実装：[src/components/layout/MainLayout.tsx](src/components/layout/MainLayout.tsx)

### TOP画面 ✅
メニューで初期表示される画面、左上のロゴをクリックすれば表示される
- GTRトレーニングツールの紹介
- GTRとは？の説明
- 各モードの紹介カード
- 開発予定機能の案内
- 各モードへのクイックアクセスボタン
- 実装：[src/components/TopPage.tsx](src/components/TopPage.tsx)

### 初心者用ガイド付きGTR練習 ✅
- ゲーム画面サイズ：900×800px
- リアルタイムガイド表示
- 巻き戻し・ポーズ機能付き
- 自由落下ON/OFF（Fキー）
- 配置アドバイザー・ゴースト表示（Gキー）
- 詳細評価システム（成功✓/失敗✗の両方を表示）
- 実装：[src/components/GuidedGame.tsx](src/components/GuidedGame.tsx)

### GTRスコアアタック ✅
- ゲーム画面サイズ：640×800px
- 5GTR完成を目指す高速プレイモード
- 自由落下ON/OFF（Fキー）
- インタラクティブな評価画面
- 実装：[src/components/ScoreAttackGame.tsx](src/components/ScoreAttackGame.tsx)

### 対戦モード ⏳
未実装（メニュー表示済み、「この機能は開発中です」表示）

### 統計情報 ⏳
未実装（メニュー表示済み、「この機能は開発中です」表示）

---

## 実装詳細

### コンポーネント構成
```
src/
├── components/
│   ├── layout/
│   │   ├── Header.tsx         # ヘッダー
│   │   ├── SideMenu.tsx       # サイドメニュー
│   │   └── MainLayout.tsx     # メインレイアウト統合
│   ├── TopPage.tsx            # TOPページ
│   ├── GuidedGame.tsx         # 初心者用ガイド付きゲーム
│   └── ScoreAttackGame.tsx    # スコアアタックゲーム
└── App.tsx                    # SPAルート
```

### 画面遷移
- サイドメニューでモード選択 → コンテンツエリアが切り替わる
- ロゴクリック → TOP画面に戻る（確認ダイアログ表示）
- Escキー → 現在のゲームを終了してTOP画面に戻る

### 関連ドキュメント
- [CLAUDE.md](CLAUDE.md) - プロジェクト構造とUI構成
- [ARCHITECTURE.md](ARCHITECTURE.md) - UIコンポーネント構成詳細
- [docs/layout-design.md](docs/layout-design.md) - レイアウト設計詳細
- [REQUIREMENT.md](REQUIREMENT.md) - 機能要件定義
