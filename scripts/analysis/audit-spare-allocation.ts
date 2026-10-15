import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { decodeBenchmarkGrid } from '../../src/benchmark/AdvisorBenchmark'
import { GamePhase, type PlacementScore } from '../../src/game/advisor/types'
import { traceFoundation, inspectConnectedExtension } from '../../src/game/advisor/ConnectedExtension'
import { preferRecoverableSpare } from '../../src/game/advisor/SpareAllocation'
import { simulateTurn, isSpawnBlocked } from '../../src/game/core/ChainSimulator'
import type { PuyoPair } from '../../src/game/core/types'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'
import { rescoreContinuousReport, type ContinuousReport } from './compare-continuous-foundations'

const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('usage: audit-spare-allocation.ts before-continuous.json new-output.json')
const raw = readFileSync(input, 'utf8'), report = JSON.parse(raw) as ContinuousReport
rescoreContinuousReport(report)
const hashes = captureAdvisorSourceHashes()
const placements = Array.from({ length: 24 }, (_, i) => ({ column: i % 6, rotation: Math.floor(i / 6) }))
const cases = []
for (const game of report.games) for (const turn of game.turns) {
  if (!turn.placement || !('evaluation' in turn) || !turn.evaluation?.hasBasicPattern || turn.evaluation.chainCount >= 5) continue
  const grid = decodeBenchmarkGrid(turn.gridBefore)
  const pair: PuyoPair = { main: { color: turn.visiblePairs[0].main, x: 2, y: 1 },
    sub: { color: turn.visiblePairs[0].sub, x: 2, y: 0 }, rotation: 0, falling: true }
  const candidates: PlacementScore[] = []
  for (const placement of [turn.placement, ...placements]) {
    const result = simulateTurn(grid, pair, placement)
    if (!result.valid || !result.landing || result.chainCount || isSpawnBlocked(result.stableGrid)) continue
    candidates.push({ placement, landing: result.landing, immediateChainCount: 0, clearedPuyos: 0,
      isIntendedMainFire: false, hasCollateralClear: false, intendedMainChainCount: 0, intendedMainClearedPuyos: 0,
      totalScore: 0, phase: GamePhase.COMPLETION })
  }
  const selected = preferRecoverableSpare(grid, pair, candidates)
  if (!selected) continue
  const after = simulateTurn(grid, pair, selected.placement).stableGrid
  const original = decodeBenchmarkGrid(turn.gridAfter), trace = traceFoundation(original, 2)!
  const rows = (grid: ReturnType<typeof decodeBenchmarkGrid>) => grid.map(row => row.map(c => c?.[0].toUpperCase() ?? '.').join(''))
  cases.push({ game: game.gameIndex, turn: turn.turn, rows: rows(grid), pairs: turn.visiblePairs,
    before: { placement: turn.placement, connection: inspectConnectedExtension(original, trace) },
    after: { placement: selected.placement, connection: inspectConnectedExtension(after, trace), rows: rows(after) } })
}
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
if (JSON.stringify(hashes) !== JSON.stringify(captureAdvisorSourceHashes())) throw new Error('Source changed')
writeFileSync(output, JSON.stringify({ hashes, inputSha256: sha(raw), analysisSha256: sha(readFileSync(import.meta.filename, 'utf8')),
  kind: 'counterfactual-spare-allocation-opportunities-not-achievements', cases }, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ count: cases.length, examples: cases.slice(0, 8) }))
