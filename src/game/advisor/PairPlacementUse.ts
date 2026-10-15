import type { PuyoColor } from '../core/types'
import type { LandingResult, PuyoGrid } from '../core/ChainSimulator'

export type PairCellUse = 'skeleton' | 'lower-connection' | 'head-extension' | 'unassigned'
export interface PairPlacementUse {
  main: PairCellUse
  sub: PairCellUse
  unassigned: number
}

/** One prefix-compatible, physically verified target, not a union of targets. */
export interface ViablePairTarget {
  columns: readonly (readonly PuyoColor[])[]
  lowerCell?: { x: number; row: number }
}

/**
 * Call only on non-clearing continuations from the shared simulator. The
 * caller verifies the full target and head; same-color adjacency alone is
 * deliberately insufficient. Positions still identify the original pair.
 */
export function inspectPairPlacementUse(
  grid: PuyoGrid,
  landing: Pick<LandingResult, 'mainPos' | 'subPos'>,
  target: ViablePairTarget,
  verifiedHead: boolean,
): PairPlacementUse {
  const classify = ({ x, y }: { x: number; y: number }): PairCellUse => {
    const color = grid[y]?.[x]
    if (!color) return 'unassigned'
    const row = grid.length - 1 - y
    if (target.columns[x]?.[row] === color) {
      return target.lowerCell?.x === x && target.lowerCell.row === row ? 'lower-connection' : 'skeleton'
    }
    // Only cells belonging to the verified limited head pattern. Puyos above
    // it are companions, not proven head support merely because it exists.
    if (verifiedHead && x <= 1 && x >= 0 && (y === 8 || y === 9)) return 'head-extension'
    return 'unassigned'
  }
  const main = classify(landing.mainPos)
  const sub = classify(landing.subPos)
  return { main, sub, unassigned: Number(main === 'unassigned') + Number(sub === 'unassigned') }
}

/** A small CURRENT-only construction preference, never a terminal reward. */
export const pairConstructionCost = (use: PairPlacementUse, complete: boolean): number =>
  complete ? 0 : use.unassigned * 8
