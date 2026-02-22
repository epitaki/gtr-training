// GTRの完成形パターンのサンプル集
export class GTRGuidePatterns {
  // Y字形の骨格
  static getYPattern(): string[][] {
    return [
      ['A', 'B', 'C', '_', '_'],
      ['A', 'A', 'B', 'C', 'C'],
      ['B', 'B', 'C', '_', '_']
    ]
  }
  
  // L字形の骨格
  static getLPattern(): string[][] {
    return [
      ['A', 'B', 'C', '_', '_'],
      ['A', 'A', 'B', 'C', '_'],
      ['B', 'B', 'C', 'C', '_']
    ]
  }
  
  // 階段形の骨格
  static getStairsPattern(): string[][] {
    return [
      ['_', '_', 'C', '_', '_'],
      ['A', 'B', 'C', '_', '_'],
      ['A', 'A', 'B', 'C', '_'],
      ['B', 'B', 'D', 'C', '_']
    ]
  }
  
  // 座布団形の骨格
  static getZabutonPattern(): string[][] {
    return [
      ['A', 'B', 'C', '_', '_', '_'],
      ['A', 'A', 'B', 'C', 'C', 'C'],
      ['B', 'B', '_', '_', '_', '_']
    ]
  }
  
  // Y字形の完成形サンプル（複数バリエーション）
  static getCompleteYPatterns(): string[][][] {
    return [
      // Y字形完成形1
      [
        ['_', '_', '_', '_', '_', 'D'],
        ['A', 'B', 'C', 'A', 'A', 'D'],
        ['A', 'A', 'B', 'C', 'C', 'A'],
        ['B', 'B', 'C', 'D', 'D', 'A']
      ],
      // Y字形完成形2
      [
        ['_', '_', '_', '_', 'A', '_'],
        ['A', 'B', 'C', 'A', 'D', 'A'],
        ['A', 'A', 'B', 'C', 'C', 'D'],
        ['B', 'B', 'C', 'D', 'D', 'A']
      ],
      // Y字形完成形3
      [
        ['_', '_', '_', '_', 'A', 'D'],
        ['A', 'B', 'C', '_', 'A', 'D'],
        ['A', 'A', 'B', 'C', 'C', 'A'],
        ['B', 'B', 'C', 'D', 'D', 'A']
      ]
    ]
  }
  
  // Y字形の完成形サンプル（単一、後方互換性のため）
  static getCompleteYPattern(): string[][] {
    return this.getCompleteYPatterns()[0]
  }
  
  // 座布団形の完成形サンプル（複数バリエーション）
  static getCompleteZabutonPatterns(): string[][][] {
    return [
      // 座布団形完成形1
      [
        ['_', '_', '_', '_', 'B', 'B'],
        ['A', 'B', 'C', 'B', 'A', 'B'],
        ['A', 'A', 'B', 'C', 'C', 'C'],
        ['B', 'B', 'D', 'A', 'A', 'A']
      ],
      // 座布団形完成形2
      [
        ['_', '_', '_', '_', 'B', 'B'],
        ['A', 'B', 'C', 'B', 'A', 'A'],
        ['A', 'A', 'B', 'C', 'C', 'C'],
        ['B', 'B', 'D', 'A', 'A', 'B']
      ]
    ]
  }
  
  // L字形の完成形サンプル（複数バリエーション）
  static getCompleteLPatterns(): string[][][] {
    return [
      // L字形完成形1
      [
        ['_', '_', '_', '_', '_', 'A'],
        ['A', 'B', 'C', 'D', 'A', 'A'],
        ['A', 'A', 'B', 'C', 'D', 'D'],
        ['B', 'B', 'C', 'C', 'D', 'A']
      ],
      // L字形完成形2
      [
        ['_', '_', '_', 'A', '_', '_'],
        ['A', 'B', 'C', 'D', 'A', 'A'],
        ['A', 'A', 'B', 'C', 'D', 'A'],
        ['B', 'B', 'C', 'C', 'D', 'D']
      ]
    ]
  }
  
  // L字形の完成形サンプル（単一、後方互換性のため）
  static getCompleteLPattern(): string[][] {
    return this.getCompleteLPatterns()[0]
  }
  
  // 階段形の完成形サンプル（複数バリエーション）
  static getCompleteStairsPatterns(): string[][][] {
    return [
      // 階段形完成形1
      [
        ['_', '_', 'C', 'D', 'A', 'B'],
        ['A', 'B', 'C', 'D', 'A', 'B'],
        ['A', 'A', 'B', 'C', 'D', 'A'],
        ['B', 'B', 'C', 'D', 'A', 'B']
      ]
    ]
  }
  
  // 階段形の完成形サンプル（単一、後方互換性のため）
  static getCompleteStairsPattern(): string[][] {
    return this.getCompleteStairsPatterns()[0]
  }
  
  // パターン名から完成形を取得（単一）
  static getCompletePattern(type: 'Y' | 'L' | 'stairs' | 'zabuton'): string[][] {
    switch (type) {
      case 'Y':
        return this.getCompleteYPattern()
      case 'L':
        return this.getCompleteLPattern()
      case 'stairs':
        return this.getCompleteStairsPattern()
      case 'zabuton':
        return this.getCompleteZabutonPatterns()[0]
      default:
        return this.getCompleteYPattern()
    }
  }
  
  // パターン名から完成形を取得（複数バリエーション）
  static getCompletePatterns(type: 'Y' | 'L' | 'stairs' | 'zabuton'): string[][][] {
    switch (type) {
      case 'Y':
        return this.getCompleteYPatterns()
      case 'L':
        return this.getCompleteLPatterns()
      case 'stairs':
        return this.getCompleteStairsPatterns()
      case 'zabuton':
        return this.getCompleteZabutonPatterns()
      default:
        return this.getCompleteYPatterns()
    }
  }
}