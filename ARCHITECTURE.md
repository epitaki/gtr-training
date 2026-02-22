# ARCHITECTURE.md

GTRトレーニングツールの技術設計書

## システムアーキテクチャ概要

### アーキテクチャパターン
- **フロントエンド中心設計**：主要なゲームロジックはクライアントサイドで実行
- **オプショナルバックエンド**：ランキング機能やオンライン対戦用
- **モジュラー設計**：機能ごとに独立したモジュール構成

## 技術スタック

### 採用した技術スタック
```
実装済み技術:
- 言語: TypeScript 5.x ✅
- UIフレームワーク: React 19 ✅
- ゲームエンジン: Phaser 3.90 ✅
- スタイリング: Tailwind CSS 3.4 ✅
- ビルドツール: Vite 7.x ✅
- バックエンド: Supabase (PostgreSQL + リアルタイム) ✅
- 状態管理: React State + Phaser内部状態 ✅
- テスト: Vitest + React Testing Library（設定済み、テスト未実装）
```

### 選定理由
- **TypeScript**: 型安全性により実行時エラーを削減、IDEサポートが充実
- **React**: Webエンジニアに馴染みやすく、UI部分を効率的に開発
- **Phaser 3**: ゲーム開発の複雑さを抽象化、豊富なドキュメント
- **Tailwind CSS**: クラスベースで迅速なスタイリング、レスポンシブ対応が容易
- **Vite**: 高速な開発環境、設定が最小限
- **Zustand**: シンプルな状態管理、学習コストが低い

### 採用したバックエンド構成

#### ✅ 実装済み: Supabase構成
```
技術スタック:
- バックエンド: Supabase（PostgreSQL + Auth + リアルタイム）
- クライアント: @supabase/supabase-js
- API: 自動生成REST API + リアルタイムサブスクリプション
- 認証: Supabase Auth（OAuth対応）
- ホスティング: Vercel（フロントエンド）

実装状況:
✅ Supabaseクライアント設定
✅ データベース設計（sql/initial-setup.sql）
✅ 接続テスト機能
⏳ ユーザー認証（未実装）
⏳ スコア保存機能（未実装）
⏳ リアルタイムランキング（未実装）
```

#### 案2: 従来型構成（安定重視）
```
技術スタック:
- 言語: TypeScript + Node.js
- APIフレームワーク: Express / Fastify
- データベース: PostgreSQL
- ORM: Prisma
- キャッシュ: Redis（ランキング用）
- ホスティング: Railway / Render / Heroku

メリット:
- 実績のある構成
- 情報が豊富
- デバッグしやすい
```

#### 案3: サーバーレス構成（コスト最適化）
```
技術スタック:
- 言語: TypeScript
- API: AWS Lambda + API Gateway
- データベース: DynamoDB
- キャッシュ: ElastiCache
- リアルタイム: AWS AppSync / WebSocket API

メリット:
- 使った分だけの課金
- 自動スケーリング
- 管理不要
```

#### 案4: Firebase構成（最速開発）
```
技術スタック:
- Firebase Functions（バックエンド）
- Firestore（データベース）
- Firebase Auth（認証）
- Firebase Realtime Database（リアルタイム）
- Firebase Hosting（フロントエンド）

メリット:
- 全部入りで設定が楽
- リアルタイム機能が簡単
- 認証も簡単
- 無料枠が大きい
```

## モジュール設計

### コアモジュール

#### 1. GameEngine
```typescript
// ゲームの中核となるエンジン
interface GameEngine {
  field: PuyoField;           // ぷよフィールド
  physics: PhysicsEngine;     // 物理演算
  renderer: Renderer;         // 描画処理
  inputHandler: InputHandler; // 入力処理
  stateManager: StateManager; // 状態管理
}
```

#### 2. PuyoField
```typescript
// 6×13のゲームフィールド管理
class PuyoField {
  private grid: Puyo[][];     // 6×13の配列
  private chainDetector: ChainDetector;
  
  placePuyo(x: number, y: number, puyo: Puyo): void;
  checkConnections(): Connection[];
  clearConnectedPuyos(connections: Connection[]): void;
  applyGravity(): void;
}
```

#### 3. GTRAnalyzer
```typescript
// GTRの形状認識と評価
class GTRAnalyzer {
  analyzeField(field: PuyoField): GTRStatus;
  calculateCompletion(field: PuyoField): number; // 0-100%
  suggestNextMove(field: PuyoField): Position;
  detectMistakes(field: PuyoField): Mistake[];
}
```

#### 4. LearningSystem
```typescript
// 学習支援システム
interface LearningSystem {
  guideRenderer: GuideRenderer;     // ガイド表示
  hintSystem: HintSystem;           // ヒント機能
  feedbackManager: FeedbackManager; // フィードバック
  progressTracker: ProgressTracker; // 進捗管理
}
```

### UIコンポーネント構成（SPA設計）

