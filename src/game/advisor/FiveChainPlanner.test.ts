import { describe, expect, it } from 'vitest'
import { FiveChainPlanner } from './FiveChainPlanner'
import { PlacementAdvisor } from './PlacementAdvisor'
import { resolveChains, simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'

const { RED: R, YELLOW: Y, BLUE: B, GREEN: G } = PuyoColor
const plan = { colorA: R, colorB: Y, colorC: R, colorD: Y }
const pair = (main: PuyoColor, sub: PuyoColor): PuyoPair => ({
  main: { x: 2, y: 1, color: main }, sub: { x: 2, y: 0, color: sub }, rotation: 0, falling: true,
})
const gridFrom = (rows: string[]): PuyoGrid => {
  const mapping: Record<string, PuyoColor> = { A: R, B: Y, C: B, D: G, E: R }
  return [
    ...Array.from({ length: 13 - rows.length }, () => Array<PuyoColor | null>(6).fill(null)),
    ...rows.map(row => [...row].map(c => mapping[c] ?? null)),
  ]
}

describe('FiveChainPlanner', () => {
  it('diagnoses one compatible physical target without mutating the board', () => {
    const grid = gridFrom(['..DE..', 'ABCDE.', 'AABCCE', 'BBCDDE'])
    const snapshot = structuredClone(grid)
    expect(FiveChainPlanner.inspectCompletion(grid, plan)).toMatchObject({
      shape: 'Y', complete: true, tailComplete: true, missingCount: 0,
      orderedDraws: 0, unorderedDraws: 0, queues: [[], [], [], [], [], []],
    })
    expect(grid).toEqual(snapshot)
    grid[9][3] = null
    const partial = FiveChainPlanner.inspectCompletion(grid, plan)
    expect(partial).not.toBeNull()
    expect(partial).toMatchObject({ complete: false, tailComplete: true, missingCount: 1, orderedDraws: 4 })
    expect(partial!.queues.flat()).toHaveLength(1)
  })

  it('does not invent completion estimates for an incompatible board or dimensions', () => {
    expect(FiveChainPlanner.inspectCompletion([], plan)).toBeNull()
    const incompatible = gridFrom(['C.....'])
    expect(FiveChainPlanner.inspectCompletion(incompatible, plan)).toBeNull()
  })

  it('keeps the post-tail wait evaluation independent of hidden fourth pairs and inputs', () => {
    const grid = gridFrom(['..D...', 'ABCD..', 'AABCC.', 'BBCDD.'])
    expect(FiveChainPlanner.inspectCompletion(grid, plan)?.tailComplete).toBe(true)
    const pairs = [pair(G, B), pair(R, G), pair(Y, B)]
    const snapshot = JSON.stringify({ grid, pairs })
    const first = FiveChainPlanner.rank(grid, pairs, plan, () => null)
    expect(first).not.toBeNull()
    expect(FiveChainPlanner.rank(grid, [...pairs, pair(R, R)], plan, () => null)).toEqual(first)
    expect(JSON.stringify({ grid, pairs })).toBe(snapshot)
  })

  it.each([0, 1, 2, 3])('uses both spare colors in a completed chain instead of abandoning one (color rotation %i)', shift => {
    const palette = Object.values(PuyoColor)
    const rename = (color: PuyoColor) => palette[(palette.indexOf(color) + shift) % 4]
    const grid = gridFrom(['..DE..', 'ABCDE.', 'AABCCE', 'BBCDDE'])
      .map(row => row.map(color => color === null ? null : rename(color)))
    const current = pair(rename(G), rename(Y))
    const fold = { ...plan, colorA: rename(R), colorB: rename(Y), colorC: rename(R), colorD: rename(Y) }
    const snapshot = JSON.stringify({ grid, current })
    const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, current, undefined, undefined, fold)
    const useful = advice.allPlacements.find(candidate => candidate.placement.column === 1 && candidate.placement.rotation === 2)!
    const leftover = advice.allPlacements.find(candidate => candidate.placement.column === 1 && candidate.placement.rotation === 0)!
    expect(useful.totalScore).toBeGreaterThanOrEqual(leftover.totalScore)
    expect(advice.allPlacements.indexOf(useful)).toBeLessThan(advice.allPlacements.indexOf(leftover))
    expect(advice.bestPlacement).toBe(useful)
    for (const [candidate, expectedLeft] of [[useful, 0], [leftover, 1]] as const) {
      const placed = simulateTurn(grid, current, candidate.placement)
      expect(placed.chainCount).toBe(0)
      placed.stableGrid[9][0] = rename(R)
      const fired = resolveChains(placed.stableGrid)
      expect(fired.chainCount).toBe(5)
      expect(fired.stableGrid.flat().filter(color => color !== null)).toHaveLength(expectedLeft)
    }
    expect(JSON.stringify({ grid, current })).toBe(snapshot)
  })

  it.each([
    ['Y', ['..DE..', 'ABCDE.', 'AABCCE', 'BBCDDE']],
    ['L', ['..DE..', 'ABCDE.', 'AABCDE', 'BBCCDE']],
    ['zabuton', ['..E...', '..D...', 'ABCEE.', 'AABCCC', 'BBDDDE']],
  ] as const)('fires a completed %s five-chain now instead of continually deferring it', (_, rows) => {
    const grid = gridFrom([...rows])
    expect(resolveChains(grid).chainCount).toBe(0)
    expect(PlacementAdvisor.isAdaptiveTailComplete(grid, plan)).toBe(true)
    expect(FiveChainPlanner.rank(grid, [pair(R, Y)], plan, () => 'clean')).not.toBeNull()
    const advice = PlacementAdvisor.getAdvice(
      { grid, width: 6, height: 13 }, pair(R, Y), pair(R, G), pair(R, B), plan,
    )
    expect(advice.bestPlacement).toMatchObject({ isIntendedMainFire: true, intendedMainChainCount: 5 })
    expect(advice.bestPlacement?.tailShape).toBe(_)
    const fired = simulateTurn(grid, pair(R, Y), advice.bestPlacement!.placement)
    expect(fired.chainCount).toBeGreaterThanOrEqual(5)
  })

  it('is deterministic, leaves inputs unchanged, and never reads a fourth pair', () => {
    const grid = gridFrom(['......'])
    const pairs = [pair(Y, R), pair(Y, B), pair(G, R)]
    const snapshot = JSON.stringify({ grid, pairs })
    const first = FiveChainPlanner.rank(grid, pairs, plan, () => null)
    const second = FiveChainPlanner.rank(grid, [...pairs, pair(B, B)], plan, () => null)
    expect(first).not.toBeNull()
    expect(second).toEqual(first)
    expect(JSON.stringify({ grid, pairs })).toBe(snapshot)
  })

  it('does not trade construction quality for recovery that causes a collateral fire later', () => {
    // Development game 348, turns 13-20. An additive recovery bonus caused a
    // separate red clear when the final firing pair's companion was placed.
    const encoded = '.................................................RB....RB.GYGRGBYGGGRGGYRRGBBY'
    const palette: Record<string, PuyoColor> = { R, G, B, Y }
    let board: PuyoGrid = encoded.match(/.{6}/g)!.map(row => [...row].map(c => palette[c] ?? null))
    const queue = ['BR', 'RR', 'YB', 'RR', 'YB', 'YY', 'BR', 'RG', 'YY', 'BR']
      .map(colors => pair(palette[colors[0]], palette[colors[1]]))
    const training = { colorA: G, colorB: R, colorC: G, colorD: R }
    for (let index = 0; index < 8; index++) {
      const advice = PlacementAdvisor.getAdvice({ grid: board, width: 6, height: 13 },
        queue[index], queue[index + 1], queue[index + 2], training)
      expect(advice.bestPlacement!.hasCollateralClear).toBe(false)
      const outcome = simulateTurn(board, queue[index], advice.bestPlacement!.placement)
      if (index < 7) expect(outcome.chainCount).toBe(0)
      else {
        // The visible-pair recovery can rebuild a connected six-chain here:
        // same firing turn, six leftovers instead of the old sixteen. The
        // regression is an independent collateral clear, not the link count.
        expect(outcome.chainCount).toBeGreaterThanOrEqual(5)
        expect(advice.bestPlacement!.isIntendedMainFire).toBe(true)
        expect(outcome.stableGrid.flat().filter(Boolean).length).toBeLessThanOrEqual(16)
      }
      board = outcome.stableGrid
    }
  })

  it('returns control to the general advisor for incompatible shapes or blocked spawn cells', () => {
    const incompatible = gridFrom(['......'])
    incompatible[12][0] = B
    expect(FiveChainPlanner.rank(incompatible, [pair(R, B)], plan, () => null)).toBeNull()
    const blocked = gridFrom(['..DE..', 'ABCDE.', 'AABCDE', 'BBCCDE'])
    for (let row = 1; row < 9; row++) blocked[row][2] = row % 2 ? R : Y
    expect(FiveChainPlanner.rank(blocked, [pair(R, B)], plan, () => 'clean')).toBeNull()
  })

  it('prefers the clean five-chain over a same-depth fire with an independent extra clear', () => {
    const colors: Record<string, PuyoColor> = { R, Y, B, G }
    const grid: PuyoGrid = [
      ...Array.from({ length: 6 }, () => Array(6).fill(null)),
      ...['.G....', '.B....', '.B....', '.BGB..', 'RYRGB.', 'RRYRRB', 'YYRGGB']
        .map(row => [...row].map(color => colors[color] ?? null)),
    ]
    const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair(R, B), undefined, undefined, plan)
    const collateral = advice.allPlacements.find(candidate => candidate.placement.column === 0 && candidate.placement.rotation === 0)!
    const clean = advice.allPlacements.find(candidate => candidate.placement.column === 0 && candidate.placement.rotation === 1)!
    expect(collateral).toMatchObject({ isIntendedMainFire: true, hasCollateralClear: true, intendedMainChainCount: 5 })
    expect(clean).toMatchObject({ isIntendedMainFire: true, hasCollateralClear: false, intendedMainChainCount: 5 })
    expect(clean.totalScore).toBeGreaterThan(collateral.totalScore)
    expect(advice.bestPlacement).toBe(clean)
  })
})
