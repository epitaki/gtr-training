import { describe, expect, it } from 'vitest'
import { GameFieldManager } from './GameField'
import { simulateTurn } from './ChainSimulator'
import { PuyoPairManager } from './PuyoPair'
import { PuyoColor, type PuyoPair } from './types'

const pairAt = (x: number, y: number, rotation = 0): PuyoPair => PuyoPairManager.rotatePair({
  main: { color: PuyoColor.GREEN, x, y },
  sub: { color: PuyoColor.RED, x, y: y - 1 }, rotation: 0, falling: true,
}, rotation)
const turn = (pair: PuyoPair, direction: number, field: GameFieldManager) =>
  PuyoPairManager.tryRotate(pair, (pair.rotation + direction) % 4, (x, y) => field.isOccupied(x, y))
const cells = (pair: PuyoPair) => [pair.main, pair.sub].map(p => `${p.x},${p.y}`).sort()

describe('PuyoPairManager rotation', () => {
  it.each([1, 3])('swaps vertically in the reported third-column well (direction %s)', direction => {
    const field = new GameFieldManager()
    const colors: Record<string, PuyoColor> = { R: PuyoColor.RED, G: PuyoColor.GREEN, B: PuyoColor.BLUE, Y: PuyoColor.YELLOW }
    // capturedAt=2026-09-21T18:43:12.771Z. Let the captured pair fall into the well.
    const rows = ['.B.Y..', '.B.B.B', '.B.B.G', '.R.Y.G', 'GBYR.B', 'GGBY.Y', 'BBYY.Y']
    rows.forEach((row, y) => [...row].forEach((color, x) => {
      if (colors[color]) field.placePuyo(x, y + 6, colors[color])
    }))
    const before = structuredClone(field.getField())
    const pair = pairAt(2, 9)
    const original = structuredClone(pair)
    expect(PuyoPairManager.canMove(pair, 0, 1, (x, y) => field.isOccupied(x, y))).toBe(false)
    const swapped = turn(pair, direction, field)!
    expect(swapped).toEqual({ ...pair, rotation: 2,
      main: { ...pair.main, y: 8 }, sub: { ...pair.sub, y: 9 } })
    expect(cells(swapped)).toEqual(cells(pair))
    const advisedLanding = simulateTurn(before.grid, pair, { column: 2, rotation: 2 }).landing!
    expect(swapped.main).toMatchObject(advisedLanding.mainPos)
    expect(swapped.sub).toMatchObject(advisedLanding.subPos)
    expect(turn(swapped, direction, field)).toEqual(pair)
    expect(pair).toEqual(original)
    expect(field.getField()).toEqual(before)
  })

  it.each([0, 1, 2, 3].flatMap(rotation => [1, 3].map(direction => ({ rotation, direction }))))(
    'preserves ordinary rotations from $rotation by $direction', ({ rotation, direction }) => {
      const pair = pairAt(2, 5, rotation)
      expect(turn(pair, direction, new GameFieldManager()))
        .toEqual(PuyoPairManager.rotatePair(pair, (rotation + direction) % 4))
    },
  )

  it.each([{ x: 0, direction: 3, nextX: 1 }, { x: 5, direction: 1, nextX: 4 }])(
    'keeps the horizontal wall kick at column $x', ({ x, direction, nextX }) => {
      const rotated = turn(pairAt(x, 5), direction, new GameFieldManager())!
      expect(rotated.rotation).toBe(direction)
      expect(rotated.main).toMatchObject({ x: nextX, y: 5 })
      expect(rotated.sub).toMatchObject({ x, y: 5 })
    },
  )

  it.each([0, 5])('allows an edge wall and an occupied neighbor to enclose column %s', x => {
    const field = new GameFieldManager()
    const neighbor = x === 0 ? 1 : 4
    field.placePuyo(neighbor, 11, PuyoColor.BLUE)
    field.placePuyo(neighbor, 12, PuyoColor.BLUE)
    const pair = pairAt(x, 12)
    const swapped = turn(pair, 1, field)!
    expect(swapped.rotation).toBe(2)
    expect(cells(swapped)).toEqual(cells(pair))
    expect(turn(swapped, 3, field)).toEqual(pair)
  })

  it('uses a normal wall kick when only one side is obstructed', () => {
    const field = new GameFieldManager()
    field.placePuyo(3, 5, PuyoColor.BLUE)
    const result = turn(pairAt(2, 5), 1, field)!
    expect(result.rotation).toBe(1)
    expect(result.main).toMatchObject({ x: 1, y: 5 })
  })

  it('does not invent a swap or upward kick for a horizontal pair blocked by the floor', () => {
    expect(turn(pairAt(2, 12, 1), 1, new GameFieldManager())).toBeNull()
  })

  it('does not swap onto an occupied or out-of-bounds cell', () => {
    const field = new GameFieldManager()
    field.placePuyo(1, 0, PuyoColor.BLUE)
    field.placePuyo(3, 0, PuyoColor.BLUE)
    expect(turn(pairAt(2, 0), 1, field)).toBeNull()
    field.placePuyo(1, 1, PuyoColor.BLUE)
    field.placePuyo(3, 1, PuyoColor.BLUE)
    field.placePuyo(2, 0, PuyoColor.BLUE)
    expect(turn(pairAt(2, 1), 3, field)).toBeNull()
  })
})
