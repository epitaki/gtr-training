import { describe, expect, it } from 'vitest'
import { countRecoveredSkeletonExtras } from './SkeletonRecovery'
import { resolveChains, type ClearStep, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor } from '../core/types'

const colors = Object.values(PuyoColor)
const { RED: R, GREEN: G, BLUE: B, YELLOW: Y } = PuyoColor
const mapping: Record<string, PuyoColor> = { A: R, B: Y, C: B, D: G, E: R }
const heights = [3, 3, 4, 4, 3, 2]
const complete = (): PuyoGrid => [
  ...Array.from({ length: 9 }, () => Array(6).fill(null)),
  ...['..DE..', 'ABCDE.', 'AABCCE', 'BBCDDE'].map(row => [...row].map(c => mapping[c] ?? null)),
]

describe('completed skeleton spare recovery', () => {
  it.each([0, 1, 2, 3])('tracks useful and unused extras through falling (color rotation %i)', shift => {
    const rename = (color: PuyoColor) => colors[(colors.indexOf(color) + shift) % 4]
    const grid = complete().map(row => row.map(c => c === null ? null : rename(c)))
    grid[9][1] = rename(G) // joins the green step after the lower fold disappears
    grid[8][2] = rename(B) // stays outside the main chain
    expect(resolveChains(grid).chainCount).toBe(0)
    grid[9][0] = rename(R)
    const fired = resolveChains(grid)
    expect(fired.chainCount).toBe(5)
    const snapshot = JSON.stringify(fired)
    expect(countRecoveredSkeletonExtras(fired.clearSteps, heights)).toBe(1)
    expect(JSON.stringify(fired)).toBe(snapshot)
  })

  it('does not count a separate simultaneous clear or a later independent chain as recovery', () => {
    const puyo = (x: number, y: number, ox: number, oy: number, color: PuyoColor = R) =>
      ({ position: { x, y }, origin: { x: ox, y: oy }, color })
    const step: ClearStep = { chainIndex: 1, clearedPositions: [], clearedPuyos: [
      puyo(0, 12, 0, 12), puyo(1, 12, 1, 9), // connected skeleton + useful extra
      puyo(3, 12, 3, 8), puyo(4, 12, 4, 8), // disconnected extras of the same color
      puyo(1, 11, 1, 8, B), // adjacent, but a different color
    ] }
    const extraStep: ClearStep = { chainIndex: 6, clearedPositions: [], clearedPuyos: [puyo(0, 12, 2, 8)] }
    expect(countRecoveredSkeletonExtras([step, extraStep], heights)).toBe(1)
  })

  it('does not connect the right edge to the left edge of the next row', () => {
    const step: ClearStep = { chainIndex: 1, clearedPositions: [], clearedPuyos: [
      { position: { x: 5, y: 11 }, origin: { x: 5, y: 11 }, color: R },
      { position: { x: 0, y: 12 }, origin: { x: 1, y: 9 }, color: R },
    ] }
    expect(countRecoveredSkeletonExtras([step], heights)).toBe(0)
  })
})
