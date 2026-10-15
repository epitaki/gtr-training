import { describe, expect, it } from 'vitest'
import { analyzeOpening, type OpeningKind } from './OpeningAnalysis'
import { PlacementAdvisor } from './PlacementAdvisor'
import { ContinuousAdvisor } from './ContinuousAdvisor'
import { GuideManager } from '../guide/GuideManager'
import { getCompletionColors } from '../guide/GTRCompletionExamples'
import { PuyoColor, type PuyoPair } from '../core/types'
import { simulateTurn } from '../core/ChainSimulator'

const colors = [PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW]
const pair = (main: PuyoColor, sub: PuyoColor, rotation = 0): PuyoPair => ({
  main: { color: main, x: 2, y: 1 }, sub: { color: sub, x: 2, y: 0 }, rotation, falling: true,
})
const field = () => ({ width: 6, height: 13,
  grid: Array.from({ length: 13 }, () => Array<PuyoColor | null>(6).fill(null)) })
const cases = colors.flatMap(a => colors.flatMap(b => colors.flatMap(c => colors.map(d => [a, b, c, d] as const))))

// Frozen pre-extraction contract, including imported AAAA's provisional fallback.
const legacyPlan = (sequence: readonly PuyoColor[]) => {
  const counts = colors.map(color => ({ color, count: sequence.filter(value => value === color).length,
    firstIndex: sequence.indexOf(color) })).sort((a, b) => b.count - a.count
      || (a.firstIndex < 0 ? Number.MAX_SAFE_INTEGER : a.firstIndex)
        - (b.firstIndex < 0 ? Number.MAX_SAFE_INTEGER : b.firstIndex))
  const colorB = counts[0].color
  const colorA = counts.find(item => item.color !== colorB && item.count > 0)?.color
    ?? colors.find(color => color !== colorB)!
  return { colorA, colorB, colorC: colorA, colorD: colorB }
}

describe('single opening analysis', () => {
  it.each(cases)('keeps roles for %s/%s then %s/%s in all 16 pair orientations', (a, b, c, d) => {
    const expected = legacyPlan([a, b, c, d])
    for (let firstRotation = 0; firstRotation < 4; firstRotation++) {
      for (let nextRotation = 0; nextRotation < 4; nextRotation++) {
        const first = pair(a, b, firstRotation), next = pair(c, d, nextRotation)
        const before = JSON.stringify([first, next])
        const analysis = analyzeOpening(first, next)
        const plan = PlacementAdvisor.createTrainingPlan(first, next)
        const guide = new GuideManager()
        guide.initialize(first, next)
        expect(analysis.trainingPlan).toEqual(expected)
        expect(plan).toEqual(expected)
        expect(guide.getGuideContent().colorMap).toMatchObject({ A: plan.colorA, B: plan.colorB })
        const completion = getCompletionColors(field(), plan)
        expect([completion.A, completion.B]).toEqual([plan.colorA, plan.colorB])
        expect(JSON.stringify([first, next])).toBe(before)
      }
    }
  })

  it.each([
    ['AAAA', [0, 0, 0, 0]], ['AAAB', [1, 0, 0, 0]], ['AAAB', [0, 1, 0, 0]],
    ['AABB', [0, 0, 1, 1]], ['AABB', [1, 1, 0, 0]],
    ['ABAB', [0, 1, 1, 0]], ['ABAB', [0, 1, 0, 1]],
    ['AABC', [0, 0, 1, 2]], ['AABC', [1, 2, 0, 0]],
    ['ABAC', [0, 1, 2, 0]], ['ABAC', [0, 1, 0, 2]], ['ABCD', [0, 1, 2, 3]],
  ] as const)('classifies %s explicitly for %j', (kind, indices) => {
    const [a, b, c, d] = indices.map(index => colors[index])
    expect(analyzeOpening(pair(a, b), pair(c, d)).kind).toBe(kind satisfies OpeningKind)
  })

  it('uses observed order for tied colors even when the enum would put red first', () => {
    const opening = analyzeOpening(pair(PuyoColor.YELLOW, PuyoColor.GREEN), pair(PuyoColor.GREEN, PuyoColor.YELLOW))
    expect(opening.trainingPlan).toMatchObject({ colorA: PuyoColor.GREEN, colorB: PuyoColor.YELLOW })
    expect(opening.colors.map(item => item.color)).toEqual([PuyoColor.YELLOW, PuyoColor.GREEN])
  })

  it.each(colors)('describes %s AAAA as awaiting an unsupplied second color', color => {
    const opening = pair(color, color)
    const manager = new GuideManager()
    manager.initialize(opening, opening)
    expect(analyzeOpening(opening, opening).awaitingSecondColor).toBe(true)
    expect(manager.getGuideContent().comment).toContain('同じ色が4個')
    expect(manager.getGuideContent().description).toContain('別色はまだ未供給')
    expect(manager.getGuideContent().pattern).toBeUndefined()
  })

  it('retains saved replay roles rather than reinterpreting their opening pairs', () => {
    const saved = { colorA: PuyoColor.GREEN, colorB: PuyoColor.BLUE, colorC: PuyoColor.RED, colorD: PuyoColor.YELLOW }
    const manager = new GuideManager()
    manager.initialize(pair(PuyoColor.RED, PuyoColor.RED), pair(PuyoColor.YELLOW, PuyoColor.YELLOW), saved)
    saved.colorA = PuyoColor.RED
    expect(manager.getGuideContent().colorMap).toMatchObject({ A: PuyoColor.GREEN, B: PuyoColor.BLUE })
  })

  it('keeps later alternatives and never turns an opening label into one mandatory move', () => {
    const first = pair(PuyoColor.RED, PuyoColor.RED), next = pair(PuyoColor.GREEN, PuyoColor.RED)
    const third = pair(PuyoColor.BLUE, PuyoColor.YELLOW)
    const plan = PlacementAdvisor.createTrainingPlan(first, next)
    const initial = field()
    const firstAdvice = ContinuousAdvisor.getAdvice(initial, first, next, third, plan)
    const firstOutcome = simulateTurn(initial.grid, first, firstAdvice.bestPlacement!.placement)
    const secondAdvice = ContinuousAdvisor.getAdvice({ ...initial, grid: firstOutcome.stableGrid }, next, third, first, plan)
    const secondOutcome = simulateTurn(firstOutcome.stableGrid, next, secondAdvice.bestPlacement!.placement)
    const advice = ContinuousAdvisor.getAdvice({ ...initial, grid: secondOutcome.stableGrid }, third, first, next, plan)
    expect(advice.allPlacements.length).toBeGreaterThan(1)
    expect(advice.allPlacements.every(candidate => candidate.immediateChainCount === 0)).toBe(true)
    expect(advice.allPlacements.some(candidate => candidate.placement.column !== advice.bestPlacement!.placement.column
      || candidate.placement.rotation !== advice.bestPlacement!.placement.rotation)).toBe(true)
  })
})
