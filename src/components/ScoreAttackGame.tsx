import { useEffect, useRef } from 'react'
import { GameManager } from '../game/GameManager'
import GameControls from './GameControls'

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
    <div className="min-h-[calc(100vh-8rem)] overflow-auto rounded-3xl bg-[#171426] p-3 shadow-2xl shadow-indigo-950/20 sm:p-4">
      <div className="flex min-w-max justify-center">
      <div
        ref={containerRef}
        id="phaser-game"
        className="overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
        style={{ width: 640, height: 800 }}
      />
      </div>
      <GameControls />
    </div>
  )
}
