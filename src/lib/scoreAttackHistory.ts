import { supabase } from './supabase'
import { PuyoColor } from '../game/core/types'
import type { ScoreAttackState } from '../game/scoreAttack/types'
import { encodeScoreAttackGame, validateCompactScoreAttack, type CompactScoreAttackGame } from '../game/scoreAttack/storageCodec'

export interface SavedScoreAttackGame {
  id: string
  createdAt: string
  favorite: boolean
  totalScore: number
  data: CompactScoreAttackGame
}
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value)
const points = (value: unknown, max = 100) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
const colors: readonly unknown[] = [null, ...Object.values(PuyoColor)]

export function validCompletedScoreAttack(state: unknown): state is ScoreAttackState {
  if (!object(state) || !state.finished || !points(state.totalScore, 1000) || !Array.isArray(state.rounds) || state.rounds.length !== 10) return false
  let sum = 0
  for (const round of state.rounds) {
    if (!object(round) || !object(round.snapshot) || !Array.isArray(round.snapshot.grid) || round.snapshot.grid.length !== 13 ||
      !round.snapshot.grid.every((row: unknown) => Array.isArray(row) && row.length === 6 && row.every(cell => colors.includes(cell))) ||
      !object(round.evaluation) || !object(round.evaluation.analysis)) return false
    const analysis = round.evaluation.analysis, score = analysis.score
    if (!object(score) || !points(score.totalScore) || !points(score.chainCount, 78) || !points(score.leftoverPuyos, 78) ||
      typeof score.hasBasicPattern !== 'boolean' || typeof score.minimalFoundationComplete !== 'boolean' ||
      !['title', 'fireText', 'useText', 'scoreExplanation'].every(key => typeof analysis[key] === 'string' && analysis[key].length <= 4096)) return false
    sum += score.totalScore
  }
  return sum === state.totalScore
}

export function parseSavedScoreAttack(row: unknown): SavedScoreAttackGame {
  if (!object(row) || typeof row.id !== 'string' || !/^[\da-f-]{36}$/i.test(row.id) || typeof row.created_at !== 'string' ||
    !Number.isFinite(Date.parse(row.created_at)) || typeof row.favorite !== 'boolean' || !object(row.result) ||
    !points(row.total_score, 1000)) throw new Error('保存した結果を読めませんでした')
  const data = validateCompactScoreAttack(row.result)
  if (data.rounds.reduce((sum, round) => sum + round.score[0], 0) !== row.total_score) throw new Error('保存した点数が正しくありません')
  return { id: row.id, createdAt: row.created_at, favorite: row.favorite, totalScore: row.total_score, data }
}

async function clientFor(userId: string) {
  if (!supabase) throw new Error('結果保存は利用できません')
  const { data, error } = await supabase.auth.getUser()
  if (error || data.user?.id !== userId) throw new Error('ログインを確認してください')
  return supabase
}
function historyError(error: { message: string; code?: string }): Error {
  if (error.code === 'PGRST202' || error.code === 'PGRST205' || error.code === '42P01') return new Error('結果保存の準備がまだ完了していません')
  return new Error(error.message || '結果を保存できませんでした')
}
export async function saveScoreAttackGame(id: string, state: ScoreAttackState, userId: string): Promise<SavedScoreAttackGame> {
  if (!validCompletedScoreAttack(state)) throw new Error('10回の採点完了後に保存できます')
  const client = await clientFor(userId)
  const result = encodeScoreAttackGame(state)
  const { data, error } = await client.rpc('save_score_attack_game', { p_id: id, p_user_id: userId, p_result: result })
  if (error) throw historyError(error)
  return parseSavedScoreAttack(data)
}
export async function listScoreAttackGames(userId: string): Promise<SavedScoreAttackGame[]> {
  const client = await clientFor(userId)
  const { data, error } = await client.from('score_attack_games').select('id,created_at,total_score,favorite,result')
    .eq('user_id', userId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100)
  if (error) throw historyError(error)
  return (data ?? []).map(parseSavedScoreAttack)
}
export async function setScoreAttackFavorite(id: string, favorite: boolean, userId: string): Promise<SavedScoreAttackGame> {
  const client = await clientFor(userId)
  const { data, error } = await client.rpc('set_score_attack_favorite', { p_id: id, p_user_id: userId, p_favorite: favorite })
  if (error) throw historyError(error)
  return parseSavedScoreAttack(data)
}
