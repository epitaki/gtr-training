// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { avatarUrl, updateAvatar } from './avatarStorage'
import type { AccountProfile } from './account'

const fake = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), sign: vi.fn(), update: vi.fn(), eq: vi.fn(), is: vi.fn(), select: vi.fn(), single: vi.fn(), user: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: {
  auth: { getUser: fake.user },
  storage: { from: () => ({ upload: fake.upload, remove: fake.remove, createSignedUrl: fake.sign }) },
  from: () => ({ update: fake.update }),
} }))
const id = '11111111-1111-4111-8111-111111111111'
const old = `${id}/22222222-2222-4222-8222-222222222222.webp`
const profile: AccountProfile = { id, environment: 'cloud', role: 'user', display_name: 'Name', avatar_path: old }
const image = new Blob(['webp'], { type: 'image/webp' })
beforeEach(() => {
  vi.resetAllMocks()
  const query = { eq: fake.eq, is: fake.is, select: fake.select, single: fake.single }
  fake.update.mockReturnValue(query); fake.eq.mockReturnValue(query); fake.is.mockReturnValue(query); fake.select.mockReturnValue(query)
  fake.single.mockResolvedValue({ error: null })
  fake.user.mockResolvedValue({ data: { user: { id } }, error: null })
  fake.upload.mockResolvedValue({ error: null }); fake.remove.mockResolvedValue({ error: null })
  fake.sign.mockResolvedValue({ data: { signedUrl: 'https://signed.invalid/avatar' }, error: null })
})
it('saves a unique object, compares the previous path and cleans up only after saving', async () => {
  const result = await updateAvatar(profile, image, () => true)
  expect(result.avatar_path).toMatch(new RegExp(`^${id}/[0-9a-f-]{36}\\.webp$`))
  expect(result.avatar_url).toBe('https://signed.invalid/avatar')
  expect(fake.upload).toHaveBeenCalledWith(result.avatar_path, image, { contentType: 'image/webp', upsert: false })
  expect(fake.eq).toHaveBeenCalledWith('avatar_path', old)
  expect(fake.remove).toHaveBeenCalledWith([old])
  expect(fake.single.mock.invocationCallOrder[0]).toBeLessThan(fake.remove.mock.invocationCallOrder[0])
})
it('removes a new object if the profile update fails and preserves the old object', async () => {
  fake.single.mockResolvedValue({ error: Error('race') })
  await expect(updateAvatar(profile, image, () => true)).rejects.toThrow('保存に失敗')
  const path = fake.upload.mock.calls[0][0]
  expect(fake.remove).toHaveBeenCalledExactlyOnceWith([path])
})
it('cleans up an upload if signing fails before modifying the profile', async () => {
  fake.sign.mockResolvedValue({ error: Error('sign') })
  await expect(updateAvatar(profile, image, () => true)).rejects.toThrow('確認できません')
  expect(fake.remove).toHaveBeenCalledOnce()
  expect(fake.update).not.toHaveBeenCalled()
})
it('rejects a switched identity before uploading', async () => {
  fake.user.mockResolvedValue({ data: { user: { id: 'other' } }, error: null })
  await expect(updateAvatar(profile, image, () => true)).rejects.toThrow('ログイン')
  expect(fake.upload).not.toHaveBeenCalled()
})
it('rejects an identity change during upload and removes the uncommitted object', async () => {
  let current = true
  fake.upload.mockImplementation(async () => { current = false; return { error: null } })
  await expect(updateAvatar(profile, image, () => current)).rejects.toThrow('変更されました')
  expect(fake.update).not.toHaveBeenCalled()
  expect(fake.remove).toHaveBeenCalledOnce()
})
it('deletes the image and restores an empty profile avatar', async () => {
  const result = await updateAvatar(profile, null, () => true)
  expect(result.avatar_path).toBeNull(); expect(result.avatar_url).toBeNull()
  expect(fake.upload).not.toHaveBeenCalled(); expect(fake.remove).toHaveBeenCalledWith([old])
})
it('keeps a successfully saved image if old-object cleanup fails', async () => {
  fake.remove.mockRejectedValue(Error('network'))
  expect((await updateAvatar(profile, image, () => true)).avatar_path).toBeTruthy()
})
it('uses null comparison for a first image and never deletes an unowned previous path', async () => {
  await updateAvatar({ ...profile, avatar_path: null }, image, () => true)
  expect(fake.is).toHaveBeenCalledWith('avatar_path', null)
  expect(fake.remove).not.toHaveBeenCalled()
  await updateAvatar({ ...profile, avatar_path: 'other/file.webp' }, image, () => true)
  expect(fake.remove).not.toHaveBeenCalled()
})
it('allows login to continue when a signed URL cannot be read', async () => {
  fake.sign.mockRejectedValue(Error('network'))
  expect(await avatarUrl(old)).toBeNull()
})
