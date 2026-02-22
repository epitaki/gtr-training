import { ReactNode } from 'react'
import Header from './Header'
import SideMenu from './SideMenu'

interface MainLayoutProps {
  currentMode: string
  onSelectMode: (mode: string) => void
  onLogoClick: () => void
  children: ReactNode
}

export default function MainLayout({
  currentMode,
  onSelectMode,
  onLogoClick,
  children,
}: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-puyo-bg">
      {/* ヘッダー：高さ64px、固定、全幅 */}
      <Header onLogoClick={onLogoClick} />

      {/* サイドメニュー：幅256px、固定、ヘッダー下からフル高さ */}
      <SideMenu currentMode={currentMode} onSelectMode={onSelectMode} />

      {/* コンテンツエリア：残りの領域、左側にサイドメニュー分のマージン */}
      <main className="ml-64 pt-16 min-h-screen">
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
