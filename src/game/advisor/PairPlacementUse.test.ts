import { describe, expect, it } from 'vitest'
import { PuyoColor } from '../core/types'
import { simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { inspectPairPlacementUse, pairConstructionCost } from './PairPlacementUse'

const { RED: R, BLUE: B, GREEN: G } = PuyoColor
const empty = (): PuyoGrid => Array.from({ length: 13 }, () => Array(6).fill(null))
const pair = { main: { x: 2, y: 1, color: R }, sub: { x: 2, y: 0, color: B }, rotation: 0, falling: true }
const target = { columns: [[R, B], [], [], [], [], []] }

describe('actual pair roles in one viable skeleton', () => {
  it.each([0, 1, 2, 3])('recognizes both placed cells without depending on color names (%i)', shift => {
    const palette = Object.values(PuyoColor)
    const rename = (color: PuyoColor) => palette[(palette.indexOf(color) + shift) % 4]
    const current = { ...pair, main: { ...pair.main, color: rename(R) }, sub: { ...pair.sub, color: rename(B) } }
    const result = simulateTurn(empty(), current, { column: 0, rotation: 0 })
    expect(result.valid).toBe(true)
    const use = inspectPairPlacementUse(result.stableGrid, result.landing!, { columns: target.columns.map(c => c.map(rename)) }, false)
    expect(use).toEqual({ main: 'skeleton', sub: 'skeleton', unassigned: 0 })
    expect(pairConstructionCost(use, false)).toBe(0)
  })

  it('does not combine the two cells from different candidate skeletons', () => {
    const result = simulateTurn(empty(), pair, { column: 3, rotation: 1 })
    const first = { columns: [[], [], [], [R], [], []] }
    const second = { columns: [[], [], [], [], [B], []] }
    expect(inspectPairPlacementUse(result.stableGrid, result.landing!, first, false))
      .toEqual({ main: 'skeleton', sub: 'unassigned', unassigned: 1 })
    expect(inspectPairPlacementUse(result.stableGrid, result.landing!, second, false))
      .toEqual({ main: 'unassigned', sub: 'skeleton', unassigned: 1 })
  })

  it('does not count colors above completed columns or hidden under missing support', () => {
    const result = simulateTurn(empty(), pair, { column: 0, rotation: 0 })
    const use = inspectPairPlacementUse(result.stableGrid, result.landing!, { columns: [[G, R, B], [], [], [], [], []] }, false)
    expect(use.unassigned).toBe(2)
    expect(pairConstructionCost(use, false)).toBe(16)
    expect(pairConstructionCost(use, true)).toBe(0)
    expect(inspectPairPlacementUse(result.stableGrid, result.landing!, { columns: [[R], [], [], [], [], []] }, false).sub)
      .toBe('unassigned')
  })

  it('recognizes a physically admitted lower insertion as recovery, not skeleton progress', () => {
    const result = simulateTurn(empty(), pair, { column: 0, rotation: 0 })
    expect(inspectPairPlacementUse(result.stableGrid, result.landing!, { ...target, lowerCell: { x: 0, row: 1 } }, false))
      .toEqual({ main: 'skeleton', sub: 'lower-connection', unassigned: 0 })
  })

  it('does not extend verified head roles to the companion above the head', () => {
    const grid = empty()
    grid[8][0] = R
    grid[7][0] = B
    const landing = { mainPos: { x: 0, y: 8 }, subPos: { x: 0, y: 7 } }
    expect(inspectPairPlacementUse(grid, landing, target, false).unassigned).toBe(2)
    expect(inspectPairPlacementUse(grid, landing, target, true))
      .toEqual({ main: 'head-extension', sub: 'unassigned', unassigned: 1 })
  })

  it('rechecks original positions when the selected continuation target changes', () => {
    const result = simulateTurn(empty(), pair, { column: 0, rotation: 0 })
    const snapshot = JSON.stringify(result)
    expect(inspectPairPlacementUse(result.stableGrid, result.landing!, target, false).unassigned).toBe(0)
    expect(inspectPairPlacementUse(result.stableGrid, result.landing!, { columns: [[R], [], [], [], [], []] }, false).unassigned).toBe(1)
    expect(JSON.stringify(result)).toBe(snapshot)
  })
})
