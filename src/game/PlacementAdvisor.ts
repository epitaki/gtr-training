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
  static getAdvice(field: GameField, currentPair: PuyoPair, nextPair?: PuyoPair): PlacementAdvice {
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
        const chainTailScore = this.scoreChainTail(gridAfter, landing, mainColor, subColor)
        const connectivityScore = this.scoreConnectivity(gridAfter, landing, mainColor, subColor)
        const heightPenalty = this.scoreHeightPenalty(landing)
        const chainSimScore = phase !== GamePhase.FOLD_BUILDING
          ? this.scoreChainSimulation(gridAfter) : 0

        const weights = ADVISOR_WEIGHTS[phase]
        let totalScore =
          foldProgressScore * weights.foldProgress +
          chainTailScore * weights.chainTail +
          connectivityScore * weights.connectivity +
          heightPenalty * weights.heightPenalty +
          chainSimScore * weights.chainSim

        // ネクスト先読み: nextPairの最善スコアを加算
        if (nextPair && ADVISOR_SCORING.LOOKAHEAD.ENABLED) {
          const lookaheadScore = this.evaluateLookahead(gridAfter, nextPair, phase)
          totalScore += lookaheadScore * ADVISOR_SCORING.LOOKAHEAD.DISCOUNT
        }

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

  // ネクスト先読み: nextPairの全配置を軽量スコアリングし最善スコアを返す
  private static evaluateLookahead(
    gridAfterCurrent: (PuyoColor | null)[][],
    nextPair: PuyoPair,
    currentPhase: GamePhase
  ): number {
    const nextMainColor = nextPair.main.color
    const nextSubColor = nextPair.sub.color
    let bestNextScore = -Infinity

    for (const rotation of [0, 1, 2, 3]) {
      const [minCol, maxCol] = this.getColumnRange(rotation)
      for (let col = minCol; col <= maxCol; col++) {
        const nextLanding = this.simulateLanding(gridAfterCurrent, col, rotation)
        if (!nextLanding.valid) continue

        const gridAfterNext = this.applyPlacement(
          gridAfterCurrent, nextLanding, nextMainColor, nextSubColor
        )

        // 軽量スコアリング: chainSimは常にスキップ（重いため）
        const foldScore = this.scoreFoldProgress(
          gridAfterNext, gridAfterCurrent, nextLanding, nextMainColor, nextSubColor
        )
        const tailScore = this.scoreChainTail(
          gridAfterNext, nextLanding, nextMainColor, nextSubColor
        )
        const connScore = this.scoreConnectivity(
          gridAfterNext, nextLanding, nextMainColor, nextSubColor
        )
        const htScore = this.scoreHeightPenalty(nextLanding)

        const weights = ADVISOR_WEIGHTS[currentPhase]
        const nextScore =
          foldScore * weights.foldProgress +
          tailScore * weights.chainTail +
          connScore * weights.connectivity +
          htScore * weights.heightPenalty

        if (nextScore > bestNextScore) {
          bestNextScore = nextScore
        }
      }
    }

    return isFinite(bestNextScore) ? bestNextScore : 0
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
    const areaScore = this.scoreFoldAreaPenalty(landing, gridAfter.length, gridBefore)

    // 全テンプレート割り当てが矛盾する場合（折り返しが壊れた状態）
    // -Infinityのままだと全配置が-Infinityになり推薦がランダム化する
    // → エリアペナルティのみで判定し、連鎖尾へ誘導する
    if (!isFinite(bestScore)) {
      return areaScore
    }

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
          // P3の前提: P1が完了していること（重力でP2位置を経由するため実質P2も充填済み）
          // evaluateTemplateの矛盾チェック(-Infinity)が色の正しさを保証するため
          // P2色チェックは不要（過剰に厳しく、P3完成率を下げていた）
          const p1Filled = targets
            .filter(t => t.priority === 1)
            .every(t => gridBefore[t.y]?.[t.x] === t.expectedColor)
          if (!p1Filled) multiplier = S.PREREQUISITE_PENALTY
        }

        score += matchBonus * multiplier
      } else {
        // 今回の配置で間違った色を置いた（ブロッキング）
        score += S.WRONG_COLOR_PENALTY
      }
    }

    return score
  }

  // GTRテンプレートターゲット座標（色に依存しない）
  private static getTemplatePositions(height: number): Set<string> {
    return new Set([
      `0,${height - 1}`, `1,${height - 1}`,                    // P1: 最下段
      `0,${height - 2}`, `1,${height - 2}`, `2,${height - 2}`, // P2: 中段
      `0,${height - 3}`, `1,${height - 3}`,                    // P3: 上段
    ])
  }

  // 折り返しエリアペナルティ
  private static scoreFoldAreaPenalty(
    landing: LandingResult,
    height: number,
    gridBefore: (PuyoColor | null)[][]
  ): number {
    const S = ADVISOR_SCORING.FOLD
    const templatePos = this.getTemplatePositions(height)
    let penalty = 0

    for (const pos of [landing.mainPos, landing.subPos]) {
      const key = `${pos.x},${pos.y}`

      // col0-2でh-4以上（高すぎる）
      if (pos.x <= 2 && pos.y < height - 3) {
        // P3テンプレート直上(h-4)のコンパニオンは軽減ペナルティ
        if (pos.y === height - 4 && templatePos.has(`${pos.x},${height - 3}`)) {
          penalty += S.P3_COMPANION_TOO_HIGH
        } else {
          penalty += S.TOO_HIGH_ON_FOLD_SIDE
        }
      }
      // 折り返しエリア内だがテンプレート外（(2,12),(2,10)等）
      else if (pos.x <= 2 && pos.y >= height - 3 && !templatePos.has(key)) {
        // (2,h-1)は(2,h-2)テンプレートへの踏み台
        // P1完了後 かつ (2,11)がまだ空なら充填を促進
        // P1未完了時はP1構築を優先するため通常ペナルティ
        const p1Complete = gridBefore[height - 1]?.[0] !== null && gridBefore[height - 1]?.[1] !== null
        if (pos.x === 2 && pos.y === height - 1 && p1Complete && gridBefore[height - 2]?.[2] === null) {
          penalty += S.STEPPING_STONE_BONUS
        }
        // (2,h-3)は連鎖尾接続点: P2(2,h-2)完了後はペナルティなし
        // GTR研究により3列目(col2)は折り返しと連鎖尾の接続エリア
        else if (pos.x === 2 && pos.y === height - 3 && gridBefore[height - 2]?.[2] !== null) {
          penalty += S.CHAIN_TAIL_CONNECTION
        } else {
          penalty += S.NON_TARGET_FOLD_PENALTY
        }
      }
      // 折り返しエリアの外
      else if (pos.x > 2 || pos.y < height - 3) {
        penalty += S.OUTSIDE_FOLD_PENALTY
      }
    }

    return penalty
  }

  // --- スコアラー: 連鎖尾（パターン構築ガイド） ---

  private static scoreChainTail(
    gridAfter: (PuyoColor | null)[][],
    landing: LandingResult,
    mainColor: PuyoColor,
    subColor: PuyoColor
  ): number {
    const S = ADVISOR_SCORING.CHAIN_TAIL
    const h = gridAfter.length
    let score = 0

    const positions = [
      { pos: landing.mainPos, color: mainColor },
      { pos: landing.subPos, color: subColor },
    ]

    for (const { pos, color } of positions) {
      // エリア配置ボーナス
      if (pos.x >= 3 && pos.x <= 5) {
        score += S.CORRECT_COLUMN_BONUS

        // 横方向同色隣接ボーナス（連鎖尾エリア内のみ）
        for (const dx of [-1, 1]) {
          const nx = pos.x + dx
          if (nx >= 3 && nx <= 5 && gridAfter[pos.y]?.[nx] === color) {
            score += S.HORIZONTAL_ADJACENCY_BONUS
          }
        }

        // 同色カラムボーナス: 同じ列に既に同色ぷよがあれば縦1色カラム形成（Y字・L字促進）
        const colBelow = pos.y + 1
        const colAbove = pos.y - 1
        if ((colBelow < h && gridAfter[colBelow]?.[pos.x] === color) ||
            (colAbove >= 0 && gridAfter[colAbove]?.[pos.x] === color)) {
          score += S.SAME_COLOR_COLUMN_BONUS
        }

        // 底部充填ボーナス
        if (pos.y === h - 1) score += S.BOTTOM_ROW_BONUS
        else if (pos.y === h - 2) score += S.SECOND_ROW_BONUS
      }

      // 高すぎる位置へのペナルティ
      if (pos.y < h - 4) {
        score += S.TOO_HIGH_PENALTY
      }
    }

    // レイヤー構造ボーナス（各列3-5で2色以上のレイヤー）
    for (let col = 3; col <= 5; col++) {
      const layers = this.countColorLayers(gridAfter, col)
      const colHeight = this.getColumnHeight(gridAfter, col)
      if (layers >= 2 && colHeight >= 2) {
        score += S.LAYER_BONUS
      }
    }

    // 列バランスボーナス（col3-5の高さ差≤1）
    const heights = [3, 4, 5].map(col => this.getColumnHeight(gridAfter, col))
    const maxH = Math.max(...heights)
    const minH = Math.min(...heights)
    if (maxH - minH <= 1 && maxH >= 2) {
      score += S.BALANCED_HEIGHT_BONUS
    }

    // 左偏り防止: col3(4列目, x=3)がcol4(5列目)またはcol5(6列目)より
    // 2段以上高い場合に、col3への追加配置をペナルティ
    // 理由: 連鎖尾がcol3に偏るとY字が左に1列ズレた形になる
    const [h3, h4, h5] = heights
    const placedInCol3 = [landing.mainPos, landing.subPos].some(p => p.x === 3)
    if (placedInCol3 && (h3 > h4 + 1 || h3 > h5 + 1)) {
      score += S.LEFT_BIAS_PENALTY
    }

    return score
  }

  // 列の高さを返す（下から数えて何段ぷよがあるか）
  private static getColumnHeight(grid: (PuyoColor | null)[][], col: number): number {
    const h = grid.length
    for (let y = 0; y < h; y++) {
      if (grid[y]?.[col] !== null) return h - y
    }
    return 0
  }

  // 列の下からの色レイヤー数を返す（連続する同色を1レイヤーとカウント）
  private static countColorLayers(grid: (PuyoColor | null)[][], col: number): number {
    const h = grid.length
    let layers = 0
    let prevColor: PuyoColor | null = null
    for (let y = h - 1; y >= 0; y--) {
      const cell = grid[y]?.[col]
      if (cell === null) break
      if (cell !== prevColor) {
        layers++
        prevColor = cell
      }
    }
    return layers
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
        // 縦3積み（同列に3つ）は連鎖尾の理想形を破壊するためペナルティ
        if (this.isVerticalStack(group)) {
          score += S.GROUP_SIZE_3_VERTICAL
        } else if (this.isFoldAreaGroup(group, gridAfter.length)) {
          // 折り返しエリア内3連結は暴発リスク（例: row12にBBB→(2,11)B追加でBBBB暴発）
          score += S.GROUP_SIZE_3_FOLD
        } else {
          score += S.GROUP_SIZE_3
        }
      } else if (group.size === 2) {
        score += S.GROUP_SIZE_2
      }
    }

    return score
  }

  // 3連結グループが非テンプレートの折り返し位置（(2,12)等）を含むか
  // テンプレートのみで構成される3-group（A(0,11)+A(1,11)+A(0,10)等）はOK
  private static isFoldAreaGroup(group: Set<string>, height: number): boolean {
    const templatePos = this.getTemplatePositions(height)
    for (const key of group) {
      const [xStr, yStr] = key.split(',')
      const x = parseInt(xStr)
      const y = parseInt(yStr)
      // 折り返しエリア内(cols 0-2, 下3行)の非テンプレート位置を含む場合のみ
      if (x <= 2 && y >= height - 3 && !templatePos.has(key)) {
        return true
      }
    }
    return false
  }

  // 3連結グループが全て同じ列にあるか（縦積み判定）
  private static isVerticalStack(group: Set<string>): boolean {
    if (group.size < 3) return false
    let col: number | null = null
    for (const key of group) {
      const x = parseInt(key.split(',')[0])
      if (col === null) {
        col = x
      } else if (x !== col) {
        return false
      }
    }
    return true
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
