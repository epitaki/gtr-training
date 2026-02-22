import { useEffect, useRef } from 'react'
import { GameManager } from '../game/GameManager'

interface GameBoardProps {
  width: number
  height: number
  className?: string
}

export default function GameBoard({ width, height, className = '' }: GameBoardProps) {
  const gameManagerRef = useRef<GameManager>()

  useEffect(() => {
    console.log('GameBoard useEffect called')
    
    console.log('Initializing GameBoard')
    gameManagerRef.current = new GameManager()
    
    // 少し遅延を入れてからゲームを開始（DOM要素が確実に存在するため）
    const timer = setTimeout(() => {
      console.log('Starting game after delay')
      const element = document.getElementById('phaser-game')
      console.log('Target DOM element:', element)
      gameManagerRef.current?.start()
    }, 200)

    return () => {
      console.log('GameBoard cleanup')
      clearTimeout(timer)
      gameManagerRef.current?.destroy()
      gameManagerRef.current = undefined
    }
  }, [])

  return (
    <div className={`bg-black rounded-lg overflow-hidden ${className}`}>
      <div
        id="phaser-game"
        style={{ width, height }}
        className="mx-auto flex justify-center items-center"
      />
    </div>
  )
}