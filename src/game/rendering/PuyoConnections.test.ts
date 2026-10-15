import { describe, expect, it } from 'vitest'
import { PuyoColor } from '../core/types'
import type { ChainSnapshot } from '../core/ChainTrace'
import { cellMask, connections, existingBeforePlacement, newAdjacencyMask } from './PuyoConnections'

const empty = (): ChainSnapshot => ({
  grid: Array.from({ length: 5 }, () => Array(5).fill(null)),
  ids: Array.from({ length: 5 }, () => Array(5).fill(null)),
})
const put = (snapshot: ChainSnapshot, id: string, x: number, y: number, color = PuyoColor.RED) => {
  snapshot.ids[y][x] = id
  snapshot.grid[y][x] = color
}

describe('puyo connections', () => {
  it('covers all 16 four-neighbour masks and ignores diagonals, edges and other colors', () => {
    for (let mask = 0; mask < 16; mask++) {
      const snapshot = empty()
      put(snapshot, 'center', 2, 2)
      for (const [bit, x, y] of [[1, 2, 1], [2, 3, 2], [4, 2, 3], [8, 1, 2]]) {
        put(snapshot, `neighbor-${bit}`, x, y, mask & bit ? PuyoColor.RED : PuyoColor.BLUE)
      }
      put(snapshot, 'diagonal', 3, 3)
      expect(cellMask(snapshot.grid, 2, 2)).toBe(mask)
      expect(connections(snapshot).get('center')?.mask).toBe(mask)
    }
    const edge = empty()
    put(edge, 'edge', 0, 0)
    expect(cellMask(edge.grid, 0, 0)).toBe(0)
  })

  it('detects an ID replacement with the same color and mask, and keeps a pair moving together old', () => {
    const old = empty(), replaced = empty(), moved = empty()
    put(old, 'a', 2, 2); put(old, 'b', 2, 1)
    put(replaced, 'a', 2, 2); put(replaced, 'c', 2, 1)
    put(moved, 'a', 1, 3); put(moved, 'b', 1, 2)
    const previous = connections(old).get('a')!
    expect(newAdjacencyMask(connections(replaced).get('a')!, previous)).toBe(1)
    expect(newAdjacencyMask(connections(moved).get('a')!, previous)).toBe(0)
  })

  it('uses only pre-placement occupants as previous individuals and finds mixed old/new shoulders', () => {
    const snapshot = empty()
    put(snapshot, 'center', 2, 2)
    put(snapshot, 'right', 3, 2)
    const before = snapshot.grid.map(row => [...row])
    put(snapshot, 'up', 2, 1)
    const previous = existingBeforePlacement(snapshot, before)
    const current = connections(snapshot).get('center')!
    expect(current.mask).toBe(3)
    expect(newAdjacencyMask(current, previous.get('center'))).toBe(1)
    expect(newAdjacencyMask(connections(snapshot).get('up')!, previous.get('up'))).toBe(4)
  })

  it('excludes airborne individuals from both ends of an adjacency', () => {
    const snapshot = empty()
    put(snapshot, 'fixed', 2, 2); put(snapshot, 'moving', 3, 2)
    const values = connections(snapshot, new Set(['moving']))
    expect(values.get('fixed')?.mask).toBe(0)
    expect(values.has('moving')).toBe(false)
  })
})
