import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Simulator from '../core/ChainSimulator'
import { PlacementAdvisor } from './PlacementAdvisor'
import { PuyoColor, type PuyoPair } from '../core/types'

const { RED: R, BLUE: B, GREEN: G, YELLOW: Y } = PuyoColor
const pair = (main: PuyoColor, sub: PuyoColor): PuyoPair => ({
  main: { color: main, x: 2, y: 1 }, sub: { color: sub, x: 2, y: 0 }, rotation: 0, falling: true,
})

describe('advisor terminal states', () => {
  afterEach(() => vi.restoreAllMocks())

  it('does not simulate another pair after a fallback candidate blocks either spawn cell', () => {
    const grid = Array.from({ length: 13 }, () => Array<PuyoColor | null>(6).fill(null))
    grid[12][0] = G // incompatible with the prescribed fold: use general fallback
    for (let y = 2; y < 13; y++) grid[y][2] = y % 2 ? R : B
    const field = { grid, width: 6, height: 13 }
    const plan = { colorA: R, colorB: B, colorC: R, colorD: B }
    const simulate = vi.spyOn(Simulator, 'simulateTurn')
    const advice = PlacementAdvisor.getAdvice(field, pair(G, Y), pair(B, B), pair(R, G), plan)
    expect(simulate.mock.calls.length).toBeGreaterThan(22)
    expect(simulate.mock.calls.every(([before]) => !Simulator.isSpawnBlocked(before))).toBe(true)
    const fatal = advice.allPlacements.find(candidate => candidate.placement.column === 2 && candidate.placement.rotation === 1)!
    expect(fatal.totalScore).toBeLessThan(-100000)
    expect(Simulator.isSpawnBlocked(Simulator.simulateTurn(grid, pair(G, Y), advice.bestPlacement!.placement).stableGrid)).toBe(false)

    grid[1][2] = G
    expect(PlacementAdvisor.getAdvice(field, pair(G, Y), pair(B, B), pair(R, G), plan)).toMatchObject({
      bestPlacement: null, allPlacements: [],
    })
  })
})
