import { supabase } from './supabase'
import { publicSupabaseKey, validSupabaseUrl } from './supabaseConfig'

export interface ConnectionResult {
  connected: boolean
  kind: 'ok' | 'configuration' | 'network' | 'authorization' | 'service'
  error?: string
  details?: string
}

export function checkEnvironmentVariables() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  const localdev = import.meta.env.DEV && import.meta.env.MODE === 'localdev'
  return {
    hasUrl: !!url,
    hasKey: !!key,
    urlFormat: validSupabaseUrl(url, localdev),
    keyFormat: publicSupabaseKey(key),
  }
}

export async function testSupabaseConnection(): Promise<ConnectionResult> {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!validSupabaseUrl(url, import.meta.env.DEV && import.meta.env.MODE === 'localdev') || !publicSupabaseKey(key) || !supabase) {
    return { connected: false, kind: 'configuration', error: 'Supabaseの公開設定が不足または不正です' }
  }
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/health`, {
      headers: { apikey: key }, cache: 'no-store', signal: AbortSignal.timeout(5000),
    })
    if (response.ok) return { connected: true, kind: 'ok', details: 'Supabase Authに接続できました' }
    if (response.status === 401 || response.status === 403) {
      return { connected: false, kind: 'authorization', error: '公開キーが認証サービスに拒否されました' }
    }
    return { connected: false, kind: 'service', error: '認証サービスが正常な応答を返しませんでした' }
  } catch {
    return { connected: false, kind: 'network', error: '認証サービスへ接続できませんでした' }
  }
}
