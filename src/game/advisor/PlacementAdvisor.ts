// GTR最適配置推薦システム
// フィールド状態 + 現在のぷよペアから最適な配置位置を推薦する

import { PuyoColor, GameField, PuyoPair, type Position } from '../core/types'
import { GTRDetector } from '../gtr/GTRPatterns'
import { ADVISOR_WEIGHTS, ADVISOR_SCORING } from './PlacementAdvisorConfig'
import { TailPlanner, type TailPlan, type TailShape } from './TailPlanner'
import { tailPreference } from './TailPreference'
import { FIVE_CHAIN_REWARDS, FiveChainPlanner } from './FiveChainPlanner'
import { reorderTiedFrontierSlots, type FrontierEvidence } from './FrontierFlexibility'
import { splitDropCost } from './PlacementEffort'
import { compareFirePreference, inspectFirePreference, type FirePreference } from './FirePreference'
import { surfaceShapeCost, FUTURE_FIRE_SURFACE_RISK } from './BoardSurface'
import { findVisibleMainFires } from './VisibleMainFireSearch'
import { foundationPreparationBonus, supportsEveryFiringCompanion } from './FoundationPreference'
import {
  findLowestEmpty,
  isSpawnBlocked,
  resolveChains,
  simulateTurn,
  type ChainResolution,
  type LandingResult,
  type TurnOutcome,
} from '../core/ChainSimulator'

import { createMainFireBaseline, analyzeCandidateFire, type MainFireBaseline, type CandidateFireAnalysis } from './MainFireAnalysis'
import { inspectHeadExtension, describeHeadExtension } from '../gtr/HeadExtension'
import { getFoldTargets } from './FoldConstruction'
import { analyzeOpening } from './OpeningAnalysis'
import { GamePhase, type PlacementScore, type PlacementAdvice, type FoldPlan, type YJointPlan, type ChainPotential, type GTRTrainingPlan } from './types'

// Stable public entry point for the advisor and its shared types.
export { GamePhase } from './types'
export type { PlacementScore, PlacementAdvice, FoldPlan, YJointPlan, ChainPotential, GTRTrainingPlan } from './types'

export type { LandingResult } from '../core/ChainSimulator'

export class PlacementAdvisor {
  /** Infer the still-viable GTR fold colors and the colors needed to finish it. */
  static createTrainingPlan(pair1: PuyoPair, pair2: PuyoPair): GTRTrainingPlan {
    return analyzeOpening(pair1, pair2).trainingPlan
  }

  static getFoldPlan(
    grid: (PuyoColor | null)[][],
    trainingPlan?: GTRTrainingPlan,
  ): FoldPlan | null {
    const h = grid.length
    let best: { plan: FoldPlan; score: number } | null = null

    const colorAs = trainingPlan ? [trainingPlan.colorA] : this.ALL_COLORS
    const colorBs = trainingPlan ? [trainingPlan.colorB] : this.ALL_COLORS
    for (const colorA of colorAs) {
      for (const colorB of colorBs) {
        if (colorA === colorB) continue
        const targets = getFoldTargets(h, { colorA, colorB })
        if (targets.some(target => grid[target.y]?.[target.x] !== null && grid[target.y]?.[target.x] !== target.color)) continue

        const missing = targets.filter(target => grid[target.y]?.[target.x] === null)
        const score = targets.filter(target => grid[target.y]?.[target.x] === target.color)
          .reduce((total, target) => total + target.priority, 0)
        if (!best || score > best.score) {
          best = { plan: { colorA, colorB, missingColors: missing.map(target => target.color) }, score }
        }
      }
    }
    return best?.plan ?? null
  }

  /** Infer a physically supported Y-joint that connects after the GTR cap color clears. */
  static getYJointPlan(
    grid: (PuyoColor | null)[][],
    trainingPlan?: GTRTrainingPlan,
  ): YJointPlan | null {
    const fold = this.getFoldPlan(grid, trainingPlan)
    if (!fold) return null

    const h = grid.length
    let best: YJointPlan | null = null

    // (2,最下段)は折り返しを組む横置きの相方が先に入ることがある。
    // その場合は固定色を要求して完成不能にせず、実際の支持ぷよをCとして
    // 後続のY字連鎖尾を組み替える。
    const settledColorC = grid[h - 1]?.[2]
    const colorCs = settledColorC
      ? [settledColorC]
      : trainingPlan ? [trainingPlan.colorC] : this.ALL_COLORS
    for (const colorC of colorCs) {
      // C must survive the second chain. Reusing A is valid, but reusing B is not.
      if (colorC === fold.colorB) continue
      const colorDs = trainingPlan ? [trainingPlan.colorD] : this.ALL_COLORS
      for (const colorD of colorDs) {
        if (colorD === colorC) continue
        const targets = this.getYJointTargets(h, colorC, colorD)
        if (targets.some(target => {
          const cell = grid[target.y]?.[target.x]
          return cell !== null && cell !== target.color
        })) continue
        if (!TailPlanner.canFillChainCells(
          grid, targets.filter(target => target.color === colorC), colorC,
        )) continue

        const matchedCells = targets.filter(
          target => grid[target.y]?.[target.x] === target.color,
        ).length
        const candidate: YJointPlan = {
          colorC,
          colorD,
          missingColors: targets
            .filter(target => grid[target.y]?.[target.x] === null)
            .map(target => target.color),
          matchedCells,
          totalCells: targets.length,
        }
        if (!best || candidate.matchedCells > best.matchedCells) best = candidate
      }
    }

    return best
  }

  static isGuidedTargetComplete(
    grid: (PuyoColor | null)[][],
    trainingPlan?: GTRTrainingPlan,
  ): boolean {
    const yPlan = this.getYJointPlan(grid, trainingPlan)
    return GTRDetector.hasBasicPattern(grid) && GTRDetector.getFullBoardChainCount(grid) >= 3 &&
      yPlan?.missingColors.length === 0
  }

  static getCompletedTailShape(
    grid: (PuyoColor | null)[][],
    trainingPlan?: GTRTrainingPlan,
  ): TailShape | null {
    // A head setup does not undo a physically connected tail. Check that tail
    // on the original base, independently from the new head's missing colors.
    const baseGrid = inspectHeadExtension(grid)?.baseGrid ?? grid
    if (!GTRDetector.hasBasicPattern(baseGrid) || GTRDetector.getFullBoardChainCount(baseGrid) < 3) return null
    // Several complete shapes can overlap in the same color. More support
    // cells are not more progress when both are already complete; retain the
    // teaching order instead of relabeling a surviving Y as a zabuton.
    return this.getTailPlans(grid, trainingPlan).filter(plan => plan.templateFilled)
      .sort((a, b) => tailPreference(a.shape) - tailPreference(b.shape))[0]?.shape ?? null
  }

