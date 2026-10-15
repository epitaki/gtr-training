import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { build, createServer } from 'vite'

const configFile = resolve('vite.config.ts')
const outputRoot = resolve('.local', 'public-env-guard-test')
const serviceKey = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`
const anonKey = `header.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`

afterEach(() => { vi.unstubAllEnvs(); rmSync(outputRoot, { recursive: true, force: true }) })

function setPublicEnv(key: string): void {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', key)
}

async function devStarts(): Promise<void> {
  const server = await createServer({ configFile, server: { host: '127.0.0.1', port: 0 } })
  try { await server.listen() }
  finally { await server.close() }
}

async function builds(name: string): Promise<void> {
  await build({ configFile, build: { outDir: join(outputRoot, name), emptyOutDir: true } })
}

it('rejects secret and service_role keys before dev serving or build output', async () => {
  for (const [name, key] of [['secret', 'sb_secret_FAKE_FOR_TEST_ONLY'], ['service', serviceKey]]) {
    setPublicEnv(key)
    const devError = await devStarts().catch(error => error as Error)
    expect(devError).toBeInstanceOf(Error)
    expect(String(devError)).not.toContain(key)
    const buildError = await builds(name).catch(error => error as Error)
    expect(buildError).toBeInstanceOf(Error)
    expect(String(buildError)).not.toContain(key)
    expect(existsSync(join(outputRoot, name, 'index.html'))).toBe(false)
  }
}, 120_000)

it('rejects known Supabase secrets in other public variables before dev or build output', async () => {
  for (const [name, key] of [['other-secret', 'sb_secret_FAKE_FOR_TEST_ONLY'], ['other-service', serviceKey]]) {
    vi.unstubAllEnvs()
    setPublicEnv(anonKey)
    vi.stubEnv('VITE_OTHER_PUBLIC_VALUE', `  ${key}  `)
    const devError = await devStarts().catch(error => error as Error)
    expect(devError).toBeInstanceOf(Error)
    expect(String(devError)).not.toContain(key)
    const buildError = await builds(name).catch(error => error as Error)
    expect(buildError).toBeInstanceOf(Error)
    expect(String(buildError)).not.toContain(key)
    expect(existsSync(join(outputRoot, name, 'index.html'))).toBe(false)
  }
}, 120_000)

it('allows publishable, anon, and unset configuration in dev and build', async () => {
  vi.stubEnv('VITE_PUBLIC_LABEL', 'ordinary public value')
  for (const key of ['sb_publishable_FAKE_FOR_TEST_ONLY', anonKey, '']) {
    setPublicEnv(key)
    await devStarts()
  }
  setPublicEnv('sb_publishable_FAKE_FOR_TEST_ONLY')
  await builds('publishable')
  expect(existsSync(join(outputRoot, 'publishable', 'index.html'))).toBe(true)
  setPublicEnv(anonKey)
  await builds('anon')
  expect(existsSync(join(outputRoot, 'anon', 'index.html'))).toBe(true)
  setPublicEnv('')
  await builds('unset')
  expect(existsSync(join(outputRoot, 'unset', 'index.html'))).toBe(true)
}, 120_000)

it('refuses to build the local development mode before producing output', async () => {
  const error = await build({ configFile, mode: 'localdev', build: { outDir: join(outputRoot, 'localdev') } }).catch(caught => caught as Error)
  expect(error).toBeInstanceOf(Error)
  expect(String(error)).toContain('localdev mode cannot be built')
  expect(existsSync(join(outputRoot, 'localdev', 'index.html'))).toBe(false)
})

it('does not serve CLI-generated private files by path or filesystem URL', async () => {
  const tempDir = resolve('supabase/.temp')
  const canary = join(tempDir, 'gtr-private-canary.env')
  mkdirSync(tempDir, { recursive: true })
  writeFileSync(canary, 'PRIVATE_GTR_CANARY_SHOULD_NOT_BE_SERVED')
  const server = await createServer({ configFile, mode: 'cloud', server: { host: '127.0.0.1', port: 0 } })
  try {
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === 'string') throw new Error('No address')
    const base = `http://127.0.0.1:${address.port}`
    for (const path of ['/supabase/.temp/gtr-private-canary.env', `/@fs/${canary.replace(/\\/g, '/')}`]) {
      const response = await fetch(`${base}${path}`)
      expect(await response.text()).not.toContain('PRIVATE_GTR_CANARY_SHOULD_NOT_BE_SERVED')
    }
  } finally { await server.close(); rmSync(canary, { force: true }) }
})

it('refuses local secrets and connector credentials over normal and filesystem URLs', async () => {
  const fixtures = [resolve('server/.secrets/gtr-canary.txt'), resolve('server/.mcp.json')]
  const marker = 'PRIVATE_SECURITY_AUDIT_CANARY'
  mkdirSync(resolve('server/.secrets'), { recursive: true })
  for (const path of fixtures) writeFileSync(path, marker, { flag: 'wx' })
  const server = await createServer({ configFile, mode: 'cloud', server: { host: '127.0.0.1', port: 0 } })
  try {
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === 'string') throw new Error('No address')
    const base = `http://127.0.0.1:${address.port}`
    for (const path of ['/server/.secrets/gtr-canary.txt', '/server/.mcp.json',
      ...fixtures.map(path => `/@fs/${path.replace(/\\/g, '/')}`)]) {
      const response = await fetch(`${base}${path}`)
      expect(response.status).toBe(403)
      expect(await response.text()).not.toContain(marker)
    }
  } finally {
    await server.close()
    fixtures.forEach(path => rmSync(path, { force: true }))
    rmSync(resolve('server/.secrets'), { recursive: true, force: true })
  }
})

it('rejects OAuth, management and user-session credentials in public variables without echoing values', async () => {
  const credentials = [
    ['VITE_GOOGLE_CLIENT_SECRET', 'FAKE_OPAQUE_CLIENT_CREDENTIAL'],
    ['VITE_ACCESS_TOKEN', 'FAKE_OPAQUE_TOKEN'],
    ['VITE_LABEL', 'GOCSPX-FAKE_OAUTH_CREDENTIAL'],
    ['VITE_LABEL', 'sbp_FAKE_MANAGEMENT_CREDENTIAL'],
    ['VITE_LABEL', `header.${Buffer.from(JSON.stringify({ role: 'authenticated' })).toString('base64url')}.signature`],
  ]
  for (const [name, value] of credentials) {
    vi.unstubAllEnvs()
    setPublicEnv(anonKey)
    vi.stubEnv(name, value)
    const error = await devStarts().catch(caught => caught as Error)
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).not.toContain(value)
    expect(String(error)).toContain('must not contain credentials')
  }
})
