import { PuyoPair, PuyoColor, Field } from './types'
import { GTRDetector } from './GTRPatterns'
import { GTRGuidePatterns } from './GTRGuidePatterns'

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
}

export class GuideManager {
  private currentState: GuideState = GuideState.INITIAL_TWO_HANDS
  private initialPairs?: { pair1: PuyoPair; pair2: PuyoPair }
  
  initialize(pair1: PuyoPair, pair2: PuyoPair) {
    this.initialPairs = { pair1, pair2 }
    this.currentState = GuideState.INITIAL_TWO_HANDS
  }
  
  reset() {
    this.currentState = GuideState.INITIAL_TWO_HANDS
  }
  
  updateState(field: Field) {
    // フィールドの状態を分析して適切なガイド状態に遷移
    const gtrResult = GTRDetector.detectGTR(field.grid)
    
    if (this.currentState === GuideState.INITIAL_TWO_HANDS) {
      // 最初の2手が置かれたかチェック
      const puyoCount = this.countPuyos(field)
      if (puyoCount >= 4) {
        this.currentState = GuideState.BASIC_PATTERN
      }
    } else if (this.currentState === GuideState.BASIC_PATTERN) {
      // 基本形ができたかチェック
      if (gtrResult.hasBasicPattern) {
        this.currentState = GuideState.CHAIN_TAIL
      }
    } else if (this.currentState === GuideState.CHAIN_TAIL) {
      // 高さだけの骨格名ではなく、標準発火点から3連鎖することを完成条件にする。
      if (gtrResult.chainCount >= 3) {
        this.currentState = GuideState.COMPLETE_GTR
      }
    }
  }
  
  getGuideContent(): GuideContent {
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
    if (!this.initialPairs) {
      return { comment: '最初の2手を置こう!' }
    }
    
    // 2手の組み合わせパターンを判定
    const colors = this.analyzeInitialPairs()
    const pattern = this.determinePattern(colors)
    
    let guidePattern: string[][] = []
    
    switch (pattern) {
      case 'AAAB':
        guidePattern = [
          ['_', '_', 'A', '_'],
          ['A', 'A', 'B', '_']
        ]
        break
      case 'AABB':
      case 'ABAB':
        guidePattern = [
          ['B', 'B', '_', '_'],
          ['A', 'A', '_', '_']
        ]
        break
      case 'AABC':
        guidePattern = [
          ['_', '_', '_', '_'],
          ['A', 'A', 'B', 'C']
        ]
        break
      case 'ABAC':
        guidePattern = [
          ['B', '_', '_', '_'],
          ['A', 'A', 'C', '_']
        ]
        break
      default:
        guidePattern = [
          ['_', '_', 'A', '_'],
          ['A', 'A', 'B', '_']
        ]
    }
    
    return {
      comment: '最初の2手を置こう!',
      pattern: guidePattern,
      description: 'GTRの土台となる最初の配置です'
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
    return {
      comment: 'まずはY字形の連鎖尾を作ろう!',
      pattern: GTRGuidePatterns.getYPattern(),
      description: '右側は縦の同色を意識。ゴーストの位置を優先してください。'
    }
  }
  
  private getCompleteGTRGuide(): GuideContent {
    return {
      comment: '3連鎖のGTRが完成!',
      description: 'ここから土台と連鎖尾を伸ばして、5連鎖・7連鎖を目指しましょう。'
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
  
  private analyzeInitialPairs(): PuyoColor[] {
    if (!this.initialPairs) return []
    
    const { pair1, pair2 } = this.initialPairs
    return [
      pair1.main.color,
      pair1.sub.color,
      pair2.main.color,
      pair2.sub.color
    ]
  }
  
  private determinePattern(colors: PuyoColor[]): string {
    if (colors.length !== 4) return 'UNKNOWN'
    
    const colorCounts: { [key: string]: number } = {}
    colors.forEach(c => {
      colorCounts[c] = (colorCounts[c] || 0) + 1
    })
    
    const counts = Object.values(colorCounts).sort((a, b) => b - a)
    
    if (counts.length === 2) {
      if (counts[0] === 3) return 'AAAB'
      return 'AABB' // or ABAB
    }
    if (counts.length === 3) {
      if (counts[0] === 2) {
        // Check if it's ABAC or AABC based on positions
        if (colors[0] === colors[1]) return 'AABC'
        if (colors[0] === colors[2]) return 'ABAC'
        return 'ABAC'
      }
    }
    
    return 'UNKNOWN'
  }
  
}
