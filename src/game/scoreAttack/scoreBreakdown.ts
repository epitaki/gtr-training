import type { GTRScore } from '../gtr/GTRPatterns'
import { GTR_SCORING_CONFIG as config } from '../gtr/GTRScoringConfig'

export interface ScoreItem { label: string; points: number }

/** Display the saved score's weighted contributions without grading the board again. */
export function scoreBreakdown(score: GTRScore): ScoreItem[] {
  const fallback = () => score.totalScore > 0 ? [{ label: '土台評価', points: score.totalScore }] : []
  if (score.totalScore <= 0) return []
  if (score.scoringVersion !== config.VERSION) return fallback()
  const chain = Math.min(score.chainCount, config.CHAIN_COUNT.MAX_CHAIN) * config.CHAIN_COUNT.POINTS_PER_CHAIN
  const minimal = score.minimalFoundationComplete ? config.MINIMAL_FOUNDATION_BONUS : 0
  const leftover = score.chainTailScore - chain - minimal
  const tailMax = config.CHAIN_COUNT.MAX_CHAIN * config.CHAIN_COUNT.POINTS_PER_CHAIN +
    config.MINIMAL_FOUNDATION_BONUS + config.LEFTOVER_PUYOS.NO_LEFTOVER
  const weights = config.SCORE_WEIGHTS
  const weightSum = weights.BASE_PATTERN_WEIGHT + weights.CHAIN_TAIL_WEIGHT
  const coreScale = 100 * weights.BASE_PATTERN_WEIGHT / weightSum / config.BASE_PATTERN.BASIC_GTR
  const tailScale = 100 * weights.CHAIN_TAIL_WEIGHT / weightSum / tailMax
  const parts = [
    { label: '基本形', value: score.quality * coreScale },
    { label: `${score.chainCount}連鎖`, value: chain * tailScale },
    { label: `あまり${score.leftoverPuyos}個`, value: leftover * tailScale },
    { label: '最小土台', value: minimal * tailScale },
  ]
  const sum = parts.reduce((total, item) => total + item.value, 0)
  if (parts.some(item => !Number.isFinite(item.value) || item.value < 0) || sum <= 0 ||
    (score.minimalFoundationComplete ? 100 : Math.min(99, Math.round(sum))) !== score.totalScore) return fallback()
  // Allocate rounding (and the existing 99-point cap) so the displayed integers add up.
  const scaled = parts.map(item => ({ ...item, value: item.value * score.totalScore / sum }))
  const items = scaled.map(item => ({ label: item.label, points: Math.floor(item.value) }))
  let remaining = score.totalScore - items.reduce((total, item) => total + item.points, 0)
  const order = scaled.map((item, index) => ({ index, fraction: item.value - Math.floor(item.value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (const item of order) { if (remaining <= 0) break; items[item.index].points++; remaining-- }
  return items.filter(item => item.points > 0)
}
