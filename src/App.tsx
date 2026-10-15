import { useCallback, useEffect, useRef, useState } from 'react'
import MainLayout from './components/layout/MainLayout'
import TopPage from './components/TopPage'
import GuidedGame from './components/game/GuidedGame'
import ScoreAttackGame from './components/game/ScoreAttackGame'
import SavedGamesPage from './components/game/SavedGamesPage'
import CompletionGallery from './components/gallery/CompletionGallery'
import { clearGTRReplayHash, readGTRReplayResultFromLocation } from './game/feedback/GTRIssueReport'
import AccountDialog from './components/account/AccountDialog'
import type { PairColors } from './game/core/PairSequence'
import type { SavedScoreAttackGame } from './lib/scoreAttackHistory'
import { useAccount } from './auth/useAccount'

export type GameMode = 'top' | 'guided' | 'score-attack' | 'battle' | 'stats'
export type MenuMode = GameMode | 'gallery' | 'history'

function App() {
  const account = useAccount()
  const accountIdentity = `${account.profile?.environment}:${account.profile?.id || 'guest'}`
  const [historyUpdate, setHistoryUpdate] = useState<{ identity: string; game: SavedScoreAttackGame } | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountButton = useRef<HTMLElement | null>(null)
  const closeAccount = useCallback(() => { setAccountOpen(false); requestAnimationFrame(() => accountButton.current?.focus()) }, [])
  const openAccount = useCallback(() => { accountButton.current = document.activeElement as HTMLElement; setAccountOpen(true) }, [])
  const initialReplay = useRef(readGTRReplayResultFromLocation())
  const [currentMode, setCurrentMode] = useState<GameMode>(() => (
    initialReplay.current.status === 'valid' ? 'guided' : 'top'
  ))
  const [replayError, setReplayError] = useState<string | null>(() => (
    initialReplay.current.status === 'invalid' ? initialReplay.current.message : null
  ))
  const [practiceSequence, setPracticeSequence] = useState<readonly PairColors[] | undefined>()
  const [replayRevision, setReplayRevision] = useState(0)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const replaySession = useRef(initialReplay.current.status === 'valid')

  useEffect(() => {
    const handleReplayUrl = () => {
      const result = readGTRReplayResultFromLocation()
      setPracticeSequence(undefined)
      setGalleryOpen(false)
      setHistoryOpen(false)
      if (result.status === 'valid') {
        replaySession.current = true
        setReplayError(null)
        setCurrentMode('guided')
        setReplayRevision(revision => revision + 1)
      } else if (result.status === 'invalid') {
        replaySession.current = false
        setReplayError(result.message)
        setCurrentMode('top')
        setReplayRevision(revision => revision + 1)
      } else if (replaySession.current) {
        replaySession.current = false
        setReplayError(null)
        setCurrentMode('top')
        setReplayRevision(revision => revision + 1)
      } else {
        setReplayError(null)
      }
    }
    window.addEventListener('hashchange', handleReplayUrl)
    return () => window.removeEventListener('hashchange', handleReplayUrl)
  }, [])

  const handleSelectMode = (mode: MenuMode) => {
    if (mode === 'gallery') { setHistoryOpen(false); setGalleryOpen(true); return }
    if (mode === 'history') { setGalleryOpen(false); setHistoryOpen(true); return }
    if ((galleryOpen || historyOpen) && mode === currentMode) { setGalleryOpen(false); setHistoryOpen(false); return }
    setGalleryOpen(false)
    setHistoryOpen(false)
    setReplayError(null)
    replaySession.current = false
    setPracticeSequence(undefined)
    clearGTRReplayHash()
    if (mode === 'guided') setReplayRevision(revision => revision + 1)
    setCurrentMode(mode)
  }

  const handleLogoClick = () => {
    setGalleryOpen(false)
    setHistoryOpen(false)
    setReplayError(null)
    replaySession.current = false
    setPracticeSequence(undefined)
    clearGTRReplayHash()
    setCurrentMode('top')
  }

  const handleExitGame = useCallback(() => {
    console.log('Exiting game, returning to top page')
    replaySession.current = false
    setPracticeSequence(undefined)
    setReplayError(null)
    clearGTRReplayHash()
    setCurrentMode('top')
  }, [])

  const handlePracticeSequence = (sequence: readonly PairColors[]) => {
    clearGTRReplayHash()
    replaySession.current = false
    setReplayError(null)
    setPracticeSequence(sequence)
    setGalleryOpen(false)
    setHistoryOpen(false)
    setReplayRevision(revision => revision + 1)
    setCurrentMode('guided')
  }

  // コンテンツエリアのレンダリング
  const renderContent = () => {
    if (replayError) {
      return (
        <div role="alert" className="mx-auto max-w-xl rounded-none border border-rose-400/30 bg-rose-400/10 p-6 text-center font-puyo">
          <h2 className="text-xl font-normal text-[#ff9aa5]">再現URLを開けません</h2>
          <p className="mt-3 text-sm text-[#c4bfd3]">{replayError}</p>
          <p className="mt-2 text-xs text-[#c4bfd3]">URLが途中で切れていないか、共有元からもう一度コピーしてください。</p>
          <button
            type="button"
            onClick={() => {
              clearGTRReplayHash()
              setReplayError(null)
              setCurrentMode('top')
            }}
            className="mt-5 rounded-none bg-rose-400 px-4 py-2 text-sm font-normal text-[#171426] hover:bg-rose-300"
          >
            ホームへ戻る
          </button>
        </div>
      )
    }
    switch (currentMode) {
      case 'top':
        return <TopPage onSelectMode={handleSelectMode} />
      case 'guided':
        return <GuidedGame key={replayRevision} practiceSequence={practiceSequence} onExit={handleExitGame} suspended={galleryOpen || historyOpen || accountOpen} />
      case 'score-attack':
        return <ScoreAttackGame onExit={handleExitGame} suspended={galleryOpen || historyOpen || accountOpen} userId={account.profile?.id} savedGameUpdate={historyUpdate?.identity === accountIdentity ? historyUpdate.game : undefined} />
      case 'battle':
        return (
          <div className="text-center py-12 font-puyo">
            <div className="text-6xl mb-4">⚔️</div>
            <h2 className="text-2xl font-normal text-puyo-dark mb-2">
              対戦モード
            </h2>
            <p className="text-puyo-dark/50">この機能は開発中です</p>
          </div>
        )
      case 'stats':
        return (
          <div className="text-center py-12 font-puyo">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-2xl font-normal text-puyo-dark mb-2">
              統計情報
            </h2>
            <p className="text-puyo-dark/50">この機能は開発中です</p>
          </div>
        )
      default:
        return <TopPage onSelectMode={handleSelectMode} />
    }
  }

  return (
    <MainLayout
      currentMode={historyOpen ? 'history' : galleryOpen ? 'gallery' : currentMode}
      onSelectMode={handleSelectMode}
      onLogoClick={handleLogoClick}
      onAccountClick={openAccount}
      accountLabel={account.profile?.display_name || 'ゲスト'}
      accountOpen={accountOpen}
      accountSignedIn={!!account.profile}
      accountAvatarUrl={account.profile?.avatar_url}
    >
      <div hidden={galleryOpen || historyOpen} inert={galleryOpen || historyOpen || accountOpen}>{renderContent()}</div>
      {galleryOpen && <CompletionGallery onReturn={() => setGalleryOpen(false)} returnLabel={currentMode === 'top' ? 'ホームに戻る' : '練習に戻る'} />}
      {historyOpen && <div inert={accountOpen}><SavedGamesPage key={accountIdentity}
        userId={account.profile?.id} checking={account.status === 'loading' && !account.profile}
        onPractice={handlePracticeSequence}
        onChanged={game => setHistoryUpdate({ identity: accountIdentity, game })}
        onLogin={openAccount} onReturn={() => setHistoryOpen(false)} returnLabel={currentMode === 'top' ? 'ホームに戻る' : '練習に戻る'}
        /></div>}
      {accountOpen && <AccountDialog account={account} onClose={closeAccount} />}
    </MainLayout>
  )
}

export default App