  static isAdaptiveTailComplete(
    grid: (PuyoColor | null)[][],
    trainingPlan?: GTRTrainingPlan,
  ): boolean {
    return this.getCompletedTailShape(grid, trainingPlan) !== null
  }

  static getTailPlans(
    grid: (PuyoColor | null)[][],
    trainingPlan?: GTRTrainingPlan,
  ): TailPlan[] {
    const foldColor = this.getFoldPlan(grid, trainingPlan)?.colorB
      ?? trainingPlan?.colorB
    return TailPlanner.getPlans(grid, foldColor)
  }

  // メインAPI: フィールドとぷよペアからアドバイスを生成
  static getAdvice(
    field: GameField,
    currentPair: PuyoPair,
    nextPair?: PuyoPair,
    nextNextPair?: PuyoPair,
    trainingPlan?: GTRTrainingPlan,
    options?: { allowHeadScaffolds?: boolean },
  ): PlacementAdvice {
    const grid = field.grid
    const mainColor = currentPair.main.color
    const subColor = currentPair.sub.color
    const { phase, mainFireBaseline } = this.analyzePhase(grid)
    if (isSpawnBlocked(grid)) {
      return { bestPlacement: null, allPlacements: [], phase, phaseMessage: this.getPhaseMessage(phase) }
    }
    // Teaching-shape recognition is independent of a verified, ready main fire.
    // An unrecognized tail must not hide a playable five-chain or redefine the
    // separate tail-completion metric. Each actual pair is still checked below.
    const readyFiveChain = (mainFireBaseline?.resolution.chainCount ?? 0) >= 5
    // In a tall position with no left connector, compare viable skeletons
    // only when CURRENT can actually resume that connection. If none fits,
    // retain free-form recovery instead of indefinitely postponing connection.
    // Fresh openings keep the ordinary visible-pair construction search.
    const needsLeftConnection = grid[grid.length - 1]?.[2] == null &&
      grid.slice(0, -4).some(row => row.some(color => color !== null))
    const planned = trainingPlan ? FiveChainPlanner.rank(
      grid,
      [currentPair, ...(nextPair ? [nextPair] : []), ...(nextPair && nextNextPair ? [nextNextPair] : [])],
      trainingPlan,
      (before, pair, outcome) => {
        const baseline = this.analyzePhase(before).mainFireBaseline
        // Keep the teaching goal while constructing a future position. Only
        // an already playable current fire bypasses shape recognition below;
        // looking ahead to an unrecognized fire must not redirect construction.
        if (!baseline || baseline.resolution.chainCount < 5 ||
            !this.isAdaptiveTailComplete(before, trainingPlan) || isSpawnBlocked(outcome.stableGrid)) return null
        const fire = analyzeCandidateFire(pair, outcome, baseline)
        return fire.isIntendedMainFire ? (fire.hasCollateralClear ? 'collateral' : 'clean') : null
      },
      (before, outcome, bothUseful) => {
        // A fold cell plus a useful tail cell is progress with both halves,
        // too. Both roles must belong to ONE viable target, not two recipes.
        // Finishing the fold also takes priority over repeatedly postponing
        // its final color merely because its companion is not a target cell.
        let occupied = 0
        for (const row of before) for (const color of row) {
          if (color !== null) occupied++
        }
        if (outcome.chainCount > 0 || isSpawnBlocked(outcome.stableGrid)) return false
        const previousFold = this.getFoldPlan(before, trainingPlan)
        if (!previousFold || previousFold.missingColors.length === 0) return false
        const nextFold = this.getFoldPlan(outcome.stableGrid, trainingPlan)
        if (!nextFold) return false
        const progress = previousFold.missingColors.length - nextFold.missingColors.length
        return progress > 0 && (occupied <= 2 || progress === 2 || bothUseful || nextFold.missingColors.length === 0)
      },
      { connectLeftNow: needsLeftConnection, allowHeadScaffolds: options?.allowHeadScaffolds },
    ) : null

    const candidates: PlacementScore[] = []
    const plannedFrontiers = new Map<string, FrontierEvidence>()
    const fires = new Map<string, FirePreference>()
    const bound = Math.min(2, ...[...(planned?.values() ?? [])].flatMap(p => p.firePreference ? [p.firePreference.depth] : []))
    const readyMoves = new Map<string, number>()
    const readySurfaces = new Map<string, number>()
    const readyBoards = new Map<string, number | null>()
    // Do not abandon a viable foundation missing at most two cells merely
    // for a hypothetical upstairs fire, unless a costly color stall has no
    // visible progress. This is conditional construction, never a verified
    // fire, and actual visible fires still win below.
    let protectNearFoundation: boolean | undefined
    const visibleFires = trainingPlan && bound > 0 && this.isAdaptiveTailComplete(grid, trainingPlan)
      ? findVisibleMainFires(grid,
        [currentPair, ...(nextPair ? [nextPair] : []), ...(nextPair && nextNextPair ? [nextNextPair] : [])],
        (before, pair, outcome) => {
          const baseline = this.analyzePhase(before).mainFireBaseline
          if (!baseline || baseline.resolution.chainCount < 5 || !this.isAdaptiveTailComplete(before, trainingPlan)) return null
          const fire = analyzeCandidateFire(pair, outcome, baseline)
          return fire.isIntendedMainFire ? (fire.hasCollateralClear ? 'collateral' : 'clean') : null
        }, bound, (board, root, surface, depth) => {
          const boardKey = board.map(row => row.map(c => c?.[0] ?? '.').join('')).join('')
          let baseScore = readyBoards.get(boardKey)
          if (baseScore === undefined) {
            const baseline = this.isAdaptiveTailComplete(board, trainingPlan) ? this.analyzePhase(board).mainFireBaseline : null
            protectNearFoundation ??= !!planned?.size && FiveChainPlanner.hasNearFoundationTarget(grid, trainingPlan,
              [currentPair, ...(nextPair ? [nextPair] : []), ...(nextPair && nextNextPair ? [nextNextPair] : [])])
            // All these boards already have a physically verified main fire.
            // Distinguish a low foundation from five obtained only upstairs;
            // the actual-fire ordering and CURRENT safety bands stay first.
            baseScore = baseline && (!protectNearFoundation || GTRDetector.detectGTR(board).chainCount >= 5) ? 5000 - baseline.resolution.stableGrid.flat().filter(Boolean).length * 100
              + (supportsEveryFiringCompanion(board, baseline) ? foundationPreparationBonus(board) : 0) : null
            readyBoards.set(boardKey, baseScore)
          }
          if (baseScore === null) return
          const score = baseScore - depth * 250 - surface * 2
          const key = `${root.column}:${root.rotation}`
          if (score > (readyMoves.get(key) ?? -Infinity)) {
            readyMoves.set(key, score)
            readySurfaces.set(key, surface)
          }
        }) : new Map<string, FirePreference>()
    const prematureClears = new Set<string>()
    let safeConstruction = false

    for (const rotation of [0, 1, 2, 3]) {
      const [minCol, maxCol] = this.getColumnRange(rotation)
      for (let col = minCol; col <= maxCol; col++) {
        const outcome = simulateTurn(grid, currentPair, { column: col, rotation })
        if (!outcome.valid || !outcome.landing) continue

        const landing = outcome.landing
        const gridAfter = outcome.placedGrid
        const fireAnalysis = analyzeCandidateFire(
          currentPair, outcome, mainFireBaseline,
        )
        const plannedPlacement = planned?.get(`${col}:${rotation}`)
        let usesPlannedScore = !!plannedPlacement

        const foldProgressScore = this.scoreFoldProgress(
          gridAfter, grid, landing, mainColor, subColor, trainingPlan,
        )
        const tailEvaluation = this.scoreChainTail(
          gridAfter, grid, landing, mainColor, subColor, trainingPlan,
        )
        const connectivityScore = this.scoreConnectivity(
          gridAfter, landing, mainColor, subColor, fireAnalysis,
        )
        const heightPenalty = this.scoreHeightPenalty(landing)
        const chainSimScore = !planned && phase !== GamePhase.FOLD_BUILDING
          ? this.scoreChainSimulation(gridAfter, outcome, fireAnalysis) : 0

        const weights = ADVISOR_WEIGHTS[phase]
        let totalScore =
          foldProgressScore * weights.foldProgress +
          tailEvaluation.score * weights.chainTail +
          connectivityScore * weights.connectivity +
          heightPenalty * weights.heightPenalty +
          chainSimScore * weights.chainSim - splitDropCost(landing) - surfaceShapeCost(outcome.stableGrid)

        // ネクスト先読み: nextPairの最善スコアを加算
        if (!planned && nextPair && ADVISOR_SCORING.LOOKAHEAD.ENABLED && !isSpawnBlocked(outcome.stableGrid)) {
          const lookaheadScore = this.evaluateLookahead(
            outcome.stableGrid,
            nextPair,
            nextNextPair,
            trainingPlan,
          )
          totalScore += lookaheadScore * ADVISOR_SCORING.LOOKAHEAD.DISCOUNT
        }
        if (planned) totalScore = plannedPlacement
          ? FIVE_CHAIN_REWARDS.BASE + plannedPlacement.score : -FIVE_CHAIN_REWARDS.BASE + totalScore
        // The general scorer used to prefer extra construction over an already
        // verified five-chain on noncanonical boards. Apply the same absorbing
        // terminal priority as the skeleton search, with physical fire checks.
        if (readyFiveChain && fireAnalysis.isIntendedMainFire && !isSpawnBlocked(outcome.stableGrid)) {
          usesPlannedScore = false
          totalScore = FIVE_CHAIN_REWARDS.BASE + FIVE_CHAIN_REWARDS.FIRE -
            (fireAnalysis.hasCollateralClear ? FIVE_CHAIN_REWARDS.COLLATERAL_PENALTY : 0)
          fires.set(`${col}:${rotation}`, inspectFirePreference(outcome, 0, fireAnalysis.hasCollateralClear, 0, grid))
        } else if (plannedPlacement?.firePreference && !isSpawnBlocked(outcome.stableGrid)) {
          fires.set(`${col}:${rotation}`, plannedPlacement.firePreference)
        }
        const visibleFire = visibleFires.get(`${col}:${rotation}`)
        if (visibleFire && compareFirePreference(visibleFire, fires.get(`${col}:${rotation}`)) < 0) {
          usesPlannedScore = false
          fires.set(`${col}:${rotation}`, visibleFire)
          totalScore = FIVE_CHAIN_REWARDS.BASE + FIVE_CHAIN_REWARDS.FIRE -
            visibleFire.depth * FIVE_CHAIN_REWARDS.LATER_PAIR_PENALTY -
            (visibleFire.collateral ? FIVE_CHAIN_REWARDS.COLLATERAL_PENALTY : 0) - visibleFire.surfaceCost
        }
        const readyScore = readyMoves.get(`${col}:${rotation}`)
        if (!fires.has(`${col}:${rotation}`) && readyScore !== undefined) {
          usesPlannedScore = false
          totalScore = FIVE_CHAIN_REWARDS.BASE + readyScore
        }
        if (isSpawnBlocked(outcome.stableGrid)) {
          usesPlannedScore = false
          totalScore += ADVISOR_SCORING.HEIGHT.GAME_OVER_PENALTY
        }
        // Future fires can retain the planner's numeric score; their verified
        // fire path still takes precedence over construction breadth.
        if (usesPlannedScore && !fires.has(`${col}:${rotation}`) && plannedPlacement?.frontier) {
          plannedFrontiers.set(`${col}:${rotation}`, plannedPlacement.frontier)
        }

        if (outcome.chainCount === 0 && !isSpawnBlocked(outcome.stableGrid) &&
            (!trainingPlan || this.getFoldPlan(outcome.stableGrid, trainingPlan))) safeConstruction = true
        if (outcome.chainCount > 0 && (!fireAnalysis.isIntendedMainFire ||
            (fireAnalysis.baseline?.resolution.chainCount ?? 0) < 5)) prematureClears.add(`${col}:${rotation}`)
        candidates.push({
          placement: { column: col, rotation },
          landing,
          immediateChainCount: outcome.chainCount,
          clearedPuyos: outcome.clearedPuyos,
          isIntendedMainFire: fireAnalysis.isIntendedMainFire,
          hasCollateralClear: fireAnalysis.hasCollateralClear,
          intendedMainChainCount: fireAnalysis.isIntendedMainFire
            ? fireAnalysis.baseline!.resolution.chainCount
            : 0,
          intendedMainClearedPuyos: fireAnalysis.isIntendedMainFire
            ? fireAnalysis.baseline!.resolution.clearedPuyos
            : 0,
          totalScore,
          phase,
          tailShape: plannedPlacement?.shape ?? tailEvaluation.shape,
          tailColor: plannedPlacement?.color ?? tailEvaluation.color,
        })
      }
    }

    const compareOriginal = (a: PlacementScore, b: PlacementScore): number => {
      // Recipe failure is not permission to erase an unfinished foundation.
      // Keep all candidates for diagnostics, but prefer a safe construction
      // when one exists. A verified five-chain fire is never demoted here.
      if (safeConstruction) {
        const premature = Number(prematureClears.has(`${a.placement.column}:${a.placement.rotation}`)) -
          Number(prematureClears.has(`${b.placement.column}:${b.placement.rotation}`))
        if (premature !== 0) return premature
      }
      const fireOrder = compareFirePreference(
        fires.get(`${a.placement.column}:${a.placement.rotation}`),
        fires.get(`${b.placement.column}:${b.placement.rotation}`),
      )
      if (fireOrder !== 0) return fireOrder
      const aSurface = readySurfaces.get(`${a.placement.column}:${a.placement.rotation}`)
      const bSurface = readySurfaces.get(`${b.placement.column}:${b.placement.rotation}`)
      // A hypothetical firing color must not buy recovery by growing a tall
      // well. Compare complete preparations with the same surface-risk bands
      // as verified future fires; actual fires have already won above.
      if (!fires.has(`${a.placement.column}:${a.placement.rotation}`) && (aSurface !== undefined || bSurface !== undefined)) {
        if (aSurface === undefined) return 1
        if (bSurface === undefined) return -1
        const aRisk = aSurface >= FUTURE_FIRE_SURFACE_RISK
        const bRisk = bSurface >= FUTURE_FIRE_SURFACE_RISK
        const safety = Number(aRisk) - Number(bRisk) || (aRisk ? aSurface - bSurface : 0)
        if (safety !== 0) return safety
      }
      const difference = b.totalScore - a.totalScore
      if (difference !== 0 || a.isIntendedMainFire || b.isIntendedMainFire) return difference
      const recovery = (candidate: PlacementScore) =>
        planned?.get(`${candidate.placement.column}:${candidate.placement.rotation}`)?.recoveredExtras ?? 0
      return recovery(b) - recovery(a)
    }
    candidates.sort(compareOriginal)
    reorderTiedFrontierSlots(candidates, compareOriginal, candidate =>
      plannedFrontiers.get(`${candidate.placement.column}:${candidate.placement.rotation}`))

    const best = candidates[0] ?? null
    const suggestedHead = best && best.immediateChainCount === 0
      ? inspectHeadExtension(simulateTurn(grid, currentPair, best.placement).stableGrid) : null
    return {
      bestPlacement: best,
      allPlacements: candidates,
      phase,
      phaseMessage: suggestedHead ? describeHeadExtension(suggestedHead) : this.getPhaseMessage(phase),
    }
  }

