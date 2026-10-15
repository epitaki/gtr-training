// Compare frozen engine bundles when moving files or separating responsibilities.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import type { BenchmarkConfig } from '../../src/benchmark/AdvisorBenchmark'

const [beforePath, afterPath, outputPath] = process.argv.slice(2)
if (!beforePath || !afterPath || !outputPath) {
  throw new Error('Usage: bun scripts/benchmark/compare-engine-behavior.ts before.js after.js output.json')
}
if ([beforePath, afterPath].some(path => resolve(path) === resolve(outputPath))) {
  throw new Error('Output must not overwrite an engine bundle')
}
type Engine = typeof import('../../src/benchmark/AdvisorBenchmark')
const before = await import(pathToFileURL(resolve(beforePath)).href) as Engine
const after = await import(pathToFileURL(resolve(afterPath)).href) as Engine
const config: BenchmarkConfig = {
  seed: 20260922,
  gamesPerMode: 21,
  maxTurns: 20,
  modes: ['random', 'adversarial'],
  openingKinds: ['AAAA', 'AAAB', 'AABB', 'ABAB', 'AABC', 'ABAC', 'ABCD'],
}
console.log('Comparing 42 games per engine, including all seven opening kinds...')
const beforeReport = before.runAdvisorBenchmark(config)
const afterReport = after.runAdvisorBenchmark(config)
if (!isDeepStrictEqual(beforeReport, afterReport)) {
  throw new Error('Engine behavior changed: traces, scores or aggregate results differ')
}
const games = beforeReport.modes.flatMap(mode => mode.games)
const fingerprint = (path: string) => ({
  path,
  sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
})
const summary = {
  config,
  before: fingerprint(beforePath),
  after: fingerprint(afterPath),
  identical: true,
  games: games.length,
  turns: games.reduce((sum, game) => sum + game.turns.length, 0),
  compared: ['full turn traces', 'placement scores', 'final boards', 'aggregate metrics'],
}
writeFileSync(outputPath, JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
