import { expect, it } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { isLoopback, mutationAllowed, requestAllowed } from './security'

function request(host = '127.0.0.1:5173', peer = '127.0.0.1', headers: Record<string, string> = {}): IncomingMessage {
  return { headers: { host, ...headers }, socket: { remoteAddress: peer } } as unknown as IncomingMessage
}

it('accepts only direct loopback traffic to the actual listening port', () => {
  const listener = { address: '127.0.0.1', port: 5173 }
  expect(requestAllowed(request(), listener)).toBe(true)
  expect(requestAllowed(request('localhost:5173'), listener)).toBe(true)
  expect(requestAllowed(request('127.0.0.1:5174'), listener)).toBe(false)
  expect(requestAllowed(request('evil.example:5173'), listener)).toBe(false)
  expect(requestAllowed(request('%%%'), listener)).toBe(false)
  expect(requestAllowed(request('127.0.0.1:5173', '192.168.1.8'), listener)).toBe(false)
  expect(requestAllowed(request('127.0.0.1:5173', '127.0.0.1', { 'x-forwarded-for': '127.0.0.1' }), listener)).toBe(false)
  expect(requestAllowed(request('127.0.0.1:5173', '127.0.0.1', { origin: 'http://evil.example' }), listener)).toBe(false)
  expect(requestAllowed(request(), { address: '0.0.0.0', port: 5173 })).toBe(false)
  expect(isLoopback('192.168.1.8')).toBe(false)
})

it('requires an exact same origin and dedicated header for mutations', () => {
  const valid = request('127.0.0.1:5173', '127.0.0.1', { origin: 'http://127.0.0.1:5173', 'content-type': 'application/json', 'x-gtr-local-auth': '1' })
  expect(mutationAllowed(valid, '127.0.0.1:5173')).toBe(true)
  expect(mutationAllowed(request(), '127.0.0.1:5173')).toBe(false)
})
