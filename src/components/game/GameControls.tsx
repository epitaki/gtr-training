import { useEffect, useRef } from 'react'
import type { GameManager } from '../../game/GameManager'
import type { GameAction } from '../../game/input/bindings'
import { GameControlInput, attachGameControlRelease, pointerHandlers } from './GameControlInput'

interface GameControlsProps { guided?: boolean; manager: React.RefObject<GameManager | undefined> }

export default function GameControls({ guided = false, manager }: GameControlsProps) {
  const inputRef = useRef<GameControlInput | null>(null)
  if (!inputRef.current) inputRef.current = new GameControlInput(() => manager.current)
  const input = inputRef.current
  useEffect(() => attachGameControlRelease(input), [input])
  const button = (action: GameAction, label: string, aria: string) => (
    <button key={action} type="button" aria-label={aria}
      {...pointerHandlers(input, action)}
      className="min-h-12 min-w-12 select-none rounded-none border border-[#6f648d] bg-[#211d33] px-3 text-sm font-normal text-white active:bg-[#b5a8ff] active:text-[#0c0a14]">
      {label}
    </button>
  )
  return <div className="sticky left-0 mt-3 w-full max-w-lg rounded-none border border-[#6f648d] bg-black/20 p-3 md:hidden" aria-label="ゲーム操作">
    <div className="grid grid-cols-3 gap-2">
      {button('left', '←', '左へ移動')}{button('softDrop', '↓', '高速落下')}{button('right', '→', '右へ移動')}
      {button('rotateLeft', '左回転', '左回転')}{button('rotateRight', '右回転', '右回転')}{button('quickDrop', '落下', 'クイックドロップ')}
    </div>
    <div className="mt-2 grid grid-cols-3 gap-2">
      {guided && button('rewind', '戻す', '一手戻す')}{guided && button('guide', 'ガイド', 'ガイド切り替え')}
      {button('evaluate', '評価', 'GTRを評価または再挑戦')}{button('pause', '停止', 'ポーズ')}{button('exit', '終了', 'ゲームを終了')}
    </div>
  </div>
}
