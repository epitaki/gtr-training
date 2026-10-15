import { describe, expect, it, vi } from 'vitest'
import { PuyoColor, type PuyoPair } from '../core/types'
import { simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { ContinuousAdvisor } from './ContinuousAdvisor'
import { PlacementAdvisor } from './PlacementAdvisor'
import { describeFoldBlockage, getFoldTargets } from './FoldConstruction'

const colors = Object.values(PuyoColor)
const permutations = (remaining: PuyoColor[]): PuyoColor[][] => remaining.length === 0 ? [[]] :
  remaining.flatMap(c => permutations(remaining.filter(other => other !== c)).map(rest => [c, ...rest]))
const fixture = (palette = colors) => {
  const color = (c: string) => palette['RGBY'.indexOf(c)]
  const board = (rows: string[]): PuyoGrid => [
    ...Array.from({ length: 13 - rows.length }, () => Array(6).fill(null)),
    ...rows.map(row => [...row].map(c => c === '.' ? null : color(c))),
  ]
  const pair = (s: string): PuyoPair => ({ main: { color: color(s[0]), x: 2, y: 1 },
    sub: { color: color(s[1]), x: 2, y: 0 }, rotation: 0, falling: true })
  const plan = { colorA: color('G'), colorB: color('B'), colorC: color('G'), colorD: color('B') }
  return { board, pair, plan }
}

describe('standard GTR fold construction safety', () => {
  it.each(permutations(colors))('preserves the necessary blue-below-red orientation under color permutation %j', (...palette) => {
    const { board, pair, plan } = fixture(palette)
    // Recorded feedback, before turn 5. Turn 5 UP buried red in the blue slot.
    const grid = board(['.B....', '.G..R.', 'BBRYY.'])
    const copy = structuredClone(grid)
    const wrong = simulateTurn(grid, pair('RB'), { column: 2, rotation: 0 }).stableGrid
    const correct = simulateTurn(grid, pair('RB'), { column: 2, rotation: 2 }).stableGrid
    expect(PlacementAdvisor.getFoldPlan(wrong)).toBeNull()
    expect(PlacementAdvisor.getFoldPlan(correct, plan)?.missingColors).toEqual([plan.colorA, plan.colorA])
    const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair('RB'), pair('BR'), pair('BG'), plan)
    expect(advice.bestPlacement?.placement).toEqual({ column: 2, rotation: 2 })
    for (const candidate of advice.allPlacements) {
      const outcome = simulateTurn(grid, pair('RB'), candidate.placement)
      expect(outcome.chainCount).toBe(0)
      expect(PlacementAdvisor.getFoldPlan(outcome.stableGrid, plan)).not.toBeNull()
    }
    expect(grid).toEqual(copy)
  })

  it('explains the reported obstruction, hides all ghosts, and resumes after rewinding', () => {
    const { board, pair, plan } = fixture()
    const grid = board(['.BB...', '.GR.RR', 'BBRYYB']), before = structuredClone(grid)
    const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair('BG'), pair('RB'), pair('BB'), plan)
    expect(advice.bestPlacement).toBeNull()
    expect(advice.allPlacements).toEqual([])
    expect(advice.phaseMessage).toContain('3列目・下から2段目の赤')
    expect(advice.phaseMessage).toContain('必要色は青')
    expect(advice.phaseMessage).toContain('積むだけでは完成できません')
    expect(grid).toEqual(before)
    const restored = board(['.B....', '.G..R.', 'BBRYY.'])
    expect(ContinuousAdvisor.getAdvice({ grid: restored, width: 6, height: 13 }, pair('RB'), pair('BR'), pair('BG'), plan)
      .bestPlacement?.placement).toEqual({ column: 2, rotation: 2 })
  })

  it('keeps a color wait and an alternate viable fold distinct from an obstruction', () => {
    const { board, pair, plan } = fixture()
    for (const rows of [[], ['.B....', '.G....', 'BB....'], ['.B....', '.R....', 'BB....']]) {
      const grid = board(rows)
      expect(describeFoldBlockage(grid, plan)).toBeNull()
      expect(ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair('RY'), pair('RY'), pair('RB'), plan)
        .bestPlacement).not.toBeNull()
    }
  })

  it('filters a highly scored fold-blocking fallback before final ranking', () => {
    const { board, pair, plan } = fixture()
    const grid = board(['.B....', '.G..R.', 'BBRYY.'])
    const original = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair('RB'), undefined, undefined, plan)
    const bad = original.allPlacements.find(c => c.placement.column === 2 && c.placement.rotation === 0)!
    const mock = vi.spyOn(PlacementAdvisor, 'getAdvice').mockReturnValue({ ...original,
      bestPlacement: bad, allPlacements: [{ ...bad, totalScore: 1e12 }, ...original.allPlacements.filter(c => c !== bad)] })
    try {
      const result = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair('RB'), undefined, undefined, plan)
      expect(result.bestPlacement).not.toBeNull()
      expect(result.allPlacements.some(c => c.placement.column === 2 && c.placement.rotation === 0)).toBe(false)
    } finally { mock.mockRestore() }
  })

  it('protects the fold in the real fallback failure from fixed game 158', () => {
    const { board, pair } = fixture()
    const grid = board(['R.....', 'R..GG.', 'YYGBBB'])
    const plan = { colorA: PuyoColor.RED, colorB: PuyoColor.YELLOW,
      colorC: PuyoColor.RED, colorD: PuyoColor.YELLOW }
    expect(PlacementAdvisor.getFoldPlan(simulateTurn(grid, pair('GG'), { column: 1, rotation: 0 }).stableGrid)).toBeNull()
    const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair('GG'), pair('GY'), pair('BG'), plan)
    expect(advice.bestPlacement).not.toBeNull()
    const outcome = simulateTurn(grid, pair('GG'), advice.bestPlacement!.placement)
    expect(outcome.chainCount).toBe(0)
    expect(PlacementAdvisor.getFoldPlan(outcome.stableGrid, plan)).not.toBeNull()
  })

  it('does not invent fixed opening colors in the absence of a training plan', () => {
    const { board, pair } = fixture()
    const grid = board([])
    const current = pair('YY')
    const original = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, current)
    const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, current)
    expect(advice.bestPlacement?.placement).toEqual(original.bestPlacement?.placement)
  })

  it('shares exactly the seven bottom fold targets, leaving head and tail space alone', () => {
    const { board, plan } = fixture()
    const targets = getFoldTargets(13, plan)
    expect(targets).toHaveLength(7)
    const grid = board([])
    for (const t of targets) grid[t.y][t.x] = t.color
    expect(PlacementAdvisor.getFoldPlan(grid, plan)?.missingColors).toEqual([])
    grid[9][0] = PuyoColor.RED
    grid[10][2] = PuyoColor.RED
    expect(describeFoldBlockage(grid, plan)).toBeNull()
  })
})
