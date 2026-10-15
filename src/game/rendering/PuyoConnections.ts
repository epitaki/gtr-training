import type { ChainSnapshot } from '../core/ChainTrace'
import type { PuyoGrid } from '../core/ChainSimulator'

export const CONNECTION_DIRECTIONS = [
  { bit: 1, dx: 0, dy: -1 },
  { bit: 2, dx: 1, dy: 0 },
  { bit: 4, dx: 0, dy: 1 },
  { bit: 8, dx: -1, dy: 0 },
] as const

export interface PuyoConnection {
  mask: number
  neighbors: Partial<Record<1 | 2 | 4 | 8, string>>
}

/** A relationship belongs to a pair of IDs, not to a pair of colors. */
export function connections(snapshot: ChainSnapshot, excluded: ReadonlySet<string> = new Set()): Map<string, PuyoConnection> {
  const result = new Map<string, PuyoConnection>()
  for (let y = 0; y < snapshot.ids.length; y++) for (let x = 0; x < snapshot.ids[y].length; x++) {
    const id = snapshot.ids[y][x]
    const color = snapshot.grid[y][x]
    if (id === null || color === null || excluded.has(id)) continue
    const entry: PuyoConnection = { mask: 0, neighbors: {} }
    for (const { bit, dx, dy } of CONNECTION_DIRECTIONS) {
      const neighbor = snapshot.ids[y + dy]?.[x + dx]
      if (neighbor !== null && neighbor !== undefined && !excluded.has(neighbor) && snapshot.grid[y + dy]?.[x + dx] === color) {
        entry.mask |= bit
        entry.neighbors[bit] = neighbor
      }
    }
    result.set(id, entry)
  }
  return result
}

export function newAdjacencyMask(current: PuyoConnection, previous?: PuyoConnection): number {
  let mask = 0
  for (const { bit } of CONNECTION_DIRECTIONS) {
    if (current.neighbors[bit] && current.neighbors[bit] !== previous?.neighbors[bit]) mask |= bit
  }
  return mask
}

export function cellMask(grid: PuyoGrid, x: number, y: number): number {
  const color = grid[y]?.[x]
  if (!color) return 0
  let mask = 0
  for (const { bit, dx, dy } of CONNECTION_DIRECTIONS) if (grid[y + dy]?.[x + dx] === color) mask |= bit
  return mask
}

export function existingBeforePlacement(initial: ChainSnapshot, before: PuyoGrid): Map<string, PuyoConnection> {
  return connections({ grid: initial.grid, ids: initial.ids.map((row, y) => row.map((id, x) => before[y]?.[x] ? id : null)) })
}
