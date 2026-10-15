import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'
import { decodeHumanReplay, normalizeHumanPairs, humanGridKey } from '../../src/benchmark/HumanReplay'
import { PlacementAdvisor } from '../../src/game/advisor/PlacementAdvisor'
import { simulateTurn, type Placement, type PuyoGrid } from '../../src/game/core/ChainSimulator'

interface HumanComparisonRow {
  id: string; player: string; split: string; foldType: string; turn: number
  grid: string; pair: string[]; next: string[]; next2: string[]
  foldCompatible: boolean; human: Placement; advisor: Placement
  agreement: boolean; humanRank: number; scoreGap: number | null
  humanChigiri: number; advisorChigiri: number
}

const input = process.argv[4] ?? 'benchmarks/human/gtr-openings-v1.json'
const inputBytes = readFileSync(input)
const dataset = JSON.parse(inputBytes.toString('utf8')) as { records: {
  id: string; player: string; split: string; record: string; foldType?: string;
}[] }
// Record the code before the long measurement, not after a concurrent edit.
const codeSha256 = captureAdvisorSourceHashes()
const split = process.argv[2]
if (!['development', 'holdout', 'all'].includes(split)) throw new Error('Choose development, holdout or all')
const rows: HumanComparisonRow[] = []
const exclusions = []
for (const record of dataset.records.filter(row => split === 'all' || row.split === split)) {
  let grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
  const moves = decodeHumanReplay(record.record).slice(0, 14)
  const pairs = normalizeHumanPairs(moves)
  const training = PlacementAdvisor.createTrainingPlan(pairs[0], pairs[1])
  // No original video/opponent state is supplied to the advisor. Stop before
  // the first clear (tactics/garbage/seconds are outside this construction test).
  for (let i = 0; i < Math.min(12, pairs.length - 2); i++) {
    if (!moves[i].placement) { exclusions.push({ id: record.id, turn: i + 1, reason: 'unrecorded' }); break }
    const human = simulateTurn(grid, pairs[i], moves[i].placement!)
    if (!human.valid) throw new Error(`Invalid replay ${record.id} turn ${i + 1}`)
    if (human.chainCount) { exclusions.push({ id: record.id, turn: i + 1, reason: 'first_clear' }); break }
    const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, pairs[i], pairs[i + 1], pairs[i + 2], training)
    if (!advice.bestPlacement) throw new Error(`Missing recommendation ${record.id}`)
    const ranked = advice.allPlacements.map(candidate => ({
      candidate, result: simulateTurn(grid, pairs[i], candidate.placement),
    }))
    const selected = ranked.find(item => item.candidate === advice.bestPlacement)!
    const humanIndex = ranked.findIndex(item => humanGridKey(item.result.placedGrid) === humanGridKey(human.placedGrid))
    const unique = [...new Set(ranked.map(item => humanGridKey(item.result.placedGrid)))]
    const fold = PlacementAdvisor.getFoldPlan(grid, training)
    const chigiri = (landing: typeof human.landing) => landing && landing.mainPos.x !== landing.subPos.x
      ? Math.abs(landing.mainPos.y - landing.subPos.y) : 0
    rows.push({ id: record.id, player: record.player, split: record.split, foldType: record.foldType ?? 'unclassified', turn: i + 1,
      grid: humanGridKey(grid), pair: [pairs[i].main.color, pairs[i].sub.color],
      next: [pairs[i + 1].main.color, pairs[i + 1].sub.color], next2: [pairs[i + 2].main.color, pairs[i + 2].sub.color],
      foldCompatible: !!fold, human: moves[i].placement!, advisor: advice.bestPlacement.placement,
      agreement: humanGridKey(selected.result.placedGrid) === humanGridKey(human.placedGrid),
      humanRank: unique.indexOf(humanGridKey(human.placedGrid)) + 1,
      scoreGap: humanIndex < 0 ? null : advice.bestPlacement.totalScore - ranked[humanIndex].candidate.totalScore,
      humanChigiri: chigiri(human.landing), advisorChigiri: chigiri(selected.result.landing),
    })
    grid = human.stableGrid
  }
  if (process.env.HUMAN_PROGRESS === '1') console.error(`compared: ${record.id}, ${rows.length} decisions`)
}
const summarize = (subset: typeof rows) => ({ turns: subset.length,
  agreement: subset.filter(row => row.agreement).length,
  top3: subset.filter(row => row.humanRank > 0 && row.humanRank <= 3).length,
  humanChigiri: subset.reduce((n, row) => n + row.humanChigiri, 0),
  advisorChigiri: subset.reduce((n, row) => n + row.advisorChigiri, 0),
  humanSplitMoves: subset.filter(row => row.humanChigiri > 0).length,
  advisorSplitMoves: subset.filter(row => row.advisorChigiri > 0).length,
})
const report = { datasetSha256: createHash('sha256').update(inputBytes).digest('hex'),
  codeSha256,
  split, summary: summarize(rows), byPlayer: Object.fromEntries([...new Set(rows.map(row => row.player))]
    .map(player => [player, summarize(rows.filter(row => row.player === player))])),
  bySplit: Object.fromEntries([...new Set(rows.map(row => row.split))]
    .map(value => [value, summarize(rows.filter(row => row.split === value))])),
  byFold: Object.fromEntries([...new Set(rows.map(row => row.foldType))]
    .map(value => [value, summarize(rows.filter(row => row.foldType === value))])),
  compatible: summarize(rows.filter(row => row.foldCompatible)), exclusions, rows }
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ summary: report.summary, byPlayer: report.byPlayer, compatible: report.compatible, exclusions }, null, 2))
