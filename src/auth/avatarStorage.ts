import { supabase } from '../lib/supabase'
import type { AccountProfile } from './account'
import { AVATAR_MAX_BYTES } from './avatarImage'

export const AVATAR_BUCKET = 'avatars'
export function ownedAvatar(path: string | null | undefined, id: string): path is string {
  return !!path && path.startsWith(`${id}/`) && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(path)
}

export async function avatarUrl(path: string | null | undefined): Promise<string | null> {
  if (!supabase || !path) return null
  try {
    const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, 3600)
    return error ? null : data?.signedUrl ?? null
  } catch { return null }
}

/** New object names avoid overwrites; compare-and-swap prevents competing saves losing an image. */
export async function updateAvatar(profile: AccountProfile, image: Blob | null, isCurrent: () => boolean): Promise<AccountProfile> {
  if (!supabase) throw new Error('Supabaseが設定されていません')
  if (image && (image.type !== 'image/webp' || !image.size || image.size > AVATAR_MAX_BYTES)) throw new Error('画像の形式またはサイズが不正です')
  const client = supabase
  const storage = client.storage.from(AVATAR_BUCKET)
  const verify = async () => {
    if (!isCurrent()) throw new Error('アカウントが変更されました。やり直してください')
    const result = await client.auth.getUser()
    if (!isCurrent() || result.error || result.data.user?.id !== profile.id) throw new Error('ログインを確認してください')
  }
  await verify()
  const path = image ? `${profile.id}/${crypto.randomUUID()}.webp` : null
  let uploaded = false
  let url: string | null = null
  try {
    if (image && path) {
      const { error } = await storage.upload(path, image, { contentType: 'image/webp', upsert: false })
      if (error) throw new Error('画像のアップロードに失敗しました。もう一度お試しください')
      uploaded = true
      url = await avatarUrl(path)
      if (!url) throw new Error('保存した画像を確認できませんでした。もう一度お試しください')
    }
    await verify()
    let request = client.from('profiles').update({ avatar_path: path }).eq('id', profile.id)
    request = profile.avatar_path ? request.eq('avatar_path', profile.avatar_path) : request.is('avatar_path', null)
    const { error } = await request.select('id').single()
    if (error) throw new Error('画像の保存に失敗しました。再読み込みしてお試しください')
  } catch (error) {
    if (uploaded && path) await storage.remove([path]).catch(() => undefined)
    throw error
  }
  // A cleanup failure must not undo a successfully saved profile.
  if (ownedAvatar(profile.avatar_path, profile.id)) await storage.remove([profile.avatar_path]).catch(() => undefined)
  return { ...profile, avatar_path: path, avatar_url: url }
}
