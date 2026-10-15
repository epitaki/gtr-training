import { supabase } from '../lib/supabase'
import { oauthHashStorageKey } from '../lib/supabaseConfig'

const HASH_KEY = oauthHashStorageKey(import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://unconfigured.invalid', import.meta.env.MODE)
export type CallbackResult = 'absent' | 'success'
let pending: Promise<CallbackResult> | null = null

function isOAuthReturn(params: URLSearchParams): boolean {
  // Provider failures can return to the Site URL without our redirect marker.
  return params.get('auth_callback') === '1' || (params.has('error') && params.has('error_code'))
}

export function preserveReplayHash(): void {
  try {
    if (location.hash) sessionStorage.setItem(HASH_KEY, location.hash)
    else sessionStorage.removeItem(HASH_KEY)
  } catch { /* Storage is optional; OAuth must remain available. */ }
}

export function restoreReplayHashBeforeApp(): void {
  const params = new URLSearchParams(location.search)
  if (!isOAuthReturn(params)) return
  let hash: string | null = null
  try { hash = sessionStorage.getItem(HASH_KEY); sessionStorage.removeItem(HASH_KEY) }
  catch { /* Keep the callback usable when storage is blocked. */ }
  if (hash && !location.hash) history.replaceState(null, '', `${location.pathname}${location.search}${hash}`)
}

export function processOAuthCallback(): Promise<CallbackResult> {
  if (pending) return pending
  const params = new URLSearchParams(location.search)
  if (!isOAuthReturn(params)) return Promise.resolve('absent')
  pending = (async () => {
    const code = params.get('code')
    const error = params.get('error_description') || params.get('error')
    for (const name of ['auth_callback', 'code', 'error', 'error_code', 'error_description']) params.delete(name)
    const query = params.toString()
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`)
    if (error) throw new Error(error)
    if (!code || !supabase) throw new Error('ログインを完了できませんでした')
    const result = await supabase.auth.exchangeCodeForSession(code)
    if (result.error) throw result.error
    if (!result.data.session) throw new Error('ログインを完了できませんでした')
    return 'success' as const
  })()
  return pending
}
