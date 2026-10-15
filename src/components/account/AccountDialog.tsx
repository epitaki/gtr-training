import { useEffect, useRef, useState } from 'react'
import { useAccount } from '../../auth/useAccount'

type Account = ReturnType<typeof useAccount>

export default function AccountDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const imageInput = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const identity = account.profile ? `${account.profile.environment}:${account.profile.id}` : null
  const [draft, setDraft] = useState({ identity, name: account.profile?.display_name ?? '' })
  const name = draft.identity === identity ? draft.name : account.profile?.display_name ?? ''
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setDraft({ identity, name: account.profile?.display_name ?? '' }) }, [identity, account.profile?.display_name])
  useEffect(() => {
    const bodyOverflow = document.body.style.overflow
    const rootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => { document.body.style.overflow = bodyOverflow; document.documentElement.style.overflow = rootOverflow }
  }, [])
  useEffect(() => {
    panel.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key !== 'Tab' || !panel.current) return
      const elements = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]):not([hidden])')]
      const first = elements[0], last = elements[elements.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !panel.current.contains(document.activeElement))) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [onClose])

  const button = 'min-h-11 border border-[#8f80b5] bg-[#332b4a] px-4 py-2 text-sm text-[#f2ecff] shadow-pixel hover:bg-[#49395f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0d675] disabled:opacity-50'
  const oauth = async (provider: 'google' | 'github') => {
    setError(null)
    try { await account.loginCloud(provider) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'ログインを開始できませんでした') }
  }

  return <div className="fixed inset-0 z-[70] flex items-start justify-end overflow-y-auto bg-[#100d1bcc] px-4 pb-4 pt-20 sm:px-6" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div id="account-dialog" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="account-title" className="w-full max-w-sm border-2 border-[#8f80b5] bg-[#211d33] p-5 text-[#f2ecff] shadow-pixel focus:outline-none">
      <div className="flex items-start justify-between gap-4"><h2 id="account-title" className="font-puyo text-xl">アカウント</h2><button type="button" onClick={onClose} className={button} aria-label="アカウント画面を閉じる">×</button></div>
      {account.status === 'loading' && <p role="status" className="mt-4">確認中...</p>}
      {(error || account.error) && <p role="alert" className="mt-4 text-[#ff9aa5]">{error || account.error}</p>}
      {account.profile ? <div className="mt-5 space-y-4">
        <div className="flex items-center gap-3 border-b border-[#6f648d] pb-4">
          <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center border border-[#8f80b5] bg-[#332b4a] font-puyo text-xl text-[#f0d675]">{account.profile.avatar_url ? <img src={account.profile.avatar_url} alt="" className="h-full w-full object-cover" /> : Array.from(account.profile.display_name)[0]}</span>
          <div className="min-w-0"><p className="break-words">{account.profile.display_name}</p><p className="text-sm text-[#c4bfd3]">{account.profile.provider === 'google' ? 'Google' : account.profile.provider === 'github' ? 'GitHub' : account.profile.provider || 'ログイン中'}</p></div>
        </div>
        <h3 className="text-sm text-[#f0d675]">プロフィール設定</h3>
        <div className="space-y-2">
          <label htmlFor="account-avatar" className="block text-sm">プロフィール画像</label>
          <input id="account-avatar" ref={imageInput} hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={account.status === 'loading'} onChange={event => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void account.saveAvatar(file)
          }} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={account.status === 'loading'} onClick={() => imageInput.current?.click()} className={button}>画像を変更</button>
            {account.profile.avatar_path && <button type="button" disabled={account.status === 'loading'} onClick={() => void account.saveAvatar(null)} className={button}>画像を削除</button>}
          </div>
          <p className="text-xs text-[#c4bfd3]">JPEG・PNG・WebP（20MB以下）。正方形に切り抜き、最大256×256pxに縮小して保存します。</p>
        </div>
        <form onSubmit={event => { event.preventDefault(); void account.saveName(name) }} className="space-y-2">
          <label htmlFor="account-name" className="block text-sm">表示名</label>
          <input id="account-name" value={name} maxLength={50} disabled={account.status === 'loading'} onChange={event => setDraft({ identity, name: event.target.value })} className="min-h-11 w-full border border-[#8f80b5] bg-[#171426] px-3 text-[#f2ecff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0d675]" />
          <button type="submit" disabled={account.status === 'loading'} className={button}>保存</button>
        </form>
        <div className="border-t border-[#6f648d] pt-4"><button type="button" disabled={account.status === 'loading'} onClick={() => void account.logout()} className={button}>ログアウト</button></div>
      </div> : <div className="mt-5 space-y-4">
        <p className="text-sm text-[#c4bfd3]">ゲストとしてこのまま遊べます。{account.configuredCloud && 'Google/GitHubでログインするとページを離れるため、プレイ途中の状態は失われます。'}</p>
        {account.configuredCloud ? <div className="flex flex-wrap gap-3"><button type="button" onClick={() => void oauth('google')} className={button}>Googleでログイン</button><button type="button" onClick={() => void oauth('github')} className={button}>GitHubでログイン</button></div> : <p className="text-sm text-[#c4bfd3]">Google/GitHubログインは利用できません。</p>}
        {account.availableLocal && <button type="button" onClick={() => void account.loginLocal()} className={button}>ローカル管理者でログイン</button>}
      </div>}
    </div>
  </div>
}
