import type { GTRScore } from '../gtr/GTRPatterns'
import { GTR_SCORING_CONFIG } from '../gtr/GTRScoringConfig'
import { analyzeGTR } from '../advisor/GTRAnalysis'
import { decodeBoard, decodePlacedPair, encodeBoard, encodePlacedPair } from './placementHistory'
import type { ScoreAttackState } from './types'

export interface CompactScoreAttackRound {
  board: string
  current: string | null
  moves?: string
  next?: string | null
  nextNext?: string | null
  score: number[]
}
export interface CompactScoreAttackGame { version: 2; scoringVersion: string; rounds: CompactScoreAttackRound[] }
const tails = [undefined, 'Y', 'zabuton', 'L', 'stairs'] as const
const rows = ['minimal', 'moderate', 'heavy'] as const
const packScore = (score: GTRScore): number[] => [score.totalScore, score.quality, score.chainTailScore, score.chainCount, score.leftoverPuyos,
  Number(score.isGTR) | Number(score.hasBasicPattern) << 1 | Number(score.minimalFoundationComplete) << 2 |
  Number(score.leftoverConnected) << 3 | Number(score.rightEdgeRaised) << 4,
  rows.indexOf(score.row10Usage), tails.indexOf(score.chainTailType)]
const unpackScore = (values: number[], scoringVersion: string): GTRScore => {
  if (values.length !== 8 || values.some(value => !Number.isFinite(value) || value < 0) || values[0] > 100 || !Number.isInteger(values[0]) ||
    values[1] > 100 || values[2] > 200 || values[3] > 78 || values[4] > 78 || !Number.isInteger(values[5]) || values[5] > 31 ||
    !Number.isInteger(values[6]) || values[6] > 2 || !Number.isInteger(values[7]) || values[7] > 4) throw new Error('保存した点数が正しくありません')
  const [totalScore, quality, chainTailScore, chainCount, leftoverPuyos, flags, row, tail] = values
  return { totalScore, quality, chainTailScore, chainCount, leftoverPuyos, isGTR: !!(flags & 1), hasBasicPattern: !!(flags & 2),
    minimalFoundationComplete: !!(flags & 4), leftoverConnected: !!(flags & 8), rightEdgeRaised: !!(flags & 16),
    row10Usage: rows[row], chainTailType: tails[tail], scoringVersion: scoringVersion === GTR_SCORING_CONFIG.VERSION ? GTR_SCORING_CONFIG.VERSION : undefined }
}
export function encodeScoreAttackGame(state: ScoreAttackState): CompactScoreAttackGame {
  return { version: 2, scoringVersion: state.rounds[0].evaluation!.analysis.score.scoringVersion ?? GTR_SCORING_CONFIG.VERSION,
    rounds: state.rounds.map(round => ({ board: encodeBoard(round.snapshot.grid), current: round.snapshot.currentPair ? encodePlacedPair(round.snapshot.currentPair) : null,
      ...(round.snapshot.moves !== undefined ? { moves: round.snapshot.moves } : {}),
      ...(round.snapshot.nextPair !== undefined ? { next: round.snapshot.nextPair ? encodePlacedPair(round.snapshot.nextPair) : null } : {}),
      ...(round.snapshot.nextNextPair !== undefined ? { nextNext: round.snapshot.nextNextPair ? encodePlacedPair(round.snapshot.nextNextPair) : null } : {}), score: packScore(round.evaluation!.analysis.score) })) }
}
export function validateCompactScoreAttack(value: unknown): CompactScoreAttackGame {
  const game = value as CompactScoreAttackGame
  if (!game || game.version !== 2 || typeof game.scoringVersion !== 'string' || game.scoringVersion.length > 100 || !Array.isArray(game.rounds) || game.rounds.length !== 10)
    throw new Error('保存した結果が正しくありません')
  for (const round of game.rounds) {
    if (!round || typeof round.board !== 'string' || !(round.current === null || typeof round.current === 'string') || !Array.isArray(round.score) ||
      round.score.some(value => typeof value !== 'number') || round.moves !== undefined && (typeof round.moves !== 'string' || !/^[A-Za-z0-9_-]*$/.test(round.moves) || round.moves.length % 3 || round.moves.length > 30000))
      throw new Error('保存した結果が正しくありません')
    decodeBoard(round.board); if (round.current !== null) decodePlacedPair(round.current)
    for (const key of ['next', 'nextNext'] as const) {
      const pair = round[key]
      if (pair !== undefined && pair !== null) {
        if (typeof pair !== 'string') throw new Error('保存した次の組が正しくありません')
        decodePlacedPair(pair)
      }
    }
    unpackScore(round.score, game.scoringVersion)
  }
  return game
}
export function decodeScoreAttackGame(data: CompactScoreAttackGame): ScoreAttackState {
  validateCompactScoreAttack(data)
  const rounds = data.rounds.map(round => {
    const snapshot = { grid: decodeBoard(round.board), currentPair: round.current === null ? null : decodePlacedPair(round.current), moves: round.moves,
      ...(round.next !== undefined ? { nextPair: round.next === null ? null : decodePlacedPair(round.next) } : {}),
      ...(round.nextNext !== undefined ? { nextNextPair: round.nextNext === null ? null : decodePlacedPair(round.nextNext) } : {}) }
    const score = unpackScore(round.score, data.scoringVersion)
    return { snapshot, evaluation: { analysis: analyzeGTR(snapshot.grid, snapshot.currentPair, score) }, error: null }
  })
  return { rounds, finished: true, totalScore: rounds.reduce((sum, round) => sum + round.evaluation.analysis.score.totalScore, 0) }
}
