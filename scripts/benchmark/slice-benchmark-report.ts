// Reuse an explicitly selected prefix of a validated larger measurement.
// Reaggregate; never relabel a 1,000-game average as a 500-game result.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { aggregateBenchmarkGames, type BenchmarkReport } from '../../src/benchmark/AdvisorBenchmark'
import { parseBenchmarkReportJson } from '../../src/benchmark/BenchmarkReportValidation'

const [sourcePath, output, countText] = process.argv.slice(2)
const count = Number(countText)
if (!sourcePath || !output || !Number.isInteger(count) || count <= 0) {
  throw new Error('Expected source.json new-prefix.json gamesPerMode')
}
if (existsSync(output)) throw new Error('Output already exists; choose a new filename')
const source = parseBenchmarkReportJson(readFileSync(sourcePath, 'utf8'), sourcePath)
if (count > source.config.gamesPerMode) throw new Error('Prefix exceeds source sample size')
const modes = source.modes.map(mode => {
  const games = mode.games.slice(0, count)
  return { mode: mode.mode, games, ...aggregateBenchmarkGames(games),
    byOpening: Object.fromEntries(source.config.openingKinds.map(kind => [kind,
      aggregateBenchmarkGames(games.filter(game => game.openingKind === kind))])),
  }
})
const report: BenchmarkReport = {
  version: source.version, config: { ...source.config, gamesPerMode: count }, modes,
  overall: aggregateBenchmarkGames(modes.flatMap(mode => mode.games)),
}
const serialized = JSON.stringify(report, null, 2) + '\n'
parseBenchmarkReportJson(serialized, output)
writeFileSync(output, serialized)
console.log(JSON.stringify({ source: sourcePath, output, indices: `0..${count - 1}`, metrics: report.overall.metrics }, null, 2))
