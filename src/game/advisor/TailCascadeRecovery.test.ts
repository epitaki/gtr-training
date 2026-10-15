import { describe, expect, it } from 'vitest'
import { inspectTailCascadeRecovery, tailCascadeCredit } from './TailCascadeRecovery'
import { PlacementAdvisor } from './PlacementAdvisor'
import { PuyoColor, type PuyoPair } from '../core/types'
import { resolveChains, simulateTurn, type PuyoGrid } from '../core/ChainSimulator'

const palette = [PuyoColor.RED, PuyoColor.YELLOW, PuyoColor.BLUE, PuyoColor.GREEN]
const color = (letter: string, shift = 0) => palette[('RYBG'.indexOf(letter) + shift) % 4]
const board = (rows: string[], shift = 0): PuyoGrid => [
  ...Array.from({ length: 13 - rows.length }, () => Array<PuyoColor | null>(6).fill(null)),
  ...rows.map(row => [...row].map(c => c === '.' ? null : color(c, shift))),
]
const baseRows = ['..GR..', 'RYBGR.', 'RRYBBR', 'YYBGGR']
const heights = [3, 3, 4, 4, 3, 2]
const fire = (grid: PuyoGrid) => {
  const copy = grid.map(row => [...row])
  copy[9][0] = copy[10][0]
  return copy
}
const pair = (main: PuyoColor, sub = main): PuyoPair => ({
  main: { color: main, x: 2, y: 1 }, sub: { color: sub, x: 2, y: 0 }, rotation: 0, falling: true,
})
const training = (shift = 0) => ({ colorA: color('R', shift), colorB: color('Y', shift), colorC: color('R', shift), colorD: color('Y', shift) })

