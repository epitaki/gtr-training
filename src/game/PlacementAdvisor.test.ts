import { describe, expect, it } from 'vitest'
import { GamePhase, PlacementAdvisor } from './PlacementAdvisor'
import { GTRDetector } from './GTRPatterns'
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

  it('折り返しだけではGTR完成にしない', () => {
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

    expect(GTRDetector.detectGTR(grid)).toMatchObject({
      hasBasicPattern: true,
      isGTR: false,
      chainCount: 2,
    })
    expect(PlacementAdvisor.isGuidedTargetComplete(grid)).toBe(false)
  })

  it('支持ぷよを含むY字接続で3連鎖になる', () => {
    const grid = emptyGrid()
    const A = PuyoColor.BLUE
    const B = PuyoColor.GREEN
    const C = PuyoColor.RED
    const D = PuyoColor.YELLOW

    grid[12][0] = B
    grid[12][1] = B
    grid[12][2] = C
    grid[12][3] = D
    grid[12][4] = D
    grid[11][0] = A
    grid[11][1] = A
    grid[11][2] = B
    grid[11][3] = C
    grid[11][4] = C
    grid[10][0] = A
    grid[10][1] = B
    grid[10][2] = C

    expect(PlacementAdvisor.getYJointPlan(grid)).toMatchObject({
      colorC: C,
      colorD: D,
      missingColors: [],
      matchedCells: 6,
    })
    expect(GTRDetector.detectGTR(grid)).toMatchObject({
      hasBasicPattern: true,
      isGTR: true,
      chainCount: 3,
    })
    expect(PlacementAdvisor.isGuidedTargetComplete(grid)).toBe(true)
  })

  it('最初の2手からトレーニング色を固定する', () => {
    const opening1 = pair(PuyoColor.BLUE, PuyoColor.BLUE)
    const opening2 = pair(PuyoColor.RED, PuyoColor.YELLOW)

    expect(PlacementAdvisor.createTrainingPlan(opening1, opening2)).toEqual({
      colorA: PuyoColor.RED,
      colorB: PuyoColor.BLUE,
      colorC: PuyoColor.RED,
      colorD: PuyoColor.BLUE,
    })
  })

  it('Y字が残り1セルなら同色ペアにせず安全な支持色を組み合わせる', () => {
    const grid = emptyGrid()
    const A = PuyoColor.RED
    const B = PuyoColor.BLUE
    const trainingPlan = { colorA: A, colorB: B, colorC: A, colorD: B }

    grid[12][0] = B
    grid[12][1] = B
    grid[12][2] = A
    grid[12][3] = B
    grid[12][4] = B
    grid[11][0] = A
    grid[11][1] = A
    grid[11][2] = B
    grid[11][3] = A
    // (4,11) のCだけ未完成
    grid[10][0] = A
    grid[10][1] = B
    grid[10][2] = A

    expect(PlacementAdvisor.getGuidedPairColors(
      grid,
      PuyoColor.GREEN,
      PuyoColor.YELLOW,
      trainingPlan,
    )).toEqual({
      mainColor: A,
      subColor: B,
      stage: 'y_joint',
    })
  })
})
