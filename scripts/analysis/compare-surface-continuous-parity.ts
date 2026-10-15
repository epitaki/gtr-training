import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ContinuousAdvisor } from '../../src/game/advisor/ContinuousAdvisor'
import { PlacementAdvisor } from '../../src/game/advisor/PlacementAdvisor'
import { isSpawnBlocked, simulateTurn, type PuyoGrid } from '../../src/game/core/ChainSimulator'
import { SeededRandom, DEFAULT_BENCHMARK_CONFIG, deriveBenchmarkGameSeed, createOpeningPairs,
  createRandomBenchmarkPair, encodeBenchmarkGrid } from '../../src/benchmark/AdvisorBenchmark'
import { GTR_SCORING_CONFIG } from '../../src/game/gtr/GTRScoringConfig'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'

const cases = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 77, 98, 117, 133, 144, 159, 202, 371] as const
const frozenUrl = new URL('../../benchmarks/results/surface-before-20260927-continuous.js', import.meta.url)
const frozenPath = fileURLToPath(frozenUrl)
const sha256 = (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex')
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
type Advisor = typeof ContinuousAdvisor.getAdvice

function runCase(gameIndex: number, advisor: Advisor) {
  const gameSeed = deriveBenchmarkGameSeed(DEFAULT_BENCHMARK_CONFIG.seed, gameIndex)
  const openingKind = DEFAULT_BENCHMARK_CONFIG.openingKinds[gameIndex % DEFAULT_BENCHMARK_CONFIG.openingKinds.length]
  const random = new SeededRandom(gameSeed)
  const openings = createOpeningPairs(openingKind, random)
  const plan = PlacementAdvisor.createTrainingPlan(...openings)
  const queue = [...openings, createRandomBenchmarkPair(random)]
  let grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
  const turns = []
  let stop = 'turn_limit'
  for (let turn = 1; turn <= 20; turn++) {
    const [current, next, next2] = queue
    const gridBefore = encodeBenchmarkGrid(grid)
    const supply = queue.map(pair => ({ main: pair.main.color, sub: pair.sub.color }))
    const advice = advisor({ grid, width: 6, height: 13 }, current, next, next2, plan)
    const candidates = advice.allPlacements.map(candidate => ({ placement: candidate.placement, score: candidate.totalScore }))
    const best = advice.bestPlacement ? { placement: advice.bestPlacement.placement, score: advice.bestPlacement.totalScore } : null
    if (!best) {
      turns.push({ turn, supply, gridBefore, candidates, best, gridAfter: gridBefore })
      stop = 'no_advice'
      break
    }
    const outcome = simulateTurn(grid, current, best.placement)
    if (!outcome.valid) {
      turns.push({ turn, supply, gridBefore, candidates, best, gridAfter: gridBefore })
      stop = 'invalid'
      break
    }
    grid = outcome.stableGrid
    turns.push({ turn, supply, gridBefore, candidates, best, gridAfter: encodeBenchmarkGrid(grid) })
    if (outcome.chainCount) { stop = 'unexpected_clear'; break }
    if (isSpawnBlocked(grid)) { stop = 'game_over'; break }
    queue.shift(); queue.push(createRandomBenchmarkPair(random))
  }
  return { gameIndex, gameSeed, openingKind, turns, stop, finalGrid: encodeBenchmarkGrid(grid) }
}

const compare = (before: ReturnType<typeof runCase>, after: ReturnType<typeof runCase>) => {
  const differences: Array<{ turn: number | null; field: string }> = []
  const max = Math.max(before.turns.length, after.turns.length)
  for (let index = 0; index < max; index++) {
    const a = before.turns[index], b = after.turns[index]
    if (!a || !b) { differences.push({ turn: index + 1, field: 'turnPresence' }); continue }
    for (const field of ['supply', 'gridBefore', 'best', 'candidates', 'gridAfter'] as const) {
      if (!equal(a[field], b[field])) differences.push({ turn: index + 1, field })
    }
  }
  if (before.stop !== after.stop) differences.push({ turn: null, field: 'stop' })
  if (before.finalGrid !== after.finalGrid) differences.push({ turn: null, field: 'finalGrid' })
  return differences
}

if (import.meta.main) {
  const output = process.argv[2]
  if (!output || existsSync(output)) throw new Error('usage: compare-surface-continuous-parity.ts <new-output.json>')
  const frozenHash = sha256(readFileSync(frozenPath))
  const afterHashes = captureAdvisorSourceHashes()
  const harnessSha256 = sha256(readFileSync(import.meta.filename))
  const supplierSha256 = sha256(readFileSync(fileURLToPath(new URL('../../src/benchmark/AdvisorBenchmark.ts', import.meta.url))))
  const frozen = await import(frozenUrl.href) as { ContinuousAdvisor: { getAdvice: Advisor } }
  if (typeof frozen.ContinuousAdvisor?.getAdvice !== 'function') throw new Error('Frozen ContinuousAdvisor export is missing')
  const games = cases.map(gameIndex => {
    const before = runCase(gameIndex, frozen.ContinuousAdvisor.getAdvice)
    const after = runCase(gameIndex, ContinuousAdvisor.getAdvice)
    const differences = compare(before, after)
    console.log(`${gameIndex}: ${differences.length ? JSON.stringify(differences) : 'match'}`)
    return { gameIndex, before, after, differences }
  })
  if (sha256(readFileSync(frozenPath)) !== frozenHash) throw new Error('Frozen source changed during comparison')
  if (!equal(afterHashes, captureAdvisorSourceHashes()) || sha256(readFileSync(import.meta.filename)) !== harnessSha256 ||
      sha256(readFileSync(fileURLToPath(new URL('../../src/benchmark/AdvisorBenchmark.ts', import.meta.url)))) !== supplierSha256) {
    throw new Error('After source, harness, or supplier changed during comparison')
  }
  const summary = { games: games.length, turnsBefore: games.reduce((n, game) => n + game.before.turns.length, 0),
    turnsAfter: games.reduce((n, game) => n + game.after.turns.length, 0),
    changedGames: games.filter(game => game.differences.length).map(game => game.gameIndex) }
  writeFileSync(output, JSON.stringify({ kind: 'surface-continuous-parity', scoring: GTR_SCORING_CONFIG.VERSION,
    frozenPath, frozenSha256: frozenHash, afterHashes, harnessSha256, supplierSha256,
    seed: DEFAULT_BENCHMARK_CONFIG.seed, maxTurns: 20,
    cases, summary, games }, null, 2), { flag: 'wx' })
  console.log(JSON.stringify(summary))
  if (summary.changedGames.length) process.exitCode = 1
}
