import { describe, expect, it } from 'vitest'
import { GTRDetector } from './GTRPatterns'
import { PuyoColor, type PuyoPair } from '../core/types'
import { resolveChains, simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { GTR_SCORING_CONFIG } from './GTRScoringConfig'

// Transcribed from the user's three reference boards (2026-09-24).
// Top to bottom: the fourth row, then the three-row foundation.
const references = [
  { name: 'left', rows: ['.....R', 'RGYBBR', 'RRGYYB', 'GGYRRB'] },
  { name: 'middle', rows: ['.....R', 'RGYRRB', 'RRGYYY', 'GGRBBB'] },
  { name: 'right', rows: ['.....R', 'RGYBRR', 'RRGYBB', 'GGYYBR'] },
]
const palette = [PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW]
const board = (rows: string[], shift = 0): PuyoGrid => [
  ...Array.from({ length: 13 - rows.length }, () => Array<PuyoColor | null>(6).fill(null)),
  ...rows.map(row => [...row].map(c => c === '.' ? null : palette[('RGBY'.indexOf(c) + shift) % 4])),
]

describe('100-point foundation scoring', () => {
  for (const reference of references) {
    it.each([0, 1, 2, 3])(`scores the ${reference.name} reference 100 with color shift %i`, shift => {
      const grid = board(reference.rows, shift)
      const original = structuredClone(grid)
      expect(resolveChains(grid).chainCount).toBe(0)
      expect(GTRDetector.detectGTR(grid)).toMatchObject({
        scoringVersion: GTR_SCORING_CONFIG.VERSION, minimalFoundationComplete: true,
        hasBasicPattern: true, isGTR: true, quality: 100, chainTailScore: 85,
        totalScore: 100, chainCount: 5, leftoverPuyos: 0, row10Usage: 'minimal', rightEdgeRaised: true,
      })
      expect(grid).toEqual(original)
      expect(GTRDetector.getFoundationChainBreakdown(grid)).toEqual({ core: 2, tail: 3, total: 5 })
      const fired = structuredClone(grid)
      fired[9][0] = fired[10][0]
      expect(resolveChains(fired)).toMatchObject({ chainCount: 5, allClear: true })
    })

    it(`does not give an unfinished ${reference.name} tail full marks`, () => {
      const grid = board(reference.rows)
      grid[9][5] = null
      const result = GTRDetector.detectGTR(grid)
      expect(result.hasBasicPattern).toBe(true)
      expect(result.chainCount).toBeLessThan(5)
      expect(result.totalScore).toBeGreaterThan(0)
      expect(result.totalScore).toBeLessThan(100)
    })
  }

  it('grades the foundation independently from the extra outside companion', () => {
    const grid = board(references[0].rows)
    grid[9][1] = PuyoColor.YELLOW
    expect(GTRDetector.detectGTR(grid)).toMatchObject({ quality: 100, totalScore: 100, chainCount: 5 })
    const fired = structuredClone(grid)
    fired[9][0] = fired[10][0]
    expect(resolveChains(fired)).toMatchObject({ chainCount: 5, allClear: true })
    expect(grid.flat().filter(Boolean)).toHaveLength(20)
    // 19 foundation cells + one outside companion is reachable with real pairs.
  })

  it.each(palette)('does not change the foundation score for an outside upper cell (%s)', color => {
    const grid = board(references[0].rows)
    grid[8][5] = color
    expect(GTRDetector.detectGTR(grid).totalScore).toBe(100)
  })

  it.each([2, 3, 4])('scores a valid fourth-row cell in column index %i equally', column => {
    const grid = board(references[0].rows)
    grid[9][column] = grid[9][5]
    grid[9][5] = null
    expect(grid.flat().filter(Boolean)).toHaveLength(19)
    expect(GTRDetector.detectGTR(grid)).toMatchObject({ chainCount: 5, leftoverPuyos: 0 })
    expect(GTRDetector.detectGTR(grid)).toMatchObject({ totalScore: 100, chainTailScore: 85, minimalFoundationComplete: true })
  })

  it('does not award full marks when a puyo is left after five chains', () => {
    const grid = board(references[0].rows)
    grid[9][4] = PuyoColor.GREEN
    const fired = structuredClone(grid)
    fired[9][0] = fired[10][0]
    expect(resolveChains(fired)).toMatchObject({ chainCount: 5, allClear: false })
    expect(GTRDetector.detectGTR(grid).totalScore).toBeLessThan(100)
  })

  it('requires a stable 19-cell source even if gravity restores the same complete chain', () => {
    const grid = board(references[0].rows)
    grid[9][4] = grid[12][4]
    grid[12][4] = null
    const score = GTRDetector.detectGTR(grid)
    expect(score).toMatchObject({ scoringVersion: GTR_SCORING_CONFIG.VERSION,
      minimalFoundationComplete: false })
    expect(score.totalScore).toBeLessThan(100)
  })

  it('does not mark an invalid-size source as minimally complete', () => {
    const grid = board(references[0].rows).slice(1)
    expect(GTRDetector.detectGTR(grid)).toMatchObject({ minimalFoundationComplete: false })
    expect(GTRDetector.detectGTR(grid).totalScore).toBeLessThan(100)
  })

  it('ignores an outside blocker for foundation chains but keeps physical blockage separate', () => {
    const grid = board(references[0].rows)
    grid[9][0] = PuyoColor.BLUE
    const result = GTRDetector.detectGTR(grid)
    expect(result).toMatchObject({ quality: 100, chainCount: 5, isGTR: true })
    expect(GTRDetector.getFullBoardChainCount(grid)).toBe(0)
    expect(result.totalScore).toBe(100)
  })

  it.each([0, 1, 2, 3])('can reach 100 with ten real pairs without any clear (color shift %i)', shift => {
    let grid = board([], shift)
    const supplied = [
      ['GG', 0, 1], ['YR', 2, 1], ['RB', 4, 1],
      ['RR', 0, 1], ['GY', 2, 1], ['YB', 4, 1],
      ['RG', 0, 1], ['YY', 1, 1], ['BB', 3, 1], ['RR', 5, 0],
    ] as const
    for (const [colors, column, rotation] of supplied) {
      const color = (c: string) => palette[('RGBY'.indexOf(c) + shift) % 4]
      const pair: PuyoPair = { main: { x: 2, y: 1, color: color(colors[0]) },
        sub: { x: 2, y: 0, color: color(colors[1]) }, rotation: 0, falling: true }
      const outcome = simulateTurn(grid, pair, { column, rotation })
      expect(outcome.valid).toBe(true)
      expect(outcome.chainCount).toBe(0)
      grid = outcome.stableGrid
    }
    expect(grid.flat().filter(Boolean)).toHaveLength(20)
    expect(GTRDetector.detectGTR(grid)).toMatchObject({ totalScore: 100, chainCount: 5, leftoverPuyos: 0 })
    expect(GTRDetector.getFoundationChainBreakdown(grid)).toEqual({ core: 2, tail: 3, total: 5 })
  })

  it('counts a verified core as two links, never adding two to the simulated total', () => {
    const core = board(['RG....', 'RRG...', 'GGB...'])
    expect(GTRDetector.detectGTR(core).chainCount).toBe(2)
    expect(GTRDetector.getFoundationChainBreakdown(core)).toEqual({ core: 2, tail: 0, total: 2 })
    const simultaneous = board(['RGG...', 'RRG...', 'GGG...'])
    expect(GTRDetector.hasBasicPattern(simultaneous)).toBe(true)
    expect(GTRDetector.detectGTR(simultaneous).chainCount).toBe(1)
    expect(GTRDetector.getFoundationChainBreakdown(simultaneous)).toBeNull()
    expect(GTRDetector.getFoundationChainBreakdown(board([]))).toBeNull()
  })

  it('keeps all foundation results invariant under outside additions and removals', () => {
    const grid = board(references[0].rows)
    const baseline = GTRDetector.detectGTR(grid)
    for (let y = 0; y < 13; y++) for (let x = 0; x < 6; x++) {
      if (y >= (x < 2 ? 10 : 9)) continue
      for (const color of palette) {
        grid[y][x] = color
        expect(GTRDetector.detectGTR(grid)).toEqual(baseline)
        grid[y][x] = null
      }
    }
  })

  it('does not use full-board seven chains as foundation evaluation', () => {
    // Saved seed 20260928 baseline game 4. Outside links are not part of
    // foundation scoring, although physical play still clears seven chains.
    const encoded = '...................Y.....R.....R.....Y.YRB.Y.BYY.B.YBY.YGBRBGRYGBRGGRYYBRRYGGB'
    const grid = board(encoded.match(/.{6}/g)!)
    expect(GTRDetector.getFullBoardChainCount(grid)).toBe(7)
    expect(GTRDetector.detectGTR(grid)).toMatchObject({
      chainCount: 5, quality: 100, chainTailScore: 50, totalScore: 79,
    })
  })

  it('keeps an empty board and a broken fold at zero', () => {
    expect(GTRDetector.detectGTR(board([]))).toMatchObject({ hasBasicPattern: false, totalScore: 0 })
    const grid = board(references[0].rows)
    grid[12][0] = null
    expect(GTRDetector.detectGTR(grid)).toMatchObject({ hasBasicPattern: false, totalScore: 0 })
  })

  it.each([0, 1, 2, 3])('does not mistake the reported single used cell in column 3 for a raised right edge (%i)', shift => {
    const grid = board(['...B..', '...Y..', '...B..', '.GRB..', '.GYBR.', 'RGBRYG', 'RRGBBR', 'GGBYYY'], shift)
    const original = structuredClone(grid)
    expect(GTRDetector.detectGTR(grid)).toMatchObject({
      chainCount: 4, totalScore: 74, row10Usage: 'minimal', rightEdgeRaised: false,
    })
    expect(grid).toEqual(original)
  })

  it('does not treat an empty fourth row as a raised edge', () => {
    const grid = board(references[0].rows)
    grid[9][5] = null
    expect(GTRDetector.detectGTR(grid)).toMatchObject({ row10Usage: 'minimal', rightEdgeRaised: false })
    expect(GTRDetector.detectGTR(board([])).rightEdgeRaised).toBe(false)
  })

  it.each([2, 3, 4])('does not call a plateau with column %i a raised right edge even when that cell is unused', column => {
    const grid = board(references[0].rows)
    grid[9][column] = PuyoColor.GREEN
    expect(GTRDetector.detectGTR(grid).rightEdgeRaised).toBe(false)
  })

  it('requires the supported right-edge puyo to participate in the foundation chain', () => {
    const grid = board(references[0].rows)
    grid[9][5] = PuyoColor.GREEN
    const fired = structuredClone(grid)
    fired[9][0] = fired[10][0]
    expect(resolveChains(fired).clearSteps.flatMap(step => step.clearedPuyos)
      .some(p => p.origin?.x === 5 && p.origin.y === 9)).toBe(false)
    expect(GTRDetector.detectGTR(grid).rightEdgeRaised).toBe(false)
    grid[9][5] = PuyoColor.RED
    grid[10][5] = null
    expect(GTRDetector.detectGTR(grid).rightEdgeRaised).toBe(false)
  })

  it('does not change the foundation edge assessment because of outside puyos', () => {
    const grid = board(references[0].rows)
    grid[8][3] = PuyoColor.BLUE
    grid[8][5] = PuyoColor.RED
    grid[9][0] = PuyoColor.YELLOW
    expect(GTRDetector.detectGTR(grid).rightEdgeRaised).toBe(true)
  })
})
