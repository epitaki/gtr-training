import { useEffect, useRef } from 'react'
import { GameManager } from '../game/GameManager'

interface ScoreAttackGameProps {
  onExit: () => void
}

export default function ScoreAttackGame({ onExit }: ScoreAttackGameProps) {
  const gameManagerRef = useRef<GameManager | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gameManagerRef.current = new GameManager()

    if (gameManagerRef.current) {
      (gameManagerRef.current as any).onExit = onExit
    }

    const timer = setTimeout(() => {
      gameManagerRef.current?.startScoreAttack()
    }, 200)

    return () => {
      clearTimeout(timer)
      gameManagerRef.current?.destroy()
      gameManagerRef.current = undefined
    }
  }, [onExit])

  return (
    <div className="flex flex-col items-center justify-center py-4 min-h-[calc(100vh-6rem)] bg-puyo-dark">
      <div className="text-center mb-4 font-puyo">
        <h1 className="text-2xl font-bold text-puyo-yellow">GTR Score Attack</h1>
        <p className="text-purple-300/70 text-sm">Space: 評価 / Esc: メニューへ</p>
      </div>
      <div
        ref={containerRef}
        id="phaser-game"
        className="rounded-2xl overflow-hidden shadow-2xl border-2 border-puyo-red/30"
        style={{ width: 640, height: 800 }}
      />
    </div>
  )
}
