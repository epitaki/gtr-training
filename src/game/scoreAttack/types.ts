import type { PuyoGrid } from '../core/ChainSimulator'
import type { PuyoPair } from '../core/types'
import type { GTRAnalysis } from '../advisor/GTRAnalysis'

export const SCORE_ATTACK_ROUNDS = 10
export interface ScoreAttackSnapshot { grid: PuyoGrid; currentPair: PuyoPair | null; moves?: string; nextPair?: PuyoPair | null; nextNextPair?: PuyoPair | null }
export interface ScoreAttackEvaluation { analysis: GTRAnalysis }
export interface ScoreAttackRound {
  snapshot: ScoreAttackSnapshot
  evaluation: ScoreAttackEvaluation | null
  error: string | null
}
export interface ScoreAttackState {
  rounds: readonly ScoreAttackRound[]
  finished: boolean
  totalScore: number | null
}
export interface ScoreAttackEvaluator {
  evaluate(snapshot: ScoreAttackSnapshot): Promise<ScoreAttackEvaluation>
  dispose(): void
}
export interface EvaluationRequest { id: number; snapshot: ScoreAttackSnapshot }
export type EvaluationResponse = { id: number; evaluation: ScoreAttackEvaluation } | { id: number; error: string }
