import { resolveChainsWithTrace, type PuyoGrid } from '../core/ChainSimulator'
import type { ChainTrace } from '../core/ChainTrace'
import { createGTREvaluationGrid } from './EvaluationRange'

export interface GTRChainPreview {
  /** The simulated board includes one clearly marked, hypothetical starter. */
  initialGrid: PuyoGrid
  trace: ChainTrace | null
  starter: { x: 0; y: 9 } | null
  unavailableReason: string | null
}

/** Build a display-only foundation chain, masking the grading scope before gravity. */
export const createGTRChainPreview = (source: PuyoGrid): GTRChainPreview => {
  const initialGrid = createGTREvaluationGrid(source)
  const starterColor = initialGrid[10]?.[0]
  if (starterColor == null) {
    return { initialGrid, trace: null, starter: null, unavailableReason: '発火色がないため再生できません' }
  }

  initialGrid[9][0] = starterColor
  const trace = resolveChainsWithTrace(initialGrid, {}, 'gtr-preview')
  if (trace.result.chainCount === 0) {
    return { initialGrid, trace: null, starter: { x: 0, y: 9 }, unavailableReason: '消える組がないため再生できません' }
  }
  return { initialGrid, trace, starter: { x: 0, y: 9 }, unavailableReason: null }
}
