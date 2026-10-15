import { describe, expect, it } from 'vitest'
import { PlacementAdvisor } from './PlacementAdvisor'
import { isSpawnBlocked, simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'

const COLORS = [PuyoColor.RED, PuyoColor.BLUE, PuyoColor.YELLOW, PuyoColor.GREEN]
const SYMBOLS = 'RBYG'
const fixture = (rotation: number) => {
  const color = (symbol: string): PuyoColor => COLORS[(SYMBOLS.indexOf(symbol) + rotation) % COLORS.length]
  const pair = (symbols: string): PuyoPair => ({
    main: { color: color(symbols[0]), x: 2, y: 1 },
    sub: { color: color(symbols[1]), x: 2, y: 0 }, rotation: 0, falling: true,
  })
  const grid = (rows: string[]): PuyoGrid => [
    ...Array.from({ length: 13 - rows.length }, () => Array<PuyoColor | null>(6).fill(null)),
    ...rows.map(row => [...row].map(symbol => symbol === '.' ? null : color(symbol))),
  ]
  const plan = { colorA: color('B'), colorB: color('R'), colorC: color('B'), colorD: color('R') }
  return { pair, grid, plan }
}

describe('Y-first teaching preference', () => {
  it.each([0, 1, 2, 3])('recognizes a surviving Y when a same-color zabuton also fits (color rotation %i)', rotation => {
    const { grid, plan } = fixture(rotation)
    const board = grid(['.YYGR.', '.YRYG.', 'BRYBBB', 'BBRYYY', 'RRYBGG'])
    const original = structuredClone(board)
    const completed = PlacementAdvisor.getTailPlans(board, plan).filter(p => p.templateFilled)
    expect(completed.map(p => p.shape)).toEqual(expect.arrayContaining(['Y', 'zabuton']))
    expect(new Set(completed.map(p => p.color)).size).toBe(1)
    expect(PlacementAdvisor.getCompletedTailShape(board, plan)).toBe('Y')
    expect(PlacementAdvisor.isAdaptiveTailComplete(board, plan)).toBe(true)
    expect(board).toEqual(original)
  })
  it.each([0, 1, 2, 3])('keeps and completes the Y at the reported fifth-turn fork (color rotation %i)', rotation => {
    const { pair, grid, plan } = fixture(rotation)
    let board = grid(['BR....', 'BBR...', 'RRY...'])
    // Same visible queue as the report. Blue below yellow in column 3 would
    // block the yellow Y head and commit to the blue zabuton instead.
    const queue = ['BY', 'GY', 'GY', 'YR', 'BG'].map(pair)
    for (let index = 0; index < 3; index++) {
      const advice = PlacementAdvisor.getAdvice(
        { grid: board, width: 6, height: 13 }, queue[index], queue[index + 1], queue[index + 2], plan,
      )
      expect(advice.bestPlacement?.tailShape).toBe('Y')
      const outcome = simulateTurn(board, queue[index], advice.bestPlacement!.placement)
      expect(outcome.valid).toBe(true)
      expect(outcome.chainCount).toBe(0)
      expect(isSpawnBlocked(outcome.stableGrid)).toBe(false)
      if (index === 0) {
        // Filling the arms before the connector is also legal; never cover
        // the yellow connector with blue. The Y must still finish in 3 pairs.
        expect([null, pair('YY').main.color]).toContain(outcome.stableGrid[10][2])
        expect(PlacementAdvisor.getFoldPlan(outcome.stableGrid, plan)?.missingColors).toEqual([])
      }
      board = outcome.stableGrid
    }
    expect(PlacementAdvisor.getCompletedTailShape(board, plan)).toBe('Y')
  })

  it.each([0, 1, 2, 3])('finishes an established zabuton and fires five instead of rebuilding (color rotation %i)', rotation => {
    const { pair, grid, plan } = fixture(rotation)
    const board = grid(['..Y...', '..Y...', '..GY..', '.RYYR.', 'BRBGG.', 'BBRBB.', 'RRYYYG'])
    const current = pair('BY')
    const next = pair('RB')
    const next2 = pair('BG')
    expect(PlacementAdvisor.getTailPlans(board, plan).every(tail => tail.shape === 'zabuton')).toBe(true)
    const advice = PlacementAdvisor.getAdvice({ grid: board, width: 6, height: 13 }, current, next, next2, plan)
    expect(advice.bestPlacement?.placement).toEqual({ column: 5, rotation: 0 })
    const built = simulateTurn(board, current, advice.bestPlacement!.placement)
    expect(built.chainCount).toBe(0)
    expect(PlacementAdvisor.getCompletedTailShape(built.stableGrid, plan)).toBe('zabuton')
    const fireAdvice = PlacementAdvisor.getAdvice({ grid: built.stableGrid, width: 6, height: 13 }, next, next2, undefined, plan)
    expect(fireAdvice.bestPlacement).toMatchObject({ isIntendedMainFire: true, intendedMainChainCount: 5 })
    expect(simulateTurn(built.stableGrid, next, fireAdvice.bestPlacement!.placement).chainCount).toBe(5)
  })

  it.each([0, 1, 2, 3])('replays the reported queue through a Y tail and real five-chain (color rotation %i)', rotation => {
    const { pair, grid, plan } = fixture(rotation)
    let board = grid([])
    // Captured pairs only. Each recommendation sees CURRENT/NEXT/NEXT2,
    // never the whole queue, random state or a fabricated future pair.
    const queue = ['RB', 'RB', 'YB', 'RR', 'BY', 'GY', 'GY', 'YR', 'BG', 'YY', 'BY', 'GR', 'BY', 'RB', 'BG'].map(pair)
    let fired = false
    for (let index = 0; index < 14; index++) {
      const advice = PlacementAdvisor.getAdvice(
        { grid: board, width: 6, height: 13 }, queue[index], queue[index + 1], queue[index + 2], plan,
      )
      const outcome = simulateTurn(board, queue[index], advice.bestPlacement!.placement)
      expect(outcome.valid).toBe(true)
      expect(isSpawnBlocked(outcome.stableGrid)).toBe(false)
      if (index === 6) expect(PlacementAdvisor.getCompletedTailShape(outcome.stableGrid, plan)).toBe('Y')
      if (outcome.chainCount > 0) {
        expect(outcome.chainCount).toBe(5)
        expect(PlacementAdvisor.getCompletedTailShape(board, plan)).toBe('Y')
        expect(advice.bestPlacement).toMatchObject({ isIntendedMainFire: true, intendedMainChainCount: 5 })
        fired = true
        break
      }
      board = outcome.stableGrid
    }
    expect(fired).toBe(true)
  })
})
