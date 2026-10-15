// Fixed-index shards for large experiments. Use a frozen Bun bundle of
// AdvisorBenchmark.ts so concurrent edits cannot mix scoring versions.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { parseBenchmarkReportJson } from '../../src/benchmark/BenchmarkReportValidation'
import type { BenchmarkConfig, BenchmarkGameResult, BenchmarkReport } from '../../src/benchmark/AdvisorBenchmark'

const [command, modulePath, output, ...args] = process.argv.slice(2)
if (!['run', 'merge'].includes(command) || !modulePath || !output) {
  throw new Error('run <frozen-module> <output> <start> <end> <total> [seed] | merge <frozen-module> <output> <shards...>')
}
const frozenPath = resolve(modulePath)
const codeHash = createHash('sha256').update(readFileSync(frozenPath)).digest('hex')
const engine = await import(pathToFileURL(frozenPath).href) as typeof import('../../src/benchmark/AdvisorBenchmark')
interface Shard {
  kind: 'advisor-range'
  codeHash: string
  config: BenchmarkConfig
  start: number
  end: number
  games: BenchmarkGameResult[]
}
const save = (value: unknown) => {
  writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`)
  console.log(`saved: ${output}`)
}

if (command === 'run') {
  const [start, end, total, seed = 20260904] = args.map(Number)
  if (![3, 4].includes(args.length) || ![start, end, total, seed].every(Number.isInteger) || start < 0 || start >= end || end > total) {
    throw new Error('Invalid half-open game range')
  }
  const config: BenchmarkConfig = {
    seed, gamesPerMode: total, maxTurns: 20, modes: ['random'],
    openingKinds: ['AAAB', 'AABB', 'ABAB', 'ABAC', 'AABC', 'AAAA'],
  }
  engine.validateBenchmarkConfig(config)
  const games: BenchmarkGameResult[] = []
  for (let index = start; index < end; index++) {
    games.push(engine.runBenchmarkGame('random', index, engine.deriveBenchmarkGameSeed(config.seed, index),
      config.openingKinds[index % config.openingKinds.length], config.maxTurns))
    if ((index - start + 1) % 25 === 0) console.log(`range ${start}-${end}: ${index - start + 1}/${end - start}`)
  }
  save({ kind: 'advisor-range', codeHash, config, start, end, games } satisfies Shard)
} else {
  if (!args.length) throw new Error('No shards')
  const shards: Shard[] = args.map(path => JSON.parse(readFileSync(path, 'utf8')))
    .sort((a, b) => a.start - b.start)
  // gamesPerMode is only an outer loop bound: fixed game indices keep the
  // same seed/opening. Reuse a completed 500-game prefix when extending to
  // 1,000, while still requiring one code hash and identical game conditions.
  const config = { ...shards[0].config, gamesPerMode: Math.max(...shards.map(shard => shard.config.gamesPerMode)) }
  engine.validateBenchmarkConfig(config)
  let expectedStart = 0
  for (const shard of shards) {
    engine.validateBenchmarkConfig(shard.config)
    if (shard.kind !== 'advisor-range' || shard.codeHash !== codeHash ||
        JSON.stringify({ ...shard.config, gamesPerMode: config.gamesPerMode }) !== JSON.stringify(config) ||
        !Number.isInteger(shard.start) || !Number.isInteger(shard.end) || shard.end > shard.config.gamesPerMode ||
        shard.start !== expectedStart || shard.games.length !== shard.end - shard.start || shard.end <= shard.start ||
        shard.games.some((game, index) => game.gameIndex !== shard.start + index)) throw new Error('Mismatched, missing or duplicate shard')
    expectedStart = shard.end
  }
  if (expectedStart !== config.gamesPerMode) throw new Error('Incomplete benchmark')
  const games = shards.flatMap(shard => shard.games)
  const aggregate = engine.aggregateBenchmarkGames(games)
  const report: BenchmarkReport = {
    version: engine.BENCHMARK_VERSION, config, overall: aggregate,
    modes: [{ mode: 'random', ...aggregate, games,
      byOpening: Object.fromEntries(config.openingKinds.map(kind => [kind,
        engine.aggregateBenchmarkGames(games.filter(game => game.openingKind === kind))])),
    }],
  }
  // Validate every stored transition, queue and aggregate before publishing.
  parseBenchmarkReportJson(JSON.stringify(report), output)
  save(report)
  console.log(JSON.stringify(report.overall, null, 2))
}
