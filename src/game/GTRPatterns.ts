import { PuyoColor } from './types'
import { GTR_SCORING_CONFIG } from './GTRScoringConfig'

// GTRの評価ポイント
export interface GTRScore {
  isGTR: boolean // GTRの形が成立しているか
  quality: number // 形の質（0-100）
  chainTailScore: number // 連鎖尾の配置スコア（0-100）
  totalScore: number // 総合スコア
  chainCount: number // 連鎖数
  leftoverPuyos: number // あまりぷよの数
  message?: string // 評価メッセージ
  // 詳細な評価結果用
  hasBasicPattern: boolean // 折り返しパターンがあるか
  chainTailType?: 'Y' | 'zabuton' | 'L' | 'stairs' // 連鎖尾の形状タイプ（評価順: Y字形 > 座布団形 > L字形 > 階段形）
  row10Usage: 'minimal' | 'moderate' | 'heavy' // 10行目の使用状況
  leftoverConnected: boolean // あまりぷよが連結しているか
}

// GTRの基本形状定義
// GTRは必ず折り返し部分を持つ（折り返しのないGTRは存在しない）
// 折り返し部分（1-3列目）+ 連鎖尾（4列目以降）で構成
// A, B = 異なる色（パターン判定用）, _=空
export const GTR_BASE_PATTERNS = {
  // GTRの必須折り返し部分
  // 正しいGTR形状：11AB, 12AAB, 13BB
  foldCore: {
    pattern: [
      ['B', 'B', '_', '_', '_', '_'], // 13行目（最下段）：BB____
      ['A', 'A', 'B', '_', '_', '_'], // 12行目：AAB___
      ['A', 'B', '_', '_', '_', '_'], // 11行目：AB____
    ],
    requiredColumns: [0, 1, 2], // 必須列：1列目、2列目、3列目（0-indexed: 0,1,2）
    description: 'GTRの必須折り返し部分（11AB, 12AAB, 13BB）',
    score: 100
  },
  
  // 上に拡張したGTR（より高得点）
  extendedFold: {
    pattern: [
      ['B', 'B', '_', '_', '_', '_'], // 13行目（最下段）：BB____
      ['A', 'A', 'B', '_', '_', '_'], // 12行目：AAB___
      ['A', 'B', '_', '_', '_', '_'], // 11行目：AB____
      ['C', 'C', '_', '_', '_', '_'], // 10行目：CC____（さらに上に積む）
    ],
    requiredColumns: [0, 1, 2], // 必須列：1列目、2列目、3列目
    description: '上に拡張したGTR',
    score: 120 // 拡張ボーナス
  }
  
  // 注意：
  // - GTRの必須形状：11AB, 12AAB, 13BB
  // - 逆折りGTRは対象外（複雑すぎるため）
}

// 連鎖尾の理想的な配置パターン
export const CHAIN_TAIL_PATTERNS = {
  // 4-5列目に縦に積む（理想的）
  vertical: {
    pattern: [
      ['_', '_', '_', 'X', 'Y', '_'], // 任意の高さ
      ['_', '_', '_', 'X', 'Y', '_'],
    ],
    columns: [3, 4],
    scoreMultiplier: 1.5 // 1.5倍のボーナス
  },
  
  // 階段状に積む（良い）
  stairs: {
    pattern: [
      ['_', '_', '_', 'X', '_', '_'],
      ['_', '_', '_', 'X', 'Y', '_'],
      ['_', '_', '_', '_', 'Y', 'Z'],
    ],
    columns: [3, 4, 5],
    scoreMultiplier: 1.3
  },
  
  // 横に広がる（普通）
  horizontal: {
    pattern: [
      ['_', '_', '_', 'X', 'X', 'Y'],
    ],
    columns: [3, 4, 5],
    scoreMultiplier: 1.0
  }
}