```
App (SPA Root)
├── MainLayout
│   ├── Header
│   │   ├── SiteLogo              // サイトロゴ「GTR-training」
│   │   └── AccountIcon           // アカウントアイコン・メニュー
│   ├── SideMenu
│   │   ├── MenuItemList          // モード選択リスト
│   │   │   ├── ScoreAttackMode   // GTR training（スコアアタック）
│   │   │   ├── GuidedMode        // 初心者用ガイド付きGTR練習
│   │   │   ├── BattleMode        // GTR training対戦モード（未実装）
│   │   │   └── StatsMode         // 統計情報（未実装）
│   │   └── UserInfo              // ユーザー情報（ログイン時）
│   └── ContentArea
│       ├── TopPage               // TOP画面（デフォルト表示）
│       ├── GuidedGame            // 初心者用ガイド付きゲーム
│       │   ├── GameField         // ゲームフィールド表示
│       │   ├── NextPuyoDisplay   // ネクストぷよ表示
│       │   ├── GuideOverlay      // ガイド表示エリア
│       │   └── ControlInfo       // 操作情報
│       ├── ScoreAttackGame       // スコアアタックゲーム
│       │   ├── GameField         // ゲームフィールド表示
│       │   ├── NextPuyoDisplay   // ネクストぷよ表示
│       │   └── ScoreDisplay      // スコア・時間表示
│       ├── BattleMode            // 対戦モード（将来実装）
│       └── StatsPage             // 統計情報画面（将来実装）
│           ├── LeaderBoard       // ランキング表示
│           ├── PersonalStats     // 個人統計
│           └── ReplayViewer      // リプレイ再生
└── ResponsiveWrapper             // レスポンシブ対応ラッパー
```

### レイアウト設計詳細

#### MainLayout構造
- **固定ヘッダー**: 高さ64px、全幅、常に表示
- **固定サイドメニュー**: 幅256px、ヘッダー下からフル高さ、常に表示
- **動的コンテンツエリア**: 残りの領域、選択モードに応じて切り替え

#### 画面遷移
- サイドメニューでモード選択 → ContentAreaの内容が切り替わる
- ロゴクリック → TopPageに戻る（ゲーム進行状況破棄）
- Escキー → 現在のゲームを終了し、TopPageに戻る

### レスポンシブデザイン対応
```typescript
// ブレークポイント定義
const BREAKPOINTS = {
  mobile: 768,    // スマートフォン
  tablet: 1024,   // タブレット
  desktop: 1280   // デスクトップ
};

// デバイス判定
class DeviceDetector {
  isMobile(): boolean {
    return window.innerWidth < BREAKPOINTS.mobile;
  }
  
  isTouch(): boolean {
    return 'ontouchstart' in window;
  }
  
  getOrientation(): 'portrait' | 'landscape' {
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  }
}
```

## データ構造設計

### 基本データ型

```typescript
// ぷよの色
enum PuyoColor {
  RED = 'red',
  BLUE = 'blue',
  GREEN = 'green',
  YELLOW = 'yellow',
  PURPLE = 'purple',
  EMPTY = 'empty'
}

// ぷよオブジェクト
interface Puyo {
  id: string;
  color: PuyoColor;
  x: number;
  y: number;
  falling: boolean;
}

// GTRの状態
interface GTRStatus {
  completionRate: number;    // 完成度（0-100%）
  isValid: boolean;          // 有効な形か
  mistakes: Mistake[];       // ミス箇所
  nextSuggestedMove: Position; // 次の推奨手
}

// プレイセッションデータ
interface PlaySession {
  id: string;
  userId: string;
  mode: GameMode;
  startTime: Date;
  endTime?: Date;
  score: number;
  gtrCompleted: number;
  mistakes: number;
  replay: ReplayData;
}
```

### ストレージ設計

#### ローカルストレージ
```javascript
// 保存するデータ
{
  "userPreferences": {
    "soundEnabled": true,
    "guideOpacity": 0.5,
    "colorMode": "normal"
  },
  "personalRecords": {
    "bestTime5": 120000,
    "bestTime10": 240000,
    "bestTime20": 480000
  },
  "progress": {
    "tutorialCompleted": true,
    "totalGTRCompleted": 150,
    "playTime": 3600000
  }
}
```

#### データベース設計（バックエンド使用時）
```sql
-- ユーザーテーブル
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- スコアテーブル
CREATE TABLE scores (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  mode VARCHAR(20) NOT NULL,
  score INTEGER NOT NULL,
  time_ms INTEGER NOT NULL,
  gtr_count INTEGER NOT NULL,
  replay_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_scores_mode_score ON scores(mode, score DESC);
CREATE INDEX idx_scores_user_id ON scores(user_id);
```

## 処理フロー設計

### ゲームループ
```
1. 入力処理 (60fps)
   ├── キーボード/タッチ入力を取得
   ├── 入力をゲームコマンドに変換
   └── コマンドをキューに追加

2. 更新処理 (60fps)
   ├── コマンドキューを処理
   ├── ぷよの移動・回転
   ├── 物理演算（落下処理）
   ├── 連鎖判定
   ├── GTR形状分析
   └── スコア計算

3. 描画処理 (60fps)
   ├── フィールド描画
   ├── ぷよアニメーション
   ├── エフェクト描画
   ├── UI更新
   └── ガイド表示

4. フィードバック処理
   ├── 効果音再生
   ├── 振動フィードバック（モバイル）
   └── 視覚エフェクト
```

