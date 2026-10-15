import { describe, expect, it } from 'vitest'
import { inspectConstructionUse } from './ConstructionUse'
import { createMainFireBaseline } from './MainFireAnalysis'
import { simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor } from '../core/types'

const { RED: R, YELLOW: Y, BLUE: B, GREEN: G } = PuyoColor
const mapping: Record<string, PuyoColor> = { A: R, B: Y, C: B, D: G, E: R }
const grid: PuyoGrid = [...Array.from({ length: 9 }, () => Array(6).fill(null)),
  ...['..DE..', 'ABCDE.', 'AABCCE', 'BBCDDE'].map(row => [...row].map(c => mapping[c] ?? null))]
const target = { columns: Array.from({ length: 6 }, (_, x) => grid.map(row => row[x]).reverse().filter(c => c !== null)) }

describe('one-target construction use', () => {
  it('identifies existing extras by their actual main-fire origins, without filling missing colors', () => {
    const pair = { main: { color: G, x: 2, y: 1 }, sub: { color: Y, x: 2, y: 0 }, rotation: 0, falling: true }
    const placed = simulateTurn(grid, pair, { column: 1, rotation: 2 })
    const snapshot = JSON.stringify(placed.stableGrid)
    const baseline = createMainFireBaseline(placed.stableGrid)!
    const cells = inspectConstructionUse(placed.stableGrid, target, baseline.resolution.clearSteps, null)
    expect(cells.filter(cell => cell.role === 'main-recovery')).toHaveLength(2)
    expect(cells.filter(cell => cell.role === 'target')).toHaveLength(19)
    expect(cells.filter(cell => cell.role === 'unassigned')).toHaveLength(0)
    // The same target without a verified current trace cannot claim recovery.
    expect(inspectConstructionUse(placed.stableGrid, target, [], null)
      .filter(cell => cell.role === 'main-recovery')).toHaveLength(0)
    expect(inspectConstructionUse(placed.stableGrid, target, baseline.resolution.clearSteps, { missing: 2 })
      .filter(cell => cell.role === 'main-recovery')).toHaveLength(0)
    expect(JSON.stringify(placed.stableGrid)).toBe(snapshot)
  })

  it('keeps hypothetical two-color head recovery conditional, never currently proven', () => {
    const withHead = grid.map(row => [...row])
    withHead[9][0] = B; withHead[8][0] = R; withHead[9][1] = B
    const cells = inspectConstructionUse(withHead, target, [], { missing: 2 })
    expect(cells.filter(cell => cell.role === 'head-setup')).toHaveLength(3)
    expect(cells.some(cell => cell.evidence === 'current-virtual-fire')).toBe(false)
    expect(cells.filter(cell => cell.role === 'head-setup').every(cell => cell.evidence === 'conditional')).toBe(true)
  })

  it('never unions two incompatible targets', () => {
    const different = { columns: target.columns.map(column => [...column]) }
    different.columns[1][2] = G
    const cells = inspectConstructionUse(grid, different, [], null)
    expect(cells.find(cell => cell.position.x === 1 && cell.position.y === 10)?.role).toBe('unassigned')
  })

})
