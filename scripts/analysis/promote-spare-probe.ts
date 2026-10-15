// Convert a saved experiment prefix to a normal fixed-index shard. The normal
// merger still verifies every replay and the final complete report.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import type { BenchmarkGameResult } from '../../src/benchmark/AdvisorBenchmark'

const [frozen, probePath, baselinePath, output] = process.argv.slice(2)
if (!frozen || !probePath || !baselinePath || !output) throw new Error('frozen probe baseline-report output-shard')
const codeHash = createHash('sha256').update(readFileSync(frozen)).digest('hex')
const probe = JSON.parse(readFileSync(probePath, 'utf8')) as { codeHash: string; start: number; end: number; games: BenchmarkGameResult[] }
const config = JSON.parse(readFileSync(baselinePath, 'utf8')).config
const engine = await import(pathToFileURL(resolve(frozen)).href) as typeof import('../../src/benchmark/AdvisorBenchmark')
engine.validateBenchmarkConfig(config)
if (probe.codeHash !== codeHash || config.modes.length !== 1 || config.modes[0] !== 'random' ||
    !Number.isInteger(probe.start) || !Number.isInteger(probe.end) || probe.start < 0 || probe.end > config.gamesPerMode ||
    probe.end <= probe.start || probe.games.length !== probe.end - probe.start ||
    probe.games.some((g, i) => g.gameIndex !== probe.start + i || g.mode !== 'random' || g.maxTurns !== config.maxTurns ||
      g.gameSeed !== engine.deriveBenchmarkGameSeed(config.seed, g.gameIndex) ||
      g.openingKind !== config.openingKinds[g.gameIndex % config.openingKinds.length])) throw new Error('Mismatched probe')
writeFileSync(output, JSON.stringify({ kind: 'advisor-range', codeHash, config,
  start: probe.start, end: probe.end, games: probe.games }, null, 2) + '\n', { flag: 'wx' })
console.log(`Saved verified-source shard ${probe.start}-${probe.end}: ${output}`)
