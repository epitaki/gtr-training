import { describe, expect, it } from 'vitest'
import { PuyoColor, type PuyoPair } from '../core/types'
import { describePairOrientation, pairPreviewCells } from './placementDescription'
const pair: PuyoPair = { main: { color: PuyoColor.BLUE, x: 2, y: 1 }, sub: { color: PuyoColor.YELLOW, x: 2, y: 0 }, rotation: 0, falling: true }

describe('actual-color orientation choices', () => {
  it.each([
    [0, '下から青→黄', [0, 1], [0, 0]],
    [1, '左から青→黄', [0, 0], [1, 0]],
    [2, '下から黄→青', [0, 0], [0, 1]],
    [3, '左から黄→青', [1, 0], [0, 0]],
  ] as const)('maps rotation %i to the same preview and description', (rotation, label, main, sub) => {
    expect(describePairOrientation(pair, rotation)).toBe(label)
    expect(pairPreviewCells(pair, rotation)).toEqual([
      { x: main[0], y: main[1], color: PuyoColor.BLUE, main: true },
      { x: sub[0], y: sub[1], color: PuyoColor.YELLOW, main: false },
    ])
  })
  it('does not invent a color when the game has no current pair', () => {
    expect(describePairOrientation(null, 0)).toBe('ツモなし')
    expect(describePairOrientation(pair, 4)).toBe('向き不明')
  })
})