  // ネクスト先読み: nextPairの全配置を軽量スコアリングし最善スコアを返す
  private static evaluateLookahead(
    gridAfterCurrent: (PuyoColor | null)[][],
    nextPair: PuyoPair,
    nextNextPair?: PuyoPair,
    trainingPlan?: GTRTrainingPlan,
  ): number {
    if (isSpawnBlocked(gridAfterCurrent)) return ADVISOR_SCORING.HEIGHT.GAME_OVER_PENALTY
    const nextMainColor = nextPair.main.color
    const nextSubColor = nextPair.sub.color
    const {
      phase: currentPhase,
      mainFireBaseline,
    } = this.analyzePhase(gridAfterCurrent)
    const candidates: { score: number; grid: (PuyoColor | null)[][] }[] = []

    for (const rotation of [0, 1, 2, 3]) {
      const [minCol, maxCol] = this.getColumnRange(rotation)
      for (let col = minCol; col <= maxCol; col++) {
        const outcome = simulateTurn(
          gridAfterCurrent, nextPair, { column: col, rotation },
        )
        if (!outcome.valid || !outcome.landing) continue

        const nextLanding = outcome.landing
        const gridAfterNext = outcome.placedGrid
        const fireAnalysis = analyzeCandidateFire(
          nextPair, outcome, mainFireBaseline,
        )

        // 先読みでは全色プローブを省略し、この手で実際に起きる連鎖だけを加点する。
        const foldScore = this.scoreFoldProgress(
          gridAfterNext, gridAfterCurrent, nextLanding, nextMainColor, nextSubColor, trainingPlan,
        )
        const tailEvaluation = this.scoreChainTail(
          gridAfterNext, gridAfterCurrent, nextLanding, nextMainColor, nextSubColor, trainingPlan,
        )
        const connScore = this.scoreConnectivity(
          gridAfterNext, nextLanding, nextMainColor, nextSubColor,
          fireAnalysis,
        )
        const htScore = this.scoreHeightPenalty(nextLanding)
        const immediateChainScore = fireAnalysis.isIntendedMainFire && fireAnalysis.baseline
          ? this.scoreImmediateChain(fireAnalysis.baseline.resolution)
          : 0

        const weights = ADVISOR_WEIGHTS[currentPhase]
        let nextScore =
          foldScore * weights.foldProgress +
          tailEvaluation.score * weights.chainTail +
          connScore * weights.connectivity +
          htScore * weights.heightPenalty +
          immediateChainScore * weights.chainSim - splitDropCost(nextLanding)
        if (isSpawnBlocked(outcome.stableGrid)) nextScore += ADVISOR_SCORING.HEIGHT.GAME_OVER_PENALTY

        candidates.push({ score: nextScore, grid: outcome.stableGrid })
      }
    }

    candidates.sort((a, b) => b.score - a.score)
    if (!nextNextPair) return candidates[0]?.score ?? 0

    let bestScore = -Infinity
    for (const candidate of candidates.slice(0, ADVISOR_SCORING.LOOKAHEAD.BEAM_WIDTH)) {
      if (isSpawnBlocked(candidate.grid)) {
        bestScore = Math.max(bestScore, candidate.score)
        continue
      }
      const nextNextScore = this.evaluateLookahead(
        candidate.grid,
        nextNextPair,
        undefined,
        trainingPlan,
      )
      bestScore = Math.max(
        bestScore,
        candidate.score + nextNextScore * ADVISOR_SCORING.LOOKAHEAD.SECOND_DISCOUNT,
      )
    }
    return isFinite(bestScore) ? bestScore : 0
  }

