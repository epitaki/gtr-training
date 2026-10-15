import { afterEach, expect, it, vi } from 'vitest'
import { preserveReplayHash, restoreReplayHashBeforeApp } from './oauthCallback'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })

it('loads the callback used by main even when the Supabase URL is invalid', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'not-a-url')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_test')
  vi.resetModules()
  const callback = await import('./oauthCallback')
  const connection = await import('../lib/supabase')
  expect(connection.supabase).toBeNull()
  vi.stubGlobal('location', { hash: '', search: '', pathname: '/' })
  expect(() => callback.restoreReplayHashBeforeApp()).not.toThrow()
  expect(await callback.processOAuthCallback()).toBe('absent')
})

it('keeps a replay hash through an OAuth callback before the app parses it', () => {
  const storage = new Map<string, string>()
  vi.stubGlobal('location', { hash: '#gtr=replay', search: '?auth_callback=1&code=x', pathname: '/' })
  vi.stubGlobal('sessionStorage', {
    setItem: (key: string, value: string) => storage.set(key, value),
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => storage.delete(key),
  })
  preserveReplayHash()
  expect([...storage.values()]).toEqual(['#gtr=replay'])
  vi.stubGlobal('location', { hash: '', search: '?auth_callback=1&code=x', pathname: '/' })
  const replace = vi.fn()
  vi.stubGlobal('history', { replaceState: replace })
  restoreReplayHashBeforeApp()
  expect(replace).toHaveBeenCalledWith(null, '', '/?auth_callback=1&code=x#gtr=replay')
})

it('does not prevent app startup when session storage is blocked', () => {
  vi.stubGlobal('location', { hash: '#gtr=replay', search: '?auth_callback=1', pathname: '/' })
  vi.stubGlobal('sessionStorage', { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } })
  expect(() => preserveReplayHash()).not.toThrow()
  expect(() => restoreReplayHashBeforeApp()).not.toThrow()
})

it('restores the replay when a provider error returns without the callback marker', () => {
  const storage = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    setItem: (key: string, value: string) => storage.set(key, value),
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => storage.delete(key),
  })
  vi.stubGlobal('location', { hash: '#gtr=replay', search: '', pathname: '/' })
  preserveReplayHash()
  vi.stubGlobal('location', { hash: '', search: '?error=invalid_request&error_code=bad_oauth_state', pathname: '/' })
  const replace = vi.fn()
  vi.stubGlobal('history', { replaceState: replace })
  restoreReplayHashBeforeApp()
  expect(replace).toHaveBeenCalledWith(null, '', '/?error=invalid_request&error_code=bad_oauth_state#gtr=replay')
  expect(storage.size).toBe(0)
})
