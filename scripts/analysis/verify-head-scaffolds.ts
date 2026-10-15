import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { PuyoColor, type PuyoPair } from '../../src/game/core/types'
import { resolveChains, simulateTurn, findConnectedGroup, type PuyoGrid } from '../../src/game/core/ChainSimulator'
import { GTRDetector } from '../../src/game/gtr/GTRPatterns'
import { traceFoundation, inspectConnectedExtension } from '../../src/game/advisor/ConnectedExtension'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'

const fixtureUrl = new URL('../../docs/research/gtr-head-scaffolds-20260925.json', import.meta.url)
const fixtureText = readFileSync(fixtureUrl, 'utf8')
const data = JSON.parse(fixtureText) as {
  baseRows: string[]
  scaffolds: { id: string; rows: string[]; singleDrops: { column: number; color: string }[] }[]
  expectedScaffolds: { stableChains: number; noSingleDropChainAtLeast: number; setupDropChains: number;
    completedChains: number; completedLeftovers: number; clearColors: string[]; originalFoundationOffset: number }
  feedback: { rows: string[]; recordedMoves: { pair: string; column: number; rotation: number }[];
    hazardProbe: { pair: string; column: number; rotation: number; chains: number; firstClearColor: string;
      firstClearedOriginalCells: number[][] } }
}
function permutations<T>(values: T[]): T[][] {
  return values.length ? values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index))
    .map(tail => [value, ...tail])) : [[]]
}
const expected = data.expectedScaffolds
let scaffoldsChecked = 0, singleDropsChecked = 0, feedbacksChecked = 0
const diagnostics: { shape: string; recognizedBeforeKey: boolean; recognizedAfterKey: boolean; foundationChains: number }[] = []
const originalHashes = captureAdvisorSourceHashes()
for (const [colorIndex, colors] of permutations(Object.values(PuyoColor)).entries()) {
  const map = Object.fromEntries([... 'RGBY'].map((letter, index) => [letter, colors[index]]))
  const board = (rows: string[]): PuyoGrid => [...Array.from({ length: 13 - rows.length }, () => Array(6).fill(null)),
    ...rows.map(row => [...row].map(c => c === '.' ? null : map[c]))]
  const pair = (symbols: string): PuyoPair => ({ main: { x: 2, y: 1, color: map[symbols[0]] },
    sub: { x: 2, y: 0, color: map[symbols[1]] }, rotation: 0, falling: true })
  const drop = (grid: PuyoGrid, column: number, symbol: string): PuyoGrid => {
    const copy = structuredClone(grid), x = column - 1, top = copy.findIndex(row => row[x] !== null)
    const y = (top < 0 ? copy.length : top) - 1
    assert(y >= 0)
    copy[y][x] = map[symbol]
    return copy
  }
  const foundation = traceFoundation(board(data.baseRows))!
  assert(foundation)
  for (const fixture of data.scaffolds) {
    const grid = board(fixture.rows), original = structuredClone(grid)
    assert.equal(resolveChains(grid).chainCount, expected.stableChains)
    for (let column = 1; column <= 6; column++) for (const color of 'RGBY') {
      assert(resolveChains(drop(grid, column, color)).chainCount < expected.noSingleDropChainAtLeast)
      singleDropsChecked++
    }
    const [key, trigger] = fixture.singleDrops
    const keyed = drop(grid, key.column, key.color)
    assert.equal(resolveChains(keyed).chainCount, expected.setupDropChains)
    const result = resolveChains(drop(keyed, trigger.column, trigger.color))
    assert.equal(result.chainCount, expected.completedChains)
    assert.equal(result.stableGrid.flat().filter(Boolean).length, expected.completedLeftovers)
    assert.deepEqual(result.clearSteps.map(step => [...new Set(step.clearedPuyos.map(p => p.color))]),
      expected.clearColors.map(c => [map[c]]))
    for (const [index, originals] of foundation.steps.entries()) {
      const cleared = new Set(result.clearSteps[index + expected.originalFoundationOffset].clearedPuyos
        .flatMap(p => p.origin ? [`${p.origin.x}:${p.origin.y}`] : []))
      for (const origin of originals) assert(cleared.has(origin), `Lost original foundation cell ${origin}`)
    }
    assert.deepEqual(grid, original)
    if (colorIndex === 0) diagnostics.push({ shape: fixture.id,
      recognizedBeforeKey: inspectConnectedExtension(grid, foundation) !== null,
      recognizedAfterKey: inspectConnectedExtension(keyed, foundation) !== null,
      foundationChains: GTRDetector.detectGTR(grid).chainCount })
    scaffoldsChecked++
  }
  let grid = board([])
  for (const [index, move] of data.feedback.recordedMoves.entries()) {
    const before = structuredClone(grid)
    const outcome = simulateTurn(grid, pair(move.pair), { column: move.column - 1, rotation: move.rotation })
    assert(outcome.valid)
    assert.equal(outcome.chainCount, 0)
    assert.deepEqual(grid, before)
    grid = outcome.stableGrid
    if (index === 7) assert.equal(findConnectedGroup(grid, 1, 10).length, 2)
    if (index === 8) assert.equal(findConnectedGroup(grid, 1, 10).length, 3)
  }
  assert.deepEqual(grid, board(data.feedback.rows))
  assert.equal(GTRDetector.detectGTR(grid).chainCount, 4)
  const probe = data.feedback.hazardProbe
  const fired = simulateTurn(grid, pair(probe.pair), { column: probe.column - 1, rotation: probe.rotation })
  assert(fired.valid)
  assert.equal(fired.chainCount, probe.chains)
  assert.deepEqual([...new Set(fired.clearSteps[0].clearedPuyos.map(p => p.color))], [map[probe.firstClearColor]])
  for (const [column, height] of probe.firstClearedOriginalCells) {
    assert(fired.clearSteps[0].clearedPuyos.some(p => p.origin?.x === column - 1 && p.origin.y === 13 - height))
  }
  feedbacksChecked++
}
assert.deepEqual(captureAdvisorSourceHashes(), originalHashes)
const result = { kind: 'head-scaffold-shape-study', runtimeChanged: false,
  condition: 'Single-drop counterfactual shape checks, all 24 color permutations; not game success rates.',
  scaffoldsChecked, singleDropsChecked, feedbacksChecked, diagnostics,
  fixtureSha256: createHash('sha256').update(fixtureText).digest('hex'),
  scriptSha256: createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex'), hashes: originalHashes }
const output = process.argv[2]
if (output) writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ scaffoldsChecked, singleDropsChecked, feedbacksChecked, diagnostics }))
