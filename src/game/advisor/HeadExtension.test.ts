import { describe, expect, it } from 'vitest'
import { PuyoColor, type PuyoPair } from '../core/types'
import { simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { inspectHeadExtension } from '../gtr/HeadExtension'
import { GTRDetector } from '../gtr/GTRPatterns'
import { PlacementAdvisor } from './PlacementAdvisor'
import { createMainFireBaseline, analyzeCandidateFire } from './MainFireAnalysis'
import { FiveChainPlanner } from './FiveChainPlanner'

const palette = Object.values(PuyoColor)
const fixture = (shift = 0) => {
  const colors: Record<string, PuyoColor> = { R: PuyoColor.RED, B: PuyoColor.BLUE, Y: PuyoColor.YELLOW, G: PuyoColor.GREEN }
  const color = (c: string) => palette[(palette.indexOf(colors[c]) + shift) % 4]
  const grid = (rows: string[]): PuyoGrid => [
    ...Array.from({ length: 13 - rows.length }, () => Array(6).fill(null)),
    ...rows.map(row => [...row].map(c => c === '.' ? null : color(c))),
  ]
  const pair = (text: string): PuyoPair => ({ main: { color: color(text[0]), x: 2, y: 1 }, sub: { color: color(text[1]), x: 2, y: 0 }, rotation: 0, falling: true })
  return { grid, pair, color }
}

describe('verified single-step head extension', () => {
  it.each([0, 1, 2, 3])('keeps a ready five-chain entrance instead of starting a new two-puyo wait (%i)', shift => {
    const { grid, pair, color } = fixture(shift)
    const board = grid(['.BGR..', 'RYBGR.', 'RRYBGR', 'YYBBGR'])
    const plan = { colorA: color('R'), colorB: color('Y'), colorC: color('R'), colorD: color('Y') }
    expect(createMainFireBaseline(board)?.resolution.chainCount).toBe(5)
    const head = simulateTurn(board, pair('BR'), { column: 0, rotation: 0 })
    expect(inspectHeadExtension(head.stableGrid)).toMatchObject({ missing: 2 })
    // Isolate non-firing construction choices: a valid head is still not an
    // acceptable construction detour once the original five is ready.
    const ranked = FiveChainPlanner.rank(board, [pair('BR')], plan, () => null)
    expect(ranked?.size).toBeGreaterThan(0)
    expect(ranked?.has('0:0')).toBe(false)
  })

  it.each([0, 1, 2, 3])('uses the reported spare pair on the left, keeping its future colors pending (%i)', shift => {
    const { grid, pair, color } = fixture(shift)
    const board = grid(['.Y....', 'BRY...', 'BBRY..', 'RRYYRG'])
    const plan = { colorA: color('B'), colorB: color('R'), colorC: color('B'), colorD: color('R') }
    const before = JSON.stringify(board)
    const advice = PlacementAdvisor.getAdvice({ grid: board, width: 6, height: 13 }, pair('BY'), pair('GG'), pair('BG'), plan)
    expect(advice.bestPlacement?.placement).toEqual({ column: 0, rotation: 2 })
    const placed = simulateTurn(board, pair('BY'), advice.bestPlacement!.placement)
    expect(placed.chainCount).toBe(0)
    expect(inspectHeadExtension(placed.stableGrid)).toMatchObject({ color: color('Y'), missing: 2 })
    expect(GTRDetector.getFullBoardChainCount(placed.stableGrid)).toBe(0)
    expect(GTRDetector.detectGTR(placed.stableGrid).chainCount).toBe(3)
    const fire = simulateTurn(placed.stableGrid, pair('YY'), { column: 1, rotation: 0 })
    expect(fire.chainCount).toBe(4)
    expect(analyzeCandidateFire(pair('YY'), fire, createMainFireBaseline(placed.stableGrid))).toMatchObject({ isIntendedMainFire: true, hasCollateralClear: false })
    expect(JSON.stringify(board)).toBe(before)
  })

  it.each([0, 1, 2, 3])('recognizes and fires the same five-chain tail after the extra head step (%i)', shift => {
    const { grid, pair, color } = fixture(shift)
    const board = grid(['R.....', 'BBGR..', 'RYBGR.', 'RRYBGR', 'YYBBGR'])
    // The head is B/B with an R key above, the L tail is still physically five.
    const plan = { colorA: color('R'), colorB: color('Y'), colorC: color('R'), colorD: color('Y') }
    expect(inspectHeadExtension(board)?.missing).toBe(2)
    expect(PlacementAdvisor.getCompletedTailShape(board, plan)).toBe('L')
    const advice = PlacementAdvisor.getAdvice({ grid: board, width: 6, height: 13 }, pair('BB'), undefined, undefined, plan)
    expect(advice.bestPlacement).toMatchObject({ isIntendedMainFire: true, intendedMainChainCount: 6 })
    expect(simulateTurn(board, pair('BB'), advice.bestPlacement!.placement).chainCount).toBe(6)
    const oneMissing = board.map(row => [...row])
    oneMissing[8][1] = color('B')
    expect(inspectHeadExtension(oneMissing)?.missing).toBe(1)
    expect(GTRDetector.getFullBoardChainCount(oneMissing)).toBe(6)
    expect(GTRDetector.detectGTR(oneMissing).chainCount).toBe(5)
  })

  it('does not credit a partial, blocked, inverted or prematurely clearing head', () => {
    const { grid, pair, color } = fixture()
    const board = grid(['R.....', 'BBGR..', 'RYBGR.', 'RRYBGR', 'YYBBGR'])
    const baseline = createMainFireBaseline(board)
    const partial = simulateTurn(board, pair('BR'), { column: 1, rotation: 0 })
    expect(analyzeCandidateFire(pair('BR'), partial, baseline).isIntendedMainFire).toBe(false)
    for (const mutate of [
      (b: PuyoGrid) => { b[8][0] = color('B') },
      (b: PuyoGrid) => { b[8][1] = color('G') },
      (b: PuyoGrid) => { b[9][2] = color('B') },
      (b: PuyoGrid) => { b[11][1] = color('G') },
      (b: PuyoGrid) => { b[5][0] = color('G') },
    ]) {
      const broken = board.map(row => [...row]); mutate(broken)
      expect(inspectHeadExtension(broken)).toBeNull()
    }
  })
})
