import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { ContinuousAdvisor } from '../../src/game/advisor/ContinuousAdvisor'
import { PlacementAdvisor } from '../../src/game/advisor/PlacementAdvisor'
import { isGuidedTailComplete } from '../../src/game/advisor/GuidedTail'
import { traceFoundation, inspectConnectedExtension } from '../../src/game/advisor/ConnectedExtension'
import { GTRDetector } from '../../src/game/gtr/GTRPatterns'
import { isSpawnBlocked, simulateTurn, type PuyoGrid } from '../../src/game/core/ChainSimulator'
import { SeededRandom, DEFAULT_BENCHMARK_CONFIG, deriveBenchmarkGameSeed, createOpeningPairs,
  createRandomBenchmarkPair, encodeBenchmarkGrid } from '../../src/benchmark/AdvisorBenchmark'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'

/** New stopping contract: construct for at most 20 turns, do NOT stop at a fire.
 * Virtual extension tests are diagnostics, never achieved-chain statistics.
 * The seed/openings/random supplier are the historical benchmark's shared code.
 */
export function measureContinuousGame(gameIndex: number, maxTurns = 20,
  advisor: typeof ContinuousAdvisor.getAdvice = ContinuousAdvisor.getAdvice) {
  const gameSeed = deriveBenchmarkGameSeed(DEFAULT_BENCHMARK_CONFIG.seed, gameIndex)
  const random = new SeededRandom(gameSeed)
  const openingKind = DEFAULT_BENCHMARK_CONFIG.openingKinds[gameIndex % DEFAULT_BENCHMARK_CONFIG.openingKinds.length]
  const openings = createOpeningPairs(openingKind, random)
  const plan = PlacementAdvisor.createTrainingPlan(...openings)
  const queue = [...openings, createRandomBenchmarkPair(random)]
  let grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
  let foundationTurn: number | null = null, perfect = false, tail = false, core = false
  let lostFoundation = false, clears = 0, postCompletionMoves = 0
  let stop: 'turn_limit' | 'no_advice' | 'invalid' | 'unexpected_clear' | 'game_over' = 'turn_limit'
  const turns = []
  for (let turn = 1; turn <= maxTurns; turn++) {
    const [current, next, next2] = queue
    const started = performance.now()
    const advice = advisor({ grid, width: 6, height: 13 }, current, next, next2, plan)
    const elapsedMs = performance.now() - started
    const placement = advice.bestPlacement?.placement ?? null
    const before = encodeBenchmarkGrid(grid)
    const input = { turn, visiblePairs: queue.map(p => ({ main: p.main.color, sub: p.sub.color })),
      gridBefore: before, placement, elapsedMs }
    if (!placement) { turns.push({ ...input, gridAfter: before }); stop = 'no_advice'; break }
    const outcome = simulateTurn(grid, current, placement)
    if (!outcome.valid) { turns.push({ ...input, gridAfter: before }); stop = 'invalid'; break }
    const evaluation = GTRDetector.detectGTR(outcome.stableGrid)
    const hasFive = evaluation.hasBasicPattern && evaluation.chainCount >= 5
    if (foundationTurn !== null) { postCompletionMoves++; lostFoundation ||= !hasFive }
    if (hasFive && foundationTurn === null) foundationTurn = turn
    perfect ||= evaluation.totalScore === 100
    core ||= evaluation.hasBasicPattern
    tail ||= isGuidedTailComplete(outcome.stableGrid, plan)
    clears += Number(outcome.chainCount > 0)
    grid = outcome.stableGrid
    turns.push({ ...input, gridAfter: encodeBenchmarkGrid(grid), evaluation, physicalChains: outcome.chainCount })
    if (outcome.chainCount) { stop = 'unexpected_clear'; break }
    if (isSpawnBlocked(grid)) { stop = 'game_over'; break }
    queue.shift(); queue.push(createRandomBenchmarkPair(random))
  }
  const trace = traceFoundation(grid)
  return { gameIndex, gameSeed, openingKind, maxTurns, foundationTurn, perfect, tail, core,
    postCompletionMoves, lostFoundation, clears, stop, turns, finalGrid: encodeBenchmarkGrid(grid),
    conditionalExtension: trace ? inspectConnectedExtension(grid, trace) : null }
}

export function summarizeContinuousGames(games: ReturnType<typeof measureContinuousGame>[]) {
  const timing = games.flatMap(g => g.turns.map(t => t.elapsedMs)).sort((a, b) => a - b)
  const summary = {
    games: games.length, foundationFive: games.filter(g => g.foundationTurn !== null).length,
    perfect: games.filter(g => g.perfect).length, tail: games.filter(g => g.tail).length,
    core: games.filter(g => g.core).length, lostFoundation: games.filter(g => g.lostFoundation).length,
    continuedAfterCompletion: games.filter(g => g.postCompletionMoves > 0).length,
    postCompletionMoves: games.reduce((n, g) => n + g.postCompletionMoves, 0),
    clears: games.reduce((n, g) => n + g.clears, 0),
    stops: Object.fromEntries(['turn_limit', 'no_advice', 'invalid', 'unexpected_clear', 'game_over'].map(reason =>
      [reason, games.filter(g => g.stop === reason).length])),
    latencyMs: { median: timing[Math.floor(timing.length / 2)], p95: timing[Math.floor(timing.length * .95)], max: timing[timing.length - 1] },
    actualFireLeftovers: null, // Deliberately unmeasured: guide does not fire.
  }
  return summary
}

if (import.meta.main) {
  const [output, countText = '500', startText = '0'] = process.argv.slice(2)
  const count = Number(countText), start = Number(startText)
  if (!output || existsSync(output) || !Number.isInteger(count) || count <= 0 || count > 10000 ||
      !Number.isInteger(start) || start < 0 || start + count > 10000) {
    throw new Error('usage: measure-continuous-guide.ts <new-output.json> [games=500] [startIndex=0]')
  }
  const hashes = captureAdvisorSourceHashes()
  const harnessSha256 = createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex')
  const supplierSha256 = createHash('sha256').update(readFileSync(new URL('../../src/benchmark/AdvisorBenchmark.ts', import.meta.url))).digest('hex')
  const games = Array.from({ length: count }, (_, i) => {
    const game = measureContinuousGame(start + i)
    if ((i + 1) % 25 === 0) console.log(`continuous ${start}..${start + count}: ${i + 1}/${count}`)
    return game
  })
  if (JSON.stringify(hashes) !== JSON.stringify(captureAdvisorSourceHashes())) throw new Error('Source changed during measurement')
  const summary = summarizeContinuousGames(games)
  writeFileSync(output, JSON.stringify({ version: 1, mode: 'continuous-guide', tailDefinition: 'guided-pending-head-v1', seed: DEFAULT_BENCHMARK_CONFIG.seed,
    start, maxTurns: 20, openingKinds: DEFAULT_BENCHMARK_CONFIG.openingKinds, hashes, harnessSha256, supplierSha256, summary, games }, null, 2), { flag: 'wx' })
  console.log(JSON.stringify(summary))
}
