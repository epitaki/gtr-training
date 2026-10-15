import { UI_FONT_FAMILY, UI_COLORS } from '../../ui/theme'

// ゲーム画面の共有ビジュアル設定

export const PUYO_COLORS = {
  red:    { main: 0xf05262, light: 0xff9aa5, dark: 0xb92d43, eye: 0xffffff, pupil: 0x242033 },
  green:  { main: 0x3ecf8e, light: 0x91ecc2, dark: 0x16815a, eye: 0xffffff, pupil: 0x242033 },
  blue:   { main: 0x5687f5, light: 0xa4c0ff, dark: 0x3154b5, eye: 0xffffff, pupil: 0x242033 },
  yellow: { main: 0xf3c94f, light: 0xffe99b, dark: 0xa98218, eye: 0xffffff, pupil: 0x242033 },
} as const

export const FIELD_CONFIG = {
  COLS: 6,
  ROWS: 13,
  CELL_SIZE: 48,
  CELL_GAP: 1,
  GRID_LINE_COLOR: 0x363149,
  GRID_LINE_ALPHA: 0.38,
  GRID_LINE_WIDTH: 1,
  FIELD_BG_COLOR: 0x0c0a14,
  FIELD_BORDER_COLOR: 0x4d4568,
  FIELD_BORDER_WIDTH: 4,
} as const

export const LAYOUT_SCORE_ATTACK = {
  CANVAS_WIDTH: 640,
  CANVAS_HEIGHT: 800,
  FIELD_X: 48,
  FIELD_Y: 100,
  BG_COLOR: 0x171426,
} as const

export const LAYOUT_GUIDED = {
  CANVAS_WIDTH: 900,
  CANVAS_HEIGHT: 800,
  FIELD_X: 48,
  FIELD_Y: 100,
  GUIDE_X: 690,
  GUIDE_Y: 100,
  GUIDE_WIDTH: 380,
  BG_COLOR: 0x171426,
} as const

export const NEXT_AREA_CONFIG = {
  CELL_SIZE: FIELD_CONFIG.CELL_SIZE,
  LABEL_HEIGHT: 24,
  STEP_OFFSET: 32,
  STATUS_GAP: 16,
  AREA_WIDTH: 120,
  AREA_PADDING: 12,
  BG_COLOR: 0x211d33,
  BORDER_COLOR: FIELD_CONFIG.FIELD_BORDER_COLOR,
} as const

export const ANIMATION_CONFIG = {
  LANDING_BOUNCE_DURATION: 200,
  LANDING_BOUNCE_SCALE_Y: 0.85,
  CHAIN_POP_DURATION: 300,
  CHAIN_POP_SCALE: 1.4,
  CHAIN_FLASH_DURATION: 150,
  SCORE_FLOAT_DURATION: 800,
  SCORE_FLOAT_DISTANCE: -60,
  GTR_CELEBRATION_DURATION: 1500,
  PARTICLE_COUNT: 12,
} as const

const regular = { fontFamily: UI_FONT_FAMILY, fontStyle: 'normal', resolution: 2, lineSpacing: 4 } as const
export const TEXT_STYLES = {
  title: { ...regular, fontSize: '24px', color: UI_COLORS.text },
  subtitle: { ...regular, fontSize: '14px', color: UI_COLORS.muted },
  score: { ...regular, fontSize: '32px', color: UI_COLORS.warning },
  info: { ...regular, fontSize: '16px', color: UI_COLORS.text },
  label: { ...regular, fontSize: '14px', color: UI_COLORS.muted },
} as const
