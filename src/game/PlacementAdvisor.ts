// GTR最適配置推薦システム
// フィールド状態 + 現在のぷよペアから最適な配置位置を推薦する

import { PuyoColor, GameField, PuyoPair } from './types'
import { GTRDetector } from './GTRPatterns'
import { ADVISOR_WEIGHTS, ADVISOR_SCORING } from './PlacementAdvisorConfig'

export enum GamePhase {
  FOLD_BUILDING = 'fold_building',
  CHAIN_TAIL = 'chain_tail',
  COMPLETION = 'completion',
}

export interface LandingResult {
  mainPos: { x: number; y: number }
  subPos: { x: number; y: number }
  valid: boolean
}

export interface PlacementScore {
  placement: { column: number; rotation: number }
  landing: LandingResult
  totalScore: number
  phase: GamePhase
}

export interface PlacementAdvice {
  bestPlacement: PlacementScore | null
  allPlacements: PlacementScore[]
  phase: GamePhase
  phaseMessage: string
}

export class PlacementAdvisor {
  // メインAPI: フィールドとぷよペアからアドバイスを生成
  static getAdvice(field: GameField, currentPair: PuyoPair): PlacementAdvice {
    const grid = field.grid
    const mainColor = currentPair.main.color
    const subColor = currentPair.sub.color
    const phase = this.detectPhase(grid)

    const candidates: PlacementScore[] = []

    for (const rotation of [0, 1, 2, 3]) {
      const [minCol, maxCol] = this.getColumnRange(rotation)
      for (let col = minCol; col <= maxCol; col++) {
        const landing = this.simulateLanding(grid, col, rotation)
        if (!landing.valid) continue

        const gridAfter = this.applyPlacement(grid, landing, mainColor, subColor)

        const foldProgressScore = this.scoreFoldProgress(gridAfter, grid, landing, mainColor, subColor)
        const chainTailScore = this.scoreChainTail(gridAfter, landing)
        const connectivityScore = this.scoreConnectivity(gridAfter, landing, mainColor, subColor)
        const heightPenalty = this.scoreHeightPenalty(landing)
        const chainSimScore = phase !== GamePhase.FOLD_BUILDING
          ? this.scoreChainSimulation(gridAfter) : 0

        const weights = ADVISOR_WEIGHTS[phase]
        const totalScore =
          foldProgressScore * weights.foldProgress +
          chainTailScore * weights.chainTail +
          connectivityScore * weights.connectivity +
          heightPenalty * weights.heightPenalty +
          chainSimScore * weights.chainSim

        candidates.push({
          placement: { column: col, rotation },
          landing,
          totalScore,
          phase,
        })
      }
    }

    candidates.sort((a, b) => b.totalScore - a.totalScore)

    return {
      bestPlacement: candidates[0] ?? null,
      allPlacements: candidates,
      phase,
      phaseMessage: this.getPhaseMessage(phase),
    }
  }

  // --- フェーズ検出 ---

  private static detectPhase(grid: (PuyoColor | null)[][]): GamePhase {
    const gtrResult = GTRDetector.detectGTR(grid)

    if (!gtrResult.hasBasicPattern) {
      return GamePhase.FOLD_BUILDING
    }

    // 連鎖尾エリア(col3-5, 下4行)のぷよ数をカウント
    const h = grid.length
    let tailPuyoCount = 0
    for (let col = 3; col <= 5; col++) {
      for (let y = h - 1; y >= h - 4; y--) {
        if (y >= 0 && grid[y]?.[col] !== null) tailPuyoCount++
      }
    }

    return tailPuyoCount >= 6 ? GamePhase.COMPLETION : GamePhase.CHAIN_TAIL
  }

  // --- 候補列挙ヘルパー ---

  private static getColumnRange(rotation: number): [number, number] {
    switch (rotation) {
      case 0: return [0, 5]  // 縦: sub上
      case 1: return [0, 4]  // 横右: sub右
      case 2: return [0, 5]  // 縦: sub下
      case 3: return [1, 5]  // 横左: sub左
      default: return [0, 5]
    }
  }

  // --- 着地シミュレーション ---

