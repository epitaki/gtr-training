import { useState } from 'react'

interface HeaderProps {
  onLogoClick: () => void
}

export default function Header({ onLogoClick }: HeaderProps) {
  const [showAccountMenu, setShowAccountMenu] = useState(false)

  const handleLogoClick = () => {
    // ゲーム進行状況を破棄してTOP画面に戻る
    if (confirm('ゲームの進行状況が破棄されますが、よろしいですか？')) {
      onLogoClick()
    }
  }

  return (
    <header className="h-16 bg-gradient-to-r from-puyo-red via-puyo-pink to-puyo-yellow shadow-lg flex items-center justify-between px-6 fixed top-0 left-0 right-0 z-50">
      {/* サイトロゴ */}
      <button
        onClick={handleLogoClick}
        className="font-puyo font-extrabold text-3xl text-white drop-shadow-md tracking-wide hover:scale-105 transition-transform"
      >
        GTR-training
      </button>

      {/* アカウントアイコン */}
      <div className="relative">
        <button
          onClick={() => setShowAccountMenu(!showAccountMenu)}
          className="w-10 h-10 rounded-full bg-white/90 text-puyo-pink flex items-center justify-center hover:bg-white hover:scale-110 transition-all shadow-md"
          aria-label="アカウントメニュー"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </button>

        {/* アカウントメニュー（ドロップダウン） */}
        {showAccountMenu && (
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border-2 border-puyo-pink/20 py-2 font-puyo">
            <div className="px-4 py-2 border-b border-puyo-pink/10">
              <p className="text-sm text-gray-500">ログインしていません</p>
            </div>
            <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-puyo-bg transition-colors">
              ログイン
            </button>
            <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-puyo-bg transition-colors">
              新規登録
            </button>
            <div className="border-t border-puyo-pink/10 mt-2 pt-2">
              <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-puyo-bg transition-colors">
                設定
              </button>
              <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-puyo-bg transition-colors">
                ヘルプ
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
