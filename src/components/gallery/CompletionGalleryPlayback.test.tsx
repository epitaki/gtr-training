// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GALLERY_SHAPES } from '../../game/guide/GTRCompletionGallery'
import { GALLERY_DISPLAY_LABELS } from './GalleryShapeDisplay'
import CompletionGallery from './CompletionGallery'

let serial = 0, time = 0
let frames: Map<number, FrameRequestCallback>
let modalDescriptor: PropertyDescriptor | undefined, closeDescriptor: PropertyDescriptor | undefined
const tick = (count: number) => act(() => {
  for (let i = 0; i < count; i++) {
    const pending = [...frames.values()]; frames.clear(); time += 50
    pending.forEach(callback => callback(time))
  }
})
const boards = (dialog: HTMLElement) => [...dialog.querySelectorAll('div[aria-hidden="true"]')]
const snapshots = (dialog: HTMLElement) => boards(dialog).map(board => board.innerHTML)
beforeEach(() => {
  serial = time = 0; frames = new Map()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++serial, callback); return serial })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  modalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
  closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false } })
})
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  for (const [name, descriptor] of [['showModal', modalDescriptor], ['close', closeDescriptor]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor)
    else delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>)[name]
  }
})
it.each(GALLERY_SHAPES)('restores %s after completing playback, stays still and supports another replay', shape => {
  render(<CompletionGallery onReturn={() => {}} returnLabel="戻る" />)
  fireEvent.click(within(screen.getByRole('group', { name: '完成形の骨格を選ぶ' })).getByRole('button', { name: GALLERY_DISPLAY_LABELS[shape] }))
  fireEvent.click(within(screen.getByRole('region', { name: GALLERY_DISPLAY_LABELS[shape] + 'の完成形' })).getAllByRole('button')[0])
  const dialog = screen.getByRole('dialog'), initial = snapshots(dialog)
  expect(boards(dialog)).toHaveLength(2)
  expect(boards(dialog).every(board => board.querySelectorAll('img').length === 20)).toBe(true)
  tick(16)
  expect(within(dialog).getByRole('status').textContent).toBe('1連鎖目')
  expect(snapshots(dialog)).not.toEqual(initial)
  tick(80)
  expect(within(dialog).getByRole('status').textContent).toBe('5連鎖・全消し')
  expect(snapshots(dialog)).toEqual(initial)
  expect(frames.size).toBe(0)
  tick(40)
  expect(snapshots(dialog)).toEqual(initial)
  expect(frames.size).toBe(0)
  fireEvent.click(within(dialog).getByRole('button', { name: 'もう一度再生' }))
  expect(frames.size).toBe(1)
  tick(96)
  expect(snapshots(dialog)).toEqual(initial)
  expect(frames.size).toBe(0)
  fireEvent.click(within(dialog).getByRole('button', { name: '閉じる' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  tick(1)
  expect(frames.size).toBe(0)
})
