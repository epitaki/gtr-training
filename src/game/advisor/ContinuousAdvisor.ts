import type { Field, PuyoPair } from '../core/types'
import { isSpawnBlocked, simulateTurn, type PuyoGrid, type Placement } from '../core/ChainSimulator'
import { GTRDetector } from '../gtr/GTRPatterns'
import { PlacementAdvisor } from './PlacementAdvisor'
import { GamePhase, type GTRTrainingPlan, type PlacementAdvice, type PlacementScore } from './types'
import { inspectBoardSurface, surfaceShapeCost } from './BoardSurface'
import { splitDropCost } from './PlacementEffort'
import { extensionValue, inspectConnectedExtension, traceFoundation, type ConnectedExtension } from './ConnectedExtension'
import { comparePerfectFoundationRoutes, findPerfectFoundationRoutes } from './PerfectFoundationPlanner'
import { coreHeadContactRisk, describeHeadScaffold, inspectHeadScaffold, scaffoldValue, type HeadScaffold } from './HeadScaffold'
import { describeFoldBlockage } from './FoldConstruction'
import { preferRecoverableSpare } from './SpareAllocation'
import { createGTREvaluationGrid } from '../gtr/EvaluationRange'

const key = (p: Placement) => `${p.column}:${p.rotation}`
const boardKey = (grid: PuyoGrid) => grid.map(row => row.map(c => c?.[0] ?? '.').join('')).join('')
const placements = Array.from({ length: 24 }, (_, i) => ({ column: i % 6, rotation: Math.floor(i / 6) }))

function completedRoots(grid: PuyoGrid, pair: PuyoPair): PlacementAdvice {
  const allPlacements: PlacementScore[] = []
  for (const placement of placements) {
    const outcome = simulateTurn(grid, pair, placement)
    if (!outcome.valid || !outcome.landing || outcome.chainCount || isSpawnBlocked(outcome.stableGrid)) continue
    allPlacements.push({ placement, landing: outcome.landing, immediateChainCount: 0, clearedPuyos: 0,
      isIntendedMainFire: false, hasCollateralClear: false, intendedMainChainCount: 0,
      intendedMainClearedPuyos: 0, totalScore: 0, phase: GamePhase.COMPLETION })
  }
  return { allPlacements, bestPlacement: allPlacements[0] ?? null, phase: GamePhase.COMPLETION, phaseMessage: '土台完成' }
}

function constructionAdvice(field: Field, current: PuyoPair, next?: PuyoPair, next2?: PuyoPair, plan?: GTRTrainingPlan): PlacementAdvice {
  // Once committed, keep planning the foundation through the pending key.
  if (field.grid[9][0] !== null) return PlacementAdvisor.getAdvice(field, current, next, next2, plan, { allowHeadScaffolds: true })
  const ordinary = PlacementAdvisor.getAdvice(field, current, next, next2, plan)
  if (!ordinary.bestPlacement || ordinary.bestPlacement.immediateChainCount) return ordinary
  const baseline = simulateTurn(field.grid, current, ordinary.bestPlacement.placement)
  const mask = boardKey(createGTREvaluationGrid(baseline.stableGrid))
  const equivalentHeads = new Set(ordinary.allPlacements.filter(candidate => {
    if (candidate.immediateChainCount) return false
    const result = simulateTurn(field.grid, current, candidate.placement)
    const grid = result.stableGrid, color = grid[9][0]
    // Only redirect spares, never spend foundation progress to start a head.
    // Two real side-by-side cells preserve both lower columns' build access.
    return result.valid && color !== null && color === grid[9][1] &&
      boardKey(createGTREvaluationGrid(grid)) === mask
  }).map(candidate => key(candidate.placement)))
  if (!equivalentHeads.size) return ordinary
  const extended = PlacementAdvisor.getAdvice(field, current, next, next2, plan, { allowHeadScaffolds: true })
  return extended.bestPlacement && equivalentHeads.has(key(extended.bestPlacement.placement)) ? extended : ordinary
}

/** Guided construction is not the historical "fire five as soon as possible" benchmark.
 * Never recommends a clearing move. Manual movement, rotation and firing are unchanged.
 */
