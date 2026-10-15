import { afterEach, expect, it, vi } from 'vitest'
import { GameControlInput, attachGameControlRelease, pointerHandlers } from './GameControlInput'
import { InputController } from '../../game/input/InputController'
import { defaultBindings } from '../../game/input/bindings'
import type { GameManager } from '../../game/GameManager'

afterEach(() => vi.unstubAllGlobals())

it('keeps pointer and physical sources separate and releases cancel, leave and lost capture', () => {
  const controller = new InputController(defaultBindings())
  const manager = { pressAction: (action: Parameters<InputController['press']>[0], source: string) => controller.press(action, source),
    releaseAction: (source: string) => controller.release(source) } as unknown as GameManager
  const input = new GameControlInput(() => manager)
  const handlers = pointerHandlers(input, 'left')
  const event = (pointerId: number) => ({ pointerId, preventDefault: vi.fn(),
    currentTarget: { setPointerCapture: vi.fn() } }) as never
  handlers.onPointerDown(event(1))
  handlers.onPointerDown(event(2))
  controller.pressPhysical('ArrowLeft')
  expect(controller.frame(0)).toEqual(new Set(['left']))
  handlers.onPointerCancel(event(1))
  handlers.onLostPointerCapture(event(2))
  expect(controller.isHeld('left')).toBe(true)
  expect(controller.frame(150)).toEqual(new Set(['left']))
  controller.releasePhysical('ArrowLeft')
  expect(controller.frame(300)).toEqual(new Set())

  handlers.onPointerDown(event(3))
  handlers.onPointerLeave(event(3))
  expect(controller.frame(301)).toEqual(new Set(['left'])) // short press survives to update
  expect(controller.frame(302)).toEqual(new Set())
})

it('releases active pointers on blur, hidden and unmount', () => {
  const calls: string[] = []
  const manager = { pressAction: (_action: string, source: string) => calls.push(`down:${source}`),
    releaseAction: (source: string) => calls.push(`up:${source}`) } as unknown as GameManager
  const listeners = new Map<string, () => void>()
  const windowMock = { addEventListener: vi.fn((name: string, callback: () => void) => listeners.set(name, callback)),
    removeEventListener: vi.fn() }
  const documentMock = { hidden: false, addEventListener: vi.fn((name: string, callback: () => void) => listeners.set(name, callback)),
    removeEventListener: vi.fn() }
  vi.stubGlobal('window', windowMock)
  vi.stubGlobal('document', documentMock)
  const input = new GameControlInput(() => manager)
  const handlers = pointerHandlers(input, 'quickDrop')
  const event = (pointerId: number) => ({ pointerId, preventDefault: vi.fn(),
    currentTarget: { setPointerCapture: vi.fn() } }) as never
  const detach = attachGameControlRelease(input)
  handlers.onPointerDown(event(1))
  listeners.get('blur')!()
  handlers.onPointerDown(event(2))
  documentMock.hidden = true
  listeners.get('visibilitychange')!()
  documentMock.hidden = false
  handlers.onPointerDown(event(3))
  detach()
  expect(calls).toEqual([
    'down:pointer:quickDrop:1', 'up:pointer:quickDrop:1',
    'down:pointer:quickDrop:2', 'up:pointer:quickDrop:2',
    'down:pointer:quickDrop:3', 'up:pointer:quickDrop:3',
  ])
  expect(windowMock.removeEventListener).toHaveBeenCalledWith('blur', expect.any(Function))
  expect(documentMock.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
})

it.each(['cancel', 'lost', 'leave', 'blur', 'hidden', 'unmount'] as const)(
  'clears a semantic release gate on %s', reason => {
    const controller = new InputController(defaultBindings())
    const manager = { pressAction: (action: Parameters<InputController['press']>[0], source: string) => controller.press(action, source),
      releaseAction: (source: string) => controller.release(source) } as unknown as GameManager
    const listeners = new Map<string, () => void>()
    vi.stubGlobal('window', { addEventListener: (name: string, callback: () => void) => listeners.set(name, callback),
      removeEventListener: vi.fn() })
    const doc = { hidden: false, addEventListener: (name: string, callback: () => void) => listeners.set(name, callback),
      removeEventListener: vi.fn() }
    vi.stubGlobal('document', doc)
    const input = new GameControlInput(() => manager)
    const handlers = pointerHandlers(input, 'quickDrop')
    const event = (pointerId: number) => ({ pointerId, preventDefault: vi.fn(),
      currentTarget: { setPointerCapture: vi.fn() } }) as never
    const detach = attachGameControlRelease(input)
    handlers.onPointerDown(event(1))
    expect(controller.frame(0)).toEqual(new Set(['quickDrop']))
    controller.suppressUntilRelease()
    expect(controller.isGated()).toBe(true)
    if (reason === 'cancel') handlers.onPointerCancel(event(1))
    if (reason === 'lost') handlers.onLostPointerCapture(event(1))
    if (reason === 'leave') handlers.onPointerLeave(event(1))
    if (reason === 'blur') listeners.get('blur')!()
    if (reason === 'hidden') { doc.hidden = true; listeners.get('visibilitychange')!(); doc.hidden = false }
    if (reason === 'unmount') detach()
    expect(controller.isGated()).toBe(false)
    handlers.onPointerDown(event(2))
    expect(controller.frame(1)).toEqual(new Set(['quickDrop']))
    detach()
  },
)
