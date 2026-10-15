import { GTR_REPLAY_HASH_PARAM, MAX_REPLAY_CODE_LENGTH } from './constants'
import type { GTRReplayState, GTRReplayReadResult, GTRIssueSnapshot } from './types'
import { cloneJson, toGTRReplayState } from './snapshot'
import { assertValidGTRReplayState } from './validation'

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const base64UrlToBytes = (encoded: string): Uint8Array => {
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

export const encodeGTRReplayState = (state: GTRReplayState): string => {
  assertValidGTRReplayState(state)
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(state)))
  if (encoded.length > MAX_REPLAY_CODE_LENGTH) {
    throw new Error('再現コードが長すぎます')
  }
  return encoded
}

export const decodeGTRReplayState = (code: string): GTRReplayState => {
  if (!code || code.length > MAX_REPLAY_CODE_LENGTH) {
    throw new Error('再現コードの長さが不正です')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(code)))
  } catch {
    throw new Error('再現コードを読み取れません')
  }
  assertValidGTRReplayState(parsed)
  return cloneJson(parsed)
}

export const tryDecodeGTRReplayState = (code: string): GTRReplayState | null => {
  try {
    return decodeGTRReplayState(code)
  } catch {
    return null
  }
}

export const readGTRReplayResultFromHash = (hash: string): GTRReplayReadResult => {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  if (!params.has(GTR_REPLAY_HASH_PARAM)) return { status: 'absent' }
  const code = params.get(GTR_REPLAY_HASH_PARAM)
  try {
    return { status: 'valid', replay: decodeGTRReplayState(code ?? '') }
  } catch (error) {
    return {
      status: 'invalid',
      message: error instanceof Error ? error.message : '再現コードを読み取れません',
    }
  }
}

export const readGTRReplayFromHash = (hash: string): GTRReplayState | null => {
  const result = readGTRReplayResultFromHash(hash)
  return result.status === 'valid' ? result.replay : null
}

export const readGTRReplayResultFromLocation = (): GTRReplayReadResult => (
  typeof window === 'undefined' ? { status: 'absent' } : readGTRReplayResultFromHash(window.location.hash)
)

export const readGTRReplayFromLocation = (): GTRReplayState | null => {
  const result = readGTRReplayResultFromLocation()
  return result.status === 'valid' ? result.replay : null
}

export const createSafeGTRPageUrl = (
  baseUrl = typeof window === 'undefined' ? 'http://localhost/' : window.location.href,
): string => {
  const url = new URL(baseUrl)
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  return url.toString()
}

export const createGTRReplayUrl = (
  snapshot: GTRIssueSnapshot,
  baseUrl = typeof window === 'undefined' ? 'http://localhost/' : window.location.href,
): string => {
  const url = new URL(createSafeGTRPageUrl(baseUrl))
  const params = new URLSearchParams()
  params.set(GTR_REPLAY_HASH_PARAM, encodeGTRReplayState(toGTRReplayState(snapshot)))
  url.hash = params.toString()
  return url.toString()
}

export const tryCreateGTRReplayUrl = (
  snapshot: GTRIssueSnapshot,
  baseUrl?: string,
): string | null => {
  try {
    return createGTRReplayUrl(snapshot, baseUrl)
  } catch {
    return null
  }
}

export const clearGTRReplayHash = (): void => {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const params = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash)
  if (!params.has(GTR_REPLAY_HASH_PARAM)) return
  params.delete(GTR_REPLAY_HASH_PARAM)
  url.hash = params.toString()
  window.history.replaceState(null, '', url)
}
