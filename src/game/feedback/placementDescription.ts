import type { PuyoPair, PuyoColor } from '../core/types'

export const PUYO_COLOR_NAMES: Record<PuyoColor, string> = {
  red: '赤', green: '緑', blue: '青', yellow: '黄',
}

export function describePairOrientation(pair: PuyoPair | null, rotation: number): string {
  if (!pair) return 'ツモなし'
  const main = PUYO_COLOR_NAMES[pair.main.color], sub = PUYO_COLOR_NAMES[pair.sub.color]
  switch (rotation) {
    case 0: return `下から${main}→${sub}`
    case 1: return `左から${main}→${sub}`
    case 2: return `下から${sub}→${main}`
    case 3: return `左から${sub}→${main}`
    default: return '向き不明'
  }
}

export function pairPreviewCells(pair: PuyoPair, rotation: number) {
  const [mainX, mainY, subX, subY] = [
    [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [1, 0, 0, 0],
  ][rotation] ?? [0, 1, 0, 0]
  return [
    { x: mainX, y: mainY, color: pair.main.color, main: true },
    { x: subX, y: subY, color: pair.sub.color, main: false },
  ]
}
