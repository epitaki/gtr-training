import { PuyoColor, type PuyoPair } from '../core/types'
import {
  isSpawnBlocked, resolveChains, simulateTurn,
  type Placement, type PuyoGrid, type TurnOutcome, type LandingResult, type ChainResolution,
} from '../core/ChainSimulator'
import { TailPlanner, type TailShape } from './TailPlanner'
import { countRecoveredSkeletonExtras } from './SkeletonRecovery'
import { inspectHeadExtension } from '../gtr/HeadExtension'
import { TAIL_CONSTRUCTION_COST } from './TailPreference'
import { createMainFireBaseline } from './MainFireAnalysis'
import { FIVE_CHAIN_SKELETONS } from './FiveChainSkeletons'
import { LOW_FIVE_CHAIN_SKELETONS } from './LowFiveChainSkeletons'
import { insertLowerMainCell } from './LowerChainInsertion'
import { splitDropCost } from './PlacementEffort'
import { surfaceShapeCost, futureFireSurfaceCost } from './BoardSurface'
import { inspectPairPlacementUse, pairConstructionCost } from './PairPlacementUse'
import { completionWaitCost, inspectCompletionWait } from './CompletionWait'
import { inspectTailCascadeRecovery, tailCascadeCredit } from './TailCascadeRecovery'
import { compareFirePreference, inspectFirePreference, type FirePreference } from './FirePreference'
import { inspectConstructionUse } from './ConstructionUse'
import { GTRDetector } from '../gtr/GTRPatterns'
import { supportsEveryFiringCompanion } from './FoundationPreference'
import { inspectHeadScaffold } from './HeadScaffold'
import { traceFoundation } from './ConnectedExtension'
import { countFrontierSignatures, type FrontierCandidate, type FrontierEvidence } from './FrontierFlexibility'

interface FiveChainTemplate {
  id: string
  columns: PuyoColor[][]
  shape: TailShape
  color: PuyoColor
  tailHeights: number[]
  resolution: ChainResolution
  openingSafe: boolean
  hasLowerInsertion?: boolean
  lowerCell?: { x: number; row: number }
}

export interface PlannedPlacement {
  placement: Placement
  score: number
  shape: TailShape
  color: PuyoColor
  recoveredExtras: number
  firePreference?: FirePreference
  frontier?: FrontierEvidence
}

interface PlanFit {
  score: number
  plans: FiveChainTemplate[]
  best: FiveChainTemplate | null
  recoveredExtras: number
  complete: boolean
  tailComplete: boolean
  hasHead: boolean
  frontier?: FrontierEvidence
}

const COLORS = Object.values(PuyoColor)
const COLOR_INDEX = Object.fromEntries(COLORS.map((color, index) => [color, index])) as Record<PuyoColor, number>
// Top to bottom. A/B are the GTR fold; C/D/E clear in that order afterwards.
// Color reuse is accepted only after checking the complete physical chain.
const BEAM_WIDTH = 32
const CONSTRUCTION_SKELETONS = [...FIVE_CHAIN_SKELETONS, ...LOW_FIVE_CHAIN_SKELETONS]
// Shared with the free-form advisor so a ready five-chain has the same
// terminal priority even when the board no longer fits a teaching skeleton.
export const FIVE_CHAIN_REWARDS = {
  BASE: 100000,
  FIRE: 10000,
  LATER_PAIR_PENALTY: 500,
  COLLATERAL_PENALTY: 100,
} as const
const MAX_EXTRA_CACHE = 10000
const templateCache = new Map<string, FiveChainTemplate[]>()
const extraCache = new Map<string, { valid: boolean; unrecovered: number; tailCascadeCells: number }>()
const lowerInsertionCache = new Map<string, FiveChainTemplate | null>()

