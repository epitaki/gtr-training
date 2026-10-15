import { PuyoColor } from '../core/types'
import { GTR_SCORING_CONFIG } from './GTRScoringConfig'
import { applyGravity, findClearPositions, resolveChains, type OriginGrid, type ClearStep } from '../core/ChainSimulator'
import { inspectHeadExtension } from './HeadExtension'
import { createGTREvaluationGrid, isInGTREvaluationRange } from './EvaluationRange'
import { evaluateLeftovers } from './LeftoverEvaluation'

// GTRの評価ポイント
export interface GTRScore {
  scoringVersion?: typeof GTR_SCORING_CONFIG.VERSION // 旧保存結果は未記録
  minimalFoundationComplete?: boolean // 旧保存結果は未記録
  isGTR: boolean // GTRの形が成立しているか
  quality: number // 形の質（0-100）
  chainTailScore: number // 連鎖尾の素点（現行設定は0-85。既存の詳細表示用）
  totalScore: number // 評価範囲内の土台スコア（0-100）。全盤面の安全性とは別
  chainCount: number // 評価範囲内だけの連鎖数（全盤面の実連鎖とは区別）
  leftoverPuyos: number // 評価範囲内から始めた連鎖のあまりぷよ数
  message?: string // 評価メッセージ
  // 詳細な評価結果用
  hasBasicPattern: boolean // 折り返しパターンがあるか
  chainTailType?: 'Y' | 'zabuton' | 'L' | 'stairs' // 説明用の連鎖尾形状タイプ（形状名だけの評価順は付けない）
  row10Usage: 'minimal' | 'moderate' | 'heavy' // 10行目の使用状況
  rightEdgeRaised?: boolean // 右端4段目の有効な段差。省略は旧保存データの未記録
  leftoverConnected: boolean // あまりぷよが連結しているか
}

// 本ツールが対象とする左折り標準GTRコアの形状定義
// 歴史的なGTR全体やすべての派生形を定義するものではない
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
  
  // 上に拡張したGTRの参考形（上に置くだけでは加点しない）
  extendedFold: {
    pattern: [
      ['B', 'B', '_', '_', '_', '_'], // 13行目（最下段）：BB____
      ['A', 'A', 'B', '_', '_', '_'], // 12行目：AAB___
      ['A', 'B', '_', '_', '_', '_'], // 11行目：AB____
      ['C', 'C', '_', '_', '_', '_'], // 10行目：CC____（さらに上に積む）
    ],
    requiredColumns: [0, 1, 2], // 必須列：1列目、2列目、3列目
    description: '上に拡張したGTR',
    score: 100
  }
  
  // 注意：
  // - GTRの必須形状：11AB, 12AAB, 13BB
  // - 逆折りGTRは現行の製品スコープ外
}