// GTR判定クラス
export class GTRDetector {
  // 評価範囲の定義（note.mdに基づく）
  // 13段目が最下段として: (1,11)-(1,13), (2,11)-(2,13), (3,10)-(3,13), (4,10)-(4,13), (5,10)-(5,13), (6,10)-(6,13)
  private static readonly EVALUATION_RANGE = [
    // 列1: 11-13行目（インデックス10-12）
    { x: 0, yStart: 10, yEnd: 12 },
    // 列2: 11-13行目（インデックス10-12）  
    { x: 1, yStart: 10, yEnd: 12 },
    // 列3-6: 10-13行目（インデックス9-12）
    { x: 2, yStart: 9, yEnd: 12 },
    { x: 3, yStart: 9, yEnd: 12 },
    { x: 4, yStart: 9, yEnd: 12 },
    { x: 5, yStart: 9, yEnd: 12 },
  ]
  
  // フィールドがGTRパターンに一致するかチェック（note.mdの仕様に基づく）
  static detectGTR(field: (PuyoColor | null)[][]): GTRScore {
    let isGTR = false
    let quality = 0
    let chainTailScore = 0
    let chainCount = 0
    let leftoverPuyos = 0
    let message = ''
    
    // 基本GTRパターンのチェック（必須の折り返し）
    const baseScore = this.checkBasePattern(field)
    if (baseScore === 0) {
      // GTRの必須折り返しがない場合は0点で即座に返す
      // 折り返しがなければGTRではないため、他の評価は行わない
      return {
        isGTR: false,
        quality: 0,
        chainTailScore: 0,
        totalScore: 0,
        chainCount: 0,
        leftoverPuyos: 0,
        message: GTR_SCORING_CONFIG.MESSAGES.NOT_GTR,
        hasBasicPattern: false,
        chainTailType: undefined,
        row10Usage: 'heavy',
        leftoverConnected: false
      }
    }
    
    isGTR = true
    quality = baseScore
    
    // 連鎖数の評価（(1,9)に(1,10)と同じ色が来たときの連鎖）
    const chainResult = this.evaluateChainCount(field)
    chainCount = chainResult.chainCount
    leftoverPuyos = chainResult.leftoverPuyos
    
    // 連鎖数による加点（最大5連鎖）
    const chainBonus = Math.min(chainCount, GTR_SCORING_CONFIG.CHAIN_COUNT.MAX_CHAIN) * GTR_SCORING_CONFIG.CHAIN_COUNT.POINTS_PER_CHAIN
    
    // 10行目の評価（(6,10)だけ、または(6,10)と(5,10)だけが連鎖に使われる）
    const row10Bonus = this.evaluateRow10Usage(field, chainResult.usedPuyos)
    
    // あまりぷよの評価（同じ色で連結している）
    const leftoverBonus = this.evaluateLeftoverPuyos(field, chainResult.leftoverPositions)
    
    // 連鎖尾の形状タイプを判定
    const chainTailType = this.detectChainTailType(field)

    // 10行目の使用状況を判定
    const row10Usage = this.classifyRow10Usage(field, chainResult.usedPuyos)

    // あまりぷよが連結しているか判定
    const leftoverConnected = this.checkLeftoverConnected(chainResult.leftoverPositions)

    // 連鎖尾タイプに応じた倍率を取得
    // 評価順: Y字形(1.5) > 座布団形(1.3) > L字形(1.2) > 階段形(1.0)
    let chainTailMultiplier = GTR_SCORING_CONFIG.CHAIN_TAIL_TYPE.DEFAULT
    if (chainTailType === 'Y') {
      chainTailMultiplier = GTR_SCORING_CONFIG.CHAIN_TAIL_TYPE.Y
    } else if (chainTailType === 'zabuton') {
      chainTailMultiplier = GTR_SCORING_CONFIG.CHAIN_TAIL_TYPE.ZABUTON
    } else if (chainTailType === 'L') {
      chainTailMultiplier = GTR_SCORING_CONFIG.CHAIN_TAIL_TYPE.L
    } else if (chainTailType === 'stairs') {
      chainTailMultiplier = GTR_SCORING_CONFIG.CHAIN_TAIL_TYPE.STAIRS
    }

    // 総合スコア計算（連鎖尾タイプの倍率を適用）
    chainTailScore = chainBonus + row10Bonus + leftoverBonus
    const totalScore = Math.round(
      quality * GTR_SCORING_CONFIG.SCORE_WEIGHTS.BASE_PATTERN_WEIGHT +
      chainTailScore * GTR_SCORING_CONFIG.SCORE_WEIGHTS.CHAIN_TAIL_WEIGHT * chainTailMultiplier
    )
    
    // メッセージ生成
    if (chainCount >= GTR_SCORING_CONFIG.MESSAGE_THRESHOLDS.CHAIN_5_OR_MORE) {
      // 5連鎖以上
      message = GTR_SCORING_CONFIG.MESSAGES.CHAIN_5_OR_MORE.replace('{chain}', chainCount.toString())
    } else if (chainCount >= GTR_SCORING_CONFIG.MESSAGE_THRESHOLDS.CHAIN_4) {
      // 4連鎖
      message = GTR_SCORING_CONFIG.MESSAGES.CHAIN_4.replace('{chain}', chainCount.toString())
    } else if (chainCount >= GTR_SCORING_CONFIG.MESSAGE_THRESHOLDS.CHAIN_3) {
      // 3連鎖
      message = GTR_SCORING_CONFIG.MESSAGES.CHAIN_3.replace('{chain}', chainCount.toString())
    } else {
      // それ以下
      message = GTR_SCORING_CONFIG.MESSAGES.DEFAULT.replace('{chain}', chainCount.toString())
    }
    
    return {
      isGTR,
      quality,
      chainTailScore,
      totalScore,
      chainCount,
      leftoverPuyos,
      message,
      hasBasicPattern: isGTR,
      chainTailType,
      row10Usage,
      leftoverConnected
    }
  }
  