  private static findLowestEmpty(grid: (PuyoColor | null)[][], column: number): number {
    for (let y = grid.length - 1; y >= 0; y--) {
      if (grid[y][column] === null) return y
    }
    return -1
  }

  private static simulateLanding(
    grid: (PuyoColor | null)[][],
    column: number,
    rotation: number
  ): LandingResult {
    const width = grid[0]?.length ?? 6
    let mainX = column
    let subX: number

    switch (rotation) {
      case 0: subX = column; break
      case 1: subX = column + 1; break
      case 2: subX = column; break
      case 3: subX = column - 1; break
      default: subX = column
    }

    // 範囲外チェック
    if (mainX < 0 || mainX >= width || subX < 0 || subX >= width) {
      return { mainPos: { x: 0, y: 0 }, subPos: { x: 0, y: 0 }, valid: false }
    }

    // 縦向き(rotation 0: sub上, rotation 2: sub下)
    if (rotation === 0 || rotation === 2) {
      const lowestEmpty = this.findLowestEmpty(grid, mainX)
      if (lowestEmpty < 1) {
        return { mainPos: { x: 0, y: 0 }, subPos: { x: 0, y: 0 }, valid: false }
      }
      if (rotation === 0) {
        // sub上: mainが下、subがその上
        return {
          mainPos: { x: mainX, y: lowestEmpty },
          subPos: { x: subX, y: lowestEmpty - 1 },
          valid: true,
        }
      } else {
        // sub下: subが下、mainがその上
        return {
          mainPos: { x: mainX, y: lowestEmpty - 1 },
          subPos: { x: subX, y: lowestEmpty },
          valid: true,
        }
      }
    }

    // 横向き(rotation 1: sub右, rotation 3: sub左)
    const mainLowest = this.findLowestEmpty(grid, mainX)
    const subLowest = this.findLowestEmpty(grid, subX)
    if (mainLowest < 0 || subLowest < 0) {
      return { mainPos: { x: 0, y: 0 }, subPos: { x: 0, y: 0 }, valid: false }
    }
    return {
      mainPos: { x: mainX, y: mainLowest },
      subPos: { x: subX, y: subLowest },
      valid: true,
    }
  }

  // --- グリッドクローンに配置 ---

  private static applyPlacement(
    grid: (PuyoColor | null)[][],
    landing: LandingResult,
    mainColor: PuyoColor,
    subColor: PuyoColor
  ): (PuyoColor | null)[][] {
    const clone = grid.map(row => [...row])
    clone[landing.mainPos.y][landing.mainPos.x] = mainColor
    clone[landing.subPos.y][landing.subPos.x] = subColor
    return clone
  }

  // --- スコアラー: 折り返し進捗（テンプレートマッチング方式） ---

  private static readonly ALL_COLORS: PuyoColor[] = [
    PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW
  ]

  private static scoreFoldProgress(
    gridAfter: (PuyoColor | null)[][],
    gridBefore: (PuyoColor | null)[][],
    landing: LandingResult,
    mainColor: PuyoColor,
    subColor: PuyoColor
  ): number {
    // 全色組み合わせ(A,B)を試し、最もスコアの高いものを採用
    let bestScore = -Infinity

    for (const a of this.ALL_COLORS) {
      for (const b of this.ALL_COLORS) {
        if (a === b) continue
        const score = this.evaluateTemplate(gridAfter, gridBefore, a, b, landing, mainColor, subColor)
        if (score > bestScore) bestScore = score
      }
    }

    // エリア外ペナルティを加算
    const areaScore = this.scoreFoldAreaPenalty(landing, gridAfter.length)

    return bestScore + areaScore
  }

