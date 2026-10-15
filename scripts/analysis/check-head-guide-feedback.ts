import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { ContinuousAdvisor } from '../../src/game/advisor/ContinuousAdvisor'
import { coreHeadContactRisk, inspectHeadScaffold } from '../../src/game/advisor/HeadScaffold'
import { traceFoundation } from '../../src/game/advisor/ConnectedExtension'
import { GTRDetector } from '../../src/game/gtr/GTRPatterns'
import { PuyoColor, type PuyoPair } from '../../src/game/core/types'
import { simulateTurn, type PuyoGrid } from '../../src/game/core/ChainSimulator'
import fixtures from '../../docs/research/gtr-head-scaffolds-20260925.json'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'

const [beforePath, output] = process.argv.slice(2)
if (!beforePath || !output) throw new Error('usage: check-head-guide-feedback.ts frozen-before.js new-output.json')
const before = (await import(pathToFileURL(resolve(beforePath)).href)).ContinuousAdvisor as typeof ContinuousAdvisor
const colors = [PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW]
const color = (s: string) => colors['RGBY'.indexOf(s)]
const board = (rows: string[]): PuyoGrid => [...Array.from({ length: 13 - rows.length }, () => Array(6).fill(null)),
  ...rows.map(row => [...row].map(c => c === '.' ? null : color(c)))]
const pair = (s: string): PuyoPair => ({ main: { color: color(s[0]), x: 2, y: 1 }, sub: { color: color(s[1]), x: 2, y: 0 }, rotation: 0, falling: true })
const summary = (grid: PuyoGrid, pairs: PuyoPair[], advisor: typeof ContinuousAdvisor) => {
  const a = advisor.getAdvice({ grid, width: 6, height: 13 }, pairs[0], pairs[1], pairs[2],
    { colorA: grid[10][0] ?? PuyoColor.YELLOW, colorB: grid[10][1] ?? PuyoColor.BLUE, colorC: PuyoColor.YELLOW, colorD: PuyoColor.BLUE })
  const placement = a.bestPlacement?.placement
  const result = placement ? simulateTurn(grid, pairs[0], placement) : null
  const stable = result?.stableGrid ?? grid, trace = traceFoundation(stable, 2)
  return { placement, message: a.phaseMessage, chains: result?.chainCount, evaluation: GTRDetector.detectGTR(stable),
    risk: coreHeadContactRisk(stable), scaffold: trace ? inspectHeadScaffold(stable, trace) : null,
    rows: stable.map(row => row.map(c => c ? c[0].toUpperCase() : '.').join('')) }
}
const hashes = captureAdvisorSourceHashes()
const supply = [...fixtures.feedback.recordedMoves.map(m => m.pair), ...fixtures.feedback.visiblePairs].map(pair)
let grid = board([])
const replay = fixtures.feedback.recordedMoves.map((move, i) => {
  const result = { turn: i + 1, before: summary(grid, supply.slice(i, i + 3), before),
    after: summary(grid, supply.slice(i, i + 3), ContinuousAdvisor) }
  const outcome = simulateTurn(grid, supply[i], { column: move.column - 1, rotation: move.rotation })
  if (!outcome.valid || outcome.chainCount) throw new Error('Invalid recorded replay')
  grid = outcome.stableGrid
  return result
})
if (JSON.stringify(grid) !== JSON.stringify(board(fixtures.feedback.rows))) throw new Error('Feedback replay mismatch')
const runs = [before, ContinuousAdvisor].map(advisor => {
  let grid = board([])
  const turns = []
  for (let i = 0; i < supply.length - 2; i++) {
    const result = summary(grid, supply.slice(i, i + 3), advisor)
    turns.push({ turn: i + 1, ...result })
    if (!result.placement) break
    const outcome = simulateTurn(grid, supply[i], result.placement)
    if (!outcome.valid || outcome.chainCount) throw new Error('Unsafe guided replay')
    grid = outcome.stableGrid
  }
  return turns
})
const shapes = fixtures.scaffolds.map(f => ({ id: f.id,
  before: summary(board(f.rows), [pair('YY')], before), after: summary(board(f.rows), [pair('YY')], ContinuousAdvisor) }))
if (JSON.stringify(hashes) !== JSON.stringify(captureAdvisorSourceHashes())) throw new Error('Source changed')
writeFileSync(output, JSON.stringify({ hashes, analysisSha256: createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex'),
  fixtureSha256: createHash('sha256').update(readFileSync(new URL('../../docs/research/gtr-head-scaffolds-20260925.json', import.meta.url))).digest('hex'),
  beforeSha256: createHash('sha256').update(readFileSync(beforePath)).digest('hex'),
  replay, runs, shapes }, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ changedRecordedTurns: replay.filter(r => JSON.stringify(r.before.placement) !== JSON.stringify(r.after.placement)).map(r => r.turn),
  runs: runs.map(r => r.map(t => ({ turn: t.turn, placement: t.placement, risk: t.risk, head: t.scaffold?.shape }))),
  shapes: shapes.map(s => ({ shape: s.id, before: s.before.placement, after: s.after.placement })) }))