  // GTRの折り返し部分をチェック（正しい形状：11AB, 12AAB, 13BB）
  private static checkBasePattern(field: (PuyoColor | null)[][]): number {
    const height = field.length
    
    // GTRの折り返し部分は最低3行必要
    if (height < 3) return 0
    
    const bottomRow = height - 1  // 最下段（13行目相当、インデックス12）
    const middleRow = height - 2  // 12行目相当（インデックス11）  
    const topRow = height - 3     // 11行目相当（インデックス10）
    
    // GTRの必須パターン（0-indexedの列番号）:
    // 11行目: AB____  (1列目A、2列目B)
    // 12行目: AAB___ (1列目A、2列目A、3列目B) 
    // 13行目: BB____  (1列目B、2列目B)
    
    // 各位置のぷよをチェック
    const row11_col1 = field[topRow] && field[topRow][0]     // A
    const row11_col2 = field[topRow] && field[topRow][1]     // B
    
    const row12_col1 = field[middleRow] && field[middleRow][0]  // A
    const row12_col2 = field[middleRow] && field[middleRow][1]  // A  
    const row12_col3 = field[middleRow] && field[middleRow][2]  // B
    
    const row13_col1 = field[bottomRow] && field[bottomRow][0]  // B
    const row13_col2 = field[bottomRow] && field[bottomRow][1]  // B
    
    // GTRパターンの検証
    if (row11_col1 && row11_col2 && 
        row12_col1 && row12_col2 && row12_col3 &&
        row13_col1 && row13_col2) {
        
      // 色の配置パターンをチェック
      // A色: 11行目1列、12行目1-2列
      // B色: 11行目2列、12行目3列、13行目1-2列
      const colorA = row11_col1
      const colorB = row11_col2
      
      if (colorA !== colorB && // AとBは異なる色
          row12_col1 === colorA && row12_col2 === colorA && // 12行目1-2列はA
          row12_col3 === colorB && // 12行目3列はB  
          row13_col1 === colorB && row13_col2 === colorB) { // 13行目1-2列はB
        
        // 上に拡張チェック（10行目に何かあるか）
        const hasExtension = height > 3 && (field[height - 4][0] || field[height - 4][1])
        
        // 拡張GTR（10行目まで使用）: 120点
        // 基本GTR（11-13行目のみ）: 100点
        return hasExtension ? GTR_SCORING_CONFIG.BASE_PATTERN.EXTENDED_GTR : GTR_SCORING_CONFIG.BASE_PATTERN.BASIC_GTR
      }
    }
    
    return 0
  }
  
  
  // 連鎖尾の配置を評価（GTRは1-3列目を使用するため、4列目以降が連鎖尾）
  private static evaluateChainTail(field: (PuyoColor | null)[][]): number {
    const height = field.length
    let score = 0
    
    // 4-5列目の使用状況をチェック（GTRの連鎖尾）
    let col4Height = 0
    let col5Height = 0
    let col6Height = 0
    
    for (let y = height - 1; y >= 0; y--) {
      if (field[y][3] !== null && col4Height === 0) {
        col4Height = height - y
      }
      if (field[y][4] !== null && col5Height === 0) {
        col5Height = height - y
      }
      if (field[y][5] !== null && col6Height === 0) {
        col6Height = height - y
      }
    }
    
    // 縦積みボーナス（4-5列目が高く積まれている）
    if (col4Height >= 3 && col5Height >= 3) {
      // 4列5列目両方が3段以上: 50点
      score += GTR_SCORING_CONFIG.CHAIN_TAIL.VERTICAL_STACKING.BOTH_HIGH
      // 高さが揃っているとさらにボーナス
      if (Math.abs(col4Height - col5Height) <= 1) {
        // 高さの差が1以下: +30点
        score += GTR_SCORING_CONFIG.CHAIN_TAIL.VERTICAL_STACKING.HEIGHT_ALIGNED
      }
    } else if (col4Height >= 2 || col5Height >= 2) {
      // どちらか片方が2段以上: 30点
      score += GTR_SCORING_CONFIG.CHAIN_TAIL.VERTICAL_STACKING.ONE_HIGH
    }
    
    // 階段状ボーナス（段差がある配置）
    const heightDiff45 = Math.abs(col4Height - col5Height)
    const heightDiff56 = Math.abs(col5Height - col6Height)
    if (heightDiff45 === 1 || heightDiff45 === 2 || heightDiff56 === 1) {
      // 階段状に配置されている: 20点
      score += GTR_SCORING_CONFIG.CHAIN_TAIL.STAIR_PATTERN
    }
    
    // 6列目まで使用していればボーナス
    if (col6Height >= 2) {
      // 6列目に2段以上: 10点
      score += GTR_SCORING_CONFIG.CHAIN_TAIL.COL6_USAGE
    }
    
    return Math.min(GTR_SCORING_CONFIG.CHAIN_TAIL.MAX_SCORE, score)
  }
  
