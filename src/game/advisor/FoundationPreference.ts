import { isSpawnBlocked, simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'
import { GTRDetector } from '../gtr/GTRPatterns'
import { analyzeCandidateFire, type MainFireBaseline } from './MainFireAnalysis'

/** Hypothetical color acceptance, not a forecast that a firing pair will arrive. */
export function supportsEveryFiringCompanion(grid: PuyoGrid, baseline: MainFireBaseline): boolean {
  if (baseline.resolution.chainCount < 5 || isSpawnBlocked(grid)) return false
  return Object.values(PuyoColor).every(companion => {
    const pair: PuyoPair = {
      main: { x: 2, y: 1, color: baseline.triggerColor },
      sub: { x: 2, y: 0, color: companion }, rotation: 0, falling: true,
    }
    // The trigger-colored axis stays in the trigger column. Swapping which
    // half is the axis yields the same settled boards in this simulator.
    return [0, 1, 2, 3].some(rotation => {
      const outcome = simulateTurn(grid, pair, { column: baseline.trigger.x, rotation })
      if (!outcome.valid || isSpawnBlocked(outcome.stableGrid)) return false
      const fire = analyzeCandidateFire(pair, outcome, baseline)
      return fire.isIntendedMainFire && !fire.hasCollateralClear
    })
  })
}

/**
 * Secondary construction evidence on a real, settled visible-search board.
 * The caller must separately prove a connected tail and a physical main fire.
 * This is not an actual-fire reward, and must not postpone a playable fire.
 */
export function foundationPreparationBonus(grid: PuyoGrid): number {
  const foundation = GTRDetector.detectGTR(grid)
  // An upstairs-only five is not an achieved foundation. The old right-edge
  // diagnostic remains available, but its position no longer changes advice.
  return foundation.chainCount >= 5 ? 2000 : 0
}
