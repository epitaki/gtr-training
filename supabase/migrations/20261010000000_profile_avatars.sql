-- Store private image paths; signed URLs exist only in the client, never in the DB.
ALTER TABLE public.profiles ADD COLUMN avatar_path text;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_avatar_path_owned CHECK (
  avatar_path IS NULL OR avatar_path ~ ('^' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$')
);
GRANT UPDATE (avatar_path) ON public.profiles TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', false, 262144, ARRAY['image/webp']);

CREATE POLICY avatars_select_self ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND name ~ ('^' || (SELECT auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'));
CREATE POLICY avatars_insert_self ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND name ~ ('^' || (SELECT auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'));
CREATE POLICY avatars_delete_self ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND name ~ ('^' || (SELECT auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'));
