import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, localSupabase } from '../lib/supabase'
import { localAvailable, localLogin, readProfile, startOAuth, updateName, type AccountProfile } from './account'
import { resizeAvatar } from './avatarImage'
import { updateAvatar } from './avatarStorage'
import { processOAuthCallback } from './oauthCallback'

export function useAccount() {
  const [profile, setProfile] = useState<AccountProfile | null>(null)
  const [availableLocal, setAvailableLocal] = useState(false)
  const [status, setStatus] = useState<'loading' | 'guest' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const profileRef = useRef<AccountProfile | null>(null)
  const readRevision = useRef(0)
  const saveRevision = useRef(0)
  const pendingSaves = useRef(0)
  const publishProfile = useCallback((next: AccountProfile | null) => {
    profileRef.current = next
    setProfile(next)
  }, [])

  useEffect(() => {
    let active = true
    const version = ++generation.current
    const refresh = async () => {
      try {
        await processOAuthCallback()
        const local = await localAvailable()
        if (active) setAvailableLocal(local)
        if (!active || version !== generation.current) return
        if (supabase) {
          const result = await supabase.auth.getUser()
          if (!active || version !== generation.current) return
          if (result.error && result.error.name !== 'AuthSessionMissingError') throw result.error
          if (result.data.user) {
            const next = await readProfile(result.data.user)
            if (!active || version !== generation.current) return
            publishProfile(next); setStatus('ready'); setError(null); return
          }
        }
        publishProfile(null); setStatus('guest'); setError(null)
      } catch (caught) {
        if (!active || version !== generation.current) return
        publishProfile(null)
        setError(caught instanceof Error ? caught.message : 'ログインを確認できませんでした')
        setStatus('error')
      }
    }
    void refresh()
    const subscription = supabase?.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return
      const existing = profileRef.current
      const identity = session?.user.id
      if (identity && existing?.id === identity) {
        const current = generation.current
        const read = ++readRevision.current
        const save = saveRevision.current
        void readProfile(session.user).then(next => {
          if (active && current === generation.current && read === readRevision.current && save === saveRevision.current && pendingSaves.current === 0 && profileRef.current?.id === identity) {
            publishProfile({ ...next, display_name: profileRef.current.display_name })
          }
        }).catch(() => { /* A verified profile remains usable during background refresh failure. */ })
        return
      }
      const current = ++generation.current
      ++readRevision.current
      publishProfile(null)
      setError(null)
      setStatus(identity ? 'loading' : 'guest')
      if (!session?.user) return
      void readProfile(session.user).then(next => {
        if (active && current === generation.current) { publishProfile(next); setStatus('ready') }
      }).catch(caught => {
        if (active && current === generation.current) {
          setError(caught instanceof Error ? caught.message : 'プロフィールを読めませんでした')
          setStatus('error')
        }
      })
    }).data.subscription
    return () => { active = false; generation.current++; subscription?.unsubscribe() }
  }, [publishProfile])

  const act = useCallback(async (operation: (isCurrent: () => boolean) => Promise<AccountProfile | null>, saving = false) => {
    const version = ++generation.current
    ++readRevision.current
    if (saving) { ++saveRevision.current; ++pendingSaves.current }
    setStatus('loading'); setError(null)
    try {
      const next = await operation(() => version === generation.current)
      if (version === generation.current) { publishProfile(next); setStatus(next ? 'ready' : 'guest') }
    } catch (caught) {
      if (version === generation.current) {
        setError(caught instanceof Error ? caught.message : '処理に失敗しました')
        setStatus(profileRef.current ? 'ready' : 'error')
      }
    } finally {
      if (saving) { --pendingSaves.current; ++saveRevision.current }
    }
  }, [publishProfile])

  return {
    profile, availableLocal, configuredCloud: !!supabase && !localSupabase, status, error,
    loginCloud: startOAuth,
    loginLocal: () => act(async () => {
      await localLogin()
      const result = await supabase!.auth.getUser()
      if (result.error || !result.data.user) throw new Error('ローカル管理者の本人確認に失敗しました')
      return readProfile(result.data.user)
    }),
    saveName: (name: string) => act(async () => {
      const clean = name.trim()
      if (clean.length < 1 || clean.length > 50) throw new Error('表示名は1〜50文字で入力してください')
      const current = profileRef.current
      if (!current) throw new Error('ログインしてください')
      await updateName(clean, current.id)
      return { ...current, display_name: clean }
    }, true),
    saveAvatar: (file: File | null) => act(async isCurrent => {
      const current = profileRef.current
      if (!current) throw new Error('ログインしてください')
      const image = file ? await resizeAvatar(file) : null
      return updateAvatar(current, image, isCurrent)
    }, true),
    logout: () => act(async () => {
      if (supabase) { const result = await supabase.auth.signOut(); if (result.error) throw result.error }
      return null
    }),
  }
}
