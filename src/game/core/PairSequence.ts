import { PuyoColor, type PuyoPair } from './types'

export type PairColors = readonly [PuyoColor, PuyoColor]

export function isPairSequence(value: unknown): value is readonly PairColors[] {
  const colors: readonly unknown[] = Object.values(PuyoColor)
  return Array.isArray(value) && value.length > 0 && value.length <= 10_000 &&
    value.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(color => colors.includes(color)))
}

/** Recorded positions belong to the old board; practice always spawns upright. */
export function pairFromSequence(sequence: readonly PairColors[] | undefined, index: number): PuyoPair | null {
  const colors = sequence?.[index]
  return colors ? { main: { color: colors[0], x: 2, y: 1 }, sub: { color: colors[1], x: 2, y: 0 },
    rotation: 0, falling: true } : null
}
