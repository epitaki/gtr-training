// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ setSession: vi.fn(), signOut: vi.fn(), getUser: vi.fn() }))
vi.mock('../lib/supabase', () => ({ localSupabase: true, supabase: { auth: fake } }))
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })

it('uses bootstrap nonce and places only verified tokens into the normal Supabase client', async () => {
  const calls: { path: string; init?: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path, init })
    return { ok: true, headers: { get: () => 'application/json' }, json: async () =>
      path.endsWith('bootstrap') ? { csrf: 'nonce' } : { access_token: 'access', refresh_token: 'refresh' } } as unknown as Response
  }))
  fake.setSession.mockResolvedValue({ error: null, data: { user: {
    id: '00000000-0000-4000-8000-000000000001', email: 'systemadmin@gtr.local', role: 'authenticated',
    app_metadata: { gtr_local_admin: true },
  } } })
  const { localLogin } = await import('./account')
  await localLogin()
  expect(calls.map(call => call.path)).toEqual(['/api/local-auth/bootstrap', '/api/local-auth/login'])
  expect(calls[1].init?.headers).toMatchObject({ 'X-GTR-CSRF': 'nonce' })
  expect(fake.setSession).toHaveBeenCalledWith({ access_token: 'access', refresh_token: 'refresh' })
})

it('rejects a mismatched identity and removes its session', async () => {
  vi.stubGlobal('fetch', vi.fn(async (path: string) => ({ ok: true, headers: { get: () => 'application/json' },
    json: async () => path.endsWith('bootstrap') ? { csrf: 'nonce' } : { access_token: 'access', refresh_token: 'refresh' } })))
  fake.setSession.mockResolvedValue({ error: null, data: { user: { id: 'wrong', email: 'systemadmin@gtr.local', app_metadata: { gtr_local_admin: true } } } })
  fake.signOut.mockResolvedValue({ error: null })
  const { localLogin } = await import('./account')
  await expect(localLogin()).rejects.toThrow('本人確認')
  expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' })
})
