interface HeaderProps { onLogoClick: () => void; onMenuClick: () => void; menuOpen: boolean }

export default function Header({ onLogoClick, onMenuClick, menuOpen }: HeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-6">
      <button id="mobile-menu-trigger" onClick={onMenuClick} aria-expanded={menuOpen} aria-controls="side-menu" className="mr-3 grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 md:hidden" aria-label="メニューを開く">
        <span className="text-xl">☰</span>
      </button>
      <button onClick={onLogoClick} className="flex items-center gap-3 text-left">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#171426] text-sm font-black text-white shadow-lg shadow-violet-900/20">G</span>
        <span><b className="block text-sm font-black tracking-tight text-slate-900">GTR TRAINING</b><span className="hidden text-[10px] font-bold tracking-[.15em] text-slate-400 sm:block">BUILD BETTER CHAINS</span></span>
      </button>
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500 sm:block">β version</span>
        <span className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-300 shadow-sm" aria-label="アカウント機能は準備中" role="img">●</span>
      </div>
    </header>
  )
}
