interface SideMenuProps {
  currentMode: string
  onSelectMode: (mode: string) => void
}

interface MenuItem {
  id: string
  label: string
  icon: string
  description: string
  available: boolean
}

const menuItems: MenuItem[] = [
  {
    id: 'top',
    label: 'TOP',
    icon: '🏠',
    description: 'トップページ',
    available: true,
  },
  {
    id: 'score-attack',
    label: 'GTR training',
    icon: '⚡',
    description: 'スコアアタック',
    available: true,
  },
  {
    id: 'guided',
    label: '初心者用ガイド',
    icon: '📚',
    description: 'ガイド付きGTR練習',
    available: true,
  },
  {
    id: 'battle',
    label: '対戦モード',
    icon: '⚔️',
    description: 'GTR training対戦',
    available: false,
  },
  {
    id: 'stats',
    label: '統計情報',
    icon: '📊',
    description: 'スコア履歴・分析',
    available: false,
  },
]

export default function SideMenu({ currentMode, onSelectMode }: SideMenuProps) {
  return (
    <aside className="w-64 bg-gray-900 text-white fixed left-0 top-16 bottom-0 overflow-y-auto shadow-xl">
      <nav className="py-4">
        <div className="px-4 mb-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            メニュー
          </h2>
        </div>

        <ul className="space-y-1">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => item.available && onSelectMode(item.id)}
                disabled={!item.available}
                className={`
                  w-full text-left px-4 py-3 flex items-start gap-3 transition-colors
                  ${
                    currentMode === item.id
                      ? 'bg-blue-600 text-white'
                      : item.available
                      ? 'hover:bg-gray-800 text-gray-300'
                      : 'text-gray-600 cursor-not-allowed'
                  }
                `}
              >
                <span className="text-2xl">{item.icon}</span>
                <div className="flex-1">
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {item.description}
                  </div>
                  {!item.available && (
                    <span className="text-xs text-red-400 mt-1 inline-block">
                      （未実装）
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>

        {/* ユーザー情報エリア（将来実装） */}
        <div className="mt-8 px-4">
          <div className="border-t border-gray-700 pt-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              ユーザー情報
            </h3>
            <p className="text-sm text-gray-500">ログインしていません</p>
          </div>
        </div>
      </nav>
    </aside>
  )
}
