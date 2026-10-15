import { beforeEach, expect, it, vi } from 'vitest'
import { evaluateScoreAttack } from '../game/scoreAttack/evaluate'
import type { ScoreAttackState } from '../game/scoreAttack/types'
import { encodeScoreAttackGame } from '../game/scoreAttack/storageCodec'

const api = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { auth: { getUser: api.getUser }, rpc: api.rpc, from: api.from } }))
import { listScoreAttackGames, parseSavedScoreAttack, saveScoreAttackGame, setScoreAttackFavorite, validCompletedScoreAttack } from './scoreAttackHistory'

const userId = '11111111-1111-4111-8111-111111111111', id = '00000000-0000-4000-8000-000000000001'
const completed = (): ScoreAttackState => {
  const snapshot = { grid: Array.from({ length: 13 }, () => Array(6).fill(null)), currentPair: null }
  return { finished: true, totalScore: 0, rounds: Array.from({ length: 10 }, () => ({ snapshot, evaluation: evaluateScoreAttack(snapshot), error: null })) }
}
const row = (state = completed()) => ({ id, created_at: '2026-10-04T10:00:00Z', favorite: false, total_score: state.totalScore, result: encodeScoreAttackGame(state) })
beforeEach(() => {
  vi.clearAllMocks()
  api.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
  api.rpc.mockResolvedValue({ data: row(), error: null })
  const query = { select: api.select, eq: api.eq, order: api.order, limit: api.limit }
  api.from.mockReturnValue(query); api.select.mockReturnValue(query); api.eq.mockReturnValue(query); api.order.mockReturnValue(query)
  api.limit.mockResolvedValue({ data: [row()], error: null })
})

it('saves a complete game using a stable id and expected authenticated owner', async () => {
  const state = completed()
  expect(validCompletedScoreAttack(state)).toBe(true)
  expect((await saveScoreAttackGame(id, state, userId)).totalScore).toBe(0)
  expect(api.rpc).toHaveBeenCalledWith('save_score_attack_game', { p_id: id, p_user_id: userId, p_result: encodeScoreAttackGame(state) })
})
it('refuses unfinished, wrong sum and invalid grids before sending a request', async () => {
  const state = completed(); state.finished = false
  await expect(saveScoreAttackGame(id, state, userId)).rejects.toThrow()
  state.finished = true; state.totalScore = 1
  await expect(saveScoreAttackGame(id, state, userId)).rejects.toThrow()
  state.totalScore = 0; state.rounds[0].snapshot.grid[0].pop()
  await expect(saveScoreAttackGame(id, state, userId)).rejects.toThrow()
  expect(api.rpc).not.toHaveBeenCalled()
})
it('does not send reads or writes after the authenticated identity changes', async () => {
  api.getUser.mockResolvedValue({ data: { user: { id: 'another-user' } }, error: null })
  await expect(saveScoreAttackGame(id, completed(), userId)).rejects.toThrow(/ログイン/)
  await expect(listScoreAttackGames(userId)).rejects.toThrow(/ログイン/)
  await expect(setScoreAttackFavorite(id, true, userId)).rejects.toThrow(/ログイン/)
  expect(api.rpc).not.toHaveBeenCalled(); expect(api.from).not.toHaveBeenCalled()
})
it('reads only the expected owner and at most 100 games newest first', async () => {
  expect(await listScoreAttackGames(userId)).toHaveLength(1)
  expect(api.eq).toHaveBeenCalledWith('user_id', userId)
  expect(api.order).toHaveBeenNthCalledWith(1, 'created_at', { ascending: false })
  expect(api.limit).toHaveBeenCalledWith(100)
})
it('uses the protected favorite RPC and reports unavailable database setup', async () => {
  await setScoreAttackFavorite(id, true, userId)
  expect(api.rpc).toHaveBeenCalledWith('set_score_attack_favorite', { p_id: id, p_user_id: userId, p_favorite: true })
  api.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } })
  await expect(saveScoreAttackGame(id, completed(), userId)).rejects.toThrow(/準備/)
})
it('rejects malformed saved data without passing it into result rendering', () => {
  expect(() => parseSavedScoreAttack({ ...row(), result: { version: 1, rounds: [] } })).toThrow()
  expect(() => parseSavedScoreAttack({ ...row(), total_score: 500 })).toThrow()
  expect(() => parseSavedScoreAttack({ ...row(), created_at: 'invalid' })).toThrow()
})
