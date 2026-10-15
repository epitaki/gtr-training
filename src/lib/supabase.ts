import { createClient } from '@supabase/supabase-js'
import { authStorageKey, publicSupabaseKey, validSupabaseUrl } from './supabaseConfig'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const localSupabase = import.meta.env.DEV && import.meta.env.MODE === 'localdev'
export const supabase = validSupabaseUrl(supabaseUrl, localSupabase) && publicSupabaseKey(supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { flowType: 'pkce', detectSessionInUrl: false, storageKey: authStorageKey(supabaseUrl, import.meta.env.MODE) } })
  : null