// 連鎖尾の説明用パターン（現在の候補評価では型別倍率を使わない）
export const CHAIN_TAIL_PATTERNS = {
  // 4-5列目に縦に積む例
  vertical: {
    pattern: [
      ['_', '_', '_', 'X', 'Y', '_'], // 任意の高さ
      ['_', '_', '_', 'X', 'Y', '_'],
    ],
    columns: [3, 4],
    scoreMultiplier: 1.5 // 後方互換用。現行評価では参照しない
  },
  
  // 階段状に積む例
  stairs: {
    pattern: [
      ['_', '_', '_', 'X', '_', '_'],
      ['_', '_', '_', 'X', 'Y', '_'],
      ['_', '_', '_', '_', 'Y', 'Z'],
    ],
    columns: [3, 4, 5],
    scoreMultiplier: 1.3
  },
  
  // 横に広がる例
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
  // フィールドがGTRパターンに一致するかチェック（note.mdの仕様に基づく）
  static detectGTR(sourceField: (PuyoColor | null)[][]): GTRScore {
    // The result screen grades only the highlighted foundation. Mask before
    // simulation: outside puyos must not fall into later links or leftovers.
    const field = createGTREvaluationGrid(sourceField)
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
        scoringVersion: GTR_SCORING_CONFIG.VERSION,
        minimalFoundationComplete: false,
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
        rightEdgeRaised: false,
        leftoverConnected: false
      }
    }
    
    quality = baseScore
    
    // 連鎖数の評価（(1,10)に(1,11)と同じ色が来たときの連鎖）
    const chainResult = this.evaluateChainCount(field)
    chainCount = chainResult.chainCount
    leftoverPuyos = chainResult.leftoverPuyos
    isGTR = chainCount >= GTR_SCORING_CONFIG.MESSAGE_THRESHOLDS.CHAIN_3
    
    // 連鎖数による加点（最大5連鎖）
    const chainBonus = Math.min(chainCount, GTR_SCORING_CONFIG.CHAIN_COUNT.MAX_CHAIN) * GTR_SCORING_CONFIG.CHAIN_COUNT.POINTS_PER_CHAIN
    
    // あまりぷよの評価（同じ色で連結している）
    const leftoverBonus = this.evaluateLeftoverPuyos(field, chainResult.leftoverPositions)
    
    // 列の高さだけではY字/L字等を判定できないため、色と消去順を使う
    // 判定器が実装されるまでは型名と型別倍率を付けない。
    const chainTailType: GTRScore['chainTailType'] = undefined

    // 10行目の使用状況を判定
    const row10Usage = this.classifyRow10Usage(field, chainResult.usedPuyos)
    const rightEdgeRaised = this.hasRaisedRightEdge(field, chainResult.usedPuyos)

    // あまりぷよが連結しているか判定
    const leftoverConnected = this.checkLeftoverConnected(chainResult.leftoverPositions)

    // Fold and tail have different raw maxima (100 / 85 by default).
    // Normalize each before weighting so a complete low five-chain is 100.
    // Keep raw tail points for existing detail displays; do not reward a
    // shape name or chains beyond five, and never exceed the 100-point scale.
    const isPerfectFoundation = chainCount === 5 && chainResult.allClear &&
      sourceField.length === 13 && sourceField.every(row => row.length === 6) &&
      field.flat().filter(color => color !== null).length === 19 &&
      !applyGravity(field).moved && findClearPositions(field).length === 0 &&
      this.hasCoreFirstTwoLinks(field, chainResult.clearSteps)
    chainTailScore = chainBonus + (isPerfectFoundation ? GTR_SCORING_CONFIG.MINIMAL_FOUNDATION_BONUS : 0) + leftoverBonus
    const maxTailScore = GTR_SCORING_CONFIG.CHAIN_COUNT.MAX_CHAIN * GTR_SCORING_CONFIG.CHAIN_COUNT.POINTS_PER_CHAIN +
      GTR_SCORING_CONFIG.MINIMAL_FOUNDATION_BONUS + GTR_SCORING_CONFIG.LEFTOVER_PUYOS.NO_LEFTOVER
    const { BASE_PATTERN_WEIGHT, CHAIN_TAIL_WEIGHT } = GTR_SCORING_CONFIG.SCORE_WEIGHTS
    const normalizedScore = (
      quality / GTR_SCORING_CONFIG.BASE_PATTERN.BASIC_GTR * BASE_PATTERN_WEIGHT +
      chainTailScore / maxTailScore * CHAIN_TAIL_WEIGHT
    ) / (BASE_PATTERN_WEIGHT + CHAIN_TAIL_WEIGHT)
    // Full marks describe a compact foundation, not a longer chain or an
    // arbitrary high right column. Five minimal clears consume 20 puyos;
    // the virtual firing puyo accounts for one, so the MASKED foundation has 19.
    // Outside companions/head extensions never supply a missing foundation link
    // or lower its score. Their full-board connection is assessed separately.
    const totalScore = isPerfectFoundation
      ? 100
      : Math.min(99, Math.round(Math.max(0, Math.min(1, normalizedScore)) * 100))
    
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
      scoringVersion: GTR_SCORING_CONFIG.VERSION,
      minimalFoundationComplete: isPerfectFoundation,
      isGTR,
      quality,
      chainTailScore,
      totalScore,
      chainCount,
      leftoverPuyos,
      message,
      hasBasicPattern: true,
      chainTailType,
      row10Usage,
      rightEdgeRaised,
      leftoverConnected
    }
  }

  /**
   * Physical, full-board potential for the placement advisor, including head
   * extensions. Never use this value as the foundation result-screen score.
   */
  static getFullBoardChainCount(field: (PuyoColor | null)[][]): number {
    return this.evaluateChainCount(field).chainCount
  }

  static hasBasicPattern(field: (PuyoColor | null)[][]): boolean {
    return this.checkBasePattern(field) > 0
  }

  /** An explanation of the simulated total, NEVER a +2 bonus for matching a shape.
   * Only label the core as two links when its actual source cells clear first,
   * then second. A simultaneous/damaged core must not acquire fictional links.
   */
  static getFoundationChainBreakdown(sourceField: (PuyoColor | null)[][]): { core: 2; tail: number; total: number } | null {
    const field = createGTREvaluationGrid(sourceField)
    if (field.length !== 13 || field.some(row => row.length !== 6) || !this.hasBasicPattern(field)) return null
    const result = this.evaluateChainCount(field)
    const expected = [[[0, 10], [0, 11], [1, 11]], [[1, 10], [2, 11], [0, 12], [1, 12]]]
    if (!expected.every((cells, index) => {
      const step = result.clearSteps[index]
      return step && step.clearedPuyos.every(p => p.color === field[cells[0][1]][cells[0][0]]) &&
        cells.every(([x, y]) => step.clearedPuyos.some(p => p.origin?.x === x && p.origin.y === y))
    })) return null
    return { core: 2, tail: result.chainCount - 2, total: result.chainCount }
  }

  private static hasCoreFirstTwoLinks(field: (PuyoColor | null)[][], steps: ClearStep[]): boolean {
    const expected = [
      ['0,10', '0,11', '1,11'],
      ['1,10', '2,11', '0,12', '1,12'],
    ]
    return expected.every((cells, index) => {
      const step = steps[index]
      if (!step || step.clearedPuyos.length !== 4) return false
      const sourceCells = step.clearedPuyos.filter(p => p.origin).map(p => `${p.origin!.x},${p.origin!.y}`)
      if (sourceCells.length !== cells.length || !cells.every(cell => sourceCells.includes(cell))) return false
      return step.clearedPuyos.every(p => p.color === field[index === 0 ? 10 : 12][0])
    })
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
        
        // The same core earns the same points. Occupying the fourth row
        // alone does not prove a useful head extension or a better GTR.
        return GTR_SCORING_CONFIG.BASE_PATTERN.BASIC_GTR
      }
    }
    
    return 0
  }

  // 評価範囲内のぷよを取得
  private static getPuyosInRange(field: (PuyoColor | null)[][]): { x: number; y: number; color: PuyoColor }[] {
    const puyos: { x: number; y: number; color: PuyoColor }[] = []
    for (let x = 0; x < 6; x++) {
      for (let y = 9; y <= 12; y++) {
        if (isInGTREvaluationRange(x, y) && field[y]?.[x]) {
          puyos.push({
            x,
            y: y,
            color: field[y][x] as PuyoColor
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
    allClear: boolean
    leftoverPuyos: number
    usedPuyos: Set<string>
    leftoverPositions: { x: number; y: number; color: PuyoColor }[]
    clearSteps: ClearStep[]
  } {
    const simulationField = field.map(row => [...row])
    const origins: OriginGrid = field.map((row, y) =>
      row.map((color, x) => color === null ? null : { x, y }),
    )
    const usedPuyos = new Set<string>()
    
    // (1,10)に(1,11)と同じ色を置いてシミュレート
    const triggerColor = simulationField[10] && simulationField[10][0]
    if (!triggerColor) {
      // 発火点がない場合は連鎖なし
      return {
        chainCount: 0,
        allClear: false,
        clearSteps: [],
        leftoverPuyos: this.countPuyosInRange(field),
        usedPuyos,
        leftoverPositions: this.getPuyosInRange(field)
      }
    }

    // The virtual trigger must be legally placeable. Never overwrite a puyo
    // that already exists in the source position just to make a chain fire.
    const head = inspectHeadExtension(field)
    if (simulationField[9]?.[0] && (!head || head.missing !== 1)) {
      return {
        chainCount: 0,
        allClear: false,
        clearSteps: [],
        leftoverPuyos: this.countPuyosInRange(field),
        usedPuyos,
        leftoverPositions: this.getPuyosInRange(field)
      }
    }
    
    // (1,10)にぷよを置く
    if (!simulationField[9]) simulationField[9] = [null, null, null, null, null, null]
    const trigger = head?.trigger ?? { x: 0, y: 9 }
    simulationField[trigger.y][trigger.x] = head?.color ?? triggerColor
    origins[trigger.y][trigger.x] = null // artificial trigger is not part of the source field

    const resolution = resolveChains(simulationField, { origins })
    for (const step of resolution.clearSteps) {
      for (const puyo of step.clearedPuyos) {
        if (puyo.origin) usedPuyos.add(`${puyo.origin.x},${puyo.origin.y}`)
      }
    }

    // 落下後の座標と元盤面の座標は一致しないため、連鎖後に実際に
    // 残った盤面からあまりぷよを求める。未発火時だけ元盤面を使う。
    const leftoverPositions = this.getPuyosInRange(
      resolution.chainCount > 0 ? resolution.stableGrid : field,
    )
    
    return {
      chainCount: resolution.chainCount,
      allClear: resolution.allClear,
      clearSteps: resolution.clearSteps,
      leftoverPuyos: leftoverPositions.length,
      usedPuyos,
      leftoverPositions
    }
  }
  
  // 余りなし > 1個 = 全部同色で完全連結。評価範囲内の消去後だけを使う。
  private static evaluateLeftoverPuyos(
    _field: (PuyoColor | null)[][],
    leftoverPositions: { x: number; y: number; color: PuyoColor }[]
  ): number {
    return evaluateLeftovers(leftoverPositions).score
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
    
    // This measures usage count only, not the location or shape of a step.
    if (usedCount <= 1) return 'minimal'
    if (usedCount <= 3) return 'moderate'
    return 'heavy'
  }

  private static hasRaisedRightEdge(field: (PuyoColor | null)[][], usedPuyos: Set<string>): boolean {
    // The reference foundation has a supported fourth-row cell at column 6,
    // above the lower columns 3-5. Count only the evaluation grid, and require
    // that raised cell to participate instead of rewarding an unused ornament.
    return [9, 10, 11, 12].every(y => field[y]?.[5] != null) &&
      [2, 3, 4].every(x => field[9]?.[x] === null) &&
      usedPuyos.has('5,9')
  }
  
  // あまりぷよが連結しているかチェック
  private static checkLeftoverConnected(leftoverPositions: { x: number; y: number; color: PuyoColor }[]): boolean {
    return evaluateLeftovers(leftoverPositions).connected
  }
  
  // GTRガイド表示用の座標を取得（標準コア：11AB, 12AAB, 13BB）
  static getGTRGuidePositions(): { x: number; y: number }[] {
    // 1-3列目のGTR配置位置を返す（0-indexedで0-2列目）
    return [
      { x: 0, y: 12 }, { x: 1, y: 12 }, // 13行目：BB
      { x: 0, y: 11 }, { x: 1, y: 11 }, { x: 2, y: 11 }, // 12行目：AAB
      { x: 0, y: 10 }, { x: 1, y: 10 }, // 11行目：AB
    ]
  }
}
