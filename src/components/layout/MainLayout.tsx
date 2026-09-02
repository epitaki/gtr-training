import { ReactNode, useEffect, useState } from 'react'
import Header from './Header'
import SideMenu from './SideMenu'
import type { GameMode } from '../../App'

interface MainLayoutProps { currentMode: GameMode; onSelectMode: (mode: GameMode) => void; onLogoClick: () => void; children: ReactNode }

export default function MainLayout({ currentMode, onSelectMode, onLogoClick, children }: MainLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => { setMenuOpen(false); document.getElementById('mobile-menu-trigger')?.focus() }
  const selectMode = (mode: GameMode) => { onSelectMode(mode); setMenuOpen(false) }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && menuOpen) closeMenu() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])
  return (
    <div className="min-h-screen bg-[#f5f6fa]">
      <Header onLogoClick={onLogoClick} onMenuClick={() => setMenuOpen(true)} menuOpen={menuOpen} />
      {menuOpen && <button className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm md:hidden" onClick={closeMenu} aria-label="メニューを閉じる" />}
      <SideMenu currentMode={currentMode} onSelectMode={selectMode} open={menuOpen} />
      <main className="min-h-screen overflow-x-auto pt-16 md:ml-56"><div className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</div></main>
    </div>
  )
}
