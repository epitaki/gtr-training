import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseBenchmarkReportJson } from '../../src/benchmark/BenchmarkReportValidation'
import { summarizeFoundationGames } from '../../src/benchmark/FoundationQuality'
import { aggregateBenchmarkGames } from '../../src/benchmark/AdvisorBenchmark'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'

const [beforePath, afterPath, output] = process.argv.slice(2)
if (!beforePath || !afterPath || !output) throw new Error('Expected before.json after.json new-output.json')
const before = parseBenchmarkReportJson(readFileSync(beforePath, 'utf8'), beforePath)
const after = parseBenchmarkReportJson(readFileSync(afterPath, 'utf8'), afterPath)
if (JSON.stringify(before.config) !== JSON.stringify(after.config)) throw new Error('Comparison conditions differ')
const oldGames = before.modes.flatMap(mode => mode.games), newGames = after.modes.flatMap(mode => mode.games)
if (oldGames.length !== newGames.length || oldGames.some((game, i) => game.mode !== newGames[i].mode ||
  game.gameIndex !== newGames[i].gameIndex || game.gameSeed !== newGames[i].gameSeed)) throw new Error('Game identities differ')
const oldSummary = summarizeFoundationGames(oldGames), newSummary = summarizeFoundationGames(newGames)
const result = { beforePath, afterPath, config: before.config,
  definitions: {
    foundation: 'Mask the foundation range BEFORE gravity/clear, then add the single specified trigger. Visited settled boards only; each game counts once.',
    perfect: 'Current unchanged UI score: whole-board 19 puyos required. A companion exception is not implemented.',
    denominator: 'All games for attainment rates. Conditional perfect rate uses only actual five-chain fires; denominator zero is null.',
    limitation: 'Rescoring saved games with one current detector is not a new simulation. Raised-edge participation is not proof of future avalanche flexibility.',
  },
  reportHashes: [beforePath, afterPath].map(path => createHash('sha256').update(readFileSync(path)).digest('hex')),
  evaluatorHashes: { ...captureAdvisorSourceHashes(),
    FoundationQuality: createHash('sha256').update(readFileSync(new URL('../../src/benchmark/FoundationQuality.ts', import.meta.url))).digest('hex') },
  before: { ...oldSummary, physical: aggregateBenchmarkGames(oldGames).metrics },
  after: { ...newSummary, physical: aggregateBenchmarkGames(newGames).metrics },
  changedFoundationFive: oldSummary.perGame.flatMap((game, i) => game.foundationFive === newSummary.perGame[i].foundationFive ? [] : [{
    mode: oldGames[i].mode, gameIndex: game.gameIndex, before: game.foundationFive, after: newSummary.perGame[i].foundationFive }]),
}
writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
for (const side of ['before', 'after'] as const) {
  const { perGame: _, ...summary } = result[side]
  console.log(JSON.stringify({ side, ...summary }))
}
