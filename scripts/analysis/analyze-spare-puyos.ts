import { readFileSync, writeFileSync } from 'node:fs'
import { parseBenchmarkReportJson } from '../../src/benchmark/BenchmarkReportValidation'
import { summarizeSparePuyos } from '../../src/benchmark/SparePuyoAnalysis'

const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Expected report.json output.json')
const report = parseBenchmarkReportJson(readFileSync(input, 'utf8'), input)
const analyses = report.modes.map(mode => ({ mode: mode.mode,
  allMainFires: summarizeSparePuyos(mode.games),
  fivePlus: summarizeSparePuyos(mode.games.filter(game => game.maxIntendedChain >= 5)),
  // Non-fired games are reported separately, never credited as zero leftovers.
  nonFired: mode.games.filter(game => !game.actualFire).map(game => ({
    gameIndex: game.gameIndex, remaining: game.finalGrid.replace(/\./g, '').length,
    failureReason: game.failureReason,
  })),
}))
writeFileSync(output, `${JSON.stringify({ input, config: report.config, analyses }, null, 2)}\n`)
console.log(JSON.stringify(analyses.map(({ mode, allMainFires: { residuals: _a, ...all }, fivePlus: { residuals: _b, ...five } }) => ({ mode, all, five }))))
