import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { LOCAL_ADMIN_EMAIL, LOCAL_ADMIN_ID, LOCAL_SUPABASE_URL, publicSupabaseKey, serviceRoleSupabaseKey } from '../../src/lib/supabaseConfig'
import { mutationAllowed, requestAllowed } from './security'
import { LoginNonces } from './nonce'

const API = '/api/local-auth'
const MAX_BODY = 2048

function json(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.end(JSON.stringify(body))
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = ''
  for await (const chunk of request) {
    body += chunk.toString()
    if (body.length > MAX_BODY) throw new Error('リクエストが大きすぎます')
  }
  const result: unknown = JSON.parse(body)
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('不正な入力です')
  return result as Record<string, unknown>
}

export function fixedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.origin !== LOCAL_SUPABASE_URL || !url.pathname.startsWith('/auth/v1/')) {
    throw new Error('ローカル認証先が不正です')
  }
  return fetch(input, { ...init, redirect: 'manual' }).then(response => {
    if (response.status >= 300 && response.status < 400) throw new Error('ローカル認証先の転送を拒否しました')
    return response
  })
}

export function localAuthPlugin(keys?: { anon: string; serviceRole: string }): Plugin {
  const nonces = new LoginNonces()
  return {
    name: 'local-auth-dev-only',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0]
        if (!path?.startsWith(API)) { next(); return }
        const address = server.httpServer?.address()
        const listen = address && typeof address !== 'string' ? address : null
        if (!requestAllowed(request, listen)) { json(response, 403, { error: 'ローカル専用です' }); return }
        if (path !== `${API}/bootstrap` && path !== `${API}/login`) { json(response, 404, { error: '見つかりません' }); return }
        if (!keys || !publicSupabaseKey(keys.anon) || !serviceRoleSupabaseKey(keys.serviceRole)) {
          json(response, 503, { error: 'ローカル認証設定が不足しています' }); return
        }
        if (request.method === 'GET' && path === `${API}/bootstrap`) {
          json(response, 200, { available: true, csrf: nonces.issue() }); return
        }
        if (request.method !== 'POST' || path !== `${API}/login` || !mutationAllowed(request, request.headers.host!)) {
          json(response, 403, { error: '許可されていません' }); return
        }
        try {
          const body = await readBody(request)
          if (Object.keys(body).length !== 0) { json(response, 400, { error: '不正な入力です' }); return }
          if (!nonces.consume(request.headers['x-gtr-csrf'])) { json(response, 403, { error: 'CSRF確認に失敗しました' }); return }
          const admin = createClient(LOCAL_SUPABASE_URL, keys.serviceRole, {
            auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fixedFetch },
          })
          const publicClient = createClient(LOCAL_SUPABASE_URL, keys.anon, {
            auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fixedFetch },
          })
          const identity = await admin.auth.admin.getUserById(LOCAL_ADMIN_ID)
          const user = identity.data.user
          if (identity.error || !user || user.email !== LOCAL_ADMIN_EMAIL || user.app_metadata?.gtr_local_admin !== true) {
            json(response, 503, { error: 'ローカル管理者を初期化してください' }); return
          }
          const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: LOCAL_ADMIN_EMAIL })
          const tokenHash = link.data.properties?.hashed_token
          if (link.error || !tokenHash) throw new Error('link failed')
          const verified = await publicClient.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
          const session = verified.data.session
          const signedIn = verified.data.user
          if (verified.error || !session || !signedIn || signedIn.id !== LOCAL_ADMIN_ID ||
              signedIn.email !== LOCAL_ADMIN_EMAIL || signedIn.app_metadata?.gtr_local_admin !== true ||
              signedIn.role !== 'authenticated') throw new Error('identity mismatch')
          json(response, 200, { access_token: session.access_token, refresh_token: session.refresh_token })
        } catch {
          json(response, 503, { error: 'ローカル管理者ログインに失敗しました' })
        }
      })
    },
  }
}
