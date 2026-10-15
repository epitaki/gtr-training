export const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321'
export const LOCAL_ADMIN_ID = '00000000-0000-4000-8000-000000000001'
export const LOCAL_ADMIN_EMAIL = 'systemadmin@gtr.local'

export function validSupabaseUrl(value: string | undefined, localdev = false): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || (localdev && value === LOCAL_SUPABASE_URL)) &&
      !!url.hostname && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/'
  } catch { return false }
}

export function supabaseEnvironmentKey(url: string, mode: string): string {
  if (!validSupabaseUrl(url, mode === 'localdev')) return `${mode}.unconfigured`
  return `${mode}.${encodeURIComponent(new URL(url).origin)}`
}

export function authStorageKey(url: string, mode: string): string {
  return `gtr.supabase.auth.${supabaseEnvironmentKey(url, mode)}`
}

export function oauthHashStorageKey(url: string, mode: string): string {
  return `gtr.oauth.replayHash.${supabaseEnvironmentKey(url, mode)}`
}

export function publicSupabaseKey(value: string | undefined): value is string {
  if (!value) return false
  if (value.startsWith('sb_publishable_')) return value.length > 'sb_publishable_'.length
  if (value.startsWith('sb_secret_')) return false
  const parts = value.split('.')
  if (parts.length !== 3) return false
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }
    return payload.role === 'anon'
  } catch { return false }
}

export function serviceRoleSupabaseKey(value: string | undefined): value is string {
  if (!value) return false
  if (value.startsWith('sb_secret_')) return value.length > 'sb_secret_'.length
  const parts = value.split('.')
  if (parts.length !== 3) return false
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }
    return payload.role === 'service_role'
  } catch { return false }
}
