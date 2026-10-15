// Exhaustive visible-opening check, separate from the fast unit-test suite.
import assert from 'node:assert/strict'
import { PuyoColor, type PuyoPair } from '../../src/game/core/types'
import { PlacementAdvisor } from '../../src/game/advisor/PlacementAdvisor'
import { FiveChainPlanner } from '../../src/game/advisor/FiveChainPlanner'
import { simulateTurn, type PuyoGrid } from '../../src/game/core/ChainSimulator'

const colors = Object.values(PuyoColor)
const pairs: PuyoPair[] = colors.flatMap(main => colors.map(sub => ({
  main: { color: main, x: 2, y: 1 }, sub: { color: sub, x: 2, y: 0 }, rotation: 0, falling: true,
})))
const grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
let checked = 0
let eligible = 0

for (const current of pairs) for (const next of pairs) {
  // Match the game's opening restriction: at most three colors in two pairs.
  if (new Set([current.main.color, current.sub.color, next.main.color, next.sub.color]).size > 3) continue
  const plan = PlacementAdvisor.createTrainingPlan(current, next)
  // Enumerate physically viable first moves WITHOUT the teaching preference.
  const viable = FiveChainPlanner.rank(grid, [current], plan, () => null)
  const canAdvance = [...viable?.values() ?? []].some(candidate => {
    const result = simulateTurn(grid, current, candidate.placement)
    const fold = PlacementAdvisor.getFoldPlan(result.stableGrid, plan)
    return result.chainCount === 0 && fold !== null && fold.missingColors.length < 7
  })
  for (const next2 of pairs) {
    const best = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, current, next, next2, plan).bestPlacement
    assert.ok(best)
    const result = simulateTurn(grid, current, best.placement)
    assert.equal(result.chainCount, 0)
    const fold = PlacementAdvisor.getFoldPlan(result.stableGrid, plan)
    assert.ok(fold)
    if (canAdvance) {
      eligible++
      assert.ok(fold.missingColors.length < 7, JSON.stringify({ current, next, next2, best }))
    }
    checked++
  }
}
assert.equal(checked, 3712)
assert.equal(eligible, 3328)
console.log(JSON.stringify({ checked, eligible, missed: 0 }))
