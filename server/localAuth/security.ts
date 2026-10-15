import type { IncomingMessage } from 'node:http'
import { isIP } from 'node:net'

export function isLoopback(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.replace(/^::ffff:/, '').replace(/^\[|\]$/g, '')
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || (isIP(normalized) === 4 && normalized.startsWith('127.'))
}

export function requestAllowed(request: IncomingMessage, address: { address: string; port: number } | null): boolean {
  if (!address || !isLoopback(address.address) || !isLoopback(request.socket.remoteAddress)) return false
  if (request.headers.forwarded || request.headers['x-forwarded-host'] || request.headers['x-forwarded-proto'] || request.headers['x-forwarded-for']) return false
  const host = request.headers.host
  if (typeof host !== 'string' || host.includes(',') || host.includes('@')) return false
  let url: URL
  try { url = new URL(`http://${host}`) } catch { return false }
  if (!isLoopback(url.hostname) || Number(url.port) !== address.port || url.host !== host) return false
  const origin = request.headers.origin
  return origin === undefined || origin === `http://${host}`
}

export function mutationAllowed(request: IncomingMessage, host: string): boolean {
  return request.headers.origin === `http://${host}` &&
    request.headers['content-type']?.split(';')[0].trim().toLowerCase() === 'application/json' &&
    request.headers['x-gtr-local-auth'] === '1'
}
