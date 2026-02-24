// 配置推薦スコアリング定数（チューニング用に分離）

export const ADVISOR_WEIGHTS = {
  fold_building: {
    foldProgress: 4.0,
    chainTail: 0.3,       // off-color手駒を連鎖尾エリアに誘導（fold優先のため抑制）
    connectivity: 1.0,    // 同色連結の価値を高めて有意義な配置を促進
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
    PRIORITY_1_MATCH: 30,      // 最下段（h-1）正解 ※NON_TARGET(-25)と組でも正になる強さ
    PRIORITY_2_MATCH: 30,      // 中段（h-2）正解 ※(2,11)完成をNON_TARGET経由でも推奨
    PRIORITY_3_MATCH: 30,      // 上段（h-3）正解 ※TOO_HIGH(-20)を克服して連鎖尾に勝つ強さ
    PREREQUISITE_PENALTY: 0.3, // 前提未充足時のボーナス倍率（P1→P2→P3の構築順を強制）
    WRONG_COLOR_PENALTY: -50,  // 目標位置に間違った色（P2_MATCH+25を完全に打ち消す強さ）
    OUTSIDE_FOLD_PENALTY: 0,   // 折り返しエリア外（ペナルティなし: 連鎖尾を積極的に活用）
    NON_TARGET_FOLD_PENALTY: -7,  // 折り返しエリア内だがテンプレート外（コンパニオン配置を許容しつつ暴発防止はGROUP_SIZE_3_FOLDに委任）
    STEPPING_STONE_BONUS: 15,  // (2,12)踏み台ボーナス: P1完了後にのみ適用し(2,11)到達を強力促進
    TOO_HIGH_ON_FOLD_SIDE: -20,// col0-2でh-4以上
    P3_COMPANION_TOO_HIGH: -3, // P3テンプレート直上(h-4)のコンパニオンは軽減（P3縦置きを促進）
    CHAIN_TAIL_CONNECTION: 0,  // (2,h-3)連鎖尾接続点: P2(2,h-2)完了後はペナルティなし
  },
  CHAIN_TAIL: {
    CORRECT_COLUMN_BONUS: 10,
    TOO_HIGH_PENALTY: -10,
    HORIZONTAL_ADJACENCY_BONUS: 8,   // 連鎖尾エリア内の横方向同色隣接
    BOTTOM_ROW_BONUS: 5,             // 最下段(h-1)配置ボーナス
    SECOND_ROW_BONUS: 3,             // 2段目(h-2)配置ボーナス
    LAYER_BONUS: 5,                  // 列に2色以上のレイヤーがあるボーナス
    BALANCED_HEIGHT_BONUS: 5,        // col3-5の高さ差≤1
  },
  CONNECTIVITY: {
    GROUP_SIZE_2: 10,
    GROUP_SIZE_3: 20,       // 折り返しテンプレートマッチを優先するため抑制
    GROUP_SIZE_3_FOLD: -100,   // 折り返しエリア内3連結ペナルティ（暴発リスク: row12にBBB→(2,11)でBBBB暴発）
    GROUP_SIZE_3_VERTICAL: -10, // 縦3積みペナルティ（理想形が作れなくなる）
    GROUP_SIZE_4_PLUS: -500,    // 暴発ペナルティ（fold matchボーナスを完全に打ち消す強さ）
  },
  HEIGHT: {
    CRITICAL_ZONE: -30,
    WARNING_ZONE: -15,
  },
  CHAIN_SIM: {
    HAS_PATTERN_BONUS: 10,
    PER_CHAIN_BONUS: 15,       // 連鎖1つの価値を強化
  },
  LOOKAHEAD: {
    ENABLED: true,
    DISCOUNT: 0.4,             // nextPairスコアをcurrentの40%の重みで加算
  },
} as const
