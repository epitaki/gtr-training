import { PuyoPair, PuyoColor, Field } from '../core/types'
import { GTRDetector } from '../gtr/GTRPatterns'
import { GTRGuidePatterns } from './GTRGuidePatterns'
import type { TailShape } from '../advisor/TailPlanner'
import { analyzeOpening, type OpeningAnalysis } from '../advisor/OpeningAnalysis'
import type { GTRTrainingPlan } from '../advisor/types'

export enum GuideState {
  INITIAL_TWO_HANDS = 'initial_two_hands',
  BASIC_PATTERN = 'basic_pattern',
  CHAIN_TAIL = 'chain_tail',
  COMPLETE_GTR = 'complete_gtr'
}

export interface GuideContent {
  comment: string
  pattern?: string[][]
  description?: string
  colorMap?: Record<string, PuyoColor>
}

export class GuideManager {
  private currentState: GuideState = GuideState.INITIAL_TWO_HANDS
  private opening?: OpeningAnalysis
  private trainingPlan?: GTRTrainingPlan
  private suggestedTailShape: TailShape | undefined = 'Y'
  private suggestedTailColor?: PuyoColor
  private supportColors: (PuyoColor | null)[] = []
  
  initialize(pair1: PuyoPair, pair2: PuyoPair, savedPlan?: GTRTrainingPlan) {
    this.opening = analyzeOpening(pair1, pair2)
    this.trainingPlan = { ...(savedPlan ?? this.opening.trainingPlan) }
    this.currentState = GuideState.INITIAL_TWO_HANDS
  }
  
  reset() {
    this.currentState = GuideState.INITIAL_TWO_HANDS
    this.suggestedTailShape = 'Y'
    this.suggestedTailColor = undefined
    this.supportColors = []
  }

  setSuggestedTailPlan(shape?: TailShape, color?: PuyoColor, field?: Pick<Field, 'grid'>) {
    this.suggestedTailShape = shape
    this.suggestedTailColor = shape ? color : undefined
    this.supportColors = shape && field ? [...(field.grid[field.grid.length - 1] ?? [])] : []
  }
  
  updateState(field: Field, guidedTargetComplete: boolean) {
    // フィールドの状態を分析して適切なガイド状態に遷移
    const gtrResult = GTRDetector.detectGTR(field.grid)

    // 盤面から毎回再判定し、巻き戻し時にも正しい状態へ戻す。
    if (this.countPuyos(field) < 4) {
      this.currentState = GuideState.INITIAL_TWO_HANDS
    } else if (!gtrResult.hasBasicPattern) {
      this.currentState = GuideState.BASIC_PATTERN
    } else if (!gtrResult.isGTR || !guidedTargetComplete) {
      this.currentState = GuideState.CHAIN_TAIL
    } else {
      this.currentState = GuideState.COMPLETE_GTR
    }
  }
  
  getGuideContent(): GuideContent {
    const content = this.getStateContent()
    return this.trainingPlan ? { ...content, colorMap: {
      A: this.trainingPlan.colorA, B: this.trainingPlan.colorB, ...content.colorMap,
    } } : content
  }

  private getStateContent(): GuideContent {
    switch (this.currentState) {
      case GuideState.INITIAL_TWO_HANDS:
        return this.getInitialTwoHandsGuide()
      case GuideState.BASIC_PATTERN:
        return this.getBasicPatternGuide()
      case GuideState.CHAIN_TAIL:
        return this.getChainTailGuide()
      case GuideState.COMPLETE_GTR:
        return this.getCompleteGTRGuide()
      default:
        return { comment: '' }
    }
  }
  
  private getInitialTwoHandsGuide(): GuideContent {
    if (!this.opening) {
      return { comment: '最初の2手を置こう!' }
    }
    if (this.opening.awaitingSecondColor) return {
      comment: '同じ色が4個です。別の色を待とう!',
      description: '4個をつなげると消えます。折り返しの別色はまだ未供給です。完成見本の配色は仮の教材例です。',
    }
    return {
      comment: '最初の2手を置こう!',
      pattern: [['A', 'B', '_', '_'], ['A', 'A', 'B', '_'], ['B', 'B', '_', '_']],
      description: '最初の2手の色から折り返しを考えます。まだ基本形の完成ではありません。',
    }
  }
  
  private getBasicPatternGuide(): GuideContent {
    return {
      comment: '基本形を作ろう!',
      pattern: [
        ['A', 'B', '_', '_'],
        ['A', 'A', 'B', '_'],
        ['B', 'B', '_', '_']
      ],
      description: '2-3列目に折り返しを作ります'
    }
  }
  
  private getChainTailGuide(): GuideContent {
    if (!this.suggestedTailShape) {
      return {
        comment: '連鎖尾を伸ばそう!',
        description: '折り返しからの消去順を確認して、つながる配置を探します。',
      }
    }
    const guides: Record<TailShape, GuideContent> = {
      Y: {
        comment: 'Y字形の連鎖尾を作ろう!',
        pattern: GTRGuidePatterns.getYPattern(),
        description: '同色を落下後につなぎ、下の支持ぷよも次の伸ばしに使います。',
      },
      zabuton: {
        comment: '座布団形の連鎖尾を作ろう!',
        pattern: GTRGuidePatterns.getZabutonPattern(),
        description: '横方向の同色を支持ぷよの上に広げ、落下後につなぎます。',
      },
      L: {
        comment: 'L字形の連鎖尾を作ろう!',
        pattern: GTRGuidePatterns.getLPattern(),
        description: 'L字の同色グループを作り、折り返しの消去後につなぎます。',
      },
    }
    const guide = guides[this.suggestedTailShape]
    const pattern = guide.pattern!.map(row => [...row])
    const colorMap: Record<string, PuyoColor> = this.suggestedTailColor ? { C: this.suggestedTailColor } : {}
    const supportColumns = this.suggestedTailShape === 'Y' ? [3, 4]
      : this.suggestedTailShape === 'zabuton' ? [2, 3, 4, 5] : []
    for (const column of supportColumns) {
      const color = this.supportColors[column]
      const symbol = color ? `S${column}` : '?'
      pattern[pattern.length - 1][column] = symbol
      if (color) colorMap[symbol] = color
    }
    return {
      ...guide,
      pattern,
      description: guide.description + (supportColumns.some(column => !this.supportColors[column])
        ? ' 今回の案内の支持色は未確定です。完成見本の配色は教材例です。' : ''),
      colorMap: Object.keys(colorMap).length ? colorMap : undefined,
    }
  }
  
  private getCompleteGTRGuide(): GuideContent {
    return {
      comment: 'GTRの基本形と連鎖尾ができました!',
      description: '土台の5連鎖は評価で確認しましょう。下3段を中心に組み、4段目の使用は必要最小限にして、上への伸ばしに備えましょう。'
    }
  }
  
  private countPuyos(field: Field): number {
    let count = 0
    for (let y = 0; y < field.height; y++) {
      for (let x = 0; x < field.width; x++) {
        if (field.grid[y][x]) count++
      }
    }
    return count
  }
  
}