  // --- フェーズ検出 ---

  private static analyzePhase(grid: (PuyoColor | null)[][]): {
    phase: GamePhase
    mainFireBaseline: MainFireBaseline | null
  } {
    if (!GTRDetector.hasBasicPattern(grid)) {
      return { phase: GamePhase.FOLD_BUILDING, mainFireBaseline: null }
    }

    // 完成判定は標準GTRの発火点から実際に3連鎖することを要求する。
    // 任意色の仮想トリガー探索は配置の比較にだけ使い、完成条件には使わない。
    if (GTRDetector.getFullBoardChainCount(grid) < 3 && !inspectHeadExtension(grid)) {
      return { phase: GamePhase.CHAIN_TAIL, mainFireBaseline: null }
    }

    const mainFireBaseline = createMainFireBaseline(grid)
    return mainFireBaseline
      ? { phase: GamePhase.COMPLETION, mainFireBaseline }
      : { phase: GamePhase.CHAIN_TAIL, mainFireBaseline: null }
  }

  // --- 候補列挙ヘルパー ---

  private static getColumnRange(rotation: number): [number, number] {
    switch (rotation) {
      case 0: return [0, 5]  // 縦: sub上
      case 1: return [0, 4]  // 横右: sub右
      case 2: return [0, 5]  // 縦: sub下
      case 3: return [1, 5]  // 横左: sub左
      default: return [0, 5]
    }
  }

