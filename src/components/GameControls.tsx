interface GameControlsProps { guided?: boolean }

const keyData: Record<string, { key: string; code: string; keyCode: number }> = {
  left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 }, right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }, rewind: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  z: { key: 'z', code: 'KeyZ', keyCode: 90 }, x: { key: 'x', code: 'KeyX', keyCode: 88 },
  space: { key: ' ', code: 'Space', keyCode: 32 }, escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  guide: { key: 'g', code: 'KeyG', keyCode: 71 }
}

function emit(id: string, type: 'keydown' | 'keyup') {
  const data = keyData[id]
  const event = new KeyboardEvent(type, { key: data.key, code: data.code, bubbles: true, cancelable: true })
  // Phaser 3.90 indexes registered keys by the legacy numeric keyCode.
  Object.defineProperties(event, {
    keyCode: { get: () => data.keyCode },
    which: { get: () => data.keyCode }
  })
  window.dispatchEvent(event)
}

export default function GameControls({ guided = false }: GameControlsProps) {
  const button = (id: string, label: string, aria: string) => (
    <button key={id} type="button" aria-label={aria}
      onPointerDown={event => { event.preventDefault(); emit(id, 'keydown') }}
      onPointerUp={() => emit(id, 'keyup')} onPointerCancel={() => emit(id, 'keyup')} onPointerLeave={() => emit(id, 'keyup')}
      className="min-h-12 min-w-12 select-none rounded-xl border border-white/10 bg-white/10 px-3 text-sm font-black text-white active:bg-violet-500">
      {label}
    </button>
  )

  return (
    <div className="sticky left-0 mt-3 w-[calc(100vw-2.5rem)] max-w-lg rounded-2xl border border-white/10 bg-black/20 p-3 md:hidden" aria-label="ゲーム操作">
      <div className="flex items-center justify-center gap-2">
        {button('left', '←', '左へ移動')}{button('down', '↓', '下へ移動')}{button('right', '→', '右へ移動')}
        {button('z', '↶', '左回転')}{button('x', '↷', '右回転')}
      </div>
      <div className="mt-2 flex items-center justify-center gap-2">
        {guided && button('rewind', '戻す', '一手戻す')}{guided && button('guide', 'ガイド', 'ガイド切り替え')}
        {button('space', '評価', 'GTRを評価または再挑戦')}{button('escape', '終了', 'ゲームを終了')}
      </div>
    </div>
  )
}
