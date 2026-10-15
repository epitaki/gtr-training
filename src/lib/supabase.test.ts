import { afterEach, expect, it, vi } from 'vitest'
import { authStorageKey, oauthHashStorageKey, validSupabaseUrl } from './supabaseConfig'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

it('permits only the fixed development HTTP endpoint and splits auth storage by URL', () => {
  expect(validSupabaseUrl('http://127.0.0.1:54321', true)).toBe(true)
  expect(validSupabaseUrl('http://127.0.0.1:54321')).toBe(false)
  expect(validSupabaseUrl('http://localhost:54321', true)).toBe(false)
  expect(validSupabaseUrl('http://127.0.0.1:54322', true)).toBe(false)
  expect(validSupabaseUrl('https://project.example/other')).toBe(false)
  expect(authStorageKey('https://project.example/', 'cloud')).toBe(authStorageKey('https://project.example', 'cloud'))
  expect(authStorageKey('https://project.example', 'cloud')).not.toBe(authStorageKey('http://127.0.0.1:54321', 'localdev'))
  expect(oauthHashStorageKey('https://project.example', 'cloud')).not.toBe(oauthHashStorageKey('http://127.0.0.1:54321', 'localdev'))
})

it.each(['', 'not-a-url', 'https://', 'http://project.example', 'https://user:pass@project.example'])('keeps guest mode for an invalid Supabase URL: %s', async url => {
  vi.stubEnv('VITE_SUPABASE_URL', url)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_test')
  const module = await import('./supabase')
  expect(module.supabase).toBeNull()
})

it('does not construct a client from a secret key', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.example')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_secret_test')
  expect((await import('./supabase')).supabase).toBeNull()
})
