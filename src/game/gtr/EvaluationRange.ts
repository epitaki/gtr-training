import type { PuyoGrid } from '../core/ChainSimulator'

/** Foundation scoring only. Coordinates are zero-based on the 13 × 6 field. */
export const isInGTREvaluationRange = (x: number, y: number): boolean =>
  x >= 0 && x < 6 && y <= 12 && y >= (x < 2 ? 10 : 9)

/** Remove outside puyos before any clear/gravity step, without changing play. */
export const createGTREvaluationGrid = (grid: PuyoGrid): PuyoGrid =>
  grid.map((row, y) => row.map((color, x) => isInGTREvaluationRange(x, y) ? color : null))
