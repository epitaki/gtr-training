import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

it('makes the avatar bucket private and isolates object operations and profile paths by owner', async () => {
  const db = new PGlite()
  const a = '11111111-1111-4111-8111-111111111111'
  const b = '22222222-2222-4222-8222-222222222222'
  const file = '33333333-3333-4333-8333-333333333333.webp'
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, raw_user_meta_data jsonb DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      CREATE TABLE storage.objects (bucket_id text, name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA auth,storage,public TO anon,authenticated;
      GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated;`)
    await db.exec(readFileSync('supabase/migrations/20260930000000_initial.sql', 'utf8'))
    await db.exec(readFileSync('supabase/migrations/20261010000000_profile_avatars.sql', 'utf8'))
    await db.exec(`INSERT INTO auth.users (id) VALUES ('${a}'),('${b}');
      INSERT INTO storage.objects VALUES ('avatars','${b}/${file}');`)
    expect((await db.query('SELECT public,file_size_limit,allowed_mime_types FROM storage.buckets')).rows[0]).toEqual({ public: false, file_size_limit: 262144, allowed_mime_types: ['image/webp'] })
    await db.exec(`SET request.jwt.claim.sub='${a}'; SET ROLE authenticated;`)
    await db.exec(`INSERT INTO storage.objects VALUES ('avatars','${a}/${file}');
      UPDATE public.profiles SET avatar_path='${a}/${file}' WHERE id=auth.uid();`)
    expect((await db.query('SELECT name FROM storage.objects')).rows).toEqual([{ name: `${a}/${file}` }])
    await expect(db.exec(`INSERT INTO storage.objects VALUES ('avatars','${b}/${file}')`)).rejects.toThrow()
    await expect(db.exec(`INSERT INTO storage.objects VALUES ('avatars','${a}/bad.svg')`)).rejects.toThrow()
    await expect(db.exec(`UPDATE public.profiles SET avatar_path='${b}/${file}' WHERE id=auth.uid()`)).rejects.toThrow()
    await expect(db.exec(`UPDATE public.profiles SET role='admin' WHERE id=auth.uid()`)).rejects.toThrow()
    await expect(db.exec(`UPDATE public.profiles SET avatar_url='https://arbitrary.invalid' WHERE id=auth.uid()`)).rejects.toThrow()
    expect((await db.query(`DELETE FROM storage.objects WHERE name='${b}/${file}' RETURNING name`)).rows).toHaveLength(0)
    expect((await db.query(`UPDATE storage.objects SET name='${a}/other.webp' RETURNING name`)).rows).toHaveLength(0)
    await db.exec(`DELETE FROM storage.objects WHERE name='${a}/${file}'; UPDATE public.profiles SET avatar_path=NULL WHERE id=auth.uid();`)
    await db.exec('RESET ROLE; SET ROLE anon;')
    expect((await db.query('SELECT * FROM storage.objects')).rows).toHaveLength(0)
    await expect(db.exec(`INSERT INTO storage.objects VALUES ('avatars','${a}/${file}')`)).rejects.toThrow()
    await db.exec('RESET ROLE;')
    expect((await db.query('SELECT name FROM storage.objects')).rows).toEqual([{ name: `${b}/${file}` }])
  } finally { await db.close() }
})
