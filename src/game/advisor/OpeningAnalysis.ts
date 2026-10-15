import { PuyoColor, type PuyoPair } from '../core/types'
import type { GTRTrainingPlan } from './types'

export type OpeningKind = 'AAAA' | 'AAAB' | 'AABB' | 'ABAB' | 'AABC' | 'ABAC' | 'ABCD'
export interface OpeningAnalysis {
  kind: OpeningKind
  sequence: PuyoColor[]
  colors: { color: PuyoColor; count: number; firstIndex: number }[]
  trainingPlan: GTRTrainingPlan
  awaitingSecondColor: boolean
}

/** A/B always name the standard fold's cap/base colors, independent of pair orientation. */
export function analyzeOpening(pair1: PuyoPair, pair2: PuyoPair): OpeningAnalysis {
  const sequence = [pair1.main.color, pair1.sub.color, pair2.main.color, pair2.sub.color]
  const colors = [...new Set(sequence)].map(color => ({
    color, count: sequence.filter(value => value === color).length, firstIndex: sequence.indexOf(color),
  })).sort((a, b) => b.count - a.count || a.firstIndex - b.firstIndex)
  const double = (pair: PuyoPair) => pair.main.color === pair.sub.color
  const kind: OpeningKind = colors.length === 1 ? 'AAAA'
    : colors[0].count === 3 ? 'AAAB'
    : colors.length === 2 ? double(pair1) && double(pair2) ? 'AABB' : 'ABAB'
    : colors.length === 3 ? double(pair1) || double(pair2) ? 'AABC' : 'ABAC'
    : 'ABCD'
  const colorB = colors[0].color
  // Preserve the legacy plan for imported AAAA games. This color is provisional, not supplied.
  const colorA = colors[1]?.color ?? (colorB === PuyoColor.RED ? PuyoColor.GREEN : PuyoColor.RED)
  return { kind, sequence, colors, awaitingSecondColor: kind === 'AAAA',
    trainingPlan: { colorA, colorB, colorC: colorA, colorD: colorB } }
}
