import type { PuyoPair } from '../core/types'
import { simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { createGTREvaluationGrid } from '../gtr/EvaluationRange'
import { GTRDetector } from '../gtr/GTRPatterns'
import { inspectConnectedExtension, traceFoundation } from './ConnectedExtension'
import { coreHeadContactRisk } from './HeadScaffold'
import { FiveChainPlanner } from './FiveChainPlanner'
import type { PlacementScore } from './types'

const foundationKey = (grid: PuyoGrid) => JSON.stringify(createGTREvaluationGrid(grid))

/** Secondary allocation only: keep exactly the chosen real foundation, then
 * compare the full-board fate of the companions. A new head/tail needs a legal
 * one/two-cell trigger and the original foundation's clear order, not merely
 * same-color adjacency or an idealized completed target. Never count this
 * hypothetical recovery as a scored foundation chain or an actual fire.
 */
export function preferRecoverableSpare(grid: PuyoGrid, pair: PuyoPair,
  ranked: readonly PlacementScore[]): PlacementScore | null {
  const first = ranked[0]
  if (!first) return null
  const baseline = simulateTurn(grid, pair, first.placement)
  if (!baseline.valid || baseline.chainCount || !GTRDetector.hasBasicPattern(baseline.stableGrid)) return null
  const trace = traceFoundation(baseline.stableGrid, 2)
  if (!trace) return null
  const original = inspectConnectedExtension(baseline.stableGrid, trace)
  if (!original) return null
  const mask = foundationKey(baseline.stableGrid), risk = coreHeadContactRisk(baseline.stableGrid)
  const fold = { colorA: baseline.stableGrid[10][0]!, colorB: baseline.stableGrid[10][1]! }
  let target: ReturnType<typeof FiveChainPlanner.inspectCompletion> | undefined
  let best: PlacementScore | null = null, remaining = original.realLeftovers
  for (const candidate of ranked.slice(1)) {
    if (candidate.immediateChainCount) continue
    const result = simulateTurn(grid, pair, candidate.placement)
    if (!result.valid || result.chainCount || foundationKey(result.stableGrid) !== mask ||
        coreHeadContactRisk(result.stableGrid) > risk) continue
    const connection = inspectConnectedExtension(result.stableGrid, trace)
    // Require strict recovery, not a shape-name bonus or covering the fire mouth.
    // Do not trade a ready one-cell entrance for a less ready two-cell trigger.
    if (connection && connection.chainCount >= original.chainCount && connection.needed <= original.needed &&
        connection.realLeftovers < remaining) {
      // Equal masked boards alone do not guarantee equal future construction:
      // upstairs companions can change the drops of an unfinished target. Keep
      // the SAME physically validated completion recipe, not just its cell count.
      target ??= FiveChainPlanner.inspectCompletion(baseline.stableGrid, fold)
      if (target && FiveChainPlanner.inspectCompletion(result.stableGrid, fold)?.targetId !== target.targetId) continue
      best = candidate
      remaining = connection.realLeftovers
    }
  }
  return best
}