export class ContinuousAdvisor {
  static getAdvice(field: Field, current: PuyoPair, next?: PuyoPair, next2?: PuyoPair, plan?: GTRTrainingPlan): PlacementAdvice {
    const plannedFold = plan ? PlacementAdvisor.getFoldPlan(field.grid, plan) : null
    const fold = plannedFold ?? PlacementAdvisor.getFoldPlan(field.grid)
    if (!fold) {
      return { bestPlacement: null, allPlacements: [], phase: GamePhase.FOLD_BUILDING,
        phaseMessage: describeFoldBlockage(field.grid, plan)! }
    }
    const foundation = traceFoundation(field.grid)
    const complete = foundation && GTRDetector.detectGTR(field.grid).hasBasicPattern
    // The fire-seeking planner is unnecessary (and expensive) after completion.
    const original = complete ? completedRoots(field.grid, current) : constructionAdvice(field, current, next, next2, plan)
    const safe = original.allPlacements.filter(candidate => {
      if (candidate.immediateChainCount !== 0) return false
      const grid = simulateTurn(field.grid, current, candidate.placement).stableGrid
      // A non-clearing guide cannot repair a wrong color buried in the fold.
      // Preserve its feasible colors before applying any tail/perfect ranking.
      return !isSpawnBlocked(grid) && !!PlacementAdvisor.getFoldPlan(grid, plannedFold ? plan : undefined)
    })
    if (!safe.length) return { ...original, bestPlacement: null, allPlacements: [],
      phaseMessage: '安全に積み続ける配置がありません。盤面を評価・確認してください。' }
    if (!complete) {
      // Legacy ranking rewards future fires. Do not let an upstairs-only fire
      // route displace a CURRENT non-clearing completion of the actual foundation.
      // Require a physical connection as well: masked scoring alone can hide a
      // blocked entrance or an unrelated simultaneous side-clear.
      const finishing = new Set(safe.filter(candidate => {
        const grid = simulateTurn(field.grid, current, candidate.placement).stableGrid
        const trace = traceFoundation(grid)
        return trace && GTRDetector.hasBasicPattern(grid) &&
          (inspectConnectedExtension(grid, trace) || inspectHeadScaffold(grid, trace))
      }))
      let ranked = finishing.size ? [...safe.filter(c => finishing.has(c)), ...safe.filter(c => !finishing.has(c))] : safe
      const perfect = findPerfectFoundationRoutes(field.grid,
        [current, ...(next ? [next] : []), ...(next && next2 ? [next2] : [])],
        new Set((finishing.size ? [...finishing] : safe).map(c => key(c.placement))))
      const routesByRoot = new Map(perfect.map(route => [key(route.placement), route]))
      if (perfect.length) ranked = [...ranked].sort((a, b) => {
        const aRoute = routesByRoot.get(key(a.placement)), bRoute = routesByRoot.get(key(b.placement))
        return aRoute && bRoute ? comparePerfectFoundationRoutes(aRoute, bRoute) :
          aRoute ? -1 : bRoute ? 1 : 0
      })
      // A committed head is not waste merely because its third cell lies
      // inside the score mask. Among CURRENT completions, compare physical
      // recovery first and then compactness, not preservation of 100 points.
      const headFinishes = field.grid[9][0] !== null ? [...finishing].flatMap(candidate => {
        const grid = simulateTurn(field.grid, current, candidate.placement).stableGrid
        const trace = traceFoundation(grid)!
        const scaffold = inspectHeadScaffold(grid, trace)
        const connection = inspectConnectedExtension(grid, trace)
        if (!scaffold && !connection?.headSteps) return []
        return [{ candidate, scaffold, value: connection ? extensionValue(connection) : scaffoldValue(scaffold!),
          height: Math.max(...inspectBoardSurface(grid).heights), split: splitDropCost(candidate.landing) }]
      }).sort((a, b) => b.value - a.value || a.height - b.height || a.split - b.split) : []
      const headFinish = headFinishes[0]
      if (headFinish) ranked = [headFinish.candidate, ...ranked.filter(c => c !== headFinish.candidate)]
      const spare = !finishing.size && !perfect.length ? preferRecoverableSpare(field.grid, current, ranked) : null
      if (spare) ranked = [spare, ...ranked.filter(candidate => candidate !== spare)]
      const annotated = ranked.map((candidate, index) => {
        const route = perfect.find(item => key(item.placement) === key(candidate.placement))
        if (route) return { ...candidate, tailShape: route.tailShape, tailColor: route.tailColor }
        // A redirect selected for a different physical objective cannot keep
        // the construction planner's label for its discarded path.
        if (index === 0 && candidate !== original.bestPlacement) {
          return { ...candidate, tailShape: undefined, tailColor: undefined }
        }
        return candidate
      })
      return { ...original, bestPlacement: annotated[0], allPlacements: annotated,
        phaseMessage: headFinish?.scaffold ? `GTR土台を完成させ、${describeHeadScaffold(headFinish.scaffold)}` :
          perfect.length ? '土台5連鎖を完成させよう（見えているツモで接続を確認）' :
          spare ? 'GTRの土台を優先し、相方も頭・連鎖尾から回収できる配置にしよう' :
          original.bestPlacement?.immediateChainCount ? '発火せず、GTRの土台を完成させよう' : original.phaseMessage }
    }
    const pairs = [current, ...(next ? [next] : []), ...(next && next2 ? [next2] : [])]
    const cache = new Map<string, { potential: ConnectedExtension | null; scaffold: HeadScaffold | null; valid: boolean }>()
    const inspect = (grid: PuyoGrid) => {
      const id = boardKey(grid)
      let result = cache.get(id)
      if (!result) {
        const potential = inspectConnectedExtension(grid, foundation)
        result = { valid: GTRDetector.detectGTR(grid).chainCount >= 5, potential,
          scaffold: potential ? null : inspectHeadScaffold(grid, foundation) }
        cache.set(id, result)
      }
      return result
    }
    interface Node { grid: PuyoGrid; root: PlacementScore; score: number; potential: ConnectedExtension | null; scaffold: HeadScaffold | null }
    let beam: Node[] = []
    let bestByRoot = new Map<string, Node>()
    for (const [depth, pair] of pairs.entries()) {
      const nodes: Node[] = []
      const parents = depth === 0 ? [{ grid: field.grid, root: null }] : beam
      for (const parent of parents) {
        const choices = depth === 0 ? safe.map(c => c.placement) : placements
        for (const placement of choices) {
          const outcome = simulateTurn(parent.grid, pair, placement)
          if (!outcome.valid || outcome.chainCount || isSpawnBlocked(outcome.stableGrid)) continue
          const evidence = inspect(outcome.stableGrid)
          if (!evidence.valid || (!evidence.potential && !evidence.scaffold)) continue
          const root = parent.root ?? safe.find(c => key(c.placement) === key(placement))!
          const score = (evidence.potential ? extensionValue(evidence.potential) : scaffoldValue(evidence.scaffold!))
            - surfaceShapeCost(outcome.stableGrid) * 2 - splitDropCost(root.landing) - coreHeadContactRisk(outcome.stableGrid) * 30
          nodes.push({ grid: outcome.stableGrid, root, score, potential: evidence.potential, scaffold: evidence.scaffold })
        }
      }
      if (!nodes.length) break
      nodes.sort((a, b) => b.score - a.score)
      const roots = new Map<string, Node>()
      const seen = new Set<string>()
      const unique = nodes.filter(node => {
        const id = `${key(node.root.placement)}|${boardKey(node.grid)}`
        if (seen.has(id)) return false
        seen.add(id)
        if (!roots.has(key(node.root.placement))) roots.set(key(node.root.placement), node)
        return true
      })
      // Preserve root coverage before spending remaining bounded search slots.
      const reserved = [...roots.values()].slice(0, 24)
      const chosen = new Set(reserved)
      beam = [...reserved, ...unique.filter(n => !chosen.has(n)).slice(0, 24 - reserved.length)]
      bestByRoot = roots
    }
    const ranked = [...bestByRoot.values()].sort((a, b) => b.score - a.score)
    if (!ranked.length) return { phase: GamePhase.COMPLETION, phaseMessage: '土台完成：接続を保つ伸ばしが見つかりません。盤面を確認してください。',
      bestPlacement: null, allPlacements: [] }
    const candidates = ranked.map(node => ({ ...node.root, totalScore: node.score, phase: GamePhase.COMPLETION }))
    const chosenGrid = simulateTurn(field.grid, current, candidates[0].placement).stableGrid
    const chosenEvidence = inspect(chosenGrid)
    if (chosenEvidence.scaffold) return { bestPlacement: candidates[0], allPlacements: candidates, phase: GamePhase.COMPLETION,
      phaseMessage: `土台完成：${describeHeadScaffold(chosenEvidence.scaffold)}` }
    const best = ranked[0].potential
    const kind = best?.headSteps || ranked[0].scaffold ? '発火点を伸ばそう' : '連鎖尾と余る色の接続を育てよう'
    return { bestPlacement: candidates[0], allPlacements: candidates, phase: GamePhase.COMPLETION,
      phaseMessage: `土台完成：${kind}（発火せず積み続けます）` }
  }
}
