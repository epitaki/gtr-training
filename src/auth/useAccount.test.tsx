// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAccount } from './useAccount'

const fake = vi.hoisted(() => ({ callback: null as null | ((event: string, session: any) => void),
  process: vi.fn(), available: vi.fn(), login: vi.fn(), profile: vi.fn(), update: vi.fn(),
  getUser: vi.fn(), signOut: vi.fn(), resize: vi.fn(), avatar: vi.fn(), }))
vi.mock('./avatarImage', () => ({ resizeAvatar: fake.resize }))
vi.mock('./avatarStorage', () => ({ updateAvatar: fake.avatar }))
vi.mock('./oauthCallback', () => ({ processOAuthCallback: fake.process }))
vi.mock('./account', () => ({ localAvailable: fake.available, localLogin: fake.login,
  readProfile: fake.profile, updateName: fake.update, startOAuth: vi.fn() }))
vi.mock('../lib/supabase', () => ({ localSupabase: false, supabase: { auth: {
  getUser: fake.getUser, signOut: fake.signOut,
  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    fake.callback = callback
    callback('INITIAL_SESSION', null)
    return { data: { subscription: { unsubscribe() {} } } }
  },
} } }))

afterEach(() => { vi.resetAllMocks(); fake.callback = null })
function setup() {
  fake.process.mockResolvedValue('absent')
  fake.available.mockResolvedValue(true)
  fake.getUser.mockResolvedValue({ data: { user: { id: 'a' } }, error: null })
  fake.profile.mockImplementation(async (user: { id: string }) => ({ id: user.id, display_name: 'Old', role: 'user', environment: 'local' }))
  fake.signOut.mockResolvedValue({ error: null })
  fake.update.mockResolvedValue(undefined)
}

it('discards an old read after a different identity arrives', async () => {
  setup()
  const { result } = renderHook(() => useAccount())
  await waitFor(() => expect(result.current.profile?.id).toBe('a'))
  let resolveOld!: (value: any) => void
  fake.profile.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    .mockImplementationOnce(async () => ({ id: 'b', display_name: 'Bob', role: 'user', environment: 'local' }))
  act(() => fake.callback?.('TOKEN_REFRESHED', { user: { id: 'a' } }))
  act(() => fake.callback?.('SIGNED_IN', { user: { id: 'b' } }))
  await waitFor(() => expect(result.current.profile?.id).toBe('b'))
  await act(async () => resolveOld({ id: 'a', display_name: 'Late', role: 'user', environment: 'local' }))
  expect(result.current.profile?.id).toBe('b')
})

it('keeps a saved name when a preceding refresh read finishes later', async () => {
  setup()
  const { result } = renderHook(() => useAccount())
  await waitFor(() => expect(result.current.profile?.id).toBe('a'))
  let resolveOld!: (value: any) => void
  fake.profile.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
  act(() => fake.callback?.('TOKEN_REFRESHED', { user: { id: 'a' } }))
  await act(async () => result.current.saveName('Saved'))
  await act(async () => resolveOld({ id: 'a', display_name: 'Old', role: 'user', environment: 'local' }))
  expect(result.current.profile?.display_name).toBe('Saved')
})

it('logs out through Supabase and discards the profile', async () => {
  setup()
  const { result } = renderHook(() => useAccount())
  await waitFor(() => expect(result.current.profile?.id).toBe('a'))
  await act(async () => result.current.logout())
  expect(fake.signOut).toHaveBeenCalledOnce()
  expect(result.current.profile).toBeNull()
})

it('does not publish an avatar save after the user logs out', async () => {
  setup()
  const { result } = renderHook(() => useAccount())
  await waitFor(() => expect(result.current.profile?.id).toBe('a'))
  fake.resize.mockResolvedValue(new Blob(['webp']))
  let finish!: (value: any) => void
  let isCurrent!: () => boolean
  fake.avatar.mockImplementation((_profile, _image, current) => { isCurrent = current; return new Promise(resolve => { finish = resolve }) })
  let pending!: Promise<void>
  act(() => { pending = result.current.saveAvatar(new File(['image'], 'a.png')) })
  await waitFor(() => expect(fake.avatar).toHaveBeenCalledOnce())
  act(() => fake.callback?.('SIGNED_OUT', null))
  expect(isCurrent()).toBe(false)
  await act(async () => { finish({ id: 'a', avatar_url: 'stale', display_name: 'Old' }); await pending })
  expect(result.current.profile).toBeNull()
})
