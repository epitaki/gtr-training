import { describe, expect, it } from 'vitest'
import fixture from '../../../docs/research/head-construction-feedback-20260926.json'
import { PuyoColor, type PuyoPair } from '../core/types'
import { resolveChains, simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { GTRDetector } from '../gtr/GTRPatterns'
import { ContinuousAdvisor } from './ContinuousAdvisor'
import { FiveChainPlanner } from './FiveChainPlanner'
import { inspectConnectedExtension, traceFoundation } from './ConnectedExtension'
import { inspectHeadScaffold } from './HeadScaffold'

const palette = Object.values(PuyoColor)
function helpers(shift = 0) {
  const color = (s: string) => palette[('RGBY'.indexOf(s) + shift) % 4]
  const board = (rows: string[]): PuyoGrid => [...Array.from({ length: 13 - rows.length }, () => Array(6).fill(null)),
    ...rows.map(row => [...row].map(c => c === '.' ? null : color(c)))]
  const pair = (s: string): PuyoPair => ({ main: { color: color(s[0]), x: 2, y: 1 },
    sub: { color: color(s[1]), x: 2, y: 0 }, rotation: 0, falling: true })
  const plan = { colorA: color('G'), colorB: color('R'), colorC: color('G'), colorD: color('R') }
  return { board, pair, color, plan }
}

describe('head construction while preserving the unfinished foundation', () => {
  it.each([0, 1, 2, 3])('allocates the spare double to a horizontal head, palette %i', shift => {
    const { board, pair, color, plan } = helpers(shift), grid = board(fixture.beforeSeventhRows)
    const original = structuredClone(grid)
    const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair('BB'), pair('YY'), pair('RG'), plan)
    const placed = simulateTurn(grid, pair('BB'), advice.bestPlacement!.placement)
    expect(placed.valid).toBe(true)
    expect(placed.chainCount).toBe(0)
    expect(placed.stableGrid[9].slice(0, 2)).toEqual([color('B'), color('B')])
    expect(placed.stableGrid.slice(10)).toEqual(grid.slice(10))
    expect(FiveChainPlanner.inspectCompletion(placed.stableGrid, plan, true)).not.toBeNull()
    expect(GTRDetector.detectGTR(placed.stableGrid).chainCount).toBeLessThan(5)
    expect(grid).toEqual(original)
  })

  it('replays the recorded moves and proves the alternate head without inventing a scored sixth link', () => {
    const { board, pair, color } = helpers()
    let recorded = board([]), alternative = board([])
    for (const [i, [column, rotation]] of fixture.placements.entries()) {
      recorded = simulateTurn(recorded, pair(fixture.pairs[i]), { column, rotation }).stableGrid
      const placement = i === 6 ? { column: 0, rotation: 1 } : i === 10 ? { column: 2, rotation: 0 } : { column, rotation }
      const result = simulateTurn(alternative, pair(fixture.pairs[i]), placement)
      expect(result.valid).toBe(true); expect(result.chainCount).toBe(0)
      alternative = result.stableGrid
    }
    expect(recorded).toEqual(board(fixture.recordedRows))
    expect(alternative).toEqual(board(fixture.horizontalRows))
    expect(GTRDetector.detectGTR(recorded)).toMatchObject({ chainCount: 5, totalScore: 100 })
    expect(GTRDetector.detectGTR(alternative)).toMatchObject({
      chainCount: 5, leftoverPuyos: 1, chainTailScore: 68, totalScore: 90, minimalFoundationComplete: false,
    })
    expect(inspectHeadScaffold(alternative, traceFoundation(recorded)!)).toMatchObject({
      shape: 'horizontal-three', chainCount: 6, realLeftovers: 0,
      missing: [{ position: { x: 0, y: 8 }, color: color('G') }],
    })
    alternative[8][0] = color('G')
    expect(resolveChains(alternative).chainCount).toBe(0)
    expect(inspectConnectedExtension(alternative, traceFoundation(recorded)!)).toMatchObject({ chainCount: 6, headSteps: 1, realLeftovers: 0 })
  })

  it.each([0, 1, 2, 3])('finishes the same five-chain with a lower horizontal head, palette %i', shift => {
    const { board, pair, color, plan } = helpers(shift), grid = board(fixture.beforeEleventhHorizontalRows)
    const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair('GB'), pair('RG'), pair('YB'), plan)
    const result = simulateTurn(grid, pair('GB'), advice.bestPlacement!.placement)
    expect(result.chainCount).toBe(0)
    expect(GTRDetector.detectGTR(result.stableGrid).chainCount).toBe(5)
    expect(result.stableGrid[9].slice(0, 3)).toEqual([color('B'), color('B'), color('B')])
    expect(advice.phaseMessage).toContain('横3')
  })

  it('keeps scaffold feasibility opt-in and rejects a wrong key or unsupported head', () => {
    const { board, color, plan } = helpers()
    const grid = board(fixture.beforeEleventhHorizontalRows)
    expect(FiveChainPlanner.inspectCompletion(grid, plan)).toBeNull()
    expect(FiveChainPlanner.inspectCompletion(grid, plan, true)).not.toBeNull()
    const wrong = structuredClone(grid); wrong[8][0] = color('Y')
    expect(FiveChainPlanner.inspectCompletion(wrong, plan, true)).toBeNull()
    const lone = structuredClone(grid); lone[9][1] = null
    expect(FiveChainPlanner.inspectCompletion(lone, plan, true)).toBeNull()
  })

  it('follows only the visible real pairs from empty through the horizontal head and its key', () => {
    const { board, pair, color, plan } = helpers()
    const supply = fixture.pairs.map(pair)
    let grid = board([])
    for (let i = 0; i < supply.length - 2; i++) {
      const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, supply[i], supply[i + 1], supply[i + 2], plan)
      expect(advice.bestPlacement).not.toBeNull()
      const result = simulateTurn(grid, supply[i], advice.bestPlacement!.placement)
      expect(result.valid).toBe(true); expect(result.chainCount).toBe(0)
      grid = result.stableGrid
      if (i === 6) expect(grid[9].slice(0, 2)).toEqual([color('B'), color('B')])
      if (i < 10) expect(GTRDetector.detectGTR(grid).chainCount).toBeLessThan(5)
      if (i === 10) expect(grid).toEqual(board(fixture.horizontalRows))
      if (i >= 10) expect(GTRDetector.detectGTR(grid).chainCount).toBe(5)
    }
    expect(grid[8][0]).toBe(color('G'))
    expect(inspectConnectedExtension(grid, traceFoundation(grid)!)).toMatchObject({ headSteps: 1, chainCount: 6 })
  })

  it('does not trade lower construction progress for a new spare head', () => {
    const { board, pair, color } = helpers()
    const grid = board(['R.B...', 'RRY.B.', 'YYB.G.'])
    const plan = { colorA: color('R'), colorB: color('Y'), colorC: color('R'), colorD: color('Y') }
    const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair('BB'), undefined, undefined, plan)
    const placed = simulateTurn(grid, pair('BB'), advice.bestPlacement!.placement)
    expect(placed.chainCount).toBe(0)
    expect(placed.stableGrid[9][0]).toBeNull()
  })
})
