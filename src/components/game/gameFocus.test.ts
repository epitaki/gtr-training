import { afterEach, expect, it, vi } from 'vitest'
import { focusGameCanvas, pressToolbarAction, restoreFocusOnResume } from './gameFocus'
import type { GameManager } from '../../game/GameManager'

afterEach(() => vi.unstubAllGlobals())

it('restores canvas focus after an external view or toolbar pause without stealing it from an open overlay', () => {
  const scheduled: { frame?: FrameRequestCallback } = {}
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { scheduled.frame = callback; return 1 })
  vi.stubGlobal('document', { hidden: false })
  const canvas = { focus: vi.fn() }
  const container = { querySelector: vi.fn(() => canvas) } as unknown as HTMLElement
  let settingsOpen = false
  let reportOpen = false
  const focus = () => focusGameCanvas(container, () => !settingsOpen && !reportOpen)
  restoreFocusOnResume(false, false, focus)
  expect(scheduled.frame).toBeUndefined()
  restoreFocusOnResume(true, false, focus)
  scheduled.frame?.(0)
  expect(canvas.focus).toHaveBeenCalledOnce()

  settingsOpen = true
  restoreFocusOnResume(true, false, focus)
  scheduled.frame?.(0)
  expect(canvas.focus).toHaveBeenCalledOnce()
  settingsOpen = false
  reportOpen = true
  restoreFocusOnResume(true, false, focus)
  scheduled.frame?.(0)
  expect(canvas.focus).toHaveBeenCalledOnce()
  reportOpen = false

  const manager = { pressAction: vi.fn(), releaseAction: vi.fn() } as unknown as GameManager
  pressToolbarAction(manager, 'pause', 'button:pause', focus)
  expect(manager.pressAction).toHaveBeenCalledWith('pause', 'button:pause')
  expect(manager.releaseAction).toHaveBeenCalledWith('button:pause')
  scheduled.frame?.(0)
  expect(canvas.focus).toHaveBeenCalledTimes(2)
})
