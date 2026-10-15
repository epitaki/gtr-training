import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { decodeBenchmarkGrid } from '../../src/benchmark/AdvisorBenchmark'
import { findPerfectFoundationRoutes } from '../../src/game/advisor/PerfectFoundationPlanner'
import type { PuyoPair } from '../../src/game/core/types'
import type { ContinuousReport } from './compare-continuous-foundations'
import { rescoreContinuousReport } from './compare-continuous-foundations'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'

const [source, output] = process.argv.slice(2)
if (!source || !output || existsSync(output)) throw new Error('Expected source.json new-output.json')
const raw = readFileSync(source, 'utf8'), report: ContinuousReport = JSON.parse(raw)
rescoreContinuousReport(report)
const hashes = captureAdvisorSourceHashes(), opportunities = []
let maxElapsedMs = 0
for (const game of report.games) for (const turn of game.turns) {
  const pairs: PuyoPair[] = turn.visiblePairs.map(pair => ({ main: { color: pair.main, x: 2, y: 1 },
    sub: { color: pair.sub, x: 2, y: 0 }, rotation: 0, falling: true }))
  const started = performance.now()
  const routes = findPerfectFoundationRoutes(decodeBenchmarkGrid(turn.gridBefore), pairs)
  maxElapsedMs = Math.max(maxElapsedMs, performance.now() - started)
  if (routes.length) opportunities.push({ gameIndex: game.gameIndex, turn: turn.turn,
    board: turn.gridBefore, pairs: turn.visiblePairs, oldPlacement: turn.placement, routes })
}
if (JSON.stringify(hashes) !== JSON.stringify(captureAdvisorSourceHashes())) throw new Error('Sources changed')
const result = { kind: 'conditional-perfect-route-audit', source,
  sourceSha256: createHash('sha256').update(raw).digest('hex'), hashes,
  analysisSha256: createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex'),
  gamesWithOpportunities: new Set(opportunities.map(o => o.gameIndex)).size, maxElapsedMs, opportunities }
writeFileSync(output, JSON.stringify(result, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ opportunities: opportunities.length, games: result.gamesWithOpportunities,
  maxElapsedMs, sample: opportunities.slice(0, 3) }))
