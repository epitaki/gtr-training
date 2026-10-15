import { expect, it } from 'vitest'
import { PuyoColor as C, type PuyoPair } from '../core/types'
import { isPairSequence, pairFromSequence } from '../core/PairSequence'
import { encodePlacedPair, replayPlacements } from './placementHistory'
import { getPracticeSequence } from './practiceSequence'

const placed: PuyoPair = { main: { color: C.BLUE, x: 0, y: 12 }, sub: { color: C.RED, x: 1, y: 12 }, rotation: 1, falling: true }
const moves = encodePlacedPair(placed)
const snapshot = { moves, grid: replayPlacements(moves), currentPair: null }

it('keeps axis/child colors in order while discarding old positions and rotation', () => {
  const sequence = getPracticeSequence(snapshot)!
  expect(sequence).toEqual([[C.BLUE, C.RED]])
  const pair = pairFromSequence(sequence, 0)!
  expect(pair).toEqual({ main: { color: C.BLUE, x: 2, y: 1 }, sub: { color: C.RED, x: 2, y: 0 }, rotation: 0, falling: true })
  pair.main.color = C.YELLOW
  expect(pairFromSequence(sequence, 0)!.main.color).toBe(C.BLUE)
  expect(pairFromSequence(sequence, 1)).toBeNull()
})

it.each([undefined, '', '!', 'AAA', 'A'.repeat(30003)])('rejects missing, empty, invalid and oversized saved steps (%s)', moves => {
  expect(getPracticeSequence({ ...snapshot, moves })).toBeNull()
})

it('rejects a history whose final board disagrees with its moves', () => {
  expect(getPracticeSequence({ ...snapshot, grid: replayPlacements('') })).toBeNull()
})

it('validates externally supplied sequences without accepting malformed colors or unbounded lists', () => {
  expect(isPairSequence([[C.RED, C.GREEN]])).toBe(true)
  for (const value of [null, [], ['red'], [['red', 'unknown']], [['red']], Array(10001).fill([C.RED, C.GREEN])]) {
    expect(isPairSequence(value)).toBe(false)
  }
})
