import { supabase } from './supabase'

export async function testSupabaseConnection(): Promise<{
  connected: boolean
  error?: string
  details?: any
}> {
  try {
    // 1. 基本的な接続テスト
    const { data: healthCheck, error: healthError } = await supabase
      .from('profiles')
      .select('count')
      .limit(0)

    if (healthError) {
      // テーブルが存在しない場合は接続は成功
      if (healthError.code === 'PGRST116' || 
          healthError.message?.includes('does not exist') ||
          healthError.message?.includes('relation') && healthError.message?.includes('does not exist')) {
        return {
          connected: true,
          details: 'テーブルが未作成ですが、Supabase接続は成功しています'
        }
      }
      
      return {
        connected: false,
        error: healthError.message,
        details: healthError
      }
    }

    return {
      connected: true,
      details: 'Supabase接続成功'
    }
  } catch (err: any) {
    return {
      connected: false,
      error: err.message || 'Unknown error',
      details: err
    }
  }
}

// 環境変数の確認
export function checkEnvironmentVariables() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY

  return {
    hasUrl: !!url,
    hasKey: !!key,
    urlFormat: url?.startsWith('https://') && url?.includes('.supabase.co'),
    keyFormat: key?.startsWith('eyJ') && key?.length > 100
  }
}