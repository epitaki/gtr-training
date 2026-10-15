import { describe, expect, it } from 'vitest'
import { PuyoColor } from '../core/types'
import type { PuyoGrid } from '../core/ChainSimulator'
import { GTRDetector } from './GTRPatterns'
import { createGTRChainPreview } from './GTRChainPreview'

const colors: Record<string, PuyoColor> = {
  R: PuyoColor.RED, G: PuyoColor.GREEN, B: PuyoColor.BLUE, Y: PuyoColor.YELLOW,
}
const board = (rows: string[]): PuyoGrid => [
  ...Array.from({ length: 13 - rows.length }, () => Array<PuyoColor | null>(6).fill(null)),
  ...rows.map(row => [...row].map(value => colors[value] ?? null)),
]

describe('GTR result preview', () => {
  it.each([
    { name: 'Y', rows: ['.....R', 'RGYBBR', 'RRGYYB', 'GGYRRB'] },
    { name: 'zabuton', rows: ['.....R', 'RGYRRB', 'RRGYYY', 'GGRBBB'] },
    { name: 'L', rows: ['.....R', 'RGYBRR', 'RRGYBB', 'GGYYBR'] },
  ])('shows the $name foundation in five clear steps without changing the source', ({ rows }) => {
    const grid = board(rows)
    const before = structuredClone(grid)
    const score = GTRDetector.detectGTR(grid)
    const preview = createGTRChainPreview(grid)

    expect(preview.starter).toEqual({ x: 0, y: 9 })
    expect(preview.initialGrid[9][0]).toBe(grid[10][0])
    expect(preview.trace?.stages.filter(stage => stage.kind === 'clear').map(stage => stage.chainIndex))
      .toEqual([1, 2, 3, 4, 5])
    expect(preview.trace?.result).toMatchObject({ chainCount: 5, allClear: true })
    expect(GTRDetector.detectGTR(grid)).toEqual(score)
    expect(grid).toEqual(before)
  })

  it('removes every outside cell before gravity and preserves the same trace', () => {
    const grid = board(['.....R', 'RGYBBR', 'RRGYYB', 'GGYRRB'])
    const baseline = createGTRChainPreview(grid)
    grid[0][0] = PuyoColor.BLUE
    grid[8][3] = PuyoColor.GREEN
    grid[9][0] = PuyoColor.YELLOW
    grid[9][1] = PuyoColor.RED
    const source = structuredClone(grid)
    const withOutside = createGTRChainPreview(grid)
    expect(withOutside.trace).toEqual(baseline.trace)
    expect(withOutside.initialGrid).toEqual(baseline.initialGrid)
    expect(grid).toEqual(source)
  })

  it('keeps an incomplete fold score separate from a possible hypothetical clear', () => {
    const grid = board(['R.....', 'R.....', 'RB....'])
    expect(GTRDetector.detectGTR(grid)).toMatchObject({ hasBasicPattern: false, totalScore: 0, chainCount: 0 })
    expect(createGTRChainPreview(grid).trace?.result.chainCount).toBe(1)
  })

  it('leaves a still image with a reason when there is no starter or no clear', () => {
    const empty = createGTRChainPreview(board([]))
    expect(empty.trace).toBeNull()
    expect(empty.starter).toBeNull()
    expect(empty.unavailableReason).toContain('発火色')

    const isolated = createGTRChainPreview(board(['R.....', '......', '......']))
    expect(isolated.trace).toBeNull()
    expect(isolated.starter).toEqual({ x: 0, y: 9 })
    expect(isolated.unavailableReason).toContain('消える組')
  })

  it('shows leftovers from the masked foundation after the hypothetical chain', () => {
    const grid = board(['.....R', 'RGYBBR', 'RRGYYB', 'GGYRRB'])
    grid[9][4] = PuyoColor.GREEN
    expect(createGTRChainPreview(grid).trace?.result).toMatchObject({ chainCount: 5, allClear: false })
  })
})
