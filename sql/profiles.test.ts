import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

const userA = '11111111-1111-4111-8111-111111111111'
const userB = '22222222-2222-4222-8222-222222222222'
const open: PGlite[] = []

async function database(): Promise<PGlite> {
  const db = new PGlite()
  open.push(db)
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; GRANT authenticated TO postgres;
    CREATE SCHEMA auth; CREATE TABLE auth.users (
      id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb
    );
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;`)
  return db
}

async function asUser<T>(db: PGlite, id: string, callback: () => Promise<T>): Promise<T> {
  await db.exec(`SET request.jwt.claim.sub = '${id}'; SET ROLE authenticated;`)
  try { return await callback() }
  finally { await db.exec('RESET ROLE; RESET request.jwt.claim.sub;') }
}

afterEach(async () => { await Promise.all(open.splice(0).map(db => db.close())) })

describe('profile SQL', () => {
  it('preserves game record tables, constraints, indexes and owner-only inserts', async () => {
    const db = await database()
    await db.exec(readFileSync(resolve('supabase/migrations/20260930000000_initial.sql'), 'utf8'))
    await db.exec(`INSERT INTO auth.users (id,email) VALUES ('${userA}','a@example.test'),('${userB}','b@example.test')`)
    const columns = await db.query<{ table_name: string; column_name: string }>("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('scores','replays')")
    expect(columns.rows.filter(row => row.table_name === 'scores').map(row => row.column_name)).toEqual(expect.arrayContaining(['id', 'user_id', 'mode', 'time_ms', 'score', 'gtr_count', 'replay_data', 'created_at']))
    expect(columns.rows.filter(row => row.table_name === 'replays').map(row => row.column_name)).toEqual(expect.arrayContaining(['id', 'user_id', 'score_id', 'data', 'size', 'created_at']))
    const indexes = await db.query<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='scores'")
    expect(indexes.rows.map(row => row.indexname)).toEqual(expect.arrayContaining(['idx_scores_mode_time', 'idx_scores_created_at', 'idx_scores_user_mode']))
    let scoreId = ''
    await asUser(db, userA, async () => {
      const score = await db.query<{ id: string }>(`INSERT INTO public.scores (user_id,mode,time_ms,score,gtr_count) VALUES ('${userA}','5GTR',1200,100,5) RETURNING id`)
      scoreId = score.rows[0].id
      await db.exec(`INSERT INTO public.replays (user_id,score_id,data,size) VALUES ('${userA}','${scoreId}','{}',2)`)
      await expect(db.exec(`INSERT INTO public.scores (user_id,mode,time_ms,score,gtr_count) VALUES ('${userA}','INVALID',1200,100,5)`)).rejects.toThrow()
      await expect(db.exec(`INSERT INTO public.replays (user_id,score_id,data,size) VALUES ('${userA}','33333333-3333-4333-8333-333333333333','{}',2)`)).rejects.toThrow()
      await expect(db.exec(`UPDATE public.scores SET score=999 WHERE id='${scoreId}'`)).rejects.toThrow()
      await expect(db.exec(`DELETE FROM public.replays WHERE score_id='${scoreId}'`)).rejects.toThrow()
    })
    await asUser(db, userB, async () => {
      await expect(db.exec(`INSERT INTO public.scores (user_id,mode,time_ms,score,gtr_count) VALUES ('${userA}','5GTR',1200,100,5)`)).rejects.toThrow()
      await expect(db.exec(`INSERT INTO public.replays (user_id,score_id,data,size) VALUES ('${userA}','${scoreId}','{}',2)`)).rejects.toThrow()
      expect((await db.query('SELECT id FROM public.scores')).rows).toHaveLength(1)
      expect((await db.query('SELECT id FROM public.replays')).rows).toHaveLength(1)
    })
    await db.exec('SET ROLE anon')
    expect((await db.query('SELECT id FROM public.scores')).rows).toHaveLength(1)
    expect((await db.query('SELECT id FROM public.replays')).rows).toHaveLength(1)
    await expect(db.exec(`INSERT INTO public.scores (user_id,mode,time_ms,score,gtr_count) VALUES ('${userA}','5GTR',1200,100,5)`)).rejects.toThrow()
    await db.exec('RESET ROLE')
  })

  it('creates fixed user roles and isolates profile reads/columns', async () => {
    const db = await database()
    await db.exec(`INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES ('${userB}', 'b@example.test', '{"full_name":"Bob"}')`)
    await db.exec(readFileSync(resolve('supabase/migrations/20260930000000_initial.sql'), 'utf8'))
    await db.exec(`INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES
      ('${userA}', 'a@example.test', '{"full_name":"Alice","role":"admin"}')`)
    const rows = await db.query<{ id: string; role: string; display_name: string }>('SELECT id,role,display_name FROM public.profiles ORDER BY id')
    expect(rows.rows.map(row => row.role)).toEqual(['user', 'user'])
    expect(rows.rows[0].display_name).toBe('Alice')
    await asUser(db, userA, async () => {
      const self = await db.query('SELECT id,display_name FROM public.profiles')
      expect(self.rows).toHaveLength(1)
      const before = await db.query<{ created_at: string; updated_at: string }>('SELECT created_at,updated_at FROM public.profiles')
      await new Promise(resolve => setTimeout(resolve, 20))
      await db.exec("UPDATE public.profiles SET display_name = 'Alicia' WHERE id = auth.uid()")
      const stamp = await db.query<{ created_at: string; updated_at: string }>('SELECT created_at,updated_at FROM public.profiles')
      expect(stamp.rows[0].created_at).toEqual(before.rows[0].created_at)
      expect(new Date(stamp.rows[0].updated_at).valueOf()).toBeGreaterThan(new Date(before.rows[0].updated_at).valueOf())
      await expect(db.exec("UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid()")).rejects.toThrow()
      await expect(db.exec('UPDATE public.profiles SET created_at = now() WHERE id = auth.uid()')).rejects.toThrow()
      await expect(db.exec(`INSERT INTO public.profiles (id, display_name) VALUES ('33333333-3333-4333-8333-333333333333', 'Bad')`)).rejects.toThrow()
      await expect(db.exec(`DELETE FROM public.profiles WHERE id = auth.uid()`)).rejects.toThrow()
      const other = await db.query(`SELECT * FROM public.profiles WHERE id = '${userB}'`)
      expect(other.rows).toHaveLength(0)
    })
    await db.exec('SET ROLE anon')
    await expect(db.exec('SELECT * FROM public.profiles')).rejects.toThrow()
    await db.exec('RESET ROLE')
  })

  it('migrates legacy stats while closing historical public access', async () => {
    const db = await database()
    await db.exec(`CREATE TABLE public.profiles (
      id uuid PRIMARY KEY REFERENCES auth.users(id), username text UNIQUE, avatar_url text,
      total_gtr_count integer DEFAULT 0, best_time_5 integer, best_time_10 integer,
      best_time_20 integer, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now());
      CREATE TABLE public.scores (id uuid PRIMARY KEY, user_id uuid, mode text, time_ms integer, score integer, gtr_count integer, created_at timestamp DEFAULT now());
      CREATE TABLE public.replays (id uuid PRIMARY KEY, user_id uuid, data jsonb);
      CREATE VIEW public.rankings AS SELECT p.username,s.mode,s.time_ms FROM public.scores s JOIN public.profiles p ON p.id=s.user_id;
      GRANT ALL ON public.profiles,public.scores,public.replays TO anon,authenticated;
      GRANT SELECT ON public.rankings TO anon;
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.replays ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
      CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
      CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
      CREATE POLICY "Scores are viewable by everyone" ON public.scores FOR SELECT USING (true);
      CREATE POLICY "Users can insert own scores" ON public.scores FOR INSERT WITH CHECK (auth.uid() = user_id);
      CREATE POLICY "Replays are viewable by everyone" ON public.replays FOR SELECT USING (true);
      CREATE POLICY "Users can insert own replays" ON public.replays FOR INSERT WITH CHECK (auth.uid() = user_id);`)
    await db.exec(`INSERT INTO auth.users (id,email) VALUES ('${userA}','a@example.test'),('${userB}','b@example.test');
      INSERT INTO public.profiles (id,username,total_gtr_count,created_at,updated_at) VALUES ('${userA}','a@example.test',12,NULL,NULL),('${userB}','Bob',7,now(),now());`)
    await db.exec(readFileSync(resolve('sql/migrate-legacy-profiles.sql'), 'utf8'))
    const rows = await db.query<{ username: string; display_name: string; total_gtr_count: number; role: string }>('SELECT username,display_name,total_gtr_count,role FROM public.profiles ORDER BY id')
    expect(rows.rows[0]).toMatchObject({ username: 'a@example.test', display_name: 'プレイヤー', total_gtr_count: 12, role: 'user' })
    expect(rows.rows[1]).toMatchObject({ username: 'Bob', display_name: 'Bob', total_gtr_count: 7, role: 'user' })
    const dates = await db.query<{ created_at: string; updated_at: string }>(`SELECT created_at, updated_at FROM public.profiles WHERE id='${userA}'`)
    expect(dates.rows[0].created_at).toBeTruthy()
    expect(dates.rows[0].updated_at).toBeTruthy()
    await asUser(db, userA, async () => {
      const self = await db.query('SELECT id,display_name FROM public.profiles')
      expect(self.rows).toHaveLength(1)
      await expect(db.exec('SELECT username FROM public.profiles')).rejects.toThrow()
      await expect(db.exec("UPDATE public.profiles SET role='admin'")).rejects.toThrow()
      await db.exec('SELECT * FROM public.scores')
    })
    await db.exec('SET ROLE anon')
    await expect(db.exec('SELECT * FROM public.profiles')).rejects.toThrow()
    await expect(db.exec('SELECT * FROM public.rankings')).rejects.toThrow()
    await db.exec('RESET ROLE')
  })
})
