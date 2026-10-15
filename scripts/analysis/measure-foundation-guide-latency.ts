import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { decodeBenchmarkGrid, createOpeningPairs, deriveBenchmarkGameSeed, SeededRandom } from '../../src/benchmark/AdvisorBenchmark'
import { PlacementAdvisor } from '../../src/game/advisor/PlacementAdvisor'
import type { ContinuousAdvisor } from '../../src/game/advisor/ContinuousAdvisor'
import type { PuyoColor, PuyoPair } from '../../src/game/core/types'
import { GTRDetector } from '../../src/game/gtr/GTRPatterns'
import { isInGTREvaluationRange } from '../../src/game/gtr/EvaluationRange'
import { ADVISOR_SOURCE_PATHS } from '../shared/source-fingerprint'

// Compare the same saved positions, separately from the differently loaded
// 500-game runs. Usage: bun scripts/analysis/measure-foundation-guide-latency.ts
// <before-copy-dir> <before-500.json> <new-output.json>
type SavedPair = { main: PuyoColor; sub: PuyoColor }
type SavedTurn = { turn: number; gridBefore: string; visiblePairs: SavedPair[] }
type SavedGame = { gameIndex: number; gameSeed: number; openingKind: Parameters<typeof createOpeningPairs>[0]; turns: SavedTurn[] }
type SavedReport = { version: number; mode: string; seed: number; start: number;
  hashes: Record<string, string>; supplierSha256: string; games: SavedGame[] }
type Sample = { gameIndex: number; turn: number; grid: string; pairs: SavedPair[];
  plan: ReturnType<typeof PlacementAdvisor.createTrainingPlan> }

const [beforeDirectoryArg, reportArg, outputArg] = process.argv.slice(2)
if (!beforeDirectoryArg || !reportArg || !outputArg) throw new Error(
  'usage: measure-foundation-guide-latency.ts <before-copy-dir> <before-500.json> <new-output.json>')
const beforeDirectory = resolve(beforeDirectoryArg), reportPath = resolve(reportArg), outputPath = resolve(outputArg)
if (existsSync(outputPath)) throw new Error(`Output already exists: ${outputPath}`)
const currentDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')
const sourceFiles = Object.values(ADVISOR_SOURCE_PATHS).map(file => `src/game/${file}`)
  .concat(['src/benchmark/AdvisorBenchmark.ts', 'scripts/shared/source-fingerprint.ts'])
const sourceHashes = (directory: string) => Object.fromEntries(sourceFiles.map(file =>
  [file, sha256(readFileSync(resolve(directory, file)))]))
const beforeHashes = sourceHashes(beforeDirectory), currentHashes = sourceHashes(currentDirectory)
const harnessHash = sha256(readFileSync(import.meta.filename))
const reportBuffer = readFileSync(reportPath), reportHash = sha256(reportBuffer)
const report = JSON.parse(reportBuffer.toString('utf8')) as SavedReport
if (report.version !== 1 || report.mode !== 'continuous-guide' || report.seed !== 20260904 ||
    report.start !== 0 || report.games.length !== 500) throw new Error('Expected the fixed before 500-game continuous-guide report')
if (report.games.some((game, index) => game.gameIndex !== index)) throw new Error('Report game indices are incomplete')
for (const [name, file] of Object.entries(ADVISOR_SOURCE_PATHS)) {
  if (report.hashes[name] !== beforeHashes[`src/game/${file}`]) throw new Error(`Before source differs from report: ${name}`)
}
if (report.supplierSha256 !== beforeHashes['src/benchmark/AdvisorBenchmark.ts'] ||
    report.supplierSha256 !== currentHashes['src/benchmark/AdvisorBenchmark.ts']) {
  throw new Error('Supplier differs from the recorded before run')
}

