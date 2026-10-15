import { describe, expect, it } from 'vitest'
import { evaluateLeftovers } from './LeftoverEvaluation'
import { GTRDetector } from './GTRPatterns'
import { PuyoColor } from '../core/types'

const R = PuyoColor.RED, G = PuyoColor.GREEN
describe('leftover preference: none > one = connected same color', () => {
  it('does not reward a connected subset when other leftovers are disconnected or a different color', () => {
    const linked = [{ x: 0, y: 12, color: R }, { x: 1, y: 12, color: R }]
    expect(evaluateLeftovers([]).score).toBe(20)
    expect(evaluateLeftovers(linked.slice(0, 1))).toMatchObject({ score: 18, kind: 'single', connected: false })
    expect(evaluateLeftovers(linked)).toMatchObject({ score: 18, connected: true })
    expect(evaluateLeftovers([...linked, { x: 1, y: 11, color: R }])).toMatchObject({ score: 18, connected: true })
    expect(evaluateLeftovers([...linked, { x: 4, y: 12, color: R }])).toMatchObject({ score: 5, connected: false })
    expect(evaluateLeftovers([...linked, { x: 2, y: 12, color: G }])).toMatchObject({ score: 0, connected: false })
    expect(evaluateLeftovers([{ x: 0, y: 12, color: R }, { x: 1, y: 11, color: R }]).score).toBe(5)
  })

  it.each([0, 1, 2, 3])('uses the same preference in real masked foundation scoring, colors +%i', shift => {
    const palette = [PuyoColor.RED, PuyoColor.YELLOW, PuyoColor.BLUE, PuyoColor.GREEN]
    const color = (c: string) => palette[('RYBG'.indexOf(c) + shift) % 4]
    const score = (extras: [number, number, string][]) => {
      const grid = [...Array.from({ length: 10 }, () => Array(6).fill(null)),
        ...['RYB...', 'RRYB..', 'YYBB..'].map(r => [...r].map(c => c === '.' ? null : color(c)))]
      for (const [x, y, c] of extras) grid[y][x] = color(c)
      const original = structuredClone(grid), result = GTRDetector.detectGTR(grid)
      expect(result.chainCount).toBe(3)
      expect(result.leftoverPuyos).toBe(extras.filter(([, y]) => y >= 9).length)
      expect(grid).toEqual(original)
      return result
    }
    const none = score([]), single = score([[5, 12, 'G']]), two = score([[4, 12, 'G'], [5, 12, 'G']])
    const three = score([[4, 12, 'G'], [5, 12, 'G'], [5, 11, 'G']])
    expect(none.chainTailScore).toBe(50)
    expect([single.chainTailScore, two.chainTailScore, three.chainTailScore]).toEqual([48, 48, 48])
    expect(none.totalScore).toBeGreaterThan(single.totalScore)
    expect(two.totalScore).toBe(single.totalScore)
    expect(three.totalScore).toBe(single.totalScore)
    expect(score([[3, 10, 'G'], [5, 12, 'G']])).toMatchObject({ chainTailScore: 35, leftoverConnected: false })
    expect(score([[4, 12, 'G'], [5, 12, 'R']])).toMatchObject({ chainTailScore: 30, leftoverConnected: false })
    expect(score([[5, 12, 'G'], [3, 8, 'R']]).chainTailScore).toBe(single.chainTailScore)
  })
})