const columnsOf = (grid: PuyoGrid): PuyoColor[][] => {
  const columns: PuyoColor[][] = Array.from({ length: 6 }, () => [])
  for (let y = grid.length - 1; y >= 0; y--) for (let x = 0; x < 6; x++) {
    const color = grid[y][x]
    if (color !== null) columns[x].push(color)
  }
  return columns
}

const toGrid = (columns: PuyoColor[][], height = 13): PuyoGrid => {
  const grid: PuyoGrid = Array.from({ length: height }, () => Array(6).fill(null))
  columns.forEach((column, x) => column.forEach((color, row) => {
    grid[height - row - 1][x] = color
  }))
  return grid
}

function getTemplates(colorA: PuyoColor, colorB: PuyoColor): FiveChainTemplate[] {
  const key = `${colorA}:${colorB}`
  const cached = templateCache.get(key)
  if (cached) return cached
  const templates: FiveChainTemplate[] = []
  if (colorA === colorB) return templates
  for (const colorC of COLORS) for (const colorD of COLORS) for (const colorE of COLORS) {
    const mapping: Record<string, PuyoColor> = { A: colorA, B: colorB, C: colorC, D: colorD, E: colorE }
    for (const rows of CONSTRUCTION_SKELETONS) {
      const grid: PuyoGrid = Array.from({ length: 13 - rows.length }, () => Array(6).fill(null))
      grid.push(...rows.map(row => [...row].map(letter => mapping[letter] ?? null)))
      if (resolveChains(grid).chainCount !== 0) continue
      const tail = TailPlanner.getPlans(grid, colorB).find(plan => plan.templateFilled)
      if (!tail) continue
      const fired = grid.map(row => [...row])
      fired[9][0] = colorA
      const resolution = resolveChains(fired)
      if (resolution.chainCount !== 5) continue
      const columns = columnsOf(grid)
      const tailHeights = [3, 3, 2, 0, 0, 0] // all seven fold cells
      for (const cell of [...tail.chainCells, ...tail.supportCells]) {
        tailHeights[cell.x] = Math.max(tailHeights[cell.x], 13 - cell.y)
      }
      templates.push({
        id: columns.map(column => column.map(color => color[0]).join('')).join('/'),
        columns, shape: tail.shape, color: tail.color, tailHeights, resolution,
        openingSafe: FIVE_CHAIN_SKELETONS.includes(rows),
      })
    }
  }
  templateCache.set(key, templates)
  return templates
}

function constructionTemplates(grid: PuyoGrid, fold: { colorA: PuyoColor; colorB: PuyoColor }) {
  const opening = grid.reduce((sum, row) => sum + row.filter(color => color !== null).length, 0) <= 2
  // Preserve the established first two moves. Broader low recipes become
  // options afterwards, not a reason to redirect the opening to the right.
  return getTemplates(fold.colorA, fold.colorB).filter(plan => plan.openingSafe || !opening)
}

