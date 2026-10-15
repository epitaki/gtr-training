import { describe, expect, it } from 'vitest'
import { GameFieldManager } from './GameField'
import { PuyoColor } from './types'

describe('GameFieldManager', () => {
  it('findConnectedPuyosで事前訪問済みセルを探索障壁として扱う', () => {
    const manager = new GameFieldManager()
    manager.placePuyo(0, 12, PuyoColor.RED)
    manager.placePuyo(1, 12, PuyoColor.RED)
    manager.placePuyo(2, 12, PuyoColor.RED)
    const visited = Array.from({ length: 13 }, () => Array(6).fill(false))
    visited[12][1] = true

    expect(manager.findConnectedPuyos(0, 12, PuyoColor.RED, visited)).toEqual([
      { x: 0, y: 12 },
    ])
    expect(visited[12][0]).toBe(true)
    expect(visited[12][1]).toBe(true)
    expect(visited[12][2]).toBe(false)
  })

  it('縦向き初期ペアのどちらかの出現セルが埋まっていればゲームオーバーにする', () => {
    const upper = new GameFieldManager()
    upper.placePuyo(2, 0, PuyoColor.BLUE)
    expect(upper.isGameOver()).toBe(true)

    const lower = new GameFieldManager()
    lower.placePuyo(2, 1, PuyoColor.GREEN)
    expect(lower.isGameOver()).toBe(true)

    const clear = new GameFieldManager()
    clear.placePuyo(1, 1, PuyoColor.YELLOW)
    expect(clear.isGameOver()).toBe(false)
  })

  it('高さが1行しかない盤面でもゲームオーバー判定で例外を出さない', () => {
    const manager = new GameFieldManager(6, 1)
    expect(manager.isGameOver()).toBe(false)

    manager.placePuyo(2, 0, PuyoColor.RED)
    expect(manager.isGameOver()).toBe(true)
  })
})
