import { PuyoColor, type Position } from '../core/types'
import { cloneGrid, resolveChains, type ClearStep, type PuyoGrid } from '../core/ChainSimulator'
import { createGTREvaluationGrid } from '../gtr/EvaluationRange'

export interface FoundationTrace { steps: ReadonlySet<string>[]; chainCount: number }
export interface ConnectedExtension {
  chainCount: number
  needed: 1 | 2
  triggerColumn: number
  triggerColor: PuyoColor
  headSteps: number
  realLeftovers: number
}
const originKey = (p: Position) => `${p.x}:${p.y}`

/** The scored foundation is masked BEFORE gravity. Its virtual trigger is not a real cell. */
export function traceFoundation(grid: PuyoGrid, minimumChains = 5): FoundationTrace | null {
  if (grid.length !== 13 || grid.some(row => row.length !== 6)) return null
  const base = createGTREvaluationGrid(grid)
  if (!base[10][0]) return null
  base[9][0] = base[10][0]
  const result = resolveChains(base)
  if (result.chainCount < minimumChains) return null
  return { chainCount: result.chainCount, steps: result.clearSteps.map(step => new Set(
    step.clearedPuyos.flatMap(p => p.origin && !(p.origin.x === 0 && p.origin.y === 9) ? [originKey(p.origin)] : []),
  )) }
}

function clearGroups(step: ClearStep): Set<string>[] {
  const remaining = new Map(step.clearedPuyos.map(p => [originKey(p.position), p]))
  const groups: Set<string>[] = []
  while (remaining.size) {
    const first = remaining.values().next().value!
    const stack = [first], group = new Set<string>()
    remaining.delete(originKey(first.position))
    while (stack.length) {
      const p = stack.pop()!
      if (p.origin) group.add(originKey(p.origin))
      for (const [x, y] of [[p.position.x - 1, p.position.y], [p.position.x + 1, p.position.y],
        [p.position.x, p.position.y - 1], [p.position.x, p.position.y + 1]]) {
        const key = `${x}:${y}`, neighbor = remaining.get(key)
        if (neighbor?.color === p.color) { remaining.delete(key); stack.push(neighbor) }
      }
    }
    groups.push(group)
  }
  return groups
}

/** Each component must descend from the supplied trigger through an actual fall.
 * This admits avalanche/tsurukame side groups caused by the main chain, but not
 * an unrelated simultaneous clear. Positions come from the simulator trace.
 */
export function followsTrigger(grid: PuyoGrid, steps: ClearStep[], triggers: ReadonlySet<string>): boolean {
  const positions = new Map<string, Position>()
  for (let x = 0; x < 6; x++) {
    let row = grid.length - 1
    for (let y = grid.length - 1; y >= 0; y--) {
      if (grid[y][x]) positions.set(`${x}:${y}`, { x, y: row-- })
    }
  }
  let connected = triggers
  for (const step of steps) {
    if (clearGroups(step).some(group => ![...group].some(origin => connected.has(origin)))) return false
    for (const p of step.clearedPuyos) if (p.origin) positions.delete(originKey(p.origin))
    const fallen = new Set<string>()
    for (const [origin, position] of positions) {
      const drop = step.clearedPositions.filter(p => p.x === position.x && p.y > position.y).length
      if (drop) fallen.add(origin)
      positions.set(origin, { x: position.x, y: position.y + drop })
    }
    connected = fallen
  }
  return true
}

/** Actual cells of the old foundation must clear in order after the new head. */
export function connectedOffset(steps: ClearStep[], foundation: FoundationTrace): number | null {
  const groups = steps.map(clearGroups)
  for (let offset = 0; offset <= steps.length - foundation.steps.length; offset++) {
    if (foundation.steps.every((expected, i) => {
      const actual = groups[i + offset]
      return [...expected].every(key => actual.some(group => group.has(key)))
    })) return offset
  }
  return null
}

export function extensionValue(extension: ConnectedExtension): number {
  return extension.chainCount * 100 - extension.realLeftovers * 24 - (extension.needed - 1) * 20
}

/** Construction potential only, NEVER an achieved chain or a supplied pair.
 * Inspect one/two same-color additions at a legal column top, not a fixed fire cell.
 * The first addition of a two-cell setup must not clear prematurely.
 */
export function inspectConnectedExtension(grid: PuyoGrid, foundation: FoundationTrace): ConnectedExtension | null {
  let best: ConnectedExtension | null = null
  const realCount = grid.flat().filter(Boolean).length
  for (let x = 0; x < 6; x++) {
    const top = grid.findIndex(row => row[x] !== null)
    const y = (top < 0 ? grid.length : top) - 1
    if (y < 0) continue
    for (const color of Object.values(PuyoColor)) {
      const proposed = cloneGrid(grid)
      const triggers = new Set<string>()
      for (const needed of [1, 2] as const) {
        const at = y - needed + 1
        if (at < 0) break
        proposed[at][x] = color
        triggers.add(`${x}:${at}`)
        const result = resolveChains(proposed)
        if (!result.chainCount) continue
        const offset = connectedOffset(result.clearSteps, foundation)
        if (offset !== null && followsTrigger(proposed, result.clearSteps, triggers)) {
          const clearedReal = result.clearSteps.reduce((sum, step) => sum + step.clearedPuyos.filter(p =>
            p.origin && grid[p.origin.y][p.origin.x] !== null).length, 0)
          const candidate: ConnectedExtension = { chainCount: result.chainCount, needed,
            triggerColumn: x, triggerColor: color, headSteps: offset, realLeftovers: realCount - clearedReal }
          if (!best || extensionValue(candidate) > extensionValue(best) ||
              extensionValue(candidate) === extensionValue(best) && candidate.needed < best.needed) best = candidate
        }
        // An earlier clear cannot be crossed to invent a two-puyo construction.
        break
      }
    }
  }
  return best
}
