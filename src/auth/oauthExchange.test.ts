import { afterEach, expect, it, vi } from 'vitest'

const exchange = vi.hoisted(() => vi.fn())
vi.mock('../lib/supabase', () => ({ supabase: { auth: { exchangeCodeForSession: exchange } } }))

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); exchange.mockReset() })

it('exchanges a marked callback exactly once and preserves unrelated query/hash', async () => {
  vi.stubGlobal('location', { search: '?theme=dark&auth_callback=1&code=sample', hash: '#gtr=replay', pathname: '/' })
  const replace = vi.fn()
  vi.stubGlobal('history', { replaceState: replace })
  exchange.mockResolvedValue({ error: null, data: { session: { access_token: 'test' } } })
  const callback = await import('./oauthCallback')
  expect(await Promise.all([callback.processOAuthCallback(), callback.processOAuthCallback()])).toEqual(['success', 'success'])
  expect(exchange).toHaveBeenCalledTimes(1)
  expect(exchange).toHaveBeenCalledWith('sample')
  expect(replace).toHaveBeenCalledWith(null, '', '/?theme=dark#gtr=replay')
})

it('cleans an error callback without exchanging a code', async () => {
  vi.stubGlobal('location', { search: '?auth_callback=1&error=access_denied&error_description=denied', hash: '#x', pathname: '/' })
  const replace = vi.fn()
  vi.stubGlobal('history', { replaceState: replace })
  const callback = await import('./oauthCallback')
  await expect(callback.processOAuthCallback()).rejects.toThrow('denied')
  expect(exchange).not.toHaveBeenCalled()
  expect(replace).toHaveBeenCalledWith(null, '', '/#x')
})

it('reports the expired OAuth state returned to the Site URL without the callback marker', async () => {
  vi.stubGlobal('location', { search: '?theme=dark&error=invalid_request&error_code=bad_oauth_state&error_description=OAuth%20state%20has%20expired', hash: '', pathname: '/' })
  const replace = vi.fn()
  vi.stubGlobal('history', { replaceState: replace })
  const callback = await import('./oauthCallback')
  await expect(callback.processOAuthCallback()).rejects.toThrow('OAuth state has expired')
  expect(exchange).not.toHaveBeenCalled()
  expect(replace).toHaveBeenCalledWith(null, '', '/?theme=dark')
})

it('leaves ordinary query parameters alone and requires a marked code callback', async () => {
  vi.stubGlobal('location', { search: '?code=unrelated&error=filter', hash: '#gtr=replay', pathname: '/' })
  const replace = vi.fn()
  vi.stubGlobal('history', { replaceState: replace })
  const callback = await import('./oauthCallback')
  expect(await callback.processOAuthCallback()).toBe('absent')
  expect(exchange).not.toHaveBeenCalled()
  expect(replace).not.toHaveBeenCalled()
})
