import { describe, expect, it } from 'vitest'
import fixtures from './fixtures/unrecognized-tail-fires.json'
import { PlacementAdvisor } from './PlacementAdvisor'
import { FIVE_CHAIN_REWARDS } from './FiveChainPlanner'
import { GTRDetector } from '../gtr/GTRPatterns'
import { simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'
import { surfaceShapeCost } from './BoardSurface'

const palette = Object.values(PuyoColor)
const symbols: Record<string, PuyoColor> = { R: PuyoColor.RED, G: PuyoColor.GREEN, B: PuyoColor.BLUE, Y: PuyoColor.YELLOW }
interface Sample {
  grid: string; current: string[]; next: string[]; next2: string[]; fold: string[]
}
const setup = (sample: Sample, shift = 0) => {
  const rename = (color: string): PuyoColor => {
    const index = palette.indexOf(color as PuyoColor)
    if (index < 0) throw new Error('Invalid fixture color')
    return palette[(index + shift) % palette.length]
  }
  const pair = (colors: string[]): PuyoPair => ({
    main: { color: rename(colors[0]), x: 2, y: 1 }, sub: { color: rename(colors[1]), x: 2, y: 0 },
    rotation: 0, falling: true,
  })
  if (sample.grid.length !== 78) throw new Error('Invalid fixture grid')
  const grid: PuyoGrid = Array.from({ length: 13 }, (_, y) => [...sample.grid.slice(y * 6, y * 6 + 6)]
    .map(symbol => symbol === '.' ? null : rename(symbols[symbol])))
  return { field: { grid, width: 6, height: 13 }, current: pair(sample.current), next: pair(sample.next), next2: pair(sample.next2),
    plan: { colorA: rename(sample.fold[0]), colorB: rename(sample.fold[1]), colorC: rename(sample.fold[0]), colorD: rename(sample.fold[1]) } }
}
const guards: (Sample & { id: number })[] = [
  {
    id: 651, grid: '..........................Y....YRY.Y.YYR.G.GRY.Y.YYR.Y.YRB.YBRGR.GBBRGGBRRGRRB',
    current: ['blue', 'yellow'], next: ['green', 'red'], next2: ['blue', 'yellow'], fold: ['blue', 'red'],
  },
  {
    id: 43, grid: '...............................G.....RR....RGB.B.GRB.B.YRR.BRYGG.YRRYBBBYYGGRR',
    current: ['red', 'red'], next: ['yellow', 'yellow'], next2: ['blue', 'yellow'], fold: ['red', 'yellow'],
  },
]
const cases = fixtures.cases.flatMap(sample => [0, 1, 2, 3].map(shift => ({ ...sample, shift })))
// The discarded lookahead relaxation fired before finishing these teaching
// shapes. Preserve construction when CURRENT cannot already fire the main chain.
const constructionCases = [
  { id: 301, grid: '.............................................Y.G.RGG.G.GYG.GRGBY.RRRGB.GGGBYYG',
    current: ['red', 'red'], next: ['red', 'blue'], next2: ['blue', 'red'], fold: ['red', 'green'],
    expected: { column: 1, rotation: 1 } },
  { id: 620, grid: '...........................................Y.....YYB...GRY..YBGR..YYBG..BBGRR.',
    current: ['blue', 'green'], next: ['yellow', 'red'], next2: ['blue', 'red'], fold: ['yellow', 'blue'],
    expected: { column: 3, rotation: 1 } },
  { id: 726, grid: '...................B.....R.....GY....GYY.B.YGG.G.BBR.B.RBY.GGYRB.GGGYR.YYYRBBY',
    current: ['red', 'yellow'], next: ['blue', 'green'], next2: ['yellow', 'red'], fold: ['green', 'yellow'],
    expected: { column: 4, rotation: 0 } },
  { id: 930, grid: '.................................................R.....BG...YGB..GYYGB.RGGBGGR',
    current: ['red', 'red'], next: ['green', 'red'], next2: ['green', 'yellow'], fold: ['yellow', 'green'],
    expected: { column: 5, rotation: 0 } },
].flatMap(sample => [0, 1, 2, 3].map(shift => ({ ...sample, shift })))

describe('ready main fire without a recognized tail shape', () => {
  it('preserves all 30 reported positions from 14 games', () => {
    expect(fixtures.cases).toHaveLength(30)
    expect(new Set(fixtures.cases.map(sample => sample.id)).size).toBe(14)
  })

  it.each(cases)('fires game $id turn $turn, color rotation $shift', sample => {
    const s = setup(sample, sample.shift)
    const snapshot = JSON.stringify(s)
    expect(PlacementAdvisor.isAdaptiveTailComplete(s.field.grid, s.plan)).toBe(false)
    expect(GTRDetector.getFullBoardChainCount(s.field.grid)).toBe(sample.expectedChain)
    const advice = PlacementAdvisor.getAdvice(s.field, s.current, s.next, s.next2, s.plan)
    expect(advice.bestPlacement).toMatchObject({
      isIntendedMainFire: true, hasCollateralClear: false, intendedMainChainCount: sample.expectedChain,
      totalScore: FIVE_CHAIN_REWARDS.BASE + FIVE_CHAIN_REWARDS.FIRE,
    })
    const fired = simulateTurn(s.field.grid, s.current, advice.bestPlacement!.placement)
    expect(fired.valid).toBe(true)
    expect(fired.chainCount).toBeGreaterThanOrEqual(sample.expectedChain)
    // Prefer the verified fire without redefining the teaching shape as complete.
    expect(PlacementAdvisor.isAdaptiveTailComplete(s.field.grid, s.plan)).toBe(false)
    expect(JSON.stringify(s)).toBe(snapshot)
  })

  it('uses the same actual-fire priority without a prescribed color plan', () => {
    const s = setup(fixtures.cases[0])
    const advice = PlacementAdvisor.getAdvice(s.field, s.current, s.next, s.next2)
    expect(advice.bestPlacement).toMatchObject({ isIntendedMainFire: true, hasCollateralClear: false, intendedMainChainCount: 5 })
  })

  it.each(constructionCases)('preserves tail construction in game $id, color rotation $shift', sample => {
    const s = setup(sample, sample.shift)
    const advice = PlacementAdvisor.getAdvice(s.field, s.current, s.next, s.next2, s.plan)
    expect(advice.allPlacements.every(candidate => !candidate.isIntendedMainFire)).toBe(true)
    const selected = simulateTurn(s.field.grid, s.current, advice.bestPlacement!.placement)
    expect(selected.chainCount).toBe(0)
    const previous = simulateTurn(s.field.grid, s.current, sample.expected)
    if (JSON.stringify(selected.stableGrid) === JSON.stringify(previous.stableGrid)) return
    if (!PlacementAdvisor.isAdaptiveTailComplete(previous.stableGrid, s.plan)) {
      // Some stored choices (930) were still construction, not a ready tail.
      // A different construction order is allowed without claiming a fire.
      expect(advice.bestPlacement!.totalScore).toBeLessThan(FIVE_CHAIN_REWARDS.BASE + FIVE_CHAIN_REWARDS.FIRE - 1000)
      expect(PlacementAdvisor.getFoldPlan(selected.stableGrid, s.plan)?.missingColors).toEqual([])
      expect(PlacementAdvisor.getTailPlans(selected.stableGrid, s.plan).length).toBeGreaterThan(0)
      expect(GTRDetector.getFullBoardChainCount(selected.stableGrid)).toBeGreaterThanOrEqual(GTRDetector.getFullBoardChainCount(previous.stableGrid))
      expect(surfaceShapeCost(selected.stableGrid)).toBeLessThanOrEqual(surfaceShapeCost(previous.stableGrid))
      return
    }
    // D may choose a lower equivalent (620). Do not accept a different board
    // merely for being flatter: BOTH must finish the teaching tail now and
    // fire a clean five with the same NEXT, without increasing leftovers.
    // This still rejects the old relaxation that skipped the teaching tail.
    const fires = [previous, selected].map(result => {
      expect(PlacementAdvisor.isAdaptiveTailComplete(result.stableGrid, s.plan)).toBe(true)
      const next = PlacementAdvisor.getAdvice({ ...s.field, grid: result.stableGrid }, s.next, s.next2, undefined, s.plan)
      expect(next.bestPlacement).toMatchObject({ isIntendedMainFire: true, hasCollateralClear: false })
      const fired = simulateTurn(result.stableGrid, s.next, next.bestPlacement!.placement)
      expect(fired.chainCount).toBeGreaterThanOrEqual(5)
      return fired
    })
    expect(fires[1].chainCount).toBeGreaterThanOrEqual(fires[0].chainCount)
    expect(fires[1].stableGrid.flat().filter(Boolean).length).toBeLessThanOrEqual(fires[0].stableGrid.flat().filter(Boolean).length)
    expect(surfaceShapeCost(selected.stableGrid)).toBeLessThan(surfaceShapeCost(previous.stableGrid))
  })

  it('does not treat the firing color in NEXT as a current fire', () => {
    const sample = fixtures.cases[0]
    const s = setup(sample)
    const absent = palette.find(color => color !== s.field.grid[10][0])!
    const current = { ...s.current, main: { ...s.current.main, color: absent }, sub: { ...s.current.sub, color: absent } }
    const advice = PlacementAdvisor.getAdvice(s.field, current, s.current, s.next, s.plan)
    expect(advice.allPlacements.every(candidate => !candidate.isIntendedMainFire)).toBe(true)
    expect(advice.bestPlacement!.totalScore).toBeLessThan(FIVE_CHAIN_REWARDS.BASE + FIVE_CHAIN_REWARDS.FIRE)
  })

  it.each([0, 1, 2, 3])('rejects a companion that destroys the five-chain (game 651, rotation %i)', shift => {
    const s = setup(guards[0], shift)
    expect(GTRDetector.getFullBoardChainCount(s.field.grid)).toBe(5)
    expect(simulateTurn(s.field.grid, s.current, { column: 0, rotation: 0 }).chainCount).toBe(4)
    const advice = PlacementAdvisor.getAdvice(s.field, s.current, s.next, s.next2, s.plan)
    expect(advice.allPlacements.every(candidate => !candidate.isIntendedMainFire)).toBe(true)
    expect(advice.bestPlacement!.immediateChainCount).toBe(0)
  })

  it('does not award five-chain terminal priority to a four-chain', () => {
    const s = setup(guards[1])
    expect(GTRDetector.getFullBoardChainCount(s.field.grid)).toBe(4)
    const advice = PlacementAdvisor.getAdvice(s.field, s.current, s.next, s.next2, s.plan)
    const fires = advice.allPlacements.filter(candidate => candidate.isIntendedMainFire)
    expect(fires.length).toBeGreaterThan(0)
    expect(fires.every(candidate =>
      candidate.intendedMainChainCount === 4 && candidate.totalScore < FIVE_CHAIN_REWARDS.BASE)).toBe(true)
    expect(advice.bestPlacement!.totalScore).toBeLessThan(FIVE_CHAIN_REWARDS.BASE)
  })
})
