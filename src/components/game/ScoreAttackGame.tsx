import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GameManager } from '../../game/GameManager'
import GameControls from './GameControls'
import KeySettings from '../settings/KeySettings'
import ScoreAttackResults from './ScoreAttackResults'
import { ScoreAttackSession, emptyScoreAttackState } from '../../game/scoreAttack/ScoreAttackSession'
import { ScoreAttackWorker } from '../../game/scoreAttack/ScoreAttackWorker'
import { getSettingsNotice } from '../../game/input/settings'
import { focusGameCanvas, pressToolbarAction, restoreFocusOnResume } from './gameFocus'
import type { SavedScoreAttackGame } from '../../lib/scoreAttackHistory'
import { useScoreAttackSave } from './useScoreAttackSave'

interface ScoreAttackGameProps {
  onExit: () => void
  suspended: boolean
  userId?: string
  savedGameUpdate?: SavedScoreAttackGame
}

export default function ScoreAttackGame({ onExit, suspended, userId, savedGameUpdate }: ScoreAttackGameProps) {
  const gameManagerRef = useRef<GameManager | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<ScoreAttackSession | null>(null)
  const [runRevision, setRunRevision] = useState(0)
  const [progress, setProgress] = useState(emptyScoreAttackState)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsNotice, setSettingsNotice] = useState(getSettingsNotice())
  const [run, setRun] = useState({ id: crypto.randomUUID(), ownerId: null as string | null })
  const userIdRef = useRef(userId)
  userIdRef.current = userId
  const saving = useScoreAttackSave(progress, run.id, run.ownerId, userId)
  useEffect(() => { if (savedGameUpdate) saving.acceptUpdate(savedGameUpdate) }, [savedGameUpdate, saving.acceptUpdate])
  const suspendedRef = useRef(suspended)
  suspendedRef.current = suspended || settingsOpen || progress.finished
  const wasSuspendedRef = useRef(suspended || settingsOpen)
  const focusGameSurface = () => focusGameCanvas(containerRef.current, () => !suspendedRef.current)

  useLayoutEffect(() => {
    const stopped = suspended || settingsOpen || progress.finished
    gameManagerRef.current?.setSuspended(stopped)
    restoreFocusOnResume(wasSuspendedRef.current, stopped, focusGameSurface)
    wasSuspendedRef.current = stopped
  }, [suspended, settingsOpen, progress.finished])

  useEffect(() => {
    const session = new ScoreAttackSession(new ScoreAttackWorker())
    sessionRef.current = session
    setProgress(session.getSnapshot())
    const runId = crypto.randomUUID()
    setRun({ id: runId, ownerId: null })
    const unsubscribe = session.subscribe(() => setProgress(session.getSnapshot()))
    gameManagerRef.current = new GameManager()
    gameManagerRef.current.getScoreAttackTotal = () => {
      const rounds = session.getSnapshot().rounds
      return rounds.some(round => !round.evaluation) ? null
        : rounds.reduce((total, round) => total + round.evaluation!.analysis.score.totalScore, 0)
    }
    gameManagerRef.current.onScoreAttackRound = snapshot => {
      if (!session.getSnapshot().rounds.length) setRun({ id: runId, ownerId: userIdRef.current ?? null })
      session.submit(snapshot)
    }
    gameManagerRef.current.setSuspended(suspendedRef.current)

    gameManagerRef.current.onExit = onExit

    const timer = setTimeout(() => {
      gameManagerRef.current?.setSuspended(suspendedRef.current)
      gameManagerRef.current?.startScoreAttack()
    }, 200)

    return () => {
      clearTimeout(timer)
      unsubscribe()
      session.dispose()
      sessionRef.current = null
      gameManagerRef.current?.destroy()
      gameManagerRef.current = undefined
    }
  }, [onExit, runRevision])

  return (
    <div className="min-h-[calc(100vh-8rem)] rounded-none bg-[#171426] p-3 shadow-pixel sm:p-4">
      <div className={progress.finished ? 'hidden' : ''}>
        <div className="mx-auto mb-3 flex min-h-[44px] max-w-[640px] flex-wrap items-center justify-end gap-1 text-sm sm:gap-2">
          <button type="button" onClick={() => setSettingsOpen(true)} className="rounded-none bg-[#b5a8ff] px-2 py-2 sm:px-3 text-[#0c0a14]">キー設定</button>
          <button type="button" onClick={() => pressToolbarAction(gameManagerRef.current, 'pause', 'button:pause', focusGameSurface)} className="rounded-none bg-[#211d33] px-2 py-2 sm:px-3 text-white">停止／再開</button>
          <button type="button" onClick={() => { gameManagerRef.current?.pressAction('exit', 'button:exit'); gameManagerRef.current?.releaseAction('button:exit') }} className="rounded-none bg-rose-800 px-2 py-2 sm:px-3 text-white">終了</button>
        </div>
        {settingsNotice && <p role="status" className="mx-auto max-w-[640px] text-[#ffe99b]">{settingsNotice}</p>}
        <div className="canvas-scroll">
          <div
            ref={containerRef}
            id="phaser-game"
            className="overflow-hidden rounded-none border border-[#6f648d] shadow-pixel"
            style={{ width: 640, height: 800 }}
          />
        </div>
        <GameControls manager={gameManagerRef} />
      </div>
      {progress.finished && <ScoreAttackResults state={progress} onExit={onExit}
        onRetry={() => sessionRef.current?.retryFailed()}
        onRestart={() => { setProgress(emptyScoreAttackState()); setRunRevision(old => old + 1) }} />}
      {settingsOpen && <KeySettings allowGravityToggle={false} onClose={() => { setSettingsOpen(false); setSettingsNotice(getSettingsNotice()); focusGameSurface() }} />}
      {progress.finished && <div className="mx-auto mt-4 max-w-[800px] border border-[#6f648d] p-4 text-sm">
        {!run.ownerId && <p>ログインしてから始めたゲームは、100ゲームまで保存できます。</p>}
        {run.ownerId && run.ownerId !== userId && <p>ユーザーが変わったため、このゲームは自動保存していません。</p>}
        {saving.status === 'saving' && <p role="status">結果を保存中</p>}
        {saving.status === 'saved' && <p role="status">保存しました。</p>}
        {saving.error && <p role="alert" className="mt-2 text-[#ff9aa5]">{saving.error}</p>}
        {saving.status === 'error' && <button type="button" onClick={saving.retry} className="mt-3 border px-3 py-2">保存をやり直す</button>}
        {saving.saved && <button type="button" aria-pressed={saving.saved.favorite} disabled={saving.favoriteBusy}
          onClick={() => void saving.toggleFavorite()} className="mt-3 border px-3 py-2">{saving.saved.favorite ? '★ お気に入り' : '☆ お気に入り'}</button>}
      </div>}
    </div>
  )
}
