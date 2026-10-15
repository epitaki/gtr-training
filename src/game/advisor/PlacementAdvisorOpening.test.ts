import { describe, expect, it } from 'vitest'
import { PlacementAdvisor } from './PlacementAdvisor'
import { isSpawnBlocked, simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'

const { RED: R, YELLOW: Y, BLUE: B, GREEN: G } = PuyoColor
const pair = (main: PuyoColor, sub: PuyoColor): PuyoPair => ({
  main: { color: main, x: 2, y: 1 }, sub: { color: sub, x: 2, y: 0 }, rotation: 0, falling: true,
})
const emptyGrid = (): PuyoGrid => Array.from({ length: 13 }, () => Array(6).fill(null))

describe('fold-first opening guidance', () => {
  it.each([
    [R, Y], [Y, R], [B, G], [G, B],
  ] as const)('uses the first %s double in the left foundation with %s next', (base, cap) => {
    // User report: RR / YR / YR used to recommend column 6 vertically.
    const current = pair(base, base)
    const next = pair(cap, base)
    const plan = PlacementAdvisor.createTrainingPlan(current, next)
    const grid = emptyGrid()
    const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, current, next, next, plan)
    const outcome = simulateTurn(grid, current, advice.bestPlacement!.placement)
    expect(outcome.stableGrid[12]).toEqual([base, base, null, null, null, null])
    expect(outcome.chainCount).toBe(0)
  })

  it.each([
    ['AABB', pair(R, R), pair(Y, Y), pair(B, G)],
    ['ABAA', pair(Y, R), pair(R, R), pair(G, B)],
    ['ABAB', pair(R, Y), pair(Y, R), pair(B, G)],
    ['ABAC', pair(R, Y), pair(R, G), pair(B, B)],
    ['AABC', pair(R, R), pair(Y, B), pair(G, G)],
    ['AAAA', pair(R, R), pair(R, R), pair(R, R)],
  ] as const)('starts %s with safe fold progress', (_, current, next, next2) => {
    const grid = emptyGrid()
    const plan = PlacementAdvisor.createTrainingPlan(current, next)
    const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, current, next, next2, plan)
    const outcome = simulateTurn(grid, current, advice.bestPlacement!.placement)
    const fold = PlacementAdvisor.getFoldPlan(outcome.stableGrid, plan)
    expect(fold).not.toBeNull()
    expect(fold!.missingColors.length).toBeLessThan(7)
    expect(outcome.chainCount).toBe(0)
    expect(isSpawnBlocked(outcome.stableGrid)).toBe(false)
  })

  it('advances the fold on the second pair after the reported double opening', () => {
    const grid = emptyGrid()
    grid[12][0] = R
    grid[12][1] = R
    const current = pair(Y, R)
    const plan = PlacementAdvisor.createTrainingPlan(pair(R, R), current)
    const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, current, current, pair(R, R), plan)
    const outcome = simulateTurn(grid, current, advice.bestPlacement!.placement)
    expect(outcome.chainCount).toBe(0)
    expect(PlacementAdvisor.getFoldPlan(outcome.stableGrid, plan)!.missingColors.length).toBeLessThan(5)
  })

  it('keeps useful tail options when BC precedes an AA foundation', () => {
    const grid = emptyGrid()
    const current = pair(Y, B)
    const next = pair(R, R)
    const plan = PlacementAdvisor.createTrainingPlan(current, next)
    const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, current, next, pair(B, G), plan)
    const outcome = simulateTurn(grid, current, advice.bestPlacement!.placement)
    expect(outcome.chainCount).toBe(0)
    expect(PlacementAdvisor.getFoldPlan(outcome.stableGrid, plan)?.missingColors.length).toBe(7)
    expect(PlacementAdvisor.getTailPlans(outcome.stableGrid, plan).some(tail => tail.matchedCells > 0)).toBe(true)
  })

  it('does not force an unusable pair into the fold or prematurely clear AAAA', () => {
    const current = pair(R, R)
    const plan = PlacementAdvisor.createTrainingPlan(current, current)
    const grid = emptyGrid()
    grid[12][0] = R
    grid[12][1] = R
    const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, current, pair(Y, B), pair(Y, G), plan)
    const outcome = simulateTurn(grid, current, advice.bestPlacement!.placement)
    expect(outcome.chainCount).toBe(0)
    expect(PlacementAdvisor.getFoldPlan(outcome.stableGrid, plan)?.missingColors.length).toBe(5)
    expect(outcome.stableGrid[12].slice(0, 2)).toEqual([R, R])
  })
})
