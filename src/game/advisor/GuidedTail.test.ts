import { describe, expect, it } from 'vitest'
import fixture from '../../../docs/research/head-construction-feedback-20260926.json'
import { PuyoColor } from '../core/types'
import type { PuyoGrid } from '../core/ChainSimulator'
import { PlacementAdvisor } from './PlacementAdvisor'
import { isGuidedTailComplete } from './GuidedTail'
import { inspectConnectedExtension, traceFoundation } from './ConnectedExtension'
import { GTRDetector } from '../gtr/GTRPatterns'

const colors = Object.values(PuyoColor)
function board(rows: string[], shift: number): PuyoGrid {
  return [...Array.from({ length: 13 - rows.length }, () => Array(6).fill(null)),
    ...rows.map(row => [...row].map(c => c === '.' ? null : colors[('RGBY'.indexOf(c) + shift) % 4]))]
}
describe('guided tail completion behind a pending head', () => {
  it.each([0, 1, 2, 3])('recognizes the real tail, but not an attained head chain, palette %i', shift => {
    for (const rows of [fixture.horizontalRows, ['.B....', 'BB...Y', 'GRGBBY', 'GGRGGB', 'RRGYYB']]) {
      const grid = board(rows, shift), original = structuredClone(grid)
      expect(PlacementAdvisor.isAdaptiveTailComplete(grid)).toBe(false)
      expect(inspectConnectedExtension(grid, traceFoundation(grid)!)).toBeNull()
      expect(isGuidedTailComplete(grid)).toBe(true)
      expect(GTRDetector.detectGTR(grid).chainCount).toBe(5)
      expect(grid).toEqual(original)
      grid[8][0] = colors[('RGBY'.indexOf('G') + shift) % 4]
      expect(isGuidedTailComplete(grid)).toBe(true)
    }
  })

  it('does not fill missing real tail cells for completion', () => {
    expect(isGuidedTailComplete(board(fixture.beforeEleventhHorizontalRows, 0))).toBe(false)
    expect(isGuidedTailComplete(board([], 0))).toBe(false)
    expect(isGuidedTailComplete(board(fixture.recordedRows, 0))).toBe(true)
    const wrongCore = board(fixture.horizontalRows, 0); wrongCore[12][0] = wrongCore[10][0]
    expect(isGuidedTailComplete(wrongCore)).toBe(false)
  })
})