// A spare puyo above a finished column can alter later drops. Test the completed
// skeleton WITH those spares, not the idealized empty space above the template.
function evaluateExtras(columns: PuyoColor[][], plan: FiveChainTemplate, allowScaffolds = false): { valid: boolean; unrecovered: number; tailCascadeCells: number } {
  const extras = columns.map((column, x) => column.slice(plan.columns[x].length))
  const key = Number(allowScaffolds) + '|' + plan.id + '|' + extras.map(column => column.map(color => color[0]).join('')).join('/')
  const cached = extraCache.get(key)
  if (cached !== undefined) return cached
  const grid = toGrid(plan.columns.map((column, x) => [...column, ...extras[x]]))
  let valid = resolveChains(grid).chainCount === 0
  const head = inspectHeadExtension(grid)
  if (head) {
    const cleared = new Set(head.resolution.clearSteps.flatMap(step => step.clearedPuyos
      .filter(p => p.origin).map(p => `${p.origin!.x},${p.origin!.y}`)))
    let unrecovered = 0
    extras.forEach((column, x) => column.forEach((_, i) => {
      if (!cleared.has(`${x},${12 - plan.columns[x].length - i}`)) unrecovered++
    }))
    const result = { valid: valid && head.resolution.chainCount >= 6, unrecovered, tailCascadeCells: 0 }
    if (extraCache.size >= MAX_EXTRA_CACHE) extraCache.delete(extraCache.keys().next().value!)
    extraCache.set(key, result)
    return result
  }
  if (grid[9][0] !== null) {
    // Conditional recipe feasibility, NOT an attained chain. The real extras
    // must form a supported head whose later key returns to this exact target.
    const foundation = allowScaffolds && valid ? traceFoundation(toGrid(plan.columns)) : null
    const scaffold = foundation ? inspectHeadScaffold(grid, foundation) : null
    const result = { valid: !!scaffold, unrecovered: scaffold?.realLeftovers ?? extras.flat().length, tailCascadeCells: 0 }
    if (extraCache.size >= MAX_EXTRA_CACHE) extraCache.delete(extraCache.keys().next().value!)
    extraCache.set(key, result)
    return result
  }
  grid[9][0] = plan.columns[0][2]
  const fired = resolveChains(grid)
  valid &&= fired.chainCount >= 5
  // An extra can join a later step after falling. Track its original cell,
  // not its final position or mere proximity to another puyo of the same color.
  const recovered = countRecoveredSkeletonExtras(fired.clearSteps, plan.columns.map(column => column.length))
  const cascade = valid ? inspectTailCascadeRecovery(grid, plan.resolution, fired, plan.columns.map(column => column.length)) : null
  const result = { valid,
    unrecovered: extras.reduce((sum, column) => sum + column.length, 0) - recovered - (cascade?.additionalRecovered ?? 0),
    tailCascadeCells: (cascade?.avalancheOrigins.length ?? 0) + (cascade?.tsurukameOrigins.length ?? 0),
  }
  if (extraCache.size >= MAX_EXTRA_CACHE) extraCache.delete(extraCache.keys().next().value!)
  extraCache.set(key, result)
  return result
}

function lowerInsertion(plan: FiveChainTemplate, x: number, row: number, color: PuyoColor): FiveChainTemplate | null {
  const key = `${plan.id}|${x}:${row}:${color}`
  if (lowerInsertionCache.has(key)) return lowerInsertionCache.get(key)!
  const expanded = insertLowerMainCell(toGrid(plan.columns), { x, y: 12 - row }, color)
  const columns = expanded ? columnsOf(expanded) : null
  const fired = expanded?.map(row => [...row])
  if (fired) fired[9][0] = plan.columns[0][2]
  const variant = columns ? {
    ...plan, columns, hasLowerInsertion: true, lowerCell: { x, row },
    id: columns.map(column => column.map(value => value[0]).join('')).join('/'),
    resolution: resolveChains(fired!),
  } : null
  if (lowerInsertionCache.size >= MAX_EXTRA_CACHE) lowerInsertionCache.delete(lowerInsertionCache.keys().next().value!)
  lowerInsertionCache.set(key, variant)
  return variant
}

