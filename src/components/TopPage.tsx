interface TopPageProps {
  onSelectMode: (mode: string) => void
}

export default function TopPage({ onSelectMode }: TopPageProps) {
  return (
    <div className="max-w-4xl mx-auto">
      {/* ヒーローセクション */}
      <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          GTRトレーニングツールへようこそ！
        </h1>
        <p className="text-lg text-gray-600 mb-6">
          ぷよぷよの重要な連鎖土台「GTR（グレート田中連鎖）」を
          <br />
          ゲームを楽しみながら習得できるトレーニングツールです。
        </p>
        <div className="flex gap-4">
          <button
            onClick={() => onSelectMode('guided')}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            初心者用ガイドを始める
          </button>
          <button
            onClick={() => onSelectMode('score-attack')}
            className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors"
          >
            スコアアタックに挑戦
          </button>
        </div>
      </div>

      {/* GTRとは */}
      <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">GTRとは？</h2>
        <div className="text-gray-600 space-y-3">
          <p>
            GTR（グレート田中連鎖）は、ぷよぷよにおける効率的な連鎖の土台形の一つです。
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>2-3列目の特定の形状（折り返し部分）が特徴</li>
            <li>4列目以降に連鎖尾を配置して連鎖を伸ばす</li>
            <li>初心者から上級者まで幅広く使用される定番の形</li>
            <li>本ツールでは基本GTRと1列目拡張GTRを習得できます</li>
          </ul>
        </div>
      </div>

      {/* ゲームモード紹介 */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* 初心者用ガイド */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="text-4xl mb-4">📚</div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">
            初心者用ガイド付きGTR練習
          </h3>
          <p className="text-gray-600 mb-4">
            リアルタイムでGTRの形をガイド表示。巻き戻し機能で何度でも練習できます。
          </p>
          <ul className="text-sm text-gray-500 space-y-1 mb-4">
            <li>✓ 2手組み合わせ別おすすめ配置</li>
            <li>✓ Y字・L字・階段型連鎖尾サンプル</li>
            <li>✓ 詳細な評価とフィードバック</li>
            <li>✓ 巻き戻し・ポーズ機能</li>
          </ul>
          <button
            onClick={() => onSelectMode('guided')}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            始める
          </button>
        </div>

        {/* スコアアタック */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="text-4xl mb-4">⚡</div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">
            GTR training（スコアアタック）
          </h3>
          <p className="text-gray-600 mb-4">
            5回のGTR完成を目指す高速プレイモード。スピードと精度を競います。
          </p>
          <ul className="text-sm text-gray-500 space-y-1 mb-4">
            <li>✓ 高速ゲームプレイ</li>
            <li>✓ GTR評価システム</li>
            <li>✓ 詳細な採点結果</li>
            <li>✓ ランキング対応（準備中）</li>
          </ul>
          <button
            onClick={() => onSelectMode('score-attack')}
            className="w-full px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
          >
            挑戦する
          </button>
        </div>
      </div>

      {/* 未実装機能 */}
      <div className="bg-gray-50 rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-700 mb-3">開発予定機能</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚔️</span>
            <div>
              <h4 className="font-semibold text-gray-700">対戦モード</h4>
              <p className="text-sm text-gray-500">
                リアルタイムでGTR構築を競う対戦機能
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-2xl">📊</span>
            <div>
              <h4 className="font-semibold text-gray-700">統計情報</h4>
              <p className="text-sm text-gray-500">
                スコア履歴やよく使うGTRの形を分析
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