  // --- スコアラー: 折り返し進捗（テンプレートマッチング方式） ---

  private static readonly ALL_COLORS: PuyoColor[] = [
    PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW
  ]

  private static scoreFoldProgress(
    gridAfter: (PuyoColor | null)[][],
    gridBefore: (PuyoColor | null)[][],
    landing: LandingResult,
    mainColor: PuyoColor,
    subColor: PuyoColor,
    trainingPlan?: GTRTrainingPlan,
  ): number {
    // 全色組み合わせ(A,B)を試し、最もスコアの高いものを採用
    let bestScore = -Infinity

    const colorAs = trainingPlan ? [trainingPlan.colorA] : this.ALL_COLORS
    const colorBs = trainingPlan ? [trainingPlan.colorB] : this.ALL_COLORS
    for (const a of colorAs) {
      for (const b of colorBs) {
        if (a === b) continue
        const score = this.evaluateTemplate(gridAfter, gridBefore, a, b, landing, mainColor, subColor)
        if (score > bestScore) bestScore = score
      }
    }

    // エリア外ペナルティを加算
    const areaScore = this.scoreFoldAreaPenalty(landing, gridAfter, gridBefore)

    // 全テンプレート割り当てが矛盾する場合（折り返しが壊れた状態）
    // -Infinityのままだと全配置が-Infinityになり推薦がランダム化する
    // → エリアペナルティのみで判定し、連鎖尾へ誘導する
    if (!isFinite(bestScore)) {
      return areaScore
    }

    return bestScore + areaScore
  }

  // テンプレート一致度評価: 指定した(colorA, colorB)割り当てでのスコア
  private static evaluateTemplate(
    gridAfter: (PuyoColor | null)[][],
    gridBefore: (PuyoColor | null)[][],
    colorA: PuyoColor,
    colorB: PuyoColor,
    landing: LandingResult,
    mainColor: PuyoColor,
    subColor: PuyoColor,
  ): number {
    const S = ADVISOR_SCORING.FOLD
    const h = gridAfter.length

    // GTRテンプレート: 7つのターゲット位置（優先度付き）
    // Row h-1: [B][B]      → 優先度1
    // Row h-2: [A][A][B]   → 優先度2
    // Row h-3: [A][B]      → 優先度3
    const targets: { x: number; y: number; expectedColor: PuyoColor; priority: number }[] = [
      { x: 0, y: h - 1, expectedColor: colorB, priority: 1 },
      { x: 1, y: h - 1, expectedColor: colorB, priority: 1 },
      { x: 0, y: h - 2, expectedColor: colorA, priority: 2 },
      { x: 1, y: h - 2, expectedColor: colorA, priority: 2 },
      { x: 2, y: h - 2, expectedColor: colorB, priority: 2 },
      { x: 0, y: h - 3, expectedColor: colorA, priority: 3 },
      { x: 1, y: h - 3, expectedColor: colorB, priority: 3 },
    ]

    // まず既存ぷよとの矛盾チェック
    // gridBefore上でターゲット位置に色があり、(A,B)割り当てと矛盾する場合は -Infinity
    for (const t of targets) {
      const existingColor = gridBefore[t.y]?.[t.x]
      if (existingColor !== null && existingColor !== undefined) {
        if (existingColor !== t.expectedColor) {
          return -Infinity
        }
      }
    }

    // 優先度ごとの充足状況を計算（gridAfter基準）
    const priorityFilled: Record<number, { total: number; filled: number }> = {
      1: { total: 0, filled: 0 },
      2: { total: 0, filled: 0 },
      3: { total: 0, filled: 0 },
    }

    for (const t of targets) {
      priorityFilled[t.priority].total++
      const cellColor = gridAfter[t.y]?.[t.x]
      if (cellColor === t.expectedColor) {
        priorityFilled[t.priority].filled++
      }
    }

    // 今回配置した2つのぷよを特定
    const placedPositions = [
      { pos: landing.mainPos, color: mainColor },
      { pos: landing.subPos, color: subColor },
    ]

    let score = 0

    for (const puyo of placedPositions) {
      const target = targets.find(t => t.x === puyo.pos.x && t.y === puyo.pos.y)
      if (!target) continue

      // gridBeforeの時点で既にその位置が埋まっていたら、今回の配置とは無関係
      const beforeColor = gridBefore[target.y]?.[target.x]
      if (beforeColor !== null && beforeColor !== undefined) {
        continue
      }

      // 今回の配置で正しい色を置いた
      if (puyo.color === target.expectedColor) {
        const matchBonus = target.priority === 1
          ? S.PRIORITY_1_MATCH
          : target.priority === 2
            ? S.PRIORITY_2_MATCH
            : S.PRIORITY_3_MATCH

        // 前提条件チェック（積み順考慮）
        let multiplier = 1.0
        if (target.priority === 2) {
          // 優先度1がまだ全部埋まっていなければボーナス半減
          // gridBefore時点での優先度1充足をチェック
          const p1Filled = targets
            .filter(t => t.priority === 1)
            .every(t => gridBefore[t.y]?.[t.x] === t.expectedColor)
          if (!p1Filled) multiplier = S.PREREQUISITE_PENALTY
        } else if (target.priority === 3) {
          // P3の前提: P1が完了していること（重力でP2位置を経由するため実質P2も充填済み）
          // evaluateTemplateの矛盾チェック(-Infinity)が色の正しさを保証するため
          // P2色チェックは不要（過剰に厳しく、P3完成率を下げていた）
          const p1Filled = targets
            .filter(t => t.priority === 1)
            .every(t => gridBefore[t.y]?.[t.x] === t.expectedColor)
          if (!p1Filled) multiplier = S.PREREQUISITE_PENALTY
        }

        score += matchBonus * multiplier
      } else {
        // 今回の配置で間違った色を置いた（ブロッキング）
        score += S.WRONG_COLOR_PENALTY
      }
    }

    return score
  }

  // GTRテンプレートターゲット座標（色に依存しない）
  private static getTemplatePositions(height: number): Set<string> {
    return new Set([
      `0,${height - 1}`, `1,${height - 1}`,                    // P1: 最下段
      `0,${height - 2}`, `1,${height - 2}`, `2,${height - 2}`, // P2: 中段
      `0,${height - 3}`, `1,${height - 3}`,                    // P3: 上段
    ])
  }

