// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PuyoColor as C, type PuyoPair } from '../../game/core/types'
import { encodePlacedPair, replayPlacements } from '../../game/scoreAttack/placementHistory'
import PlacementHistoryPreview from './PlacementHistoryPreview'
afterEach(cleanup)
const pair = (main: C, sub: C, x = 2, y = 1): PuyoPair => ({ main: { color: main, x, y }, sub: { color: sub, x, y: y - 1 }, rotation: 0, falling: true })
const moves = [pair(C.RED, C.BLUE, 0, 12), pair(C.GREEN, C.YELLOW, 2, 12), pair(C.BLUE, C.RED, 4, 12)].map(encodePlacedPair).join('')
const snapshot = { moves, grid: replayPlacements(moves), currentPair: pair(C.YELLOW, C.GREEN), nextPair: pair(C.RED, C.YELLOW), nextNextPair: pair(C.GREEN, C.BLUE) }
const queue = (label: string) => [...screen.getByRole('group', { name: label }).querySelectorAll('[data-color]')].map(el => el.getAttribute('data-color'))
it('updates both previews when moving forward and backward, including the saved tail', () => {
  render(<PlacementHistoryPreview snapshot={snapshot} />)
  fireEvent.click(screen.getByRole('button', { name: '手順を見る' }))
  expect(queue('NEXT')).toEqual(['yellow', 'green'])
  expect(queue('NEXT2')).toEqual(['red', 'blue'])
  const next = screen.getByRole('button', { name: '次の手' })
  fireEvent.click(next)
  expect(queue('NEXT')).toEqual(['red', 'blue'])
  expect(queue('NEXT2')).toEqual(['green', 'yellow'])
  fireEvent.click(screen.getByRole('button', { name: '前の手' }))
  expect(queue('NEXT')).toEqual(['yellow', 'green'])
  for (let i = 0; i < 3; i++) fireEvent.click(next)
  expect(queue('NEXT')).toEqual(['yellow', 'red'])
  expect(queue('NEXT2')).toEqual(['blue', 'green'])
  expect((next as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '手順を閉じる' }))
  expect(screen.queryByRole('group', { name: 'NEXT' })).toBeNull()
})
it('shows unknown legacy tail pairs and keeps invalid histories out of playback', () => {
  const legacy = { moves: '', grid: replayPlacements(''), currentPair: null }
  const view = render(<PlacementHistoryPreview snapshot={legacy} />)
  fireEvent.click(screen.getByRole('button', { name: '手順を見る' }))
  expect(screen.getAllByLabelText('未記録')).toHaveLength(2)
  view.unmount()
  render(<PlacementHistoryPreview snapshot={{ ...legacy, moves: '!' }} />)
  fireEvent.click(screen.getByRole('button', { name: '手順を見る' }))
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(screen.queryByRole('group', { name: 'NEXT' })).toBeNull()
})

it('starts practice with the selected committed colors and blocks empty or inconsistent records', () => {
  const onPractice = vi.fn()
  const before = structuredClone(snapshot)
  const view = render(<PlacementHistoryPreview snapshot={snapshot} onPractice={onPractice} />)
  fireEvent.click(screen.getByRole('button', { name: 'このツモで練習' }))
  expect(onPractice).toHaveBeenCalledWith([[C.RED, C.BLUE], [C.GREEN, C.YELLOW], [C.BLUE, C.RED]])
  expect(snapshot).toEqual(before)
  view.rerender(<PlacementHistoryPreview snapshot={{ ...snapshot, moves: '' }} onPractice={onPractice} />)
  expect((screen.getByRole('button', { name: 'このツモで練習' }) as HTMLButtonElement).disabled).toBe(true)
  view.rerender(<PlacementHistoryPreview snapshot={{ ...snapshot, grid: replayPlacements('') }} onPractice={onPractice} />)
  expect((screen.getByRole('button', { name: 'このツモで練習' }) as HTMLButtonElement).disabled).toBe(true)
  view.rerender(<PlacementHistoryPreview snapshot={{ ...snapshot, moves: undefined }} onPractice={onPractice} />)
  expect(screen.queryByRole('button', { name: 'このツモで練習' })).toBeNull()
  expect(onPractice).toHaveBeenCalledOnce()
})
