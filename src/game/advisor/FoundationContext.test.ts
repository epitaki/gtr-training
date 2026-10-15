import { describe, expect, it } from 'vitest'
import { PuyoColor } from '../core/types'
import { GTRDetector } from '../gtr/GTRPatterns'
import { assessFoundationContext } from './FoundationContext'

const board = () => {
  const colors = { R: PuyoColor.RED, G: PuyoColor.GREEN, Y: PuyoColor.YELLOW, B: PuyoColor.BLUE }
  return [...Array.from({ length: 9 }, () => Array<PuyoColor | null>(6).fill(null)),
    ...['.....R', 'RGYBBR', 'RRGYYB', 'GGYRRB'].map(row => [...row].map(c => colors[c as keyof typeof colors] ?? null))]
}

describe('separate full-board context', () => {
  it('keeps 100 foundation points even if the outside head connection is unconfirmed', () => {
    const grid = board()
    expect(assessFoundationContext(grid)).toMatchObject({ outsidePuyos: 0, status: 'potential' })
    grid[9][0] = PuyoColor.BLUE
    const before = structuredClone(grid)
    expect(GTRDetector.detectGTR(grid).totalScore).toBe(100)
    expect(assessFoundationContext(grid)).toMatchObject({ outsidePuyos: 1, status: 'unconfirmed', connection: null })
    expect(grid).toEqual(before)
  })

  it('does not claim a safe board merely because the foundation is perfect', () => {
    const grid = board()
    grid[1][2] = PuyoColor.GREEN
    expect(GTRDetector.detectGTR(grid).totalScore).toBe(100)
    expect(assessFoundationContext(grid)).toMatchObject({ status: 'spawn-blocked', connection: null })
    grid[1][2] = null
    grid[8][5] = grid[7][5] = PuyoColor.RED
    expect(assessFoundationContext(grid)).toMatchObject({ status: 'unstable', connection: null })
    grid[9][5] = null
    expect(GTRDetector.detectGTR(grid).totalScore).toBeLessThan(100)
  })
})
