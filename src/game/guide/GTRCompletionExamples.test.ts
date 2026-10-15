import { describe, expect, it } from 'vitest'
import { applyGravity, findClearPositions, resolveChains } from '../core/ChainSimulator'
import { PuyoColor } from '../core/types'
import { GTRDetector } from '../gtr/GTRPatterns'
import { TailPlanner } from '../advisor/TailPlanner'
import {
  COMPLETION_SHAPES, GTR_COMPLETION_EXAMPLES, getCompletionColors,
  getCompletionGrid, getCompletionExampleGrids, getDisplayedCompletionShape,
} from './GTRCompletionExamples'

const colors = [PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW]
const permutations = (remaining: PuyoColor[]): PuyoColor[][] => remaining.length === 0
  ? [[]]
  : remaining.flatMap((color, index) => permutations(remaining.filter((_, i) => i !== index))
    .map(rest => [color, ...rest]))

describe('GTR completion examples', () => {
  it.each(COMPLETION_SHAPES)('%s shows three different stable 19-puyo, 100-point examples under all 24 color permutations', shape => {
    for (const [A, B, C, D] of permutations(colors)) {
      const examples = getCompletionExampleGrids(shape, { A, B, C, D })
      expect(examples).toHaveLength(3)
      expect(new Set(examples.map(example => JSON.stringify(example))).size).toBe(3)
      expect(examples[0]).toEqual(getCompletionGrid(shape, { A, B, C, D }))
      for (const small of examples) {
        expect(small).toHaveLength(4)
        expect(small.every(row => row.length === 6)).toBe(true)
        expect(small.flat().filter(Boolean)).toHaveLength(19)
        const grid = [...Array.from({ length: 9 }, () => Array<PuyoColor | null>(6).fill(null)), ...small]
        expect(applyGravity(grid).moved).toBe(false)
        expect(findClearPositions(grid)).toHaveLength(0)
        expect(GTRDetector.detectGTR(grid).totalScore).toBe(100)
        expect(TailPlanner.getPlans(grid, B).some(plan =>
          plan.shape === shape && plan.color === C && plan.templateFilled)).toBe(true)
        const fired = grid.map(row => [...row])
        fired[9][0] = A // A hypothetical starter outside the displayed 19 cells.
        const resolution = resolveChains(fired)
        expect(resolution.chainCount).toBe(5)
        expect(resolution.allClear).toBe(true)
      }
    }
  })

  it('keeps the three reference diagrams exact', () => {
    const symbols = { A: PuyoColor.RED, B: PuyoColor.GREEN, C: PuyoColor.YELLOW, D: PuyoColor.BLUE }
    const letters: Record<PuyoColor, string> = {
      [PuyoColor.RED]: 'R', [PuyoColor.GREEN]: 'G',
      [PuyoColor.YELLOW]: 'Y', [PuyoColor.BLUE]: 'B',
    }
    const rows = (shape: typeof COMPLETION_SHAPES[number]) => getCompletionGrid(shape, symbols)
      .map(row => row.map(color => color ? letters[color] : '.').join(''))
    expect(rows('Y')).toEqual(['.....R', 'RGYBBR', 'RRGYYB', 'GGYRRB'])
    expect(rows('zabuton')).toEqual(['.....R', 'RGYRRB', 'RRGYYY', 'GGRBBB'])
    expect(rows('L')).toEqual(['.....R', 'RGYBRR', 'RRGYBB', 'GGYYBR'])
    expect(COMPLETION_SHAPES.map(shape => GTR_COMPLETION_EXAMPLES[shape].label))
      .toEqual(['Y字', '座布団', 'L字'])
  })

  it('uses the current fold and resolves an overlapping recommended tail color deterministically', () => {
    const grid = Array.from({ length: 13 }, () => Array<PuyoColor | null>(6).fill(null))
    grid[11][0] = PuyoColor.BLUE
    grid[12][0] = PuyoColor.YELLOW
    const field = { grid }
    const plan = { colorA: PuyoColor.RED, colorB: PuyoColor.GREEN }
    expect(getCompletionColors(field, plan, PuyoColor.YELLOW)).toEqual({
      A: PuyoColor.BLUE, B: PuyoColor.YELLOW, C: PuyoColor.RED, D: PuyoColor.GREEN,
    })
    expect(getCompletionColors(field, plan, PuyoColor.GREEN).C).toBe(PuyoColor.GREEN)
  })

  it('resolves automatic, manual, and unavailable advice without retaining a stale shape', () => {
    expect(getDisplayedCompletionShape(null, 'L')).toBe('L')
    expect(getDisplayedCompletionShape('zabuton', 'L')).toBe('zabuton')
    expect(getDisplayedCompletionShape(null)).toBe('Y')
  })
})
