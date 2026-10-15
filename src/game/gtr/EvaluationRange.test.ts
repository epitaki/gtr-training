import { describe, expect, it } from 'vitest'
import { GTRDetector } from './GTRPatterns'
import { createGTREvaluationGrid, isInGTREvaluationRange } from './EvaluationRange'
import { PuyoColor, type PuyoPair } from '../core/types'
import { resolveChains, simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { PlacementAdvisor } from '../advisor/PlacementAdvisor'

const palette = [PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW]
const board = (rows: string[], shift = 0): PuyoGrid => [
  ...Array.from({ length: 13 - rows.length }, () => Array<PuyoColor | null>(6).fill(null)),
  ...rows.map(row => [...row].map(c => c === '.' ? null : palette[('RGBY'.indexOf(c) + shift) % 4])),
]
const reported = ['..R...', '.YB...', '.RBYY.', 'BYGRR.', 'BBYGGG', 'YYGBBR']

describe('foundation-only chain evaluation', () => {
  it('uses exactly the same 22 cells as the result-screen highlight', () => {
    const filled = Array.from({ length: 13 }, () => Array(6).fill(PuyoColor.BLUE))
    const projected = createGTREvaluationGrid(filled)
    expect(projected.flat().filter(Boolean)).toHaveLength(22)
    expect(projected[9]).toEqual([null, null, ...Array(4).fill(PuyoColor.BLUE)])
    expect(projected.slice(10)).toEqual(filled.slice(10))
    expect(projected.slice(0, 9).flat().every(c => c === null)).toBe(true)
    for (const [x, y] of [[-1, 10], [6, 10], [2, 8], [0, 9], [2, 13]]) {
      expect(isInGTREvaluationRange(x, y)).toBe(false)
    }
    projected[10][0] = null
    expect(filled[10][0]).toBe(PuyoColor.BLUE)
  })

  it.each([0, 1, 2, 3])('grades the reported board as three, not five (%i)', shift => {
    const grid = board(reported, shift)
    const before = structuredClone(grid)
    expect(GTRDetector.getFullBoardChainCount(grid)).toBe(5)
    expect(GTRDetector.detectGTR(grid)).toMatchObject({
      chainCount: 3, chainTailScore: 30, totalScore: 68, leftoverPuyos: 8, quality: 100,
    })
    const fired = structuredClone(grid)
    fired[9][0] = fired[10][0]
    const actual = resolveChains(fired)
    expect(actual.clearSteps[3].clearedPuyos.some(p => p.origin?.x === 2 && p.origin.y === 8)).toBe(true)
    expect(actual.clearSteps[4].clearedPuyos.some(p => p.origin?.x === 2 && p.origin.y === 7)).toBe(true)
    expect(grid).toEqual(before)
  })

  it('ignores outside colors, clears and fallen leftovers instead of filtering after gravity', () => {
    const foundation = createGTREvaluationGrid(board(reported))
    const expected = GTRDetector.detectGTR(foundation)
    for (const color of palette) {
      // Includes both left excluded cells on row 9 and all cells above row 9.
      // Those groups would clear and fall if the original board were simulated.
      const grid = foundation.map((row, y) => row.map((c, x) => isInGTREvaluationRange(x, y) ? c : color))
      expect(GTRDetector.detectGTR(grid)).toEqual(expected)
    }
  })

  it('keeps physical CURRENT fire independent from foundation scoring', () => {
    const grid = board(reported)
    const pair = (main: PuyoColor, sub: PuyoColor): PuyoPair => ({
      main: { color: main, x: 2, y: 1 }, sub: { color: sub, x: 2, y: 0 }, rotation: 0, falling: true,
    })
    const current = pair(PuyoColor.BLUE, PuyoColor.BLUE)
    const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, current,
      pair(PuyoColor.GREEN, PuyoColor.GREEN), pair(PuyoColor.RED, PuyoColor.GREEN),
      { colorA: PuyoColor.BLUE, colorB: PuyoColor.YELLOW, colorC: PuyoColor.BLUE, colorD: PuyoColor.YELLOW })
    expect(advice.bestPlacement).toMatchObject({
      placement: { column: 0, rotation: 0 }, isIntendedMainFire: true, intendedMainChainCount: 5,
    })
    expect(simulateTurn(grid, current, advice.bestPlacement!.placement).chainCount).toBe(5)
    expect(GTRDetector.detectGTR(grid).chainCount).toBe(3)
  })
})
