import { describe, expect, it } from 'vitest'
import fixtures from '../../../docs/research/gtr-head-scaffolds-20260925.json'
import { PuyoColor, type PuyoPair } from '../core/types'
import { simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { ContinuousAdvisor } from './ContinuousAdvisor'
import { inspectConnectedExtension, traceFoundation } from './ConnectedExtension'
import { coreHeadContactRisk, inspectHeadScaffold } from './HeadScaffold'
import { GTRDetector } from '../gtr/GTRPatterns'

const permutations = <T>(items: T[]): T[][] => items.length ? items.flatMap((v, i) =>
  permutations(items.filter((_, at) => at !== i)).map(rest => [v, ...rest])) : [[]]
const colors = permutations(Object.values(PuyoColor))
function helpers(palette: PuyoColor[] = colors[0]) {
  const color = (c: string) => palette['RGBY'.indexOf(c)]
  const board = (rows: string[]): PuyoGrid => [...Array.from({ length: 13 - rows.length }, () => Array(6).fill(null)),
    ...rows.map(row => [...row].map(c => c === '.' ? null : color(c)))]
  const pair = (s: string): PuyoPair => ({ main: { color: color(s[0]), x: 2, y: 1 },
    sub: { color: color(s[1]), x: 2, y: 0 }, rotation: 0, falling: true })
  return { color, board, pair }
}

describe('head scaffold evidence, not scored foundation', () => {
  for (const [index, palette] of colors.entries()) it(`recognizes the three key waits and core contact risk, palette ${index}`, () => {
    const { board, color } = helpers(palette)
    const base = board(fixtures.baseRows), trace = traceFoundation(base)!
    for (const fixture of fixtures.scaffolds) {
      const grid = board(fixture.rows), snapshot = structuredClone(grid)
      expect(inspectConnectedExtension(grid, trace)).toBeNull()
      expect(inspectHeadScaffold(grid, trace)).toMatchObject({ shape: fixture.id, color: color('B'),
        chainCount: 6, realLeftovers: 0, missing: [{ position: { x: 0, y: fixture.id === 'left-high-L' ? 7 : 8 }, color: color('R') }] })
      expect(coreHeadContactRisk(grid)).toBe(0)
      expect(grid).toEqual(snapshot)
      expect(GTRDetector.detectGTR(grid).chainCount).toBe(5)
    }
    expect(coreHeadContactRisk(board(fixtures.feedback.rows))).toBeGreaterThan(0)
    expect(inspectHeadScaffold(board(fixtures.feedback.rows), trace)).toBeNull()
  })

  it('rejects blocked keys, floating heads, wrong fold colors, absent original cells and unrelated clears', () => {
    const { board, color } = helpers()
    const trace = traceFoundation(board(fixtures.baseRows))!
    for (const mutate of [
      (g: PuyoGrid) => { g[8][0] = color('Y') },
      (g: PuyoGrid) => { g[9][1] = null },
      (g: PuyoGrid) => { g[9][0] = color('G') },
      (g: PuyoGrid) => { g[12][5] = color('G') },
      (g: PuyoGrid) => { for (let y = 4; y < 8; y++) g[y][5] = color('Y') },
    ]) {
      const grid = board(fixtures.scaffolds[2].rows); mutate(grid)
      expect(inspectHeadScaffold(grid, trace)).toBeNull()
    }
    expect(inspectHeadScaffold([], trace)).toBeNull()
    expect(coreHeadContactRisk([])).toBe(0)
  })

  it('accepts two real cells but not a lone disconnected spare', () => {
    const { board, color } = helpers(), grid = board(fixtures.baseRows)
    const trace = traceFoundation(grid)!
    grid[9][0] = color('B')
    expect(inspectHeadScaffold(grid, trace)).toBeNull()
    grid[9][1] = color('B')
    expect(inspectHeadScaffold(grid, trace)?.missing).toHaveLength(2)
  })

  it('does not reduce core risk merely by covering the top of column two', () => {
    const { board, color } = helpers(), grid = board(fixtures.feedback.rows)
    const before = coreHeadContactRisk(grid)
    const top = grid.findIndex(row => row[1] !== null)
    grid[top - 1][1] = color('Y')
    expect(coreHeadContactRisk(grid)).toBe(before)
    grid[10][0] = null // Waiting for the left cap does not hide the same triple.
    expect(coreHeadContactRisk(grid)).toBe(before)
  })

  it.each([0, 6, 12, 18])('builds and then keys a head with actual pairs, palette %i', index => {
    const { board, pair } = helpers(colors[index])
    let grid = board(fixtures.baseRows)
    const trace = traceFoundation(grid)!
    const first = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair('BB'))
    expect(first.bestPlacement).not.toBeNull()
    const one = simulateTurn(grid, pair('BB'), first.bestPlacement!.placement)
    expect(one.chainCount).toBe(0)
    expect(inspectHeadScaffold(one.stableGrid, trace)).not.toBeNull()
    grid = one.stableGrid
    const second = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair('BR'))
    expect(second.bestPlacement).not.toBeNull()
    const two = simulateTurn(grid, pair('BR'), second.bestPlacement!.placement)
    expect(two.chainCount).toBe(0)
    expect(inspectConnectedExtension(two.stableGrid, trace)).toMatchObject({ headSteps: 1, chainCount: 6, realLeftovers: 0 })
    expect(GTRDetector.detectGTR(two.stableGrid).chainCount).toBe(5)
  })

  it('allows real non-clearing pair continuations while waiting for the differently colored key', () => {
    const { board, pair } = helpers()
    const grid = board(fixtures.scaffolds[2].rows), snapshot = structuredClone(grid)
    const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair('YY'))
    expect(advice.bestPlacement).not.toBeNull()
    const next = simulateTurn(grid, pair('YY'), advice.bestPlacement!.placement)
    expect(next.chainCount).toBe(0)
    expect(GTRDetector.detectGTR(next.stableGrid).chainCount).toBeGreaterThanOrEqual(5)
    expect(advice.phaseMessage).toContain('接続見込み')
    expect(advice.phaseMessage).toContain('赤')
    expect(grid).toEqual(snapshot)
  })
})
