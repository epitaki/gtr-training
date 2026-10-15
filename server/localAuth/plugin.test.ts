import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createServer, preview, type ViteDevServer, type PreviewServer } from 'vite'
import { fixedFetch, localAuthPlugin } from './plugin'

const admin = vi.hoisted(() => ({ getUserById: vi.fn(), generateLink: vi.fn(), verifyOtp: vi.fn() }))
const serviceKey = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`
vi.mock('@supabase/supabase-js', () => ({ createClient: (_url: string, key: string) => ({ auth: key === 'sb_publishable_test' ?
  { verifyOtp: admin.verifyOtp } : { admin: { getUserById: admin.getUserById, generateLink: admin.generateLink } } }) }))
let server: ViteDevServer | null = null
let previewServer: PreviewServer | null = null
let root: string | null = null
afterEach(async () => {
  if (server) { await server.close(); server = null }
  if (previewServer) { await new Promise<void>(resolve => previewServer!.httpServer.close(() => resolve())); previewServer = null }
  if (root) { rmSync(root, { recursive: true, force: true }); root = null }
  vi.resetAllMocks()
})

async function start(host: string) {
  const testBase = resolve('.local', 'tests')
  mkdirSync(testBase, { recursive: true })
  root = mkdtempSync(join(testBase, 'bindings-'))
  writeFileSync(join(root, 'index.html'), '<html></html>')
  server = await createServer({ root, configFile: false, plugins: [localAuthPlugin({ anon: 'sb_publishable_test', serviceRole: serviceKey })], server: { host, port: 0 } })
  await server.listen()
  const address = server.httpServer!.address()
  if (!address || typeof address === 'string') throw new Error('No address')
  return `http://127.0.0.1:${address.port}`
}

it('rejects public bind and does not install in preview', async () => {
  const publicBase = await start('0.0.0.0')
  expect((await fetch(`${publicBase}/api/local-auth/bootstrap`)).status).toBe(403)
  await server!.close(); server = null
  mkdirSync(join(root!, 'dist'))
  writeFileSync(join(root!, 'dist', 'index.html'), '<html></html>')
  previewServer = await preview({ root: root!, configFile: false, plugins: [localAuthPlugin({ anon: 'sb_publishable_test', serviceRole: serviceKey })], preview: { host: '127.0.0.1', port: 0 } })
  const address = previewServer.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('No address')
  const response = await fetch(`http://127.0.0.1:${address.port}/api/local-auth/bootstrap`)
  expect(response.headers.get('content-type')).not.toContain('application/json')
})

it('uses one nonce, fixed identity and returns only normal session tokens', async () => {
  const base = await start('127.0.0.1')
  const get = (headers: Record<string, string> = {}) => fetch(`${base}/api/local-auth/bootstrap`, { headers })
  const post = (nonce?: string, headers: Record<string, string> = {}, body = '{}') => fetch(`${base}/api/local-auth/login`, {
    method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', 'X-GTR-Local-Auth': '1', ...(nonce ? { 'X-GTR-CSRF': nonce } : {}), ...headers }, body,
  })
  expect((await get({ 'X-Forwarded-For': '127.0.0.1' })).status).toBe(403)
  const bootstrap = await get()
  const { csrf } = await bootstrap.json() as { csrf: string }
  expect((await post()).status).toBe(403)
  expect((await post(csrf, { Origin: 'http://evil.example' })).status).toBe(403)
  expect((await post(csrf, {}, '{"role":"admin"}')).status).toBe(400)
  const user = { id: '00000000-0000-4000-8000-000000000001', email: 'systemadmin@gtr.local', role: 'authenticated', app_metadata: { gtr_local_admin: true } }
  admin.getUserById.mockResolvedValue({ data: { user }, error: null })
  admin.generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'hidden' } }, error: null })
  admin.verifyOtp.mockResolvedValue({ data: { user, session: { access_token: 'access', refresh_token: 'refresh' } }, error: null })
  const login = await post(csrf)
  expect(login.status).toBe(200)
  expect(login.headers.get('cache-control')).toBe('no-store')
  expect(await login.json()).toEqual({ access_token: 'access', refresh_token: 'refresh' })
  expect((await post(csrf)).status).toBe(403)
  expect(admin.generateLink).toHaveBeenCalledOnce()
  expect(admin.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hidden', type: 'magiclink' })
})

it('never follows an upstream redirect or contacts another origin', async () => {
  const original = globalThis.fetch
  const upstream = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({ status: 302, headers: { get: () => 'https://evil.example/' } }))
  globalThis.fetch = upstream as unknown as typeof fetch
  try {
    expect(() => fixedFetch('https://evil.example/auth/v1/verify')).toThrow('不正')
    await expect(fixedFetch('http://127.0.0.1:54321/auth/v1/verify')).rejects.toThrow('転送')
    expect(upstream).toHaveBeenCalledOnce()
    expect(upstream.mock.calls[0][1]).toMatchObject({ redirect: 'manual' })
  } finally { globalThis.fetch = original }
})

it('rejects a fixed UUID collision before generating a login link', async () => {
  const base = await start('127.0.0.1')
  const bootstrap = await fetch(`${base}/api/local-auth/bootstrap`)
  const { csrf } = await bootstrap.json() as { csrf: string }
  admin.getUserById.mockResolvedValue({ data: { user: { id: '00000000-0000-4000-8000-000000000001', email: 'other@example.test' } }, error: null })
  const response = await fetch(`${base}/api/local-auth/login`, { method: 'POST', headers: {
    Origin: base, 'Content-Type': 'application/json', 'X-GTR-Local-Auth': '1', 'X-GTR-CSRF': csrf,
  }, body: '{}' })
  expect(response.status).toBe(503)
  expect(admin.generateLink).not.toHaveBeenCalled()
  expect(JSON.stringify(await response.json())).not.toContain('other@example.test')
})
