// Exploratory one-move interventions on failed saved games. No production
// scoring is changed and no result is a full-population improvement estimate.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseBenchmarkReportJson } from '../../src/benchmark/BenchmarkReportValidation'
import { SeededRandom, createOpeningPairs, createRandomBenchmarkPair, decodeBenchmarkGrid,
  encodeBenchmarkGrid, type BenchmarkGameResult } from '../../src/benchmark/AdvisorBenchmark'
import { PlacementAdvisor } from '../../src/game/advisor/PlacementAdvisor'
import { GTRDetector } from '../../src/game/gtr/GTRPatterns'
import { simulateTurn, isSpawnBlocked } from '../../src/game/core/ChainSimulator'

const [input, opportunitiesPath, output] = process.argv.slice(2)
if (!input || !opportunitiesPath || !output) throw new Error('Expected report.json opportunities.json output.json')
const bytes = readFileSync(input)
const report = parseBenchmarkReportJson(bytes.toString('utf8'), input)
if (report.config.modes.length !== 1 || report.config.modes[0] !== 'random') throw new Error('Requires random mode')
const opportunities = JSON.parse(readFileSync(opportunitiesPath, 'utf8')) as {
  inputSha256: string; foldMisses: { gameIndex: number; turn: number }[];
}
if (opportunities.inputSha256 !== createHash('sha256').update(bytes).digest('hex')) throw new Error('Different source report')
const games = report.modes[0].games
const interventions: { game: BenchmarkGameResult; turn: number; kind: 'advance_fold_once' | 'avoid_short_fire_once' }[] = []
for (const id of [...new Set(opportunities.foldMisses.map(x => x.gameIndex))]) {
  interventions.push({ game: games[id], turn: opportunities.foldMisses.find(x => x.gameIndex === id)!.turn, kind: 'advance_fold_once' })
}
for (const game of games.filter(g => g.actualFire && g.maxIntendedChain < 5)) {
  interventions.push({ game, turn: game.fireTurn!, kind: 'avoid_short_fire_once' })
}
const results = interventions.map(({ game, turn: interventionTurn, kind }) => {
  const rng = new SeededRandom(game.gameSeed)
  const queue = [...createOpeningPairs(game.openingKind, rng)]
  while (queue.length < game.maxTurns + 2) queue.push(createRandomBenchmarkPair(rng))
  // Confirm reconstructed supply equals all recorded current/next/next2 pairs.
  for (const t of game.turns) for (const [offset, p] of [t.currentPair, t.nextPair, t.nextNextPair].entries()) {
    if (p.main !== queue[t.turn - 1 + offset].main.color || p.sub !== queue[t.turn - 1 + offset].sub.color) throw new Error('Queue mismatch')
  }
  let grid = decodeBenchmarkGrid(game.turns[interventionTurn - 1].gridBefore)
  let core = game.coreTurn !== null && game.coreTurn < interventionTurn
  let tail = game.completionTurn !== null && game.completionTurn < interventionTurn
  let firedChain = 0, fireTurn: number | null = null, unintended = 0
  const trace = []
  for (let turn = interventionTurn; turn <= game.maxTurns; turn++) {
    const current = queue[turn - 1]
    // Only visible pairs go to the advisor; later supply remains diagnostic data.
    const a = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, current, queue[turn], queue[turn + 1], game.trainingPlan)
    let chosen = a.bestPlacement
    if (turn === interventionTurn) {
      const original = game.turns[turn - 1]
      if (!chosen || chosen.placement.column !== original.placement.column || chosen.placement.rotation !== original.placement.rotation ||
          Math.abs(chosen.totalScore - original.totalScore) > 1e-6) throw new Error('Original recommendation mismatch')
      const oldMissing = PlacementAdvisor.getFoldPlan(decodeBenchmarkGrid(original.gridAfter), game.trainingPlan)?.missingColors.length ?? Infinity
      const beforeMissing = PlacementAdvisor.getFoldPlan(grid, game.trainingPlan)?.missingColors.length ?? 0
      chosen = a.allPlacements.find(candidate => {
        const outcome = simulateTurn(grid, current, candidate.placement)
        if (outcome.chainCount || isSpawnBlocked(outcome.stableGrid)) return false
        if (kind === 'avoid_short_fire_once') return true
        const fold = PlacementAdvisor.getFoldPlan(outcome.stableGrid, game.trainingPlan)
        return fold !== null && fold.missingColors.length < beforeMissing && fold.missingColors.length < oldMissing
      }) ?? null
      if (!chosen) throw new Error('Missing diagnostic alternative')
    }
    if (!chosen) break
    const outcome = simulateTurn(grid, current, chosen.placement)
    if (!outcome.valid) throw new Error('Invalid alternative')
    trace.push({ turn, current: { main: current.main.color, sub: current.sub.color },
      placement: chosen.placement, before: encodeBenchmarkGrid(grid), after: encodeBenchmarkGrid(outcome.stableGrid),
      mainFire: chosen.isIntendedMainFire, mainChain: chosen.intendedMainChainCount, physicalChain: outcome.chainCount })
    if (outcome.chainCount && (!chosen.isIntendedMainFire || chosen.hasCollateralClear)) unintended++
    grid = outcome.stableGrid
    core ||= GTRDetector.detectGTR(grid).hasBasicPattern
    tail ||= PlacementAdvisor.isAdaptiveTailComplete(grid, game.trainingPlan)
    if (chosen.isIntendedMainFire) { firedChain = chosen.intendedMainChainCount; fireTurn = turn; break }
    if (isSpawnBlocked(grid)) break
  }
  return { gameIndex: game.gameIndex, kind, interventionTurn,
    before: { core: game.coreCompleted, tail: game.guidedTargetCompleted, chain: game.maxIntendedChain, fireTurn: game.fireTurn },
    after: { core, tail, chain: firedChain, fireTurn, unintended, gameOver: isSpawnBlocked(grid) }, trace }
})
const summary = Object.fromEntries(['advance_fold_once', 'avoid_short_fire_once'].map(kind => {
  const subset = results.filter(r => r.kind === kind)
  return [kind, { games: subset.length, coreCompleted: subset.filter(r => r.after.core).length,
    tailCompleted: subset.filter(r => r.after.tail).length, fiveFired: subset.filter(r => r.after.chain >= 5).length,
    shortFired: subset.filter(r => r.after.chain > 0 && r.after.chain < 5).length,
    noFire: subset.filter(r => r.after.chain === 0).length,
    unintendedGames: subset.filter(r => r.after.unintended > 0).length,
    gameOver: subset.filter(r => r.after.gameOver).length }]
}))
writeFileSync(output, JSON.stringify({ input, inputSha256: opportunities.inputSha256,
  conditions: 'One deterministic local intervention, then unchanged advisor, same random queue, original maxTurns, CURRENT/NEXT/NEXT2 only. Selected failure subset, not a validated new policy.',
  summary, results }, null, 2) + '\n')
console.log(JSON.stringify({ summary, results: results.map(({ trace, ...result }) => result) }, null, 2))
