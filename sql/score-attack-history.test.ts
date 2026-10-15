import { readFileSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

const userA = '11111111-1111-4111-8111-111111111111', userB = '22222222-2222-4222-8222-222222222222'
const gameId = (index: number) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`
const result = { version: 2, scoringVersion: 'masked-foundation-minimal-v2', rounds: Array.from({ length: 10 }, () => ({
  board: 'A'.repeat(39), current: null, moves: '', score: [0, 0, 0, 0, 0, 0, 0, 0],
})) }
const open: PGlite[] = []
async function database() {
  const db = new PGlite(); open.push(db)
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; GRANT authenticated TO postgres;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${userA}'), ('${userB}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;`)
  await db.exec(readFileSync('supabase/migrations/20261004000000_score_attack_history.sql', 'utf8'))
  await db.exec(readFileSync('supabase/migrations/20261004001000_compact_score_attack_history.sql', 'utf8'))
  return db
}
async function asUser<T>(db: PGlite, id: string, work: () => Promise<T>) {
  await db.exec(`SET request.jwt.claim.sub='${id}'; SET ROLE authenticated;`)
  try { return await work() } finally { await db.exec('RESET ROLE; RESET request.jwt.claim.sub;') }
}
const save = (db: PGlite, index: number, owner = userA, data: unknown = result) => db.query(
  'SELECT * FROM public.save_score_attack_game($1::uuid,$2::uuid,$3::jsonb)', [gameId(index), owner, JSON.stringify(data)])
const favorite = (db: PGlite, index: number, value: boolean, owner = userA) => db.query(
  'SELECT * FROM public.set_score_attack_favorite($1::uuid,$2::uuid,$3::boolean)', [gameId(index), owner, value])
afterEach(async () => { await Promise.all(open.splice(0).map(db => db.close())) })

it('keeps private owner results and refuses guest, identity mismatch and direct writes', async () => {
  const db = await database()
  await asUser(db, userA, async () => {
    await save(db, 1)
    expect((await db.query('SELECT * FROM public.score_attack_games')).rows).toHaveLength(1)
    await expect(save(db, 2, userB)).rejects.toThrow()
    await expect(db.exec(`INSERT INTO public.score_attack_games(user_id,id,total_score,result) VALUES ('${userA}','${gameId(2)}',0,'{}')`)).rejects.toThrow()
    await expect(db.exec('UPDATE public.score_attack_games SET favorite=true')).rejects.toThrow()
    await expect(db.exec('DELETE FROM public.score_attack_games')).rejects.toThrow()
  })
  await asUser(db, userB, async () => {
    expect((await db.query('SELECT * FROM public.score_attack_games')).rows).toHaveLength(0)
    await expect(favorite(db, 1, true, userA)).rejects.toThrow()
    await save(db, 1, userB)
    expect((await db.query('SELECT * FROM public.score_attack_games')).rows).toHaveLength(1)
  })
  await db.exec('SET ROLE anon')
  await expect(db.query('SELECT * FROM public.score_attack_games')).rejects.toThrow()
  await expect(save(db, 3)).rejects.toThrow()
})

it('evicts the oldest nonfavorite at 101 and a retry neither evicts nor changes date/favorite', async () => {
  const db = await database()
  await asUser(db, userA, async () => {
    for (let i = 1; i <= 100; i++) await save(db, i)
    await favorite(db, 1, true)
    const before = await save(db, 1)
    await save(db, 101)
    const rows = (await db.query<{ id: string; favorite: boolean }>('SELECT id,favorite FROM public.score_attack_games ORDER BY created_at,id')).rows
    expect(rows).toHaveLength(100)
    expect(rows.some(row => row.id === gameId(1) && row.favorite)).toBe(true)
    expect(rows.some(row => row.id === gameId(2))).toBe(false)
    await save(db, 101)
    expect((await save(db, 1)).rows).toEqual(before.rows)
    expect((await db.query('SELECT id FROM public.score_attack_games')).rows).toHaveLength(100)
    await save(db, 102)
    expect((await db.query('SELECT id FROM public.score_attack_games WHERE id=$1', [gameId(3)])).rows).toHaveLength(0)
  })
})

it('protects all 100 favorites and resumes after one is released', async () => {
  const db = await database()
  await asUser(db, userA, async () => {
    for (let i = 1; i <= 100; i++) { await save(db, i); await favorite(db, i, true) }
    await expect(save(db, 101)).rejects.toThrow(/100ゲームすべて/)
    expect((await db.query('SELECT id FROM public.score_attack_games WHERE favorite')).rows).toHaveLength(100)
    await favorite(db, 50, false)
    await save(db, 101)
    expect((await db.query('SELECT id FROM public.score_attack_games')).rows).toHaveLength(100)
    expect((await db.query('SELECT id FROM public.score_attack_games WHERE id=$1', [gameId(50)])).rows).toHaveLength(0)
  })
})

it('validates the ten-round size, score and grid and refuses changed id reuse', async () => {
  const db = await database()
  await asUser(db, userA, async () => {
    await expect(save(db, 1, userA, { ...result, rounds: result.rounds.slice(1) })).rejects.toThrow()
    const invalid = structuredClone(result)
    invalid.rounds[0].score[0] = 100.5
    await expect(save(db, 1, userA, invalid)).rejects.toThrow()
    invalid.rounds[0].score[0] = 0
    invalid.rounds[0].board = 'invalid'
    await expect(save(db, 1, userA, invalid)).rejects.toThrow()
    await save(db, 1)
    const changed = structuredClone(result)
    changed.rounds[0].score[0] = 1
    await expect(save(db, 1, userA, changed)).rejects.toThrow()
    expect((await db.query<{ total_score: number }>('SELECT total_score FROM public.score_attack_games')).rows[0].total_score).toBe(0)
  })
})

it('preserves optional next pairs in the existing compact JSON without changing older games', async () => {
  const db = await database()
  const queued = { ...result, rounds: result.rounds.map(round => ({ ...round, next: 'hEC', nextNext: 'xGC' })) }
  await asUser(db, userA, async () => {
    const saved = await save(db, 1, userA, queued)
    expect((saved.rows[0] as { result: unknown }).result).toEqual(queued)
    expect((await save(db, 1, userA, queued)).rows).toEqual(saved.rows)
    const old = await save(db, 2, userA)
    expect((old.rows[0] as { result: unknown }).result).toEqual(result)
  })
})
