import { expect, it, vi } from 'vitest'
import { startKeyCapture } from './keyCapture'

function captureHarness() {
  const listeners = new Map<string, (event: KeyboardEvent) => void>()
  const target = {
    addEventListener: vi.fn((name: string, listener: (event: KeyboardEvent) => void) => listeners.set(name, listener)),
    removeEventListener: vi.fn((name: string) => listeners.delete(name)),
  } as unknown as Window
  const emit = (name: 'keydown' | 'keyup', code: string, shiftKey = false) => {
    const event = { code, keyCode: 0, shiftKey, repeat: false, isComposing: false,
      preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent
    listeners.get(name)?.(event)
    return event
  }
  return { target, emit }
}

it.each([false, true])('cancels only capture on %s Tab and leaves later button keys unhandled', reverse => {
  const { target, emit } = captureHarness()
  const draft = ['KeyZ']
  const applied = ['KeyZ']
  const stored = ['KeyZ']
  const onCapture = vi.fn((code: string) => draft.push(code))
  const onCancel = vi.fn()
  const stop = startKeyCapture(target, { onCapture, onCancel, onInvalid: vi.fn() })
  if (reverse) {
    emit('keydown', 'ShiftLeft', true)
    expect(onCapture).not.toHaveBeenCalled()
  }
  const tab = emit('keydown', 'Tab', reverse)
  emit('keyup', 'Tab', reverse)
  if (reverse) emit('keyup', 'ShiftLeft')
  expect(tab.preventDefault).not.toHaveBeenCalled()
  expect(tab.stopPropagation).not.toHaveBeenCalled()
  expect(onCancel).toHaveBeenCalledOnce()
  expect(onCapture).not.toHaveBeenCalled()
  expect(draft).toEqual(['KeyZ'])
  expect(applied).toEqual(['KeyZ'])
  expect(stored).toEqual(['KeyZ'])
  for (const activation of ['Enter', 'Space']) {
    const key = emit('keydown', activation)
    expect(key.preventDefault).not.toHaveBeenCalled()
    expect(key.stopPropagation).not.toHaveBeenCalled()
  }
  expect(onCapture).not.toHaveBeenCalled()
  stop()
})

it.each([
  ['Escape', 'Escape'], ['Enter', 'Enter'], ['Space', 'Space'],
  ['ShiftLeft', 'Shift'], ['ShiftRight', 'Shift'],
  ['ControlLeft', 'Control'], ['ControlRight', 'Control'],
])('captures an intentional single %s as %s', (physical, expected) => {
  const { target, emit } = captureHarness()
  const onCapture = vi.fn()
  const onCancel = vi.fn()
  const stop = startKeyCapture(target, { onCapture, onCancel, onInvalid: vi.fn() })
  const down = emit('keydown', physical)
  if (physical.startsWith('Shift') || physical.startsWith('Control')) {
    expect(down.preventDefault).not.toHaveBeenCalled()
    expect(onCapture).not.toHaveBeenCalled()
    expect(emit('keyup', physical).preventDefault).toHaveBeenCalledOnce()
  } else expect(down.preventDefault).toHaveBeenCalledOnce()
  expect(onCapture).toHaveBeenCalledOnce()
  expect(onCapture).toHaveBeenCalledWith(expected)
  expect(onCancel).not.toHaveBeenCalled()
  stop()
})

it('keeps pointer cancellation and a later capture independent', () => {
  const { target, emit } = captureHarness()
  const first = vi.fn(), second = vi.fn()
  const stopFirst = startKeyCapture(target, { onCapture: first, onCancel: vi.fn(), onInvalid: vi.fn() })
  emit('keydown', 'ShiftRight')
  stopFirst() // pointer cancellation closes capture and runs the effect cleanup
  emit('keyup', 'ShiftRight')
  emit('keydown', 'KeyQ')
  expect(first).not.toHaveBeenCalled()
  const stopSecond = startKeyCapture(target, { onCapture: second, onCancel: vi.fn(), onInvalid: vi.fn() })
  emit('keydown', 'KeyQ')
  expect(second).toHaveBeenCalledOnce()
  expect(second).toHaveBeenCalledWith('KeyQ')
  stopSecond()
})
