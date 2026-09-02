import type { GameMode } from '../../App'

interface SideMenuProps { currentMode: GameMode; onSelectMode: (mode: GameMode) => void; open: boolean }
const menuItems: { id: GameMode; label: string; icon: string; available: boolean }[] = [
  { id: 'top', label: 'ホーム', icon: '⌂', available: true },
  { id: 'guided', label: 'ガイド練習', icon: '◈', available: true },
  { id: 'score-attack', label: 'スコアアタック', icon: '↗', available: true },
  { id: 'battle', label: '対戦', icon: '◇', available: false },
  { id: 'stats', label: '統計', icon: '▥', available: false },
]

export default function SideMenu({ currentMode, onSelectMode, open }: SideMenuProps) {
  return (
    <aside id="side-menu" className={`fixed bottom-0 left-0 top-16 z-40 flex w-56 flex-col border-r border-white/5 bg-[#171426] px-3 py-5 text-white transition-transform md:visible md:translate-x-0 ${open ? 'visible translate-x-0' : 'invisible -translate-x-full'}`}>
      <p className="mb-3 px-3 text-[10px] font-extrabold tracking-[.2em] text-slate-500">PLAY</p>
      <nav className="space-y-1" aria-label="メインメニュー">
        {menuItems.map(item => (
          <button key={item.id} disabled={!item.available} aria-current={currentMode === item.id ? 'page' : undefined} onClick={() => onSelectMode(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition ${currentMode === item.id ? 'bg-white text-[#171426] shadow-lg' : item.available ? 'text-slate-400 hover:bg-white/[.06] hover:text-white' : 'cursor-not-allowed text-slate-700'}`}>
            <span aria-hidden="true" className="grid h-7 w-7 place-items-center text-lg">{item.icon}</span><span>{item.label}</span>{!item.available && <span className="ml-auto text-[9px] font-bold">SOON</span>}
          </button>
        ))}
      </nav>
      <div className="mt-auto rounded-2xl border border-white/[.07] bg-white/[.04] p-4">
        <p className="text-xs font-bold text-white">操作に迷ったら</p><p className="mt-1 text-[11px] leading-5 text-slate-500">ガイド練習でおすすめの一手を確認できます。</p>
      </div>
    </aside>
  )
}
