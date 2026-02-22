import { PuyoColor, PuyoPair, Position } from './types'

export class PuyoPairManager {
  private static readonly SPAWN_X = 2 // 3列目（0ベース）
  private static readonly SPAWN_Y = 1 // 2行目から開始（サブが1行目に来るように）

  // ランダムなぷよペアを生成
  static createRandomPair(): PuyoPair {
    const colors = Object.values(PuyoColor)
    
    return {
      main: {
        color: colors[Math.floor(Math.random() * colors.length)],
        x: this.SPAWN_X,
        y: this.SPAWN_Y
      },
      sub: {
        color: colors[Math.floor(Math.random() * colors.length)],
        x: this.SPAWN_X,
        y: this.SPAWN_Y - 1 // メインの上（0行目）
      },
      rotation: 0, // 初期は縦向き（サブが上）
      falling: true
    }
  }

  // 2手目の組み合わせ制約を考慮したペア生成（note.md仕様）
  // AAAB型、ABAB型(AABB型)、ABAC型、AABC型の4種類のみ（AAAA型は練習効果が低いため除外）
  static createValidTwoHandCombination(): { pair1: PuyoPair; pair2: PuyoPair } {
    const colors = Object.values(PuyoColor)
    
    // 4種類の組み合わせパターンから1つを選択（AAAAは練習にならないので除外）
    const patterns = [
      // 'AAAA', // 除外：練習にならないため
      'AAAB', // 3個同じ+1個別色
      'ABAB', // 2色交互（AABB型含む）
      'ABAC', // A色2個+B色1個+C色1個
      'AABC'  // A色2個+B色1個+C色1個（並び違い）
    ]
    
    const selectedPattern = patterns[Math.floor(Math.random() * patterns.length)]
    const pair1 = this.createPairAtPosition(this.SPAWN_X, this.SPAWN_Y)
    const pair2 = this.createPairAtPosition(this.SPAWN_X, this.SPAWN_Y)
    
    // 選択されたパターンに応じて色を割り当て
    switch (selectedPattern) {
      case 'AAAB': {
        const colorA = colors[Math.floor(Math.random() * colors.length)]
        const colorB = colors.filter(c => c !== colorA)[Math.floor(Math.random() * (colors.length - 1))]
        // AAABの配置（Bの位置をランダム）
        const bPosition = Math.floor(Math.random() * 4)
        const puyoColors = [colorA, colorA, colorA, colorB]
        if (bPosition !== 3) {
          [puyoColors[bPosition], puyoColors[3]] = [puyoColors[3], puyoColors[bPosition]]
        }
        pair1.main.color = puyoColors[0]
        pair1.sub.color = puyoColors[1]
        pair2.main.color = puyoColors[2]
        pair2.sub.color = puyoColors[3]
        break
      }
      case 'ABAB': {
        const colorA = colors[Math.floor(Math.random() * colors.length)]
        const colorB = colors.filter(c => c !== colorA)[Math.floor(Math.random() * (colors.length - 1))]
        // ABAB または AABB のランダム選択
        if (Math.random() < 0.5) {
          // ABAB
          pair1.main.color = colorA
          pair1.sub.color = colorB
          pair2.main.color = colorA
          pair2.sub.color = colorB
        } else {
          // AABB
          pair1.main.color = colorA
          pair1.sub.color = colorA
          pair2.main.color = colorB
          pair2.sub.color = colorB
        }
        break
      }
      case 'ABAC': {
        const colorA = colors[Math.floor(Math.random() * colors.length)]
        const remainingColors = colors.filter(c => c !== colorA)
        const colorB = remainingColors[Math.floor(Math.random() * remainingColors.length)]
        const colorC = remainingColors.filter(c => c !== colorB)[Math.floor(Math.random() * (remainingColors.length - 1))]
        pair1.main.color = colorA
        pair1.sub.color = colorB
        pair2.main.color = colorA
        pair2.sub.color = colorC
        break
      }
      case 'AABC': {
        const colorA = colors[Math.floor(Math.random() * colors.length)]
        const remainingColors = colors.filter(c => c !== colorA)
        const colorB = remainingColors[Math.floor(Math.random() * remainingColors.length)]
        const colorC = remainingColors.filter(c => c !== colorB)[Math.floor(Math.random() * (remainingColors.length - 1))]
        pair1.main.color = colorA
        pair1.sub.color = colorA
        pair2.main.color = colorB
        pair2.sub.color = colorC
        break
      }
    }
    
    return { pair1, pair2 }
  }

