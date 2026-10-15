import { PuyoColor, type PuyoPair } from '../core/types'
import { isSpawnBlocked, resolveChains, simulateTurn, type Placement, type PuyoGrid } from '../core/ChainSimulator'
import { GTRDetector } from '../gtr/GTRPatterns'
import { isInGTREvaluationRange } from '../gtr/EvaluationRange'
import { FIVE_CHAIN_SKELETONS } from './FiveChainSkeletons'
import { LOW_FIVE_CHAIN_SKELETONS } from './LowFiveChainSkeletons'
import { inspectConnectedExtension, traceFoundation, type ConnectedExtension } from './ConnectedExtension'
import { splitDropCost } from './PlacementEffort'
import { inspectBoardSurface, surfaceShapeCost } from './BoardSurface'
import { PlacementAdvisor } from './PlacementAdvisor'
import { TailPlanner, type TailShape } from './TailPlanner'

const targets = new Map<string, PuyoGrid[]>()
// This extra Y3 origin is only a perfect-foundation search target. It does
// not change the general five-chain planner or the teaching gallery.
const PERFECT_ONLY_SKELETONS: readonly (readonly string[])[] = [
  ['....DE', 'ABC.ED', 'AABCCD', 'BBCEED'],
]
const recipes = [...FIVE_CHAIN_SKELETONS, ...LOW_FIVE_CHAIN_SKELETONS, ...PERFECT_ONLY_SKELETONS]
  .filter(rows => rows.length === 4 && rows.every(row => row.length === 6))
const placements = Array.from({ length: 24 }, (_, i) => ({ column: i % 6, rotation: Math.floor(i / 6) }))
const key = (p: Placement) => `${p.column}:${p.rotation}`
const boardKey = (grid: PuyoGrid) => grid.map(row => row.map(c => c?.[0] ?? '.').join('')).join('')

function perfectTargets(a: PuyoColor, b: PuyoColor): PuyoGrid[] {
  const id = `${a}:${b}`, cached = targets.get(id)
  if (cached) return cached
  const result: PuyoGrid[] = [], seen = new Set<string>()
  for (const c of Object.values(PuyoColor)) for (const d of Object.values(PuyoColor)) for (const e of Object.values(PuyoColor)) {
    const colors: Record<string, PuyoColor> = { A: a, B: b, C: c, D: d, E: e }
    for (const rows of recipes) {
      const grid: PuyoGrid = [...Array.from({ length: 9 }, () => Array(6).fill(null)),
        ...rows.map(row => [...row].map(letter => colors[letter] ?? null))]
      const id = boardKey(grid)
      if (seen.has(id)) continue
      seen.add(id)
      // Shape labels alone are not evidence: validate every color reuse.
      if (resolveChains(grid).chainCount === 0 && GTRDetector.detectGTR(grid).totalScore === 100) result.push(grid)
    }
  }
  targets.set(id, result)
  return result
}

function compatible(grid: PuyoGrid, target: PuyoGrid): boolean {
  return grid.every((row, y) => row.every((color, x) =>
    !color || !isInGTREvaluationRange(x, y) || color === target[y][x]))
}

export interface PerfectFoundationRoute {
  placement: Placement
  path: Placement[]
  connection: ConnectedExtension
  splitCost: number
  surfaceCost: number
  maxHeight: number
  maxRightStep: number
  rightStepSum: number
  tailShape?: TailShape
  tailColor?: PuyoColor
}

export function comparePerfectFoundationRoutes(a: PerfectFoundationRoute, b: PerfectFoundationRoute): number {
  return a.path.length - b.path.length ||
    a.connection.realLeftovers - b.connection.realLeftovers ||
    a.splitCost - b.splitCost ||
    a.surfaceCost - b.surfaceCost ||
    a.maxHeight - b.maxHeight ||
    a.maxRightStep - b.maxRightStep ||
    a.rightStepSum - b.rightStepSum
}

function routeSurface(grid: PuyoGrid) {
  const { heights } = inspectBoardSurface(grid)
  // Columns 3-6 only. The low firing entrance on the left is intentional.
  const rightSteps = heights.slice(3).map((height, i) => Math.abs(height - heights[i + 2]))
  return { surfaceCost: surfaceShapeCost(grid), maxHeight: Math.max(...heights),
    maxRightStep: Math.max(...rightSteps), rightStepSum: rightSteps.reduce((sum, step) => sum + step, 0) }
}

