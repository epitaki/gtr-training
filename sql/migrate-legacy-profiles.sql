-- Run on an existing database initialized by the historical initial-setup.sql.
BEGIN;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text;
UPDATE public.profiles SET display_name = CASE
  WHEN username IS NOT NULL AND username !~ '@' AND char_length(btrim(username)) BETWEEN 1 AND 50 THEN btrim(username)
  ELSE 'プレイヤー' END
WHERE display_name IS NULL OR char_length(btrim(display_name)) NOT BETWEEN 1 AND 50;
UPDATE public.profiles SET role = 'user' WHERE role IS NULL OR role NOT IN ('user', 'admin');
ALTER TABLE public.profiles ALTER COLUMN display_name SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'user';
ALTER TABLE public.profiles ALTER COLUMN role SET NOT NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_display_name_check CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 50);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'));
ALTER TABLE public.profiles ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE public.profiles ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
UPDATE public.profiles SET created_at = now() WHERE created_at IS NULL;
UPDATE public.profiles SET updated_at = now() WHERE updated_at IS NULL;
ALTER TABLE public.profiles ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.profiles ALTER COLUMN updated_at SET DEFAULT now();
-- Historical username, rankings and game statistics remain stored.
REVOKE ALL ON public.rankings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT (id, display_name, avatar_url, role, created_at, updated_at) ON public.profiles TO authenticated;
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
INSERT INTO public.profiles (id, display_name, role)
SELECT id, CASE
  WHEN char_length(btrim(COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', ''))) BETWEEN 1 AND 50
  THEN btrim(COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', ''))
  ELSE 'プレイヤー' END, 'user'
FROM auth.users ON CONFLICT (id) DO NOTHING;
COMMIT;
