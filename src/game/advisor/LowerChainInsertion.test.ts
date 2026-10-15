import { describe, expect, it } from 'vitest'
import { insertLowerMainCell } from './LowerChainInsertion'
import { PlacementAdvisor } from './PlacementAdvisor'
import { createMainFireBaseline } from './MainFireAnalysis'
import { resolveChains, simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'

const palette = [PuyoColor.RED, PuyoColor.BLUE, PuyoColor.YELLOW, PuyoColor.GREEN]
const fixture = (shift: number) => {
  const color = (symbol: string) => palette[('RBYG'.indexOf(symbol) + shift) % 4]
  const pair = (text: string): PuyoPair => ({
    main: { color: color(text[0]), x: 2, y: 1 }, sub: { color: color(text[1]), x: 2, y: 0 }, rotation: 0, falling: true,
  })
  const grid = (rows: string[]): PuyoGrid => [
    ...Array.from({ length: 13 - rows.length }, () => Array(6).fill(null)),
    ...rows.map(row => [...row].map(c => c === '.' ? null : color(c))),
  ]
  const plan = { colorA: color('G'), colorB: color('Y'), colorC: color('G'), colorD: color('Y') }
  return { color, pair, grid, plan }
}

describe('lower main-chain participation without sacrificing extension', () => {
  for (const reversed of [false, true]) {
    it.each([0, 1, 2, 3])(`uses blue below green in the reported board (axis reversed=${reversed}, colors +%i)`, shift => {
      const { grid, pair, color, plan } = fixture(shift)
      // User report: capturedAt=2026-09-21T18:18:57.249Z, randomState=847661216.
      const board = grid(['.YB...', 'GYRB..', 'GGYRR.', 'YYRBB.'])
      const current = pair(reversed ? 'GB' : 'BG')
      const before = JSON.stringify({ board, current, plan })
      const advice = PlacementAdvisor.getAdvice({ grid: board, width: 6, height: 13 },
        current, pair('RR'), pair('BB'), plan)
      expect(advice.bestPlacement?.placement).toEqual({ column: 4, rotation: reversed ? 2 : 0 })
      const low = simulateTurn(board, current, advice.bestPlacement!.placement)
      const high = simulateTurn(board, current, { column: 4, rotation: reversed ? 0 : 2 })
      expect(low.chainCount).toBe(0)
      expect(low.stableGrid[10][4]).toBe(color('B'))
      expect(low.stableGrid[9][4]).toBe(color('G'))
      const lowMain = createMainFireBaseline(low.stableGrid)!.resolution
      const highMain = createMainFireBaseline(high.stableGrid)!.resolution
      expect(lowMain.chainCount).toBe(4)
      expect(highMain.chainCount).toBe(4)
      expect(lowMain.clearedPuyos).toBe(highMain.clearedPuyos + 1)
      expect(lowMain.clearSteps[3].clearedPuyos.some(p => p.origin?.x === 4 && p.origin.y === 10)).toBe(true)
      expect(PlacementAdvisor.getCompletedTailShape(low.stableGrid, plan)).toBe('Y')
      expect(JSON.stringify({ board, current, plan })).toBe(before)
    })
  }

  it.each([0, 1, 2, 3])('keeps all five original steps when admitting an inserted lower cell (%i)', shift => {
    const { grid, color, plan, pair } = fixture(shift)
    const board = grid(['..BG..', 'GYRBG.', 'GGYRRG', 'YYRBBG'])
    const snapshot = JSON.stringify(board)
    const expanded = insertLowerMainCell(board, { x: 4, y: 10 }, color('B'))!
    expect(expanded).not.toBeNull()
    expect(resolveChains(expanded).chainCount).toBe(0)
    const before = createMainFireBaseline(board)!.resolution
    const after = createMainFireBaseline(expanded)!.resolution
    expect(after.chainCount).toBe(5)
    expect(after.clearedPuyos).toBe(before.clearedPuyos + 1)
    for (const [i, step] of before.clearSteps.entries()) for (const p of step.clearedPuyos) {
      const { x, y } = p.origin!
      expect(after.clearSteps[i].clearedPuyos.some(q => q.color === p.color && q.origin?.x === x &&
        q.origin.y === (x === 4 && y <= 10 ? y - 1 : y))).toBe(true)
    }
    expect(JSON.stringify(board)).toBe(snapshot)
    // A lower-building preference must never hide a current five-chain fire.
    const advice = PlacementAdvisor.getAdvice({ grid: expanded, width: 6, height: 13 }, pair('BG'), pair('RR'), pair('BB'), plan)
    expect(advice.bestPlacement).toMatchObject({ isIntendedMainFire: true, intendedMainChainCount: 5 })
    expect(simulateTurn(expanded, pair('BG'), advice.bestPlacement!.placement).chainCount).toBe(5)
  })

  it('rejects early clears, incomplete main chains, upper cells and fold changes', () => {
    const { grid, color } = fixture(0)
    const board = grid(['..BG..', 'GYRBG.', 'GGYRRG', 'YYRBBG'])
    expect(insertLowerMainCell(board, { x: 3, y: 10 }, color('R'))).toBeNull()
    expect(insertLowerMainCell(grid(['.YB...', 'GYRB..', 'GGYRR.', 'YYRBB.']), { x: 4, y: 10 }, color('B'))).toBeNull()
    for (const at of [{ x: 0, y: 10 }, { x: 1, y: 10 }, { x: 4, y: 9 }, { x: 6, y: 10 }, { x: 4, y: 13 }, { x: 4.5, y: 10 }]) {
      expect(insertLowerMainCell(board, at, color('B'))).toBeNull()
    }
  })
})
