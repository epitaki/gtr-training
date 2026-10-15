// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { defaultBindings } from '../../game/input/bindings'
import * as settings from '../../game/input/settings'
import KeyboardInstructions from './KeyboardInstructions'

beforeEach(() => settings.saveBindings(defaultBindings()))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  settings.saveBindings(defaultBindings())
})

const shownActions = () => screen.getAllByRole('term').map(label => label.textContent)
const shownKeys = (action: string) => screen.getByText(action, { selector: 'dt', exact: true }).nextElementSibling?.textContent

describe('normal-play keyboard instructions', () => {
  it('shows all guide actions with one default key each and no interactive controls', () => {
    render(<KeyboardInstructions guided />)
    expect(shownActions()).toEqual(['左移動', '右移動', '左回転', '右回転', '高速落下', 'クイックドロップ', 'ポーズ', '巻戻し', '評価', 'ガイド', '自由落下', '共有'])
    expect(screen.getAllByRole('definition').map(value => value.textContent)).toEqual(['←', '→', 'Z', 'X', '↓', '↑', 'Escape', 'A', 'Space', 'G', 'F', 'R'])
    expect(screen.getByRole('region', { name: '通常プレイのキー操作' })).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/マウス/)).toBeNull()
  })
  it('shows only the basic controls, evaluation and gravity in score attack', () => {
    render(<KeyboardInstructions />)
    expect(shownActions()).toEqual(['左移動', '右移動', '左回転', '右回転', '高速落下', 'クイックドロップ', 'ポーズ', '評価', '自由落下'])
  })
  it('renders all eight applied keys', () => {
    const applied = defaultBindings()
    applied.left = ['Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5', 'Numpad7', 'Numpad8']
    settings.saveBindings(applied)
    render(<KeyboardInstructions />)
    expect(shownKeys('左移動')).toBe('Num0 / Num1 / Num2 / Num3 / Num4 / Num5 / Num7 / Num8')
  })
  it('updates the mounted instructions even when storage fails and unsubscribes on unmount', () => {
    const originalSubscribe = settings.subscribeBindings
    const notified = vi.fn()
    const unsubscribe = vi.fn<() => void>()
    vi.spyOn(settings, 'subscribeBindings').mockImplementation(listener => {
      unsubscribe.mockImplementation(originalSubscribe(() => { notified(); listener() }))
      return unsubscribe
    })
    const { unmount } = render(<KeyboardInstructions />)
    expect(shownKeys('左移動')).toBe('←')
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('quota') } })
    const applied = defaultBindings()
    applied.left = ['KeyT']
    act(() => { expect(settings.saveBindings(applied)).toBe(false) })
    expect(shownKeys('左移動')).toBe('T')
    expect(shownKeys('右移動')).toBe('→')
    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
    notified.mockClear()
    act(() => { settings.saveBindings(defaultBindings()) })
    expect(notified).not.toHaveBeenCalled()
  })
})
