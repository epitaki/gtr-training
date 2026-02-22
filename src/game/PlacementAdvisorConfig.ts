// 配置推薦スコアリング定数（チューニング用に分離）

export const ADVISOR_WEIGHTS = {
  fold_building: {
    foldProgress: 4.0,
    chainTail: 0.0,
    connectivity: 0.5,
    heightPenalty: 1.5,
    chainSim: 0.0,
  },
  chain_tail: {
    foldProgress: 0.5,
    chainTail: 1.0,
    connectivity: 1.0,
    heightPenalty: 1.0,
    chainSim: 5.0,
  },
  completion: {
    foldProgress: 0.2,
    chainTail: 1.0,
    connectivity: 1.0,
    heightPenalty: 1.0,
    chainSim: 5.0,
  },
} as const

export const ADVISOR_SCORING = {
  FOLD: {
    // テンプレートマッチボーナス（優先度別）
    PRIORITY_1_MATCH: 20,      // 最下段（h-1）正解
    PRIORITY_2_MATCH: 18,      // 中段（h-2）正解
    PRIORITY_3_MATCH: 15,      // 上段（h-3）正解
    PREREQUISITE_PENALTY: 0.5, // 前提未充足時のボーナス倍率
    WRONG_COLOR_PENALTY: -25,  // 目標位置に間違った色
    OUTSIDE_FOLD_PENALTY: -5,  // 折り返しエリア外（1ぷよあたり）
    TOO_HIGH_ON_FOLD_SIDE: -20,// col0-2でh-4以上
  },
  CHAIN_TAIL: {
    CORRECT_COLUMN_BONUS: 10,
    TOO_HIGH_PENALTY: -10,
  },
  CONNECTIVITY: {
    GROUP_SIZE_2: 10,
    GROUP_SIZE_3: 25,
    GROUP_SIZE_4_PLUS: -20,    // 暴発ペナルティ（4つ繋がると即消え）
  },
  HEIGHT: {
    CRITICAL_ZONE: -30,
    WARNING_ZONE: -15,
  },
  CHAIN_SIM: {
    HAS_PATTERN_BONUS: 10,
    PER_CHAIN_BONUS: 15,       // 連鎖1つの価値を強化
  },
} as const
