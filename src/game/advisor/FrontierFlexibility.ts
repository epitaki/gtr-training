import type { PuyoColor } from '../core/types'
import type { TailShape } from './TailPlanner'

export interface FrontierCandidate {
  shape: TailShape
  matched: number
  spare: number
  complete: boolean
  tailComplete: boolean
  columns: readonly (readonly PuyoColor[])[]
}

export type FrontierEvidence = Pick<FrontierCandidate,
  'shape' | 'matched' | 'spare' | 'complete' | 'tailComplete'> & { count: number }

/** Refill only the original slots of comparable candidates inside each old tie block. */
export function reorderTiedFrontierSlots<T>(
  sorted: T[],
  compareOriginal: (left: T, right: T) => number,
  frontierOf: (item: T) => FrontierEvidence | undefined,
): void {
  for (let start = 0; start < sorted.length;) {
    let end = start + 1
    while (end < sorted.length && compareOriginal(sorted[start], sorted[end]) === 0) end++

    const groups = new Map<string, { slots: number[]; members: { item: T; index: number; count: number }[] }>()
    for (let index = start; index < end; index++) {
      const frontier = frontierOf(sorted[index])
      if (!frontier) continue
      const key = JSON.stringify([
        frontier.shape, frontier.matched, frontier.spare,
        frontier.complete, frontier.tailComplete,
      ])
      let group = groups.get(key)
      if (!group) {
        group = { slots: [], members: [] }
        groups.set(key, group)
      }
      group.slots.push(index)
      group.members.push({ item: sorted[index], index, count: frontier.count })
    }

    for (const group of groups.values()) {
      if (group.slots.length < 2) continue
      group.members.sort((left, right) => right.count - left.count || left.index - right.index)
      group.slots.forEach((slot, index) => { sorted[slot] = group.members[index].item })
    }
    start = end
  }
}

/** Distinct next cells among targets at the selected target's physical progress. */
export function countFrontierSignatures(
  candidates: readonly FrontierCandidate[],
  best: FrontierCandidate,
  currentHeights: readonly number[],
): number {
  const signatures = new Set<string>()
  for (const candidate of candidates) {
    if (candidate.matched !== best.matched || candidate.spare !== best.spare ||
      candidate.complete !== best.complete || candidate.tailComplete !== best.tailComplete ||
      candidate.shape !== best.shape) continue
    const next = candidate.columns.flatMap((column, x) => {
      const color = column[currentHeights[x]]
      return color ? [`${x}:${color}`] : []
    })
    signatures.add(next.join('|'))
  }
  return signatures.size
}
