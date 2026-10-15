import { ALLOWED_CODES, normalizedCode } from '../../game/input/bindings'

interface KeyCaptureCallbacks {
  onCapture: (code: string) => void
  onCancel: () => void
  onInvalid: (code: string) => void
}

/** A capture ends before the next focused control can receive Enter or Space. */
export function startKeyCapture(target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  callbacks: KeyCaptureCallbacks): () => void {
  let active = true
  let pendingModifier: string | null = null
  const finish = (code: string) => {
    active = false
    pendingModifier = null
    callbacks.onCapture(code)
  }
  const keydown = (event: KeyboardEvent) => {
    if (!active) return
    if (event.code === 'Tab') {
      active = false
      pendingModifier = null
      callbacks.onCancel()
      return // browser moves focus normally, in either direction
    }
    if (event.isComposing || event.keyCode === 229 || event.repeat) return
    const code = normalizedCode(event.code)
    if (code === 'Shift' || code === 'Control') {
      pendingModifier = event.code
      return // allow the modifier to participate in native Tab navigation
    }
    event.preventDefault()
    event.stopPropagation()
    if (!ALLOWED_CODES.has(code)) { callbacks.onInvalid(event.code); return }
    finish(code)
  }
  const keyup = (event: KeyboardEvent) => {
    if (!active || pendingModifier !== event.code) return
    event.preventDefault()
    event.stopPropagation()
    finish(normalizedCode(event.code))
  }
  target.addEventListener('keydown', keydown, true)
  target.addEventListener('keyup', keyup, true)
  return () => {
    active = false
    target.removeEventListener('keydown', keydown, true)
    target.removeEventListener('keyup', keyup, true)
  }
}
