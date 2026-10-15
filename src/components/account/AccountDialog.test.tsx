// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import AccountDialog from './AccountDialog'
import type { useAccount } from '../../auth/useAccount'

afterEach(cleanup)

type Account = ReturnType<typeof useAccount>

it('offers guest login, edits a profile, logs out, and restores scroll state', () => {
  const loginLocal = vi.fn()
  const saveName = vi.fn()
  const logout = vi.fn()
  const onClose = vi.fn()
  const base = {
    availableLocal: true, configuredCloud: false, status: 'guest', error: null,
    loginCloud: vi.fn(), loginLocal, saveName, saveAvatar: vi.fn(), logout,
  }
  const previous = document.body.style.overflow
  const view = render(<AccountDialog account={{ ...base, profile: null } as Account} onClose={onClose} />)
  expect(screen.getByText('Google/GitHubログインは利用できません。')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'ローカル管理者でログイン' }))
  expect(loginLocal).toHaveBeenCalledOnce()
  expect(document.body.style.overflow).toBe('hidden')
  view.rerender(<AccountDialog account={{ ...base, status: 'ready', profile: { environment: 'http://127.0.0.1:54321', provider: 'ローカル管理者', id: '00000000-0000-4000-8000-000000000001', role: 'admin', display_name: '管理者' } } as Account} onClose={onClose} />)
  fireEvent.change(screen.getByLabelText('表示名'), { target: { value: '新しい名前' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(saveName).toHaveBeenCalledWith('新しい名前')
  fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
  expect(logout).toHaveBeenCalledOnce()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledOnce()
  view.unmount()
  expect(document.body.style.overflow).toBe(previous)
})

it('keeps an unsaved draft only for the same environment and id', () => {
  const saveName = vi.fn()
  const base = {
    availableLocal: true, configuredCloud: true, status: 'ready', error: null,
    loginCloud: vi.fn(), loginLocal: vi.fn(), saveName, saveAvatar: vi.fn(), logout: vi.fn(),
  }
  const profile = (environment: string, id: string) => ({ environment, id, role: 'user', display_name: 'Same' })
  const view = render(<AccountDialog account={{ ...base, profile: profile('cloud', 'user-a') } as Account} onClose={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('表示名'), { target: { value: 'unsaved A' } })
  view.rerender(<AccountDialog account={{ ...base, profile: profile('cloud', 'user-a') } as Account} onClose={vi.fn()} />)
  expect((screen.getByLabelText('表示名') as HTMLInputElement).value).toBe('unsaved A')
  view.rerender(<AccountDialog account={{ ...base, profile: profile('cloud', 'user-b') } as Account} onClose={vi.fn()} />)
  expect((screen.getByLabelText('表示名') as HTMLInputElement).value).toBe('Same')
  fireEvent.change(screen.getByLabelText('表示名'), { target: { value: 'unsaved B' } })
  view.rerender(<AccountDialog account={{ ...base, profile: profile('local', 'user-b') } as Account} onClose={vi.fn()} />)
  expect((screen.getByLabelText('表示名') as HTMLInputElement).value).toBe('Same')
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(saveName).toHaveBeenCalledWith('Same')
})

it('selects an image, clears the file input for re-selection and can remove a saved image', () => {
  const saveAvatar = vi.fn()
  render(<AccountDialog account={{ profile: { id: 'a', environment: 'cloud', display_name: 'Name', role: 'user', avatar_path: 'a/image.webp', avatar_url: 'https://signed.invalid/image' }, status: 'ready', error: null, saveAvatar } as unknown as Account} onClose={vi.fn()} />)
  const input = screen.getByLabelText('プロフィール画像') as HTMLInputElement
  const file = new File(['image'], 'image.jpg', { type: 'image/jpeg' })
  fireEvent.change(input, { target: { files: [file] } })
  expect(saveAvatar).toHaveBeenCalledWith(file)
  expect(input.value).toBe('')
  fireEvent.click(screen.getByRole('button', { name: '画像を削除' }))
  expect(saveAvatar).toHaveBeenCalledWith(null)
})