/** A bounded, real-pair construction proof, not a forecast or a scored achievement.
 * Only the current three visible pairs are read. No template colors are supplied.
 */
export function findPerfectFoundationRoutes(grid: PuyoGrid, pairs: readonly PuyoPair[],
  allowedRoots?: ReadonlySet<string>): PerfectFoundationRoute[] {
  if (grid.length !== 13 || grid.some(row => row.length !== 6) || !GTRDetector.hasBasicPattern(grid) ||
      isSpawnBlocked(grid) || resolveChains(grid).chainCount > 0) return []
  const visible = pairs.slice(0, 3)
  const count = grid.reduce((n, row, y) => n + row.filter((c, x) => c && isInGTREvaluationRange(x, y)).length, 0)
  if (!visible.length || count >= 19 || count + visible.length * 2 < 19) return []
  const initial = perfectTargets(grid[10][0]!, grid[10][1]!).filter(target => compatible(grid, target))
  if (!initial.length) return []
  interface Node { grid: PuyoGrid; targets: PuyoGrid[]; path: Placement[]; splitCost: number }
  let nodes: Node[] = [{ grid, targets: initial, path: [], splitCost: 0 }]
  const routes = new Map<string, PerfectFoundationRoute>()
  for (const [depth, pair] of visible.entries()) {
    const children = new Map<string, Node>()
    const seenCost = new Map<string, number>()
    for (const node of nodes) for (const placement of placements) {
      const root = node.path[0] ?? placement
      if ((depth === 0 && allowedRoots && !allowedRoots.has(key(root))) ||
          (routes.get(key(root))?.path.length ?? Infinity) < depth + 1) continue
      const outcome = simulateTurn(node.grid, pair, placement)
      if (!outcome.valid || outcome.chainCount || isSpawnBlocked(outcome.stableGrid)) continue
      const matching = node.targets.filter(target => compatible(outcome.stableGrid, target))
      if (!matching.length) continue
      const path = [...node.path, placement], splitCost = node.splitCost + splitDropCost(outcome.landing!)
      const id = `${key(root)}|${boardKey(outcome.stableGrid)}`
      const previousCost = seenCost.get(id)
      if (previousCost !== undefined && previousCost <= splitCost) continue
      seenCost.set(id, splitCost)
      const evaluation = GTRDetector.detectGTR(outcome.stableGrid)
      if (evaluation.totalScore === 100) {
        const trace = traceFoundation(outcome.stableGrid)!
        const connection = inspectConnectedExtension(outcome.stableGrid, trace)
        // A perfect masked foundation is not worth a known pile of uncollected
        // outside cells. This is a conservative construction guard, NOT the
        // measured actual-fire average (the guide deliberately never fires).
        if (connection && connection.realLeftovers <= 5 && PlacementAdvisor.isAdaptiveTailComplete(outcome.stableGrid)) {
          const tails = TailPlanner.getPlans(outcome.stableGrid, grid[10][1]!)
            .filter(plan => plan.templateFilled)
          const uniqueTails = new Map(tails.map(tail => [`${tail.shape}:${tail.color}`, tail]))
          const tail = uniqueTails.size === 1 ? [...uniqueTails.values()][0] : undefined
          const route: PerfectFoundationRoute = { placement: root, path, connection, splitCost,
            ...routeSurface(outcome.stableGrid), tailShape: tail?.shape, tailColor: tail?.color }
          const old = routes.get(key(root))
          if (!old || comparePerfectFoundationRoutes(route, old) < 0) routes.set(key(root), route)
        }
      }
      // A masked 100 without the physical guards is not a route, and the
      // existing search does not repair that rejected terminal on later pairs.
      if (evaluation.totalScore !== 100 && depth + 1 < visible.length) {
        children.set(id, { grid: outcome.stableGrid, targets: matching, path, splitCost })
      }
    }
    nodes = [...children.values()]
  }
  return [...routes.values()].sort(comparePerfectFoundationRoutes)
}
