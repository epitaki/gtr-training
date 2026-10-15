import type { MenuMode } from '../../App'

interface SideMenuProps { currentMode: MenuMode; onSelectMode: (mode: MenuMode) => void; open: boolean }
const menuItems: { id: MenuMode; label: string; icon: string; available: boolean }[] = [
  { id: 'top', label: 'ホーム', icon: '□', available: true },
  { id: 'guided', label: 'ガイド練習', icon: '◆', available: true },
  { id: 'score-attack', label: 'スコアアタック', icon: '↑', available: true },
  { id: 'history', label: '履歴', icon: '↶', available: true },
  { id: 'gallery', label: 'GTR完成形例', icon: '■', available: true },
  { id: 'battle', label: '対戦', icon: '◇', available: false },
  { id: 'stats', label: '統計', icon: '■', available: false },
]

export default function SideMenu({ currentMode, onSelectMode, open }: SideMenuProps) {
  return (
    <aside id="side-menu" className={`fixed bottom-0 left-0 top-16 z-40 flex w-56 flex-col border-r border-[#6f648d] bg-[#171426] px-3 py-5 text-white transition-transform md:visible md:translate-x-0 ${open ? 'visible translate-x-0' : 'invisible -translate-x-full'}`}>
      <p className="mb-3 px-3 text-xs font-normal tracking-[.2em] text-[#c4bfd3]">PLAY</p>
      <nav className="space-y-1" aria-label="メインメニュー">
        {menuItems.map(item => (
          <button key={item.id} disabled={!item.available} aria-current={currentMode === item.id ? 'page' : undefined} onClick={() => onSelectMode(item.id)} className={`flex w-full items-center gap-3 rounded-none px-3 py-3 text-sm font-normal transition ${currentMode === item.id ? 'bg-[#211d33] text-[#f2ecff] shadow-pixel' : item.available ? 'text-[#c4bfd3] hover:bg-[#211d33] hover:text-white' : 'cursor-not-allowed text-[#c4bfd3]'}`}>
            <span aria-hidden="true" className="grid h-7 w-7 place-items-center text-lg">{item.icon}</span><span>{item.label}</span>{!item.available && <span className="ml-auto text-xs font-normal">SOON</span>}
          </button>
        ))}
      </nav>
    </aside>
  )
}
