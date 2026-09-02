import { describe, expect, it } from 'vitest'
import { GamePhase, PlacementAdvisor } from './PlacementAdvisor'
import { PuyoColor, type GameField, type PuyoPair } from './types'

const emptyGrid = () => Array.from(
  { length: 13 },
  () => Array<PuyoColor | null>(6).fill(null),
)

const pair = (main: PuyoColor, sub: PuyoColor): PuyoPair => ({
  main: { color: main, x: 0, y: 0 },
  sub: { color: sub, x: 0, y: 0 },
  rotation: 0,
  falling: true,
})

const field = (grid: (PuyoColor | null)[][]): GameField => ({
  grid,
  width: 6,
  height: 13,
})

describe('PlacementAdvisor', () => {
  it('発火候補を特定の列に固定せず全列から探す', () => {
    const grid = emptyGrid()
    grid[12] = [
      PuyoColor.RED,
      PuyoColor.GREEN,
      PuyoColor.YELLOW,
      PuyoColor.RED,
      PuyoColor.GREEN,
      PuyoColor.BLUE,
    ]
    grid[11][5] = PuyoColor.BLUE
    grid[10][5] = PuyoColor.BLUE

    expect(PlacementAdvisor.analyzeChainPotential(grid)).toMatchObject({
      chainCount: 1,
      clearedPuyos: 4,
      // 6列目の縦3個へ横から接続できる5列目が発火点になる。
      triggerColumn: 4,
      triggerColor: PuyoColor.BLUE,
    })
  })

  it('折り返し完成後も、ぷよ数だけで完成フェーズにしない', () => {
    const grid = emptyGrid()
    const A = PuyoColor.BLUE
    const B = PuyoColor.GREEN

    grid[12][0] = B
    grid[12][1] = B
    grid[11][0] = A
    grid[11][1] = A
    grid[11][2] = B
    grid[10][0] = A
    grid[10][1] = B

    // 右側を6個埋めても、消える順序がなければまだ連鎖尾構築中。
    grid[12][3] = PuyoColor.RED
    grid[11][3] = PuyoColor.YELLOW
    grid[12][4] = PuyoColor.YELLOW
    grid[11][4] = PuyoColor.RED
    grid[12][5] = PuyoColor.RED
    grid[11][5] = PuyoColor.YELLOW

    const advice = PlacementAdvisor.getAdvice(
      field(grid),
      pair(PuyoColor.BLUE, PuyoColor.RED),
    )

    expect(advice.phase).toBe(GamePhase.CHAIN_TAIL)
  })

  it('現在手の消去を解決してから次の発火候補を調べる', () => {
    const grid = emptyGrid()
    grid[12][0] = PuyoColor.BLUE
    grid[12][1] = PuyoColor.BLUE
    grid[12][2] = PuyoColor.BLUE
    grid[12][3] = PuyoColor.BLUE

    // 未解決の4個へ仮想の5個目を足して評価してはいけない。
    expect(PlacementAdvisor.analyzeChainPotential(grid)).toMatchObject({
      chainCount: 0,
      clearedPuyos: 0,
      triggerColumn: null,
      triggerColor: null,
    })
  })

  it('途中まで組んだ折り返しから必要色を返す', () => {
    const grid = emptyGrid()
    grid[12][0] = PuyoColor.GREEN
    grid[12][1] = PuyoColor.GREEN
    grid[11][0] = PuyoColor.BLUE

    const plan = PlacementAdvisor.getFoldPlan(grid)

    expect(plan).not.toBeNull()
    expect(plan?.colorA).toBe(PuyoColor.BLUE)
    expect(plan?.colorB).toBe(PuyoColor.GREEN)
    expect(plan?.missingColors).toEqual([
      PuyoColor.BLUE,
      PuyoColor.GREEN,
      PuyoColor.BLUE,
      PuyoColor.GREEN,
    ])
  })
})
