import { PuyoColor, type PuyoPair } from '../game/core/types'
import { simulateTurn, type Placement, type PuyoGrid } from '../game/core/ChainSimulator'

// Public format reference: https://www.puyop.com/s/ (simUrl).
// Read data only; never evaluate downloaded simulator JavaScript.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ[]'
const SOURCE_COLORS = ['red', 'green', 'blue', 'yellow', 'purple'] as const
type SourceColor = typeof SOURCE_COLORS[number]
export interface HumanMove {
  main: SourceColor
  sub: SourceColor
  placement: Placement | null
}

/** Strict subset: empty initial field, two-puyo pairs, optional unplaced NEXT. */
export function decodeHumanReplay(record: string): HumanMove[] {
  if (!/^_[0-9a-zA-Z\[\]]+$/.test(record) || (record.length - 1) % 2 !== 0) {
    throw new Error('Expected an empty-field puyop pair replay')
  }
  const moves: HumanMove[] = []
  let unplaced = false
  for (let i = 1; i < record.length; i += 2) {
    const value = ALPHABET.indexOf(record[i]) | (ALPHABET.indexOf(record[i + 1]) << 6)
    const colors = value & 127
    const axis = value >> 9
    const rotation = (value >> 7) & 3
    if (axis === 7 || colors >= 25) throw new Error('Garbage / non-pair record is unsupported')
    if (axis === 0 && rotation !== 0) throw new Error('Invalid unplaced pair')
    if ((axis === 1 && rotation === 3) || (axis === 6 && rotation === 1)) {
      throw new Error('Placement crosses field wall')
    }
    if (axis === 0) unplaced = true
    else if (unplaced) throw new Error('Placement after unplaced NEXT')
    moves.push({ main: SOURCE_COLORS[Math.floor(colors / 5)], sub: SOURCE_COLORS[colors % 5],
      placement: axis ? { column: axis - 1, rotation } : null })
  }
  if (!moves.some(move => move.placement)) throw new Error('Colors-only queue is not a human replay')
  return moves
}

/** Color renaming has no game effect and does not inspect future placements. */
export function normalizeHumanPairs(moves: readonly HumanMove[]): PuyoPair[] {
  const mapping = new Map<SourceColor, PuyoColor>()
  const colors = [PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW]
  const color = (source: SourceColor): PuyoColor => {
    if (!mapping.has(source)) {
      if (mapping.size === colors.length) throw new Error('Five-color record is unsupported')
      mapping.set(source, colors[mapping.size])
    }
    return mapping.get(source)!
  }
  return moves.map(move => ({
    main: { color: color(move.main), x: 2, y: 1 },
    sub: { color: color(move.sub), x: 2, y: 0 }, rotation: 0, falling: true,
  }))
}

export const humanGridKey = (grid: PuyoGrid): string =>
  grid.map(row => row.map(color => color?.[0] ?? '.').join('')).join('')

/** Compare resulting placed boards, including equivalent rotations of doubles. */
export function sameHumanPlacement(grid: PuyoGrid, pair: PuyoPair, a: Placement, b: Placement): boolean {
  const left = simulateTurn(grid, pair, a)
  const right = simulateTurn(grid, pair, b)
  return left.valid && right.valid && humanGridKey(left.placedGrid) === humanGridKey(right.placedGrid)
}
