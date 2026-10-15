import { PuyoColor } from '../core/types'

/** Idealized single-color supply, not legal pair turns or guaranteed completion. */
export interface CompletionWait {
  missingByColor: Record<PuyoColor, number>
  frontierColors: PuyoColor[]
  blockedColors: PuyoColor[]
  missingCount: number
  orderedDraws: number
  unorderedDraws: number
  orderOverhead: number
}

const COLORS = Object.values(PuyoColor)
const orderedCache = new Map<string, number>()
const unorderedCache = new Map<string, number>()
const MAX_CACHE = 10000
const remember = (cache: Map<string, number>, key: string, value: number): number => {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!)
  cache.set(key, value)
  return value
}

function orderedDraws(queues: readonly (readonly PuyoColor[])[]): number {
  // Column identities do not affect this idealized model; keep repeated queues.
  const remaining = queues.filter(queue => queue.length).map(queue => [...queue])
    .sort((a, b) => a.join(',').localeCompare(b.join(',')))
  if (!remaining.length) return 0
  const key = remaining.map(queue => queue.join(',')).join('/')
  const cached = orderedCache.get(key)
  if (cached !== undefined) return cached
  const frontiers = new Set(remaining.map(queue => queue[0]))
  let nextSum = 0
  for (const color of frontiers) {
    let best = Infinity
    for (let x = 0; x < remaining.length; x++) {
      if (remaining[x][0] !== color) continue
      const next = remaining.map((queue, i) => i === x ? queue.slice(1) : queue)
      best = Math.min(best, orderedDraws(next))
    }
    nextSum += best
  }
  // E = 1 + (unusable colors / 4) E + sum(best successor E) / 4.
  return remember(orderedCache, key, (COLORS.length + nextSum) / frontiers.size)
}

function unorderedDraws(counts: readonly number[]): number {
  if (counts.every(count => count === 0)) return 0
  const key = counts.join(',')
  const cached = unorderedCache.get(key)
  if (cached !== undefined) return cached
  let nextSum = 0
  let available = 0
  counts.forEach((count, index) => {
    if (!count) return
    available++
    nextSum += unorderedDraws(counts.map((value, i) => i === index ? value - 1 : value))
  })
  return remember(unorderedCache, key, (COLORS.length + nextSum) / available)
}

/** Each queue contains only missing cells, bottom first, from ONE valid target. */
export function inspectCompletionWait(queues: readonly (readonly PuyoColor[])[]): CompletionWait {
  const missingByColor = Object.fromEntries(COLORS.map(color => [color,
    queues.reduce((sum, queue) => sum + queue.filter(value => value === color).length, 0),
  ])) as Record<PuyoColor, number>
  const frontierColors = COLORS.filter(color => queues.some(queue => queue[0] === color))
  const counts = COLORS.map(color => missingByColor[color])
  const ordered = orderedDraws(queues)
  const unordered = unorderedDraws(counts)
  return {
    missingByColor, frontierColors,
    blockedColors: COLORS.filter(color => missingByColor[color] > 0 && !frontierColors.includes(color)),
    missingCount: counts.reduce((sum, count) => sum + count, 0),
    orderedDraws: ordered, unorderedDraws: unordered, orderOverhead: Math.max(0, ordered - unordered),
  }
}

/** Small total wait penalty; include color concentration as well as order. */
export function completionWaitCost(queues: readonly (readonly PuyoColor[])[]): number {
  const wait = inspectCompletionWait(queues)
  return Math.min(80, (wait.orderedDraws - wait.missingCount) * 4)
}