  // 指定位置にペアを作成するヘルパー
  private static createPairAtPosition(x: number, y: number): PuyoPair {
    return {
      main: {
        color: PuyoColor.RED, // 後で上書きされる
        x: x,
        y: y
      },
      sub: {
        color: PuyoColor.RED, // 後で上書きされる
        x: x,
        y: y - 1
      },
      rotation: 0,
      falling: true
    }
  }

  // 回転時の座標計算
  static getRotatedPositions(pair: PuyoPair): { main: Position; sub: Position } {
    const mainPos = { x: pair.main.x, y: pair.main.y }
    let subPos = { x: pair.sub.x, y: pair.sub.y }

    // 回転に応じてサブの相対位置を計算
    switch (pair.rotation) {
      case 0: // 縦（サブが上）
        subPos = { x: mainPos.x, y: mainPos.y - 1 }
        break
      case 1: // 横（サブが右）  
        subPos = { x: mainPos.x + 1, y: mainPos.y }
        break
      case 2: // 縦（サブが下）
        subPos = { x: mainPos.x, y: mainPos.y + 1 }
        break
      case 3: // 横（サブが左）
        subPos = { x: mainPos.x - 1, y: mainPos.y }
        break
    }

    return { main: mainPos, sub: subPos }
  }

  // 左回転
  static rotateLeft(pair: PuyoPair): number {
    return (pair.rotation + 3) % 4
  }

  // 右回転
  static rotateRight(pair: PuyoPair): number {
    return (pair.rotation + 1) % 4
  }

  // 指定方向への移動が可能かチェック
  static canMove(pair: PuyoPair, dx: number, dy: number, isOccupiedFn: (x: number, y: number) => boolean): boolean {
    const newMainX = pair.main.x + dx
    const newMainY = pair.main.y + dy
    
    const newPair = {
      ...pair,
      main: { ...pair.main, x: newMainX, y: newMainY }
    }
    
    const positions = this.getRotatedPositions(newPair)
    
    return !isOccupiedFn(positions.main.x, positions.main.y) && 
           !isOccupiedFn(positions.sub.x, positions.sub.y)
  }

  // 回転が可能かチェック（壁キック対応）
  static canRotate(pair: PuyoPair, newRotation: number, isOccupiedFn: (x: number, y: number) => boolean): { canRotate: boolean; offsetX: number } {
    const testPair = {
      ...pair,
      rotation: newRotation
    }
    
    // まず現在位置で回転を試す
    let positions = this.getRotatedPositions(testPair)
    
    if (!isOccupiedFn(positions.main.x, positions.main.y) && 
        !isOccupiedFn(positions.sub.x, positions.sub.y)) {
      return { canRotate: true, offsetX: 0 }
    }
    
    // 壁キック：回転方向に応じて優先方向を決める
    const isRotatingClockwise = (newRotation - pair.rotation + 4) % 4 === 1
    const kickOffsets = isRotatingClockwise ? [-1, 1] : [1, -1] // 時計回り：左優先、反時計回り：右優先
    
    for (const offsetX of kickOffsets) {
      const kickTestPair = {
        ...pair,
        main: { ...pair.main, x: pair.main.x + offsetX },
        rotation: newRotation
      }
      
      positions = this.getRotatedPositions(kickTestPair)
      
      if (!isOccupiedFn(positions.main.x, positions.main.y) && 
          !isOccupiedFn(positions.sub.x, positions.sub.y)) {
        return { canRotate: true, offsetX }
      }
    }
    
    return { canRotate: false, offsetX: 0 }
  }

  // ペアを移動
  static movePair(pair: PuyoPair, dx: number, dy: number): PuyoPair {
    return {
      ...pair,
      main: {
        ...pair.main,
        x: pair.main.x + dx,
        y: pair.main.y + dy
      },
      sub: {
        ...pair.sub,
        x: pair.sub.x + dx,
        y: pair.sub.y + dy
      }
    }
  }

  // ペアを回転
  static rotatePair(pair: PuyoPair, newRotation: number): PuyoPair {
    const newPair = {
      ...pair,
      rotation: newRotation
    }
    
    const positions = this.getRotatedPositions(newPair)
    
    return {
      ...newPair,
      sub: {
        ...newPair.sub,
        x: positions.sub.x,
        y: positions.sub.y
      }
    }
  }
}