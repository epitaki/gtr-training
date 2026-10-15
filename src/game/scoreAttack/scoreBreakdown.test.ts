import { expect, it } from 'vitest'
import { GTRDetector } from '../gtr/GTRPatterns'
import { PuyoColor } from '../core/types'
import { scoreBreakdown } from './scoreBreakdown'

const colors: Record<string, PuyoColor> = { R: PuyoColor.RED, G: PuyoColor.GREEN, B: PuyoColor.BLUE, Y: PuyoColor.YELLOW }
const grid = (rows: string[]) => [...Array.from({ length: 13 - rows.length }, () => Array<PuyoColor | null>(6).fill(null)),
  ...rows.map(row => [...row].map(cell => colors[cell] ?? null))]

it('shows the contributions of a three-chain score and omits an unawarded leftover and minimal bonus', () => {
  const score = GTRDetector.detectGTR(grid(['.....Y', 'RGRYYY', 'RRGRYY', 'GGYYYY']))
  // A saved three-chain evaluation with disconnected leftovers contributes 50 + 18.
  const saved = { ...score, totalScore: 68, quality: 100, chainCount: 3, chainTailScore: 30, minimalFoundationComplete: false }
  const before = structuredClone(saved)
  expect(scoreBreakdown(saved)).toEqual([{ label: '基本形', points: 50 }, { label: '3連鎖', points: 18 }])
  expect(saved).toEqual(before)
})
it('allocates rounding for a real perfect foundation so all positive contributions add to its 100 points', () => {
  const score = GTRDetector.detectGTR(grid(['.....R', 'RGYBBR', 'RRGYYB', 'GGYRRB']))
  const items = scoreBreakdown(score)
  expect(items).toEqual([{ label: '基本形', points: 50 }, { label: '5連鎖', points: 29 }, { label: 'あまり0個', points: 12 }, { label: '最小土台', points: 9 }])
  expect(items.reduce((sum, item) => sum + item.points, 0)).toBe(score.totalScore)
})
it('omits zero scores and preserves old or inconsistent saved totals without guessing their breakdown', () => {
  const score = GTRDetector.detectGTR(grid([]))
  expect(scoreBreakdown(score)).toEqual([])
  expect(scoreBreakdown({ ...score, totalScore: 93, scoringVersion: undefined })).toEqual([{ label: '土台評価', points: 93 }])
  expect(scoreBreakdown({ ...score, totalScore: 30 })).toEqual([{ label: '土台評価', points: 30 }])
})
