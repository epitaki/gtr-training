import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScoreAttackState } from '../../game/scoreAttack/types'
import { saveScoreAttackGame, setScoreAttackFavorite, type SavedScoreAttackGame } from '../../lib/scoreAttackHistory'

export function useScoreAttackSave(state: ScoreAttackState, runId: string, ownerId: string | null, userId?: string) {
  const [revision, setRevision] = useState(0)
  const [saved, setSaved] = useState<SavedScoreAttackGame | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const current = useRef({ runId, userId, active: true })
  current.current = { runId, userId, active: true }
  useEffect(() => { current.current.active = true; return () => { current.current.active = false } }, [])
  useEffect(() => {
    let active = true
    setSaved(null); setError(null); setFavoriteBusy(false)
    if (!state.finished || state.totalScore === null || !ownerId || ownerId !== userId) { setStatus('idle'); return }
    setStatus('saving')
    void saveScoreAttackGame(runId, state, ownerId).then(game => {
      if (active) { setSaved(game); setStatus('saved') }
    }, caught => { if (active) { setError(caught instanceof Error ? caught.message : '保存できませんでした'); setStatus('error') } })
    return () => { active = false }
  }, [state, runId, ownerId, userId, revision])
  const acceptUpdate = useCallback((game: SavedScoreAttackGame) => setSaved(old => old?.id === game.id ? game : old), [])
  const toggleFavorite = async () => {
    if (!saved || saved.id !== runId || !userId || ownerId !== userId || favoriteBusy) return
    const expected = { runId, userId }, id = saved.id
    setFavoriteBusy(true); setError(null)
    const applicable = () => current.current.active && current.current.runId === expected.runId && current.current.userId === expected.userId
    try { const game = await setScoreAttackFavorite(id, !saved.favorite, userId); if (applicable()) acceptUpdate(game) }
    catch (caught) { if (applicable()) setError(caught instanceof Error ? caught.message : 'お気に入りを更新できませんでした') }
    finally { if (applicable()) setFavoriteBusy(false) }
  }
  return { saved, status, error, favoriteBusy, toggleFavorite, acceptUpdate, retry: () => setRevision(old => old + 1) }
}
