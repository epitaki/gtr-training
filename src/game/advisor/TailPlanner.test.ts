import { describe, expect, it } from 'vitest'
import { PuyoColor } from '../core/types'
import { TailPlanner } from './TailPlanner'

const emptyGrid = () => Array.from(
  { length: 13 },
  () => Array<PuyoColor | null>(6).fill(null),
)

describe('TailPlanner', () => {
  it('returns no templates for grids too small to contain their chain cells', () => {
    expect(TailPlanner.getPlans([])).toEqual([])
    expect(TailPlanner.getPlans([[null, null]])).toEqual([])
  })

  it('同色の余剰ぷよで完成前に4連結する候補を除外する', () => {
    const grid = emptyGrid()
    grid[12][5] = PuyoColor.GREEN
    grid[11][5] = PuyoColor.GREEN
    const plans = TailPlanner.getPlans(grid, PuyoColor.YELLOW)
    // The three horizontal green arms plus the spare below the right arm
    // would clear immediately, before the fold can feed this tail.
    expect(plans.some(plan => plan.shape === 'zabuton' && plan.color === PuyoColor.GREEN)).toBe(false)
    expect(plans.some(plan => plan.shape === 'Y' && plan.color === PuyoColor.RED)).toBe(true)
  })

  it('Y字・座布団・L字を、どれも候補から排除せずに扱う', () => {
    const plans = TailPlanner.getPlans(emptyGrid(), PuyoColor.YELLOW)

    expect(new Set(plans.map(plan => plan.shape))).toEqual(
      new Set(['Y', 'zabuton', 'L']),
    )
    expect(plans.every(plan => plan.color !== PuyoColor.YELLOW)).toBe(true)
  })

  it('折り返し側から置いた異色ペアをY字の連鎖色と支持ぷよに使う', () => {
    const before = emptyGrid()
    before[12][4] = PuyoColor.YELLOW
    before[12][5] = PuyoColor.GREEN
    const after = before.map(row => [...row])
    after[12][2] = PuyoColor.RED
    after[12][3] = PuyoColor.GREEN

    const progress = TailPlanner.evaluatePlacement(
      before,
      after,
      {
        mainPos: { x: 3, y: 12 },
        subPos: { x: 2, y: 12 },
        valid: true,
      },
      PuyoColor.YELLOW,
    )

    expect(progress.plan).toMatchObject({ shape: 'Y', color: PuyoColor.RED })
    expect(progress).toMatchObject({
      newChainCells: 1,
      newSupportCells: 1,
    })
  })

  it('同色の縦横配置をL字候補として優先する', () => {
    const before = emptyGrid()
    before[12][2] = PuyoColor.RED
    const after = before.map(row => [...row])
    after[12][3] = PuyoColor.RED
    after[11][3] = PuyoColor.RED

    const progress = TailPlanner.evaluatePlacement(
      before,
      after,
      {
        mainPos: { x: 3, y: 12 },
        subPos: { x: 3, y: 11 },
        valid: true,
      },
      PuyoColor.YELLOW,
    )

    expect(progress.plan).toMatchObject({ shape: 'L', color: PuyoColor.RED })
    expect(progress.newChainCells).toBe(2)
  })

  it('新しい別形を進めても既存のY字連鎖色を塞げば破壊と判定する', () => {
    const before = emptyGrid()
    before[12][2] = PuyoColor.GREEN
    before[12][3] = PuyoColor.YELLOW
    before[12][4] = PuyoColor.YELLOW
    before[12][5] = PuyoColor.YELLOW
    const after = before.map(row => [...row])
    after[10][2] = PuyoColor.BLUE
    after[9][2] = PuyoColor.GREEN

    const progress = TailPlanner.evaluatePlacement(
      before,
      after,
      {
        mainPos: { x: 2, y: 9 },
        subPos: { x: 2, y: 10 },
        valid: true,
      },
      PuyoColor.YELLOW,
    )

    expect(progress.plan).toMatchObject({
      shape: 'zabuton',
      color: PuyoColor.BLUE,
    })
    expect(progress.newChainCells).toBe(1)
    expect(progress.blocksEstablishedPlan).toBe(true)
  })

  it('既存の連鎖色に続くY字候補を優先する', () => {
    const before = emptyGrid()
    before[12][2] = PuyoColor.GREEN
    const after = before.map(row => [...row])
    after[10][2] = PuyoColor.GREEN
    after[9][2] = PuyoColor.BLUE

    const progress = TailPlanner.evaluatePlacement(
      before,
      after,
      {
        mainPos: { x: 2, y: 10 },
        subPos: { x: 2, y: 9 },
        valid: true,
      },
      PuyoColor.YELLOW,
    )

    expect(progress.plan).toMatchObject({ shape: 'Y', color: PuyoColor.GREEN })
    expect(progress.previousMatchedChainCells).toBe(1)
  })
})