  // 折り返しエリアペナルティ
  private static scoreFoldAreaPenalty(
    landing: LandingResult,
    gridAfter: (PuyoColor | null)[][],
    gridBefore: (PuyoColor | null)[][]
  ): number {
    const S = ADVISOR_SCORING.FOLD
    const height = gridAfter.length
    const templatePos = this.getTemplatePositions(height)
    let penalty = 0

    for (const pos of [landing.mainPos, landing.subPos]) {
      const key = `${pos.x},${pos.y}`

      // col0-2でh-4以上（高すぎる）
      if (pos.x <= 2 && pos.y < height - 3) {
        if (pos.x === 0 && pos.y === height - 4) {
          penalty += S.TRIGGER_BLOCK_PENALTY
        }
        // P3テンプレート直上(h-4)のコンパニオンは軽減ペナルティ
        else if (pos.y === height - 4 && templatePos.has(`${pos.x},${height - 3}`)) {
          penalty += S.P3_COMPANION_TOO_HIGH
        } else {
          penalty += S.TOO_HIGH_ON_FOLD_SIDE
        }
      }
      // 折り返しエリア内だがテンプレート外（(2,12),(2,10)等）
      else if (pos.x <= 2 && pos.y >= height - 3 && !templatePos.has(key)) {
        // (2,h-1)は(2,h-2)テンプレートへの踏み台
        // P1完了後 かつ (2,11)がまだ空なら充填を促進
        // P1未完了時はP1構築を優先するため通常ペナルティ
        const p1Complete =
          gridAfter[height - 1]?.[0] !== null &&
          gridAfter[height - 1]?.[1] !== null
        if (pos.x === 2 && pos.y === height - 1 && p1Complete && gridBefore[height - 2]?.[2] === null) {
          penalty += S.STEPPING_STONE_BONUS
        }
        // (2,h-3)は連鎖尾接続点: P2(2,h-2)完了後はペナルティなし
        // GTR研究により3列目(col2)は折り返しと連鎖尾の接続エリア
        else if (pos.x === 2 && pos.y === height - 3 && gridBefore[height - 2]?.[2] !== null) {
          penalty += S.CHAIN_TAIL_CONNECTION
        } else {
          penalty += S.NON_TARGET_FOLD_PENALTY
        }
      }
      // 折り返しエリアの外
      else if (pos.x > 2 || pos.y < height - 3) {
        penalty += S.OUTSIDE_FOLD_PENALTY
      }
    }

    return penalty
  }

  // --- スコアラー: 連鎖尾（パターン構築ガイド） ---

  private static scoreChainTail(
    gridAfter: (PuyoColor | null)[][],
    gridBefore: (PuyoColor | null)[][],
    landing: LandingResult,
    mainColor: PuyoColor,
    subColor: PuyoColor,
    trainingPlan?: GTRTrainingPlan,
  ): { score: number; shape?: TailShape; color?: PuyoColor } {
    const S = ADVISOR_SCORING.CHAIN_TAIL
    const h = gridAfter.length
    let score = 0

    const positions = [
      { pos: landing.mainPos, color: mainColor },
      { pos: landing.subPos, color: subColor },
    ]

    const foldPlan = this.getFoldPlan(gridBefore, trainingPlan)
    const progress = foldPlan
      ? TailPlanner.evaluatePlacement(
          gridBefore, gridAfter, landing, foldPlan.colorB,
        )
      : null
    let adaptivePatternScore = 0
    if (progress?.plan && (progress.newChainCells > 0 || progress.newSupportCells > 0)) {
      adaptivePatternScore += progress.newChainCells * S.PATTERN_CHAIN_MATCH
      adaptivePatternScore += progress.newSupportCells * S.PATTERN_SUPPORT_FILL
      adaptivePatternScore += Math.min(progress.previousMatchedCells, 3) * S.PATTERN_PROGRESS_PER_CELL
      if (
        progress.filledTemplate &&
        GTRDetector.hasBasicPattern(gridAfter) &&
        GTRDetector.getFullBoardChainCount(gridAfter) >= 3
      ) adaptivePatternScore += S.PATTERN_ACTUAL_CHAIN_BONUS
    } else if (progress?.blocksEstablishedPlan) {
      adaptivePatternScore += S.PATTERN_BLOCKED
    }

    const guidedY = this.scoreGuidedYPlacement(
      gridAfter, gridBefore, landing, mainColor, subColor, trainingPlan,
    )
    if (guidedY.blocksStartedPlan) {
      adaptivePatternScore += S.GUIDED_Y_STARTED_CONFLICT
    }
    const usesAdaptivePlan = adaptivePatternScore > guidedY.score
    score += Math.max(adaptivePatternScore, guidedY.score)

    // An absent fixed-Y plan is not a valid zero-cost escape from losing every
    // developed adaptive plan. A physically verified main-chain improvement is
    // still allowed even when it does not fit one of the named templates.
    if (
      progress?.blocksEstablishedPlan && !progress.plan && guidedY.color === undefined &&
      TailPlanner.getPlans(gridBefore, foldPlan?.colorB).some(plan => plan.matchedChainCells >= 2)
    ) {
      const beforeFire = createMainFireBaseline(gridBefore)?.resolution
      const afterFire = createMainFireBaseline(gridAfter)?.resolution
      const improvesMainChain = beforeFire && afterFire && afterFire.chainCount >= 3 &&
        afterFire.chainCount >= beforeFire.chainCount && afterFire.clearedPuyos > beforeFire.clearedPuyos
      if (!improvesMainChain) score += S.PATTERN_BLOCKED
    }

    for (const { pos, color } of positions) {
      // 折り返しとの接続点を含む3〜6列目では、列番号ではなく色の接続を評価する。
      if (pos.x >= 2 && pos.x <= 5) {
        // 横方向同色隣接ボーナス
        for (const dx of [-1, 1]) {
          const nx = pos.x + dx
          if (nx >= 2 && nx <= 5 && gridAfter[pos.y]?.[nx] === color) {
            score += S.HORIZONTAL_ADJACENCY_BONUS
          }
        }

        // 同色カラムボーナス: 同じ列に既に同色ぷよがあれば縦1色カラム形成（Y字・L字促進）
        const colBelow = pos.y + 1
        const colAbove = pos.y - 1
        if ((colBelow < h && gridAfter[colBelow]?.[pos.x] === color) ||
            (colAbove >= 0 && gridAfter[colAbove]?.[pos.x] === color)) {
          score += S.SAME_COLOR_COLUMN_BONUS
        }
      }

      // 高すぎる位置へのペナルティ
      if (pos.y < h - 4) {
        score += S.TOO_HIGH_PENALTY
      }
    }

    // レイヤー構造ボーナス（接続・連鎖尾領域で2色以上の層がある）
    for (let col = 2; col <= 5; col++) {
      const layers = this.countColorLayers(gridAfter, col)
      const colHeight = this.getColumnHeight(gridAfter, col)
      if (layers >= 2 && colHeight >= 2) {
        score += S.LAYER_BONUS
      }
    }

    // Display an actually remaining plan, even when this hand only preserves
    // it (zero progress). Missing/invalid fixed Y is not a default shape label.
    const displayAdaptive = (usesAdaptivePlan || guidedY.afterColor === undefined) ? progress?.plan : null
    return {
      score,
      shape: displayAdaptive?.shape ?? (guidedY.afterColor !== undefined ? 'Y' : undefined),
      color: displayAdaptive?.color ?? guidedY.afterColor,
    }
  }

