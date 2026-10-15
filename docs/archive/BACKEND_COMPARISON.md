# バックエンド構成比較表

## 各構成の詳細比較

### 📊 比較表

| 項目 | Supabase構成 | Firebase構成 | 従来型構成 | サーバーレス構成 |
|------|------------|------------|----------|--------------|
| **初期コスト** | 無料 | 無料 | 月$5〜 | 従量課金 |
| **セットアップ時間** | 1時間 | 2時間 | 1日 | 半日 |
| **学習コスト** | 低 | 低 | 中 | 高 |
| **スケーラビリティ** | 高 | 高 | 中 | 最高 |
| **リアルタイム機能** | ◎ | ◎ | △ | △ |
| **開発体験** | ◎ | ○ | ◎ | △ |

## 推奨構成：Supabase + Hono

### なぜSupabaseがおすすめか

```typescript
// 1. セットアップが圧倒的に簡単
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(url, key)

// 2. リアルタイムランキングが簡単
supabase
  .channel('rankings')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'scores' },
    (payload) => {
      updateRankings(payload.new)
    }
  )
  .subscribe()

// 3. 認証も1行
const { user } = await supabase.auth.signInWithOAuth({
  provider: 'google'
})
```

### 必要なバックエンド機能と実装方法

#### 1. ユーザー管理
```sql
-- Supabaseで自動作成されるテーブル
CREATE TABLE auth.users (
  id UUID PRIMARY KEY,
  email TEXT,
  created_at TIMESTAMP
);

-- プロフィール拡張
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users,
  username TEXT UNIQUE,
  avatar_url TEXT,
  total_gtr_count INTEGER DEFAULT 0,
  best_time_5 INTEGER,
  best_time_10 INTEGER,
  best_time_20 INTEGER
);
```

#### 2. スコア・ランキング管理
```sql
-- スコアテーブル
CREATE TABLE scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  mode TEXT NOT NULL, -- '5GTR', '10GTR', '20GTR'
  time_ms INTEGER NOT NULL,
  score INTEGER NOT NULL,
  replay_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- インデックスで高速化
CREATE INDEX idx_scores_mode_time ON scores(mode, time_ms);
CREATE INDEX idx_scores_created_at ON scores(created_at DESC);

-- ランキング取得用のビュー
CREATE VIEW rankings AS
SELECT 
  ROW_NUMBER() OVER (PARTITION BY mode ORDER BY time_ms) as rank,
  username,
  mode,
  time_ms,
  score,
  created_at
FROM scores
JOIN profiles ON scores.user_id = profiles.id;
```

#### 3. リプレイデータ保存
```typescript
// Honoでのエンドポイント例
import { Hono } from 'hono'

const app = new Hono()

app.post('/api/replay', async (c) => {
  const { userId, replay } = await c.req.json()
  
  // リプレイデータを圧縮して保存
  const compressed = compressReplay(replay)
  
  const { data, error } = await supabase
    .from('replays')
    .insert({
      user_id: userId,
      data: compressed,
      size: compressed.length
    })
  
  return c.json({ success: !error })
})
```

### API設計

```typescript
// Hono + Supabaseの組み合わせ
import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()
app.use('*', cors())

// ランキング取得
app.get('/api/rankings/:mode', async (c) => {
  const mode = c.req.param('mode')
  const { data } = await supabase
    .from('rankings')
    .select('*')
    .eq('mode', mode)
    .limit(100)
  
  return c.json(data)
})

// スコア投稿
app.post('/api/scores', async (c) => {
  const score = await c.req.json()
  
  // スコア検証
  if (!validateScore(score)) {
    return c.json({ error: 'Invalid score' }, 400)
  }
  
  const { data, error } = await supabase
    .from('scores')
    .insert(score)
  
  return c.json({ success: !error })
})

// ユーザー統計
app.get('/api/users/:id/stats', async (c) => {
  const userId = c.req.param('id')
  
  const { data } = await supabase
    .from('profiles')
    .select(`
      *,
      scores (
        mode,
        time_ms,
        created_at
      )
    `)
    .eq('id', userId)
    .single()
  
  return c.json(data)
})
```

## 段階的な実装計画

### Phase 1: フロントエンドのみ（1ヶ月目）
- ローカルストレージでデータ保存
- バックエンドなし
- オフラインで完結

