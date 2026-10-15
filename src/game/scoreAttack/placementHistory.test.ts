import { expect, it } from 'vitest'
import { applyPairPlacement, resolveChains } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'
import { encodeBoard, decodeBoard, encodePlacedPair, decodePlacedPair, replayPlacements } from './placementHistory'
import { encodeScoreAttackGame, decodeScoreAttackGame } from './storageCodec'
import { evaluateScoreAttack } from './evaluate'

const empty = () => Array.from({ length: 13 }, () => Array(6).fill(null))
const pair = (color: PuyoColor, x: number, y: number): PuyoPair => ({ main: { color, x, y }, sub: { color, x, y: y - 1 }, rotation: 0, falling: true })
it('uses 39 characters for all 78 cells without losing any of four colors', () => {
  const grid = empty(), colors = [null, PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW]
  for (let y = 0; y < 13; y++) for (let x = 0; x < 6; x++) grid[y][x] = colors[(x + y) % 5]
  expect(encodeBoard(grid)).toHaveLength(39)
  expect(decodeBoard(encodeBoard(grid))).toEqual(grid)
})
it('uses three characters per placed pair and reconstructs clears as well as placements', () => {
  const first = pair(PuyoColor.RED, 0, 12), second = pair(PuyoColor.RED, 0, 10)
  expect(decodePlacedPair(encodePlacedPair(first))).toEqual(first)
  const moves = encodePlacedPair(first) + encodePlacedPair(second)
  expect(moves).toHaveLength(6)
  expect(replayPlacements(moves, 1)).toEqual(resolveChains(applyPairPlacement(empty(), first, { mainPos: first.main, subPos: first.sub, valid: true })).stableGrid)
  expect(replayPlacements(moves)).toEqual(empty())
})
it('round-trips all rotations and refuses out-of-field and overlapping steps', () => {
  for (const [rotation, dx, dy] of [[0, 0, -1], [1, 1, 0], [2, 0, 1], [3, -1, 0]]) {
    const value = { main: { color: PuyoColor.BLUE, x: 2, y: 6 }, sub: { color: PuyoColor.GREEN, x: 2 + dx, y: 6 + dy }, rotation, falling: true }
    expect(decodePlacedPair(encodePlacedPair(value))).toEqual(value)
  }
  expect(() => decodeBoard('_'.repeat(39))).toThrow()
  expect(() => decodePlacedPair('___')).toThrow()
  const code = encodePlacedPair(pair(PuyoColor.GREEN, 0, 12))
  expect(() => replayPlacements(code + code)).toThrow()
  expect(() => replayPlacements(code.slice(1))).toThrow()
})
it('stores points, boards and steps while avoiding repeated analysis text', () => {
  const placed = pair(PuyoColor.BLUE, 0, 12), moves = encodePlacedPair(placed)
  const snapshot = { grid: replayPlacements(moves), currentPair: pair(PuyoColor.GREEN, 2, 1), moves }
  const state = { finished: true, totalScore: 0, rounds: Array.from({ length: 10 }, () => ({ snapshot, evaluation: evaluateScoreAttack(snapshot), error: null })) }
  const encoded = encodeScoreAttackGame(state)
  const decoded = decodeScoreAttackGame(encoded)
  expect(decoded.rounds.map(round => round.snapshot)).toEqual(state.rounds.map(round => round.snapshot))
  expect(decoded.rounds.map(round => round.evaluation!.analysis.score.totalScore)).toEqual(state.rounds.map(round => round.evaluation!.analysis.score.totalScore))
  expect(JSON.stringify(encoded).length).toBeLessThan(JSON.stringify(state).length / 3)
  expect(JSON.stringify(encoded)).not.toContain('scoreExplanation')
})

it('round-trips the optional queue without requiring it in existing v2 games', () => {
  const snapshot = { grid: empty(), moves: '', currentPair: pair(PuyoColor.RED, 2, 1), nextPair: pair(PuyoColor.BLUE, 2, 1), nextNextPair: pair(PuyoColor.YELLOW, 2, 1) }
  const state = { finished: true, totalScore: 0, rounds: Array.from({ length: 10 }, () => ({ snapshot, evaluation: evaluateScoreAttack(snapshot), error: null })) }
  const encoded = encodeScoreAttackGame(state)
  expect(encoded.rounds[0].next).toHaveLength(3)
  expect(encoded.rounds[0].nextNext).toHaveLength(3)
  expect(decodeScoreAttackGame(encoded).rounds[0].snapshot).toEqual(snapshot)
  const old = structuredClone(encoded)
  for (const round of old.rounds) { delete round.next; delete round.nextNext }
  expect(decodeScoreAttackGame(old).rounds[0].snapshot.nextPair).toBeUndefined()
  encoded.rounds[0].next = '___'
  expect(() => decodeScoreAttackGame(encoded)).toThrow()
})
