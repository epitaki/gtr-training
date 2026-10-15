import { describe, expect, it } from 'vitest'
import {
  resolveChains,
  isSpawnBlocked,
  simulateLanding,
  simulateTurn,
  type PuyoGrid,
} from './ChainSimulator'
import { GameFieldManager } from './GameField'
import { PuyoColor, type PuyoPair } from './types'

const emptyGrid = (): PuyoGrid => Array.from(
  { length: 13 },
  () => Array<PuyoColor | null>(6).fill(null),
)

const pair = (main: PuyoColor, sub: PuyoColor): PuyoPair => ({
  main: { color: main, x: 2, y: 1 },
  sub: { color: sub, x: 2, y: 0 },
  rotation: 0,
  falling: true,
})

describe('spawn boundary shared by game and benchmark', () => {
  it('ends at main spawn row 1, with row 0 still empty', () => {
    const grid = emptyGrid()
    for (let y = 1; y < 13; y++) {
      grid[y][2] = y % 2 === 0 ? PuyoColor.RED : PuyoColor.BLUE
    }
    expect(resolveChains(grid).chainCount).toBe(0)
    expect(isSpawnBlocked(grid)).toBe(true)
    grid[1][2] = null
    expect(isSpawnBlocked(grid)).toBe(false)
    grid[0][2] = PuyoColor.GREEN
    expect(isSpawnBlocked(grid)).toBe(true)
  })
})

// 本体とは独立した素朴な参照実装。ランダム盤面で共通実装自身との
// 自己比較にならないよう、最終盤面・連鎖数・消去数を照合する。
const resolveWithReference = (source: PuyoGrid) => {
  const grid = source.map(row => [...row])
  const height = grid.length
  const width = grid[0]?.length ?? 0

  const settle = () => {
    for (let x = 0; x < width; x++) {
      const colors: PuyoColor[] = []
      for (let y = height - 1; y >= 0; y--) {
        const color = grid[y][x]
        if (color !== null) colors.push(color)
      }
      for (let y = height - 1; y >= 0; y--) {
        grid[y][x] = colors[height - 1 - y] ?? null
      }
    }
  }

  settle()
  let chainCount = 0
  let clearedPuyos = 0

  while (true) {
    const visited = new Set<string>()
    const toClear = new Set<string>()

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const color = grid[y][x]
        const startKey = `${x},${y}`
        if (color === null || visited.has(startKey)) continue

        const group: string[] = []
        const stack = [{ x, y }]
        while (stack.length > 0) {
          const current = stack.pop()!
          if (current.x < 0 || current.x >= width || current.y < 0 || current.y >= height) continue
          const key = `${current.x},${current.y}`
          if (visited.has(key) || grid[current.y][current.x] !== color) continue
          visited.add(key)
          group.push(key)
          stack.push(
            { x: current.x - 1, y: current.y },
            { x: current.x + 1, y: current.y },
            { x: current.x, y: current.y - 1 },
            { x: current.x, y: current.y + 1 },
          )
        }
        if (group.length >= 4) group.forEach(key => toClear.add(key))
      }
    }

    if (toClear.size === 0) break
    chainCount++
    clearedPuyos += toClear.size
    for (const key of toClear) {
      const [x, y] = key.split(',').map(Number)
      grid[y][x] = null
    }
    settle()
  }

  return { stableGrid: grid, chainCount, clearedPuyos }
}

