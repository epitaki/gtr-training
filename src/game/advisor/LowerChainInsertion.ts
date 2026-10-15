import type { Position, PuyoColor } from '../core/types'
import { isSpawnBlocked, resolveChains, type PuyoGrid } from '../core/ChainSimulator'
import { createMainFireBaseline } from './MainFireAnalysis'

/** Insert one lower-layer cell without changing any existing main-chain step.
 * This proves a construction alternative, not the arrival of its missing colors.
 */
export function insertLowerMainCell(grid: PuyoGrid, at: Position, color: PuyoColor): PuyoGrid | null {
  const h = grid.length
  if (h !== 13 || grid.some(row => row.length !== 6) ||
      !Number.isInteger(at.x) || !Number.isInteger(at.y) ||
      at.x < 2 || at.x >= 6 || at.y < h - 3 || at.y >= h || grid[0][at.x] !== null ||
      grid[h - 4][0] !== null || resolveChains(grid).chainCount !== 0) return null
  const original = createMainFireBaseline(grid)
  if (!original || original.resolution.chainCount !== 5) return null
  const expanded = grid.map(row => [...row])
  for (let y = 0; y < at.y; y++) expanded[y][at.x] = grid[y + 1][at.x]
  expanded[at.y][at.x] = color
  if (isSpawnBlocked(expanded) || resolveChains(expanded).chainCount !== 0) return null
  const main = createMainFireBaseline(expanded)
  if (!main || main.resolution.chainCount !== original.resolution.chainCount) return null
  for (const [index, step] of original.resolution.clearSteps.entries()) {
    const actual = new Set(main.resolution.clearSteps[index].clearedPuyos
      .filter(p => p.origin).map(p => `${p.origin!.x},${p.origin!.y},${p.color}`))
    for (const p of step.clearedPuyos) {
      if (!p.origin) return null
      const { x, y } = p.origin
      const shiftedY = x === at.x && y <= at.y ? y - 1 : y
      if (!actual.has(`${x},${shiftedY},${p.color}`)) return null
    }
  }
  // The extra must join the tail or a later main step, not just act as waste
  // or interfere with the two fold steps. All original cells stayed in step.
  const recovered = main.resolution.clearSteps.slice(2).some(step => step.clearedPuyos
    .some(p => p.origin?.x === at.x && p.origin.y === at.y && p.color === color))
  return recovered ? expanded : null
}
