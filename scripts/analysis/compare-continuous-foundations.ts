import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { GTRDetector } from '../../src/game/gtr/GTRPatterns'
import { GTR_SCORING_CONFIG } from '../../src/game/gtr/GTRScoringConfig'
import { createGTREvaluationGrid } from '../../src/game/gtr/EvaluationRange'
import { assessFoundationContext } from '../../src/game/advisor/FoundationContext'
import { simulateTurn } from '../../src/game/core/ChainSimulator'
import { SeededRandom, deriveBenchmarkGameSeed, createOpeningPairs, createRandomBenchmarkPair,
  encodeBenchmarkGrid, decodeBenchmarkGrid, DEFAULT_BENCHMARK_CONFIG } from '../../src/benchmark/AdvisorBenchmark'
import type { measureContinuousGame } from '../benchmark/measure-continuous-guide'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'
import { inspectBoardSurface } from '../../src/game/advisor/BoardSurface'
import { splitDropCost } from '../../src/game/advisor/PlacementEffort'
import { PlacementAdvisor } from '../../src/game/advisor/PlacementAdvisor'
import { isGuidedTailComplete } from '../../src/game/advisor/GuidedTail'

export interface ContinuousReport {
  version: number; mode: string; seed: number; maxTurns: number; start: number; openingKinds: string[]
  games: ReturnType<typeof measureContinuousGame>[]
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Recompute only boards actually reached. Rebuild supply and physics first;
 * never add helpers here to turn a conditional future into a scored achievement.
 */
export function rescoreContinuousReport(report: ContinuousReport) {
  if (report.version !== 1 || report.mode !== 'continuous-guide' || report.start !== 0 ||
      report.seed !== DEFAULT_BENCHMARK_CONFIG.seed || !report.games.length ||
      !Number.isInteger(report.maxTurns) || report.maxTurns < 1 || report.maxTurns > 20 ||
      !equal(report.openingKinds, DEFAULT_BENCHMARK_CONFIG.openingKinds)) throw new Error('Unsupported report settings')
  let verifiedPlacements = 0
  const games = report.games.map((game, index) => {
    const gameSeed = deriveBenchmarkGameSeed(report.seed, index)
    const openingKind = DEFAULT_BENCHMARK_CONFIG.openingKinds[index % report.openingKinds.length]
    if (game.gameIndex !== index || game.gameSeed !== gameSeed || game.openingKind !== openingKind ||
        game.maxTurns !== report.maxTurns || !game.turns.length || game.turns.length > report.maxTurns) {
      throw new Error(`Bad game identity: ${index}`)
    }
    const random = new SeededRandom(gameSeed)
    const queue = [...createOpeningPairs(openingKind, random), createRandomBenchmarkPair(random)]
    const plan = PlacementAdvisor.createTrainingPlan(queue[0], queue[1])
    let previous = '.'.repeat(78), perfectTurn: number | null = null, maxScore = 0
    let foundationFive = false, raisedFive = false, recordedPerfect = false, cleanFive = false, minimalFive = false
    let guidedTail = false
    let perfectContext: ReturnType<typeof assessFoundationContext> | null = null
    for (const [i, turn] of game.turns.entries()) {
      if (turn.turn !== i + 1 || turn.gridBefore !== previous ||
          !equal(turn.visiblePairs, queue.map(p => ({ main: p.main.color, sub: p.sub.color })))) {
        throw new Error(`Input mismatch: ${index}:${i + 1}`)
      }
      if (!turn.placement) {
        if (i !== game.turns.length - 1 || game.stop !== 'no_advice' || turn.gridAfter !== previous) {
          throw new Error(`Bad stop: ${index}`)
        }
        continue
      }
      const outcome = simulateTurn(decodeBenchmarkGrid(previous), queue[0], turn.placement)
      if (!outcome.valid) {
        if (game.stop !== 'invalid' || i !== game.turns.length - 1 || turn.gridAfter !== previous) {
          throw new Error(`Bad invalid turn: ${index}`)
        }
        continue
      }
      if (encodeBenchmarkGrid(outcome.stableGrid) !== turn.gridAfter ||
          !('physicalChains' in turn) || outcome.chainCount !== turn.physicalChains || !turn.evaluation) {
        throw new Error(`Physics mismatch: ${index}:${i + 1}`)
      }
      verifiedPlacements++
      const score = GTRDetector.detectGTR(outcome.stableGrid)
      guidedTail ||= isGuidedTailComplete(outcome.stableGrid, plan)
      // Only the full-mark eligibility changes in this experiment.
      if (score.chainCount !== turn.evaluation.chainCount || score.leftoverPuyos !== turn.evaluation.leftoverPuyos) {
        throw new Error(`Foundation chain/leftover regression: ${index}:${i + 1}`)
      }
      recordedPerfect ||= turn.evaluation.totalScore === 100
      foundationFive ||= score.hasBasicPattern && score.chainCount >= 5
      raisedFive ||= score.hasBasicPattern && score.chainCount >= 5 && score.rightEdgeRaised === true
      if (score.hasBasicPattern && score.chainCount === 5 && score.leftoverPuyos === 0) {
        cleanFive = true
        minimalFive ||= createGTREvaluationGrid(outcome.stableGrid).flat().filter(Boolean).length === 19
      }
      maxScore = Math.max(maxScore, score.totalScore)
      if (score.totalScore === 100 && perfectTurn === null) {
        perfectTurn = turn.turn
        perfectContext = assessFoundationContext(outcome.stableGrid)
      }
      previous = turn.gridAfter
      queue.shift(); queue.push(createRandomBenchmarkPair(random))
    }
    if (previous !== game.finalGrid || recordedPerfect !== game.perfect) throw new Error(`Final summary mismatch: ${index}`)
    return { gameIndex: index, recordedPerfect, perfectTurn, maxScore, foundationFive, raisedFive, cleanFive, minimalFive, perfectContext,
      recordedTail: game.tail, guidedTail }
  })
  const perfectGames = games.filter(g => g.perfectTurn !== null).length
  return { games, verifiedPlacements, summary: { games: games.length,
    recordedPerfectGames: games.filter(g => g.recordedPerfect).length,
    perfectGames, perfectRate: perfectGames / games.length,
    recordedTailGames: games.filter(g => g.recordedTail).length,
    guidedTailGames: games.filter(g => g.guidedTail).length,
    foundationFiveGames: games.filter(g => g.foundationFive).length,
    raisedFiveGames: games.filter(g => g.raisedFive).length,
    fiveWithNoLeftoversGames: games.filter(g => g.cleanFive).length,
    minimalFiveWithNoLeftoversGames: games.filter(g => g.minimalFive).length,
    perfectWithConnectionPotential: games.filter(g => g.perfectContext?.status === 'potential').length,
  } }
}

export function compareContinuousFoundations(before: ContinuousReport, after: ContinuousReport) {
  if (!equal([before.seed, before.maxTurns, before.openingKinds, before.games.length],
    [after.seed, after.maxTurns, after.openingKinds, after.games.length])) throw new Error('Mixed comparison conditions')
  const a = rescoreContinuousReport(before), b = rescoreContinuousReport(after)
  const changedGames = before.games.flatMap((g, i) => equal(
    g.turns.map(t => [t.visiblePairs, t.gridBefore, t.placement, t.gridAfter]),
    after.games[i].turns.map(t => [t.visiblePairs, t.gridBefore, t.placement, t.gridAfter]),
  ) && g.stop === after.games[i].stop ? [] : [g.gameIndex])
  const fiveGained = b.games.filter((g, i) => g.foundationFive && !a.games[i].foundationFive).map(g => g.gameIndex)
  const fiveLost = a.games.filter((g, i) => g.foundationFive && !b.games[i].foundationFive).map(g => g.gameIndex)
  return { before: a, after: b, changedGames, fiveGained, fiveLost,
    style: { before: summarizeContinuousStyle(before), after: summarizeContinuousStyle(after) },
    tailGained: b.games.filter((g, i) => g.guidedTail && !a.games[i].guidedTail).map(g => g.gameIndex),
    tailLost: a.games.filter((g, i) => g.guidedTail && !b.games[i].guidedTail).map(g => g.gameIndex),
    perfectGained: b.games.filter((g, i) => g.perfectTurn !== null && a.games[i].perfectTurn === null).map(g => g.gameIndex),
    perfectLost: a.games.filter((g, i) => g.perfectTurn !== null && b.games[i].perfectTurn === null).map(g => g.gameIndex) }
}

/** Descriptive geometry of the already physics-validated games; not a human-style grade. */
function summarizeContinuousStyle(report: ContinuousReport) {
  let placements = 0, splitDrops = 0, tallWellMoves = 0, peakHeightSum = 0
  for (const game of report.games) for (const turn of game.turns) {
    if (!turn.placement) continue
    const pair = turn.visiblePairs[0]
    const outcome = simulateTurn(decodeBenchmarkGrid(turn.gridBefore), {
      main: { color: pair.main, x: 2, y: 1 }, sub: { color: pair.sub, x: 2, y: 0 }, rotation: 0, falling: true,
    }, turn.placement)
    if (!outcome.valid) continue
    const surface = inspectBoardSurface(outcome.stableGrid)
    placements++
    splitDrops += Number(splitDropCost(outcome.landing) > 0)
    peakHeightSum += Math.max(0, ...surface.heights)
    tallWellMoves += Number(surface.wellDepths.some((depth, x) => depth >= 3 &&
      Math.min(surface.heights[x - 1] ?? 0, surface.heights[x + 1] ?? 0) >= 5))
  }
  return { placements, splitDrops, tallWellMoves, meanPeakHeight: placements ? peakHeightSum / placements : null }
}

if (import.meta.main) {
  const [beforePath, afterPath, output] = process.argv.slice(2)
  if (!beforePath || !afterPath || !output || existsSync(output)) throw new Error('usage: compare-continuous-foundations.ts before.json after.json new-output.json')
  const inputs = [beforePath, afterPath].map(path => ({ path, raw: readFileSync(path, 'utf8') }))
  const hashes = captureAdvisorSourceHashes()
  const result = compareContinuousFoundations(JSON.parse(inputs[0].raw), JSON.parse(inputs[1].raw))
  if (!equal(hashes, captureAdvisorSourceHashes())) throw new Error('Scorer changed during analysis')
  const sha = (s: string) => createHash('sha256').update(s).digest('hex')
  writeFileSync(output, JSON.stringify({ kind: 'continuous-foundation-comparison', scoring: GTR_SCORING_CONFIG.VERSION,
    tailDefinition: 'guided-pending-head-v1',
    hashes, analysisSha256: sha(readFileSync(import.meta.filename, 'utf8')),
    inputs: inputs.map(input => ({ path: input.path, sha256: sha(input.raw) })), ...result }, null, 2), { flag: 'wx' })
  console.log(JSON.stringify({ before: result.before.summary, after: result.after.summary, changedGames: result.changedGames,
    perfectGained: result.perfectGained, perfectLost: result.perfectLost, fiveGained: result.fiveGained,
    fiveLost: result.fiveLost, tailGained: result.tailGained, tailLost: result.tailLost, style: result.style }))
}
