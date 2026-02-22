export interface Position {
  x: number
  y: number
}

export interface PuyoData {
  color: PuyoColor
  x: number
  y: number
  sprite?: Phaser.GameObjects.Sprite
}

export interface PuyoPair {
  main: PuyoData
  sub: PuyoData
  rotation: number // 0, 1, 2, 3 (0度, 90度, 180度, 270度)
  falling: boolean
}

export enum PuyoColor {
  RED = 'red',
  GREEN = 'green', 
  BLUE = 'blue',
  YELLOW = 'yellow'
}

export interface GameField {
  grid: (PuyoColor | null)[][]
  width: number
  height: number
}

export interface GameState {
  field: GameField
  currentPair: PuyoPair | null
  nextPair: PuyoPair | null
  nextNextPair: PuyoPair | null
  score: number
  gtrCount: number
  gtrScore: number // GTRの質によるスコア
  gameOver: boolean
}