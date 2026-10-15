import { ReactNode, useEffect, useState } from 'react'
import Header from './Header'
import SideMenu from './SideMenu'
import type { MenuMode } from '../../App'

interface MainLayoutProps { currentMode: MenuMode; onSelectMode: (mode: MenuMode) => void; onLogoClick: () => void; onAccountClick: () => void; accountLabel: string; accountOpen: boolean; accountSignedIn: boolean; accountAvatarUrl?: string | null; children: ReactNode }

export default function MainLayout({ currentMode, onSelectMode, onLogoClick, onAccountClick, accountLabel, accountOpen, accountSignedIn, accountAvatarUrl, children }: MainLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => { setMenuOpen(false); document.getElementById('mobile-menu-trigger')?.focus() }
  const selectMode = (mode: MenuMode) => { onSelectMode(mode); setMenuOpen(false) }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && menuOpen) closeMenu() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])
  return (
    <div className="min-h-screen bg-[#171426]">
      <Header onLogoClick={onLogoClick} onMenuClick={() => setMenuOpen(true)} menuOpen={menuOpen} onAccountClick={onAccountClick} accountLabel={accountLabel} accountOpen={accountOpen} accountSignedIn={accountSignedIn} accountAvatarUrl={accountAvatarUrl} />
      {menuOpen && <button className="fixed inset-0 z-30 bg-[#211d33]  md:hidden" onClick={closeMenu} aria-label="メニューを閉じる" />}
      <SideMenu currentMode={currentMode} onSelectMode={selectMode} open={menuOpen} />
      <main className="min-h-screen pt-16 md:ml-56"><div className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</div></main>
    </div>
  )
}
