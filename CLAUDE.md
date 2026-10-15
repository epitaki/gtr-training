# CLAUDE.md

このファイルは、このリポジトリでコードを扱う際のClaude Code (claude.ai/code) へのガイダンスを提供します。

## プロジェクト概要

GTRトレーニングツール - ぷよぷよの連鎖土台「GTR（グレート田中連鎖）」を楽しく学べるゲーム

**対象GTR**：標準GTRと折り返しGTR（**逆折りGTRは対象外**）

詳細な要件は [REQUIREMENT.md](docs/specs/REQUIREMENT.md) を参照してください。

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
bun create vite . --template react-ts

# 依存関係インストール
bun add phaser@^3.70.0 zustand@^4.5.0
bun add -d tailwindcss@^3.4.0 postcss autoprefixer
bun add -d @types/node vitest @testing-library/react

# Tailwind CSS初期化
bunx tailwindcss init -p

# 開発サーバー起動
bun run dev
```

### ビルドコマンド
```bash
# 開発サーバー起動（http://localhost:5173）
bun run dev

# プロダクションビルド
bun run build

# ビルドプレビュー
bun run preview

# テスト実行
bun run test

# 型チェック
bun run type-check
```

## プロジェクト構造

**機能別モジュール＋レイヤード構成**。最新の構成と依存ルールは
[docs/PROJECT-STRUCTURE.md](docs/PROJECT-STRUCTURE.md) を参照する。

- `src/components/{layout,game,feedback}/`：React画面。
- `src/game/{core,gtr,advisor,guide}/`：共通ルール・判定・推薦・教材。
- `src/game/{scenes,rendering}/`：進行制御・入力・Phaser表示。
- `src/game/feedback/`：共有用局面・再現URL・検証・保存。
- `src/benchmark/`：ゲームと同じエンジンを使う測定処理。
- `scripts/{benchmark,analysis,human,shared}/`：実験実行と分析。
- `benchmarks/`：基準値、人間手順、測定データ。
- `*.test.ts`：対象コードと同じ場所に置く。

`core/gtr/advisor` から React や Phaser に依存させない。
テストは `bun run test`、本体の型確認は `bun run type-check`、
実験スクリプトの型確認は `bun run type-check:scripts`。
削除済みの `tasks/` を再作成しない。

### 人間の手順・動画を調査するとき

最初に [ぷよ譜ライブラリ](benchmarks/human/README.md) と目録を確認し、保存済みの譜面を再利用する。
新しい観測は元譜面のID、動画URL・時刻、確認範囲・確度、対戦状況とともに残す。
人間の配置は唯一の正解ではない。観測・仮説・別案の検証・採否を分け、反例や判断保留も保存する。
既存500記録を「500試合すべて映像確認済み」と呼ばない。30本の予備調査は500本の内数である。

## UI構成（旧SPA設計の記録）

この節は当時の画面構成を保存した記録です。現行画面では広い幅でサイドメニューを表示し、狭い幅ではヘッダーのボタンで開閉します。アカウント機能は準備中の表示です。現在のモードと画面は[ゲームモード仕様](docs/specs/GAME-MODES.md)を参照してください。

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

詳細は [note.md](docs/archive/note.md) を参照してください。

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

詳細な設計は [ARCHITECTURE.md](docs/development/ARCHITECTURE.md) を参照してください。

## よく使うコマンド

```bash
# 開発サーバー起動（http://localhost:5173）
bun run dev

# プロダクションビルド
bun run build

# ビルドプレビュー
bun run preview

# テスト実行
bun run test