### Phase 2: 基本的なバックエンド（2ヶ月目）
```typescript
// 最小限のSupabase設定
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

// スコア保存だけ実装
async function saveScore(score: Score) {
  await supabase.from('scores').insert(score)
}

// ランキング取得だけ実装
async function getRankings(mode: string) {
  const { data } = await supabase
    .from('scores')
    .select('*')
    .eq('mode', mode)
    .order('time_ms')
    .limit(10)
  return data
}
```

### Phase 3: 認証追加（2.5ヶ月目）
```typescript
// Google認証追加
const { user } = await supabase.auth.signInWithOAuth({
  provider: 'google'
})

// ユーザープロフィール作成
await supabase.from('profiles').insert({
  id: user.id,
  username: user.email.split('@')[0]
})
```

### Phase 4: リアルタイム機能（3ヶ月目）
```typescript
// リアルタイムランキング更新
supabase
  .channel('game-updates')
  .on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState()
    updateOnlineUsers(state)
  })
  .on('broadcast', { event: 'new-score' }, (payload) => {
    updateLiveRankings(payload)
  })
  .subscribe()
```

### Phase 5: 対戦機能（将来）
```typescript
// WebRTCデータチャネル（Supabase Realtime経由）
const channel = supabase.channel('match-room')

// シグナリング
channel.on('broadcast', { event: 'offer' }, async (payload) => {
  await handleOffer(payload.offer)
})

// ゲーム状態同期
channel.on('broadcast', { event: 'game-state' }, (payload) => {
  syncGameState(payload.state)
})
```

## コスト見積もり

### Supabase（推奨）
```
無料枠:
- 500MB データベース
- 2GB 帯域幅
- 50,000 MAU（月間アクティブユーザー）
- 無制限のAPIリクエスト

予想コスト:
- 〜1000ユーザー: 無料
- 〜10000ユーザー: 無料
- 10000+ユーザー: 月$25〜
```

### Firebase
```
無料枠:
- 1GB Firestore
- 10GB 帯域幅
- 50,000 読み取り/日
- 20,000 書き込み/日

予想コスト:
- 〜500ユーザー: 無料
- 〜5000ユーザー: 月$10〜
- 5000+ユーザー: 月$50〜
```

## セキュリティ考慮事項

### Row Level Security (RLS) 設定
```sql
-- Supabaseのセキュリティルール
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のスコアのみ編集可能
CREATE POLICY "Users can insert own scores" ON scores
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ランキングは誰でも閲覧可能
CREATE POLICY "Scores are viewable by everyone" ON scores
  FOR SELECT USING (true);

-- スコアの更新・削除は禁止
CREATE POLICY "Scores cannot be updated" ON scores
  FOR UPDATE USING (false);
```

### API レート制限
```typescript
// Honoでレート制限
import { rateLimiter } from 'hono-rate-limiter'

app.use('/api/*', rateLimiter({
  windowMs: 60 * 1000, // 1分
  max: 30, // 30リクエスト
  message: 'Too many requests'
}))
```

### スコア検証
```typescript
function validateScore(score: Score): boolean {
  // 理論的に可能な最速時間
  const minTime = score.gtrCount * 5000 // 5秒/GTR
  
  if (score.timeMs < minTime) {
    return false // チート判定
  }
  
  // リプレイデータとの整合性チェック
  if (score.replay) {
    const calculatedScore = calculateFromReplay(score.replay)
    if (Math.abs(calculatedScore - score.score) > 10) {
      return false
    }
  }
  
  return true
}
```

## まとめ

### 初心者におすすめの進め方

1. **最初はバックエンドなし**でフロントエンドに集中
2. **2ヶ月目にSupabase**を追加（1時間で設定完了）
3. **必要に応じて機能追加**（認証、リアルタイム）

### Supabaseを選ぶメリット

- ✅ **無料**で始められる
- ✅ **設定が簡単**（GUI操作で完了）
- ✅ **リアルタイム機能**が標準装備
- ✅ **TypeScript対応**が優秀
- ✅ **PostgreSQL**なので後で移行も可能

### 避けるべきこと

- ❌ 最初から複雑な構成にしない
- ❌ AWSから始めない（学習コストが高い）
- ❌ 自前でWebSocketサーバーを立てない
- ❌ 認証を自作しない