# 技術スタック推奨提案書

## 推奨技術スタック

ゲームプログラミング初心者の中堅エンジニア向けに、学習曲線が緩やかで実装しやすい技術を選定しました。

### 🎯 推奨構成

```
言語: TypeScript
フレームワーク: React
ゲームエンジン: Phaser 3
スタイリング: Tailwind CSS
ビルドツール: Vite
状態管理: Zustand
テスト: Vitest + React Testing Library
```

## 選定理由

### 1. **TypeScript** を選ぶ理由
```typescript
// 型安全でバグを防ぎやすい
interface Puyo {
  x: number;
  y: number;
  color: PuyoColor;
}

// IDEの補完が効いて開発効率UP
const puyo: Puyo = {
  x: 0,
  y: 0,
  color: PuyoColor.RED  // 補完が効く
};
```

**メリット**
- 型によるバグの早期発見
- VSCodeの強力な補完機能
- リファクタリングが安全
- ドキュメント代わりになる型定義

### 2. **React** を選ぶ理由

**メリット**
- Webエンジニアには馴染みやすい
- UI部分とゲーム部分を分離できる
- 豊富なエコシステム
- コンポーネント単位で開発可能

```jsx
// UIとゲームロジックを分離
function GameScreen() {
  return (
    <div className="game-container">
      <ScoreDisplay score={score} />
      <PhaserGame />  {/* ゲーム本体 */}
      <ControlButtons />
    </div>
  );
}
```

### 3. **Phaser 3** を選ぶ理由

**メリット**
- ゲーム開発に必要な機能が全て揃っている
- 日本語の情報も比較的多い
- 学習曲線が緩やか
- ぷよぷよのような2Dゲームに最適

```javascript
// Phaserは直感的なAPI
class GameScene extends Phaser.Scene {
  create() {
    // スプライトの作成が簡単
    this.puyo = this.add.sprite(x, y, 'puyo-red');
    
    // 物理演算も簡単に追加
    this.physics.add.existing(this.puyo);
    
    // アニメーションも簡単
    this.tweens.add({
      targets: this.puyo,
      y: y + 100,
      duration: 500
    });
  }
}
```

### 4. **Tailwind CSS** を選ぶ理由

**メリット**
- CSSを別ファイルに書かなくて良い
- レスポンシブデザインが簡単
- 統一感のあるデザインが作りやすい

```jsx
// クラス名で直接スタイリング
<button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
  ゲーム開始
</button>
```

### 5. **Vite** を選ぶ理由

**メリット**
- 設定がほぼ不要（ゼロコンフィグ）
- 開発サーバーの起動が超高速
- HMR（Hot Module Replacement）で開発効率UP
- TypeScript対応が標準

### 6. **Zustand** を選ぶ理由

**メリット**
- Reduxより圧倒的にシンプル
- TypeScript対応が優秀
- 学習コストが低い

```typescript
// シンプルな状態管理
const useGameStore = create<GameState>((set) => ({
  score: 0,
  gtrCount: 0,
  incrementScore: (points) => set((state) => ({ 
    score: state.score + points 
  })),
}));
```

## 段階的な実装アプローチ

### Phase 1: 基礎構築（1-2週間）
```bash
# プロジェクトセットアップ
npm create vite@latest gtr-training -- --template react-ts
cd gtr-training
npm install phaser zustand tailwindcss
```

1. Reactの基本UIを作成
2. Phaserのシーンを1つ作成
3. 簡単なぷよの表示と落下

### Phase 2: ゲームロジック（2-3週間）
1. ぷよの操作（移動・回転）
2. 連鎖判定の実装
3. GTR判定ロジック

### Phase 3: 学習機能（2-3週間）
1. GTRガイド表示
2. フィードバックシステム
3. スコアリング

### Phase 4: ポリッシュ（1-2週間）
1. アニメーション追加
2. 効果音・BGM
3. レスポンシブ対応

## 学習リソース

### 必須の学習項目
1. **Phaser 3 基礎**（3-5日）
   - [公式チュートリアル](https://phaser.io/tutorials/making-your-first-phaser-3-game)
   - スプライト、物理演算、入力処理

2. **React + TypeScript**（既知の場合はスキップ）
   - Reactのライフサイクル
   - Hooks（特にuseEffect、useRef）

3. **ゲームループの概念**（1日）
   - Update/Draw サイクル
   - 60FPSの意味

### 推奨の学習順序
1. まずPhaserで簡単なものを作る（ぷよを落とすだけ）
2. Reactと統合する
3. 状態管理を追加
4. 機能を段階的に追加

## 代替案

もし上記が合わない場合の代替案：

### より簡単にしたい場合
```
言語: JavaScript（型なし）
フレームワーク: なし（Vanilla JS）
ゲームエンジン: Phaser 3 のみ
```

### よりモダンにしたい場合
```
言語: TypeScript
フレームワーク: Next.js 14
ゲームエンジン: PixiJS
状態管理: Jotai
```

### パフォーマンス重視の場合
```
言語: TypeScript
フレームワーク: SolidJS
ゲームエンジン: Canvas API 直接
```

## 開発環境セットアップ

### 必要なツール
```bash
# Node.js (v18以上推奨)
node --version

# VS Code 拡張機能
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript Vue Plugin
```

### 初期セットアップコマンド
```bash
# プロジェクト作成
npm create vite@latest gtr-training -- --template react-ts

# 依存関係インストール
cd gtr-training
npm install phaser@^3.70.0
npm install zustand
npm install -D tailwindcss postcss autoprefixer
npm install -D @types/node

# Tailwind CSS初期化
npx tailwindcss init -p

# 開発サーバー起動
npm run dev
```

## なぜこの構成が初心者に優しいか

1. **Phaser**がゲーム特有の処理を抽象化
   - 物理演算を自分で書かなくて良い
   - スプライト管理が楽
   - 当たり判定が簡単

2. **React**で通常のWeb開発の知識を活用
   - UIは慣れた方法で作れる
   - ゲーム部分だけに集中できる

3. **TypeScript**で安全に開発
   - 型エラーで実行前にバグを発見
   - 補完でAPIを覚えなくても書ける

4. **Vite**で環境構築の苦労なし
   - webpackの設定地獄を回避
   - すぐに開発を始められる

## よくある落とし穴と対策

### 1. ゲームループとReactの相性
```typescript
// ❌ 悪い例：stateを毎フレーム更新
const [puyoY, setPuyoY] = useState(0);
useEffect(() => {
  const interval = setInterval(() => {
    setPuyoY(y => y + 1); // 毎フレームre-renderで重い
  }, 16);
}, []);

// ✅ 良い例：Phaser内で完結
class GameScene extends Phaser.Scene {
  update() {
    this.puyo.y += 1; // Phaser内で処理
  }
}
```

### 2. 座標系の違い
- Phaser: 左上が原点
- ぷよぷよ: 左下が原点の場合もある
→ 変換レイヤーを作る

### 3. モバイル対応
- タッチ操作は最初から考慮
- レスポンシブは後から大変

## まとめ

この技術スタックなら：
- **1ヶ月**で基本機能が動く
- **2ヶ月**で学習機能まで完成
- **3ヶ月**でリリース可能な品質に

ゲームプログラミング未経験でも、Webエンジニアの経験を活かして効率的に開発できます。