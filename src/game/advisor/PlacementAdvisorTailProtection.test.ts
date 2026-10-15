import { describe, expect, it } from 'vitest'
import { PlacementAdvisor } from './PlacementAdvisor'
import { simulateTurn } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'

describe('adaptive tail protection', () => {
  it('rejects fixed Y scoring and metadata when filling its arms would clear early', () => {
    const { BLUE: B, GREEN: G, RED: R, YELLOW: Y } = PuyoColor
    const grid = Array.from({ length: 10 }, () => Array<PuyoColor | null>(6).fill(null))
    grid.push([R, Y, null, null, null, null], [R, R, Y, null, null, R], [Y, Y, R, Y, Y, R])
    const plan = { colorA: R, colorB: Y, colorC: R, colorD: Y }
    expect(PlacementAdvisor.getYJointPlan(grid, plan)).toBeNull()
    expect(PlacementAdvisor.getTailPlans(grid, plan)).toEqual([])
    const pair: PuyoPair = {
      main: { x: 2, y: 1, color: G }, sub: { x: 2, y: 0, color: B }, rotation: 0, falling: true,
    }
    const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair, undefined, undefined, plan)
    const safe = advice.allPlacements.find(candidate =>
      candidate.placement.column === 5 && candidate.placement.rotation === 0,
    )!
    expect(safe.immediateChainCount).toBe(0)
    expect(safe.tailShape).toBeUndefined()
    expect(safe.tailColor).toBeUndefined()
  })

  it('does not erase destruction of the last developed L plan when no fixed Y is available', () => {
    const { BLUE: B, GREEN: G, RED: R, YELLOW: Y } = PuyoColor
    const grid = Array.from({ length: 10 }, () => Array<PuyoColor | null>(6).fill(null))
    grid.push([B, G, null, null, null, null], [B, B, G, R, B, null], [G, G, R, R, Y, null])
    const pair: PuyoPair = {
      main: { x: 2, y: 1, color: B }, sub: { x: 2, y: 0, color: Y }, rotation: 0, falling: true,
    }
    const plan = { colorA: B, colorB: G, colorC: B, colorD: G }
    expect(PlacementAdvisor.getYJointPlan(grid, plan)).toBeNull()
    expect(PlacementAdvisor.getTailPlans(grid, plan)).toMatchObject([
      { shape: 'L', color: R, matchedChainCells: 3 },
    ])
    const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair, undefined, undefined, plan)
    expect(advice.bestPlacement).toMatchObject({ tailShape: 'L', tailColor: R })
    const destroyed = advice.allPlacements.find(candidate =>
      candidate.placement.column === 2 && candidate.placement.rotation === 0,
    )!
    expect(destroyed.totalScore).toBeLessThan(0)
    const selected = simulateTurn(grid, pair, advice.bestPlacement!.placement)
    expect(PlacementAdvisor.getTailPlans(selected.stableGrid, plan)).toMatchObject([
      { shape: 'L', color: R, matchedChainCells: 3 },
    ])
  })
})
