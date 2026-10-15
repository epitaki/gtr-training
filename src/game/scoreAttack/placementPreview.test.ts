import { expect, it } from 'vitest'
import { PuyoColor as C, type PuyoPair } from '../core/types'
import { encodePlacedPair, replayPlacements } from './placementHistory'
import { getPlacementPreviewPairs } from './placementPreview'
const pair = (main: C, sub: C, x = 2, y = 1): PuyoPair => ({ main: { color: main, x, y }, sub: { color: sub, x, y: y - 1 }, rotation: 0, falling: true })
const placed = [pair(C.RED, C.BLUE, 0, 12), pair(C.GREEN, C.YELLOW, 2, 12), pair(C.BLUE, C.RED, 4, 12)]
const moves = placed.map(encodePlacedPair).join('')
const snapshot = { moves, grid: replayPlacements(moves), currentPair: pair(C.YELLOW, C.GREEN), nextPair: pair(C.RED, C.YELLOW), nextNextPair: pair(C.GREEN, C.BLUE) }
const colours = (p: PuyoPair | null) => p ? [p.main.color, p.sub.color] : null
it('follows the committed sequence, then the saved current and both tail pairs', () => {
  const original = structuredClone(snapshot)
  const first = getPlacementPreviewPairs(snapshot, 0)
  expect(colours(first.current)).toEqual(colours(placed[0]))
  expect(first.current?.main).toMatchObject({ x: 2, y: 1 })
  expect(colours(first.next)).toEqual(colours(placed[1]))
  expect(colours(first.nextNext)).toEqual(colours(placed[2]))
  const beforeLast = getPlacementPreviewPairs(snapshot, 2)
  expect(colours(beforeLast.next)).toEqual(colours(snapshot.currentPair))
  expect(colours(beforeLast.nextNext)).toEqual(colours(snapshot.nextPair))
  const last = getPlacementPreviewPairs(snapshot, 3)
  expect(colours(last.current)).toEqual(colours(snapshot.currentPair))
  expect(colours(last.next)).toEqual(colours(snapshot.nextPair))
  expect(colours(last.nextNext)).toEqual(colours(snapshot.nextNextPair))
  expect(snapshot).toEqual(original)
})
it('keeps missing legacy tail slots unknown and validates step bounds', () => {
  const { nextPair: _next, nextNextPair: _nextNext, ...legacy } = snapshot
  expect(getPlacementPreviewPairs(legacy, 0).nextNext).not.toBeNull()
  expect(getPlacementPreviewPairs(legacy, 3)).toMatchObject({ next: null, nextNext: null })
  expect(() => getPlacementPreviewPairs(legacy, -1)).toThrow()
  expect(() => getPlacementPreviewPairs(legacy, 4)).toThrow()
})
it('does not repeat a terminal placed pair as the current or shift the queue twice', () => {
  const terminal = structuredClone(snapshot)
  terminal.grid[0][2] = C.BLUE
  const before = getPlacementPreviewPairs(terminal, 2)
  expect(colours(before.current)).toEqual(colours(placed[2]))
  expect(colours(before.next)).toEqual(colours(terminal.nextPair))
  expect(colours(before.nextNext)).toEqual(colours(terminal.nextNextPair))
  const final = getPlacementPreviewPairs(terminal, 3)
  expect(final.current).toBeNull()
  expect(colours(final.next)).toEqual(colours(terminal.nextPair))
  expect(colours(final.nextNext)).toEqual(colours(terminal.nextNextPair))
})
