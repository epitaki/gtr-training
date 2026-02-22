// ゲーム画面の共有ビジュアル設定

export const PUYO_COLORS = {
  red:    { main: 0xe74040, light: 0xf28b8b, dark: 0xb02828, eye: 0xffffff, pupil: 0x333333 },
  green:  { main: 0x40b840, light: 0x8bd88b, dark: 0x287028, eye: 0xffffff, pupil: 0x333333 },
  blue:   { main: 0x4070e7, light: 0x8baaf2, dark: 0x2848b0, eye: 0xffffff, pupil: 0x333333 },
  yellow: { main: 0xe7d040, light: 0xf2e58b, dark: 0xb09e28, eye: 0xffffff, pupil: 0x333333 },
} as const

export const FIELD_CONFIG = {
  COLS: 6,
  ROWS: 13,
  CELL_SIZE: 48,
  CELL_GAP: 1,
  GRID_LINE_COLOR: 0x444444,
  GRID_LINE_ALPHA: 0.5,
  GRID_LINE_WIDTH: 1,
  FIELD_BG_COLOR: 0x0a0a14,
  FIELD_BORDER_COLOR: 0x555566,
  FIELD_BORDER_WIDTH: 3,
} as const

export const LAYOUT_SCORE_ATTACK = {
  CANVAS_WIDTH: 640,
  CANVAS_HEIGHT: 800,
  FIELD_X: 48,
  FIELD_Y: 100,
  BG_COLOR: 0x12121a,
} as const

export const LAYOUT_GUIDED = {
  CANVAS_WIDTH: 900,
  CANVAS_HEIGHT: 800,
  FIELD_X: 48,
  FIELD_Y: 100,
  GUIDE_X: 600,
  GUIDE_Y: 100,
  GUIDE_WIDTH: 280,
  BG_COLOR: 0x12121a,
} as const

export const NEXT_AREA_CONFIG = {
  NEXT_CELL_SIZE: 36,
  NEXT_NEXT_CELL_SIZE: 26,
  GAP_BETWEEN: 20,
  AREA_WIDTH: 120,
  AREA_PADDING: 16,
  BG_COLOR: 0x1a1a2e,
  BORDER_COLOR: 0x444466,
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

export const TEXT_STYLES = {
  title: { fontSize: '22px', color: '#ffffff', fontFamily: '"Segoe UI", "Noto Sans JP", sans-serif' },
  subtitle: { fontSize: '14px', color: '#8888aa', fontFamily: '"Segoe UI", "Noto Sans JP", sans-serif' },
  score: { fontSize: '20px', color: '#ffdd44', fontFamily: '"Segoe UI", "Noto Sans JP", sans-serif', stroke: '#000000', strokeThickness: 2 },
  info: { fontSize: '16px', color: '#aaaacc', fontFamily: '"Segoe UI", "Noto Sans JP", sans-serif' },
  label: { fontSize: '14px', color: '#8888aa', fontFamily: '"Segoe UI", "Noto Sans JP", sans-serif' },
} as const
