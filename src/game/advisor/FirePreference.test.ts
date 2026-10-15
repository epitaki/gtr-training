import { describe, expect, it } from 'vitest'
import { compareFirePreference, inspectFirePreference, type FirePreference } from './FirePreference'
import { PlacementAdvisor } from './PlacementAdvisor'
import { simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'

const fire = (overrides: Partial<FirePreference> = {}): FirePreference =>
  ({ depth: 0, collateral: false, surfaceCost: 0, leftovers: 0, ...overrides })
const palette = [PuyoColor.RED, PuyoColor.BLUE, PuyoColor.YELLOW, PuyoColor.GREEN]
// Saved actual firing boards, not a game-id exception in the advisor.
const cases = [
  { id: 2, grid: '..........................................................YYYRGBYBYYRGGYRRGBBY', pair: 'GY', fold: 'YR', before: 2 },
  { id: 14, grid: '...........................................GY.RG.YGGRY.GBGYGBYRYYBBBYRRYYYRBBY', pair: 'BG', fold: 'BY', before: 7 },
  { id: 53, grid: '...........................................R...Y.GYBGR.GBGGBRGYBYBRRGYGGGGYYBG', pair: 'RY', fold: 'RG', before: 8 },
  { id: 254, grid: '.................................................Y.....GYR..GYRBRRGGYRBBYYRRBR', pair: 'RG', fold: 'GY', before: 2 },
]

describe('verified fire leftovers', () => {
  it('records masked pre-fire evidence separately from the real physical fire and leftovers', () => {
    const colors: Record<string, PuyoColor> = { R: PuyoColor.RED, B: PuyoColor.BLUE, Y: PuyoColor.YELLOW, G: PuyoColor.GREEN }
    const grid: PuyoGrid = [...Array.from({ length: 5 }, () => Array(6).fill(null)),
      ...['...B..', '...Y..', '...B..', '.GRB..', '.GYBR.', 'RGBRYG', 'RRGBBR', 'GGBYYY']
        .map(row => [...row].map(c => colors[c] ?? null))]
    const pair: PuyoPair = { main: { color: PuyoColor.RED, x: 2, y: 1 },
      sub: { color: PuyoColor.RED, x: 2, y: 0 }, rotation: 0, falling: true }
    const input = structuredClone(grid)
    const outcome = simulateTurn(grid, pair, { column: 0, rotation: 0 })
    expect(outcome.chainCount).toBe(5)
    expect(inspectFirePreference(outcome, 0, false, 0, grid)).toMatchObject({ foundationChains: 4, leftovers: 6 })
    expect(grid).toEqual(input)
  })
  it('prefers the completed foundation among equally early and clean fires, then compares geometry', () => {
    expect(compareFirePreference(fire({ depth: 1, leftovers: 3, foundationChains: 5 }),
      fire({ depth: 1, leftovers: 3, foundationChains: 4 }))).toBeLessThan(0)
    expect(compareFirePreference(fire({ foundationChains: 1, leftovers: 78 }),
      fire({ depth: 1, foundationChains: 5 }))).toBeLessThan(0)
    expect(compareFirePreference(fire({ foundationChains: 1 }),
      fire({ collateral: true, foundationChains: 5 }))).toBeLessThan(0)
    expect(compareFirePreference(fire({ foundationChains: 1 }),
      fire({ surfaceCost: 45, foundationChains: 5 }))).toBeGreaterThan(0)
    expect(compareFirePreference(fire({ foundationChains: 5, leftovers: 7 }),
      fire({ surfaceCost: 45, foundationChains: 5 }))).toBeLessThan(0)
  })
  it('never exchanges an earlier fire, clean main, or absence of a tall well for fewer leftovers', () => {
    expect(compareFirePreference(fire({ leftovers: 78 }), fire({ depth: 1 }))).toBeLessThan(0)
    expect(compareFirePreference(fire({ leftovers: 78 }), fire({ collateral: true }))).toBeLessThan(0)
    expect(compareFirePreference(fire({ leftovers: 78 }), fire({ surfaceCost: 45 }))).toBeLessThan(0)
    expect(compareFirePreference(fire({ leftovers: 2 }), fire({ leftovers: 3 }))).toBeLessThan(0)
    expect(compareFirePreference(fire(), undefined)).toBeLessThan(0)
    expect(compareFirePreference(undefined, fire())).toBeGreaterThan(0)
    expect(compareFirePreference(undefined, undefined)).toBe(0)
  })

  it('uses real leftovers within the safe band and geometry within the risky band', () => {
    expect(compareFirePreference(fire({ leftovers: 7 }), fire({ surfaceCost: 1, leftovers: 5 }))).toBeGreaterThan(0)
    expect(compareFirePreference(fire({ surfaceCost: 44, leftovers: 7 }), fire({ surfaceCost: 45, leftovers: 0 }))).toBeLessThan(0)
    expect(compareFirePreference(fire({ surfaceCost: 45, leftovers: 7 }), fire({ surfaceCost: 46, leftovers: 0 }))).toBeLessThan(0)
    expect(compareFirePreference(fire({ surfaceCost: 1, leftovers: 5 }), fire({ surfaceCost: 2, leftovers: 5 }))).toBeLessThan(0)
  })

  it('has a transitive ordering across all risk bands', () => {
    const values = [0, 1, 44, 45, 46, 90].flatMap(surfaceCost => [0, 5, 78].map(leftovers => fire({surfaceCost, leftovers})))
    for (const a of values) for (const b of values) for (const c of values) {
      if (compareFirePreference(a,b) <= 0 && compareFirePreference(b,c) <= 0) expect(compareFirePreference(a,c)).toBeLessThanOrEqual(0)
    }
  })

  for (const sample of cases) it.each([0, 1, 2, 3])(`clears the firing companion in game ${sample.id}, color shift %i`, shift => {
    const color = (c: string) => palette[('RBYG'.indexOf(c) + shift) % 4]
    const grid: PuyoGrid = sample.grid.match(/.{6}/g)!.map(row => [...row].map(c => c === '.' ? null : color(c)))
    const pair: PuyoPair = { main: { color: color(sample.pair[0]), x: 2, y: 1 },
      sub: { color: color(sample.pair[1]), x: 2, y: 0 }, rotation: 0, falling: true }
    const plan = { colorA: color(sample.fold[0]), colorB: color(sample.fold[1]),
      colorC: color(sample.fold[0]), colorD: color(sample.fold[1]) }
    const snapshot = JSON.stringify({ grid, pair, plan })
    // Both skeleton and general scoring must use the same final comparison.
    for (const training of [plan, undefined]) {
      const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair, undefined, undefined, training)
      expect(advice.bestPlacement).toMatchObject({ isIntendedMainFire: true, hasCollateralClear: false })
      const result = simulateTurn(grid, pair, advice.bestPlacement!.placement)
      expect(result.chainCount).toBeGreaterThanOrEqual(5)
      expect(result.stableGrid.flat().filter(c => c !== null)).toHaveLength(sample.before - 1)
    }
    expect(JSON.stringify({ grid, pair, plan })).toBe(snapshot)
  })
})
