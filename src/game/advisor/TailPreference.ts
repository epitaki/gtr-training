import type { TailShape } from './TailPlanner'

// Teaching order for comparable construction: Y, then zabuton, then L.
// Shape preference must not outweigh one useful cell (100).
// Physical tail completion is scored separately; finished plans are not rebuilt.
export const TAIL_CONSTRUCTION_COST: Record<TailShape, number> = {
  Y: 0,
  zabuton: 80,
  L: 90,
}
export const tailPreference = (shape: TailShape): number => TAIL_CONSTRUCTION_COST[shape]
