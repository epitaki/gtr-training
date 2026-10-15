import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolveChains, simulateTurn, applyGravity, isSpawnBlocked, cloneGrid, type PuyoGrid } from '../../src/game/core/ChainSimulator'
import { traceFoundation, inspectConnectedExtension, connectedOffset, followsTrigger } from '../../src/game/advisor/ConnectedExtension'
import { PuyoColor, type PuyoPair } from '../../src/game/core/types'

// A shape-fragment experiment, not a human replay or advisor benchmark.
const input = 'docs/research/gtr-multi-video-shapes-20261004.json'
const output = process.argv[2]
if (!output) throw new Error('Provide a new output JSON path')
const inputBytes = readFileSync(input)
const data = JSON.parse(inputBytes.toString('utf8')) as {
  derivedCondition: { baseRows: string[]; projectionOrigin: { x: number; y: number } }
  shapes: { id: string; sourceRank: number; digitRows: string[] }[]
}
const colorBySymbol: Record<string, PuyoColor> = { R: PuyoColor.RED, G: PuyoColor.GREEN, B: PuyoColor.BLUE, Y: PuyoColor.YELLOW }
const colors = Object.values(PuyoColor)
const symbols = (grid: PuyoGrid) => grid.map(row => row.map(c => c ? c[0].toUpperCase() : '.').join(''))
const base: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
for (const [i, row] of data.derivedCondition.baseRows.entries()) {
  if (row.length !== 6) throw new Error('Expected six columns')
  base[13 - data.derivedCondition.baseRows.length + i] = [...row].map(c => colorBySymbol[c] ?? null)
}
if (resolveChains(base).chainCount || applyGravity(base).moved) throw new Error('Unstable base')
const foundation = traceFoundation(base)
if (foundation?.chainCount !== 5) throw new Error('Expected five-chain foundation')
// A known project example checks that the provenance filter accepts a genuine
// upper clear followed by the original foundation, including the pair partner.
const controlGrid = cloneGrid(base)
controlGrid[9][0] = controlGrid[9][1] = controlGrid[9][2] = PuyoColor.BLUE
const controlPair: PuyoPair = { main: { color: PuyoColor.RED, x: 2, y: 1 }, sub: { color: PuyoColor.BLUE, x: 2, y: 0 }, rotation: 0, falling: true }
const control = simulateTurn(controlGrid, controlPair, { column: 0, rotation: 1 })
const controlOffset = connectedOffset(control.clearSteps, foundation)
const controlTriggers = new Set([control.landing!.mainPos, control.landing!.subPos].map(p => `${p.x}:${p.y}`))
if (!control.valid || control.chainCount !== 6 || !control.allClear || controlOffset !== 1 ||
    !followsTrigger(control.placedGrid, control.clearSteps, controlTriggers)) throw new Error('Connected control failed')
const permutations: PuyoColor[][] = []
for (const a of colors) for (const b of colors) for (const c of colors) for (const d of colors) {
  const palette = [a, b, c, d]
  if (new Set(palette).size === 4) permutations.push(palette)
}
const shapes = data.shapes.map(shape => {
  if (shape.digitRows.length !== 3 || shape.digitRows.some(row => !/^[1-4]{3}$/.test(row))) throw new Error(`Invalid shape ${shape.id}`)
  const variants = permutations.map(palette => {
    const grid = cloneGrid(base)
    const { x, y } = data.derivedCondition.projectionOrigin
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
      if (grid[y + dy][x + dx] !== null) throw new Error('Projection overlaps base')
      grid[y + dy][x + dx] = palette[Number(shape.digitRows[dy][dx]) - 1]
    }
    const preClear = resolveChains(grid)
    const stable = !preClear.chainCount && !applyGravity(grid).moved && !isSpawnBlocked(grid)
    const extension = stable ? inspectConnectedExtension(grid, foundation) : null
    const connectedFires = []
    let legalPairs = 0, clearingPairs = 0, disconnectedClears = 0
    if (stable) for (const main of colors) for (const sub of colors) {
      const pair: PuyoPair = { main: { color: main, x: 2, y: 1 }, sub: { color: sub, x: 2, y: 0 }, rotation: 0, falling: true }
      for (let rotation = 0; rotation < 4; rotation++) for (let column = 0; column < 6; column++) {
        const result = simulateTurn(grid, pair, { column, rotation })
        if (!result.valid) continue
        legalPairs++
        if (!result.chainCount) continue
        clearingPairs++
        const offset = connectedOffset(result.clearSteps, foundation)
        const triggers = new Set([result.landing!.mainPos, result.landing!.subPos].map(p => `${p.x}:${p.y}`))
        if (offset === null || !followsTrigger(result.placedGrid, result.clearSteps, triggers)) { disconnectedClears++; continue }
        connectedFires.push({ pair: main[0].toUpperCase() + sub[0].toUpperCase(), column, rotation,
          chainCount: result.chainCount, headSteps: offset, clearedPuyos: result.clearedPuyos,
          leftovers: result.stableGrid.flat().filter(Boolean).length,
          clearColors: result.clearSteps.map(step => [...new Set(step.clearedPuyos.map(p => p.color))]),
          stableRows: symbols(result.stableGrid) })
      }
    }
    return { palette: palette.map(c => c[0].toUpperCase()).join(''), rows: symbols(grid), stable,
      preClearChains: preClear.chainCount, singleColorTopProbe: extension,
      legalPairs, clearingPairs, disconnectedClears, connectedFires }
  })
  return { id: shape.id, sourceRank: shape.sourceRank, digitRows: shape.digitRows,
    summary: { stable: variants.filter(v => v.stable).length,
      topProbeConnected: variants.filter(v => v.singleColorTopProbe).length,
      pairConnected: variants.filter(v => v.connectedFires.length).length,
      pairExtended: variants.filter(v => v.connectedFires.some(f => f.headSteps > 0)).length }, variants }
})
const sourcePaths = ['src/game/core/ChainSimulator.ts', 'src/game/advisor/ConnectedExtension.ts', 'src/game/gtr/EvaluationRange.ts', 'scripts/human/verify-multi-video-shapes.ts']
const result = { version: 1, experiment: 'partial-color-shapes-on-project-foundation', input,
  inputSha256: createHash('sha256').update(inputBytes).digest('hex'),
  sourceSha256: Object.fromEntries(sourcePaths.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')])),
  baseRows: symbols(base), foundationChains: foundation.chainCount,
  positiveControl: { provenance: 'Project horizontal-three fixture; not a video transcription',
    beforeRows: symbols(controlGrid), pair: 'RB', column: 0, rotation: 1,
    chainCount: control.chainCount, foundationOffset: controlOffset, allClear: control.allClear },
  isHumanReplay: false, isCorrectMoveLabel: false, shapes }
writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify(shapes.map(({ id, summary }) => ({ id, ...summary }))))