describe('ChainSimulator', () => {
  it('段差のある2列へ横向きペアを独立に着地させる', () => {
    const grid = emptyGrid()
    grid[12][0] = PuyoColor.RED
    grid[11][0] = PuyoColor.BLUE

    expect(simulateLanding(
      grid,
      pair(PuyoColor.GREEN, PuyoColor.YELLOW),
      { column: 0, rotation: 1 },
    )).toEqual({
      mainPos: { x: 0, y: 10 },
      subPos: { x: 1, y: 12 },
      valid: true,
    })
  })

  it('定義外の回転値を無効な配置として扱う', () => {
    expect(simulateLanding(
      emptyGrid(),
      pair(PuyoColor.GREEN, PuyoColor.YELLOW),
      { column: 2, rotation: 4 },
    ).valid).toBe(false)
    expect(simulateLanding(
      emptyGrid(),
      pair(PuyoColor.GREEN, PuyoColor.YELLOW),
      { column: 1.5, rotation: 1 },
    ).valid).toBe(false)
  })

  it('着地点へ配置できない不整形盤面を成功扱いしない', () => {
    const grid = emptyGrid()
    grid[12] = [null]

    const outcome = simulateTurn(
      grid,
      pair(PuyoColor.GREEN, PuyoColor.YELLOW),
      { column: 2, rotation: 0 },
    )

    expect(outcome).toMatchObject({
      valid: false,
      landing: null,
      chainCount: 0,
      clearedPuyos: 0,
    })
    expect(outcome.placedGrid).toEqual(grid)
  })

  it('穴のある列でも既存ぷよを飛び越えたり上書きしたりしない', () => {
    const verticalGrid = emptyGrid()
    verticalGrid[11][0] = PuyoColor.RED
    const verticalBefore = verticalGrid.map(row => [...row])

    const vertical = simulateTurn(
      verticalGrid,
      pair(PuyoColor.GREEN, PuyoColor.YELLOW),
      { column: 0, rotation: 0 },
    )

    expect(vertical.valid).toBe(true)
    expect(verticalGrid).toEqual(verticalBefore)
    expect(vertical.placedGrid[11][0]).toBe(PuyoColor.RED)
    expect(vertical.placedGrid[10][0]).toBe(PuyoColor.GREEN)
    expect(vertical.placedGrid[9][0]).toBe(PuyoColor.YELLOW)
    expect(vertical.stableGrid[12][0]).toBe(PuyoColor.RED)
    expect(vertical.stableGrid[11][0]).toBe(PuyoColor.GREEN)
    expect(vertical.stableGrid[10][0]).toBe(PuyoColor.YELLOW)

    const horizontalGrid = emptyGrid()
    horizontalGrid[11][0] = PuyoColor.RED
    const horizontal = simulateLanding(
      horizontalGrid,
      pair(PuyoColor.GREEN, PuyoColor.YELLOW),
      { column: 0, rotation: 1 },
    )
    expect(horizontal).toEqual({
      mainPos: { x: 0, y: 10 },
      subPos: { x: 1, y: 12 },
      valid: true,
    })
  })

  it('複数色の4連結を同じ連鎖ステップで消去する', () => {
    const grid = emptyGrid()
    for (let y = 9; y <= 12; y++) {
      grid[y][0] = PuyoColor.RED
      grid[y][5] = PuyoColor.BLUE
    }

    const result = resolveChains(grid)

    expect(result).toMatchObject({
      chainCount: 1,
      clearedPuyos: 8,
      allClear: true,
    })
    expect(result.clearSteps[0].clearedPositions).toHaveLength(8)
  })

  it('上段を含む7連鎖を全盤面で解決する', () => {
    const grid = emptyGrid()
    const R = PuyoColor.RED
    const G = PuyoColor.GREEN
    const B = PuyoColor.BLUE
    const Y = PuyoColor.YELLOW

    // 1・2列目で4連鎖し、4連鎖目が3列目の支持ぷよも消して
    // 3・4列目の上段へ3連鎖を接続する。
    const columns = [
      [R, R, R, G, G, G, B, B, B, Y, Y, Y],
      [R, G, B, Y],
      [Y, R, R, R, G, G, G, B, B, B],
      [R, G, B],
    ]
    for (let x = 0; x < columns.length; x++) {
      columns[x].forEach((color, offset) => {
        grid[12 - offset][x] = color
      })
    }

    const result = resolveChains(grid)

    expect(result.chainCount).toBe(7)
    expect(result.clearedPuyos).toBe(29)
    expect(result.allClear).toBe(true)
    expect(result.clearSteps.map(step => step.chainIndex)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(result.clearSteps[6].clearedPuyos).toContainEqual({
      position: { x: 2, y: 10 },
      origin: { x: 2, y: 3 },
      color: PuyoColor.BLUE,
    })
  })

  it('入力盤面と元座標グリッドを変更しない', () => {
    const grid = emptyGrid()
    for (let y = 9; y <= 12; y++) grid[y][0] = PuyoColor.RED
    const origins = grid.map((row, y) => row.map((color, x) =>
      color === null ? null : { x, y },
    ))
    const gridBefore = grid.map(row => [...row])
    const originsBefore = origins.map(row => row.map(origin => origin ? { ...origin } : null))

    resolveChains(grid, { origins })

    expect(grid).toEqual(gridBefore)
    expect(origins).toEqual(originsBefore)
  })

  it('1手の着地から即時連鎖と安定盤面を返す', () => {
    const grid = emptyGrid()
    grid[12][0] = PuyoColor.RED
    grid[12][1] = PuyoColor.RED
    grid[12][2] = PuyoColor.RED

    const result = simulateTurn(
      grid,
      pair(PuyoColor.RED, PuyoColor.BLUE),
      { column: 3, rotation: 0 },
    )

    expect(result).toMatchObject({
      valid: true,
      chainCount: 1,
      clearedPuyos: 4,
      allClear: false,
    })
    expect(result.stableGrid[12][3]).toBe(PuyoColor.BLUE)
  })

  it('同じ盤面・ペア・配置でGameFieldManagerの段階処理と結果が一致する', () => {
    let state = 0x12345678
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0
      return state / 0x100000000
    }
    const colors = Object.values(PuyoColor)
    let compared = 0

    while (compared < 20) {
      const grid = emptyGrid()
      for (let x = 0; x < 6; x++) {
        const height = Math.floor(random() * 8)
        for (let offset = 0; offset < height; offset++) {
          grid[12 - offset][x] = colors[Math.floor(random() * colors.length)]
        }
      }

      const currentPair = pair(
        colors[Math.floor(random() * colors.length)],
        colors[Math.floor(random() * colors.length)],
      )
      const placement = {
        column: Math.floor(random() * 6),
        rotation: Math.floor(random() * 4),
      }
      const expected = simulateTurn(grid, currentPair, placement)
      if (!expected.valid || !expected.landing) continue
      const reference = resolveWithReference(expected.placedGrid)

      expect(expected.stableGrid).toEqual(reference.stableGrid)
      expect(expected.chainCount).toBe(reference.chainCount)
      expect(expected.clearedPuyos).toBe(reference.clearedPuyos)

      const manager = new GameFieldManager()
      manager.setField({ grid, width: 6, height: 13 })
      expect(manager.placePuyo(
        expected.landing.mainPos.x,
        expected.landing.mainPos.y,
        currentPair.main.color,
      )).toBe(true)
      expect(manager.placePuyo(
        expected.landing.subPos.x,
        expected.landing.subPos.y,
        currentPair.sub.color,
      )).toBe(true)

      let chainCount = 0
      let clearedPuyos = 0
      while (true) {
        while (manager.applyGravity()) {}
        const step = manager.clearConnectedPuyos()
        if (!step.cleared) break
        chainCount++
        clearedPuyos += step.count
      }

      expect(manager.getField().grid).toEqual(expected.stableGrid)
      expect(chainCount).toBe(expected.chainCount)
      expect(clearedPuyos).toBe(expected.clearedPuyos)
      compared++
    }
  })
})
