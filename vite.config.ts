import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { localAuthPlugin } from './server/localAuth/plugin'
import { LOCAL_SUPABASE_URL, publicSupabaseKey } from './src/lib/supabaseConfig'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { assertResolvedLocalEnvironment, LOCAL_ENV_NAMES, parseGeneratedLocalEnvironment, type LocalEnvironment } from './server/localAuth/environment'

function knownCredential(value: string): boolean {
  const trimmed = value.trim()
  if (/^(?:sb_secret_|sbp_|gh[pousr]_|github_pat_|GOCSPX-)/.test(trimmed)) return true
  const parts = trimmed.split('.')
  if (parts.length !== 3) return false
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return !!payload && typeof payload === 'object' && 'role' in payload && (payload.role === 'service_role' || payload.role === 'authenticated')
  } catch { return false }
}

const publicEnvGuard = (localdev: boolean, expectedPublicKey?: string) => ({
  name: 'public-supabase-key-guard',
  configResolved(config: { env: Record<string, unknown> }) {
    if (Object.entries(config.env).some(([name, value]) => typeof value === 'string' && value.trim() &&
      (/(?:^|_)(?:SECRET|PASSWORD|PRIVATE_KEY|CLIENT_SECRET|ACCESS_TOKEN|REFRESH_TOKEN|API_TOKEN|SERVICE_ROLE)(?:_|$)/i.test(name) || knownCredential(value)))) {
      throw new Error('Public Vite environment must not contain credentials')
    }
    const key = typeof config.env.VITE_SUPABASE_ANON_KEY === 'string' ? config.env.VITE_SUPABASE_ANON_KEY.trim() : ''
    if (key && !publicSupabaseKey(key)) {
      throw new Error('VITE_SUPABASE_ANON_KEY must contain a public publishable or anon key')
    }
    if (localdev && (config.env.VITE_SUPABASE_URL !== LOCAL_SUPABASE_URL || key !== expectedPublicKey)) {
      throw new Error('Local Supabase public configuration is missing or mismatched')
    }
  },
})

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const localdev = mode === 'localdev'
  if (localdev && command === 'build') throw new Error('localdev mode cannot be built for production')
  const envDir = localdev ? resolve('.local/supabase') : process.cwd()
  let generated: LocalEnvironment | null = null
  if (localdev) {
    let privateEnv: string
    try { privateEnv = readFileSync(resolve(envDir, '.env'), 'utf8') }
    catch { throw new Error('Run the local Supabase status command before starting dev') }
    generated = parseGeneratedLocalEnvironment(privateEnv)
    // bunfig disables root auto-loading. Explicit process values must agree with this file.
    for (const name of LOCAL_ENV_NAMES) {
      const inherited = process.env[name]
      if (inherited && inherited !== generated[name]) {
        throw new Error('Injected local Supabase environment does not match the resolved configuration')
      }
    }
  }
  const env = loadEnv(mode, envDir, '')
  if (generated) assertResolvedLocalEnvironment(generated, env)
  return {
  envDir,
  plugins: [publicEnvGuard(localdev, generated?.VITE_SUPABASE_ANON_KEY), react(), ...(localdev && command === 'serve' ? [localAuthPlugin({ anon: env.VITE_SUPABASE_ANON_KEY || '', serviceRole: env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || '' })] : [])],
  server: { host: '127.0.0.1', port: 5175, strictPort: true,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '.local', '.local/**', '**/.local/**',
      '**/.secrets', '**/.secrets/**', '**/.mcp.json', '**/credentials.env',
      'supabase/.temp', 'supabase/.temp/**', '**/supabase/.temp/**', 'supabase/.branches/**', '**/supabase/.branches/**', '**/docker.env'] } },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  }
})
