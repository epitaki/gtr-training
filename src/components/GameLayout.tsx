import { ReactNode } from 'react'

interface GameLayoutProps {
  children: ReactNode
  gameTitle: string
  score: number
  timeElapsed: number
  gtrCount: number
}

export default function GameLayout({ 
  children, 
  gameTitle, 
  score, 
  timeElapsed, 
  gtrCount 
}: GameLayoutProps) {
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const centiseconds = Math.floor((ms % 1000) / 10)
    return `${seconds}.${centiseconds.toString().padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-6xl mx-auto">
        {/* ヘッダー */}
        <header className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">{gameTitle}</h1>
            <p className="text-gray-400">ぷよぷよ GTRトレーニング</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-400">スコア</div>
            <div className="text-2xl font-bold text-yellow-400">{score.toLocaleString()}</div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* ゲームエリア */}
          <div className="lg:col-span-3">
            <div className="bg-gray-800 rounded-lg p-4">
              {children}
            </div>
          </div>

          {/* サイドバー */}
          <div className="lg:col-span-1 space-y-4">
            {/* タイマー */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-2">タイム</h3>
              <div className="text-3xl font-mono text-green-400">
                {formatTime(timeElapsed)}
              </div>
            </div>

            {/* GTRカウント */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-2">GTR作成数</h3>
              <div className="text-3xl font-bold text-blue-400">
                {gtrCount}
              </div>
            </div>

            {/* 操作方法 */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-2">操作方法</h3>
              <div className="text-sm space-y-2">
                <div>← → : 移動</div>
                <div>↓ : 落下</div>
                <div>Z : 左回転</div>
                <div>X : 右回転</div>
                <div>Space : リセット</div>
              </div>
            </div>

            {/* GTRとは */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-2">GTRとは？</h3>
              <div className="text-sm space-y-2">
                <p>グレート田中連鎖の略</p>
                <p>2列目と3列目を中心とした効率的な連鎖土台</p>
                <p>上級者の基本技術</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}