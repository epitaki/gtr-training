import { LOCAL_SUPABASE_URL, publicSupabaseKey, serviceRoleSupabaseKey } from '../../src/lib/supabaseConfig'

export type LocalEnvironment = Record<'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY' | 'LOCAL_SUPABASE_SERVICE_ROLE_KEY', string>
export const LOCAL_ENV_NAMES = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'LOCAL_SUPABASE_SERVICE_ROLE_KEY'] as const

export function parseGeneratedLocalEnvironment(content: string): LocalEnvironment {
  const entries = Object.fromEntries(Array.from(content.matchAll(/^([A-Z_]+)=(.*)$/gm)).map(match => [match[1], match[2]]))
  if (entries.VITE_SUPABASE_URL !== LOCAL_SUPABASE_URL || !publicSupabaseKey(entries.VITE_SUPABASE_ANON_KEY) ||
      !serviceRoleSupabaseKey(entries.LOCAL_SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error('Local Supabase private environment is invalid')
  }
  return entries as LocalEnvironment
}

export function assertResolvedLocalEnvironment(expected: LocalEnvironment, resolved: Record<string, string | undefined>): void {
  for (const name of LOCAL_ENV_NAMES) {
    if (resolved[name] !== expected[name]) throw new Error('Resolved local Supabase environment does not match generated status')
  }
}