  // テンプレート一致度評価: 指定した(colorA, colorB)割り当てでのスコア
  private static evaluateTemplate(
    gridAfter: (PuyoColor | null)[][],
    gridBefore: (PuyoColor | null)[][],
    colorA: PuyoColor,
    colorB: PuyoColor,
    landing: LandingResult,
    mainColor: PuyoColor,
    subColor: PuyoColor
  ): number {
    const S = ADVISOR_SCORING.FOLD
    const h = gridAfter.length

    // GTRテンプレート: 7つのターゲット位置（優先度付き）
    // Row h-1: [B][B]      → 優先度1
    // Row h-2: [A][A][B]   → 優先度2
    // Row h-3: [A][B]      → 優先度3
    const targets: { x: number; y: number; expectedColor: PuyoColor; priority: number }[] = [
      { x: 0, y: h - 1, expectedColor: colorB, priority: 1 },
      { x: 1, y: h - 1, expectedColor: colorB, priority: 1 },
      { x: 0, y: h - 2, expectedColor: colorA, priority: 2 },
      { x: 1, y: h - 2, expectedColor: colorA, priority: 2 },
      { x: 2, y: h - 2, expectedColor: colorB, priority: 2 },
      { x: 0, y: h - 3, expectedColor: colorA, priority: 3 },
      { x: 1, y: h - 3, expectedColor: colorB, priority: 3 },
    ]

    // まず既存ぷよとの矛盾チェック
    // gridBefore上でターゲット位置に色があり、(A,B)割り当てと矛盾する場合は -Infinity
    for (const t of targets) {
      const existingColor = gridBefore[t.y]?.[t.x]
      if (existingColor !== null && existingColor !== undefined) {
        if (existingColor !== t.expectedColor) {
          return -Infinity
        }
      }
    }

    // 優先度ごとの充足状況を計算（gridAfter基準）
    const priorityFilled: Record<number, { total: number; filled: number }> = {
      1: { total: 0, filled: 0 },
      2: { total: 0, filled: 0 },
      3: { total: 0, filled: 0 },
    }

    for (const t of targets) {
      priorityFilled[t.priority].total++
      const cellColor = gridAfter[t.y]?.[t.x]
      if (cellColor === t.expectedColor) {
        priorityFilled[t.priority].filled++
      }
    }

    // 今回配置した2つのぷよを特定
    const placedPositions = [
      { pos: landing.mainPos, color: mainColor },
      { pos: landing.subPos, color: subColor },
    ]

    let score = 0

    for (const puyo of placedPositions) {
      const target = targets.find(t => t.x === puyo.pos.x && t.y === puyo.pos.y)
      if (!target) continue

      // gridBeforeの時点で既にその位置が埋まっていたら、今回の配置とは無関係
      const beforeColor = gridBefore[target.y]?.[target.x]
      if (beforeColor !== null && beforeColor !== undefined) {
        continue
      }

      // 今回の配置で正しい色を置いた
      if (puyo.color === target.expectedColor) {
        const matchBonus = target.priority === 1
          ? S.PRIORITY_1_MATCH
          : target.priority === 2
            ? S.PRIORITY_2_MATCH
            : S.PRIORITY_3_MATCH

        // 前提条件チェック（積み順考慮）
        let multiplier = 1.0
        if (target.priority === 2) {
          // 優先度1がまだ全部埋まっていなければボーナス半減
          // gridBefore時点での優先度1充足をチェック
          const p1Filled = targets
            .filter(t => t.priority === 1)
            .every(t => gridBefore[t.y]?.[t.x] === t.expectedColor)
          if (!p1Filled) multiplier = S.PREREQUISITE_PENALTY
        } else if (target.priority === 3) {
          // 優先度2がまだ全部埋まっていなければボーナス半減
          const p2Filled = targets
            .filter(t => t.priority === 2)
            .every(t => gridBefore[t.y]?.[t.x] === t.expectedColor)
          if (!p2Filled) multiplier = S.PREREQUISITE_PENALTY
        }

        score += matchBonus * multiplier
      } else {
        // 今回の配置で間違った色を置いた（ブロッキング）
        score += S.WRONG_COLOR_PENALTY
      }
    }

    return score
  }

