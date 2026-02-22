// GTR評価システムの点数設定
// このファイルで点数をチューニングできます

export const GTR_SCORING_CONFIG = {
  // GTR基本形の評価
  BASE_PATTERN: {
    // 必須折り返し部分の基本点
    BASIC_GTR: 100,
    // 拡張GTR（10行目まで使用）のボーナス
    EXTENDED_GTR: 120,
  },

  // 連鎖数による評価（1連鎖あたりの点数）
  CHAIN_COUNT: {
    POINTS_PER_CHAIN: 10,
    MAX_CHAIN: 5, // 最大評価連鎖数
  },

  // 10行目の使用状況評価
  ROW_10_USAGE: {
    // (6,10)だけが使われている（最高評価）
    ONLY_COL6: 15,
    // (6,10)と(5,10)だけが使われている（高評価）
    COL5_AND_6: 10,
    // その他、右側にある場合
    RIGHT_SIDE: 5,
    // それ以外
    DEFAULT: 0,
  },

  // あまりぷよの評価
  LEFTOVER_PUYOS: {
    // あまりぷよなし（最高評価）
    NO_LEFTOVER: 20,
    
    // 複数色のあまりぷよ
    MULTIPLE_COLORS: 0,
    
    // 単一色で完全連結の場合
    SINGLE_COLOR_CONNECTED: {
      SIZE_3: 18,          // 3つが完全連結（最大）
      SIZE_2: 15,          // 2つが完全連結
    },
    
    // 単一色だが複数グループに分離
    SINGLE_COLOR_SEPARATED: 5,
  },

  // 連鎖尾の形状タイプ別スコア倍率
  // 評価順: Y字形 > 座布団形(横3) > L字形 > 階段形
  // 根拠: ぷよぷよキャンプ 403パターン調査
  //   - Y字形はバリエーション数が最多で柔軟性が高い（初心者に最も推奨）
  //   - 横3形(座布団)はY字に次いでバリエーション豊富
  //   - L字形はバランスは良いがバリエーション少なめ
  //   - 階段形は連鎖数は伸ばしやすいが難易度が高い
  CHAIN_TAIL_TYPE: {
    Y: 1.5,        // Y字形（最も理想的）⭐⭐⭐⭐
    ZABUTON: 1.3,  // 座布団形/横3形（推奨）⭐⭐⭐
    L: 1.2,        // L字形（良い）⭐⭐
    STAIRS: 1.0,   // 階段形（普通）⭐
    DEFAULT: 1.0,  // 判定できない場合
  },

  // 総合スコア計算の重み
  SCORE_WEIGHTS: {
    BASE_PATTERN_WEIGHT: 0.5,   // 基本形の重み
    CHAIN_TAIL_WEIGHT: 0.5,     // 連鎖尾の重み
  },

  // 評価メッセージのしきい値
  MESSAGE_THRESHOLDS: {
    CHAIN_5_OR_MORE: 5,
    CHAIN_4: 4,
    CHAIN_3: 3,
  },
  
  // 評価メッセージ
  MESSAGES: {
    CHAIN_5_OR_MORE: '素晴らしい！{chain}連鎖のGTR！',
    CHAIN_4: '良いGTR！{chain}連鎖達成',
    CHAIN_3: 'GTR完成！{chain}連鎖',
    DEFAULT: 'GTR形状確認。連鎖数: {chain}',
    NOT_GTR: 'GTRの必須折り返しがありません',
  }
}

// 型定義
export type GTRScoringConfigType = typeof GTR_SCORING_CONFIG