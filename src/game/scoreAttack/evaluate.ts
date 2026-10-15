import { analyzeGTR } from '../advisor/GTRAnalysis'
import { GTRDetector } from '../gtr/GTRPatterns'
import type { ScoreAttackEvaluation, ScoreAttackSnapshot } from './types'

export function evaluateScoreAttack(snapshot: ScoreAttackSnapshot): ScoreAttackEvaluation {
  const score = GTRDetector.detectGTR(snapshot.grid)
  return { analysis: analyzeGTR(snapshot.grid, snapshot.currentPair, score) }
}
