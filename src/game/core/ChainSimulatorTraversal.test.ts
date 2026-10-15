import { describe, expect, it } from 'vitest'
import { findClearPositions, findConnectedGroup, type PuyoGrid } from './ChainSimulator'
import { PuyoColor } from './types'

// Independent composition of the public group finder preserves the historical
// traversal order as well as the set of cleared cells.
const reference = (grid: PuyoGrid) => {
  const visited = new Set<string>(), positions: { x: number; y: number }[] = []
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) {
    const color = grid[y][x]
    if (color === null || visited.has(`${x},${y}`)) continue
    const group = findConnectedGroup(grid, x, y, color)
    group.forEach(p => visited.add(`${p.x},${p.y}`))
    if (group.length >= 4) positions.push(...group)
  }
  return positions
}

describe('rectangular clear traversal', () => {
  it('matches historical ordered groups for deterministic random boards, without mutations', () => {
    let state = 51381291
    const choices = [null, ...Object.values(PuyoColor)]
    for (let sample = 0; sample < 1000; sample++) {
      const width = 1 + sample % 7, height = 1 + sample % 13
      const grid: PuyoGrid = Array.from({ length: height }, () => Array.from({ length: width }, () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        return choices[state % choices.length]
      }))
      const snapshot = JSON.stringify(grid)
      expect(findClearPositions(grid)).toEqual(reference(grid))
      expect(JSON.stringify(grid)).toBe(snapshot)
    }
  })
  it('preserves empty and nonrectangular diagnostic behavior', () => {
    for (const grid of [[], [[]], [[PuyoColor.RED], [], [PuyoColor.RED, PuyoColor.RED]]]) {
      expect(findClearPositions(grid)).toEqual(reference(grid))
    }
  })
})
