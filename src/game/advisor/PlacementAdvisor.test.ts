import { describe, expect, it } from 'vitest'
import { GamePhase, PlacementAdvisor } from './PlacementAdvisor'
import { GTRDetector } from '../gtr/GTRPatterns'
import { simulateTurn } from '../core/ChainSimulator'
import { PuyoColor, type GameField, type PuyoPair } from '../core/types'

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

  it('実際に3連鎖するL字を適応型連鎖尾の完成として認識する', () => {
    const grid = emptyGrid()
    const A = PuyoColor.BLUE
    const B = PuyoColor.GREEN
    const C = PuyoColor.RED

    grid[12][0] = B
    grid[12][1] = B
    grid[12][2] = C
    grid[12][3] = C
    grid[11][0] = A
    grid[11][1] = A
    grid[11][2] = B
    grid[11][3] = C
    grid[10][0] = A
    grid[10][1] = B
    grid[10][2] = C

    expect(GTRDetector.detectGTR(grid).chainCount).toBe(3)
    expect(PlacementAdvisor.getCompletedTailShape(grid)).toBe('L')
    expect(PlacementAdvisor.isAdaptiveTailComplete(grid)).toBe(true)
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

  it('連鎖尾構築中の早撃ちには暴発ペナルティを残す', () => {
    const grid = emptyGrid()
    const A = PuyoColor.BLUE
    const B = PuyoColor.GREEN
    const support = PuyoColor.RED

    grid[12][0] = B
    grid[12][1] = B
    grid[12][2] = support
    grid[11][0] = A
    grid[11][1] = A
    grid[11][2] = B
    grid[10][0] = A
    grid[10][1] = B

    const advice = PlacementAdvisor.getAdvice(
      field(grid),
      pair(A, PuyoColor.YELLOW),
    )
    const earlyFire = advice.allPlacements.find(candidate =>
      candidate.placement.column === 0 && candidate.placement.rotation === 0,
    )

    expect(advice.phase).toBe(GamePhase.CHAIN_TAIL)
    expect(earlyFire).toMatchObject({
      immediateChainCount: 2,
      clearedPuyos: 8,
      isIntendedMainFire: false,
      hasCollateralClear: false,
    })
    expect(earlyFire!.totalScore).toBeLessThan(0)
  })

  it('完成フェーズの実発火候補を一律の暴発ペナルティで除外しない', () => {
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

    const advice = PlacementAdvisor.getAdvice(
      field(grid),
      pair(A, D),
    )
    const firing = advice.allPlacements.find(candidate =>
      candidate.placement.column === 0 && candidate.placement.rotation === 0,
    )
    const expandedAdvice = PlacementAdvisor.getAdvice(field(grid), pair(A, A))
    const expandedFire = expandedAdvice.allPlacements.find(candidate =>
      candidate.placement.column === 0 && candidate.placement.rotation === 0,
    )

    expect(advice.phase).toBe(GamePhase.COMPLETION)
    expect(firing).toMatchObject({
      immediateChainCount: 3,
      clearedPuyos: 12,
      isIntendedMainFire: true,
      hasCollateralClear: false,
    })
    expect(firing!.totalScore).toBeGreaterThan(0)
    expect(expandedFire).toMatchObject({
      immediateChainCount: 3,
      clearedPuyos: 13,
      isIntendedMainFire: true,
      hasCollateralClear: false,
    })
  })

  it('完成盤面でも本線と無関係な消去は暴発として扱う', () => {
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

    const advice = PlacementAdvisor.getAdvice(field(grid), pair(D, D))
    const sideClear = advice.allPlacements.find(candidate =>
      candidate.placement.column === 5 && candidate.placement.rotation === 0,
    )

    expect(advice.phase).toBe(GamePhase.COMPLETION)
    expect(sideClear).toMatchObject({
      immediateChainCount: 1,
      clearedPuyos: 4,
      isIntendedMainFire: false,
      hasCollateralClear: false,
    })
    expect(sideClear!.totalScore).toBeLessThan(0)
  })

  it('本線と同時に相方が作る独立消去だけを副次消去として減点する', () => {
    const grid = emptyGrid()
    const A = PuyoColor.BLUE
    const B = PuyoColor.GREEN
    const C = PuyoColor.RED
    const D = PuyoColor.YELLOW

    grid[12][0] = B
    grid[12][1] = B
    grid[12][2] = C
    grid[12][3] = A
    grid[12][4] = B
    grid[11][0] = A
    grid[11][1] = A
    grid[11][2] = B
    grid[11][3] = C
    grid[11][4] = C
    grid[10][0] = A
    grid[10][1] = B
    grid[10][2] = C

    // 発火口と同じ高さへ相方Dを横置きすると、右側のD3個も別グループで同時消去する。
    grid[9][2] = D
    grid[8][2] = D
    grid[10][3] = A
    grid[9][3] = D

    const advice = PlacementAdvisor.getAdvice(field(grid), pair(A, D))
    const cleanFire = advice.allPlacements.find(candidate =>
      candidate.placement.column === 0 && candidate.placement.rotation === 0,
    )
    const collateralFire = advice.allPlacements.find(candidate =>
      candidate.placement.column === 0 && candidate.placement.rotation === 1,
    )

    expect(advice.phase).toBe(GamePhase.COMPLETION)
    expect(cleanFire).toMatchObject({
      immediateChainCount: 3,
      clearedPuyos: 12,
      isIntendedMainFire: true,
      hasCollateralClear: false,
    })
    expect(collateralFire).toMatchObject({
      immediateChainCount: 3,
      clearedPuyos: 16,
      isIntendedMainFire: true,
      hasCollateralClear: true,
    })
    expect(collateralFire!.totalScore).toBeLessThan(cleanFire!.totalScore)
  })

  it('重力後に成立する副次消去にも暴発ペナルティを適用する', () => {
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
    grid[9][2] = D

    const advice = PlacementAdvisor.getAdvice(field(grid), pair(A, D))
    const cleanFire = advice.allPlacements.find(candidate =>
      candidate.placement.column === 0 && candidate.placement.rotation === 0,
    )
    const delayedCollateralFire = advice.allPlacements.find(candidate =>
      candidate.placement.column === 0 && candidate.placement.rotation === 1,
    )

    expect(cleanFire).toMatchObject({
      immediateChainCount: 3,
      isIntendedMainFire: true,
      hasCollateralClear: false,
    })
    expect(delayedCollateralFire).toMatchObject({
      immediateChainCount: 4,
      isIntendedMainFire: true,
      hasCollateralClear: true,
      intendedMainChainCount: 3,
      intendedMainClearedPuyos: 12,
    })
    expect(delayedCollateralFire!.totalScore).toBeLessThan(cleanFire!.totalScore)
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

  it('2手目で土台色を置けるときは右端へ逃がさず折り返しを優先する', () => {
    const grid = emptyGrid()
    const opening1 = pair(PuyoColor.GREEN, PuyoColor.YELLOW)
    const opening2 = pair(PuyoColor.GREEN, PuyoColor.RED)
    const trainingPlan = PlacementAdvisor.createTrainingPlan(opening1, opening2)
    grid[12][0] = PuyoColor.GREEN
    grid[11][0] = PuyoColor.YELLOW

    const advice = PlacementAdvisor.getAdvice(
      field(grid),
      opening2,
      pair(PuyoColor.YELLOW, PuyoColor.RED),
      pair(PuyoColor.BLUE, PuyoColor.BLUE),
      trainingPlan,
    )

    expect(advice.phase).toBe(GamePhase.FOLD_BUILDING)
    expect(advice.bestPlacement?.placement).toEqual({ column: 1, rotation: 1 })
    expect(advice.bestPlacement?.landing).toMatchObject({
      mainPos: { x: 1, y: 12 },
      subPos: { x: 2, y: 12 },
    })
    const placed = grid.map(row => [...row])
    placed[12][1] = PuyoColor.GREEN
    placed[12][2] = PuyoColor.RED
    expect(PlacementAdvisor.getYJointPlan(placed, trainingPlan)).toMatchObject({
      colorC: PuyoColor.RED,
      colorD: PuyoColor.GREEN,
    })
  })

  it('折り返し色がない手は右端へ縦捨てせず左から連鎖尾候補へ置く', () => {
    const grid = emptyGrid()
    const A = PuyoColor.RED
    const B = PuyoColor.YELLOW
    const cells: [number, number, PuyoColor][] = [
      [12, 0, B], [11, 0, A], [10, 0, A],
      [12, 1, B], [11, 1, A], [10, 1, B], [9, 1, PuyoColor.BLUE], [8, 1, PuyoColor.GREEN],
      [12, 4, B],
      [12, 5, PuyoColor.GREEN], [11, 5, PuyoColor.GREEN],
      [10, 5, PuyoColor.BLUE], [9, 5, PuyoColor.GREEN], [8, 5, PuyoColor.BLUE],
    ]
    for (const [y, x, color] of cells) grid[y][x] = color

    const advice = PlacementAdvisor.getAdvice(
      field(grid),
      pair(PuyoColor.GREEN, PuyoColor.RED),
      pair(PuyoColor.RED, PuyoColor.YELLOW),
      pair(PuyoColor.GREEN, PuyoColor.BLUE),
      { colorA: A, colorB: B, colorC: A, colorD: B },
    )
    expect(advice.bestPlacement).toMatchObject({
      placement: { column: 3, rotation: 3 },
      landing: {
        mainPos: { x: 3, y: 12 },
        subPos: { x: 2, y: 12 },
      },
      tailShape: 'Y',
      tailColor: PuyoColor.RED,
    })
  })

  it('緑で始めたY字は青で接続点を塞がず緑を連鎖セルへ積む', () => {
    const grid = emptyGrid()
    const cells: [number, number, PuyoColor][] = [
      [12, 0, PuyoColor.YELLOW], [12, 1, PuyoColor.YELLOW],
      [12, 2, PuyoColor.GREEN], [12, 3, PuyoColor.YELLOW],
      [12, 4, PuyoColor.YELLOW], [12, 5, PuyoColor.YELLOW],
      [11, 0, PuyoColor.BLUE], [11, 1, PuyoColor.BLUE],
      [11, 2, PuyoColor.YELLOW],
      [10, 0, PuyoColor.BLUE], [10, 1, PuyoColor.YELLOW],
      [9, 1, PuyoColor.YELLOW],
    ]
    for (const [y, x, color] of cells) grid[y][x] = color

    const advice = PlacementAdvisor.getAdvice(
      field(grid),
      pair(PuyoColor.GREEN, PuyoColor.BLUE),
      pair(PuyoColor.YELLOW, PuyoColor.YELLOW),
      pair(PuyoColor.GREEN, PuyoColor.BLUE),
      {
        colorA: PuyoColor.BLUE,
        colorB: PuyoColor.YELLOW,
        colorC: PuyoColor.BLUE,
        colorD: PuyoColor.YELLOW,
      },
    )
    expect(advice.bestPlacement).toMatchObject({ tailShape: 'Y', tailColor: PuyoColor.GREEN })
    const selected = advice.bestPlacement!
    // The head and either arm are useful green cells; extending an arm first
    // is allowed, but blue below green at the connector is still a regression.
    expect([{ x: 2, y: 10 }, { x: 3, y: 11 }, { x: 4, y: 11 }]).toContainEqual(selected.landing.mainPos)
    expect(selected.landing.subPos).not.toEqual({ x: 2, y: 10 })
  })

  it('報告局面では静的L字より黄色を下にしたY字の完成を優先する', () => {
    const grid = emptyGrid()
    const cells: [number, number, PuyoColor][] = [
      [12, 0, PuyoColor.YELLOW], [12, 1, PuyoColor.YELLOW],
      [12, 2, PuyoColor.BLUE], [12, 3, PuyoColor.BLUE],
      [12, 4, PuyoColor.YELLOW], [12, 5, PuyoColor.BLUE],
      [11, 0, PuyoColor.RED], [11, 1, PuyoColor.RED],
      [11, 2, PuyoColor.YELLOW], [11, 4, PuyoColor.RED],
      [11, 5, PuyoColor.BLUE],
      [10, 0, PuyoColor.RED], [10, 1, PuyoColor.YELLOW],
      [10, 2, PuyoColor.BLUE], [10, 5, PuyoColor.RED],
      [9, 1, PuyoColor.BLUE],
    ]
    for (const [y, x, color] of cells) grid[y][x] = color

    const advice = PlacementAdvisor.getAdvice(
      field(grid),
      pair(PuyoColor.BLUE, PuyoColor.YELLOW),
      pair(PuyoColor.RED, PuyoColor.GREEN),
      pair(PuyoColor.BLUE, PuyoColor.YELLOW),
      {
        colorA: PuyoColor.RED,
        colorB: PuyoColor.YELLOW,
        colorC: PuyoColor.RED,
        colorD: PuyoColor.YELLOW,
      },
    )
    const blueBelow = advice.allPlacements.find(candidate =>
      candidate.placement.column === 3 && candidate.placement.rotation === 0,
    )
    const yellowBelow = advice.allPlacements.find(candidate =>
      candidate.placement.column === 3 && candidate.placement.rotation === 2,
    )

    expect(advice.phase).toBe(GamePhase.COMPLETION)
    expect(yellowBelow).toMatchObject({
      landing: {
        mainPos: { x: 3, y: 10 },
        subPos: { x: 3, y: 11 },
      },
    })
    expect(yellowBelow!.totalScore).toBeGreaterThan(blueBelow!.totalScore)
    expect(advice.bestPlacement?.placement).toEqual({ column: 3, rotation: 2 })
    // This falling connection is not one of the fixed named templates. Assert
    // the actual benefit instead of requiring an unsupported Y metadata label.
    const yellowResult = GTRDetector.detectGTR(simulateTurn(
      grid, pair(PuyoColor.BLUE, PuyoColor.YELLOW), yellowBelow!.placement,
    ).stableGrid)
    const blueResult = GTRDetector.detectGTR(simulateTurn(
      grid, pair(PuyoColor.BLUE, PuyoColor.YELLOW), blueBelow!.placement,
    ).stableGrid)
    expect(yellowResult.chainCount).toBeGreaterThanOrEqual(blueResult.chainCount)
    expect(yellowResult.leftoverPuyos).toBeLessThan(blueResult.leftoverPuyos)
  })

})
