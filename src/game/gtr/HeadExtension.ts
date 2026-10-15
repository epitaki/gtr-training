import type { PuyoColor, Position } from '../core/types'
import { cloneGrid, resolveChains, type PuyoGrid, type ChainResolution } from '../core/ChainSimulator'

export interface HeadExtension {
  color: PuyoColor
  missing: 1 | 2
  trigger: Position
  additions: Position[]
  baseGrid: PuyoGrid
  resolution: ChainResolution
}

export function describeHeadExtension(head: HeadExtension): string {
  const names: Record<PuyoColor, string> = { red: '赤', blue: '青', green: '緑', yellow: '黄' }
  return `発火点伸ばしの仕込み：${names[head.color]}があと${head.missing}個必要`
}

/** One supported head: C below A on column 1, connected to C on column 2.
 * This describes a setup, NOT a completed chain. Missing Cs are hypothetical;
 * actual pair simulation must supply them before a fire can be credited.
 * Reject other/taller heads until their connection can be proven separately.
 */
export function inspectHeadExtension(grid: PuyoGrid): HeadExtension | null {
  if (grid.length !== 13 || grid.some(row => row.length !== 6)) return null
  const a = grid[10][0], b = grid[12][0], c = grid[9][0]
  if (!a || !b || !c || a === b || c === a ||
      grid[11][0] !== a || grid[11][1] !== a || grid[12][1] !== b ||
      grid[10][1] !== b || grid[11][2] !== b ||
      grid[8][0] !== a || grid[9][1] !== c ||
      (grid[8][1] !== null && grid[8][1] !== c) ||
      grid.slice(0, 8).some(row => row[1] !== null) ||
      grid.slice(0, 6).some(row => row[0] !== null)) return null
  if (resolveChains(grid).chainCount !== 0) return null

  const baseGrid = cloneGrid(grid)
  for (const [x, y] of [[0, 8], [0, 9], [1, 8], [1, 9]]) baseGrid[y][x] = null
  // At most two companions can rest above the falling key. They must not
  // change the original core/tail order when we check the real extension.
  baseGrid[6][0] = null
  baseGrid[7][0] = null
  const baseFire = cloneGrid(baseGrid)
  baseFire[9][0] = a
  const base = resolveChains(baseFire)
  if (base.chainCount < 3) return null

  const trigger = { x: 1, y: 7 }
  const additions = grid[8][1] === null ? [{ x: 1, y: 8 }, trigger] : [trigger]
  const completed = cloneGrid(grid)
  for (const p of additions) completed[p.y][p.x] = c
  const resolution = resolveChains(completed)
  if (resolution.chainCount < base.chainCount + 1) return null
  // The new first step may clear only the head, never consume the tail early.
  if (resolution.clearSteps[0].clearedPuyos.some(p =>
    !p.origin || p.origin.x > 1 || p.origin.y < 7 || p.origin.y > 9 || p.color !== c)) return null
  // Match original puyos at each original stage, shifted by one head clear.
  // The virtual old trigger is replaced by the real A falling from (0,8).
  const key = (p: { origin: Position | null; color: PuyoColor }) =>
    p.origin ? `${p.origin.x},${p.origin.y},${p.color}` : ''
  for (const [index, step] of base.clearSteps.entries()) {
    const actual = new Set(resolution.clearSteps[index + 1]?.clearedPuyos.map(key))
    if (step.clearedPuyos.some(p => !(p.origin?.x === 0 && p.origin.y === 9) && !actual.has(key(p)))) return null
  }
  return { color: c, missing: additions.length as 1 | 2, trigger, additions, baseGrid, resolution }
}
