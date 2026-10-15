import { PuyoColor, type Position } from '../core/types'
import { applyGravity, cloneGrid, findConnectedGroup, isSpawnBlocked, resolveChains, type PuyoGrid } from '../core/ChainSimulator'
import { GTRDetector } from '../gtr/GTRPatterns'
import { connectedOffset, followsTrigger, type FoundationTrace } from './ConnectedExtension'

export interface HeadScaffold {
  shape: 'horizontal-three' | 'left-high-L' | 'right-high-L'
  color: PuyoColor
  /** Ordered, hypothetical single cells. Not supplied pairs or achieved chains. */
  missing: { position: Position; color: PuyoColor }[]
  trigger: { position: Position; color: PuyoColor }
  chainCount: number
  realLeftovers: number
}
const templates: { shape: HeadScaffold['shape']; cells: Position[]; key: Position }[] = [
  { shape: 'horizontal-three', cells: [{ x: 0, y: 9 }, { x: 1, y: 9 }, { x: 2, y: 9 }], key: { x: 0, y: 8 } },
  { shape: 'left-high-L', cells: [{ x: 0, y: 9 }, { x: 1, y: 9 }, { x: 0, y: 8 }], key: { x: 0, y: 7 } },
  { shape: 'right-high-L', cells: [{ x: 0, y: 9 }, { x: 1, y: 9 }, { x: 1, y: 8 }], key: { x: 0, y: 8 } },
]
const originKey = ({ x, y }: Position) => `${x}:${y}`
const dropRow = (grid: PuyoGrid, x: number) => {
  const top = grid.findIndex(row => row[x] !== null)
  return (top < 0 ? grid.length : top) - 1
}

/** Limited head scaffolds, including a temporarily disconnected key wait.
 * At least two REAL head cells must exist. Every missing cell must be top-loadable,
 * and the eventual trigger must clear all scaffold/key cells, then the original
 * foundation in order. Unknown colors are never passed off as a visible route.
 */
export function inspectHeadScaffold(grid: PuyoGrid, foundation: FoundationTrace): HeadScaffold | null {
  if (grid.length !== 13 || grid.some(row => row.length !== 6) || !GTRDetector.hasBasicPattern(grid) ||
      isSpawnBlocked(grid) || applyGravity(grid).moved || resolveChains(grid).chainCount) return null
  let best: HeadScaffold | null = null
  for (const template of templates) for (const color of Object.values(PuyoColor)) {
    // Both fold colors touch the low head. Neither is an independent new head.
    if (color === grid[10][0] || color === grid[10][1]) continue
    if (template.cells.some(p => grid[p.y][p.x] !== null && grid[p.y][p.x] !== color) ||
        template.cells.filter(p => grid[p.y][p.x] === color).length < 2) continue
    const proposed = cloneGrid(grid)
    const missing: HeadScaffold['missing'] = []
    let valid = true
    for (const cell of [...template.cells.map(position => ({ position, color })),
      { position: template.key, color: grid[10][0]! }]) {
      const { x, y } = cell.position
      if (proposed[y][x] === cell.color) continue
      if (proposed[y][x] !== null || dropRow(proposed, x) !== y) { valid = false; break }
      proposed[y][x] = cell.color
      missing.push(cell)
      if (resolveChains(proposed).chainCount) { valid = false; break }
    }
    if (!valid || isSpawnBlocked(proposed)) continue
    const trigger = { position: { x: 1, y: dropRow(proposed, 1) }, color }
    if (trigger.position.y < 0) continue
    proposed[trigger.position.y][1] = color
    const result = resolveChains(proposed)
    if (connectedOffset(result.clearSteps, foundation) !== 1 ||
        !followsTrigger(proposed, result.clearSteps, new Set([originKey(trigger.position)]))) continue
    const cleared = new Set(result.clearSteps.flatMap(step => step.clearedPuyos.flatMap(p => p.origin ? [originKey(p.origin)] : [])))
    if (![...template.cells, template.key].every(p => cleared.has(originKey(p)))) continue
    const realLeftovers = grid.reduce((sum, row, y) => sum + row.filter((c, x) => c && !cleared.has(`${x}:${y}`)).length, 0)
    const candidate = { shape: template.shape, color, missing, trigger, chainCount: result.chainCount, realLeftovers }
    if (!best || scaffoldValue(candidate) > scaffoldValue(best)) best = candidate
  }
  return best
}

export function scaffoldValue(scaffold: HeadScaffold): number {
  // Same units as extensionValue, but charge every invented cell, not just the
  // final trigger. A shape name has no bonus over a physically connected head.
  return scaffold.chainCount * 100 - scaffold.realLeftovers * 24 - scaffold.missing.length * 40
}

/** Accessible same-color contact that clears the SECOND-stage core prematurely.
 * The ordinary first-stage trigger is not a hazard; independent upper triples
 * are not a hazard either. This is a future reception constraint, not a clear now.
 */
export function coreHeadContactRisk(grid: PuyoGrid): number {
  if (grid.length !== 13 || grid.some(row => row.length !== 6)) return 0
  const a = grid[11][0], color = grid[10][1]
  // Include the six-cell core waiting for its left cap. Otherwise making a
  // dangerous triple first and postponing that last core cell evades the cost.
  if (!a || !color || a === color || grid[11][1] !== a || grid[11][2] !== color ||
      grid[12][0] !== color || grid[12][1] !== color || (grid[10][0] !== null && grid[10][0] !== a)) return 0
  const group = findConnectedGroup(grid, 1, 10)
  if (group.length !== 3 || !group.some(p => p.y < 10)) return 0
  let contacts = 0
  for (let x = 0; x < 3; x++) {
    const y = dropRow(grid, x)
    if (y < 0) continue
    const proposed = cloneGrid(grid); proposed[y][x] = color
    const first = resolveChains(proposed).clearSteps[0]
    if (first?.clearedPuyos.some(p => p.origin?.x === 1 && p.origin.y === 10)) contacts++
  }
  // Covering one contact does not help while the same core triple is exposed
  // elsewhere. Do not reward piling onto column two just to hide its top.
  return Number(contacts > 0)
}

export function describeHeadScaffold(scaffold: HeadScaffold): string {
  const colors: Record<PuyoColor, string> = { red: '赤', green: '緑', blue: '青', yellow: '黄' }
  const shape = scaffold.shape === 'horizontal-three' ? '横3' : 'L字'
  const missing = scaffold.missing.map(c => `${c.position.x + 1}列${13 - c.position.y}段目に${colors[c.color]}`).join(' → ')
  return `発火点の${shape}を仕込もう（${missing || 'キー配置済み'}。接続見込みであり、まだ発火しません）`
}
