// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PuyoColor } from '../../game/core/types'
import FoundationChainPreview from './FoundationChainPreview'

const colors: Record<string, PuyoColor> = { R: PuyoColor.RED, G: PuyoColor.GREEN, B: PuyoColor.BLUE, Y: PuyoColor.YELLOW }
const grid = () => [...Array.from({ length: 9 }, () => Array<PuyoColor | null>(6).fill(null)),
  ...['.....R', 'RGYBBR', 'RRGYYB', 'GGYRRB'].map(row => [...row].map(cell => colors[cell] ?? null))]
let hidden = false, reduced = false, serial = 0, time = 0
let frames: Map<number, FrameRequestCallback>
const tick = (count: number) => act(() => {
  for (let i = 0; i < count; i++) {
    const next = [...frames.values()]; frames.clear(); time += 50
    next.forEach(callback => callback(time))
  }
})
beforeEach(() => {
  hidden = reduced = false; serial = time = 0; frames = new Map()
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++serial, callback); return serial })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('plays the five clears, pauses while hidden, replays and releases its frame on close without changing the board', () => {
  const source = grid(), before = structuredClone(source)
  const { unmount } = render(<FoundationChainPreview grid={source} />)
  tick(15)
  expect(screen.getByRole('status').textContent).toBe('1連鎖目')
  const images = document.querySelectorAll('img').length
  hidden = true; fireEvent(document, new Event('visibilitychange'))
  expect(frames.size).toBe(0)
  time += 10000
  hidden = false; fireEvent(document, new Event('visibilitychange'))
  tick(1)
  expect(document.querySelectorAll('img')).toHaveLength(images)
  tick(100)
  expect(screen.getByRole('status').textContent).toBe('5連鎖・余り0個')
  expect(frames.size).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'もう一度再生' }))
  expect(frames.size).toBe(1)
  unmount()
  expect(frames.size).toBe(0)
  expect(source).toEqual(before)
})

it('waits for an explicit replay when reduced motion is requested', () => {
  reduced = true
  render(<FoundationChainPreview grid={grid()} />)
  expect(frames.size).toBe(0)
  expect(screen.getByRole('status').textContent).toBe('再生待ち')
  fireEvent.click(screen.getByRole('button', { name: 'もう一度再生' }))
  tick(100)
  expect(screen.getByRole('status').textContent).toBe('5連鎖・余り0個')
})
