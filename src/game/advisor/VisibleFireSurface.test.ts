import { describe, expect, it } from 'vitest'
import { PlacementAdvisor } from './PlacementAdvisor'
import { surfaceShapeCost, futureFireSurfaceCost, inspectBoardSurface } from './BoardSurface'
import { simulateTurn, isSpawnBlocked, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'
import { GTRDetector } from '../gtr/GTRPatterns'

// Known pre-change boards. The high alternatives could reach the SAME clean
// five-chain with NEXT2, so a later hypothetical fire must not hide CURRENT's
// wall/well cost. No hidden queue or game identifier enters the advisor.
const cases = [
  { id: 14, grid: '...........................................GR.YG.GY.YR.YY.GYYGRGGBYYGRRGGGRBBG',
    pairs: 'GB RB YG', fold: 'YG', high: { column: 1, rotation: 0 },
    expected: { column: 3, rotation: 2 }, oldCost: 51, newCost: 16 },
  { id: 50, grid: '...............................R.....R.....Y..GR.RR.RG.BR.YGRYG.YBRRYGGYYYGBBY',
    pairs: 'RB YB RB', fold: 'RY', high: { column: 1, rotation: 0 },
    // The lower-cost route (45) has only four foundation links. Keep a safe
    // five-link foundation (59), still below the old high root (90).
    expected: { column: 4, rotation: 3 }, oldCost: 90, newCost: 59 },
  { id: 54, grid: '.............................................B...R.BR..R.GR.BR.BBBBBRYYYRRGGGB',
    pairs: 'BY RY RB', fold: 'BR', high: { column: 1, rotation: 0 },
    expected: { column: 3, rotation: 3 }, oldCost: 29, newCost: 18 },
]
const palette = [PuyoColor.RED, PuyoColor.BLUE, PuyoColor.YELLOW, PuyoColor.GREEN]

describe('CURRENT surface when a visible future pair fires', () => {
  for (const scenario of cases) it.each([0, 1, 2, 3])(`keeps the same three-pair fire without the tall pile: ${scenario.id}, colors +%i`, shift => {
    const color = (c: string) => palette[('RBYG'.indexOf(c) + shift) % 4]
    let grid: PuyoGrid = scenario.grid.match(/.{6}/g)!.map(row => [...row].map(c => c === '.' ? null : color(c)))
    const pairs: PuyoPair[] = scenario.pairs.split(' ').map(p => ({
      main: { color: color(p[0]), x: 2, y: 1 }, sub: { color: color(p[1]), x: 2, y: 0 }, rotation: 0, falling: true,
    }))
    const plan = { colorA: color(scenario.fold[0]), colorB: color(scenario.fold[1]),
      colorC: color(scenario.fold[0]), colorD: color(scenario.fold[1]) }
    const input = JSON.stringify({ grid, pairs, plan })
    const first = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, pairs[0], pairs[1], pairs[2], plan)
    expect(JSON.stringify({ grid, pairs, plan })).toBe(input)
    expect(first.bestPlacement!.placement).toEqual(scenario.expected)
    const high = first.allPlacements.find(c => c.placement.column === scenario.high.column && c.placement.rotation === scenario.high.rotation)!
    const highGrid = simulateTurn(grid, pairs[0], scenario.high).stableGrid
    const lowGrid = simulateTurn(grid, pairs[0], first.bestPlacement!.placement).stableGrid
    expect(surfaceShapeCost(highGrid)).toBe(scenario.oldCost)
    expect(surfaceShapeCost(lowGrid)).toBe(scenario.newCost)
    expect(inspectBoardSurface(lowGrid).maxWellDepth).toBeLessThan(inspectBoardSurface(highGrid).maxWellDepth)
    // A high root can be pruned if a lower root reaches the same future board.
    // It must never keep its old unpenalized terminal score; the chosen root
    // retains CURRENT's cost, not the geometry of a hypothetical future board.
    expect(high.totalScore).toBeLessThanOrEqual(109000 - futureFireSurfaceCost(highGrid))
    expect(first.bestPlacement!.totalScore).toBe(109000 - futureFireSurfaceCost(lowGrid))
    for (let i = 0; i < 3; i++) {
      const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, pairs[i], pairs[i + 1], pairs[i + 2], plan)
      const result = simulateTurn(grid, pairs[i], advice.bestPlacement!.placement)
      expect(result.valid).toBe(true)
      expect(isSpawnBlocked(result.stableGrid)).toBe(false)
      expect(result.chainCount).toBe(i === 2 ? 5 : 0)
      if (i === 2) {
        if (scenario.id === 50) expect(GTRDetector.detectGTR(grid).chainCount).toBe(5)
        expect(PlacementAdvisor.isAdaptiveTailComplete(grid, plan)).toBe(true)
        expect(advice.bestPlacement).toMatchObject({ isIntendedMainFire: true, hasCollateralClear: false, totalScore: 110000 })
      }
      grid = result.stableGrid
    }
  }, 15000)
})
