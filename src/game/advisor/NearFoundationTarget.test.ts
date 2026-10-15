import { describe, expect, it } from 'vitest'
import { FiveChainPlanner } from './FiveChainPlanner'
import { GTRDetector } from '../gtr/GTRPatterns'
import { PuyoColor, type PuyoPair } from '../core/types'
import type { PuyoGrid } from '../core/ChainSimulator'

const palette = [PuyoColor.RED, PuyoColor.GREEN, PuyoColor.YELLOW, PuyoColor.BLUE]
describe('bounded low-foundation target protection', () => {
  it.each([0, 1, 2, 3])('releases costly stalls without looking at a fourth pair, colors +%i', shift => {
    const color = (c: string) => palette[('RGYB'.indexOf(c) + shift) % 4]
    const grid: PuyoGrid = '.....................................R.....BB....GY..Y.YY.GGGBRYRBGGBRYRBBRRYR'
      .match(/.{6}/g)!.map(row => [...row].map(c => c === '.' ? null : color(c)))
    const pair = (p: string): PuyoPair => ({ main: { color: color(p[0]), x: 2, y: 1 },
      sub: { color: color(p[1]), x: 2, y: 0 }, rotation: 0, falling: true })
    const fold = { colorA: color('G'), colorB: color('B') }
    const visible = ['BG', 'GY', 'YG'].map(pair)
    const input = structuredClone({ grid, fold, visible })
    expect(FiveChainPlanner.hasNearFoundationTarget(grid, fold)).toBe(true)
    expect(FiveChainPlanner.hasNearFoundationTarget(grid, fold, visible)).toBe(false)
    expect(FiveChainPlanner.hasNearFoundationTarget(grid, fold, [...visible, pair('RR')])).toBe(false)
    expect(FiveChainPlanner.hasNearFoundationTarget(grid, fold, [pair('RR'), ...visible])).toBe(true)
    expect({ grid, fold, visible }).toEqual(input)
    expect(GTRDetector.detectGTR(grid).chainCount).toBeLessThan(5)
  })
  it.each([0, 1, 2, 3])('keeps a feasible nearby target conditional, colors +%i', shift => {
    const color = (letter: string) => palette[('RGYB'.indexOf(letter) + shift) % 4]
    const grid: PuyoGrid = [...Array.from({ length: 9 }, () => Array(6).fill(null)),
      ...['.....R', 'RGYBBR', 'RRGYYB', 'GGYRRB'].map(row => [...row].map(c => c === '.' ? null : color(c)))]
    const fold = { colorA: color('R'), colorB: color('G') }
    expect(GTRDetector.detectGTR(grid).chainCount).toBe(5)
    expect(FiveChainPlanner.hasNearFoundationTarget(grid, fold)).toBe(true)
    grid[9][5] = null
    grid[10][5] = null
    const input = structuredClone({ grid, fold })
    // These missing puyos are target requirements, not supplied colors or a
    // completed five-chain. The real board must remain incomplete and intact.
    expect(GTRDetector.detectGTR(grid).chainCount).toBeLessThan(5)
    expect(FiveChainPlanner.hasNearFoundationTarget(grid, fold)).toBe(true)
    expect(GTRDetector.detectGTR(grid).chainCount).toBeLessThan(5)
    expect({ grid, fold }).toEqual(input)
    const early = grid.map((row, y) => row.map((c, x) => x < 2 || (x === 2 && y === 11) ? c : null))
    expect(FiveChainPlanner.hasNearFoundationTarget(early, fold)).toBe(false)
    const blocked = structuredClone(grid); blocked[1][2] = color('B')
    expect(FiveChainPlanner.hasNearFoundationTarget(blocked, fold)).toBe(false)
    expect(FiveChainPlanner.hasNearFoundationTarget([], fold)).toBe(false)
  })
})