### GTR判定アルゴリズム

```typescript
// GTR基本形のパターン定義
const GTR_PATTERNS = {
  base: [
    // 2列目と3列目の基本形
    { x: 1, y: 0, color: 'A' },
    { x: 2, y: 0, color: 'B' },
    { x: 1, y: 1, color: 'A' },
    { x: 2, y: 1, color: 'A' },
    // ... 続きのパターン
  ],
  variations: [
    // バリエーションパターン
  ]
};

// パターンマッチング処理
function detectGTR(field: PuyoField): GTRStatus {
  // 1. フィールドの2-3列目を重点的にスキャン
  // 2. 基本パターンとの一致度を計算
  // 3. 部分一致も考慮して完成度を算出
  // 4. 次の配置候補を提案
}
```

## パフォーマンス最適化

### レンダリング最適化
- **ダーティフラグ**：変更があった部分のみ再描画
- **オブジェクトプーリング**：ぷよオブジェクトの再利用
- **レイヤー分離**：背景、ゲーム、UI、エフェクトを別レイヤーで管理

### メモリ管理
```typescript
class PuyoPool {
  private pool: Puyo[] = [];
  private maxSize = 100;
  
  getPuyo(): Puyo {
    return this.pool.pop() || this.createPuyo();
  }
  
  returnPuyo(puyo: Puyo): void {
    if (this.pool.length < this.maxSize) {
      this.resetPuyo(puyo);
      this.pool.push(puyo);
    }
  }
}
```

### ネットワーク最適化（オンライン機能）
- **WebSocket接続の再利用**
- **メッセージのバッチング**
- **差分更新のみ送信**
- **クライアント予測と補間**

## セキュリティ考慮事項

### クライアントサイド
- 入力値検証
- XSS対策（ユーザー入力のサニタイズ）
- ローカルストレージの暗号化（機密データ）

### サーバーサイド（実装時）
- API認証（JWT）
- レート制限
- SQL インジェクション対策
- CORS設定
- HTTPS通信

### チート対策
```typescript
// スコア検証
class ScoreValidator {
  validateScore(session: PlaySession): boolean {
    // 時間とスコアの妥当性チェック
    const theoreticalMinTime = session.gtrCompleted * MIN_TIME_PER_GTR;
    if (session.time < theoreticalMinTime) return false;
    
    // リプレイデータとの整合性チェック
    const replayScore = this.calculateScoreFromReplay(session.replay);
    if (Math.abs(replayScore - session.score) > TOLERANCE) return false;
    
    return true;
  }
}
```

## エラーハンドリング

### エラー分類
1. **ゲームロジックエラー**：リカバリ可能、ゲーム継続
2. **ネットワークエラー**：リトライ機構、オフラインモード移行
3. **システムエラー**：エラー画面表示、ログ送信

### エラー処理例
```typescript
class ErrorHandler {
  handle(error: GameError): void {
    switch (error.severity) {
      case 'low':
        console.warn(error);
        this.showNotification(error.message);
        break;
      case 'medium':
        this.logError(error);
        this.showWarningDialog(error);
        break;
      case 'high':
        this.logError(error);
        this.saveGameState();
        this.showErrorScreen(error);
        break;
    }
  }
}
```

## テスト戦略

### ユニットテスト
- GTR判定ロジック
- 連鎖判定アルゴリズム
- スコア計算
- 物理演算

### 統合テスト
- ゲームフロー全体
- モード遷移
- データ永続化

### E2Eテスト
- チュートリアル完走
- スコアアタック記録
- ランキング表示

### パフォーマンステスト
- 60FPS維持確認
- メモリリーク検出
- 大量ぷよ処理

## デプロイメント

### ビルド設定
```javascript
// vite.config.js 例
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'game-engine': ['phaser'],
          'ui-framework': ['react', 'react-dom'],
          'utils': ['lodash', 'date-fns']
        }
      }
    },
    target: 'es2015',
    minify: 'terser'
  }
}
```

### デプロイ先オプション
1. **静的ホスティング**（推奨）
   - GitHub Pages（無料、簡単）
   - Netlify（自動デプロイ、プレビュー機能）
   - Vercel（高速、Next.js対応）
   
2. **CDN配信**
   - CloudFlare Pages（グローバル配信）
   - AWS CloudFront + S3
   
3. **モバイル展開**（将来）
   - PWAとしてホーム画面に追加
   - Google Play Store（TWA: Trusted Web Activity）
   - App Store（PWA または Capacitor でラップ）

## 監視とログ

### 監視項目
- FPS（フレームレート）
- メモリ使用量
- エラー発生率
- API応答時間

### ログ収集
```typescript
class Logger {
  log(level: LogLevel, message: string, context?: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      sessionId: this.sessionId,
      userId: this.userId
    };
    
    // ローカル保存
    this.saveLocal(logEntry);
    
    // サーバー送信（バッチ処理）
    this.queueForUpload(logEntry);
  }
}
```