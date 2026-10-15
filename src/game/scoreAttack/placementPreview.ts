import { isSpawnBlocked } from '../core/ChainSimulator'
import type { PuyoPair } from '../core/types'
import { decodePlacedPair } from './placementHistory'
import type { ScoreAttackSnapshot } from './types'

/** Replay colours at spawn; placed coordinates/rotation belong to the completed turn. */
function atSpawn(pair: PuyoPair | null | undefined): PuyoPair | null {
  return pair ? { main: { color: pair.main.color, x: 2, y: 1 }, sub: { color: pair.sub.color, x: 2, y: 0 }, rotation: 0, falling: true } : null
}
export function getPlacementPreviewPairs(snapshot: ScoreAttackSnapshot, step: number) {
  const moves = snapshot.moves ?? '', count = moves.length / 3
  if (moves.length % 3 || !Number.isInteger(step) || step < 0 || step > count) throw new Error('手順が正しくありません')
  const terminal = isSpawnBlocked(snapshot.grid)
  const tail = terminal ? [snapshot.nextPair, snapshot.nextNextPair]
    : [snapshot.currentPair, snapshot.nextPair, snapshot.nextNextPair]
  const read = (index: number) => atSpawn(index < count ? decodePlacedPair(moves.slice(index * 3, index * 3 + 3)) : tail[index - count])
  const stopped = terminal && step === count
  return { current: stopped ? null : read(step), next: read(step + (stopped ? 0 : 1)), nextNext: read(step + (stopped ? 1 : 2)) }
}