  // 連鎖シミュレーション用のヘルパー関数
  private static copyField(field: (PuyoColor | null)[][]): (PuyoColor | null)[][] {
    return field.map(row => [...row])
  }
  
  // 連結したぷよを探索してグループを返す
  private static findConnectedGroup(field: (PuyoColor | null)[][], x: number, y: number, visited: Set<string>): { x: number; y: number }[] {
    const key = `${x},${y}`
    if (visited.has(key) || !field[y] || !field[y][x]) {
      return []
    }
    
    const color = field[y][x]
    const group: { x: number; y: number }[] = [{ x, y }]
    visited.add(key)
    
    // 上下左右を探索
    const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]]
    for (const [dx, dy] of directions) {
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && nx < 6 && ny >= 0 && ny < field.length && 
          field[ny] && field[ny][nx] === color) {
        group.push(...this.findConnectedGroup(field, nx, ny, visited))
      }
    }
    
    return group
  }
  
  // 連結したぷよを探索してグループを返す（評価範囲内限定）
  private static findConnectedGroupInRange(
    field: (PuyoColor | null)[][], 
    x: number, 
    y: number, 
    visited: Set<string>, 
    range: { minX: number; maxX: number; minY: number; maxY: number }
  ): { x: number; y: number }[] {
    const key = `${x},${y}`
    if (visited.has(key) || !field[y] || !field[y][x]) {
      return []
    }
    
    // 評価範囲外なら探索しない
    if (x < range.minX || x > range.maxX || y < range.minY || y > range.maxY) {
      return []
    }
    
    const color = field[y][x]
    const group: { x: number; y: number }[] = [{ x, y }]
    visited.add(key)
    
    // 上下左右を探索（範囲内のみ）
    const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]]
    for (const [dx, dy] of directions) {
      const nx = x + dx
      const ny = y + dy
      if (nx >= range.minX && nx <= range.maxX && 
          ny >= range.minY && ny <= range.maxY &&
          ny >= 0 && ny < field.length && 
          field[ny] && field[ny][nx] === color) {
        group.push(...this.findConnectedGroupInRange(field, nx, ny, visited, range))
      }
    }
    
    return group
  }
  
  // 消去処理（4つ以上連結したぷよを消す）- 評価範囲内のみ
  private static clearConnectedPuyos(field: (PuyoColor | null)[][], evaluationRange?: { minX: number; maxX: number; minY: number; maxY: number }): { cleared: boolean; clearedPositions: Set<string> } {
    const visited = new Set<string>()
    const clearedPositions = new Set<string>()
    let cleared = false
    
    // 評価範囲の設定（デフォルトは全体）
    const range = evaluationRange || { minX: 0, maxX: 5, minY: 0, maxY: field.length - 1 }
    
    for (let y = range.minY; y <= range.maxY && y < field.length; y++) {
      for (let x = range.minX; x <= range.maxX && x < 6; x++) {
        if (field[y] && field[y][x] && !visited.has(`${x},${y}`)) {
          const group = this.findConnectedGroupInRange(field, x, y, visited, range)
          if (group.length >= 4) {
            // 4つ以上連結しているので消去
            for (const pos of group) {
              field[pos.y][pos.x] = null
              clearedPositions.add(`${pos.x},${pos.y}`)
            }
            cleared = true
          }
        }
      }
    }
    
    return { cleared, clearedPositions }
  }
  
  // 重力落下処理
  private static applyGravity(field: (PuyoColor | null)[][]): boolean {
    let moved = false
    
    // 下から上に向かって処理
    for (let y = field.length - 2; y >= 0; y--) {
      for (let x = 0; x < 6; x++) {
        if (field[y] && field[y][x]) {
          // 落下させる
          let destY = y
          while (destY + 1 < field.length && (!field[destY + 1] || !field[destY + 1][x])) {
            destY++
          }
          
          if (destY !== y) {
            field[destY][x] = field[y][x]
            field[y][x] = null
            moved = true
          }
        }
      }
    }
    
    return moved
  }
  
  // 重力落下処理（評価範囲内のみ）
  private static applyGravityInRange(field: (PuyoColor | null)[][], range: { minX: number; maxX: number; minY: number; maxY: number }): boolean {
    let moved = false
    
    // 下から上に向かって処理（評価範囲内のみ）
    for (let y = range.maxY - 1; y >= range.minY; y--) {
      for (let x = range.minX; x <= range.maxX && x < 6; x++) {
        if (field[y] && field[y][x]) {
          // 落下させる（評価範囲内の底まで）
          let destY = y
          while (destY + 1 <= range.maxY && destY + 1 < field.length && 
                 (!field[destY + 1] || !field[destY + 1][x])) {
            destY++
          }
          
          if (destY !== y) {
            if (!field[destY]) field[destY] = [null, null, null, null, null, null]
            field[destY][x] = field[y][x]
            field[y][x] = null
            moved = true
          }
        }
      }
    }
    
    return moved
  }
  
  // 評価範囲内のぷよを取得
  private static getPuyosInRange(field: (PuyoColor | null)[][]): { x: number; y: number; color: PuyoColor }[] {
    const puyos: { x: number; y: number; color: PuyoColor }[] = []
    for (const range of this.EVALUATION_RANGE) {
      for (let y = range.yStart; y <= range.yEnd; y++) {
        if (field[y] && field[y][range.x]) {
          puyos.push({
            x: range.x,
            y: y,
            color: field[y][range.x] as PuyoColor
          })
        }
      }
    }
    return puyos
  }
  
  // 評価範囲内のぷよ数をカウント
  private static countPuyosInRange(field: (PuyoColor | null)[][]): number {
    return this.getPuyosInRange(field).length
  }
  
  // 連鎖数と使用ぷよを評価（実際のシミュレーション版）
  private static evaluateChainCount(field: (PuyoColor | null)[][]): {
    chainCount: number
    leftoverPuyos: number
    usedPuyos: Set<string>
    leftoverPositions: { x: number; y: number; color: PuyoColor }[]
  } {
    // フィールドのコピーを作成してシミュレーション
    const simulationField = this.copyField(field)
    const usedPuyos = new Set<string>()
    
    // (1,10)に(1,11)と同じ色を置いてシミュレート
    const triggerColor = simulationField[10] && simulationField[10][0]
    if (!triggerColor) {
      // 発火点がない場合は連鎖なし
      return {
        chainCount: 0,
        leftoverPuyos: this.countPuyosInRange(field),
        usedPuyos,
        leftoverPositions: this.getPuyosInRange(field)
      }
    }
    
    // (1,10)にぷよを置く
    if (!simulationField[9]) simulationField[9] = [null, null, null, null, null, null]
    simulationField[9][0] = triggerColor
    
    // 評価範囲を定義（1-2列目: 10-12行目、3-6列目: 9-12行目）
    const evaluationRange = {
      minX: 0,
      maxX: 5,
      minY: 9,  // 10行目（0-indexed）
      maxY: 12  // 13行目（0-indexed）
    }
    
    // 連鎖シミュレーション（評価範囲内のみ）
    let chainCount = 0
    let hasCleared = true
    
    while (hasCleared) {
      // 重力落下（評価範囲内のみ）
      while (this.applyGravityInRange(simulationField, evaluationRange)) {
        // 落下が完了するまで繰り返し
      }
      
      // 消去処理（評価範囲内のみ）
      const clearResult = this.clearConnectedPuyos(simulationField, evaluationRange)
      hasCleared = clearResult.cleared
      
      if (hasCleared) {
        chainCount++
        // 消去したぷよを記録
        for (const pos of clearResult.clearedPositions) {
          usedPuyos.add(pos)
        }
      }
    }
    
    // あまりぷよを特定（評価範囲内で連鎖に使われないぷよ）
    const leftoverPositions = this.getPuyosInRange(field).filter(puyo => {
      const key = `${puyo.x},${puyo.y}`
      return !usedPuyos.has(key)
    })
    
    return {
      chainCount,
      leftoverPuyos: leftoverPositions.length,
      usedPuyos,
      leftoverPositions
    }
  }
  
  // 10行目の使用状況を評価
  private static evaluateRow10Usage(field: (PuyoColor | null)[][], usedPuyos: Set<string>): number {
    // (6,10)だけ、または(6,10)と(5,10)だけが使われているか
    const has610 = field[9] && field[9][5] !== null
    const has510 = field[9] && field[9][4] !== null
    const has410 = field[9] && field[9][3] !== null
    const has310 = field[9] && field[9][2] !== null
    
    if (has610 && !has510 && !has410 && !has310) {
      // (6,10)だけ使用: 15点（最高評価 - 右上が立っている理想形）
      return GTR_SCORING_CONFIG.ROW_10_USAGE.ONLY_COL6
    } else if (has610 && has510 && !has410 && !has310) {
      // (5,10)と(6,10)だけ使用: 10点（高評価）
      return GTR_SCORING_CONFIG.ROW_10_USAGE.COL5_AND_6
    } else if (has610 || has510) {
      // 右側にある: 5点（普通）
      return GTR_SCORING_CONFIG.ROW_10_USAGE.RIGHT_SIDE
    }
    // それ以外: 0点
    return GTR_SCORING_CONFIG.ROW_10_USAGE.DEFAULT
  }
  
  // あまりぷよの評価（note.mdの仕様：同じ色で連結していれば高評価、複数色なら0点）
  private static evaluateLeftoverPuyos(
    field: (PuyoColor | null)[][],
    leftoverPositions: { x: number; y: number; color: PuyoColor }[]
  ): number {
    // あまりぷよなしが最高評価
    if (leftoverPositions.length === 0) {
      // あまりぷよなし: 20点（最高評価）
      return GTR_SCORING_CONFIG.LEFTOVER_PUYOS.NO_LEFTOVER
    }
    
    // あまりぷよの色を確認
    const colors = new Set(leftoverPositions.map(p => p.color))
    if (colors.size > 1) {
      // 複数色のあまりぷよ: 0点（連結していても評価しない）
      return GTR_SCORING_CONFIG.LEFTOVER_PUYOS.MULTIPLE_COLORS
    }
    
    // 単一色の場合、連結をチェック
    let score = 0
    const visited = new Set<string>()
    const groups: { color: PuyoColor; size: number }[] = []
    
    // 各あまりぷよから連結グループを探索
    for (const pos of leftoverPositions) {
      const key = `${pos.x},${pos.y}`
      if (visited.has(key)) continue
      
      // 連結しているぷよを探索（DFS）
      const group = this.findConnectedGroupForLeftover(pos, leftoverPositions, visited)
      groups.push(group)
    }
    
    // 全てのあまりぷよが1つのグループ（完全連結）なら最高評価
    if (groups.length === 1) {
      const groupSize = groups[0].size
      if (groupSize === 3) {
        // 3つが完全連結: 18点（あまりぷよの最大連結）
        score = GTR_SCORING_CONFIG.LEFTOVER_PUYOS.SINGLE_COLOR_CONNECTED.SIZE_3
      } else if (groupSize === 2) {
        // 2つが完全連結: 15点
        score = GTR_SCORING_CONFIG.LEFTOVER_PUYOS.SINGLE_COLOR_CONNECTED.SIZE_2
      }
      // 注：4連結は消えるため、あまりぷよとして存在しない
    } else {
      // 複数グループに分かれている: 5点（低評価）
      score = GTR_SCORING_CONFIG.LEFTOVER_PUYOS.SINGLE_COLOR_SEPARATED
    }
    
    return score
  }
  
  // 連結しているぷよのグループを探索（DFS）- あまりぷよ評価用
  private static findConnectedGroupForLeftover(
    start: { x: number; y: number; color: PuyoColor },
    allPositions: { x: number; y: number; color: PuyoColor }[],
    visited: Set<string>
  ): { color: PuyoColor; size: number } {
    const stack = [start]
    const group = { color: start.color, size: 0 }
    
    while (stack.length > 0) {
      const current = stack.pop()!
      const key = `${current.x},${current.y}`
      
      if (visited.has(key)) continue
      visited.add(key)
      group.size++
      
      // 上下左右の隣接ぷよをチェック
      const neighbors = [
        { x: current.x - 1, y: current.y },
        { x: current.x + 1, y: current.y },
        { x: current.x, y: current.y - 1 },
        { x: current.x, y: current.y + 1 }
      ]
      
      for (const neighbor of neighbors) {
        // 同じ色のぷよが隣接していれば探索に追加
        const found = allPositions.find(
          p => p.x === neighbor.x && p.y === neighbor.y && p.color === current.color
        )
        if (found && !visited.has(`${found.x},${found.y}`)) {
          stack.push(found)
        }
      }
    }
    
    return group
  }
  
  // 連鎖尾の形状タイプを判定
  // 評価順: Y字形 > 座布団形 > L字形 > 階段形
  private static detectChainTailType(field: (PuyoColor | null)[][]): 'Y' | 'zabuton' | 'L' | 'stairs' | undefined {
    // 3-6列目の配置パターンを分析
    const height = field.length

    // 各列の高さを取得
    let col3Height = 0, col4Height = 0, col5Height = 0, col6Height = 0

    for (let y = height - 1; y >= 0; y--) {
      if (field[y][2] !== null && col3Height === 0) col3Height = height - y
      if (field[y][3] !== null && col4Height === 0) col4Height = height - y
      if (field[y][4] !== null && col5Height === 0) col5Height = height - y
      if (field[y][5] !== null && col6Height === 0) col6Height = height - y
    }

    // Y字形の判定（3-5列目が同じ高さで、それぞれ3段以上）⭐⭐⭐⭐
    // Y字形は最も安定した連鎖が作りやすく、初心者にも推奨
    if (col3Height >= 3 && col4Height >= 3 && col5Height >= 3 &&
        Math.abs(col3Height - col4Height) <= 1 && Math.abs(col4Height - col5Height) <= 1) {
      return 'Y'
    }

    // 座布団形の判定（横に広がる形、3-6列目が使われている）⭐⭐⭐
    // 横に広がる安定した配置
    if (col3Height >= 2 && col4Height >= 2 && col5Height >= 2 && col6Height >= 2 &&
        Math.abs(col4Height - col5Height) <= 1 && Math.abs(col5Height - col6Height) <= 1) {
      return 'zabuton'
    }

    // L字形の判定（3-4列目が高く、5列目が低い）⭐⭐
    // L字型に連鎖を組む、バランスが良い
    if (col3Height >= 3 && col4Height >= 3 && col5Height <= 2) {
      return 'L'
    }

    // 階段形の判定（列が順に高くなるまたは低くなる）⭐
    // 連鎖数を伸ばしやすいが難易度高め
    if ((col3Height < col4Height && col4Height < col5Height) ||
        (col3Height > col4Height && col4Height > col5Height)) {
      return 'stairs'
    }

    return undefined
  }
  
  // 10行目の使用状況を分類
  private static classifyRow10Usage(field: (PuyoColor | null)[][], usedPuyos: Set<string>): 'minimal' | 'moderate' | 'heavy' {
    // 10行目（field[9]）の使用状況をチェック
    if (field.length <= 9) return 'minimal'
    
    const row10 = field[9]
    let usedCount = 0
    
    for (let x = 0; x < 6; x++) {
      if (row10[x] !== null && usedPuyos.has(`${x},9`)) {
        usedCount++
      }
    }
    
    if (usedCount <= 1) return 'minimal'  // 右上が立っている
    if (usedCount <= 3) return 'moderate'
    return 'heavy'
  }
  
  // あまりぷよが連結しているかチェック
  private static checkLeftoverConnected(leftoverPositions: { x: number; y: number; color: PuyoColor }[]): boolean {
    if (leftoverPositions.length === 0) return false
    
    // 色ごとにグループ化
    const colorGroups: { [key: string]: { x: number; y: number }[] } = {}
    leftoverPositions.forEach(pos => {
      if (!colorGroups[pos.color]) colorGroups[pos.color] = []
      colorGroups[pos.color].push({ x: pos.x, y: pos.y })
    })
    
    // 各色のグループが連結しているかチェック
    for (const color in colorGroups) {
      const positions = colorGroups[color]
      if (positions.length >= 2) {
        // DFSで連結性をチェック
        const visited = new Set<string>()
        const stack = [positions[0]]
        visited.add(`${positions[0].x},${positions[0].y}`)
        
        while (stack.length > 0) {
          const current = stack.pop()!
          
          for (const pos of positions) {
            const key = `${pos.x},${pos.y}`
            if (!visited.has(key)) {
              // 隣接しているかチェック
              if (Math.abs(pos.x - current.x) + Math.abs(pos.y - current.y) === 1) {
                visited.add(key)
                stack.push(pos)
              }
            }
          }
        }
        
        // 全ての位置が訪問されていれば連結
        if (visited.size === positions.length) {
          return true
        }
      }
    }
    
    return false
  }
  
  // GTRガイド表示用の座標を取得（正しい形状：10AB, 11AAB, 12BB）
  static getGTRGuidePositions(): { x: number; y: number }[] {
    // 1-3列目のGTR配置位置を返す（0-indexedで0-2列目）
    return [
      { x: 0, y: 12 }, { x: 1, y: 12 }, // 13行目：BB
      { x: 0, y: 11 }, { x: 1, y: 11 }, { x: 2, y: 11 }, // 12行目：AAB
      { x: 0, y: 10 }, { x: 1, y: 10 }, // 11行目：AB
    ]
  }
}