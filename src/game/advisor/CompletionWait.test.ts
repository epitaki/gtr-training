import { describe, expect, it } from 'vitest'
import { completionWaitCost, inspectCompletionWait } from './CompletionWait'
import { PuyoColor } from '../core/types'

const { RED: R, BLUE: B, GREEN: G, YELLOW: Y } = PuyoColor

describe('idealized completion color wait', () => {
  it('distinguishes color order from raw missing counts', () => {
    expect(inspectCompletionWait([[R, B]])).toMatchObject({
      missingCount: 2, orderedDraws: 8, unorderedDraws: 6, orderOverhead: 2,
      frontierColors: [R], blockedColors: [B],
    })
    expect(inspectCompletionWait([[R], [B]])).toMatchObject({
      missingCount: 2, orderedDraws: 6, unorderedDraws: 6, orderOverhead: 0, blockedColors: [],
    })
  })
  it('retains multiplicity and counts one supplied puyo once', () => {
    expect(inspectCompletionWait([[R], [R]]).orderedDraws).toBe(8)
    expect(inspectCompletionWait([[R, R]]).orderedDraws).toBe(8)
  })
  it('chooses the best column when the same color unlocks different continuations', () => {
    expect(inspectCompletionWait([[R, B], [R]]).orderedDraws).toBe(10)
  })
  it('has no waiting reward for leaving a completed target unfinished', () => {
    expect(inspectCompletionWait([[], []])).toMatchObject({ missingCount: 0, orderedDraws: 0, orderOverhead: 0 })
    expect(inspectCompletionWait([[R]]).orderedDraws).toBe(4)
    expect(completionWaitCost([[], []])).toBe(0)
    expect(completionWaitCost([[R, B]])).toBe(24)
    expect(completionWaitCost([[R, R]])).toBe(24)
    expect(completionWaitCost([[R], [B]])).toBe(16)
    expect(completionWaitCost([[R, B, G, Y, R, B, G, Y]])).toBe(80)
  })
  it('is deterministic, color-renaming and column-order invariant without mutation', () => {
    const queues = [[R, B], [B, G], [Y]]
    const original = structuredClone(queues)
    const result = inspectCompletionWait(queues)
    expect(inspectCompletionWait([...queues].reverse()).orderedDraws).toBe(result.orderedDraws)
    const colors = [R, B, G, Y]
    expect(inspectCompletionWait(queues.map(queue => queue.map(color => colors[(colors.indexOf(color) + 1) % 4]))).orderedDraws).toBe(result.orderedDraws)
    expect(inspectCompletionWait(queues)).toEqual(result)
    expect(queues).toEqual(original)
    expect(result.orderedDraws).toBeGreaterThanOrEqual(result.unorderedDraws)
  })
})
