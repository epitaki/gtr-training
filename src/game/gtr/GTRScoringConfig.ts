// GTR評価システムの点数設定
// このファイルで点数をチューニングできます

export const GTR_SCORING_CONFIG = {
  VERSION: 'masked-foundation-minimal-v2',
  // GTR基本形の評価
  BASE_PATTERN: {
    // 必須折り返し部分の基本点
    BASIC_GTR: 100,
    // 旧設定名との互換用。上に置いたことだけによる拡張ボーナスは付けない。
    EXTENDED_GTR: 100,
  },

  // 連鎖数による評価（1連鎖あたりの点数）
  CHAIN_COUNT: {
    POINTS_PER_CHAIN: 10,
    MAX_CHAIN: 5, // 最大評価連鎖数
  },

  MINIMAL_FOUNDATION_BONUS: 15,

  // あまりぷよの評価
  LEFTOVER_PUYOS: {
    // あまりぷよなし（最高評価）
    NO_LEFTOVER: 20,
    
    // 複数色のあまりぷよ
    MULTIPLE_COLORS: 0,
    
    // 余り1個と、すべて同色で完全連結した余りを同点にする。
    SINGLE_OR_CONNECTED: 18,
    
    // 単一色だが複数グループに分離
    SINGLE_COLOR_SEPARATED: 5,
  },

  // 後方互換用の旧・連鎖尾形状倍率（現行評価では参照しない）
  // 403形の調査は制約下のバリエーション数であり、対戦強度の順位ではない。
  // 条件を変えた続編では最多の形も変わるため、型名だけの倍率へ一般化しない。
  CHAIN_TAIL_TYPE: {
    Y: 1.5,
    ZABUTON: 1.3,
    L: 1.2,
    STAIRS: 1.0,
    DEFAULT: 1.0,  // 判定できない場合
  },

  // 各項目を満点で正規化してから使う重み（総合は0〜100点）
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
