import { afterEach, expect, it, vi } from 'vitest'
import { LoginNonces } from './nonce'

afterEach(() => vi.useRealTimers())

it('expires, consumes once and bounds pending login nonces', () => {
  vi.useFakeTimers()
  const nonces = new LoginNonces()
  const first = nonces.issue()
  expect(nonces.consume(first)).toBe(true)
  expect(nonces.consume(first)).toBe(false)
  const oldest = nonces.issue()
  for (let index = 0; index < 256; index++) nonces.issue()
  expect(nonces.consume(oldest)).toBe(false)
  const expired = nonces.issue()
  vi.advanceTimersByTime(5 * 60_000 + 1)
  expect(nonces.consume(expired)).toBe(false)
})
