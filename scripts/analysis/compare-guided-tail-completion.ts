import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { decodeBenchmarkGrid } from '../../src/benchmark/AdvisorBenchmark'
import { isGuidedTailComplete } from '../../src/game/advisor/GuidedTail'
import { PlacementAdvisor } from '../../src/game/advisor/PlacementAdvisor'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'
import { rescoreContinuousReport, type ContinuousReport } from './compare-continuous-foundations'

const [beforePath, afterPath, output] = process.argv.slice(2)
if (!beforePath || !afterPath || !output || existsSync(output)) throw new Error('Expected before.json after.json new-output.json')
const inputs = [beforePath, afterPath].map(path => ({ path, raw: readFileSync(path, 'utf8') }))
const reports = inputs.map(input => JSON.parse(input.raw) as ContinuousReport)
if (JSON.stringify([reports[0].seed, reports[0].maxTurns, reports[0].openingKinds, reports[0].games.length]) !==
    JSON.stringify([reports[1].seed, reports[1].maxTurns, reports[1].openingKinds, reports[1].games.length])) throw new Error('Mixed conditions')
const hashes = captureAdvisorSourceHashes()
const sides = reports.map(report => {
  rescoreContinuousReport(report) // Validate all actual supply/physics before classifying.
  const games = report.games.map(game => {
    const openings = game.turns[0].visiblePairs.slice(0, 2).map(p => ({
      main: { color: p.main, x: 2, y: 1 }, sub: { color: p.sub, x: 2, y: 0 }, rotation: 0, falling: true,
    }))
    const plan = PlacementAdvisor.createTrainingPlan(openings[0], openings[1])
    const first = game.turns.find(turn => turn.placement && isGuidedTailComplete(decodeBenchmarkGrid(turn.gridAfter), plan))
    return { gameIndex: game.gameIndex, recordedTail: game.tail, guidedTailTurn: first?.turn ?? null }
  })
  return { summary: { games: games.length, recordedTail: games.filter(g => g.recordedTail).length,
    guidedTail: games.filter(g => g.guidedTailTurn !== null).length }, games }
})
const gained = sides[1].games.filter((g, i) => g.guidedTailTurn !== null && sides[0].games[i].guidedTailTurn === null).map(g => g.gameIndex)
const lost = sides[0].games.filter((g, i) => g.guidedTailTurn !== null && sides[1].games[i].guidedTailTurn === null).map(g => g.gameIndex)
if (JSON.stringify(hashes) !== JSON.stringify(captureAdvisorSourceHashes())) throw new Error('Source changed during classification')
const sha = (value: string) => createHash('sha256').update(value).digest('hex')
writeFileSync(output, JSON.stringify({ kind: 'guided-tail-reclassification', definition: 'guided-pending-head-v1',
  condition: 'Reclassify real saved boards under ONE classifier. Pending head is not an achieved fire. This does not rerun or change recommendations.',
  hashes, scriptSha256: sha(readFileSync(import.meta.filename, 'utf8')),
  inputs: inputs.map(i => ({ path: i.path, sha256: sha(i.raw) })), before: sides[0], after: sides[1], gained, lost }, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ before: sides[0].summary, after: sides[1].summary, gained, lost }))
