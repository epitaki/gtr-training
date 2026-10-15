import type { PuyoGrid, TurnOutcome } from '../core/ChainSimulator'
import { GTRDetector } from '../gtr/GTRPatterns'
import { FUTURE_FIRE_SURFACE_RISK } from './BoardSurface'

/** Evidence from an actual legal firing path, never a filled-in template. */
export interface FirePreference {
  depth: number
  collateral: boolean
  surfaceCost: number
  leftovers: number
  foundationChains?: number
}

export function inspectFirePreference(outcome: TurnOutcome, depth: number, collateral: boolean, surfaceCost = 0, before?: PuyoGrid): FirePreference {
  return { depth, collateral, surfaceCost,
    foundationChains: before ? Math.min(5, GTRDetector.detectGTR(before).chainCount) : 0,
    leftovers: outcome.stableGrid.reduce((sum, row) => sum + row.filter(color => color !== null).length, 0) }
}

/** Negative means a is preferred. A verified fire always precedes construction. */
export function compareFirePreference(a?: FirePreference, b?: FirePreference): number {
  if (!a || !b) return a ? -1 : b ? 1 : 0
  const aRisk = a.surfaceCost >= FUTURE_FIRE_SURFACE_RISK
  const bRisk = b.surfaceCost >= FUTURE_FIRE_SURFACE_RISK
  // Complete the five-link foundation before choosing a flatter upstairs-only
  // fire at the SAME actual firing time and cleanliness. This remains below
  // CURRENT firing and never counts missing target colors as supplied. Within
  // the same completion class, retain the geometry bands before leftovers.
  return a.depth - b.depth || Number(a.collateral) - Number(b.collateral) ||
    Number((b.foundationChains ?? 0) >= 5) - Number((a.foundationChains ?? 0) >= 5) ||
    Number(aRisk) - Number(bRisk) || (aRisk
      ? a.surfaceCost - b.surfaceCost || a.leftovers - b.leftovers
      : a.leftovers - b.leftovers || a.surfaceCost - b.surfaceCost)
}