function fit(grid: PuyoGrid, plans: FiveChainTemplate[], compareCompletionOrder = false, preferTailRecovery = false, allowScaffolds = false, countFrontier = false): PlanFit {
  const columns = columnsOf(grid)
  const head = inspectHeadExtension(grid)
  if ((columns[0].length > 3 && !head && !allowScaffolds) || isSpawnBlocked(grid)) return { score: -Infinity, plans: [], best: null, recoveredExtras: 0, complete: false, tailComplete: false, hasHead: !!head }
  // Reward the physically connected intermediate goal, not just nineteen
  // matching cells in a distant finished five-chain. Keep this smaller than
  // completing the entire skeleton and far below an actual main fire.
  let tailReady: boolean | undefined
  let currentBaseline: ReturnType<typeof createMainFireBaseline> | undefined
  const getCurrentBaseline = () => {
    if (currentBaseline === undefined) currentBaseline = createMainFireBaseline(grid)
    return currentBaseline
  }
  let lowerParticipants: Set<string> | undefined
  let bestScore = -Infinity
  let bestRecovered = 0
  let bestComplete = false
  let bestTailComplete = false
  let best: FiveChainTemplate | null = null
  const kept: FiveChainTemplate[] = []
  const frontierCandidates: FrontierCandidate[] = []
  let bestFrontier: FrontierCandidate | null = null
  for (const sourcePlan of plans) {
    let plan = sourcePlan
    let matched = 0
    let spare = 0
    let valid = true
    const missing = [0, 0, 0, 0]
    for (let x = 0; x < 6; x++) {
      const column = columns[x]
      let target = plan.columns[x]
      for (let row = 0; row < target.length; row++) {
        if (column[row] && column[row] !== target[row]) {
          // Only an already participating lower cell ABOVE the recognized
          // tail can be inserted. Never shift the fold or the teaching tail.
          let variant: FiveChainTemplate | null = null
          if (!plan.hasLowerInsertion && x >= 2 && row < 3 && row >= plan.tailHeights[x]) {
            lowerParticipants ??= new Set((!head ? getCurrentBaseline()?.resolution.clearSteps.slice(3) ?? [] : [])
              .flatMap(step => step.clearedPuyos.filter(p => p.origin)
                .map(p => `${p.origin!.x},${p.origin!.y}`)))
            if (lowerParticipants.has(`${x},${12 - row}`)) variant = lowerInsertion(plan, x, row, column[row])
          }
          if (!variant) { valid = false; break }
          plan = variant
          target = plan.columns[x]
        }
        if (column[row]) {
          if (plan.lowerCell?.x === x && plan.lowerCell.row === row) spare++
          else matched += x < 2 ? 1.3 : 1
        }
        else missing[COLOR_INDEX[target[row]]]++
      }
      spare += Math.max(0, column.length - target.length)
      if (!valid) break
    }
    if (!valid) continue
    const extraEvaluation = spare > 0 ? evaluateExtras(columns, plan, allowScaffolds) : { valid: true, unrecovered: 0, tailCascadeCells: 0 }
    if (!extraEvaluation.valid) continue
    kept.push(plan)
    const complete = missing.every(value => value === 0)
    // Keep hypothetical spare recovery secondary and restricted to completed
    // skeletons. The inserted cell is different: its present participation
    // was already checked before admitting this construction alternative.
    // A lower insertion already joins the present main chain. Do not count
    // it as another cell of progress towards five: it remains a recovered spare.
    const lowerRecovery = plan.hasLowerInsertion ? 1 : 0
    const recovered = lowerRecovery + (complete ? spare - lowerRecovery - extraEvaluation.unrecovered : 0)
    let score = matched * 100 - spare * 8
      - missing.reduce((sum, value) => sum + value * value * 2, 0)
      - columns.reduce((sum, column) => sum + Math.max(0, column.length - 5) ** 2 * 4, 0)
    // A small use-of-spares preference, below one useful skeleton cell (100).
    // Missing head colors do not count as placed or as a completed fire.
    if (head) score += 20 - head.missing * 2
    else if (allowScaffolds && grid[9][0] !== null) score += 12
    // The prefix/color check above already proves every required fold and
    // tail cell's color. Test the required heights before simulating; partial
    // tails need no expensive board-wide detector or repeated shape search.
    let planTailComplete = false
    if (plan.tailHeights.every((height, x) => columns[x].length >= height)) {
      tailReady ??= ((head ? createMainFireBaseline(head.baseGrid) : getCurrentBaseline())?.resolution.chainCount ?? 0) >= 3 ||
        (allowScaffolds && grid[9][0] !== null && GTRDetector.detectGTR(grid).chainCount >= 3)
      if (tailReady) { score += 100; planTailComplete = true }
    }
    if (complete) score += 1000
    else score -= TAIL_CONSTRUCTION_COST[plan.shape]
    // Credit only real spares of ONE completed target after the root tail
    // is connected. Missing target colors cannot be assumed supplied just
    // to rescue a spare: completion must exist now or within visible pairs.
    // No bonus for a higher column, a shape name, or extra chain count.
    if (preferTailRecovery && complete && !head) score += tailCascadeCredit(extraEvaluation.tailCascadeCells)
    // Compare ONE physically viable target's bottom-up requirements. This
    // idealized supply estimate supplements the legal visible-pair search;
    // it neither predicts hidden pairs nor counts as an actual five-chain.
    // Only after the root fold is complete; keep this below one useful cell
    // while comparing color/order flexibility before a tail is locked in.
    if (compareCompletionOrder && !complete) {
      score -= completionWaitCost(plan.columns.map((column, x) => column.slice(columns[x].length)))
    }
    const frontier: FrontierCandidate | undefined = countFrontier
      ? { shape: plan.shape, matched, spare, complete,
          tailComplete: planTailComplete, columns: plan.columns }
      : undefined
    if (frontier) frontierCandidates.push(frontier)
    if (score > bestScore || (score === bestScore && recovered > bestRecovered)) {
      bestScore = score; best = plan; bestRecovered = recovered; bestComplete = complete; bestTailComplete = planTailComplete
      bestFrontier = frontier ?? null
    }
  }
  const frontier = countFrontier && bestFrontier && !bestComplete && !bestTailComplete
    ? { shape: bestFrontier.shape, matched: bestFrontier.matched, spare: bestFrontier.spare,
        complete: bestFrontier.complete, tailComplete: bestFrontier.tailComplete,
        count: countFrontierSignatures(frontierCandidates, bestFrontier, columns.map(column => column.length)) }
    : undefined
  return { score: bestScore + Math.log(kept.length + 1) * 3, plans: kept, best, recoveredExtras: bestRecovered, complete: bestComplete, tailComplete: bestTailComplete, hasHead: !!head, frontier }
}