  private static scoreGuidedYPlacement(
    gridAfter: (PuyoColor | null)[][],
    gridBefore: (PuyoColor | null)[][],
    landing: LandingResult,
    mainColor: PuyoColor,
    subColor: PuyoColor,
    trainingPlan?: GTRTrainingPlan,
  ): { score: number; color?: PuyoColor; afterColor?: PuyoColor; blocksStartedPlan: boolean } {
    const S = ADVISOR_SCORING.CHAIN_TAIL
    const beforePlan = this.getYJointPlan(gridBefore, trainingPlan)
    const afterPlan = this.getYJointPlan(gridAfter, trainingPlan)
    const yPlan = this.canAdoptFoldCompanionAsYColor(
      gridBefore, gridAfter, landing, beforePlan, afterPlan,
    ) ? afterPlan : beforePlan
    if (!yPlan) return { score: 0, afterColor: afterPlan?.colorC, blocksStartedPlan: false }

    const targets = this.getYJointTargets(
      gridAfter.length, yPlan.colorC, yPlan.colorD,
    )
    const hasStartedChain = targets.some(target =>
      target.color === yPlan.colorC &&
      gridBefore[target.y]?.[target.x] === target.color,
    )
    let score = 0
    let blocksStartedPlan = false
    for (const { pos, color } of [
      { pos: landing.mainPos, color: mainColor },
      { pos: landing.subPos, color: subColor },
    ]) {
      const target = targets.find(item => item.x === pos.x && item.y === pos.y)
      if (!target) continue
      if (hasStartedChain && color !== target.color) blocksStartedPlan = true
      score += color === target.color
        ? S.GUIDED_Y_TARGET_MATCH
        : S.GUIDED_Y_TARGET_WRONG_COLOR
      if (
        hasStartedChain &&
        color === target.color &&
        target.color === yPlan.colorC &&
        target.x === 2 &&
        target.y === gridAfter.length - 3
      ) score += S.GUIDED_Y_CONNECTION_PRIORITY
    }

    if (targets.every(target => gridAfter[target.y]?.[target.x] === target.color)) {
      score += S.GUIDED_Y_COMPLETE
    }
    return { score, color: yPlan.colorC, afterColor: afterPlan?.colorC, blocksStartedPlan }
  }

  private static canAdoptFoldCompanionAsYColor(
    gridBefore: (PuyoColor | null)[][],
    gridAfter: (PuyoColor | null)[][],
    landing: LandingResult,
    beforePlan: YJointPlan | null,
    afterPlan: YJointPlan | null,
  ): boolean {
    if (!afterPlan) return false
    if (
      beforePlan?.colorC === afterPlan.colorC &&
      beforePlan.colorD === afterPlan.colorD
    ) return true

    const h = gridBefore.length
    const landedAt = (x: number, y: number) =>
      (landing.mainPos.x === x && landing.mainPos.y === y) ||
      (landing.subPos.x === x && landing.subPos.y === y)
    return (
      gridBefore[h - 1]?.[2] === null &&
      landedAt(2, h - 1) &&
      (landedAt(0, h - 1) || landedAt(1, h - 1)) &&
      gridAfter[h - 1]?.[2] === afterPlan.colorC
    )
  }

  private static getYJointTargets(
    height: number,
    colorC: PuyoColor,
    colorD: PuyoColor,
  ): { x: number; y: number; color: PuyoColor }[] {
    // Physical build order: bottom supports, horizontal arms, then upper connector.
    return [
      { x: 2, y: height - 1, color: colorC },
      { x: 3, y: height - 1, color: colorD },
      { x: 4, y: height - 1, color: colorD },
      { x: 3, y: height - 2, color: colorC },
      { x: 4, y: height - 2, color: colorC },
      { x: 2, y: height - 3, color: colorC },
    ]
  }

  // 列の高さを返す（下から数えて何段ぷよがあるか）
  private static getColumnHeight(grid: (PuyoColor | null)[][], col: number): number {
    const h = grid.length
    for (let y = 0; y < h; y++) {
      if (grid[y]?.[col] !== null) return h - y
    }
    return 0
  }

  // 列の下からの色レイヤー数を返す（連続する同色を1レイヤーとカウント）
  private static countColorLayers(grid: (PuyoColor | null)[][], col: number): number {
    const h = grid.length
    let layers = 0
    let prevColor: PuyoColor | null = null
    for (let y = h - 1; y >= 0; y--) {
      const cell = grid[y]?.[col]
      if (cell === null) break
      if (cell !== prevColor) {
        layers++
        prevColor = cell
      }
    }
    return layers
  }

  // --- スコアラー: 同色連結 ---

  private static scoreConnectivity(
    gridAfter: (PuyoColor | null)[][],
    landing: LandingResult,
    mainColor: PuyoColor,
    subColor: PuyoColor,
    fireAnalysis: CandidateFireAnalysis,
  ): number {
    const S = ADVISOR_SCORING.CONNECTIVITY
    let score = 0
    let collateralPenaltyApplied = false

    const positions = [
      { pos: landing.mainPos, color: mainColor },
      { pos: landing.subPos, color: subColor },
    ]

    const counted = new Set<string>()

    for (const { pos, color } of positions) {
      const key = `${pos.x},${pos.y}`
      if (counted.has(key)) continue

      const group = this.floodFill(gridAfter, pos.x, pos.y, color)
      for (const cell of group) counted.add(cell)

      if (group.size >= 4) {
        const isMainTriggerGroup = fireAnalysis.isIntendedMainFire &&
          group.has(`${fireAnalysis.baseline!.trigger.x},${fireAnalysis.baseline!.trigger.y}`)
        // 本線の発火色グループだけを免除し、相方による独立消去は暴発として残す。
        if (!isMainTriggerGroup) {
          score += S.GROUP_SIZE_4_PLUS
          if (fireAnalysis.hasCollateralClear) collateralPenaltyApplied = true
        }
      } else if (group.size === 3) {
        // 縦3積み（同列に3つ）は連鎖尾の理想形を破壊するためペナルティ
        if (this.isVerticalStack(group)) {
          score += S.GROUP_SIZE_3_VERTICAL
        } else if (this.isFoldAreaGroup(group, gridAfter.length)) {
          // 折り返しエリア内3連結は暴発リスク（例: row12にBBB→(2,11)B追加でBBBB暴発）
          score += S.GROUP_SIZE_3_FOLD
        } else {
          score += S.GROUP_SIZE_3
        }
      } else if (group.size === 2) {
        score += S.GROUP_SIZE_2
      }
    }

    // Catch collateral clears that only reach four connected puyos after gravity.
    if (fireAnalysis.hasCollateralClear && !collateralPenaltyApplied) {
      score += S.GROUP_SIZE_4_PLUS
    }

    return score
  }

