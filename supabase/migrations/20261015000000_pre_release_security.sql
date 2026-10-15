-- Retain old data, but retire unused public/direct-write APIs before release.
REVOKE ALL ON public.scores, public.replays FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_profile_updated_at() FROM PUBLIC, anon, authenticated;

-- Bound stored avatar objects as well as the existing per-file byte limit.
-- The lock serializes concurrent uploads by the same user. This function only
-- reads Storage metadata; object creation/deletion still uses the Storage API.
CREATE FUNCTION public.avatar_upload_allowed() RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id uuid := auth.uid();
BEGIN
  IF owner_id IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('gtr-avatar-quota:' || owner_id::text, 0));
  RETURN (SELECT count(*) FROM storage.objects
    WHERE bucket_id = 'avatars' AND name LIKE owner_id::text || '/%') < 10;
END;
$$;
REVOKE ALL ON FUNCTION public.avatar_upload_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.avatar_upload_allowed() TO authenticated;

ALTER POLICY avatars_insert_self ON storage.objects WITH CHECK (
  bucket_id = 'avatars'
  AND name ~ ('^' || (SELECT auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$')
  AND public.avatar_upload_allowed()
);
