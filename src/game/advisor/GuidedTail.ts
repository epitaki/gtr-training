import type { PuyoGrid } from '../core/ChainSimulator'
import type { GTRTrainingPlan } from './types'
import { PlacementAdvisor } from './PlacementAdvisor'
import { inspectConnectedExtension, traceFoundation } from './ConnectedExtension'
import { inspectHeadScaffold } from './HeadScaffold'

/** A real, filled tail can be connected behind a pending head key. This does
 * not assert that the key exists or that the player has fired. Keep the legacy
 * fire-seeking planner's classifier unchanged; this is for the guided UI/evals.
 */
export function isGuidedTailComplete(grid: PuyoGrid, plan?: GTRTrainingPlan): boolean {
  if (PlacementAdvisor.isAdaptiveTailComplete(grid, plan)) return true
  if (!PlacementAdvisor.getTailPlans(grid, plan).some(tail => tail.templateFilled)) return false
  const foundation = traceFoundation(grid, 3)
  return !!foundation && !!(inspectHeadScaffold(grid, foundation) || inspectConnectedExtension(grid, foundation))
}
