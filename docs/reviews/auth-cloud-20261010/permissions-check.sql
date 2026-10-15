BEGIN;
SET LOCAL lock_timeout='4s';
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('90ced993-bb66-483a-aaf8-ff3393b2fdf2','gtr-auth-acceptance-a@example.invalid','{"full_name":"Acceptance A","role":"admin"}'),
 ('fa56e5d0-307d-429c-8f14-d7ac095888fc','gtr-auth-acceptance-b@example.invalid','{"full_name":"Acceptance B"}');
DO $check$ BEGIN
 IF (SELECT count(*) FROM public.profiles WHERE id IN ('90ced993-bb66-483a-aaf8-ff3393b2fdf2','fa56e5d0-307d-429c-8f14-d7ac095888fc') AND role='user') <> 2 THEN RAISE EXCEPTION 'Profile creation/default role failed'; END IF;
 IF has_table_privilege('anon','public.profiles','SELECT') THEN RAISE EXCEPTION 'Anonymous profile read enabled'; END IF;
 IF has_table_privilege('authenticated','public.profiles','INSERT') OR has_table_privilege('authenticated','public.profiles','DELETE') THEN RAISE EXCEPTION 'Profile creation/deletion permission too broad'; END IF;
END $check$;
SET LOCAL request.jwt.claim.sub='90ced993-bb66-483a-aaf8-ff3393b2fdf2';
SET LOCAL ROLE authenticated;
DO $check$ DECLARE changed integer; denied boolean:=false; BEGIN
 IF (SELECT count(*) FROM public.profiles) <> 1 THEN RAISE EXCEPTION 'Other-user visibility failed'; END IF;
 UPDATE public.profiles SET display_name='Acceptance renamed' WHERE id=auth.uid();
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Own display-name save failed'; END IF;
 UPDATE public.profiles SET display_name='Forbidden' WHERE id='fa56e5d0-307d-429c-8f14-d7ac095888fc';
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>0 THEN RAISE EXCEPTION 'Other-user update not blocked'; END IF;
 BEGIN UPDATE public.profiles SET role='admin' WHERE id=auth.uid(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Role escalation not blocked'; END IF;
 denied:=false;
 BEGIN UPDATE public.profiles SET created_at=now() WHERE id=auth.uid(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Protected timestamp update not blocked'; END IF;
END $check$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $check$ DECLARE denied boolean:=false; BEGIN
 BEGIN PERFORM * FROM public.profiles; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Anonymous read not blocked'; END IF;
END $check$;
RESET ROLE;
ROLLBACK;
