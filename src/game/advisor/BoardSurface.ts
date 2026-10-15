import type { PuyoGrid } from '../core/ChainSimulator'

export const FUTURE_FIRE_SURFACE_RISK = 45

/** 表面の形だけを測る。色や連鎖の成立を証明する指標ではない。 */
export function inspectBoardSurface(grid: PuyoGrid) {
  const heights = (grid[0] ?? []).map((_, x) => {
    const top = grid.findIndex(row => row[x] !== null)
    return top < 0 ? 0 : grid.length - top
  })
  const wellDepths = heights.map((height, x) => x === 0 || x === heights.length - 1 ? 0 :
    Math.max(0, Math.min(heights[x - 1], heights[x + 1]) - height))
  const roughness = heights.slice(1).reduce((sum, height, i) => sum + Math.abs(height - heights[i]), 0)
  return { heights, wellDepths, roughness,
    deepWells: wellDepths.filter(depth => depth >= 3).length,
    maxWellDepth: Math.max(0, ...wellDepths),
  }
}

/** 下4段の骨格と2段までの段差は許容。GTR進捗に代わる目的ではない。 */
export function surfaceShapeCost(grid: PuyoGrid): number {
  const { heights, wellDepths } = inspectBoardSurface(grid)
  if (heights.every(height => height <= 4)) return 0
  const wells = wellDepths.reduce((sum, depth) => sum + Math.max(0, depth - 2) ** 2, 0)
  // 左端の低い発火口を埋めて平らにする誘因は作らない。
  const steps = heights.slice(2).reduce((sum, height, i) =>
    sum + Math.max(0, Math.abs(height - heights[i + 1]) - 2), 0)
  // 谷の片側だけを高くして減点を避けないよう、高い塔も同時に評価する。
  const towers = heights.reduce((sum, height) => sum + Math.max(0, height - 5) ** 2 * 4, 0)
  // 1セルの骨格進捗(100)より小さくし、平坦化のため骨格を壊させない。
  return Math.min(90, wells + steps + towers)
}

/**
 * Only compare CURRENT layouts of equally early/clean verified future fires.
 * Two disjoint bands express an ordering, not a stronger construction reward:
 * no tall well first, then ordinary height/step cost within the same band.
 * The 90 cap stays below a cleanliness difference (100) or a later pair (500).
 */
export function futureFireSurfaceCost(grid: PuyoGrid): number {
  const { heights, wellDepths } = inspectBoardSurface(grid)
  const hasTallWell = wellDepths.some((depth, x) => depth >= 3 &&
    Math.min(heights[x - 1] ?? 0, heights[x + 1] ?? 0) >= 5)
  return (hasTallWell ? FUTURE_FIRE_SURFACE_RISK : 0) + surfaceShapeCost(grid) / 2
}
