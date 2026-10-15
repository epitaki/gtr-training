-- Private ten-round results. Writes only use authenticated, serialized RPCs.
CREATE TABLE public.score_attack_games (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  total_score integer NOT NULL CHECK (total_score BETWEEN 0 AND 1000),
  favorite boolean NOT NULL DEFAULT false,
  result jsonb NOT NULL CHECK (octet_length(result::text) <= 262144),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX score_attack_games_fifo ON public.score_attack_games (user_id, created_at, id);
ALTER TABLE public.score_attack_games ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.score_attack_games FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.score_attack_games TO authenticated;
CREATE POLICY score_attack_games_select_self ON public.score_attack_games FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE FUNCTION public.save_score_attack_game(p_id uuid, p_user_id uuid, p_result jsonb)
RETURNS public.score_attack_games
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  owner_id uuid := auth.uid();
  saved public.score_attack_games;
  oldest_id uuid;
  round_data jsonb;
  row_data jsonb;
  cell_data jsonb;
  points numeric;
  total integer := 0;
BEGIN
  IF owner_id IS NULL OR owner_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'ログインを確認してください' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR p_result IS NULL OR octet_length(p_result::text) > 262144
    OR jsonb_typeof(p_result) IS DISTINCT FROM 'object'
    OR p_result->>'version' IS DISTINCT FROM '1'
    OR jsonb_typeof(p_result->'rounds') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION '保存する結果が正しくありません' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_result->'rounds') <> 10 THEN
    RAISE EXCEPTION '10回分の結果が必要です' USING ERRCODE = '22023';
  END IF;
  FOR round_data IN SELECT value FROM jsonb_array_elements(p_result->'rounds') LOOP
    IF jsonb_typeof(round_data#>'{snapshot,grid}') IS DISTINCT FROM 'array'
      OR jsonb_typeof(round_data#>'{evaluation,analysis,score,totalScore}') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION '盤面と採点結果が必要です' USING ERRCODE = '22023';
    END IF;
    points := (round_data#>>'{evaluation,analysis,score,totalScore}')::numeric;
    IF points < 0 OR points > 100 OR points <> trunc(points) OR jsonb_array_length(round_data#>'{snapshot,grid}') <> 13 THEN
      RAISE EXCEPTION '盤面または点数が正しくありません' USING ERRCODE = '22023';
    END IF;
    FOR row_data IN SELECT value FROM jsonb_array_elements(round_data#>'{snapshot,grid}') LOOP
      IF jsonb_typeof(row_data) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION '盤面の行が正しくありません' USING ERRCODE = '22023';
      END IF;
      IF jsonb_array_length(row_data) <> 6 THEN
        RAISE EXCEPTION '盤面の列数が正しくありません' USING ERRCODE = '22023';
      END IF;
      FOR cell_data IN SELECT value FROM jsonb_array_elements(row_data) LOOP
        IF cell_data NOT IN ('null'::jsonb, '"red"'::jsonb, '"green"'::jsonb, '"blue"'::jsonb, '"yellow"'::jsonb) THEN
          RAISE EXCEPTION '盤面の色が正しくありません' USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END LOOP;
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
    SELECT id INTO oldest_id FROM public.score_attack_games
      WHERE user_id = owner_id AND NOT favorite ORDER BY created_at, id LIMIT 1;
    IF oldest_id IS NULL THEN
      RAISE EXCEPTION '100ゲームすべてがお気に入りです。お気に入りを解除してから保存してください' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.score_attack_games WHERE user_id = owner_id AND id = oldest_id AND NOT favorite;
  END IF;
  INSERT INTO public.score_attack_games(user_id, id, total_score, result)
    VALUES(owner_id, p_id, total, p_result) RETURNING * INTO saved;
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.save_score_attack_game(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_score_attack_game(uuid, uuid, jsonb) TO authenticated;

CREATE FUNCTION public.set_score_attack_favorite(p_id uuid, p_user_id uuid, p_favorite boolean)
RETURNS public.score_attack_games
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id uuid := auth.uid(); saved public.score_attack_games;
BEGIN
  IF owner_id IS NULL OR owner_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'ログインを確認してください' USING ERRCODE = '42501';
  END IF;
  IF p_favorite IS NULL THEN RAISE EXCEPTION 'お気に入りの指定が必要です' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('gtr-score-history:' || owner_id::text, 0));
  UPDATE public.score_attack_games SET favorite = p_favorite WHERE user_id = owner_id AND id = p_id RETURNING * INTO saved;
  IF NOT FOUND THEN RAISE EXCEPTION '保存したゲームが見つかりません' USING ERRCODE = 'P0002'; END IF;
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.set_score_attack_favorite(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_score_attack_favorite(uuid, uuid, boolean) TO authenticated;
