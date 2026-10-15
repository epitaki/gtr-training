import { describe, expect, it } from 'vitest'
import { FiveChainPlanner } from './FiveChainPlanner'
import { PlacementAdvisor } from './PlacementAdvisor'
import { isSpawnBlocked, simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'

const palette = [PuyoColor.RED, PuyoColor.BLUE, PuyoColor.YELLOW, PuyoColor.GREEN]
const fixture = (shift: number) => {
  const color = (symbol: string) => palette[('RBYG'.indexOf(symbol) + shift) % 4]
  return {
    color,
    grid: (rows: readonly string[]): PuyoGrid => [
      ...Array.from({ length: 13 - rows.length }, () => Array<PuyoColor | null>(6).fill(null)),
      ...rows.map(row => [...row].map(c => c === '.' ? null : color(c))),
    ],
    pairs: (queue: string): PuyoPair[] => queue.split(' ').map(text => ({
      main: { color: color(text[0]), x: 2, y: 1 }, sub: { color: color(text[1]), x: 2, y: 0 },
      rotation: 0, falling: true,
    })),
    plan: (a: string, b: string) => ({ colorA: color(a), colorB: color(b), colorC: color(a), colorD: color(b) }),
  }
}

// Saved pre-change positions. These are regression inputs, not optimal-play
// labels. Every decision receives only its current three visible pairs.
const positions = [
  { name: 'Y', rows: ['.Y....', '.Y....', 'BR.Y..', 'BB.G..', 'RR.YY.'],
    queue: 'RG BR BR', a: 'B', b: 'R' },
  { name: 'zabuton', rows: ['.R....', '.B....', '.R..G.', '.R..B.', 'GG..Y.', 'RR..G.'],
    queue: 'GG GG BY', a: 'G', b: 'R' },
  { name: 'L', rows: ['.....B', '.....B', '.....R', 'YY.B.B', 'GG.BGB'],
    queue: 'BG GR RG', a: 'Y', b: 'G' },
] as const

describe('left connection without discarding a viable skeleton', () => {
  for (const position of positions) {
    it.each([0, 1, 2, 3])(`connects now while retaining a physical ${position.name} target (colors +%i)`, shift => {
      const f = fixture(shift)
      const grid = f.grid(position.rows), pairs = f.pairs(position.queue), plan = f.plan(position.a, position.b)
      expect(grid[12][2]).toBeNull()
      const ranked = FiveChainPlanner.rank(grid, pairs, plan, () => null, undefined, { connectLeftNow: true })
      expect(ranked?.size).toBeGreaterThan(0)
      for (const candidate of ranked!.values()) {
        const outcome = simulateTurn(grid, pairs[0], candidate.placement)
        expect(outcome.valid).toBe(true)
        expect(outcome.chainCount).toBe(0)
        expect(outcome.stableGrid[12][2]).not.toBeNull()
        expect(FiveChainPlanner.inspectCompletion(outcome.stableGrid, plan)).not.toBeNull()
      }
      const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, ...pairs as [PuyoPair, PuyoPair, PuyoPair], plan)
      const chosen = advice.bestPlacement!.placement
      expect(ranked!.has(`${chosen.column}:${chosen.rotation}`)).toBe(true)
      expect(advice.bestPlacement?.tailShape).toBe(position.name)
    })
  }

  it.each([0, 1, 2, 3])('falls back to a low connection instead of dumping the companion (colors +%i)', shift => {
    const f = fixture(shift)
    const grid = f.grid(['.G...B', '.B...G', 'RY...B', 'RR...G', 'YY..YG'])
    const pairs = f.pairs('GR RY GB'), plan = f.plan('R', 'Y')
    // Ungated skeleton search exists, but its connector would discard green
    // high on column 2. No same-target, two-use connector is available.
    expect(FiveChainPlanner.rank(grid, pairs, plan, () => null)).not.toBeNull()
    expect(FiveChainPlanner.rank(grid, pairs, plan, () => null, undefined, { connectLeftNow: true })).toBeNull()
    const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, ...pairs as [PuyoPair, PuyoPair, PuyoPair], plan)
    expect(advice.bestPlacement).toMatchObject({ placement: { column: 3, rotation: 3 },
      landing: { mainPos: { x: 3, y: 12 }, subPos: { x: 2, y: 12 } }, tailShape: 'Y' })
  })

  it('ignores the hidden fourth pair and does not mutate recovery inputs', () => {
    const f = fixture(0), position = positions[0]
    const grid = f.grid(position.rows), pairs = f.pairs(position.queue), plan = f.plan(position.a, position.b)
    const snapshot = JSON.stringify({ grid, pairs, plan })
    const ranked = FiveChainPlanner.rank(grid, pairs, plan, () => null, undefined, { connectLeftNow: true })
    expect(ranked).not.toBeNull()
    expect(FiveChainPlanner.rank(grid, [...pairs, ...f.pairs('GG')], plan, () => null,
      undefined, { connectLeftNow: true })).toEqual(ranked)
    expect(JSON.stringify({ grid, pairs, plan })).toBe(snapshot)
  })

  it.each([0, 1, 2, 3])('preserves the move-10 tail of the no-gate counterexample from the opening (colors +%i)', shift => {
    const f = fixture(shift)
    // Development game 8: fixing the Y shape indefinitely misses completion.
    // Connecting into the compatible seat instead completes the tail at 10.
    const pairs = f.pairs('RG RG BG BB GR RG BY BR YG YG YY GB')
    const plan = PlacementAdvisor.createTrainingPlan(pairs[0], pairs[1])
    let grid = f.grid([])
    let firstCompletion: number | null = null
    for (let turn = 0; turn < 10; turn++) {
      const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, pairs[turn], pairs[turn + 1], pairs[turn + 2], plan)
      const result = simulateTurn(grid, pairs[turn], advice.bestPlacement!.placement)
      expect(result.valid).toBe(true)
      expect(result.chainCount).toBe(0)
      expect(isSpawnBlocked(result.stableGrid)).toBe(false)
      grid = result.stableGrid
      if (firstCompletion === null && PlacementAdvisor.isAdaptiveTailComplete(grid, plan)) firstCompletion = turn + 1
    }
    expect(firstCompletion).not.toBeNull()
    expect(firstCompletion!).toBeLessThanOrEqual(10)
  }, 15000)

  it.each([0, 1, 2, 3])('completes and fires the formerly stalled game 136 from the opening (colors +%i)', shift => {
    const f = fixture(shift)
    const pairs = f.pairs('YB RR BB RG YY BB YR RR YY RR RG BR RY GB BR YG YB YR YR GB')
    const plan = PlacementAdvisor.createTrainingPlan(pairs[0], pairs[1])
    let grid = f.grid([])
    let completed = false, fired = false
    for (let turn = 0; turn < 17; turn++) {
      const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, pairs[turn], pairs[turn + 1], pairs[turn + 2], plan)
      const result = simulateTurn(grid, pairs[turn], advice.bestPlacement!.placement)
      expect(result.valid).toBe(true)
      expect(isSpawnBlocked(result.stableGrid)).toBe(false)
      if (result.chainCount > 0) {
        expect(completed).toBe(true)
        expect(advice.bestPlacement).toMatchObject({ isIntendedMainFire: true, hasCollateralClear: false })
        expect(advice.bestPlacement!.intendedMainChainCount).toBeGreaterThanOrEqual(5)
        fired = true
        break
      }
      grid = result.stableGrid
      completed ||= PlacementAdvisor.isAdaptiveTailComplete(grid, plan)
    }
    expect(fired).toBe(true)
  }, 15000)
})
