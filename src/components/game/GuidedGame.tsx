import type { PairColors } from '../../game/core/PairSequence'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GameManager } from '../../game/GameManager'
import {
  GTR_REPORT_CLOSE_EVENT,
  GTR_CHAIN_RESOLUTION_ENDED_EVENT,
  GTR_REPORT_READY_EVENT,
  GTR_REPORT_UNAVAILABLE_EVENT,
  GTR_REPORT_REQUEST_EVENT,
  GTR_REPORT_SCENE_READY_EVENT,
  GTR_REPLAY_RESUME_EVENT,
  getRotationLabel,
  readGTRReplayFromLocation,
  type GTRIssueSnapshot,
  type GTRReportUnavailableDetail,
} from '../../game/feedback/GTRIssueReport'
import GameControls from './GameControls'
import GTRIssueReportPanel from '../feedback/GTRIssueReportPanel'
import { reportStatusForEvent } from './reportStatus'
import KeySettings from '../settings/KeySettings'
import { actionKeys } from '../../game/input/bindings'
import { getBindings, getSettingsNotice, subscribeBindings } from '../../game/input/settings'
import { focusGameCanvas, pressToolbarAction, restoreFocusOnResume } from './gameFocus'

interface GuidedGameProps {
  practiceSequence?: readonly PairColors[]
  onExit: () => void
  suspended: boolean
}