# 型チェック
bun run type-check
```

## 旧実装一覧と整理時の補注

以下は旧一覧に2026-10-03の文書訂正が混在する保存記録です。章全体を現行の完了認定として扱わず、当時の「完了済み」「開発予定」やSupabase接続設定の記載もその時点の記録として読んでください。現行のSupabase接続成否はここでは確認していません。

現行の入口：[進捗](docs/progress-report.md)、[ゲームモード](docs/specs/GAME-MODES.md)、[視覚ガイド](docs/specs/GTR-VISUAL-GUIDE.md)、[採点](docs/specs/GTR-SCORING-SYSTEM.md)、[配置推薦](docs/specs/PLACEMENT-ADVISOR.md)、[コード構成](docs/PROJECT-STRUCTURE.md)。現在のホームは `src/App.tsx` が使う `src/components/TopPage.tsx` で、旧一覧の `TopMenu.tsx` とそのSupabase接続状態表示は現行ホームの説明ではありません。現行サイドメニューにはフリープレイ項目がなく、狭幅では開閉式です。`PuyoRenderer` は独自ぷよアトラスを読み込み、フレームを登録します。

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
  - Y字・座布団・L字の完成見本を表示。閲覧中の見本と配置推薦は区別する
  - **ガイド表示仕様**：現行COACHは中心X=690px、幅380px、左辺X=500px。旧記載の「X座標380px」は現在の位置ではない
  - **ぷよアイコン表示**：実際のぷよスプライトを表示。A/B/C/Dは折り返しでの色の役割に合わせて異なる4色へ割り当て、A→赤などの固定対応はしない
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
  - **開始時の2手組み合わせ**：AAAB、ABAB（AABBを含む）、ABAC、AABCの4分類を各25%の選択幅で生成。AAAAは本ツールの練習目的で除外
  - ガイドの3手目以降は独立抽選。スコアアタックは3手目が独立抽選、4手目以降は制約付き生成のpair1だけを供給し、任意の隣接2手に3色制約を保証しない
  - 4色固定（赤・緑・青・黄）

#### **連鎖システム**
- 重力による自然落下
- 4つ以上繋がったぷよの自動消去
- 連鎖による再帰的な消去処理
- スコア計算（消去したぷよ数×10点）

#### **GTR評価システム**
- **パターン検出**
  - GTR必須折り返し形状の検出（1-3列目）
  - 現在の完成見本はY字・座布団・L字。連鎖尾の評価は実際の土台内連鎖と合わせて判定する
- **詳細評価**
  - 評価範囲：1-2列目の下3段、3-6列目の下4段。行番号は上から1始まり、実装配列の座標は0始まりで区別する
  - 範囲内の安定した最小19個、事前消去なし、基本形の先頭2連鎖を含む5連鎖全消しなどを100点条件とする
  - 右端位置だけの加点は行わない。余り評価は「なし ＞ 1個 ＝ 同色連結」
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
3. 開発サーバーが起動しているか確認（bun run dev）

### Supabase接続エラー
1. .env ファイルの環境変数を確認
2. SupabaseプロジェクトのURL/APIキーが正しいか確認
3. sql/initial-setup.sql をSupabaseで実行済みか確認

## 参考資料

- [docs/specs/REQUIREMENT.md](docs/specs/REQUIREMENT.md) - 詳細な要件定義
- [docs/development/ARCHITECTURE.md](docs/development/ARCHITECTURE.md) - 技術設計書
- [docs/archive/TECH_RECOMMENDATION.md](docs/archive/TECH_RECOMMENDATION.md) - 技術選定の詳細と理由
- [docs/README.md](./docs/README.md) - ドキュメント一覧
- [docs/specs/GAME-MODES.md](docs/specs/GAME-MODES.md) - ゲームモード仕様書
- [docs/specs/GTR-SCORING-SYSTEM.md](docs/specs/GTR-SCORING-SYSTEM.md) - GTR評価システム設計
- [docs/specs/PUYO-GENERATION.md](docs/specs/PUYO-GENERATION.md) - 2手制約システム仕様書
- [docs/archive/note.md](docs/archive/note.md) - UI設計とSPA構成
- [src/game/gtr/GTRScoringConfig.ts](src/game/gtr/GTRScoringConfig.ts) - 評価点数設定ファイル
- [docs/specs/PLACEMENT-ADVISOR.md](docs/specs/PLACEMENT-ADVISOR.md) - 配置推薦システム設計書
- [src/game/advisor/PlacementAdvisorConfig.ts](src/game/advisor/PlacementAdvisorConfig.ts) - 推薦スコアリング定数
- [src/game/guide/GTRGuidePatterns.ts](src/game/guide/GTRGuidePatterns.ts) - GTR完成形サンプル集
- ぷよぷよ公式ルール
