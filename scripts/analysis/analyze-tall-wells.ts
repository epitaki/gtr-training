// Same-position diagnostics; a legal low alternative is not proof that the
// entire game finishes. Keep the corresponding full-game comparisons.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseBenchmarkReportJson } from '../../src/benchmark/BenchmarkReportValidation'
import { decodeBenchmarkGrid } from '../../src/benchmark/AdvisorBenchmark'
import { inspectBoardSurface, surfaceShapeCost } from '../../src/game/advisor/BoardSurface'
import { inspectPairPlacementUse } from '../../src/game/advisor/PairPlacementUse'
import { simulateTurn, type PuyoGrid } from '../../src/game/core/ChainSimulator'
import type { PuyoColor, PuyoPair } from '../../src/game/core/types'
import type { PlacementAdvisor } from '../../src/game/advisor/PlacementAdvisor'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'

const [input, bundle, output, limitText = '250'] = process.argv.slice(2)
const limit = Number(limitText)
if (!input || !bundle || !output || !Number.isInteger(limit) || limit < 1) throw new Error('Expected report.json frozen-engine.js output.json [prefix-games=250]')
const bytes = readFileSync(input), source = readFileSync(bundle, 'utf8')
const report = parseBenchmarkReportJson(bytes.toString('utf8'), input)
if (report.modes.length !== 1 || report.modes[0].mode !== 'random' || limit > report.config.gamesPerMode) throw new Error('Invalid random prefix')
// Private frozen helpers are used only here, never imported by the game.
// Bun's unminified bundle preserves these names; fail if that contract changes.
if (!source.includes('function fit(') || !source.includes('function getTemplates(')) throw new Error('Expected unminified advisor bundle')
if (!source.includes('surfaceCost: goodFire ? 0 : node.root ? node.surfaceCost : surfaceShapeCost(outcome.stableGrid)')) {
  throw new Error('Expected pre-D terminal-reset bundle; its exact terminal score bands are used for this diagnosis')
}
interface Target { columns: PuyoColor[][]; shape: string; lowerCell?: { x: number; row: number } }
const engine = await import(`data:text/javascript;base64,${Buffer.from(source +
  '\nexport { PlacementAdvisor as DiagnosticAdvisor, fit as diagnosticFit, getTemplates as diagnosticTemplates };').toString('base64')}`) as {
  DiagnosticAdvisor: typeof PlacementAdvisor
  diagnosticFit: (grid: PuyoGrid, plans: Target[]) => { plans: Target[]; best: Target | null; hasHead: boolean }
  diagnosticTemplates: (a: PuyoColor, b: PuyoColor) => Target[]
}
const pairOf = (p: { main: PuyoColor; sub: PuyoColor }): PuyoPair => ({
  main: { color: p.main, x: 2, y: 1 }, sub: { color: p.sub, x: 2, y: 0 }, rotation: 0, falling: true,
})
const surface = (grid: PuyoGrid) => {
  const s = inspectBoardSurface(grid)
  return { ...s, cost: surfaceShapeCost(grid), tallWells: s.wellDepths.filter((d, x) =>
    d >= 3 && Math.min(s.heights[x - 1] ?? 0, s.heights[x + 1] ?? 0) >= 5).length }
}
const rows = []
let tallTurns = 0, saturatedTurns = 0, visibleFireTallTurns = 0
for (const game of report.modes[0].games.slice(0, limit)) {
  let savedFirstWell = false, savedFireWell = false
  for (const turn of game.turns) {
    if (turn.chainCount) continue
    const after = surface(decodeBenchmarkGrid(turn.gridAfter))
    if (!after.tallWells) continue
    tallTurns++
    if (after.cost === 90) saturatedTurns++
    const visibleFire = [109500, 109400, 109000, 108900].includes(turn.totalScore)
    if (visibleFire) visibleFireTallTurns++
    if (savedFirstWell && (!visibleFire || savedFireWell)) continue
    savedFirstWell = true
    if (visibleFire) savedFireWell = true
    const grid = decodeBenchmarkGrid(turn.gridBefore), pair = pairOf(turn.currentPair)
    const advice = engine.DiagnosticAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair,
      pairOf(turn.nextPair), pairOf(turn.nextNextPair), game.trainingPlan)
    const candidates = advice.allPlacements.map(candidate => {
      const result = simulateTurn(grid, pair, candidate.placement)
      const fit = result.chainCount ? null : engine.diagnosticFit(result.stableGrid,
        engine.diagnosticTemplates(game.trainingPlan.colorA, game.trainingPlan.colorB))
      const uses = fit?.plans.map(target => inspectPairPlacementUse(result.stableGrid, result.landing!, target, fit.hasHead)) ?? []
      return { placement: candidate.placement, score: candidate.totalScore, shape: candidate.tailShape,
        chains: result.chainCount, surface: surface(result.stableGrid), landing: result.landing,
        compatibleTargets: fit?.plans.length ?? 0,
        minimumUnassignedInOneCurrentTarget: uses.length ? Math.min(...uses.map(use => use.unassigned)) : null }
    })
    if (JSON.stringify(advice.bestPlacement?.placement) !== JSON.stringify(turn.placement)) throw new Error('Stored advice and frozen engine differ')
    rows.push({ gameIndex: game.gameIndex, turn: turn.turn, grid: turn.gridBefore, current: turn.currentPair,
      next: turn.nextPair, next2: turn.nextNextPair, plan: game.trainingPlan, before: surface(grid), after,
      visibleFire, candidates })
  }
}
const summary = { games: limit, inspectedPositions: rows.length, tallTurns, saturatedTurns, visibleFireTallTurns,
  equalScoreLowerSurface: rows.filter(row => row.candidates.some(c => c.chains === 0 &&
    c.score === row.candidates[0].score && c.surface.cost < row.after.cost)).map(row => ({ game: row.gameIndex, turn: row.turn })),
}
writeFileSync(output, `${JSON.stringify({ input, bundle, inputSha256: createHash('sha256').update(bytes).digest('hex'),
  bundleSha256: createHash('sha256').update(source).digest('hex'), sourceSha256: captureAdvisorSourceHashes(),
  notes: ['At most the first tall-well position and first tall-well visible-fire position per game.',
    'Roles refer to physically compatible CURRENT targets, not a union or proof of reaching them.',
    'The score band identifies a visible future fire in this frozen version, not an actual current fire.'], summary, rows }, null, 2)}\n`)
console.log(JSON.stringify(summary, null, 2))