export default function GuidedGame({ onExit, suspended, practiceSequence }: GuidedGameProps) {
  const gameManagerRef = useRef<GameManager | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const replaySource = useRef(readGTRReplayFromLocation())
  const [reportSnapshot, setReportSnapshot] = useState<GTRIssueSnapshot | null>(null)
  const [reportReady, setReportReady] = useState(false)
  const [reportStatus, setReportStatus] = useState('')
  const [replayInspection, setReplayInspection] = useState(() => Boolean(replaySource.current))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsNotice, setSettingsNotice] = useState(getSettingsNotice())
  const [shareKeys, setShareKeys] = useState(() => actionKeys(getBindings(), 'share'))
  const reportedAdvice = replaySource.current?.sourceAnalysis?.advice?.bestPlacement
  const suspendedRef = useRef(suspended)
  suspendedRef.current = suspended || settingsOpen
  const wasSuspendedRef = useRef(suspended || settingsOpen)
  const reportOpenRef = useRef(Boolean(reportSnapshot))
  reportOpenRef.current = Boolean(reportSnapshot)

  useLayoutEffect(() => {
    const stopped = suspended || settingsOpen
    gameManagerRef.current?.setSuspended(stopped)
    restoreFocusOnResume(wasSuspendedRef.current, stopped, focusGameSurface)
    wasSuspendedRef.current = stopped
  }, [suspended, settingsOpen])
  useEffect(() => subscribeBindings(() => setShareKeys(actionKeys(getBindings(), 'share'))), [])

  const requestReport = useCallback(() => {
    setReportStatus(reportStatusForEvent('request'))
    window.dispatchEvent(new Event(GTR_REPORT_REQUEST_EVENT))
  }, [])

  const focusGameSurface = useCallback(() => {
    focusGameCanvas(containerRef.current, () => !suspendedRef.current && !reportOpenRef.current)
  }, [])

  const closeReport = useCallback(() => {
    setReportSnapshot(null)
    window.dispatchEvent(new Event(GTR_REPORT_CLOSE_EVENT))
    focusGameSurface()
  }, [focusGameSurface])

  const resumeReplay = useCallback(() => {
    setReplayInspection(false)
    window.dispatchEvent(new Event(GTR_REPLAY_RESUME_EVENT))
    focusGameSurface()
  }, [focusGameSurface])

  const captureScreenshot = useCallback(() => {
    const manager = gameManagerRef.current
    return manager
      ? manager.captureScreenshot()
      : Promise.reject(new Error('ゲーム画面の準備ができていません'))
  }, [])

  useEffect(() => {
    const handleReportReady = (event: Event) => {
      setReportStatus(reportStatusForEvent('ready'))
      setReportSnapshot((event as CustomEvent<GTRIssueSnapshot>).detail)
    }
    const handleReportUnavailable = (event: Event) => {
      if ((event as CustomEvent<GTRReportUnavailableDetail>).detail?.reason === 'chain-resolving') {
        setReportStatus(reportStatusForEvent('chain-resolving'))
      }
    }
    const handleSceneReady = () => setReportReady(true)
    const handleChainEnded = () => setReportStatus(reportStatusForEvent('chain-ended'))
    window.addEventListener(GTR_REPORT_READY_EVENT, handleReportReady)
    window.addEventListener(GTR_REPORT_UNAVAILABLE_EVENT, handleReportUnavailable)
    window.addEventListener(GTR_REPORT_SCENE_READY_EVENT, handleSceneReady)
    window.addEventListener(GTR_CHAIN_RESOLUTION_ENDED_EVENT, handleChainEnded)

    gameManagerRef.current = new GameManager()
    gameManagerRef.current.setSuspended(suspendedRef.current)

    if (gameManagerRef.current) {
      (gameManagerRef.current as any).onExit = onExit
    }

    const timer = setTimeout(() => {
      gameManagerRef.current?.setSuspended(suspendedRef.current)
      gameManagerRef.current?.startGuidedPractice(practiceSequence)
    }, 200)

    return () => {
      clearTimeout(timer)
      window.removeEventListener(GTR_REPORT_READY_EVENT, handleReportReady)
      window.removeEventListener(GTR_REPORT_UNAVAILABLE_EVENT, handleReportUnavailable)
      window.removeEventListener(GTR_REPORT_SCENE_READY_EVENT, handleSceneReady)
      window.removeEventListener(GTR_CHAIN_RESOLUTION_ENDED_EVENT, handleChainEnded)
      window.dispatchEvent(new Event(GTR_REPORT_CLOSE_EVENT))
      gameManagerRef.current?.destroy()
      gameManagerRef.current = undefined
    }
  }, [onExit, practiceSequence])

  return (
    <div className="min-h-[calc(100vh-8rem)] rounded-none bg-[#171426] p-3 shadow-pixel sm:p-4">
      {replayInspection && replaySource.current?.sourceAnalysis && (
        <div
          data-gtr-replay-source
          className="sticky left-0 z-20 mx-auto mb-2 w-full max-w-[900px] rounded-none border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs text-[#ffe99b]"
        >
          報告時 v{replaySource.current.sourceAnalysis.appVersion}：推薦{' '}
          {reportedAdvice
            ? `${reportedAdvice.placement.column + 1}列・${getRotationLabel(reportedAdvice.placement.rotation)}向き（score=${reportedAdvice.totalScore.toFixed(1)}）`
            : 'なし'}
          <span className="ml-2 text-[#c4bfd3]">現在のロジックによる推薦はガイド表示で比較できます。</span>
        </div>
      )}
      <div
        className="mx-auto mb-3 hidden max-w-[900px] flex-wrap items-center justify-end gap-2 md:flex"
        onKeyDown={event => event.stopPropagation()}
        onKeyUp={event => event.stopPropagation()}
      >
        {replayInspection && (
          <button
            type="button"
            onClick={resumeReplay}
            disabled={!reportReady}
            className="mr-2 rounded-none border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm font-normal text-[#91ecc2] hover:bg-emerald-400/20 disabled:cursor-wait disabled:opacity-40"
          >
            この状態から操作を再開
          </button>
        )}
        <button
          type="button"
          onClick={requestReport}
          disabled={!reportReady}
          className="rounded-none border border-[#6f648d] bg-[#b5a8ff] px-4 py-2 text-sm font-normal text-[#0c0a14] hover:bg-[#b5a8ff] disabled:cursor-wait disabled:opacity-40"
        >
          この手順を共有 <span className="ml-1 text-xs text-inherit">{shareKeys}</span>
        </button>
        <button type="button" onClick={() => setSettingsOpen(true)} className="ml-2 rounded-none bg-[#b5a8ff] px-4 py-2 text-sm font-normal text-[#0c0a14]">キー設定</button>
        <button type="button" onClick={() => pressToolbarAction(gameManagerRef.current, 'pause', 'button:pause', focusGameSurface)} className="ml-2 rounded-none bg-[#211d33] px-4 py-2 text-sm font-normal text-white">停止／再開</button>
        <button type="button" onClick={() => { gameManagerRef.current?.pressAction('exit', 'button:exit'); gameManagerRef.current?.releaseAction('button:exit') }} className="ml-2 rounded-none bg-rose-800 px-4 py-2 text-sm font-normal text-white">終了</button>
      </div>
      <div className="canvas-scroll">
      <div
        ref={containerRef}
        id="phaser-game"
        tabIndex={-1}
        className="overflow-hidden rounded-none border border-[#6f648d] shadow-pixel focus:outline-none"
        style={{ width: 900, height: 800 }}
      />
      </div>
      {reportStatus && <p role="status" aria-live="polite" className="mx-auto mb-2 max-w-[900px] text-sm text-[#ffe99b]">{reportStatus}</p>}
      {settingsNotice && <p role="status" className="mx-auto max-w-[900px] text-sm text-[#ffe99b]">{settingsNotice}</p>}
      <div
        className="sticky left-0 mt-3 flex w-full max-w-lg flex-wrap justify-end gap-2 md:hidden"
        onKeyDown={event => event.stopPropagation()}
        onKeyUp={event => event.stopPropagation()}
      >
        {replayInspection && (
          <button
            type="button"
            onClick={resumeReplay}
            disabled={!reportReady}
            className="rounded-none border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-xs font-normal text-[#91ecc2] disabled:cursor-wait disabled:opacity-40"
          >
            操作を再開
          </button>
        )}
        <button
          type="button"
          onClick={requestReport}
          disabled={!reportReady}
          className="rounded-none border border-[#6f648d] bg-[#b5a8ff] px-3 py-2 text-xs font-normal text-[#0c0a14] disabled:cursor-wait disabled:opacity-40"
        >
          この手順を共有
        </button>
      </div>
      <GameControls guided manager={gameManagerRef} />
      <button type="button" onClick={() => setSettingsOpen(true)} className="mt-2 rounded-none bg-[#b5a8ff] px-3 py-2 text-[#0c0a14] md:hidden">キー設定</button>
      {settingsOpen && <KeySettings onClose={() => { setSettingsOpen(false); setSettingsNotice(getSettingsNotice()); focusGameSurface() }} />}
      {reportSnapshot && (
        <GTRIssueReportPanel
          snapshot={reportSnapshot}
          onClose={closeReport}
          onRefresh={requestReport}
          captureScreenshot={captureScreenshot}
        />
      )}
    </div>
  )
}
