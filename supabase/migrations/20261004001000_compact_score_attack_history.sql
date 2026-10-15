-- Compact v2: one 39-character board and one 3-character placement per committed turn.
CREATE OR REPLACE FUNCTION public.save_score_attack_game(p_id uuid, p_user_id uuid, p_result jsonb)
RETURNS public.score_attack_games
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  owner_id uuid := auth.uid(); saved public.score_attack_games; oldest_id uuid;
  round_data jsonb; points numeric; total integer := 0;
BEGIN
  IF owner_id IS NULL OR owner_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'ログインを確認してください' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR p_result IS NULL OR octet_length(p_result::text) > 262144
    OR jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR p_result->>'version' IS DISTINCT FROM '2'
    OR jsonb_typeof(p_result->'scoringVersion') IS DISTINCT FROM 'string'
    OR length(p_result->>'scoringVersion') > 100 OR jsonb_typeof(p_result->'rounds') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION '保存する結果が正しくありません' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_result->'rounds') <> 10 THEN
    RAISE EXCEPTION '10回分の結果が必要です' USING ERRCODE = '22023';
  END IF;
  FOR round_data IN SELECT value FROM jsonb_array_elements(p_result->'rounds') LOOP
    IF jsonb_typeof(round_data->'board') IS DISTINCT FROM 'string' OR (round_data->>'board') !~ '^[A-Za-z0-9_-]{39}$'
      OR jsonb_typeof(round_data->'score') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION '盤面と採点結果が必要です' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(round_data->'score') <> 8 OR jsonb_typeof(round_data#>'{score,0}') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION '採点結果が正しくありません' USING ERRCODE = '22023';
    END IF;
    IF round_data->'current' IS DISTINCT FROM 'null'::jsonb AND
      (jsonb_typeof(round_data->'current') IS DISTINCT FROM 'string' OR (round_data->>'current') !~ '^[A-Za-z0-9_-]{3}$') THEN
      RAISE EXCEPTION '現在の組が正しくありません' USING ERRCODE = '22023';
    END IF;
    IF round_data ? 'moves' AND (jsonb_typeof(round_data->'moves') IS DISTINCT FROM 'string'
      OR (round_data->>'moves') !~ '^[A-Za-z0-9_-]*$' OR length(round_data->>'moves') % 3 <> 0 OR length(round_data->>'moves') > 30000) THEN
      RAISE EXCEPTION '手順が正しくありません' USING ERRCODE = '22023';
    END IF;
    points := (round_data#>>'{score,0}')::numeric;
    IF points < 0 OR points > 100 OR points <> trunc(points) THEN
      RAISE EXCEPTION '点数が正しくありません' USING ERRCODE = '22023';
    END IF;
    total := total + points::integer;
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('gtr-score-history:' || owner_id::text, 0));
  SELECT * INTO saved FROM public.score_attack_games WHERE user_id = owner_id AND id = p_id;
  IF FOUND THEN
    IF saved.result IS DISTINCT FROM p_result THEN
      RAISE EXCEPTION '同じゲームIDに異なる結果は保存できません' USING ERRCODE = '22023';
    END IF;
    RETURN saved;
  END IF;
  IF (SELECT count(*) FROM public.score_attack_games WHERE user_id = owner_id) >= 100 THEN
    SELECT id INTO oldest_id FROM public.score_attack_games WHERE user_id = owner_id AND NOT favorite ORDER BY created_at,id LIMIT 1;
    IF oldest_id IS NULL THEN
      RAISE EXCEPTION '100ゲームすべてがお気に入りです。お気に入りを解除してから保存してください' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.score_attack_games WHERE user_id = owner_id AND id = oldest_id AND NOT favorite;
  END IF;
  INSERT INTO public.score_attack_games(user_id,id,total_score,result) VALUES(owner_id,p_id,total,p_result) RETURNING * INTO saved;
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.save_score_attack_game(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_score_attack_game(uuid,uuid,jsonb) TO authenticated;
