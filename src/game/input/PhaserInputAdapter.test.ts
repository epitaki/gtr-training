import { afterEach, expect, it, vi } from 'vitest'
import { PhaserInputAdapter } from './PhaserInputAdapter'
import { defaultBindings } from './bindings'

afterEach(() => vi.unstubAllGlobals())

it('suppresses assigned scrolling keys while actions are rejected without changing input state', () => {
  const listeners = new Map<string, (event: KeyboardEvent) => void>()
  const canvas = { closest: () => null, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as HTMLCanvasElement
  const doc = { activeElement: canvas as unknown, hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', { addEventListener: (name: string, handler: (event: KeyboardEvent) => void) => listeners.set(name, handler), removeEventListener: vi.fn() })
  let result = true
  let accepted = false
  const adapter = new PhaserInputAdapter(canvas, code => result && code === 'Space' ? 'newGame' : undefined, () => accepted)
  const press = vi.spyOn(adapter, 'press'), physical = vi.spyOn(adapter, 'pressPhysical')
  const down = (code: string, options: Record<string, unknown> = {}) => {
    const event = { code, target: canvas, keyCode: 0, repeat: false, isComposing: false,
      ctrlKey: false, metaKey: false, altKey: false, preventDefault: vi.fn(), ...options } as unknown as KeyboardEvent
    listeners.get('keydown')!(event)
    return event
  }
  for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']) {
    for (const repeat of [false, true]) expect(down(code, { repeat }).preventDefault).toHaveBeenCalledOnce()
  }
  result = false
  expect(down('Space').preventDefault).toHaveBeenCalledOnce()
  for (const code of ['KeyE', 'KeyQ', 'Tab']) expect(down(code).preventDefault).not.toHaveBeenCalled()
  for (const options of [{ isComposing: true }, { keyCode: 229 }, { altKey: true },
    { target: { closest: () => ({}) } }]) expect(down('ArrowDown', options).preventDefault).not.toHaveBeenCalled()
  for (const options of [{ ctrlKey: true }, { metaKey: true }]) expect(down('KeyE', options).preventDefault).not.toHaveBeenCalled()
  doc.activeElement = { closest: () => ({}) }
  expect(down('ArrowDown').preventDefault).not.toHaveBeenCalled()
  doc.activeElement = { closest: () => null }
  expect(down('ArrowDown').preventDefault).not.toHaveBeenCalled()
  doc.activeElement = canvas
  doc.hidden = true
  expect(down('ArrowDown').preventDefault).not.toHaveBeenCalled()
  doc.hidden = false
  const keys = defaultBindings()
  keys.softDrop = ['KeyV']
  adapter.setBindings(keys)
  expect(down('ArrowDown').preventDefault).not.toHaveBeenCalled()
  expect(press).not.toHaveBeenCalled()
  expect(physical).not.toHaveBeenCalled()
  expect(adapter.frame(0)).toEqual(new Set())
  expect(adapter.isGated()).toBe(false)
  accepted = true
  adapter.setBindings(defaultBindings())
  expect(down('ArrowDown').preventDefault).toHaveBeenCalledOnce()
  expect(adapter.frame(0)).toEqual(new Set(['softDrop']))
  expect(down('ArrowDown', { repeat: true }).preventDefault).toHaveBeenCalledOnce()
  expect(adapter.frame(149)).toEqual(new Set())
  expect(adapter.frame(150)).toEqual(new Set(['softDrop']))
  adapter.dispose()
})

it('consumes only focused, allowed game keys and ignores IME, editable fields and modified letters', () => {
  const listeners = new Map<string, (event: KeyboardEvent) => void>()
  const canvasListeners = new Map<string, () => void>()
  const container = { closest: () => null }
  const canvas = { closest: () => null, parentElement: container,
    addEventListener: (name: string, listener: () => void) => canvasListeners.set(name, listener),
    removeEventListener: vi.fn() } as unknown as HTMLCanvasElement
  const doc = { activeElement: canvas, hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', {
    addEventListener: vi.fn((name: string, listener: (event: KeyboardEvent) => void) => listeners.set(name, listener)),
    removeEventListener: vi.fn(),
  })
  const adapter = new PhaserInputAdapter(canvas, undefined, action => action !== 'pause')
  const down = (code: string, options: Record<string, unknown> = {}) => {
    const event = { code, target: canvas, keyCode: 0, repeat: false, isComposing: false,
      ctrlKey: false, metaKey: false, altKey: false, preventDefault: vi.fn(), ...options } as unknown as KeyboardEvent
    listeners.get('keydown')!(event)
    return event
  }
  expect(down('Escape').preventDefault).not.toHaveBeenCalled()
  expect(down('KeyX', { isComposing: true }).preventDefault).not.toHaveBeenCalled()
  expect(down('KeyX', { keyCode: 229 }).preventDefault).not.toHaveBeenCalled()
  expect(down('KeyX', { ctrlKey: true }).preventDefault).not.toHaveBeenCalled()
  expect(down('KeyX', { target: { closest: () => ({}) } }).preventDefault).not.toHaveBeenCalled()
  expect(down('Tab').preventDefault).not.toHaveBeenCalled()
  expect(down('Tab', { shiftKey: true }).preventDefault).not.toHaveBeenCalled()
  expect(adapter.frame(0)).toEqual(new Set())
  doc.activeElement = { closest: () => null } as unknown as HTMLCanvasElement
  expect(down('KeyX').preventDefault).not.toHaveBeenCalled()
  doc.activeElement = canvas
  expect(down('KeyX').preventDefault).toHaveBeenCalledOnce()
  expect(adapter.frame(0)).toEqual(new Set(['rotateRight']))
  listeners.get('keyup')!({ code: 'KeyX' } as KeyboardEvent)
  down('ArrowLeft')
  expect(adapter.frame(1)).toEqual(new Set(['left']))
  canvasListeners.get('blur')!()
  expect(adapter.frame(151)).toEqual(new Set())
  doc.activeElement = container as unknown as HTMLCanvasElement
  expect(down('ArrowRight').preventDefault).toHaveBeenCalledOnce()
  expect(adapter.frame(152)).toEqual(new Set(['right']))
  adapter.dispose()
})

