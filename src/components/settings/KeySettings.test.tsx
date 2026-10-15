// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import KeySettings from './KeySettings'
import { ACTIONS, defaultBindings } from '../../game/input/bindings'
import { getBindings, loadBindings, saveBindings } from '../../game/input/settings'

beforeEach(() => saveBindings(defaultBindings()))
afterEach(() => { cleanup(); localStorage.clear() })

it('shows only setting 1 and one default key per action, with additional keys available', () => {
  render(<KeySettings onClose={() => {}} />)
  expect(screen.getByText('設定1')).toBeTruthy()
  expect(screen.queryByText('設定2')).toBeNull()
  expect(screen.queryByText('マウスのみ')).toBeNull()
  expect(screen.queryByText('マウス操作')).toBeNull()
  expect(screen.getAllByRole('button', { name: /から.*を削除/ })).toHaveLength(ACTIONS.length)
  expect(screen.getAllByRole('button', { name: /にキーを追加/ })).toHaveLength(ACTIONS.length)
})

it('adds, saves, restores and removes a second key without changing other actions', () => {
  const close = vi.fn()
  render(<KeySettings onClose={close} />)
  fireEvent.click(screen.getByRole('button', { name: '左移動にキーを追加' }))
  fireEvent.keyDown(window, { code: 'KeyQ' })
  expect(getBindings().left).toEqual(['ArrowLeft'])
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(close).toHaveBeenCalledOnce()
  loadBindings()
  expect(getBindings()).toEqual({ ...defaultBindings(), left: ['ArrowLeft', 'KeyQ'] })
  cleanup()
  render(<KeySettings onClose={close} />)
  fireEvent.click(screen.getByRole('button', { name: '左移動からQを削除' }))
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  loadBindings()
  expect(getBindings()).toEqual(defaultBindings())
})

it('cancels added keys and reset drafts without changing applied or stored custom settings', () => {
  const custom = defaultBindings()
  custom.rewind = ['KeyT', 'KeyU']
  saveBindings(custom)
  const saved = localStorage.getItem('gtr-key-bindings-v1')
  const close = vi.fn()
  render(<KeySettings onClose={close} />)
  fireEvent.click(screen.getByRole('button', { name: '初期設定に戻す' }))
  fireEvent.click(screen.getByRole('button', { name: '右移動にキーを追加' }))
  fireEvent.keyDown(window, { code: 'KeyQ' })
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(close).toHaveBeenCalledOnce()
  expect(getBindings()).toEqual(custom)
  expect(localStorage.getItem('gtr-key-bindings-v1')).toBe(saved)
})

it('resets all actions to the single-key defaults only after saving', () => {
  const custom = defaultBindings()
  custom.rewind = ['KeyT', 'KeyU']
  saveBindings(custom)
  render(<KeySettings onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: '初期設定に戻す' }))
  expect(getBindings()).toEqual(custom)
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  loadBindings()
  expect(getBindings()).toEqual(defaultBindings())
})

it('blocks conflicting keys until the duplicate is removed', () => {
  render(<KeySettings onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'クイックドロップにキーを追加' }))
  fireEvent.keyDown(window, { code: 'Space' })
  expect(screen.getByRole('status').textContent).toContain('重複')
  expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'クイックドロップからSpaceを削除' }))
  expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(false)
})

it('hides score-attack gravity controls while preserving the guide gravity binding on reset and save', () => {
  const custom = defaultBindings()
  custom.gravity = ['KeyT']
  saveBindings(custom)
  const view = render(<KeySettings allowGravityToggle={false} onClose={vi.fn()} />)
  expect(screen.queryByText('自由落下切替')).toBeNull()
  expect(screen.queryByRole('button', { name: /自由落下.*追加/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '初期設定に戻す' }))
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(getBindings().gravity).toEqual(['KeyT'])
  view.rerender(<KeySettings onClose={vi.fn()} />)
  expect(screen.getByRole('button', { name: /自由落下.*追加/ })).toBeTruthy()
})
