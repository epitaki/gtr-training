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
  private chainTailType?: 'Y' | 'L' | 'stairs' | 'zabuton'
  private detectedSkeleton?: 'Y' | 'L' | 'stairs' | 'zabuton'
  private selectedCompleteForm?: string[][]
  
  initialize(pair1: PuyoPair, pair2: PuyoPair) {
    this.initialPairs = { pair1, pair2 }
    this.currentState = GuideState.INITIAL_TWO_HANDS
  }
  
  reset() {
    this.currentState = GuideState.INITIAL_TWO_HANDS
    this.chainTailType = undefined
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
      // 連鎖尾の骨格ができたかチェック
      const skeleton = this.detectSkeleton(field)
      if (skeleton) {
        this.detectedSkeleton = skeleton
        this.chainTailType = skeleton
        // 骨格に対応する完成形をランダムに選択
        const patterns = GTRGuidePatterns.getCompletePatterns(skeleton)
        this.selectedCompleteForm = patterns[Math.floor(Math.random() * patterns.length)]
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
    // おすすめ度に基づいて骨格を提示
    // Y字形 > 座布団形 > L字形 > 階段形
    const recommendedSkeletons = [
      { type: 'Y' as const, pattern: GTRGuidePatterns.getYPattern(), name: 'Y字形', stars: '★★★★' },
      { type: 'zabuton' as const, pattern: GTRGuidePatterns.getZabutonPattern(), name: '座布団形', stars: '★★★' },
      { type: 'L' as const, pattern: GTRGuidePatterns.getLPattern(), name: 'L字形', stars: '★★' },
      { type: 'stairs' as const, pattern: GTRGuidePatterns.getStairsPattern(), name: '階段形', stars: '★' }
    ]
    
    // すべてのパターンを結合して表示用パターンを作成
    // 各パターンを縦に並べる
    const allPatterns: string[][] = []
    const patternDescriptions: string[] = []
    
    for (const skeleton of recommendedSkeletons) {
      // パターン名とおすすめ度を追加
      patternDescriptions.push(`${skeleton.name} ${skeleton.stars}`)
      
      // パターンを追加
      if (allPatterns.length > 0) {
        // パターン間に空行を追加（6列に統一）
        allPatterns.push(['_', '_', '_', '_', '_', '_'])
      }
      
      // すべてのパターンを6列に統一
      const normalizedPattern = skeleton.pattern.map(row => {
        if (row.length < 6) {
          // 5列の場合は右側に空セルを追加
          return [...row, '_']
        }
        return row
      })
      
      allPatterns.push(...normalizedPattern)
    }
    
    return {
      comment: '連鎖尾の形を作ろう!（おすすめ順）',
      pattern: allPatterns,
      description: patternDescriptions.join(' / ')
    }
  }
  
  private getCompleteGTRGuide(): GuideContent {
    if (!this.detectedSkeleton || !this.selectedCompleteForm) {
      return { comment: 'GTRを完成させよう!' }
    }
    
    const skeletonNames = {
      'Y': 'Y字形',
      'L': 'L字形',
      'stairs': '階段形',
      'zabuton': '座布団形'
    }
    
    return {
      comment: `${skeletonNames[this.detectedSkeleton]}のGTRを完成させよう!`,
      pattern: this.selectedCompleteForm,
      description: '連鎖が繋がるように配置しましょう'
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
  
  private detectSkeleton(field: Field): 'Y' | 'L' | 'stairs' | 'zabuton' | null {
    // フィールドから骨格パターンを検出
    // 3-5列目、9-12行目を中心に確認
    
    // Y字形の検出
    if (this.checkYSkeleton(field)) return 'Y'
    
    // 座布団形の検出
    if (this.checkZabutonSkeleton(field)) return 'zabuton'
    
    // L字形の検出
    if (this.checkLSkeleton(field)) return 'L'
    
    // 階段形の検出
    if (this.checkStairsSkeleton(field)) return 'stairs'
    
    return null
  }
  
  private checkYSkeleton(field: Field): boolean {
    // Y字形の特徴: 4列目に縦積み、5列目にも縦積み
    const grid = field.grid
    
    // 4列目に2つ以上の同色が縦に並んでいるか
    for (let y = 10; y < 12; y++) {
      if (grid[y] && grid[y][3] && grid[y+1] && grid[y][3] === grid[y+1][3]) {
        // 5列目にも縦積みがあるか確認
        for (let y2 = 10; y2 < 12; y2++) {
          if (grid[y2] && grid[y2][4] && grid[y2+1] && grid[y2][4] === grid[y2+1][4]) {
            return true
          }
        }
      }
    }
    return false
  }
  
  private checkZabutonSkeleton(field: Field): boolean {
    // 座布団形の特徴: 4-6列目に横に広がる
    const grid = field.grid
    
    // 12行目に4-6列目に同色が3つ並んでいるか
    if (grid[11] && grid[11][3] && grid[11][4] && grid[11][5]) {
      if (grid[11][3] === grid[11][4] && grid[11][4] === grid[11][5]) {
        return true
      }
    }
    return false
  }
  
  private checkLSkeleton(field: Field): boolean {
    // L字形の特徴: 4-5列目にL字型の配置
    const grid = field.grid
    
    // 4列目に縦と5列目にも縦でL字形状
    if (grid[11] && grid[11][3] && grid[11][4] && 
        grid[10] && grid[10][3] === grid[11][3]) {
      return true
    }
    return false
  }
  
  private checkStairsSkeleton(field: Field): boolean {
    // 階段形の特徴: 階段状に配置
    const grid = field.grid
    
    // 3列目から4、5と階段状に高くなる
    let height3 = 0, height4 = 0, height5 = 0
    
    for (let y = 12; y >= 8; y--) {
      if (grid[y] && grid[y][2]) height3++
      if (grid[y] && grid[y][3]) height4++
      if (grid[y] && grid[y][4]) height5++
    }
    
    // 階段状に高くなっているか
    if (height3 < height4 && height4 < height5) {
      return true
    }
    
    return false
  }
}