const samples: Sample[] = report.games.filter(game => game.gameIndex < 20).flatMap(game => {
  if (deriveBenchmarkGameSeed(report.seed, game.gameIndex) !== game.gameSeed) throw new Error('Game seed mismatch')
  const opening = createOpeningPairs(game.openingKind, new SeededRandom(game.gameSeed))
  const plan = PlacementAdvisor.createTrainingPlan(...opening)
  return [8, 12, 16].flatMap(turnNumber => {
    const turn = game.turns.find(item => item.turn === turnNumber)
    if (!turn) return []
    if (turn.visiblePairs.length !== 3) throw new Error('Incomplete visible queue')
    decodeBenchmarkGrid(turn.gridBefore)
    return [{ gameIndex: game.gameIndex, turn: turnNumber, grid: turn.gridBefore,
      pairs: turn.visiblePairs, plan }]
  })
})
if (!samples.length) throw new Error('No fixed sample turns available')
const sampleHash = sha256(JSON.stringify(samples))
const asPair = ({ main, sub }: SavedPair): PuyoPair => ({
  main: { color: main, x: 2, y: 1 }, sub: { color: sub, x: 2, y: 0 }, rotation: 0, falling: true,
})
const load = async (directory: string) => {
  const started = performance.now()
  const module = await import(pathToFileURL(resolve(directory, 'src/game/advisor/ContinuousAdvisor.ts')).href) as
    { ContinuousAdvisor: typeof ContinuousAdvisor }
  return { advisor: module.ContinuousAdvisor, importMs: performance.now() - started }
}
const [before, current] = [await load(beforeDirectory), await load(currentDirectory)]
const advisors = [before.advisor, current.advisor]
const invoke = (side: number, sample: Sample) => {
  const grid = decodeBenchmarkGrid(sample.grid)
  const pairs = sample.pairs.map(asPair)
  const original = JSON.stringify({ grid, pairs, plan: sample.plan })
  const started = performance.now()
  advisors[side].getAdvice({ grid, width: 6, height: 13 }, pairs[0], pairs[1], pairs[2], sample.plan)
  const elapsed = performance.now() - started
  if (JSON.stringify({ grid, pairs, plan: sample.plan }) !== original) throw new Error('Advisor mutated sample input')
  return elapsed
}
// Prefer a position that can enter the perfect-foundation search so the cold
// call includes target generation; still record the chosen position explicitly.
const coldSample = samples.find(sample => {
  const grid = decodeBenchmarkGrid(sample.grid)
  const count = grid.reduce((total, row, y) => total + row.filter((color, x) =>
    color !== null && isInGTREvaluationRange(x, y)).length, 0)
  return GTRDetector.hasBasicPattern(grid) && count >= 13 && count <= 18
}) ?? samples[0]
// A cold call is reported apart from warmed measurements. Then alternate
// side order per position and round to avoid systematically favoring one.
const coldMs = [invoke(0, coldSample), invoke(1, coldSample)]
for (const sample of samples) { invoke(0, sample); invoke(1, sample) }
const elapsed: number[][] = [[], []]
for (let round = 0; round < 3; round++) for (const [index, sample] of samples.entries()) {
  const order = (round + index) % 2 ? [1, 0] : [0, 1]
  for (const side of order) elapsed[side].push(invoke(side, sample))
}
const summary = elapsed.map((times, side) => {
  times.sort((a, b) => a - b)
  return { importMs: [before.importMs, current.importMs][side], coldMs: coldMs[side],
    calls: times.length, medianMs: times[Math.floor(times.length / 2)],
    p95Ms: times[Math.ceil(times.length * .95) - 1], maxMs: times[times.length - 1] }
})
if (JSON.stringify(beforeHashes) !== JSON.stringify(sourceHashes(beforeDirectory)) ||
    JSON.stringify(currentHashes) !== JSON.stringify(sourceHashes(currentDirectory)) ||
    reportHash !== sha256(readFileSync(reportPath)) || harnessHash !== sha256(readFileSync(import.meta.filename))) {
  throw new Error('Source, harness, or input changed during measurement')
}
writeFileSync(outputPath, JSON.stringify({ version: 1, purpose: 'same-position continuous-guide latency',
  beforeDirectory, currentDirectory, reportPath, beforeHashes, currentHashes, harnessHash,
  reportHash, sampleHash, coldPosition: { gameIndex: coldSample.gameIndex, turn: coldSample.turn },
  positions: samples.map(({ gameIndex, turn }) => ({ gameIndex, turn })),
  warmup: 'one unmeasured call per sample per side after the separate cold call',
  rounds: 3, before: summary[0], current: summary[1] }, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ before: summary[0], current: summary[1] }))
