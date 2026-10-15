import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222'
const name = (id: string, n: number) => `${id}/00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}.webp`
async function database() {
  const db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA auth,storage,public TO anon,authenticated;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated;`)
  for (const file of ['20260930000000_initial.sql', '20261004000000_score_attack_history.sql',
    '20261004001000_compact_score_attack_history.sql', '20261010000000_profile_avatars.sql', '20261015000000_pre_release_security.sql']) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  }
  return db
}

it('closes unused legacy APIs without deleting data or breaking signup and self profile updates', async () => {
  const db = await database()
  try {
    await db.exec(`INSERT INTO auth.users(id) VALUES('${a}'),('${b}');
      INSERT INTO public.scores(user_id,mode,time_ms,score,gtr_count) VALUES('${a}','5GTR',1,1,1);
      INSERT INTO public.replays(user_id,data,size) VALUES('${a}','{}',2);`)
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET request.jwt.claim.sub='${a}'; SET ROLE ${role};`)
      for (const table of ['scores', 'replays']) {
        await expect(db.exec(`SELECT * FROM public.${table}`)).rejects.toThrow()
        await expect(db.exec(`INSERT INTO public.${table}(user_id) VALUES('${a}')`)).rejects.toThrow()
        await expect(db.exec(`DELETE FROM public.${table}`)).rejects.toThrow()
      }
      expect((await db.query<{ allowed: boolean }>("SELECT has_function_privilege(current_user,'public.handle_new_user()','EXECUTE') AS allowed")).rows[0].allowed).toBe(false)
      if (role === 'authenticated') {
        await db.exec("UPDATE public.profiles SET display_name='Updated' WHERE id=auth.uid()")
        expect((await db.query<{ display_name: string }>('SELECT display_name FROM public.profiles')).rows).toEqual([{ display_name: 'Updated' }])
        expect((await db.query('SELECT * FROM public.score_attack_games')).rows).toHaveLength(0)
      }
      await db.exec('RESET ROLE; RESET request.jwt.claim.sub;')
    }
    expect((await db.query('SELECT * FROM public.scores')).rows).toHaveLength(1)
    expect((await db.query('SELECT * FROM public.replays')).rows).toHaveLength(1)
    expect((await db.query<{ role: string }>('SELECT role FROM public.profiles')).rows.every(p => p.role === 'user')).toBe(true)
  } finally { await db.close() }
})

it('bounds avatar objects per owner, frees capacity on deletion and protects other users', async () => {
  const db = await database()
  try {
    await db.exec(`INSERT INTO auth.users(id) VALUES('${a}'),('${b}'); SET request.jwt.claim.sub='${a}'; SET ROLE authenticated;`)
    for (let i = 0; i < 10; i++) await db.query('INSERT INTO storage.objects VALUES($1,$2)', ['avatars', name(a, i)])
    await expect(db.query('INSERT INTO storage.objects VALUES($1,$2)', ['avatars', name(a, 10)])).rejects.toThrow()
    await db.query('DELETE FROM storage.objects WHERE name=$1', [name(a, 0)])
    await db.query('INSERT INTO storage.objects VALUES($1,$2)', ['avatars', name(a, 10)])
    await expect(db.query('INSERT INTO storage.objects VALUES($1,$2)', ['avatars', name(b, 11)])).rejects.toThrow()
    await db.exec(`RESET ROLE; SET request.jwt.claim.sub='${b}'; SET ROLE authenticated;`)
    await db.query('INSERT INTO storage.objects VALUES($1,$2)', ['avatars', name(b, 11)])
    expect((await db.query('SELECT * FROM storage.objects')).rows).toHaveLength(1)
    await db.exec('RESET ROLE; RESET request.jwt.claim.sub; SET ROLE authenticated;')
    expect((await db.query<{ allowed: boolean }>('SELECT public.avatar_upload_allowed() AS allowed')).rows[0].allowed).toBe(false)
    await db.exec('RESET ROLE; SET ROLE anon;')
    await expect(db.exec('SELECT public.avatar_upload_allowed()')).rejects.toThrow()
  } finally { await db.close() }
})
