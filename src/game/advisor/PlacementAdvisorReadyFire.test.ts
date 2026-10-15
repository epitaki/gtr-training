import { describe, expect, it } from 'vitest'
import { PlacementAdvisor } from './PlacementAdvisor'
import { simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'

const { RED: R, YELLOW: Y, BLUE: B, GREEN: G } = PuyoColor
const colors: Record<string, PuyoColor> = { R, Y, B, G }
const pair = ([main, sub]: readonly PuyoColor[]): PuyoPair => ({
  main: { color: main, x: 2, y: 1 }, sub: { color: sub, x: 2, y: 0 }, rotation: 0, falling: true,
})
const gridFrom = (encoded: string): PuyoGrid => Array.from({ length: 13 }, (_, y) =>
  [...encoded.slice(y * 6, y * 6 + 6)].map(color => colors[color] ?? null),
)

// Real missed fires from the preserved 500-game baseline; no seed is passed to the advisor.
const cases = [
  { id: 99, grid: '.................................R.....B.....Y....YY...YGBY.RYGBB.RRYGGGYYGBBR', current: [R, G], next: [G, B], next2: [B, Y], fold: [R, Y] },
  { id: 158, grid: '............................B.....BY...GGB...BRB.G.BRG.GBYBGRYGBBGRRYGGBYYGBGB', current: [R, R], next: [B, G], next2: [R, R], fold: [R, Y] },
  { id: 256, grid: '..................................R....RR....GG....GR....BGRRYBGGBRRYBBGYYBRRG', current: [R, R], next: [G, B], next2: [B, G], fold: [R, Y] },
  { id: 377, grid: '...............................R.G...R.G...Y.BB..YYGG..BBBGBGRYRBBGGRYRRRRYYRY', current: [G, B], next: [B, Y], next2: [B, R], fold: [G, R] },
] as const

describe('completed main-chain firing priority', () => {
  it.each(cases)('takes an available five-chain in noncanonical game $id', sample => {
    const grid = gridFrom(sample.grid)
    const plan = { colorA: sample.fold[0], colorB: sample.fold[1], colorC: sample.fold[0], colorD: sample.fold[1] }
    expect(PlacementAdvisor.isAdaptiveTailComplete(grid, plan)).toBe(true)
    const current = pair(sample.current)
    const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, current, pair(sample.next), pair(sample.next2), plan)
    expect(advice.bestPlacement).toMatchObject({ isIntendedMainFire: true, hasCollateralClear: false, intendedMainChainCount: 5 })
    expect(simulateTurn(grid, current, advice.bestPlacement!.placement).chainCount).toBeGreaterThanOrEqual(5)
  })

  it('does not label a future firing pair as an immediate fire', () => {
    const sample = cases[0]
    const grid = gridFrom(sample.grid)
    const plan = { colorA: R, colorB: Y, colorC: R, colorD: Y }
    const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair([B, B]), pair([R, G]), pair([Y, G]), plan)
    expect(advice.allPlacements.every(candidate => !candidate.isIntendedMainFire)).toBe(true)
  })

  it.each([1, 2, 3])('preserves firing priority after a color rotation of %i', offset => {
    const palette = [R, Y, B, G]
    const rename = (color: PuyoColor) => palette[(palette.indexOf(color) + offset) % palette.length]
    const sample = cases[0]
    const grid = gridFrom(sample.grid).map(row => row.map(color => color === null ? null : rename(color)))
    const plan = { colorA: rename(R), colorB: rename(Y), colorC: rename(R), colorD: rename(Y) }
    const current = pair(sample.current.map(rename))
    const advice = PlacementAdvisor.getAdvice(
      { grid, width: 6, height: 13 }, current,
      pair(sample.next.map(rename)), pair(sample.next2.map(rename)), plan,
    )
    expect(advice.bestPlacement).toMatchObject({ isIntendedMainFire: true, hasCollateralClear: false, intendedMainChainCount: 5 })
    expect(simulateTurn(grid, current, advice.bestPlacement!.placement).chainCount).toBeGreaterThanOrEqual(5)
  })
})
