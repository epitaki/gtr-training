-- ユーザープロフィール拡張テーブル
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  avatar_url TEXT,
  total_gtr_count INTEGER DEFAULT 0,
  best_time_5 INTEGER, -- 5GTRの最短時間(ms)
  best_time_10 INTEGER, -- 10GTRの最短時間(ms)
  best_time_20 INTEGER, -- 20GTRの最短時間(ms)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- スコアテーブル
CREATE TABLE public.scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('5GTR', '10GTR', '20GTR')),
  time_ms INTEGER NOT NULL,
  score INTEGER NOT NULL,
  gtr_count INTEGER NOT NULL,
  replay_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- リプレイテーブル（大きなデータの分離）
CREATE TABLE public.replays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  score_id UUID REFERENCES public.scores(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  size INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- パフォーマンス最適化用インデックス
CREATE INDEX idx_scores_mode_time ON public.scores(mode, time_ms);
CREATE INDEX idx_scores_created_at ON public.scores(created_at DESC);
CREATE INDEX idx_scores_user_mode ON public.scores(user_id, mode);
CREATE INDEX idx_profiles_username ON public.profiles(username);

-- ランキング取得用のビュー
CREATE VIEW public.rankings AS
SELECT 
  ROW_NUMBER() OVER (PARTITION BY mode ORDER BY time_ms ASC) as rank,
  p.username,
  s.mode,
  s.time_ms,
  s.score,
  s.gtr_count,
  s.created_at,
  s.user_id
FROM public.scores s
JOIN public.profiles p ON s.user_id = p.id
WHERE p.username IS NOT NULL;

-- Row Level Security (RLS) 設定
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replays ENABLE ROW LEVEL SECURITY;

-- プロフィール: 自分のプロフィールは編集可能、他人のは閲覧のみ
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- スコア: 自分のスコアは投稿可能、全てのスコアは閲覧可能
CREATE POLICY "Scores are viewable by everyone" ON public.scores
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own scores" ON public.scores
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- リプレイ: 自分のリプレイは投稿可能、全てのリプレイは閲覧可能
CREATE POLICY "Replays are viewable by everyone" ON public.replays
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own replays" ON public.replays
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- プロフィール自動作成のトリガー関数
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 新規ユーザー登録時にプロフィールを自動作成
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();