  // 折り返しエリア外ペナルティ
  private static scoreFoldAreaPenalty(landing: LandingResult, height: number): number {
    const S = ADVISOR_SCORING.FOLD
    let penalty = 0

    for (const pos of [landing.mainPos, landing.subPos]) {
      // col0-2でh-4以上（高すぎる）
      if (pos.x <= 2 && pos.y < height - 3) {
        penalty += S.TOO_HIGH_ON_FOLD_SIDE
      }
      // 折り返しエリア(col0-2, row h-3〜h-1)の外
      else if (pos.x > 2 || pos.y < height - 3) {
        penalty += S.OUTSIDE_FOLD_PENALTY
      }
    }

    return penalty
  }

  // --- スコアラー: 連鎖尾（エリアガイドのみ） ---

  private static scoreChainTail(
    gridAfter: (PuyoColor | null)[][],
    landing: LandingResult
  ): number {
    const S = ADVISOR_SCORING.CHAIN_TAIL
    const h = gridAfter.length
    let score = 0

    for (const pos of [landing.mainPos, landing.subPos]) {
      // col3-5に配置
      if (pos.x >= 3 && pos.x <= 5) {
        score += S.CORRECT_COLUMN_BONUS
      }
      // 高すぎる位置へのペナルティ
      if (pos.y < h - 4) {
        score += S.TOO_HIGH_PENALTY
      }
    }

    return score
  }

  // --- スコアラー: 同色連結 ---

  private static scoreConnectivity(
    gridAfter: (PuyoColor | null)[][],
    landing: LandingResult,
    mainColor: PuyoColor,
    subColor: PuyoColor
  ): number {
    const S = ADVISOR_SCORING.CONNECTIVITY
    let score = 0

    const positions = [
      { pos: landing.mainPos, color: mainColor },
      { pos: landing.subPos, color: subColor },
    ]

    const counted = new Set<string>()

    for (const { pos, color } of positions) {
      const key = `${pos.x},${pos.y}`
      if (counted.has(key)) continue

      const group = this.floodFill(gridAfter, pos.x, pos.y, color)
      for (const cell of group) counted.add(cell)

      if (group.size >= 4) {
        score += S.GROUP_SIZE_4_PLUS
      } else if (group.size === 3) {
        score += S.GROUP_SIZE_3
      } else if (group.size === 2) {
        score += S.GROUP_SIZE_2
      }
    }

    return score
  }

  private static floodFill(
    grid: (PuyoColor | null)[][],
    startX: number,
    startY: number,
    color: PuyoColor
  ): Set<string> {
    const h = grid.length
    const w = grid[0]?.length ?? 6
    const visited = new Set<string>()
    const stack = [{ x: startX, y: startY }]

    while (stack.length > 0) {
      const { x, y } = stack.pop()!
      const key = `${x},${y}`
      if (visited.has(key)) continue
      if (x < 0 || x >= w || y < 0 || y >= h) continue
      if (grid[y]?.[x] !== color) continue
      visited.add(key)
      stack.push({ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 })
    }

    return visited
  }

  // --- スコアラー: 高さペナルティ ---

  private static scoreHeightPenalty(landing: LandingResult): number {
    const S = ADVISOR_SCORING.HEIGHT
    let score = 0

    for (const pos of [landing.mainPos, landing.subPos]) {
      if (pos.y <= 2) {
        score += S.CRITICAL_ZONE
      } else if (pos.y <= 4) {
        score += S.WARNING_ZONE
      }
    }

    return score
  }

  // --- スコアラー: 連鎖シミュレーション ---

  private static scoreChainSimulation(gridAfter: (PuyoColor | null)[][]): number {
    const S = ADVISOR_SCORING.CHAIN_SIM
    const gtrResult = GTRDetector.detectGTR(gridAfter)
    let score = 0

    if (gtrResult.hasBasicPattern) {
      score += S.HAS_PATTERN_BONUS
    }
    score += gtrResult.chainCount * S.PER_CHAIN_BONUS

    return score
  }

  // --- ヘルパー ---

  private static getPhaseMessage(phase: GamePhase): string {
    switch (phase) {
      case GamePhase.FOLD_BUILDING:
        return '折り返しを作ろう（左下にぷよを積む）'
      case GamePhase.CHAIN_TAIL:
        return '連鎖尾を伸ばそう（右側にぷよを積む）'
      case GamePhase.COMPLETION:
        return 'GTRを完成させよう'
    }
  }
}
