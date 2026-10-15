import { describe, expect, it } from 'vitest'
import { PuyoColor, type PuyoPair } from '../core/types'
import { simulateTurn, type Placement, type PuyoGrid } from '../core/ChainSimulator'
import { createGTREvaluationGrid } from '../gtr/EvaluationRange'
import { GTRDetector } from '../gtr/GTRPatterns'
import { GamePhase, type PlacementScore } from './types'
import { preferRecoverableSpare } from './SpareAllocation'
import { inspectConnectedExtension, traceFoundation } from './ConnectedExtension'
import { ContinuousAdvisor } from './ContinuousAdvisor'

function fixture(shift = 0) {
  const colors = [PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW]
  const color = (c: string) => colors[('RGBY'.indexOf(c) + shift) % 4]
  const board = (rows: string[]): PuyoGrid => [...Array.from({ length: 13 - rows.length }, () => Array(6).fill(null)),
    ...rows.map(row => [...row].map(c => c === '.' ? null : color(c)))]
  const pair = (s: string): PuyoPair => ({ main: { color: color(s[0]), x: 2, y: 1 },
    sub: { color: color(s[1]), x: 2, y: 0 }, rotation: 0, falling: true })
  const candidates = (grid: PuyoGrid, current: PuyoPair, placements: Placement[]): PlacementScore[] => placements.map(placement => {
    const result = simulateTurn(grid, current, placement)
    return { placement, landing: result.landing!, immediateChainCount: result.chainCount, clearedPuyos: result.clearedPuyos,
      isIntendedMainFire: false, hasCollateralClear: false, intendedMainChainCount: 0, intendedMainClearedPuyos: 0,
      phase: GamePhase.COMPLETION, totalScore: 0 }
  })
  return { board, pair, candidates }
}

describe('same-foundation spare allocation', () => {
  it.each([0, 1, 2, 3])('uses a connected head instead of an unused column-two companion, palette +%i', shift => {
    const { board, pair, candidates } = fixture(shift)
    // Saved game 165 before turn 11, with a three-chain foundation.
    const grid = board(['..B...', '.BYB..', 'YRBGB.', 'YYRBB.', 'RRBYGB'])
    const current = pair('YB'), original = structuredClone(grid)
    const ranked = candidates(grid, current, [{ column: 1, rotation: 2 }, { column: 0, rotation: 2 }])
    expect(preferRecoverableSpare(grid, current, ranked)).toBe(ranked[1])
    const before = simulateTurn(grid, current, ranked[0].placement).stableGrid
    const after = simulateTurn(grid, current, ranked[1].placement)
    expect(after.chainCount).toBe(0)
    expect(createGTREvaluationGrid(after.stableGrid)).toEqual(createGTREvaluationGrid(before))
    expect(GTRDetector.detectGTR(after.stableGrid).chainCount).toBe(3)
    const trace = traceFoundation(before, 2)!
    expect(inspectConnectedExtension(before, trace)).toMatchObject({ realLeftovers: 8, needed: 1 })
    expect(inspectConnectedExtension(after.stableGrid, trace)).toMatchObject({ headSteps: 1, chainCount: 4, realLeftovers: 6, needed: 1 })
    expect(grid).toEqual(original)
    expect(preferRecoverableSpare(grid, current, [...ranked].reverse())).toBeNull()
  })

  it.each([0, 1, 2, 3])('recovers tail companions while leaving the original entrance open, palette +%i', shift => {
    const { board, pair, candidates } = fixture(shift)
    const grid = board(['.YRB..', '.RRY..', '.BBYBY', '.GYRYY', 'RGYRRG', 'RRGYYR', 'GGYGGR'])
    const current = pair('YG')
    const ranked = candidates(grid, current, [{ column: 4, rotation: 1 }, { column: 5, rotation: 2 }])
    expect(preferRecoverableSpare(grid, current, ranked)).toBe(ranked[1])
    const after = simulateTurn(grid, current, ranked[1].placement).stableGrid
    expect(after[9][0]).toBeNull()
    expect(inspectConnectedExtension(after, traceFoundation(after, 2)!)).toMatchObject({ headSteps: 0, realLeftovers: 1 })
  })

  it('does not spend foundation cells, accept a clear, or invent a use for an isolated spare', () => {
    const { board, pair, candidates } = fixture()
    const grid = board(['.B....', '.B....', 'RGYBB.', 'RRGYYB', 'GGYRRB'])
    const current = pair('BR')
    // Only the left head has verified extra recovery; other lower-board targets
    // must not be substituted by this secondary preference.
    const ranked = candidates(grid, current, [{ column: 1, rotation: 0 }, { column: 4, rotation: 0 }])
    expect(preferRecoverableSpare(grid, current, ranked)).toBeNull()
    const clearing = pair('BB')
    expect(preferRecoverableSpare(grid, clearing, candidates(grid, clearing, [{ column: 1, rotation: 0 }]))).toBeNull()
    expect(preferRecoverableSpare(board([]), current, candidates(board([]), current, [{ column: 0, rotation: 0 }]))).toBeNull()
    expect(preferRecoverableSpare(grid, current, [])).toBeNull()
  })

  it('keeps a currently available foundation completion ahead of upstairs recovery', () => {
    const { board, pair } = fixture()
    const grid = board(['.B....', '.B....', 'RGYBB.', 'RRGYYB', 'GGYRRB'])
    const current = pair('RR')
    const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, current, pair('BR'), pair('GG'))
    expect(advice.bestPlacement).not.toBeNull()
    const after = simulateTurn(grid, current, advice.bestPlacement!.placement)
    expect(after.chainCount).toBe(0)
    expect(GTRDetector.detectGTR(after.stableGrid).chainCount).toBe(5)
  })

  it.each([0, 1, 2, 3])('the actual guide can choose the head before foundation five, palette +%i', shift => {
    const { board, pair } = fixture(shift)
    const grid = board(['..B...', '.BYB..', 'YRBGB.', 'YYRBB.', 'RRBYGB'])
    const fold = pair('YR')
    const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair('YB'), pair('YB'), pair('BB'),
      { colorA: fold.main.color, colorB: fold.sub.color, colorC: fold.main.color, colorD: fold.sub.color })
    expect(advice.bestPlacement?.placement).toEqual({ column: 0, rotation: 2 })
    expect(advice.phaseMessage).toContain('相方')
    expect(simulateTurn(grid, pair('YB'), advice.bestPlacement!.placement).chainCount).toBe(0)
  })

  it('does not abandon a compatible completion recipe for a hypothetical recovery gain', () => {
    const { board, pair, candidates } = fixture()
    // Saved game 44 has a viable unfinished five-chain target. Its upstairs
    // shortcut fails that target even though the current masked board is equal.
    const grid = board(['..B..Y', '..R..B', '..B..R', '.BY..Y', '.BR..G', 'YGBRRY', 'YYGBBG', 'GGBRRG'])
    const current = pair('YB')
    const ranked = candidates(grid, current, [{ column: 1, rotation: 0 }, { column: 0, rotation: 2 }])
    expect(preferRecoverableSpare(grid, current, ranked)).toBeNull()
  })
})
