import { getBindings, subscribeBindings } from './settings'
import { InputController } from './InputController'
import type { GameAction } from './bindings'

function editable(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return Boolean(element?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))
}

function characterCode(code: string): boolean {
  return /^Key[A-Z]$/.test(code) || /^Digit[0-9]$/.test(code) ||
    ['Comma', 'Period', 'Slash', 'Semicolon', 'Quote', 'BracketLeft',
      'BracketRight', 'Minus', 'Equal'].includes(code)
}

export class PhaserInputAdapter extends InputController {
  private readonly cleanup: Array<() => void> = []
  constructor(private readonly canvas: HTMLCanvasElement | null,
    private readonly special?: (code: string) => GameAction | undefined,
    private readonly accepts: (action: GameAction) => boolean = () => true) {
    super(getBindings())
    this.cleanup.push(subscribeBindings(() => this.setBindings(getBindings())))
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229 || event.altKey ||
          ((event.ctrlKey || event.metaKey) && characterCode(event.code)) ||
          editable(event.target) || editable(document.activeElement) || document.hidden || !this.hasGameFocus()) return
      const action = this.special?.(event.code)
      const bound = action ?? this.actionForCode(event.code)
      if (bound && !this.acceptsAction(bound)) {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault()
        return
      }
      if (action) {
        if (!event.repeat) this.press(action, `key:${event.code}`)
        event.preventDefault()
      } else {
        if (bound && this.pressPhysical(event.code, event.repeat)) event.preventDefault()
      }
    }
    const keyup = (event: KeyboardEvent) => this.releasePhysical(event.code)
    const blur = () => this.releaseAll()
    const visibility = () => { if (document.hidden) this.releaseAll() }
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('keyup', keyup, true)
    window.addEventListener('blur', blur)
    this.canvas?.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', visibility)
    this.cleanup.push(() => window.removeEventListener('keydown', keydown, true),
      () => window.removeEventListener('keyup', keyup, true),
      () => window.removeEventListener('blur', blur),
      () => this.canvas?.removeEventListener('blur', blur),
      () => document.removeEventListener('visibilitychange', visibility))
  }

  private hasGameFocus(): boolean {
    const active = document.activeElement
    return active === this.canvas || Boolean(this.canvas?.parentElement && active === this.canvas.parentElement)
  }

  acceptsAction(action: GameAction): boolean { return this.accepts(action) }

  dispose(): void { this.cleanup.forEach(cleanup => cleanup()); this.releaseAll() }
}
