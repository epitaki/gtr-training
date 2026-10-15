import { isSpawnBlocked, resolveChains, type PuyoGrid } from '../core/ChainSimulator'
import { isInGTREvaluationRange } from '../gtr/EvaluationRange'
import { GTRDetector } from '../gtr/GTRPatterns'
import { inspectConnectedExtension, traceFoundation } from './ConnectedExtension'

/** Separate full-board diagnostic, not a modifier of the foundation's score.
 * A failed bounded search means "unconfirmed", not proof that the chain is dead.
 * No outside cell is automatically called useful just because it is above the scope.
 */
export function assessFoundationContext(grid: PuyoGrid) {
  const outsidePuyos = grid.reduce((sum, row, y) => sum + row.filter((c, x) =>
    c !== null && !isInGTREvaluationRange(x, y)).length, 0)
  const status = isSpawnBlocked(grid) ? 'spawn-blocked' as const
    : resolveChains(grid).chainCount > 0 ? 'unstable' as const : null
  const trace = traceFoundation(grid)
  const connection = !status && trace && GTRDetector.hasBasicPattern(grid)
    ? inspectConnectedExtension(grid, trace) : null
  return { outsidePuyos, connection,
    status: status ?? (!trace || !GTRDetector.hasBasicPattern(grid) ? 'not-ready' as const
      : connection ? 'potential' as const : 'unconfirmed' as const) }
}
