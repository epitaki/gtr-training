import type { PuyoPair } from '../core/types'
import { isSpawnBlocked, simulateLanding, simulateTurn, type Placement, type PuyoGrid, type TurnOutcome } from '../core/ChainSimulator'
import { createMainFireBaseline } from './MainFireAnalysis'
import { inspectHeadExtension } from '../gtr/HeadExtension'
import { compareFirePreference, inspectFirePreference, type FirePreference } from './FirePreference'
import { futureFireSurfaceCost } from './BoardSurface'

/** Actual legal visible-pair paths, independent of a fixed construction recipe.
 * No hypothetical template cells or unseen pairs can produce a result here.
 * The caller admits only a completed teaching tail and verifies each main fire.
 */
export function findVisibleMainFires(
  grid: PuyoGrid,
  pairs: readonly PuyoPair[],
  classify: (before: PuyoGrid, pair: PuyoPair, outcome: TurnOutcome) => 'clean' | 'collateral' | null,
  maxDepth = 2,
  onReady?: (board: PuyoGrid, root: Placement, surface: number, depth: number) => void,
  allowTransientHead = true,
): Map<string, FirePreference> {
  const found = new Map<string, FirePreference>()
  if (grid.length !== 13 || grid.some(row => row.length !== 6) || isSpawnBlocked(grid)) return found
  interface State { grid: PuyoGrid; root?: Placement; surface: number }
  let states: State[] = [{ grid, surface: 0 }]
  const visible = pairs.slice(0, Math.min(3, maxDepth + 1))
  const finalReadiness = new Map<string, boolean>()
  const gridKey = (board: PuyoGrid) => board.map(row => row.map(c => c?.[0] ?? '.').join('')).join('')
  for (const [depth, pair] of visible.entries()) {
    const next: State[] = []
    const seen = new Map<string, State>()
    for (const state of states) {
      const baseline = createMainFireBaseline(state.grid)
      const ready = (baseline?.resolution.chainCount ?? 0) >= 5
      const head = inspectHeadExtension(state.grid)
      for (let rotation = 0; rotation < 4; rotation++) for (let column = 0; column < 6; column++) {
        const placement = { column, rotation }
        // At the last level only an already-ready trigger can be a goal fire.
        // Reject non-trigger landings before doing an expensive clear trace.
        if (depth === visible.length - 1 && !onReady) {
          if (!ready || !baseline) continue
          const landing = simulateLanding(state.grid, pair, placement)
          if (!landing.valid || ![
            { ...landing.mainPos, color: pair.main.color }, { ...landing.subPos, color: pair.sub.color },
          ].some(p => p.x === baseline.trigger.x && p.y === baseline.trigger.y && p.color === baseline.triggerColor)) continue
        }
        const outcome = simulateTurn(state.grid, pair, placement)
        if (!outcome.valid || isSpawnBlocked(outcome.stableGrid)) continue
        const root = state.root ?? placement
        const key = `${root.column}:${root.rotation}`
        if (outcome.chainCount) {
          const kind = ready ? classify(state.grid, pair, outcome) : null
          if (kind === null) continue
          const preference = inspectFirePreference(outcome, depth, kind === 'collateral', state.surface, state.grid)
          if (compareFirePreference(preference, found.get(key)) < 0) found.set(key, preference)
          continue
        }
        // Preserve a ready single-color entrance, and admit only the existing
        // verified limited head at the goal. An intermediate obstruction is
        // allowed only inside this visible search, never rewarded on its own.
        if (!head && outcome.stableGrid[9][0] !== null &&
            (ready || (!allowTransientHead && !inspectHeadExtension(outcome.stableGrid)))) continue
        const surface = state.root ? state.surface : futureFireSurfaceCost(outcome.stableGrid)
        const boardKey = gridKey(outcome.stableGrid)
        if (depth === visible.length - 1) {
          // Compare preparation after ALL supplied visible pairs have landed.
          // An early virtual fire must not hide disposal of the remaining
          // known pairs. The missing trigger is NOT an actual fire; a
          // multi-puyo head wait is not a ready single-color entrance.
          if (onReady) {
            let complete = finalReadiness.get(boardKey)
            if (complete === undefined) {
              const baselineAfter = createMainFireBaseline(outcome.stableGrid)
              const headAfter = inspectHeadExtension(outcome.stableGrid)
              complete = (baselineAfter?.resolution.chainCount ?? 0) >= 5 && (!headAfter || headAfter.missing === 1)
              finalReadiness.set(boardKey, complete)
            }
            if (complete) onReady(outcome.stableGrid, root, surface, depth)
          }
          continue
        }
        const identity = `${key}|${boardKey}`
        if (!seen.has(identity)) {
          const continuation = { grid: outcome.stableGrid, root, surface }
          seen.set(identity, continuation); next.push(continuation)
        }
      }
    }
    // Later fires cannot outrank an earlier verified fire. Construction is
    // still scored by the existing planner when this search finds no fire.
    if (found.size) break
    states = next
  }
  return found
}
