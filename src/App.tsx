import { useState } from 'react'
import MainLayout from './components/layout/MainLayout'
import TopPage from './components/TopPage'
import GuidedGame from './components/GuidedGame'
import ScoreAttackGame from './components/ScoreAttackGame'

type GameMode = 'top' | 'guided' | 'score-attack' | 'battle' | 'stats'

function App() {
  const [currentMode, setCurrentMode] = useState<GameMode>('top')

  const handleSelectMode = (mode: string) => {
    setCurrentMode(mode as GameMode)
  }

  const handleLogoClick = () => {
    setCurrentMode('top')
  }

  const handleExitGame = () => {
    console.log('Exiting game, returning to top page')
    setCurrentMode('top')
  }

  // コンテンツエリアのレンダリング
  const renderContent = () => {
    switch (currentMode) {
      case 'top':
        return <TopPage onSelectMode={handleSelectMode} />
      case 'guided':
        return <GuidedGame onExit={handleExitGame} />
      case 'score-attack':
        return <ScoreAttackGame onExit={handleExitGame} />
      case 'battle':
        return (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">⚔️</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              対戦モード
            </h2>
            <p className="text-gray-600">この機能は開発中です</p>
          </div>
        )
      case 'stats':
        return (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              統計情報
            </h2>
            <p className="text-gray-600">この機能は開発中です</p>
          </div>
        )
      default:
        return <TopPage onSelectMode={handleSelectMode} />
    }
  }

  return (
    <MainLayout
      currentMode={currentMode}
      onSelectMode={handleSelectMode}
      onLogoClick={handleLogoClick}
    >
      {renderContent()}
    </MainLayout>
  )
}

export default App