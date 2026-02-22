import { PuyoColor, GameField } from './types'

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
    let changed = false
    
    // 下から上へ、左から右へスキャン
    for (let x = 0; x < this.field.width; x++) {
      for (let y = this.field.height - 2; y >= 0; y--) {
        if (this.field.grid[y][x] !== null) {
          // 下に落ちる先を探す
          let fallToY = y
          while (fallToY + 1 < this.field.height && this.field.grid[fallToY + 1][x] === null) {
            fallToY++
          }
          
          // 落ちる場所がある場合
          if (fallToY > y) {
            this.field.grid[fallToY][x] = this.field.grid[y][x]
            this.field.grid[y][x] = null
            changed = true
          }
        }
      }
    }
    
    return changed
  }

  // 連鎖消去のための4つ繋がりチェック
  findConnectedPuyos(x: number, y: number, color: PuyoColor, visited?: boolean[][]): Position[] {
    // visited配列が渡されていない場合は新規作成
    if (!visited) {
      visited = Array(this.field.height).fill(null).map(() => Array(this.field.width).fill(false))
    }

    if (x < 0 || x >= this.field.width || y < 0 || y >= this.field.height) {
      return []
    }

    if (visited[y][x] || this.field.grid[y][x] !== color) {
      return []
    }

    visited[y][x] = true
    const connected = [{ x, y }]

    // 4方向をチェック
    const directions = [
      { x: 0, y: -1 }, // 上
      { x: 1, y: 0 },  // 右
      { x: 0, y: 1 },  // 下
      { x: -1, y: 0 }  // 左
    ]

    directions.forEach(dir => {
      const newX = x + dir.x
      const newY = y + dir.y
      connected.push(...this.findConnectedPuyos(newX, newY, color, visited))
    })

    return connected
  }

  // 4つ以上繋がったぷよを消去
  clearConnectedPuyos(): { cleared: boolean; count: number } {
    const toRemove: Position[] = []
    // 全体で1つのvisited配列を使って、同じ位置を重複チェックしない
    const checked = Array(this.field.height).fill(null).map(() => Array(this.field.width).fill(false))

    for (let y = 0; y < this.field.height; y++) {
      for (let x = 0; x < this.field.width; x++) {
        // 既にチェック済みならスキップ
        if (checked[y][x]) continue

        const color = this.field.grid[y][x]
        if (color !== null) {
          // このグループ用のvisited配列を新規作成
          const visited = Array(this.field.height).fill(null).map(() => Array(this.field.width).fill(false))
          const connected = this.findConnectedPuyos(x, y, color, visited)

          // チェックした位置をマーク
          connected.forEach(pos => {
            checked[pos.y][pos.x] = true
          })

          if (connected.length >= 4) {
            toRemove.push(...connected)
          }
        }
      }
    }

    // ぷよを削除
    toRemove.forEach(pos => {
      this.removePuyo(pos.x, pos.y)
    })

    return {
      cleared: toRemove.length > 0,
      count: toRemove.length
    }
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

  // ゲームオーバー判定（3列目上部にぷよがある）
  isGameOver(): boolean {
    return this.field.grid[0][2] !== null
  }
}

interface Position {
  x: number
  y: number
}