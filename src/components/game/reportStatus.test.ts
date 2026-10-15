import { describe, expect, it } from 'vitest'
import { reportStatusForEvent } from './reportStatus'

describe('guided share status', () => {
  it('clears a busy message after completion or cancellation and never opens a report itself', () => {
    expect(reportStatusForEvent('chain-resolving')).toContain('アニメーション中')
    expect(reportStatusForEvent('chain-ended')).toBe('')
    expect(reportStatusForEvent('request')).toBe('')
    expect(reportStatusForEvent('ready')).toBe('')
  })
})