describe('tail cascade recovery, not a height or chain-count bonus', () => {
  it.each([0, 1, 2, 3])('tracks a 1/1/2 avalanche after the original five stages (colors +%i)', shift => {
    const grid = board(['...G..', '..GRGG', 'RYBGRG', 'RRYBBR', 'YYBGGR'], shift)
    expect(resolveChains(grid).chainCount).toBe(0)
    const firedGrid = fire(grid)
    const actual = resolveChains(firedGrid)
    const baseline = resolveChains(fire(board(baseRows, shift)))
    const snapshot = JSON.stringify({ firedGrid, actual, baseline })
    expect(actual).toMatchObject({ chainCount: 6, allClear: true })
    const result = inspectTailCascadeRecovery(firedGrid, baseline, actual, heights)
    expect(result).toMatchObject({ preservesMainChain: true, additionalRecovered: 4, tsurukameOrigins: [] })
    expect(new Set(result.avalancheOrigins)).toEqual(new Set(['3,8', '4,9', '5,9', '5,10']))
    expect(JSON.stringify({ firedGrid, actual, baseline })).toBe(snapshot)
  })

  it.each([0, 1, 2, 3])('recovers falling tsurukame spares without requiring an extra chain (colors +%i)', shift => {
    const grid = board(['....G.', '....G.', '..GRG.', 'RYBGRG', 'RRYBBR', 'YYBGGR'], shift)
    expect(resolveChains(grid).chainCount).toBe(0)
    const firedGrid = fire(grid)
    const actual = resolveChains(firedGrid)
    expect(actual).toMatchObject({ chainCount: 5, allClear: true })
    const result = inspectTailCascadeRecovery(firedGrid, resolveChains(fire(board(baseRows, shift))), actual, heights)
    expect(result).toMatchObject({ preservesMainChain: true, additionalRecovered: 4, avalancheOrigins: [] })
    expect(new Set(result.tsurukameOrigins)).toEqual(new Set(['4,7', '4,8', '4,9', '5,10']))
  })

  it('does not count an isolated high puyo as a useful setup', () => {
    const grid = board(baseRows)
    grid[10][5] = PuyoColor.GREEN
    const firedGrid = fire(grid)
    const result = inspectTailCascadeRecovery(firedGrid, resolveChains(fire(board(baseRows))), resolveChains(firedGrid), heights)
    expect(result).toEqual({ preservesMainChain: true, additionalRecovered: 0, avalancheOrigins: [], tsurukameOrigins: [] })
  })

  it('follows a second avalanche through the first without double-counting origins', () => {
    const grid = board(['...B.B', '...GBB', '..GRGG', 'RYBGRG', 'RRYBBR', 'YYBGGR'])
    expect(resolveChains(grid).chainCount).toBe(0)
    const firedGrid = fire(grid)
    const actual = resolveChains(firedGrid)
    expect(actual).toMatchObject({ chainCount: 7, allClear: true })
    const result = inspectTailCascadeRecovery(firedGrid, resolveChains(fire(board(baseRows))), actual, heights)
    expect(result.avalancheOrigins).toHaveLength(8)
    expect(new Set(result.avalancheOrigins).size).toBe(8)
    expect(result.additionalRecovered).toBe(8)
    expect(tailCascadeCredit(result.avalancheOrigins.length)).toBe(16)
  })

  it('rejects a right-hand avalanche color that consumes the main chain early', () => {
    const grid = board(['...R..', '..GRRR', 'RYBGRR', 'RRYBBR', 'YYBGGR'])
    expect(resolveChains(grid).chainCount).toBeGreaterThan(0)
    const firedGrid = fire(grid)
    expect(inspectTailCascadeRecovery(firedGrid, resolveChains(fire(board(baseRows))), resolveChains(firedGrid), heights))
      .toEqual({ preservesMainChain: false, additionalRecovered: 0, avalancheOrigins: [], tsurukameOrigins: [] })
  })

  it('does not attribute an independent simultaneous group to the main chain', () => {
    const grid = board(baseRows)
    for (let y = 6; y <= 9; y++) grid[y][1] = PuyoColor.BLUE
    const firedGrid = fire(grid)
    const actual = resolveChains(firedGrid)
    expect(actual.chainCount).toBe(5)
    expect(inspectTailCascadeRecovery(firedGrid, resolveChains(fire(board(baseRows))), actual, heights))
      .toEqual({ preservesMainChain: true, additionalRecovered: 0, avalancheOrigins: [], tsurukameOrigins: [] })
  })

  it('keeps the credit bounded below skeleton progress regardless of chain length', () => {
    expect(tailCascadeCredit(0)).toBe(0)
    expect(tailCascadeCredit(1)).toBe(8)
    expect(tailCascadeCredit(4)).toBe(16)
    expect(tailCascadeCredit(20)).toBe(16)
  })

  it.each([0, 1, 2, 3])('recommends completing an avalanche instead of dumping the pair (colors +%i)', shift => {
    const grid = board(['...G..', '..GRG.', 'RYBGR.', 'RRYBBR', 'YYBGGR'], shift)
    const current = pair(color('G', shift))
    const advice = PlacementAdvisor.getAdvice({ grid, height: 13, width: 6 }, current, undefined, undefined, training(shift))
    expect(advice.bestPlacement?.placement).toEqual({ column: 5, rotation: 0 })
    const result = simulateTurn(grid, current, advice.bestPlacement!.placement)
    expect(result.chainCount).toBe(0)
    expect(resolveChains(fire(result.stableGrid))).toMatchObject({ chainCount: 6, allClear: true })
    const dumped = simulateTurn(grid, current, { column: 1, rotation: 0 })
    expect(resolveChains(fire(dumped.stableGrid)).allClear).toBe(false)
  })

  it('recommends a tsurukame recovery even though the chain count stays five', () => {
    const grid = board(['....G.', '..GRG.', 'RYBGR.', 'RRYBBR', 'YYBGGR'])
    const current = pair(PuyoColor.GREEN)
    const advice = PlacementAdvisor.getAdvice({ grid, height: 13, width: 6 }, current, undefined, undefined, training())
    expect(advice.bestPlacement?.placement).toEqual({ column: 4, rotation: 1 })
    const result = simulateTurn(grid, current, advice.bestPlacement!.placement)
    expect(result.chainCount).toBe(0)
    expect(resolveChains(fire(result.stableGrid))).toMatchObject({ chainCount: 5, allClear: true })
  })

  it('fires now rather than waiting for avalanche completion', () => {
    const grid = board(['...G..', '..GRG.', 'RYBGR.', 'RRYBBR', 'YYBGGR'])
    const advice = PlacementAdvisor.getAdvice({ grid, height: 13, width: 6 },
      pair(PuyoColor.RED, PuyoColor.GREEN), pair(PuyoColor.GREEN), pair(PuyoColor.GREEN), training())
    expect(advice.bestPlacement).toMatchObject({ isIntendedMainFire: true, intendedMainChainCount: 5 })
  })
})
