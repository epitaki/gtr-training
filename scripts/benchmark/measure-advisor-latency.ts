import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseBenchmarkReportJson } from '../../src/benchmark/BenchmarkReportValidation'
import { decodeBenchmarkGrid } from '../../src/benchmark/AdvisorBenchmark'
import type { PlacementAdvisor } from '../../src/game/advisor/PlacementAdvisor'

const [before, after, reportPath, output] = process.argv.slice(2)
if (!before || !after || !reportPath || !output) throw new Error('Expected before.js after.js report.json output.json')
async function load(path: string): Promise<typeof PlacementAdvisor> {
  const code = readFileSync(path, 'utf8')
  if (!code.includes('class PlacementAdvisor {')) throw new Error('Unsupported frozen bundle')
  // Expose the frozen scorer in memory only; never rewrite archived bundles.
  const module = await import(`data:text/javascript;base64,${Buffer.from(`${code}\nexport { PlacementAdvisor };`).toString('base64')}`)
  return module.PlacementAdvisor
}
const scorers = [await load(before), await load(after)]
const report = parseBenchmarkReportJson(readFileSync(reportPath, 'utf8'), reportPath)
// Fixed sample, mixing opening, tail construction, and firing wait positions.
const samples = report.modes[0].games.slice(0, 20).flatMap(game => [0, 7, 12].flatMap(index => {
  const turn = game.turns[index]
  return turn ? [{ gameIndex: game.gameIndex, turn, plan: game.trainingPlan }] : []
}))
const pair = (p: { main: import('../../src/game/core/types').PuyoColor; sub: import('../../src/game/core/types').PuyoColor }) =>
  ({ main: { color: p.main, x: 2, y: 1 }, sub: { color: p.sub, x: 2, y: 0 }, rotation: 0, falling: true })
function run(scorer: typeof PlacementAdvisor, sample: typeof samples[number]) {
  return scorer.getAdvice({ grid: decodeBenchmarkGrid(sample.turn.gridBefore), width: 6, height: 13 },
    pair(sample.turn.currentPair), pair(sample.turn.nextPair), pair(sample.turn.nextNextPair), sample.plan)
}
for (const scorer of scorers) for (const sample of samples) run(scorer, sample)
const elapsed: number[][] = [[], []]
for (let round = 0; round < 3; round++) for (const [index, sample] of samples.entries()) {
  for (const side of (round + index) % 2 ? [1, 0] : [0, 1]) {
    const start = performance.now(); run(scorers[side], sample); elapsed[side].push(performance.now() - start)
  }
}
const summary = elapsed.map(values => {
  values.sort((a, b) => a - b)
  return { samples: values.length, medianMs: values[Math.floor(values.length / 2)], p95Ms: values[Math.ceil(values.length * 0.95) - 1] }
})
const result = { before, after, reportPath,
  hashes: [before, after].map(path => createHash('sha256').update(readFileSync(path)).digest('hex')),
  positions: samples.map(sample => [sample.gameIndex, sample.turn.turn]), rounds: 3,
  summary, p95Ratio: summary[1].p95Ms / summary[0].p95Ms }
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result.summary)); console.log(`p95 ratio: ${result.p95Ratio}`)
