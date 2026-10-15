import { describe, expect, it } from 'vitest'
import { applyGravity, findClearPositions, resolveChains } from '../core/ChainSimulator'
import { PuyoColor } from '../core/types'
import { GTRDetector } from '../gtr/GTRPatterns'
import { createGTRChainPreview } from '../gtr/GTRChainPreview'
import { TailPlanner } from '../advisor/TailPlanner'
import { GTR_COMPLETION_EXAMPLES } from './GTRCompletionExamples'
import { GALLERY_SHAPES, GTR_COMPLETION_GALLERY, getGalleryGrid } from './GTRCompletionGallery'

const symbols = 'ABCD'
const permutations = (input: string): string[] => input.length === 0 ? [''] :
  [...input].flatMap((letter, index) => permutations(input.slice(0, index) + input.slice(index + 1))
    .map(rest => letter + rest))
const colorPermutations = permutations(symbols).map(order => [...order].map(symbol => ({
  A: PuyoColor.RED, B: PuyoColor.GREEN, C: PuyoColor.BLUE, D: PuyoColor.YELLOW,
})[symbol as 'A' | 'B' | 'C' | 'D']))
const baseColors = [PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW]
const coreFirst = ['0,9', '0,10', '0,11', '1,11']
const coreSecond = ['1,10', '2,11', '0,12', '1,12']

/** Use initial ID locations, since gravity changes where a puyo clears. */
function clearOriginSteps(source: ReturnType<typeof getGalleryGrid>): string[][] {
  const trace = createGTRChainPreview(source).trace
  if (!trace) throw new Error('The gallery example did not fire')
  const originById = new Map<string, string>()
  trace.initial.ids.forEach((row, y) => row.forEach((id, x) => {
    if (id !== null) originById.set(id, `${x},${y}`)
  }))
  return trace.stages.filter(stage => stage.kind === 'clear').map(stage => {
    if (stage.kind !== 'clear') throw new Error('Expected a clear stage')
    return stage.cleared.map(puyo => originById.get(puyo.id)!).sort()
  })
}

const structuralSignature = (source: ReturnType<typeof getGalleryGrid>) =>
  JSON.stringify(clearOriginSteps(source))

describe('GTR completion gallery', () => {
  it('has ten distinct examples per shape, with each first example matching the existing diagram', () => {
    expect(GTR_COMPLETION_GALLERY).toHaveLength(30)
    expect(new Set(GTR_COMPLETION_GALLERY.map(example => example.id)).size).toBe(30)
    expect(new Set(GTR_COMPLETION_GALLERY.map(example => structuralSignature(getGalleryGrid(example)))).size).toBe(30)
    for (const shape of GALLERY_SHAPES) {
      const examples = GTR_COMPLETION_GALLERY.filter(example => example.shape === shape)
      expect(examples).toHaveLength(10)
      expect(examples[0].rows).toEqual(GTR_COMPLETION_EXAMPLES[shape].rows)
    }
  })

  it('treats the previous Y1 and Y4 as the same structure despite their different color reuse', () => {
    const formerY4 = getGalleryGrid({
      ...GTR_COMPLETION_GALLERY[0],
      rows: ['.....B', 'ABCAAB', 'AABCCA', 'BBCBBA'],
    })
    expect(structuralSignature(formerY4)).toBe(structuralSignature(getGalleryGrid(GTR_COMPLETION_GALLERY[0])))
  })

  it.each(GTR_COMPLETION_GALLERY)('$id is stable, complete, and physically five chains with the named tail', example => {
    expect(example.rows).toHaveLength(4)
    expect(example.rows.every(row => row.length === 6 && /^[ABCD.]+$/.test(row))).toBe(true)
    const source = getGalleryGrid(example)
    const before = structuredClone(source)
    expect(source).toHaveLength(13)
    expect(source.every(row => row.length === 6)).toBe(true)
    expect(source.flat().filter(Boolean)).toHaveLength(19)
    expect(applyGravity(source).moved).toBe(false)
    expect(findClearPositions(source)).toHaveLength(0)
    expect(GTRDetector.detectGTR(source)).toMatchObject({ totalScore: 100, chainTailScore: 85, minimalFoundationComplete: true })
    expect(example.score).toBe(100)

    const preview = createGTRChainPreview(source)
    expect(preview.starter).toEqual({ x: 0, y: 9 })
    expect(preview.trace?.result).toMatchObject({ chainCount: 5, allClear: true })
    expect(preview.trace?.result).toEqual(resolveChains(preview.initialGrid))
    expect(source).toEqual(before)

    const steps = clearOriginSteps(source)
    expect(steps).toHaveLength(5)
    expect(steps.map(step => step.length)).toEqual([4, 4, 4, 4, 4])
    expect(steps[0]).toEqual([...coreFirst].sort())
    expect(steps[1]).toEqual([...coreSecond].sort())

    const foldColor = PuyoColor.GREEN
    const plan = TailPlanner.getPlans(source, foldColor).find(candidate => candidate.shape === example.shape && candidate.templateFilled)
    expect(plan).toBeDefined()
    const tailIds = plan!.chainCells.map(cell => preview.trace!.initial.ids[cell.y][cell.x])
    const thirdClear = preview.trace!.stages.filter(stage => stage.kind === 'clear')[2]
    expect(thirdClear.kind).toBe('clear')
    if (thirdClear.kind === 'clear') {
      expect(tailIds.every(id => thirdClear.cleared.some(puyo => puyo.id === id))).toBe(true)
      expect(steps[2]).toEqual(plan!.chainCells.map(cell => `${cell.x},${cell.y}`).sort())
    }
  })

  it.each(GTR_COMPLETION_GALLERY)('$id keeps its score and five-chain result under every color permutation', example => {
    const source = getGalleryGrid(example)
    for (const permuted of colorPermutations) {
      const grid = source.map(row => row.map(color => color === null ? null : permuted[baseColors.indexOf(color)]))
      expect(GTRDetector.detectGTR(grid).totalScore).toBe(100)
      const preview = createGTRChainPreview(grid)
      expect(preview.trace?.result).toMatchObject({ chainCount: 5, allClear: true })
      expect(structuralSignature(grid)).toBe(structuralSignature(source))
    }
  })
})
