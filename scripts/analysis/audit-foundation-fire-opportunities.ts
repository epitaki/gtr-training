// Read-only counterfactual inspection of saved actual games. Opportunities are
// not attained games: this script never changes benchmark success denominators.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseBenchmarkReportJson } from '../../src/benchmark/BenchmarkReportValidation'
import { decodeBenchmarkGrid } from '../../src/benchmark/AdvisorBenchmark'
import { inspectFoundationGame } from '../../src/benchmark/FoundationQuality'
import { findVisibleMainFires } from '../../src/game/advisor/VisibleMainFireSearch'
import { createMainFireBaseline, analyzeCandidateFire } from '../../src/game/advisor/MainFireAnalysis'
import { PlacementAdvisor } from '../../src/game/advisor/PlacementAdvisor'
import { GTRDetector } from '../../src/game/gtr/GTRPatterns'
import type { PuyoPair } from '../../src/game/core/types'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'

const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Expected report.json new-output.json')
const report = parseBenchmarkReportJson(readFileSync(input, 'utf8'), input)
const opportunities = []
let inspected = 0
for (const game of report.modes.flatMap(mode => mode.games)) {
  if (!game.actualFire || game.maxIntendedChain < 5 || inspectFoundationGame(game).foundationFive) continue
  inspected++
  const turn = game.turns[Math.max(0, game.turns.length - 3)]
  const grid = decodeBenchmarkGrid(turn.gridBefore)
  const pairs: PuyoPair[] = [turn.currentPair, turn.nextPair, turn.nextNextPair].filter(p => p !== null).map(p => ({
    main: { color: p!.main, x: 2, y: 1 }, sub: { color: p!.sub, x: 2, y: 0 }, rotation: 0, falling: true,
  }))
  const fires = findVisibleMainFires(grid, pairs, (before, pair, outcome) => {
    if (GTRDetector.detectGTR(before).chainCount < 5) return null
    const baseline = createMainFireBaseline(before)
    if (!baseline || baseline.resolution.chainCount < 5) return null
    const fire = analyzeCandidateFire(pair, outcome, baseline)
    return fire.isIntendedMainFire && !fire.hasCollateralClear ? 'clean' : null
  })
  if (fires.size) opportunities.push({ mode: game.mode, gameIndex: game.gameIndex, turn: turn.turn,
    originalRoot: turn.placement, rootTailComplete: PlacementAdvisor.isAdaptiveTailComplete(grid, game.trainingPlan),
    fires: [...fires.entries()] })
}
const result = { input, reportHash: createHash('sha256').update(readFileSync(input)).digest('hex'),
  analysisHashes: {
    script: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
    FoundationQuality: createHash('sha256').update(readFileSync(new URL('../../src/benchmark/FoundationQuality.ts', import.meta.url))).digest('hex'),
  },
  evaluatorHashes: captureAdvisorSourceHashes(), inspected, opportunities,
  limitation: 'Same last three supplied pairs, settled foundation before actual fire. Alternative paths are opportunities, not measured successes; an earlier playable current fire may prevent taking a later path.' }
writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ inspected, opportunities }, null, 2))
