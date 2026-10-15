import { describe, expect, it } from 'vitest'
import { foundationPreparationBonus, supportsEveryFiringCompanion } from './FoundationPreference'
import { analyzeCandidateFire, createMainFireBaseline } from './MainFireAnalysis'
import { PlacementAdvisor } from './PlacementAdvisor'
import { simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'
import { GTRDetector } from '../gtr/GTRPatterns'

const palette = [PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW]
const color = (letter: string, shift = 0) => palette[('RGBY'.indexOf(letter) + shift) % 4]
const board = (rows: string[], shift = 0): PuyoGrid => [
  ...Array.from({ length: 13 - rows.length }, () => Array(6).fill(null)),
  ...rows.map(row => [...row].map(c => c === '.' ? null : color(c, shift))),
]
const pair = (letters: string, shift = 0): PuyoPair => ({ main: { color: color(letters[0], shift), x: 2, y: 1 },
  sub: { color: color(letters[1], shift), x: 2, y: 0 }, rotation: 0, falling: true })

describe('foundation preparation preference', () => {
  it.each([0, 1, 2, 3])('rewards a completed foundation equally across fourth-row positions, shift %i', shift => {
    const right = board(['.....R', 'RGYBBR', 'RRGYYB', 'GGYRRB'], shift)
    const central = structuredClone(right)
    central[9][2] = central[9][5]; central[9][5] = null
    expect(GTRDetector.detectGTR(central).chainCount).toBe(5)
    expect(GTRDetector.detectGTR(right).rightEdgeRaised).toBe(true)
    expect(GTRDetector.detectGTR(central).rightEdgeRaised).toBe(false)
    expect(foundationPreparationBonus(right)).toBe(2000)
    expect(foundationPreparationBonus(central)).toBe(2000)
    const outside = structuredClone(right)
    outside[8][3] = color('B', shift)
    expect(foundationPreparationBonus(outside)).toBe(foundationPreparationBonus(right))
    expect(foundationPreparationBonus(board([], shift))).toBe(0)
  })

  it('does not reward full-board five as foundation five in the reported board', () => {
    const reported = board(['...B..', '...Y..', '...B..', '.GRB..', '.GYBR.', 'RGBRYG', 'RRGBBR', 'GGBYYY'])
    expect(GTRDetector.getFullBoardChainCount(reported)).toBe(5)
    expect(foundationPreparationBonus(reported)).toBe(0)
  })

  it.each([0, 1, 2, 3])('builds a physically fireable five-link foundation instead of an upstairs extension, shift %i', shift => {
    // Fixed-seed game 0, move 10: both paths fire on move 14, but the old
    // route leaves only three links in the evaluation range.
    let grid = board(['..BR..', 'BRYR..', 'BBRYYR', 'RRYGGG'], shift)
    const plan = { colorA: color('B', shift), colorB: color('R', shift), colorC: color('B', shift), colorD: color('R', shift) }
    const queue = ['YR', 'RR', 'GY', 'YG', 'RB'].map(letters => pair(letters, shift))
    const expected = [{ column: 3, rotation: 1 }, { column: 1, rotation: 0 }, { column: 5, rotation: 0 }]
    for (let i = 0; i < 3; i++) {
      const best = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, queue[i], queue[i + 1], queue[i + 2], plan).bestPlacement!
      expect(best.placement).toEqual(expected[i])
      const outcome = simulateTurn(grid, queue[i], best.placement)
      expect(outcome.chainCount).toBe(0)
      grid = outcome.stableGrid
    }
    expect(GTRDetector.detectGTR(grid).chainCount).toBe(5)
    // Replanning when new visible pairs arrive may choose a different route
    // from the original three-pair witness. Verify the real firing pair too.
    const prepared = simulateTurn(grid, queue[3], { column: 1, rotation: 1 })
    const fired = simulateTurn(prepared.stableGrid, queue[4], { column: 1, rotation: 3 })
    expect(fired.chainCount).toBe(5)
    expect(analyzeCandidateFire(queue[4], fired, createMainFireBaseline(prepared.stableGrid)))
      .toMatchObject({ isIntendedMainFire: true, hasCollateralClear: false })
  })

  it.each([0, 1, 2, 3])('finishes the lower link and then fires the reported real queue, shift %i', shift => {
    const grid = board(['...B..', '...Y..', '...B..', '...B..', '...BR.', 'RGBRY.', 'RRGBB.', 'GGBYYY'], shift)
    const pairs = ['YR', 'GG', 'RG'].map(letters => pair(letters, shift))
    const plan = { colorA: color('R', shift), colorB: color('G', shift), colorC: color('R', shift), colorD: color('G', shift) }
    const input = structuredClone({ grid, pairs, plan })
    const best = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, pairs[0], pairs[1], pairs[2], plan).bestPlacement!
    // The old upward orientation relied on an outside cell for link five.
    // The alternative has a legal three-pair witness, not an imagined supply.
    const follow = (first: { column: number; rotation: number }) => {
      let current = grid
      for (const [i, placement] of [first, { column: 1, rotation: 0 }, { column: 5, rotation: 0 }].entries()) {
        const outcome = simulateTurn(current, pairs[i], placement)
        expect(outcome.valid).toBe(true)
        expect(outcome.chainCount).toBe(0)
        current = outcome.stableGrid
      }
      return current
    }
    const lower = follow({ column: 2, rotation: 2 })
    const previous = follow({ column: 2, rotation: 0 })
    expect(GTRDetector.detectGTR(lower).chainCount).toBe(5)
    expect(GTRDetector.detectGTR(previous).chainCount).toBe(4)
    expect(GTRDetector.getFullBoardChainCount(lower)).toBe(5)
    // Neither of these particular terminal boards accepts every companion.
    // That is a supply constraint, not permission to count upstairs as five.
    expect(supportsEveryFiringCompanion(lower, createMainFireBaseline(lower)!)).toBe(false)
    expect(supportsEveryFiringCompanion(previous, createMainFireBaseline(previous)!)).toBe(false)
    expect(best.placement).toEqual({ column: 2, rotation: 2 })
    const queue = ['YR', 'GG', 'RG', 'RR', 'RB', 'BR'].map(letters => pair(letters, shift))
    let actual = grid
    for (let i = 0; i < 4; i++) {
      const advice = PlacementAdvisor.getAdvice({ grid: actual, width: 6, height: 13 }, queue[i], queue[i + 1], queue[i + 2], plan)
      const outcome = simulateTurn(actual, queue[i], advice.bestPlacement!.placement)
      expect(outcome.valid).toBe(true)
      expect(outcome.chainCount).toBe(i === 3 ? 5 : 0)
      if (i === 3) {
        expect(GTRDetector.detectGTR(actual).chainCount).toBe(5)
        expect(advice.bestPlacement).toMatchObject({ isIntendedMainFire: true, hasCollateralClear: false })
        expect(outcome.stableGrid.flat().filter(Boolean)).toHaveLength(7)
      }
      actual = outcome.stableGrid
    }
    expect({ grid, pairs, plan }).toEqual(input)
  })

  it.each([0, 1, 2, 3])('checks physical companion acceptance without changing input, shift %i', shift => {
    const ready = board(['.....R', 'RGYBBR', 'RRGYYB', 'GGYRRB'], shift)
    const baseline = createMainFireBaseline(ready)!
    const original = structuredClone({ ready, baseline })
    expect(supportsEveryFiringCompanion(ready, baseline)).toBe(true)
    const restricted = board(['...B..', '...Y..', '...B..', '.GRB..', '.GYBR.', 'RGBRYG', 'RRGBBR', 'GGBYYY'], shift)
    expect(supportsEveryFiringCompanion(restricted, createMainFireBaseline(restricted)!)).toBe(false)
    // Verify the restricted trigger-column enumeration against all legal
    // placements and both axis colors; it must not invent or miss acceptance.
    const head = board(['RB....', 'BBGR..', 'RYBGR.', 'RRYBGR', 'YYBBGR'], shift)
    for (const grid of [ready, restricted, head]) {
      const base = createMainFireBaseline(grid)!
      const exhaustive = palette.every(companion => [false, true].some(swap => {
        const colors = swap ? [companion, base.triggerColor] : [base.triggerColor, companion]
        const current: PuyoPair = { main: { x: 2, y: 1, color: colors[0] }, sub: { x: 2, y: 0, color: colors[1] }, rotation: 0, falling: true }
        for (let column = 0; column < 6; column++) for (let rotation = 0; rotation < 4; rotation++) {
          const fire = analyzeCandidateFire(current, simulateTurn(grid, current, { column, rotation }), base)
          if (fire.isIntendedMainFire && !fire.hasCollateralClear) return true
        }
        return false
      }))
      expect(supportsEveryFiringCompanion(grid, base)).toBe(exhaustive)
    }
    expect({ ready, baseline }).toEqual(original)
    const blocked = structuredClone(ready); blocked[1][2] = color('B', shift)
    expect(supportsEveryFiringCompanion(blocked, baseline)).toBe(false)
    const short = board(['RY....', 'RRY...', 'YY....'], shift)
    expect(supportsEveryFiringCompanion(short, createMainFireBaseline(short)!)).toBe(false)
  })

  it.each([0, 1, 2, 3])('keeps CURRENT firing ahead of rebuilding the reported right edge, shift %i', shift => {
    const grid = board(['...B..', '...Y..', '...B..', '.GRB..', '.GYBR.', 'RGBRYG', 'RRGBBR', 'GGBYYY'], shift)
    const plan = { colorA: color('R', shift), colorB: color('G', shift), colorC: color('R', shift), colorD: color('G', shift) }
    const original = structuredClone(grid)
    const current = pair('RR', shift)
    const best = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, current, pair('RB', shift), pair('BR', shift), plan).bestPlacement!
    expect(best.isIntendedMainFire).toBe(true)
    expect(simulateTurn(grid, current, best.placement).chainCount).toBe(5)
    expect(grid).toEqual(original)
  })
})
