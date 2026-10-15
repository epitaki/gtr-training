interface HeaderProps { onLogoClick: () => void; onMenuClick: () => void; menuOpen: boolean; onAccountClick: () => void; accountLabel: string; accountOpen: boolean; accountSignedIn: boolean; accountAvatarUrl?: string | null }

export default function Header({ onLogoClick, onMenuClick, menuOpen, onAccountClick, accountLabel, accountOpen, accountSignedIn, accountAvatarUrl }: HeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center border-b border-[#6f648d] bg-[#211d33] px-4  sm:px-6">
      <button id="mobile-menu-trigger" onClick={onMenuClick} aria-expanded={menuOpen} aria-controls="side-menu" className="mr-3 grid h-12 w-12 place-items-center rounded-none text-[#c4bfd3] hover:bg-[#211d33] md:hidden" aria-label="メニューを開く">
        <span className="text-xl">≡</span>
      </button>
      <button onClick={onLogoClick} className="flex items-center gap-3 text-left">
        <span className="grid h-9 w-9 place-items-center rounded-none bg-[#171426] text-sm font-normal text-white shadow-pixel">G</span>
        <b className="block text-sm font-normal tracking-tight text-[#c4bfd3]">GTRE TRAINING</b>
      </button>
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden rounded-none bg-[#211d33] px-3 py-1.5 text-xs font-normal text-[#c4bfd3] sm:block">β version</span>
        <button type="button" onClick={onAccountClick} className="flex h-11 min-w-11 items-center gap-2 border border-[#8f80b5] bg-[#332b4a] px-3 text-sm text-[#f2ecff] shadow-pixel hover:bg-[#49395f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0d675]" aria-label={`アカウントを開く: ${accountLabel}`} aria-haspopup="dialog" aria-expanded={accountOpen} aria-controls={accountOpen ? 'account-dialog' : undefined} title={accountSignedIn ? accountLabel : undefined}>
          <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden text-[#f0d675]">{accountAvatarUrl ? <img src={accountAvatarUrl} alt="" className="h-full w-full object-cover" /> : '●'}</span>
          <span className="max-w-20 truncate sm:max-w-36">{accountSignedIn ? accountLabel : 'ログイン'}</span>
        </button>
      </div>
    </header>
  )
}
