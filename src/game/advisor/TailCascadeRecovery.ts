import type { Position } from '../core/types'
import type { ChainResolution, ClearedPuyo, PuyoGrid } from '../core/ChainSimulator'

export interface TailCascadeRecovery {
  preservesMainChain: boolean
  avalancheOrigins: string[]
  tsurukameOrigins: string[]
  // Extra-only components were not covered by the old same-step recovery.
  additionalRecovered: number
}

const key = ({ x, y }: Position): string => `${x},${y}`
const signature = (p: ClearedPuyo): string => p.origin ? `${key(p.origin)}:${p.color}` : ''

/**
 * Prove recovery through the simulator's actual clear/fall trace. A higher
 * column or an L silhouette is not evidence. The completed target's original
 * stages must survive unchanged; extra components must fall because of a
 * main-connected clear on the immediately preceding step.
 *
 * Grid includes the virtual trigger; all resolutions use default origins.
 * This analyzes a construction target, not an actual fire or hidden supply.
 */
export function inspectTailCascadeRecovery(
  firedGrid: PuyoGrid,
  baseline: ChainResolution,
  actual: ChainResolution,
  columnHeights: readonly number[],
): TailCascadeRecovery {
  const result: TailCascadeRecovery = {
    preservesMainChain: false, avalancheOrigins: [], tsurukameOrigins: [], additionalRecovered: 0,
  }
  if (baseline.chainCount < 5 || actual.chainCount < baseline.chainCount) return result
  for (const [index, step] of baseline.clearSteps.entries()) {
    const actualCells = new Set(actual.clearSteps[index]?.clearedPuyos.map(signature))
    if (step.clearedPuyos.some(p => !p.origin || !actualCells.has(signature(p)))) return result
  }
  result.preservesMainChain = true

  // Track origin -> current position. This is provenance bookkeeping, not a
  // second chain simulator: only the supplied trace decides which cells clear.
  const positions = new Map<string, Position>()
  for (let x = 0; x < (firedGrid[0]?.length ?? 0); x++) {
    let row = firedGrid.length - 1
    for (let y = firedGrid.length - 1; y >= 0; y--) {
      if (firedGrid[y][x] !== null) positions.set(key({ x, y }), { x, y: row-- })
    }
  }
  let fellFromMain = new Set<string>()
  const skeletonOrigins = new Set(baseline.clearSteps.flatMap(step => step.clearedPuyos
    .flatMap(p => p.origin ? [key(p.origin)] : [])))
  for (const step of actual.clearSteps) {
    const byPosition = new Map(step.clearedPuyos.map(p => [key(p.position), p]))
    const visited = new Set<string>()
    const mainClears: Position[] = []
    for (const start of step.clearedPuyos) {
      if (visited.has(key(start.position))) continue
      const group: ClearedPuyo[] = []
      const stack = [start]
      while (stack.length) {
        const p = stack.pop()!
        if (visited.has(key(p.position))) continue
        visited.add(key(p.position)); group.push(p)
        const { x, y } = p.position
        for (const neighbor of [{ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 }]) {
          const adjacent = byPosition.get(key(neighbor))
          if (adjacent?.color === p.color) stack.push(adjacent)
        }
      }
      const containsMain = group.some(p => p.origin && skeletonOrigins.has(key(p.origin)))
      const followsMainFall = group.some(p => p.origin && fellFromMain.has(key(p.origin)))
      if (!containsMain && !followsMainFall) continue
      mainClears.push(...group.map(p => p.position))
      if (step.chainIndex < 3 || !followsMainFall) continue
      const extras = group.filter(p => p.origin && p.origin.x >= 3 && p.origin.x <= 5 &&
        p.origin.y < firedGrid.length - columnHeights[p.origin.x])
      if (!extras.length) continue
      // The basic three-column 1/1/2 (or mirrored 2/1/1) avalanche. Other
      // verified falling connections are treated as tsurukame recovery, not
      // assigned a fixed teaching-tail shape or a shape-based multiplier.
      const counts = [3, 4, 5].map(x => group.filter(p => p.origin?.x === x).length)
      const avalanche = !containsMain && extras.length === group.length &&
        counts[1] === 1 && ((counts[0] === 1 && counts[2] === 2) || (counts[0] === 2 && counts[2] === 1))
      const target = avalanche ? result.avalancheOrigins : result.tsurukameOrigins
      target.push(...extras.map(p => key(p.origin!)))
      if (!containsMain) result.additionalRecovered += extras.length
    }
    for (const p of step.clearedPuyos) if (p.origin) positions.delete(key(p.origin))
    const nextFalls = new Set<string>()
    for (const [origin, position] of positions) {
      const below = (p: Position) => p.x === position.x && p.y > position.y
      const drop = step.clearedPositions.filter(below).length
      if (drop > 0 && mainClears.some(below)) nextFalls.add(origin)
      positions.set(origin, { x: position.x, y: position.y + drop })
    }
    fellFromMain = nextFalls
  }
  return result
}

/** At most two spare penalties, far below one target cell or an actual fire. */
export const tailCascadeCredit = (recovered: number): number => Math.min(2, Math.max(0, recovered)) * 8
