import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { loadEnv } from 'vite'
import { assertResolvedLocalEnvironment, LOCAL_ENV_NAMES, parseGeneratedLocalEnvironment } from './environment'

const service = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`
const anon = `header.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`
const generated = `VITE_SUPABASE_URL=http://127.0.0.1:54321\nVITE_SUPABASE_ANON_KEY=${anon}\nLOCAL_SUPABASE_SERVICE_ROLE_KEY=${service}\n`
let temp: string | null = null
afterEach(() => { vi.unstubAllEnvs(); if (temp) { rmSync(temp, { recursive: true, force: true }); temp = null } })

it('rejects local env-file overrides of public URL, public key and service role', () => {
  const inherited = Object.fromEntries(LOCAL_ENV_NAMES.map(name => [name, process.env[name]]))
  for (const name of LOCAL_ENV_NAMES) delete process.env[name]
  try {
  temp = mkdtempSync(resolve('.local', 'env-check-'))
  writeFileSync(join(temp, '.env'), generated)
  const expected = parseGeneratedLocalEnvironment(generated)
  assertResolvedLocalEnvironment(expected, loadEnv('localdev', temp, ''))
  for (const override of [
    'VITE_SUPABASE_URL=https://remote.example',
    'VITE_SUPABASE_ANON_KEY=sb_publishable_other',
    'LOCAL_SUPABASE_SERVICE_ROLE_KEY=sb_secret_other',
  ]) {
    writeFileSync(join(temp, '.env.localdev'), `${override}\n`)
    expect(() => assertResolvedLocalEnvironment(expected, loadEnv('localdev', temp!, ''))).toThrow('does not match')
  }
  } finally {
    for (const name of LOCAL_ENV_NAMES) {
      if (inherited[name] === undefined) delete process.env[name]
      else process.env[name] = inherited[name]
    }
  }
})

it('rejects a reversed public and service-role key without disclosing values', () => {
  expect(() => parseGeneratedLocalEnvironment(`VITE_SUPABASE_URL=http://127.0.0.1:54321\nVITE_SUPABASE_ANON_KEY=${service}\nLOCAL_SUPABASE_SERVICE_ROLE_KEY=${anon}\n`))
    .toThrow('private environment is invalid')
})