  // 3連結グループが非テンプレートの折り返し位置（(2,12)等）を含むか
  // テンプレートのみで構成される3-group（A(0,11)+A(1,11)+A(0,10)等）はOK
  private static isFoldAreaGroup(group: Set<string>, height: number): boolean {
    const templatePos = this.getTemplatePositions(height)
    for (const key of group) {
      const [xStr, yStr] = key.split(',')
      const x = parseInt(xStr)
      const y = parseInt(yStr)
      // 折り返しエリア内(cols 0-2, 下3行)の非テンプレート位置を含む場合のみ
      if (x <= 2 && y >= height - 3 && !templatePos.has(key)) {
        return true
      }
    }
    return false
  }

  // 3連結グループが全て同じ列にあるか（縦積み判定）
  private static isVerticalStack(group: Set<string>): boolean {
    if (group.size < 3) return false
    let col: number | null = null
    for (const key of group) {
      const x = parseInt(key.split(',')[0])
      if (col === null) {
        col = x
      } else if (x !== col) {
        return false
      }
    }
    return true
  }

  private static floodFill(
    grid: (PuyoColor | null)[][],
    startX: number,
    startY: number,
    color: PuyoColor
  ): Set<string> {
    const h = grid.length
    const w = grid[0]?.length ?? 6
    const visited = new Set<string>()
    const stack = [{ x: startX, y: startY }]

    while (stack.length > 0) {
      const { x, y } = stack.pop()!
      const key = `${x},${y}`
      if (visited.has(key)) continue
      if (x < 0 || x >= w || y < 0 || y >= h) continue
      if (grid[y]?.[x] !== color) continue
      visited.add(key)
      stack.push({ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 })
    }

    return visited
  }

  // --- スコアラー: 高さペナルティ ---

  private static scoreHeightPenalty(landing: LandingResult): number {
    const S = ADVISOR_SCORING.HEIGHT
    let score = 0

    for (const pos of [landing.mainPos, landing.subPos]) {
      if (pos.y <= 2) {
        score += S.CRITICAL_ZONE
      } else if (pos.y <= 4) {
        score += S.WARNING_ZONE
      }
    }

    return score
  }

  // --- スコアラー: 連鎖シミュレーション ---

  private static scoreImmediateChain(
    outcome: Pick<ChainResolution, 'chainCount' | 'clearedPuyos'>,
  ): number {
    const S = ADVISOR_SCORING.CHAIN_SIM
    return outcome.chainCount * S.PER_CHAIN_BONUS +
      outcome.clearedPuyos * S.CLEARED_PUYO_BONUS
  }

  private static scoreChainSimulation(
    gridAfter: (PuyoColor | null)[][],
    outcome: TurnOutcome,
    fireAnalysis: CandidateFireAnalysis,
  ): number {
    const S = ADVISOR_SCORING.CHAIN_SIM
    const potential = this.analyzeChainPotential(
      outcome.stableGrid,
      outcome.chainCount === 0
        ? [outcome.landing!.mainPos, outcome.landing!.subPos]
        : [],
    )
    let score = fireAnalysis.isIntendedMainFire && fireAnalysis.baseline
      ? this.scoreImmediateChain(fireAnalysis.baseline.resolution)
      : 0

    if (GTRDetector.hasBasicPattern(gridAfter)) {
      score += S.HAS_PATTERN_BONUS
    }
    score += potential.chainCount * S.PER_CHAIN_BONUS
    score += potential.clearedPuyos * S.CLEARED_PUYO_BONUS
    score += potential.trackedPuyosCleared * S.PLACED_PUYO_CHAIN_PARTICIPATION_BONUS

    return score
  }

  /**
   * 全ての列・色に仮想単ぷよプローブを着地させ、最大何連鎖になるかを調べる。
   * 実際に操作できる1手ではなく、盤面の接続可能性を列固定なしで比較するための評価。
   */
  static analyzeChainPotential(
    grid: (PuyoColor | null)[][],
    trackedPositions: readonly Position[] = [],
  ): ChainPotential {
    let best: ChainPotential = {
      chainCount: 0,
      clearedPuyos: 0,
      triggerColumn: null,
      triggerColor: null,
      trackedPuyosCleared: 0,
    }

    // 現在手ですでに起きる消去を先に解決する。未解決盤面へ仮想ぷよを
    // 足すと、本来は消えるグループへ次手が参加する不可能な評価になる。
    const stableGrid = resolveChains(grid).stableGrid
    const width = stableGrid[0]?.length ?? 0
    for (let column = 0; column < width; column++) {
      const y = findLowestEmpty(stableGrid, column)
      if (y < 0) continue

      for (const color of this.ALL_COLORS) {
        const candidate = stableGrid.map(row => [...row])
        candidate[y][column] = color
        const result = resolveChains(candidate)
        const trackedPuyosCleared = trackedPositions.filter(tracked =>
          result.clearSteps.some(step => step.clearedPuyos.some(puyo =>
            puyo.origin?.x === tracked.x && puyo.origin.y === tracked.y,
          )),
        ).length
        if (
          result.chainCount > best.chainCount ||
          (result.chainCount === best.chainCount && result.clearedPuyos > best.clearedPuyos) ||
          (result.chainCount === best.chainCount &&
            result.clearedPuyos === best.clearedPuyos &&
            trackedPuyosCleared > best.trackedPuyosCleared)
        ) {
          best = {
            chainCount: result.chainCount,
            clearedPuyos: result.clearedPuyos,
            triggerColumn: column,
            triggerColor: color,
            trackedPuyosCleared,
          }
        }
      }
    }

    return best
  }

  // --- ヘルパー ---

  private static getPhaseMessage(phase: GamePhase): string {
    switch (phase) {
      case GamePhase.FOLD_BUILDING:
        return '折り返しを作ろう（左下にぷよを積む）'
      case GamePhase.CHAIN_TAIL:
        return '連鎖尾を伸ばそう（右側にぷよを積む）'
      case GamePhase.COMPLETION:
        return 'GTRを完成させよう'
    }
  }
}
