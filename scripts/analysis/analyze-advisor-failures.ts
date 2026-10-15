// Read-only diagnosis of saved games; does not change the advisor or its goals.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'
import { parseBenchmarkReportJson } from '../../src/benchmark/BenchmarkReportValidation'
import { decodeBenchmarkGrid, type BenchmarkGameResult } from '../../src/benchmark/AdvisorBenchmark'
import { PlacementAdvisor } from '../../src/game/advisor/PlacementAdvisor'
import { GTRDetector } from '../../src/game/gtr/GTRPatterns'
import { PuyoColor } from '../../src/game/core/types'

const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Expected input-report.json output-analysis.json')
const bytes = readFileSync(input)
const report = parseBenchmarkReportJson(bytes.toString('utf8'), input)
if (report.config.modes.length !== 1 || report.config.modes[0] !== 'random') throw new Error('Expected random only')
const games = report.modes[0].games
const colors = Object.values(PuyoColor)
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
const inspect = (encoded: string, game: BenchmarkGameResult) => {
  const grid = decodeBenchmarkGrid(encoded)
  const gtr = GTRDetector.detectGTR(grid)
  const fold = PlacementAdvisor.getFoldPlan(grid, game.trainingPlan)
  const tail = PlacementAdvisor.getCompletedTailShape(grid, game.trainingPlan)
  const heights = Array.from({ length: 6 }, (_, x) => {
    const top = grid.findIndex(row => row[x] !== null)
    return top < 0 ? 0 : 13 - top
  })
  return {
    chain: gtr.chainCount, core: gtr.hasBasicPattern, tail,
    foldMissing: fold?.missingColors ?? null,
    heights, triggerBlocked: grid[9][0] !== null, triggerColor: grid[10][0],
  }
}
const rows = games.map(game => {
  if (!game.turns.length) throw new Error(`Game ${game.gameIndex} has no stored construction trace`)
  const states = [inspect(game.turns[0].gridBefore, game), ...game.turns.map(t => inspect(t.gridAfter, game))]
  const counts = Object.fromEntries(colors.map(c => [c, 0])) as Record<PuyoColor, number>
  const turns = game.turns.map((t, index) => {
    counts[t.currentPair.main]++; counts[t.currentPair.sub]++
    const before = states[index], after = states[index + 1]
    return { turn: t.turn, before, after, pair: t.currentPair,
      fiveReady: before.chain >= 5 && before.tail !== null,
      hasFireColor: [t.currentPair.main, t.currentPair.sub].includes(before.triggerColor!),
      selectedScore: t.totalScore, selectedFire: t.intendedMainFire,
      suppliedA: counts[game.trainingPlan.colorA], suppliedB: counts[game.trainingPlan.colorB],
    }
  })
  const category = game.maxIntendedChain >= 5 ? 'five_success' : game.actualFire ? 'short_fire' : game.failureReason!
  const firstFive = states.findIndex(s => s.chain >= 5)
  const readyTurns = turns.filter(t => t.fiveReady)
  const final = states[states.length - 1]
  return {
    gameIndex: game.gameIndex, category, opening: game.openingKind,
    coreTurn: game.coreTurn, completionTurn: game.completionTurn, fireTurn: game.fireTurn,
    actualFire: game.actualFire, actualFireAvailable: game.actualFireAvailable, guidedTargetCompleted: game.guidedTargetCompleted,
    maxIntendedChain: game.maxIntendedChain, maxPotentialChain: Math.max(...states.map(s => s.chain)),
    firstFiveAfterTurn: firstFive < 0 ? null : firstFive,
    firstGeneralScoreTurn: turns.find(t => t.selectedScore < 90000)?.turn ?? null,
    // A normal fire removes the fold; that is not construction damage.
    firstIncompatibleFoldAfterTurn: states.findIndex((s, index) => s.foldMissing === null && (game.fireTurn === null || index < game.fireTurn)),
    readyTurns: readyTurns.map(t => t.turn),
    readyWithFireColor: readyTurns.filter(t => t.hasFireColor).map(t => t.turn),
    final, supplied: counts,
    foldSupplyInsufficient: counts[game.trainingPlan.colorA] < 3 || counts[game.trainingPlan.colorB] < 4,
    turns,
  }
})
type Row = typeof rows[number]
const summary = (subset: Row[]) => ({
  games: subset.length, ids: subset.map(r => r.gameIndex),
  averageCoreTurn: average(subset.flatMap(r => r.coreTurn === null ? [] : [r.coreTurn])),
  averageCompletionTurn: average(subset.flatMap(r => r.completionTurn === null ? [] : [r.completionTurn])),
  neverPotentialFive: subset.filter(r => r.firstFiveAfterTurn === null).length,
  fiveBuiltAtTurn20: subset.filter(r => r.firstFiveAfterTurn === 20).length,
  readyWithFireColor: subset.filter(r => r.readyWithFireColor.length > 0).length,
  generalScoreEver: subset.filter(r => r.firstGeneralScoreTurn !== null).length,
  incompatibleFoldEver: subset.filter(r => r.firstIncompatibleFoldAfterTurn >= 0).length,
  foldSupplyInsufficient: subset.filter(r => r.foldSupplyInsufficient).length,
  blockedTriggerAtEnd: subset.filter(r => r.final.triggerBlocked).length,
  finalPotentialHistogram: Object.fromEntries([...new Set(subset.map(r => r.final.chain))].sort((a,b) => a-b)
    .map(chain => [chain, subset.filter(r => r.final.chain === chain).length])),
  firstFiveHistogram: Object.fromEntries([...new Set(subset.map(r => String(r.firstFiveAfterTurn)))].sort()
    .map(turn => [turn, subset.filter(r => String(r.firstFiveAfterTurn) === turn).length])),
})
const grouped = Object.fromEntries([...new Set(rows.map(r => r.category))].map(category => [category, summary(rows.filter(r => r.category === category))]))
const opening = Object.fromEntries(report.config.openingKinds.map(kind => {
  const sample = rows.filter(r => r.opening === kind)
  return [kind, { games: sample.length, failedFive: sample.filter(r => r.category !== 'five_success').length }]
}))
const checkpoints = Object.fromEntries([8,10,12,14,16].map(turn => {
  // Only games still in progress after this turn; avoid treating already-fired
  // successes as unfinished construction in the risk comparison.
  const sample = rows.filter(r => r.turns.length > turn)
  const stats = (selected: Row[]) => ({ games: selected.length, failedFive: selected.filter(r => r.category !== 'five_success').length })
  return [turn, {
    unfinishedCore: stats(sample.filter(r => !r.turns[turn - 1].after.core)),
    finishedCore: stats(sample.filter(r => r.turns[turn - 1].after.core)),
    tailButBelowFive: stats(sample.filter(r => r.turns[turn - 1].after.tail !== null && r.turns[turn - 1].after.chain < 5)),
    fiveReady: stats(sample.filter(r => r.turns[turn - 1].after.tail !== null && r.turns[turn - 1].after.chain >= 5)),
  }]
}))
const result = {
  input, inputSha256: createHash('sha256').update(bytes).digest('hex'), config: report.config,
  sourceSha256: captureAdvisorSourceHashes(),
  notes: [
    'Five failure means no actual intended fire >=5 by the original maximum turn, including 3/4-chain fires.',
    'Potential chain is the existing single-puyo standard-trigger diagnostic, not an actual pair fire.',
    'Score <90000 identifies the general-scoring band in these traces, not a proof of why a template was rejected.',
    'Opening/checkpoint associations are descriptive for this fixed sample, not causal or held-out estimates.',
  ], goals: {
    games: rows.length,
    bothMet: rows.filter(r => r.guidedTargetCompleted && r.maxIntendedChain >= 5).length,
    eitherFailed: rows.filter(r => !r.guidedTargetCompleted || r.maxIntendedChain < 5).length,
    tailFailed: rows.filter(r => !r.guidedTargetCompleted).length,
    fiveFailed: rows.filter(r => r.maxIntendedChain < 5).length,
    tailOnlyFailedIds: rows.filter(r => !r.guidedTargetCompleted && r.maxIntendedChain >= 5).map(r => r.gameIndex),
  }, grouped, opening, checkpoints, rows,
}
writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ grouped: Object.fromEntries(Object.entries(grouped).map(([key, value]) => [key, { ...value, ids: undefined }])), opening, checkpoints }, null, 2))
