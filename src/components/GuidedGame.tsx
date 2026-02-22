import { useEffect, useRef } from 'react'
import { GameManager } from '../game/GameManager'

interface GuidedGameProps {
  onExit: () => void
}

export default function GuidedGame({ onExit }: GuidedGameProps) {
  const gameManagerRef = useRef<GameManager | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gameManagerRef.current = new GameManager()

    if (gameManagerRef.current) {
      (gameManagerRef.current as any).onExit = onExit
    }

    const timer = setTimeout(() => {
      gameManagerRef.current?.startGuidedPractice()
    }, 200)

    return () => {
      clearTimeout(timer)
      gameManagerRef.current?.destroy()
      gameManagerRef.current = undefined
    }
  }, [onExit])

  return (
    <div className="flex items-center justify-center py-4 min-h-[calc(100vh-6rem)] bg-gray-900">
      <div
        ref={containerRef}
        id="phaser-game"
        className="rounded-lg overflow-hidden shadow-2xl border border-gray-700"
        style={{ width: 900, height: 800 }}
      />
    </div>
  )
}
