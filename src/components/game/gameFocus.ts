/** Restore keyboard focus after a React control or an external view closes. */
import type { GameManager } from '../../game/GameManager'
import type { GameAction } from '../../game/input/bindings'

export function focusGameCanvas(container: HTMLElement | null, mayFocus: () => boolean): void {
  requestAnimationFrame(() => {
    if (!mayFocus() || document.hidden) return
    container?.querySelector('canvas')?.focus({ preventScroll: true })
  })
}

export function restoreFocusOnResume(wasStopped: boolean, isStopped: boolean, focus: () => void): void {
  if (wasStopped && !isStopped) focus()
}

export function pressToolbarAction(manager: GameManager | undefined, action: GameAction,
  source: string, focus: () => void): void {
  manager?.pressAction(action, source)
  manager?.releaseAction(source)
  focus()
}
