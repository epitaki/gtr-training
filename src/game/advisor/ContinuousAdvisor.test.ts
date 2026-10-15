import { describe, expect, it } from 'vitest'
import { ContinuousAdvisor } from './ContinuousAdvisor'
import { inspectConnectedExtension, traceFoundation } from './ConnectedExtension'
import { PuyoColor, type PuyoPair } from '../core/types'
import { isSpawnBlocked, simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { GTRDetector } from '../gtr/GTRPatterns'

const palette = [PuyoColor.RED, PuyoColor.YELLOW, PuyoColor.BLUE, PuyoColor.GREEN]
const fixture = (shift: number) => {
  const color = (c: string) => palette[('RYBG'.indexOf(c) + shift) % 4]
  const board = (rows: string[]): PuyoGrid => [...Array.from({ length: 13 - rows.length }, () => Array(6).fill(null)),
    ...rows.map(r => [...r].map(c => c === '.' ? null : color(c)))]
  const pair = (p: string): PuyoPair => ({ main: { color: color(p[0]), x: 2, y: 1 },
    sub: { color: color(p[1]), x: 2, y: 0 }, rotation: 0, falling: true })
  const plan = { colorA: color('R'), colorB: color('Y'), colorC: color('R'), colorD: color('Y') }
  return { board, pair, plan }
}

describe('continuous guided construction', () => {
  it('excludes every non-clearing placement that blocks a spawn cell while keeping legal alternatives', () => {
    const { board, pair } = fixture(0)
    const grid = board(['RG....', 'RRG...', 'GGY...'])
    for (let row = 2; row <= 10; row++) grid[row][2] = row % 2 ? PuyoColor.YELLOW : PuyoColor.BLUE
    const current = pair('BY'), snapshot = structuredClone(grid)
    const fatal = simulateTurn(grid, current, { column: 2, rotation: 0 })
    expect(fatal.valid).toBe(true)
    expect(fatal.chainCount).toBe(0)
    expect(isSpawnBlocked(fatal.stableGrid)).toBe(true)
    const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, current, pair('RB'), pair('GY'),
      { colorA: PuyoColor.RED, colorB: PuyoColor.GREEN, colorC: PuyoColor.YELLOW, colorD: PuyoColor.BLUE })
    expect(advice.bestPlacement).not.toBeNull()
    expect(advice.allPlacements.length).toBeGreaterThan(0)
    for (const candidate of advice.allPlacements) {
      const result = simulateTurn(grid, current, candidate.placement)
      expect(result.valid).toBe(true)
      expect(result.chainCount).toBe(0)
      expect(isSpawnBlocked(result.stableGrid)).toBe(false)
    }
    expect(grid).toEqual(snapshot)
  })

  for (const sample of [
    { rows: ['.Y....', '.Y....', '.B.Y.R', '.Y.RRY', 'GB.YRY', 'GGBGGR', 'BBGYYR'], pairs: ['GY', 'BY', 'RB'], fold: 'GB' },
    { rows: ['....R.', '....B.', '....R.', '....R.', '.BRBR.', '.GRRB.', '.GYGG.', '.YRGY.', 'RBGBBY', 'RRBGGB', 'BBGYBB'], pairs: ['GY', 'BB', 'YB'], fold: 'RB' },
    { rows: ['.G....', '.Y....', '.Y....', '.Y....', '.B..Y.', '.Y..Y.', '.Y.YRY', 'RGYRGB', 'RRGYYG', 'GGYRGG'], pairs: ['RG', 'GB', 'BY'], fold: 'RG' },
  ]) it.each([0, 1, 2, 3])(`finishes the real foundation instead of pursuing a future upstairs fire (${sample.fold}), colors +%i`, shift => {
    const { board, pair } = fixture(shift), grid = board(sample.rows)
    const fold = pair(sample.fold), pairs = sample.pairs.map(pair)
    expect(GTRDetector.detectGTR(grid).chainCount).toBeLessThan(5)
    const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, pairs[0], pairs[1], pairs[2],
      { colorA: fold.main.color, colorB: fold.sub.color, colorC: fold.main.color, colorD: fold.sub.color })
    const outcome = simulateTurn(grid, pairs[0], advice.bestPlacement!.placement)
    expect(outcome.chainCount).toBe(0)
    expect(GTRDetector.detectGTR(outcome.stableGrid).chainCount).toBe(5)
    expect(inspectConnectedExtension(outcome.stableGrid, traceFoundation(outcome.stableGrid)!)).not.toBeNull()
  })

  it.each([0, 1, 2, 3])('uses the left spare pair to build a head without firing, colors +%i', shift => {
    const { board, pair, plan } = fixture(shift)
    const grid = board(['.BGR..', 'RYBGR.', 'RRYBGR', 'YYBBGR'])
    const original = structuredClone(grid), trace = traceFoundation(grid)!
    const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair('BR'), pair('BB'), pair('GG'), plan)
    expect(advice.bestPlacement?.placement).toEqual({ column: 0, rotation: 0 })
    expect(advice.allPlacements.every(c => c.immediateChainCount === 0)).toBe(true)
    const outcome = simulateTurn(grid, pair('BR'), advice.bestPlacement!.placement)
    expect(outcome.chainCount).toBe(0)
    expect(GTRDetector.detectGTR(outcome.stableGrid).chainCount).toBe(5)
    expect(inspectConnectedExtension(outcome.stableGrid, trace)).toMatchObject({ headSteps: 1, needed: 2, chainCount: 6 })
    expect(advice.phaseMessage).toContain('発火点を伸ばそう')
    expect(grid).toEqual(original)
  })

  it('does not recommend even an available CURRENT fire, while manual firing still works', () => {
    const { board, pair, plan } = fixture(0)
    const grid = board(['.BGR..', 'RYBGR.', 'RRYBGR', 'YYBBGR'])
    const current = pair('RR')
    expect(simulateTurn(grid, current, { column: 0, rotation: 0 }).chainCount).toBeGreaterThanOrEqual(5)
    const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, current, pair('BG'), pair('YB'), plan)
    expect(advice.bestPlacement).not.toBeNull()
    const outcome = simulateTurn(grid, current, advice.bestPlacement!.placement)
    expect(outcome.chainCount).toBe(0)
    expect(GTRDetector.detectGTR(outcome.stableGrid).chainCount).toBe(5)
  })

  it('keeps the shifted head separate from the scored foundation and rejects broken old links', () => {
    const { board } = fixture(0)
    const base = board(['.BGR..', 'RYBGR.', 'RRYBGR', 'YYBBGR'])
    const extended = board(['R.....', 'BBGR..', 'RYBGR.', 'RRYBGR', 'YYBBGR'])
    const trace = traceFoundation(base)!, original = structuredClone(extended)
    expect(inspectConnectedExtension(extended, trace)).toMatchObject({ needed: 2, chainCount: 6, headSteps: 1 })
    expect(GTRDetector.detectGTR(extended).chainCount).toBe(5)
    const broken = structuredClone(extended); broken[12][0] = null
    expect(inspectConnectedExtension(broken, trace)).toBeNull()
    expect(extended).toEqual(original)
    expect(traceFoundation([])).toBeNull()
    expect(traceFoundation(board([]))).toBeNull()
  })

  it('counts a tsurukame side group caused by the main fall, not an unrelated simultaneous clear', () => {
    const { board, pair } = fixture(0)
    const grid = board(['....G.', '..GRG.', 'RYBGR.', 'RRYBBR', 'YYBGGR'])
    const trace = traceFoundation(grid)!
    const placed = simulateTurn(grid, pair('GG'), { column: 4, rotation: 1 })
    expect(placed.chainCount).toBe(0)
    expect(inspectConnectedExtension(placed.stableGrid, trace)).toMatchObject({ chainCount: 5, realLeftovers: 0 })
    const unrelated = board(['.....G', '.....G', '.....G', '.BGR.G', 'RYBGR.', 'RRYBGR', 'YYBBGR'])
    expect(inspectConnectedExtension(unrelated, traceFoundation(unrelated)!)).toBeNull()
  })

  it('continues across supplied turns without firing or spending the scored foundation', () => {
    const { board, pair, plan } = fixture(0)
    let grid = board(['.BGR..', 'RYBGR.', 'RRYBGR', 'YYBBGR'])
    const supply = ['BR', 'BB', 'GG', 'YR', 'GB', 'YB'].map(pair)
    for (let i = 0; i < 4; i++) {
      const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, supply[i], supply[i + 1], supply[i + 2], plan)
      expect(advice.bestPlacement).not.toBeNull()
      const outcome = simulateTurn(grid, supply[i], advice.bestPlacement!.placement)
      expect(outcome.valid).toBe(true)
      expect(outcome.chainCount).toBe(0)
      expect(GTRDetector.detectGTR(outcome.stableGrid).chainCount).toBeGreaterThanOrEqual(5)
      grid = outcome.stableGrid
    }
  })
})
