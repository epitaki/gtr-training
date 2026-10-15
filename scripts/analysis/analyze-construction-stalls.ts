// Diagnose saved trajectories without reranking them or peeking at future supply.
// A prefix shard permits development analysis without opening a reserved suffix.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { aggregateBenchmarkGames, decodeBenchmarkGrid, type BenchmarkConfig, type BenchmarkGameResult } from '../../src/benchmark/AdvisorBenchmark'
import { parseBenchmarkReportJson } from '../../src/benchmark/BenchmarkReportValidation'
import { createMainFireBaseline, analyzeCandidateFire } from '../../src/game/advisor/MainFireAnalysis'
import { simulateTurn, isSpawnBlocked, type PuyoGrid } from '../../src/game/core/ChainSimulator'
import { GTRDetector } from '../../src/game/gtr/GTRPatterns'
import { inspectHeadExtension } from '../../src/game/gtr/HeadExtension'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'

const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Expected report-or-prefix.json output.json')
const bytes = readFileSync(input)
const parsed = JSON.parse(bytes.toString('utf8'))
let reportText = bytes.toString('utf8')
if (parsed.kind === 'advisor-range') {
  const shard = parsed as { start: number; end: number; config: BenchmarkConfig; games: BenchmarkGameResult[] }
  if (shard.start !== 0 || !Number.isInteger(shard.end) || shard.end < 1 ||
      shard.end !== shard.games.length || shard.end > shard.config.gamesPerMode ||
      shard.config.modes.length !== 1 || shard.config.modes[0] !== 'random') throw new Error('Expected a random prefix shard')
  const aggregate = aggregateBenchmarkGames(shard.games)
  reportText = JSON.stringify({ version: 3, config: { ...shard.config, gamesPerMode: shard.end }, overall: aggregate,
    modes: [{ mode: 'random', ...aggregate, games: shard.games,
      byOpening: Object.fromEntries(shard.config.openingKinds.map(kind => [kind,
        aggregateBenchmarkGames(shard.games.filter(game => game.openingKind === kind))])),
    }],
  })
}
const report = parseBenchmarkReportJson(reportText, input)
if (report.modes.length !== 1 || report.modes[0].mode !== 'random') throw new Error('Expected random only')
const games = report.modes[0].games
const baselineFor = (grid: PuyoGrid) => GTRDetector.detectGTR(grid).hasBasicPattern || inspectHeadExtension(grid)
  ? createMainFireBaseline(grid) : null
const rows = games.map(game => {
  let firstConditionalFive: number | null = null
  const missedFiveTurns: number[] = []
  for (const turn of game.turns) {
    const before = decodeBenchmarkGrid(turn.gridBefore)
    const baseline = baselineFor(before)
    if (!turn.intendedMainFire && (baseline?.resolution.chainCount ?? 0) >= 5) {
      const pair = { main: { color: turn.currentPair.main, x: 2, y: 1 },
        sub: { color: turn.currentPair.sub, x: 2, y: 0 }, rotation: 0, falling: true }
      let available = false
      for (let column = 0; column < 6 && !available; column++) for (let rotation = 0; rotation < 4 && !available; rotation++) {
        const result = simulateTurn(before, pair, { column, rotation })
        available = result.valid && !isSpawnBlocked(result.stableGrid) && analyzeCandidateFire(pair, result, baseline).isIntendedMainFire
      }
      if (available) missedFiveTurns.push(turn.turn)
    }
    if (turn.chainCount === 0 && (baselineFor(decodeBenchmarkGrid(turn.gridAfter))?.resolution.chainCount ?? 0) >= 5) {
      firstConditionalFive ??= turn.turn
    }
  }
  const category = game.maxIntendedChain >= 5 ? 'five_success' : game.actualFire ? 'short_fire' : game.failureReason
  return {
    gameIndex: game.gameIndex, opening: game.openingKind, category,
    coreTurn: game.coreTurn, tailTurn: game.completionTurn, fireTurn: game.fireTurn,
    actualChain: game.maxIntendedChain, tailCompleted: game.guidedTargetCompleted,
    firstConditionalFive, finalConditionalChain: baselineFor(decodeBenchmarkGrid(game.finalGrid))?.resolution.chainCount ?? 0,
    firstGeneralScoreTurn: game.turns.find(turn => turn.totalScore < 90000)?.turn ?? null,
    missedFiveTurns, maxColumnHeight: game.maxColumnHeight,
  }
})
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const summary = (subset: typeof rows) => ({
  games: subset.length, ids: subset.map(row => row.gameIndex),
  meanCoreTurn: mean(subset.flatMap(row => row.coreTurn === null ? [] : [row.coreTurn])),
  meanTailTurn: mean(subset.flatMap(row => row.tailTurn === null ? [] : [row.tailTurn])),
  meanMaxHeight: mean(subset.map(row => row.maxColumnHeight)),
  neverConditionalFive: subset.filter(row => row.firstConditionalFive === null).length,
  firstConditionalFiveAt19Or20: subset.filter(row => row.firstConditionalFive !== null && row.firstConditionalFive >= 19).length,
  everGeneralScore: subset.filter(row => row.firstGeneralScoreTurn !== null).length,
  missedFiveGames: subset.filter(row => row.missedFiveTurns.length > 0).map(row => row.gameIndex),
})
const result = {
  input, inputSha256: createHash('sha256').update(bytes).digest('hex'), sourceSha256: captureAdvisorSourceHashes(),
  config: report.config,
  notes: [
    'Conditional five means virtual fire-color addition(s), NOT a verified fire with the actual pair. Head extensions may need two added puyos.',
    'Missed five uses actual current-pair placements and main-chain provenance, including companion effects; it does not use future pairs.',
    'Scores below 90000 identify the free-form scoring band, not the reason that skeleton planning was bypassed.',
    'Opening/category associations describe this sample only and are not causal claims.',
  ],
  grouped: Object.fromEntries([...new Set(rows.map(row => row.category))].map(category => [String(category), summary(rows.filter(row => row.category === category))])),
  opening: Object.fromEntries(report.config.openingKinds.map(kind => {
    const subset = rows.filter(row => row.opening === kind)
    return [kind, { games: subset.length, failedFive: subset.filter(row => row.actualChain < 5).length }]
  })), rows,
}
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify({ grouped: result.grouped, opening: result.opening }, null, 2))
