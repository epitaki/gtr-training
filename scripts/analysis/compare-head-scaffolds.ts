import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { decodeBenchmarkGrid } from '../../src/benchmark/AdvisorBenchmark'
import { coreHeadContactRisk, inspectHeadScaffold } from '../../src/game/advisor/HeadScaffold'
import { inspectConnectedExtension, traceFoundation } from '../../src/game/advisor/ConnectedExtension'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'
import { rescoreContinuousReport, type ContinuousReport } from './compare-continuous-foundations'

const [beforePath, afterPath, output] = process.argv.slice(2)
if (!beforePath || !afterPath || !output) throw new Error('usage: compare-head-scaffolds.ts before.json after.json new-output.json')
const hashes = captureAdvisorSourceHashes()
const inputs = [beforePath, afterPath].map(path => ({ path, raw: readFileSync(path, 'utf8') }))
const reports = inputs.map(input => JSON.parse(input.raw) as ContinuousReport)
if (JSON.stringify(reports.map(r => [r.seed, r.maxTurns, r.start, r.openingKinds, r.games.length])[0]) !==
    JSON.stringify(reports.map(r => [r.seed, r.maxTurns, r.start, r.openingKinds, r.games.length])[1])) throw new Error('Mixed conditions')
const sides = reports.map(report => {
  rescoreContinuousReport(report)
  const games = report.games.map(game => {
    let riskMoves = 0, scaffoldMoves = 0, pendingMoves = 0, maximumPending = 0, pendingRun = 0
    let episodes = 0, resolvedEpisodes = 0
    let waiting: { shape: string; color: string } | null = null
    for (const turn of game.turns) {
      if (!turn.placement) continue
      const grid = decodeBenchmarkGrid(turn.gridAfter)
      riskMoves += Number(coreHeadContactRisk(grid) > 0)
      const trace = traceFoundation(grid, 2), scaffold = trace ? inspectHeadScaffold(grid, trace) : null
      const connected = trace ? inspectConnectedExtension(grid, trace) : null
      scaffoldMoves += Number(!!scaffold)
      const pending = !!scaffold && !connected
      if (pending) {
        if (!waiting || waiting.shape !== scaffold.shape || waiting.color !== scaffold.color) {
          episodes++; pendingRun = 0; waiting = { shape: scaffold.shape, color: scaffold.color }
        }
        pendingMoves++; pendingRun++; maximumPending = Math.max(maximumPending, pendingRun)
      } else {
        if (waiting && scaffold && scaffold.shape === waiting.shape && scaffold.color === waiting.color &&
            scaffold.missing.length === 0 && connected && connected.headSteps > 0) resolvedEpisodes++
        waiting = null; pendingRun = 0
      }
    }
    return { gameIndex: game.gameIndex, riskMoves, scaffoldMoves, pendingMoves, maximumPending, episodes, resolvedEpisodes }
  })
  const sum = (key: 'riskMoves' | 'scaffoldMoves' | 'pendingMoves' | 'episodes' | 'resolvedEpisodes') => games.reduce((s, g) => s + g[key], 0)
  return { games, summary: { games: games.length, riskGames: games.filter(g => g.riskMoves).length, riskMoves: sum('riskMoves'),
    scaffoldGames: games.filter(g => g.scaffoldMoves).length, scaffoldMoves: sum('scaffoldMoves'), pendingMoves: sum('pendingMoves'),
    maximumPending: Math.max(...games.map(g => g.maximumPending)), episodes: sum('episodes'), resolvedEpisodes: sum('resolvedEpisodes') } }
})
if (JSON.stringify(hashes) !== JSON.stringify(captureAdvisorSourceHashes())) throw new Error('Source changed')
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
writeFileSync(output, JSON.stringify({ kind: 'head-scaffold-comparison', hashes,
  analysisSha256: sha(readFileSync(import.meta.filename, 'utf8')),
  definition: 'Risk = accessible early second-core clear. Pending = scaffold without same-color trigger potential. Resolution = same shape/color now keyed and connected; conditional only, never actual fire.',
  inputs: inputs.map(i => ({ path: i.path, sha256: sha(i.raw) })), before: sides[0], after: sides[1] }, null, 2), { flag: 'wx' })
console.log(JSON.stringify(sides.map(s => s.summary)))
