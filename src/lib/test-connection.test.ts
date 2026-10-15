import { afterEach, expect, it, vi } from 'vitest'

const anonKey = `header.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules() })

async function diagnostic(key: string, response?: Response) {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', key)
  const fetchMock = vi.fn(async () => response ?? { ok: true, status: 200 } as Response)
  vi.stubGlobal('fetch', fetchMock)
  const module = await import('./test-connection')
  return { result: await module.testSupabaseConnection(), env: module.checkEnvironmentVariables(), fetchMock }
}

it('reports missing configuration without querying protected profiles', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const module = await import('./test-connection')
  expect(await module.testSupabaseConnection()).toMatchObject({ connected: false, kind: 'configuration' })
  expect(fetchMock).not.toHaveBeenCalled()
})

it.each(['sb_publishable_FAKE_FOR_TEST_ONLY', anonKey])('uses Auth health for public key %s', async key => {
  const { result, env, fetchMock } = await diagnostic(key)
  expect(env).toMatchObject({ hasUrl: true, hasKey: true, urlFormat: true, keyFormat: true })
  expect(result).toMatchObject({ connected: true, kind: 'ok' })
  expect(fetchMock).toHaveBeenCalledWith('https://example.supabase.co/auth/v1/health', expect.objectContaining({ headers: { apikey: key } }))
})

it('separates authorization refusal from network failure', async () => {
  const denied = await diagnostic('sb_publishable_FAKE_FOR_TEST_ONLY', { ok: false, status: 401 } as Response)
  expect(denied.result).toMatchObject({ connected: false, kind: 'authorization' })
  vi.resetModules()
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
  const module = await import('./test-connection')
  expect(await module.testSupabaseConnection()).toMatchObject({ connected: false, kind: 'network' })
})
