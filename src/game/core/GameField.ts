import {
  applyGravity as applyGridGravity,
  clearConnectedPuyos as clearGridPuyos,
  findConnectedGroup,
  isSpawnBlocked,
} from './ChainSimulator'
import { PuyoColor, GameField, Field, type Position } from './types'

export class GameFieldManager {
  private field: GameField
  
  constructor(width: number = 6, height: number = 13) {
    this.field = {
      grid: Array(height).fill(null).map(() => Array(width).fill(null)),
      width,
      height
    }
  }

  getField(): GameField {
    return this.field
  }

  // 指定位置にぷよがあるかチェック
  isOccupied(x: number, y: number): boolean {
    if (x < 0 || x >= this.field.width || y < 0 || y >= this.field.height) {
      return true // 範囲外は占有扱い
    }
    return this.field.grid[y][x] !== null
  }

  // 指定位置にぷよを配置
  placePuyo(x: number, y: number, color: PuyoColor): boolean {
    if (this.isOccupied(x, y)) {
      return false
    }
    this.field.grid[y][x] = color
    return true
  }

  // 指定位置のぷよを削除
  removePuyo(x: number, y: number): void {
    if (x >= 0 && x < this.field.width && y >= 0 && y < this.field.height) {
      this.field.grid[y][x] = null
    }
  }

  // 指定位置のぷよの色を取得
  getPuyoColor(x: number, y: number): PuyoColor | null {
    if (x < 0 || x >= this.field.width || y < 0 || y >= this.field.height) {
      return null
    }
    return this.field.grid[y][x]
  }

  // 重力落下処理
  applyGravity(): boolean {
    const result = applyGridGravity(this.field.grid)
    this.field.grid = result.grid
    return result.moved
  }

  // 連鎖消去のための4つ繋がりチェック
  findConnectedPuyos(x: number, y: number, color: PuyoColor, visited?: boolean[][]): Position[] {
    if (visited?.[y]?.[x]) return []
    const excluded = new Set<string>()
    if (visited) {
      for (let row = 0; row < visited.length; row++) {
        for (let column = 0; column < (visited[row]?.length ?? 0); column++) {
          if (visited[row][column]) excluded.add(`${column},${row}`)
        }
      }
    }
    const connected = findConnectedGroup(this.field.grid, x, y, color, excluded)
    if (visited) {
      for (const position of connected) visited[position.y][position.x] = true
    }
    return connected
  }

  // 4つ以上繋がったぷよを消去
  clearConnectedPuyos(): { cleared: boolean; count: number } {
    const result = clearGridPuyos(this.field.grid)
    this.field.grid = result.grid
    return { cleared: result.cleared, count: result.count }
  }

  // フィールドをクリア
  clear(): void {
    this.field.grid = Array(this.field.height).fill(null).map(() => Array(this.field.width).fill(null))
  }
  
  // フィールドを設定（巻き戻し用）
  setField(field: Field): void {
    this.field.width = field.width
    this.field.height = field.height
    this.field.grid = field.grid.map(row => [...row])
  }

  // ゲームオーバー判定（縦向き初期ペアの出現位置にぷよがある）
  isGameOver(): boolean {
    return isSpawnBlocked(this.field.grid)
  }
}
