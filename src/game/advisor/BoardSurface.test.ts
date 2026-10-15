import { describe, expect, it } from 'vitest'
import { inspectBoardSurface, surfaceShapeCost, futureFireSurfaceCost } from './BoardSurface'
import { PlacementAdvisor } from './PlacementAdvisor'
import { simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'

const gridWithHeights = (heights: number[]): PuyoGrid => Array.from({ length: 13 }, (_, y) =>
  heights.map(height => y >= 13 - height ? PuyoColor.BLUE : null))
const colors: Record<string, PuyoColor> = { R: PuyoColor.RED, Y: PuyoColor.YELLOW, B: PuyoColor.BLUE, G: PuyoColor.GREEN }
const pair = (text: string): PuyoPair => ({
  main: { color: colors[text[0]], x: 2, y: 1 }, sub: { color: colors[text[1]], x: 2, y: 0 },
  rotation: 0, falling: true,
})
const board = (rows: string[]): PuyoGrid => [
  ...Array.from({ length: 13 - rows.length }, () => Array(6).fill(null)),
  ...rows.map(row => [...row].map(letter => colors[letter] ?? null)),
]

describe('board surface preference', () => {
  it('prioritizes avoiding a tall well only within the bounded future-fire comparison', () => {
    const noWell = gridWithHeights([3, 5, 3, 7, 5, 3])
    const well = gridWithHeights([3, 6, 3, 6, 5, 3])
    expect(surfaceShapeCost(noWell)).toBeGreaterThan(surfaceShapeCost(well))
    expect(futureFireSurfaceCost(noWell)).toBeLessThan(futureFireSurfaceCost(well))
    expect(futureFireSurfaceCost(gridWithHeights([3, 12, 2, 12, 2, 12]))).toBeLessThan(100)
    expect(futureFireSurfaceCost(gridWithHeights([3, 4, 1, 4, 4, 4]))).toBe(0)
    expect(futureFireSurfaceCost(gridWithHeights([1, 5, 5, 5, 5, 5]))).toBe(0)
    expect(futureFireSurfaceCost([])).toBe(0)
  })
  it('measures the two wells in the reported board without changing it', () => {
    const grid = gridWithHeights([3, 7, 3, 7, 0, 6])
    const before = structuredClone(grid)
    expect(inspectBoardSurface(grid)).toEqual({
      heights: [3, 7, 3, 7, 0, 6], wellDepths: [0, 0, 4, 0, 6, 0],
      roughness: 25, deepWells: 2, maxWellDepth: 6,
    })
    expect(surfaceShapeCost(grid)).toBe(69)
    expect(surfaceShapeCost(gridWithHeights([3, 6, 5, 5, 4, 3]))).toBeLessThan(surfaceShapeCost(grid))
    expect(grid).toEqual(before)
  })

  it('allows low teaching skeletons and two-row steps', () => {
    expect(surfaceShapeCost(gridWithHeights([3, 4, 2, 4, 0, 3]))).toBe(0)
    expect(surfaceShapeCost(gridWithHeights([3, 5, 3, 5, 3, 5]))).toBe(0)
  })

  it('does not reward filling the low left firing entrance', () => {
    expect(surfaceShapeCost(gridWithHeights([1, 5, 5, 5, 5, 5]))).toBe(0)
    expect(surfaceShapeCost(gridWithHeights([3, 5, 5, 5, 5, 5]))).toBe(0)
  })

  it('does not escape the well penalty by piling only one wall into a tall tower', () => {
    const balanced = gridWithHeights([3, 7, 3, 7, 0, 6])
    const taller = gridWithHeights([3, 9, 3, 7, 0, 4])
    expect(surfaceShapeCost(taller)).toBeGreaterThan(surfaceShapeCost(balanced))
    expect(surfaceShapeCost(gridWithHeights([3, 12, 2, 12, 2, 12]))).toBeLessThan(100)
  })

  it('handles empty fields', () => {
    expect(surfaceShapeCost([])).toBe(0)
    expect(surfaceShapeCost(gridWithHeights([0, 0, 0, 0, 0, 0]))).toBe(0)
  })

  it.each([0, 1, 2, 3])('prefers the lower continuation over a tiny future-score advantage (color shift %s)', shift => {
    // Saved regression game 159, move 11. Before: second-column tower chosen
    // for a lookahead advantage of about 0.000122, despite a lower viable path.
    const palette = [PuyoColor.RED, PuyoColor.YELLOW, PuyoColor.BLUE, PuyoColor.GREEN]
    const remap = (color: PuyoColor) => palette[(palette.indexOf(color) + shift) % palette.length]
    // Exact encoded input from lower-chain-20260922-final.json; do not infer colors from height alone.
    const encoded = '........................................B.....R.....B.....Y.YRB.Y.YYRBBYRRBGGY'
    const grid: PuyoGrid = Array.from({ length: 13 }, (_, y) => Array.from({ length: 6 }, (_, x) => {
      const color = colors[encoded[y * 6 + x]]
      return color ? remap(color) : null
    }))
    const mappedPair = (text: string) => {
      const result = pair(text)
      result.main.color = remap(result.main.color); result.sub.color = remap(result.sub.color)
      return result
    }
    const current = mappedPair('YR')
    const plan = { colorA: remap(PuyoColor.YELLOW), colorB: remap(PuyoColor.RED), colorC: remap(PuyoColor.YELLOW), colorD: remap(PuyoColor.RED) }
    const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, current, mappedPair('BB'), mappedPair('YR'), plan)
    // Additional low recipes can use a horizontal continuation here. The
    // invariant is a useful low placement, not the old exact orientation.
    expect(advice.bestPlacement?.placement.column).toBe(3)
    const lower = simulateTurn(grid, current, advice.bestPlacement!.placement)
    const tower = simulateTurn(grid, current, { column: 1, rotation: 0 })
    expect(lower.chainCount).toBe(0)
    expect(PlacementAdvisor.isAdaptiveTailComplete(lower.stableGrid, plan)).toBe(true)
    expect(surfaceShapeCost(lower.stableGrid)).toBeLessThan(surfaceShapeCost(tower.stableGrid))
    expect(advice.bestPlacement!.totalScore).toBeGreaterThan(100000)
  })

  it('reduces the reported wells while keeping a viable continuation', () => {
    const grid = board(['.B.Y..', '.B.B.B', '.B.B.G', '.R.Y.G', 'GBYR.B', 'GGBY.Y', 'BBYY.Y'])
    const plan = { colorA: PuyoColor.GREEN, colorB: PuyoColor.BLUE, colorC: PuyoColor.GREEN, colorD: PuyoColor.BLUE }
    const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair('GR'), pair('GR'), pair('RB'), plan)
    // Either well can be filled; a proven free-form continuation also counts.
    expect([2, 4]).toContain(advice.bestPlacement!.placement.column)
    const placed = simulateTurn(grid, pair('GR'), advice.bestPlacement!.placement)
    expect(placed.chainCount).toBe(0)
    expect(surfaceShapeCost(placed.stableGrid)).toBeLessThan(surfaceShapeCost(grid))
    expect(PlacementAdvisor.isAdaptiveTailComplete(placed.stableGrid, plan)).toBe(true)
  })
})