const placementKey = (placement: Placement): string => `${placement.column}:${placement.rotation}`
const gridKey = (grid: PuyoGrid): string => grid.map(row => row.map(color => color?.[0] ?? '.').join('')).join('')

export class FiveChainPlanner {
  /** Conditional construction protection, never an attained chain or supplied color.
   * With visible pairs, release an expensive color stall rather than indefinitely
   * rejecting ready alternatives. Omission is a target-feasibility diagnostic.
   */
  static hasNearFoundationTarget(grid: PuyoGrid, fold: { colorA: PuyoColor; colorB: PuyoColor }, pairs?: readonly PuyoPair[]): boolean {
    if (grid.length !== 13 || grid.some(row => row.length !== 6)) return false
    const current = columnsOf(grid)
    const matched = fit(grid, constructionTemplates(grid, fold))
    return matched.plans.some(plan => {
      const missing = plan.columns.reduce((sum, column, x) => sum + Math.max(0, column.length - current[x].length), 0)
      if (missing > 2) return false
      const completed = toGrid(plan.columns.map((column, x) => [...column, ...current[x].slice(column.length)]))
      if (GTRDetector.detectGTR(completed).chainCount < 5) return false
      const baseline = createMainFireBaseline(completed)
      if (!baseline || !supportsEveryFiringCompanion(completed, baseline)) return false
      // The completed target is a conditional bound, not a predicted outcome.
      // Above five hypothetical leftovers, preserve it only while a frontier
      // color is actually visible. The legal planner still has to place it.
      if (missing === 0 || !pairs || baseline.resolution.stableGrid.flat().filter(Boolean).length <= 5) return true
      const visibleColors = pairs.slice(0, 3).flatMap(pair => [pair.main.color, pair.sub.color])
      return plan.columns.some((column, x) => current[x].length < column.length && visibleColors.includes(column[current[x].length]))
    })
  }

