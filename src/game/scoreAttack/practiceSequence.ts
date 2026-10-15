import type { PairColors } from '../core/PairSequence'
import { decodePlacedPair, encodeBoard, replayPlacements } from './placementHistory'
import type { ScoreAttackSnapshot } from './types'

/** Only committed moves are fixed; unseen pairs use the normal practice random source. */
export function getPracticeSequence(snapshot: ScoreAttackSnapshot): PairColors[] | null {
  const moves = snapshot.moves
  if (!moves) return null
  try {
    if (encodeBoard(replayPlacements(moves)) !== encodeBoard(snapshot.grid)) return null
    return Array.from({ length: moves.length / 3 }, (_, index) => {
      const pair = decodePlacedPair(moves.slice(index * 3, index * 3 + 3))
      return [pair.main.color, pair.sub.color] as const
    })
  } catch { return null }
}
