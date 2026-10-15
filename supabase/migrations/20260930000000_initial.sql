-- Run in a NEW Supabase project. Existing projects use migrate-legacy-profiles.sql.
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (display_name = btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 50),
  avatar_url text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;
CREATE POLICY profiles_select_self ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);

CREATE FUNCTION public.touch_profile_updated_at() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER profiles_touch_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_profile_updated_at();

CREATE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE raw_name text;
BEGIN
  raw_name := btrim(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''));
  IF char_length(raw_name) < 1 OR char_length(raw_name) > 50 THEN raw_name := 'プレイヤー'; END IF;
  INSERT INTO public.profiles (id, display_name, role) VALUES (NEW.id, raw_name, 'user');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Covers users created before this SQL was installed.
INSERT INTO public.profiles (id, display_name, role)
SELECT id, CASE
  WHEN char_length(btrim(COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', ''))) BETWEEN 1 AND 50
  THEN btrim(COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', ''))
  ELSE 'プレイヤー' END, 'user'
FROM auth.users ON CONFLICT (id) DO NOTHING;

-- Preserve the existing game-record schema without exposing profile names.
CREATE TABLE public.scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('5GTR', '10GTR', '20GTR')),
  time_ms integer NOT NULL,
  score integer NOT NULL,
  gtr_count integer NOT NULL,
  replay_data jsonb,
  created_at timestamp DEFAULT now()
);
CREATE TABLE public.replays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  score_id uuid REFERENCES public.scores(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  size integer NOT NULL,
  created_at timestamp DEFAULT now()
);
CREATE INDEX idx_scores_mode_time ON public.scores(mode, time_ms);
CREATE INDEX idx_scores_created_at ON public.scores(created_at DESC);
CREATE INDEX idx_scores_user_mode ON public.scores(user_id, mode);
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replays ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scores, public.replays FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.scores, public.replays TO anon, authenticated;
GRANT INSERT ON public.scores, public.replays TO authenticated;
CREATE POLICY scores_select_public ON public.scores FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY scores_insert_self ON public.scores FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY replays_select_public ON public.replays FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY replays_insert_self ON public.replays FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