  /** Diagnostics use the same physically validated targets as ranking, without reranking. */
  static inspectCompletion(grid: PuyoGrid, fold: { colorA: PuyoColor; colorB: PuyoColor }, allowScaffolds = false) {
    if (grid.length !== 13 || grid.some(row => row.length !== 6)) return null
    const matched = fit(grid, constructionTemplates(grid, fold), false, false, allowScaffolds)
    if (!matched.best) return null
    const columns = columnsOf(grid)
    const queues = matched.best.columns.map((column, x) => column.slice(columns[x].length))
    const head = inspectHeadExtension(grid)
    return { targetId: matched.best.id, shape: matched.best.shape,
      tailComplete: matched.tailComplete, complete: matched.complete, compatibleTargets: matched.plans.length,
      // Diagnostic only. Unknown color supply must not let this classification
      // change construction ranking or turn an existing success into a failure.
      cells: inspectConstructionUse(grid, matched.best,
        head?.missing === 2 ? [] : createMainFireBaseline(grid)?.resolution.clearSteps ?? [], head),
      queues, ...inspectCompletionWait(queues) }
  }

  /** Only CURRENT/NEXT/NEXT2 are accepted; no seed, history or future generator. */
  static rank(
    grid: PuyoGrid,
    pairs: readonly PuyoPair[],
    fold: { colorA: PuyoColor; colorB: PuyoColor },
    classifyGoalFire: (before: PuyoGrid, pair: PuyoPair, outcome: TurnOutcome) => 'clean' | 'collateral' | null,
    preferConstruction?: (before: PuyoGrid, outcome: TurnOutcome, bothUseful: boolean) => boolean,
    options?: { connectLeftNow?: boolean; allowHeadScaffolds?: boolean },
  ): Map<string, PlannedPlacement> | null {
    // Skeleton coordinates and the spare-puyo verification use the game board.
    if (grid.length !== 13 || grid.some(row => row.length !== 6) || pairs.length === 0) return null
    const initial = fit(grid, constructionTemplates(grid, fold), false, false, options?.allowHeadScaffolds)
    if (!initial.plans.length) return null
    // Every retained template already verifies the colors of the same seven
    // fold cells. Do not let spare-use preferences influence the opening or
    // an unfinished fold, even if the pair cannot fill that fold immediately.
    const initialFoldComplete = grid[10][0] !== null && grid[10][1] !== null && grid[11][2] !== null
    interface Node {
      grid: PuyoGrid
      plans: FiveChainTemplate[]
      selectedPlan: FiveChainTemplate
      score: number
      root: PlannedPlacement | null
      fired: boolean
      firePreference?: FirePreference
      preferred: boolean
      recoveredExtras: number
      startsHead?: boolean
      advancesSkeleton?: boolean
      rootEffort: number
      usesLowerInsertion?: boolean
      rootLowerRecovery: boolean
      surfaceCost: number
      futureFireCost: number
      rootLanding?: Pick<LandingResult, 'mainPos' | 'subPos'>
      pairCost: number
    }
    let beam: Node[] = [{ grid, plans: initial.plans, selectedPlan: initial.best!, score: 0, root: null, fired: false, preferred: false, recoveredExtras: 0, rootEffort: 0, rootLowerRecovery: false, surfaceCost: 0, futureFireCost: 0, pairCost: 0 }]
    const roots = new Map<string, PlannedPlacement>()
    for (const [depth, pair] of pairs.slice(0, 3).entries()) {
      const children: Node[] = []
      for (const node of beam) {
        if (node.fired) { children.push(node); continue }
        // Once five is ready, preserve its single-color fire entrance. A new
        // two-puyo head wait is not a reason to postpone the training goal.
        // Existing heads are still continued/fired through the normal checks.
        const preserveReadyEntrance = !options?.allowHeadScaffolds && !inspectHeadExtension(node.grid) &&
          (createMainFireBaseline(node.grid)?.resolution.chainCount ?? 0) >= 5
        const continuations: Node[] = []
        for (let rotation = 0; rotation < 4; rotation++) for (let column = 0; column < 6; column++) {
          const placement = { column, rotation }
          const outcome = simulateTurn(node.grid, pair, placement)
          if (!outcome.valid) continue
          const goalFire = outcome.chainCount > 0 ? classifyGoalFire(node.grid, pair, outcome) : null
          const goodFire = goalFire !== null
          if (outcome.chainCount > 0 && !goodFire) continue
          // When recovering the left connection, the CURRENT must actually
          // fill its bottom cell. Distant progress or a hypothetical future
          // connector is not enough to replace the general recovery scorer.
          if (options?.connectLeftNow && depth === 0 && !goodFire && outcome.stableGrid[12][2] === null) continue
          const startsHead = node.grid[9][0] === null && outcome.stableGrid[9][0] !== null && !goodFire
          if (preserveReadyEntrance && startsHead) continue
          let matched: PlanFit = goodFire
            ? { score: FIVE_CHAIN_REWARDS.FIRE - depth * FIVE_CHAIN_REWARDS.LATER_PAIR_PENALTY
              - (goalFire === 'collateral' ? FIVE_CHAIN_REWARDS.COLLATERAL_PENALTY : 0), plans: node.plans, best: node.selectedPlan, recoveredExtras: 0, complete: true, tailComplete: true, hasHead: false }
            : fit(outcome.stableGrid, node.plans, initialFoldComplete, initial.tailComplete, options?.allowHeadScaffolds,
              depth === 0 && initialFoldComplete && !initial.tailComplete)
          if (!Number.isFinite(matched.score) || !matched.best) continue
          if (options?.connectLeftNow && depth === 0 && !goodFire) {
            // Do not buy a connector by dumping its companion on the tall
            // left stack. Both CURRENT cells must have roles in ONE viable
            // target. Carry only those targets into all later beam levels.
            const usefulPlans = matched.plans.filter(plan => inspectPairPlacementUse(
              outcome.stableGrid, outcome.landing!, plan, matched.hasHead,
            ).unassigned === 0)
            if (!usefulPlans.length) continue
            matched = fit(outcome.stableGrid, usefulPlans, initialFoldComplete, initial.tailComplete, options?.allowHeadScaffolds,
              depth === 0 && initialFoldComplete && !initial.tailComplete)
            if (!matched.best) continue
          }
          const root = node.root ?? {
            placement, score: -10000, shape: matched.best.shape, color: matched.best.color, recoveredExtras: 0,
            frontier: matched.frontier,
          }
          // Terminal fires are absorbing. Earlier fire must beat a delayed fire;
          // do not add past construction scores to the terminal reward.
          const score = matched.score + (depth > 0 && !goodFire ? node.score * 0.01 : 0)
          const rootLanding = node.rootLanding ?? outcome.landing!
          const pairCost = goodFire || !initialFoldComplete || initial.tailComplete ? 0 : pairConstructionCost(
            inspectPairPlacementUse(outcome.stableGrid, rootLanding, matched.best, matched.hasHead), matched.complete || matched.tailComplete,
          )
          const surfaceCost = goodFire ? node.futureFireCost : node.root ? node.surfaceCost : surfaceShapeCost(outcome.stableGrid)
          const rootEffort = node.root ? node.rootEffort : splitDropCost(outcome.landing)
          continuations.push({ grid: outcome.stableGrid, plans: matched.plans, selectedPlan: matched.best, score, root, fired: goodFire,
            firePreference: goodFire ? inspectFirePreference(outcome, depth, goalFire === 'collateral', node.futureFireCost, node.grid) : undefined,
            rootLanding, pairCost,
            // 今の配置の操作性を先読みの微小差で打ち消さない。
            // 未知の将来形を理由に現在の低い接続を避けず、実発火は減点しない。
            // A future fire does not erase CURRENT's shape. Among equally
            // early/clean fires avoid a tall well before comparing tower size.
            // CURRENT's actual fire stays unpenalized. No future board's
            // geometry is charged, and ordinary construction is unchanged.
            surfaceCost,
            futureFireCost: node.root ? node.futureFireCost : goodFire ? 0 : futureFireSurfaceCost(outcome.stableGrid),
            preferred: !goodFire && (preferConstruction?.(node.grid, outcome, matched.plans.some(plan =>
              inspectPairPlacementUse(outcome.stableGrid, outcome.landing!, plan, matched.hasHead).unassigned === 0,
            )) ?? false), recoveredExtras: matched.recoveredExtras,
            startsHead,
            rootEffort,
            usesLowerInsertion: matched.best.hasLowerInsertion,
            rootLowerRecovery: node.root ? node.rootLowerRecovery : !!matched.best.lowerCell &&
              [outcome.landing!.mainPos, outcome.landing!.subPos].some(p =>
                p.x === matched.best!.lowerCell!.x && p.y === 12 - matched.best!.lowerCell!.row),
            advancesSkeleton: !goodFire && matched.plans.some(plan =>
              [outcome.landing!.mainPos, outcome.landing!.subPos].some(p => p.y >= 13 - plan.columns[p.x].length)),
          })
        }
        // Apply the teaching priority before beam pruning, at every visible
        // pair. Only physically viable skeleton continuations can be preferred;
        // if none advances the fold, keep useful tail placements available.
        const construction = !options?.allowHeadScaffolds && continuations.some(candidate => !candidate.startsHead && candidate.advancesSkeleton)
          ? continuations.filter(candidate => !candidate.startsHead) : continuations
        const preferred = construction.filter(candidate => candidate.preferred)
        const kept = preferred.length ? preferred : construction
        children.push(...kept)
        if (depth === 0) for (const candidate of kept) {
          roots.set(placementKey(candidate.root!.placement), candidate.root!)
        }
      }
      if (!children.length) break
      children.sort((a, b) => compareFirePreference(a.firePreference, b.firePreference) ||
        (b.score - b.surfaceCost - b.pairCost) - (a.score - a.surfaceCost - a.pairCost) || b.recoveredExtras - a.recoveredExtras)
      const seen = new Set<string>()
      const unique = children.filter(node => {
        const key = gridKey(node.grid)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      // Preserve one continuation per first move before filling the beam.
      // Otherwise a preferred shape can occupy every slot before NEXT2 is
      // seen, and a better-completing alternative is never evaluated.
      const represented = new Set<string>()
      const reserved = unique.filter(node => {
        const key = placementKey(node.root!.placement)
        if (represented.has(key)) return false
        represented.add(key)
        return true
      }).slice(0, BEAM_WIDTH)
      const selected = new Set(reserved)
      beam = [...reserved, ...unique.filter(node => !selected.has(node)).slice(0, BEAM_WIDTH - reserved.length)]
    }
    if (!beam[0]?.root) return null
    for (const node of beam) {
      // A present lower recovery is worth one spare penalty (8), not a new
      // skeleton cell (100). Charge the existing split cost to new insertion
      // alternatives; do not change unrelated construction or terminal fires.
      const score = node.score - node.surfaceCost - node.pairCost + (node.fired ? 0 :
        (node.rootLowerRecovery ? 8 : 0) - (node.usesLowerInsertion ? node.rootEffort : 0))
      const fireOrder = compareFirePreference(node.firePreference, node.root?.firePreference)
      if (node.root && (fireOrder < 0 || (fireOrder === 0 && (score > node.root.score ||
        (score === node.root.score && node.recoveredExtras > node.root.recoveredExtras))))) {
        node.root.score = score
        node.root.recoveredExtras = node.recoveredExtras
        node.root.firePreference = node.firePreference
        node.root.shape = node.selectedPlan.shape
        node.root.color = node.selectedPlan.color
      }
    }
    return roots
  }
}
