import type { PointerEvent as ReactPointerEvent } from 'react'
import type { GameManager } from '../../game/GameManager'
import type { GameAction } from '../../game/input/bindings'

export class GameControlInput {
  private readonly held = new Set<string>()
  constructor(private readonly manager: () => GameManager | undefined) {}

  press(action: GameAction, event: ReactPointerEvent<HTMLButtonElement>): void {
    event.preventDefault()
    const source = `pointer:${action}:${event.pointerId}`
    event.currentTarget.setPointerCapture(event.pointerId)
    if (this.held.has(source)) return
    this.held.add(source)
    this.manager()?.pressAction(action, source)
  }

  release(action: GameAction, pointerId: number): void {
    const source = `pointer:${action}:${pointerId}`
    if (!this.held.delete(source)) return
    this.manager()?.releaseAction(source)
  }

  releaseAll(): void {
    for (const source of this.held) this.manager()?.releaseAction(source)
    this.held.clear()
  }
}

export function pointerHandlers(input: GameControlInput, action: GameAction) {
  const release = (event: ReactPointerEvent<HTMLButtonElement>) => input.release(action, event.pointerId)
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => input.press(action, event),
    onPointerUp: release,
    onPointerCancel: release,
    onPointerLeave: release,
    onLostPointerCapture: release,
  }
}

export function attachGameControlRelease(input: GameControlInput): () => void {
  const release = () => input.releaseAll()
  const hidden = () => { if (document.hidden) release() }
  window.addEventListener('blur', release)
  document.addEventListener('visibilitychange', hidden)
  return () => {
    release()
    window.removeEventListener('blur', release)
    document.removeEventListener('visibilitychange', hidden)
  }
}
