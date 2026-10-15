import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCAL_ADMIN_EMAIL, LOCAL_ADMIN_ID, LOCAL_SUPABASE_URL, publicSupabaseKey, serviceRoleSupabaseKey } from '../src/lib/supabaseConfig'

const command = process.argv[2]
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = resolve(root, 'node_modules/.bin/supabase.exe')
const localDocker = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs/DockerDesktop/resources/bin/docker.exe') : ''
const docker = process.env.DOCKER_EXE || (localDocker && existsSync(localDocker) ? localDocker : 'docker')
const network = 'gtr-training-loopback'
const envPath = resolve(root, '.local/supabase/.env')

function run(binary: string, args: string[]): string {
  const result = spawnSync(binary, args, { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, PATH: `${dirname(docker)};${process.env.PATH || ''}` } })
  if (result.status !== 0) throw new Error(`${args[0]} failed; inspect the local tool without sharing secret output`)
  return result.stdout
}

function status(): { anon: string; serviceRole: string } {
  checkPortBindings()
  const output = run(cli, ['status', '-o', 'env'])
  const values = Object.fromEntries([...output.matchAll(/^([A-Z_]+)=(.*)$/gm)].map(match => [match[1], match[2].trim().replace(/^"|"$/g, '')]))
  if (values.API_URL !== LOCAL_SUPABASE_URL || !publicSupabaseKey(values.ANON_KEY) || !serviceRoleSupabaseKey(values.SERVICE_ROLE_KEY)) {
    throw new Error('Local Supabase status does not match the fixed environment')
  }
  mkdirSync(resolve(root, '.local/supabase'), { recursive: true })
  writeFileSync(envPath, `VITE_SUPABASE_URL=${LOCAL_SUPABASE_URL}\nVITE_SUPABASE_ANON_KEY=${values.ANON_KEY}\nLOCAL_SUPABASE_SERVICE_ROLE_KEY=${values.SERVICE_ROLE_KEY}\n`, { mode: 0o600 })
  return { anon: values.ANON_KEY, serviceRole: values.SERVICE_ROLE_KEY }
}

function checkPortBindings(): void {
  const networkInfo = JSON.parse(run(docker, ['network', 'inspect', network])) as { Containers?: Record<string, { Name: string }> }[]
  const names = Object.values(networkInfo[0]?.Containers || {}).map(container => container.Name)
  if (names.length === 0) throw new Error('Local Supabase containers are missing from the loopback network')
  const inspected = JSON.parse(run(docker, ['inspect', ...names])) as { NetworkSettings?: { Ports?: Record<string, { HostIp: string }[] | null> } }[]
  for (const container of inspected) {
    for (const bindings of Object.values(container.NetworkSettings?.Ports || {})) {
      for (const binding of bindings || []) {
        if (binding.HostIp !== '127.0.0.1' && binding.HostIp !== '::1') {
          throw new Error('Local Supabase published a non-loopback port')
        }
      }
    }
  }
}

async function adminInit(): Promise<void> {
  const { serviceRole } = status()
  const headers = { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, 'Content-Type': 'application/json' }
  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = new URL(path, LOCAL_SUPABASE_URL)
    if (url.origin !== LOCAL_SUPABASE_URL || (!url.pathname.startsWith('/auth/v1/admin/users') && url.pathname !== '/rest/v1/profiles')) throw new Error('Invalid local target')
    const response = await fetch(url, { ...init, headers: { ...headers, ...init.headers }, redirect: 'manual' })
    if (response.status >= 300 && response.status < 400) throw new Error('Local upstream redirect rejected')
    return response
  }
  const found = await request(`/auth/v1/admin/users/${LOCAL_ADMIN_ID}`)
  if (found.status === 404) {
    let page = 1
    while (page <= 100) {
      const listed = await request(`/auth/v1/admin/users?page=${page}&per_page=100`)
      if (!listed.ok) throw new Error('Unable to inspect local users')
      const data = await listed.json() as { users?: { email?: string }[] }
      if (data.users?.some(user => user.email?.toLowerCase() === LOCAL_ADMIN_EMAIL)) throw new Error('Local admin email belongs to another identity')
      if (!data.users || data.users.length < 100) break
      page++
    }
    if (page > 100) throw new Error('Unable to complete local identity collision check')
    const created = await request('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({
      id: LOCAL_ADMIN_ID, email: LOCAL_ADMIN_EMAIL, email_confirm: true,
      app_metadata: { gtr_local_admin: true }, user_metadata: { full_name: 'システム管理者' },
    }) })
    if (!created.ok) throw new Error('Unable to create fixed local admin')
    const user = await created.json() as { id?: string; email?: string; app_metadata?: { gtr_local_admin?: boolean } }
    if (user.id !== LOCAL_ADMIN_ID || user.email !== LOCAL_ADMIN_EMAIL || user.app_metadata?.gtr_local_admin !== true) throw new Error('Created local identity does not match')
  } else {
    if (!found.ok) throw new Error('Unable to inspect fixed local admin')
    const user = await found.json() as { id?: string; email?: string; app_metadata?: { gtr_local_admin?: boolean } }
    if (user.id !== LOCAL_ADMIN_ID || user.email !== LOCAL_ADMIN_EMAIL || user.app_metadata?.gtr_local_admin !== true) throw new Error('Fixed local admin identity collision')
  }
  const promoted = await request(`/rest/v1/profiles?id=eq.${LOCAL_ADMIN_ID}`, { method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ role: 'admin' }) })
  if (!promoted.ok) throw new Error('Unable to promote local admin profile')
  const profiles = await promoted.json() as { id: string; role: string }[]
  if (profiles.length !== 1 || profiles[0].id !== LOCAL_ADMIN_ID || profiles[0].role !== 'admin') throw new Error('Local admin profile missing')
}

try {
  if (command === 'start') {
    const inspect = spawnSync(docker, ['network', 'inspect', network], { encoding: 'utf8' })
    if (inspect.status !== 0) run(docker, ['network', 'create', '-o', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', network])
    else {
      const details = JSON.parse(inspect.stdout) as { Options?: Record<string, string> }[]
      if (details.length !== 1 || details[0].Options?.['com.docker.network.bridge.host_binding_ipv4'] !== '127.0.0.1') {
        throw new Error('Docker network is not loopback bound')
      }
    }
    try {
      run(cli, ['start', '--network-id', network, '--exclude', 'vector,logflare'])
      status()
    } catch (error) {
      try { run(cli, ['stop']) } catch { /* Report original start or binding failure. */ }
      throw error
    }
    console.log('Local Supabase started; private environment refreshed')
  } else if (command === 'stop') { run(cli, ['stop']); console.log('Local Supabase stopped; data retained') }
  else if (command === 'status') { status(); console.log('Local Supabase ready; private environment refreshed') }
  else if (command === 'migrate') { status(); run(cli, ['migration', 'up', '--local']); console.log('Pending local migrations applied') }
  else if (command === 'admin-init') { await adminInit(); console.log('Fixed local admin verified') }
  else throw new Error('Use start, stop, status, migrate, or admin-init')
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local Supabase command failed')
  process.exitCode = 1
}
