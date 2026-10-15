import type { User } from '@supabase/supabase-js'
import { supabase, localSupabase } from '../lib/supabase'
import { LOCAL_ADMIN_EMAIL, LOCAL_ADMIN_ID } from '../lib/supabaseConfig'
import { avatarUrl } from './avatarStorage'
import { preserveReplayHash } from './oauthCallback'

export interface AccountProfile {
  id: string
  display_name: string
  role: 'user' | 'admin'
  avatar_path?: string | null
  avatar_url?: string | null
  provider?: string
  environment: string
}

export function providerOf(user: User): string | undefined {
  return user.app_metadata?.provider || user.identities?.[0]?.provider
}

export function isLocalAdmin(user: User, profile: Pick<AccountProfile, 'role'>): boolean {
  return localSupabase && user.id === LOCAL_ADMIN_ID && user.email === LOCAL_ADMIN_EMAIL &&
    user.app_metadata?.gtr_local_admin === true && profile.role === 'admin'
}

export async function readProfile(user: User): Promise<AccountProfile> {
  if (!supabase) throw new Error('Supabaseが設定されていません')
  const { data, error } = await supabase.from('profiles').select('id,display_name,avatar_path,role').eq('id', user.id).single()
  if (error) throw error
  return { id: data.id, display_name: data.display_name, avatar_path: data.avatar_path, avatar_url: await avatarUrl(data.avatar_path),
    role: data.role, provider: isLocalAdmin(user, data) ? 'ローカル管理者' : providerOf(user),
    environment: `${import.meta.env.MODE}:${new URL(import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://unconfigured.invalid').origin}` }
}

export async function startOAuth(provider: 'google' | 'github'): Promise<void> {
  if (!supabase) throw new Error('Supabaseが設定されていません')
  preserveReplayHash()
  const redirectTo = `${location.origin}${location.pathname}?auth_callback=1`
  const result = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })
  if (result.error) throw result.error
}

export async function localAvailable(): Promise<boolean> {
  if (!localSupabase || !supabase) return false
  try {
    const response = await fetch('/api/local-auth/bootstrap', { cache: 'no-store' })
    return response.ok && response.headers.get('content-type')?.includes('application/json') === true
  } catch { return false }
}

export async function localLogin(): Promise<void> {
  if (!localSupabase || !supabase) throw new Error('ローカル管理者は利用できません')
  const bootstrap = await fetch('/api/local-auth/bootstrap', { cache: 'no-store' })
  if (!bootstrap.ok || !bootstrap.headers.get('content-type')?.includes('application/json')) throw new Error('ローカル管理者は利用できません')
  const state = await bootstrap.json() as { csrf?: string }
  if (!state.csrf) throw new Error('ローカル管理者は利用できません')
  const response = await fetch('/api/local-auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GTR-Local-Auth': '1', 'X-GTR-CSRF': state.csrf },
    body: '{}', cache: 'no-store',
  })
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('ローカル管理者ログインに失敗しました')
  const tokens = await response.json() as { access_token?: string; refresh_token?: string }
  if (!tokens.access_token || !tokens.refresh_token) throw new Error('ローカル管理者ログインに失敗しました')
  const result = await supabase.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token })
  if (result.error || !result.data.user || result.data.user.role !== 'authenticated' || !isLocalAdmin(result.data.user, { role: 'admin' })) {
    await supabase.auth.signOut({ scope: 'local' })
    throw new Error('ローカル管理者の本人確認に失敗しました')
  }
}

export async function updateName(name: string, id: string): Promise<void> {
  if (!supabase) throw new Error('Supabaseが設定されていません')
  const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', id).select('id').single()
  if (error) throw error
}
