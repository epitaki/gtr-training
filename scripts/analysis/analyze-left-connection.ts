// Diagnose the existing switch and a deliberately unsafe no-gate counterfactual.
// Uses saved current/NEXT/NEXT2 only; does not alter the frozen engine on disk.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseBenchmarkReportJson } from '../../src/benchmark/BenchmarkReportValidation'
import { decodeBenchmarkGrid } from '../../src/benchmark/AdvisorBenchmark'
import { TailPlanner } from '../../src/game/advisor/TailPlanner'
import { FiveChainPlanner } from '../../src/game/advisor/FiveChainPlanner'
import { simulateTurn } from '../../src/game/core/ChainSimulator'
import type { PuyoPair } from '../../src/game/core/types'
import type { PlacementAdvisor } from '../../src/game/advisor/PlacementAdvisor'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'

const [input, bundle, output, candidateBundle] = process.argv.slice(2)
if (!input || !bundle || !output) throw new Error('Expected report.json frozen-before.js output.json [frozen-candidate.js]')
const bytes = readFileSync(input)
const report = parseBenchmarkReportJson(bytes.toString('utf8'), input)
if (report.modes.length !== 1 || report.modes[0].mode !== 'random') throw new Error('Expected random only')
const source = readFileSync(bundle, 'utf8')
const needle = 'trainingPlan && !needsLeftConnection ? FiveChainPlanner.rank('
if (source.split(needle).length !== 2) throw new Error('Expected exactly one frozen switch')
const noGate = await import(`data:text/javascript;base64,${Buffer.from(source.replace(needle,
  'trainingPlan ? FiveChainPlanner.rank(') + '\nexport { PlacementAdvisor as DiagnosticAdvisor };').toString('base64')}`) as { DiagnosticAdvisor: typeof PlacementAdvisor }
const candidateSource = candidateBundle ? readFileSync(candidateBundle, 'utf8') : null
const candidateEngine = candidateSource ? await import(`data:text/javascript;base64,${Buffer.from(candidateSource +
  '\nexport { PlacementAdvisor as DiagnosticAdvisor };').toString('base64')}`) as { DiagnosticAdvisor: typeof PlacementAdvisor } : null
const pairOf = (pair: { main: PuyoPair['main']['color']; sub: PuyoPair['sub']['color'] }): PuyoPair => ({
  main: { color: pair.main, x: 2, y: 1 }, sub: { color: pair.sub, x: 2, y: 0 }, rotation: 0, falling: true,
})
const rows = []
for (const game of report.modes[0].games) for (const turn of game.turns) {
  const grid = decodeBenchmarkGrid(turn.gridBefore)
  if (grid[12][2] !== null || !grid.slice(0, -4).some(row => row.some(Boolean))) continue
  const current = pairOf(turn.currentPair)
  const existing = TailPlanner.getPlans(grid, game.trainingPlan.colorB)
  const established = existing.filter(plan => plan.matchedChainCells >= 2)
  const advice = noGate.DiagnosticAdvisor.getAdvice({ grid, width: 6, height: 13 }, current,
    pairOf(turn.nextPair), pairOf(turn.nextNextPair), game.trainingPlan)
  const inspect = (placement: { column: number; rotation: number }) => {
    const result = simulateTurn(grid, current, placement)
    const after = TailPlanner.getPlans(result.stableGrid, game.trainingPlan.colorB)
    return { placement, chains: result.chainCount, gridAfter: result.stableGrid,
      connects: result.stableGrid[12][2] !== null,
      keepsEstablished: established.some(plan => after.some(next => next.shape === plan.shape && next.color === plan.color)),
      afterPlans: after.map(plan => ({ shape: plan.shape, color: plan.color, matched: plan.matchedChainCells })),
    }
  }
  const baseline = inspect(turn.placement)
  const withoutGate = advice.bestPlacement ? inspect(advice.bestPlacement.placement) : null
  const candidateAdvice = candidateEngine?.DiagnosticAdvisor.getAdvice({ grid, width: 6, height: 13 }, current,
    pairOf(turn.nextPair), pairOf(turn.nextNextPair), game.trainingPlan)
  const candidate = candidateAdvice?.bestPlacement ? inspect(candidateAdvice.bestPlacement.placement) : null
  rows.push({ gameIndex: game.gameIndex, turn: turn.turn, current: turn.currentPair,
    next: turn.nextPair, next2: turn.nextNextPair, grid,
    compatibleSkeleton: FiveChainPlanner.inspectCompletion(grid, game.trainingPlan),
    established: established.map(plan => ({ shape: plan.shape, color: plan.color, matched: plan.matchedChainCells })),
    baseline, withoutGate, noGateUsesSkeleton: (advice.bestPlacement?.totalScore ?? 0) >= 90000,
    changed: JSON.stringify(baseline.placement) !== JSON.stringify(withoutGate?.placement),
    ...(candidateEngine ? { candidate, candidateUsesSkeleton: (candidateAdvice?.bestPlacement?.totalScore ?? 0) >= 90000,
      candidateChanged: JSON.stringify(baseline.placement) !== JSON.stringify(candidate?.placement) } : {}),
  })
}
const summary = { positions: rows.length, games: new Set(rows.map(row => row.gameIndex)).size,
  establishedPositions: rows.filter(row => row.established.length).length,
  baselineBreaksEstablished: rows.filter(row => row.established.length && !row.baseline.keepsEstablished).map(row => ({ game: row.gameIndex, turn: row.turn })),
  changed: rows.filter(row => row.changed).map(row => ({ game: row.gameIndex, turn: row.turn,
    skeleton: row.noGateUsesSkeleton, beforeConnects: row.baseline.connects, afterConnects: row.withoutGate?.connects,
    beforeKeeps: row.baseline.keepsEstablished, afterKeeps: row.withoutGate?.keepsEstablished })),
  ...(candidateEngine ? {
    candidateSkeletonPositions: rows.filter(row => row.candidateUsesSkeleton).length,
    candidateChanged: rows.filter(row => row.candidateChanged).map(row => ({ game: row.gameIndex, turn: row.turn,
      skeleton: row.candidateUsesSkeleton, beforeConnects: row.baseline.connects, afterConnects: row.candidate?.connects,
      beforeKeeps: row.baseline.keepsEstablished, afterKeeps: row.candidate?.keepsEstablished })),
  } : {}),
}
writeFileSync(output, `${JSON.stringify({ input, bundle,
  inputSha256: createHash('sha256').update(bytes).digest('hex'),
  bundleSha256: createHash('sha256').update(source).digest('hex'), sourceSha256: captureAdvisorSourceHashes(),
  ...(candidateSource ? { candidateBundle, candidateSha256: createHash('sha256').update(candidateSource).digest('hex') } : {}),
  notes: ['Same-board counterfactuals are not full-game improvements.',
    'Established means at least two matched chain cells; shape compatibility alone does not prove a future actual fire.'],
  summary, rows }, null, 2)}\n`)
console.log(JSON.stringify(summary, null, 2))