it.each(['rotateLeft', 'softDrop'] as const)('resolves custom %s modifiers and added DOM keys regardless of NumLock and order', ctrlAction => {
  const listeners = new Map<string, (event: KeyboardEvent) => void>()
  const canvas = { closest: () => null, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as HTMLCanvasElement
  vi.stubGlobal('document', { activeElement: canvas, hidden: false,
    addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('window', { addEventListener: vi.fn((name: string, handler: (event: KeyboardEvent) => void) => listeners.set(name, handler)),
    removeEventListener: vi.fn() })
  const adapter = new PhaserInputAdapter(canvas)
  const bindings = defaultBindings()
  bindings.left.push('Numpad4')
  bindings.right.push('Numpad6')
  bindings[ctrlAction].push('Control')
  bindings.quickDrop.push('Shift')
  adapter.setBindings(bindings)
  const down = (code: string, options: Record<string, unknown> = {}) => {
    const event = { code, target: canvas, keyCode: 0, repeat: false, isComposing: false,
      ctrlKey: false, metaKey: false, altKey: false, preventDefault: vi.fn(), ...options } as unknown as KeyboardEvent
    listeners.get('keydown')!(event)
    return event
  }
  const up = (code: string) => listeners.get('keyup')!({ code } as KeyboardEvent)
  for (const key of ['4', 'ArrowLeft']) {
    const event = down('Numpad4', { key })
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(adapter.frame(0)).toContain('left')
    up('Numpad4')
  }
  for (const key of ['6', 'ArrowRight']) {
    const event = down('Numpad6', { key })
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(adapter.frame(1)).toContain('right')
    up('Numpad6')
  }
  // A held Ctrl must not suppress non-character game codes, regardless of press order.
  down('ControlLeft', { ctrlKey: true })
  expect(adapter.frame(2)).toContain(ctrlAction)
  expect(down('ArrowLeft', { ctrlKey: true }).preventDefault).toHaveBeenCalledOnce()
  expect(adapter.frame(3)).toContain('left')
  up('ArrowLeft')
  expect(down('Space', { ctrlKey: true }).preventDefault).toHaveBeenCalledOnce()
  expect(adapter.frame(4)).toContain('evaluate')
  up('Space')
  expect(down('ShiftLeft', { ctrlKey: true, shiftKey: true }).preventDefault).toHaveBeenCalledOnce()
  expect(adapter.frame(5).has('quickDrop')).toBe(true)
  up('ShiftLeft')
  expect(down('KeyX', { ctrlKey: true }).preventDefault).not.toHaveBeenCalled()
  expect(adapter.frame(6)).not.toContain('rotateRight')
  up('ControlLeft')

  down('ArrowRight')
  down('ControlRight', { ctrlKey: true })
  const afterReverseOrder = adapter.frame(7)
  expect(afterReverseOrder).toContain('right')
  expect(afterReverseOrder).toContain(ctrlAction)
  expect(down('ShiftRight', { ctrlKey: true, shiftKey: true }).preventDefault)
    .toHaveBeenCalledOnce()
  expect(adapter.frame(7.5).has('quickDrop')).toBe(true)
  up('ShiftRight')
  up('ControlRight')
  up('ArrowRight')
  expect(down('ArrowLeft', { metaKey: true }).preventDefault).toHaveBeenCalledOnce()
  expect(adapter.frame(8)).toContain('left')
  up('ArrowLeft')
  expect(down('KeyX', { metaKey: true }).preventDefault).not.toHaveBeenCalled()
  adapter.dispose()
})

it.each([false, true])('leaves Tab and Shift+Tab for browser focus navigation while paused: %s', paused => {
  const listeners = new Map<string, (event: KeyboardEvent) => void>()
  const canvas = { closest: () => null, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as HTMLCanvasElement
  const button = { closest: () => null }
  const doc = { activeElement: canvas as unknown, hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', { addEventListener: vi.fn((name: string, handler: (event: KeyboardEvent) => void) => listeners.set(name, handler)),
    removeEventListener: vi.fn() })
  const adapter = new PhaserInputAdapter(canvas, undefined, action => !paused || action === 'pause')
  for (const shiftKey of [false, true]) {
    doc.activeElement = canvas
    const event = { code: 'Tab', target: canvas, keyCode: 9, repeat: false,
      isComposing: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey,
      preventDefault: vi.fn() } as unknown as KeyboardEvent
    listeners.get('keydown')!(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    doc.activeElement = button
    expect(doc.activeElement).toBe(button)
    expect(adapter.frame(shiftKey ? 1 : 0)).toEqual(new Set())
  }
  adapter.dispose()
})
