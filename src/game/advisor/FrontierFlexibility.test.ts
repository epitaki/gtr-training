import { describe, expect, it, vi } from 'vitest'
import { PuyoColor, type PuyoPair } from '../core/types'
import { PlacementAdvisor } from './PlacementAdvisor'
import { FiveChainPlanner, type PlannedPlacement } from './FiveChainPlanner'
import { countFrontierSignatures, reorderTiedFrontierSlots, type FrontierCandidate, type FrontierEvidence } from './FrontierFlexibility'

const { RED: R, GREEN: G, BLUE: B, YELLOW: Y } = PuyoColor
const heights = [1, 1, 0, 0, 0, 0]
const candidate = (columns: PuyoColor[][], extras: Partial<FrontierCandidate> = {}): FrontierCandidate => ({
  shape: 'Y', matched: 2.3, spare: 0, complete: false, tailComplete: false,
  columns, ...extras,
})
const base = candidate([[R, B], [G, Y], [B], [], [], []])

describe('frontier flexibility', () => {
  it('counts duplicated recipes and distant variants with the same next cells once', () => {
    const duplicate = candidate(base.columns.map(column => [...column]))
    const distant = candidate([[R, B, G], [G, Y, R], [B, Y], [], [], []])
    expect(countFrontierSignatures([base, duplicate, distant], base, heights)).toBe(1)
  })

  it('counts distinct next-cell sets only at the selected physical progress and shape', () => {
    const second = candidate([[R, Y], [G, B], [B], [], [], []])
    const differentProgress = candidate([[R, G], [G, B], [B], [], [], []], { matched: 3.3 })
    const differentShape = candidate([[R, G], [G, B], [B], [], [], []], { shape: 'L' })
    const completed = candidate([[R, G], [G, B], [B], [], [], []], { tailComplete: true })
    expect(countFrontierSignatures([base, second, differentProgress, differentShape, completed], base, heights)).toBe(2)
  })

  it('is invariant under a bijective renaming of all colors', () => {
    const choices = [base, candidate([[R, Y], [G, B], [B], [], [], []])]
    const rename = (color: PuyoColor) => ({ [R]: Y, [G]: B, [B]: R, [Y]: G })[color]
    const renamed = choices.map(item => candidate(item.columns.map(column => column.map(rename))))
    expect(countFrontierSignatures(choices, base, heights)).toBe(2)
    expect(countFrontierSignatures(renamed, renamed[0], heights)).toBe(2)
  })

  type Choice = { id: string; score: number; recovery: number; frontier?: FrontierEvidence }
  const compareOriginal = (left: Choice, right: Choice) =>
    right.score - left.score || right.recovery - left.recovery
  const sortedWithFrontier = (choices: Choice[]) => {
    const sorted = [...choices].sort(compareOriginal)
    reorderTiedFrontierSlots(sorted, compareOriginal, choice => choice.frontier)
    return sorted.map(choice => choice.id)
  }
  const narrow: FrontierEvidence = { shape: 'Y', matched: 2.3, spare: 0,
    complete: false, tailComplete: false, count: 1 }
  const broad = { ...narrow, count: 3 }

  it('refills only matching slots in a full old tie block, even across another shape', () => {
    expect(sortedWithFrontier([
      { id: 'A', score: 100, recovery: 0, frontier: narrow },
      { id: 'B', score: 100, recovery: 0, frontier: { ...narrow, shape: 'L', count: 2 } },
      { id: 'C', score: 100, recovery: 0, frontier: broad },
    ])).toEqual(['C', 'B', 'A'])
  })

  it.each([
    { shape: 'L' as const }, { matched: 3.3 }, { spare: 1 },
    { complete: true }, { tailComplete: true }, undefined,
  ])('keeps a nonmatching or absent middle slot in place: %j', mismatch => {
    expect(sortedWithFrontier([
      { id: 'A', score: 100, recovery: 0, frontier: narrow },
      { id: 'B', score: 100, recovery: 0,
        frontier: mismatch ? { ...narrow, ...mismatch, count: 8 } : undefined },
      { id: 'C', score: 100, recovery: 0, frontier: broad },
    ])).toEqual(['C', 'B', 'A'])
  })

  it('keeps equal counts stable and never crosses even a tiny old score or recovery difference', () => {
    expect(sortedWithFrontier([
      { id: 'A', score: 100, recovery: 0, frontier: { ...narrow, count: 2 } },
      { id: 'B', score: 100, recovery: 0, frontier: { ...narrow, count: 2 } },
    ])).toEqual(['A', 'B'])
    expect(sortedWithFrontier([
      { id: 'A', score: 100 + 1e-8, recovery: 0, frontier: narrow },
      { id: 'B', score: 100, recovery: 0, frontier: broad },
    ])).toEqual(['A', 'B'])
    expect(sortedWithFrontier([
      { id: 'A', score: 100, recovery: 1, frontier: narrow },
      { id: 'B', score: 100, recovery: 0, frontier: broad },
    ])).toEqual(['A', 'B'])
  })

  it('connects CURRENT frontier metadata to the final placement comparison', () => {
    const field = { width: 6, height: 13,
      grid: Array.from({ length: 13 }, () => Array<PuyoColor | null>(6).fill(null)) }
    const pair: PuyoPair = {
      main: { color: Y, x: 2, y: 1 }, sub: { color: R, x: 2, y: 0 },
      rotation: 0, falling: true,
    }
    const progress = { shape: 'Y' as const, matched: 2.3, spare: 0,
      complete: false, tailComplete: false }
    const planned = new Map<string, PlannedPlacement>([
      ['0:0', { placement: { column: 0, rotation: 0 }, score: 10, shape: 'Y', color: B,
        recoveredExtras: 0, frontier: { ...progress, count: 1 } }],
      ['1:0', { placement: { column: 1, rotation: 0 }, score: 10, shape: 'Y', color: B,
        recoveredExtras: 0, frontier: { ...progress, count: 2 } }],
    ])
    const spy = vi.spyOn(FiveChainPlanner, 'rank').mockReturnValue(planned)
    try {
      const advice = PlacementAdvisor.getAdvice(field, pair, undefined, undefined,
        { colorA: R, colorB: Y, colorC: R, colorD: Y })
      expect(advice.bestPlacement?.placement).toEqual({ column: 1, rotation: 0 })
      planned.get('0:0')!.score = 11
      const priority = PlacementAdvisor.getAdvice(field, pair, undefined, undefined,
        { colorA: R, colorB: Y, colorC: R, colorD: Y })
      expect(priority.bestPlacement?.placement).toEqual({ column: 0, rotation: 0 })
    } finally {
      spy.mockRestore()
    }
  })

  it('reorders separated matching CURRENT slots through the real advisor', () => {
    const field = { width: 6, height: 13,
      grid: Array.from({ length: 13 }, () => Array<PuyoColor | null>(6).fill(null)) }
    const pair: PuyoPair = {
      main: { color: Y, x: 2, y: 1 }, sub: { color: R, x: 2, y: 0 },
      rotation: 0, falling: true,
    }
    const progress = { shape: 'Y' as const, matched: 2.3, spare: 0,
      complete: false, tailComplete: false }
    const planned = new Map<string, PlannedPlacement>([
      ['0:0', { placement: { column: 0, rotation: 0 }, score: 10, shape: 'Y', color: B,
        recoveredExtras: 0, frontier: { ...progress, count: 1 } }],
      ['1:0', { placement: { column: 1, rotation: 0 }, score: 10, shape: 'L', color: B,
        recoveredExtras: 0, frontier: { ...progress, shape: 'L', count: 2 } }],
      ['2:0', { placement: { column: 2, rotation: 0 }, score: 10, shape: 'Y', color: B,
        recoveredExtras: 0, frontier: { ...progress, count: 3 } }],
    ])
    const spy = vi.spyOn(FiveChainPlanner, 'rank').mockReturnValue(planned)
    try {
      const advice = PlacementAdvisor.getAdvice(field, pair, undefined, undefined,
        { colorA: R, colorB: Y, colorC: R, colorD: Y })
      expect(advice.allPlacements.slice(0, 3).map(candidate => candidate.placement.column))
        .toEqual([2, 1, 0])
    } finally {
      spy.mockRestore()
    }
  })

  it('does not use frontier breadth to break a tie between future planned fires', () => {
    const field = { width: 6, height: 13,
      grid: Array.from({ length: 13 }, () => Array<PuyoColor | null>(6).fill(null)) }
    const pair: PuyoPair = {
      main: { color: Y, x: 2, y: 1 }, sub: { color: R, x: 2, y: 0 },
      rotation: 0, falling: true,
    }
    const progress = { shape: 'Y' as const, matched: 2.3, spare: 0,
      complete: false, tailComplete: false }
    const firePreference = { depth: 1, collateral: false, surfaceCost: 0,
      leftovers: 0, foundationChains: 5 }
    const planned = new Map<string, PlannedPlacement>([
      ['0:0', { placement: { column: 0, rotation: 0 }, score: 10, shape: 'Y', color: B,
        recoveredExtras: 0, firePreference, frontier: { ...progress, count: 1 } }],
      ['1:0', { placement: { column: 1, rotation: 0 }, score: 10, shape: 'Y', color: B,
        recoveredExtras: 0, firePreference, frontier: { ...progress, count: 3 } }],
    ])
    const spy = vi.spyOn(FiveChainPlanner, 'rank').mockReturnValue(planned)
    try {
      const advice = PlacementAdvisor.getAdvice(field, pair, undefined, undefined,
        { colorA: R, colorB: Y, colorC: R, colorD: Y })
      expect(advice.bestPlacement?.placement).toEqual({ column: 0, rotation: 0 })
      expect(advice.allPlacements.slice(0, 2).map(candidate => candidate.placement))
        .toEqual([{ column: 0, rotation: 0 }, { column: 1, rotation: 0 }])
    } finally {
      spy.mockRestore()
    }
  })
})
