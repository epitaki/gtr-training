interface TopPageProps {
  onSelectMode: (mode: string) => void
}

export default function TopPage({ onSelectMode }: TopPageProps) {
  return (
    <div className="max-w-4xl mx-auto font-puyo">
      {/* ヒーローセクション */}
      <div className="bg-white/80 backdrop-blur rounded-2xl shadow-xl border-2 border-puyo-pink/20 p-8 mb-6">
        <h1 className="text-4xl font-extrabold bg-gradient-to-r from-puyo-red via-puyo-pink to-puyo-blue bg-clip-text text-transparent mb-4">
          GTRトレーニングツールへようこそ！
        </h1>
        <p className="text-lg text-puyo-dark/70 mb-6">
          ぷよぷよの重要な連鎖土台「GTR（グレート田中連鎖）」を
          <br />
          ゲームを楽しみながら習得できるトレーニングツールです。
        </p>
        <div className="flex gap-4">
          <button
            onClick={() => onSelectMode('guided')}
            className="px-6 py-3 bg-puyo-green text-white font-bold rounded-2xl hover:scale-105 transition-transform shadow-lg shadow-puyo-green/30"
          >
            初心者用ガイドを始める
          </button>
          <button
            onClick={() => onSelectMode('score-attack')}
            className="px-6 py-3 bg-puyo-red text-white font-bold rounded-2xl hover:scale-105 transition-transform shadow-lg shadow-puyo-red/30"
          >
            スコアアタックに挑戦
          </button>
        </div>
      </div>

      {/* GTRとは */}
      <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg border-2 border-puyo-blue/20 p-8 mb-6">
        <h2 className="text-2xl font-extrabold text-puyo-dark mb-4">GTRとは？</h2>
        <div className="text-puyo-dark/60 space-y-3">
          <p>
            GTR（グレート田中連鎖）は、ぷよぷよにおける効率的な連鎖の土台形の一つです。
          </p>
          <ul className="list-none space-y-2 ml-2">
            <li className="flex items-start gap-2">
              <span className="text-puyo-green font-bold">✓</span>
              <span>2-3列目の特定の形状（折り返し部分）が特徴</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-puyo-green font-bold">✓</span>
              <span>4列目以降に連鎖尾を配置して連鎖を伸ばす</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-puyo-green font-bold">✓</span>
              <span>初心者から上級者まで幅広く使用される定番の形</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-puyo-green font-bold">✓</span>
              <span>本ツールでは基本GTRと1列目拡張GTRを習得できます</span>
            </li>
          </ul>
        </div>
      </div>

      {/* ゲームモード紹介 */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* 初心者用ガイド */}
        <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg border-2 border-puyo-green/30 p-6 hover:shadow-xl hover:border-puyo-green/50 transition-all">
          <div className="text-4xl mb-4">📚</div>
          <h3 className="text-xl font-extrabold text-puyo-dark mb-2">
            初心者用ガイド付きGTR練習
          </h3>
          <p className="text-puyo-dark/60 mb-4">
            リアルタイムでGTRの形をガイド表示。巻き戻し機能で何度でも練習できます。
          </p>
          <ul className="text-sm text-puyo-dark/50 space-y-1 mb-4">
            <li><span className="text-puyo-green font-bold">✓</span> 2手組み合わせ別おすすめ配置</li>
            <li><span className="text-puyo-green font-bold">✓</span> Y字・L字・階段型連鎖尾サンプル</li>
            <li><span className="text-puyo-green font-bold">✓</span> 詳細な評価とフィードバック</li>
            <li><span className="text-puyo-green font-bold">✓</span> 巻き戻し・ポーズ機能</li>
          </ul>
          <button
            onClick={() => onSelectMode('guided')}
            className="w-full px-4 py-2.5 bg-puyo-green text-white font-bold rounded-xl hover:scale-[1.02] transition-transform shadow-md shadow-puyo-green/20"
          >
            始める
          </button>
        </div>

        {/* スコアアタック */}
        <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg border-2 border-puyo-red/30 p-6 hover:shadow-xl hover:border-puyo-red/50 transition-all">
          <div className="text-4xl mb-4">⚡</div>
          <h3 className="text-xl font-extrabold text-puyo-dark mb-2">
            GTR training（スコアアタック）
          </h3>
          <p className="text-puyo-dark/60 mb-4">
            5回のGTR完成を目指す高速プレイモード。スピードと精度を競います。
          </p>
          <ul className="text-sm text-puyo-dark/50 space-y-1 mb-4">
            <li><span className="text-puyo-green font-bold">✓</span> 高速ゲームプレイ</li>
            <li><span className="text-puyo-green font-bold">✓</span> GTR評価システム</li>
            <li><span className="text-puyo-green font-bold">✓</span> 詳細な採点結果</li>
            <li><span className="text-puyo-green font-bold">✓</span> ランキング対応（準備中）</li>
          </ul>
          <button
            onClick={() => onSelectMode('score-attack')}
            className="w-full px-4 py-2.5 bg-puyo-red text-white font-bold rounded-xl hover:scale-[1.02] transition-transform shadow-md shadow-puyo-red/20"
          >
            挑戦する
          </button>
        </div>
      </div>

      {/* 未実装機能 */}
      <div className="bg-puyo-dark/5 rounded-2xl shadow-sm border border-puyo-dark/10 p-6">
        <h3 className="text-lg font-extrabold text-puyo-dark/70 mb-3">開発予定機能</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚔️</span>
            <div>
              <h4 className="font-bold text-puyo-dark/70">対戦モード</h4>
              <p className="text-sm text-puyo-dark/40">
                リアルタイムでGTR構築を競う対戦機能
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-2xl">📊</span>
            <div>
              <h4 className="font-bold text-puyo-dark/70">統計情報</h4>
              <p className="text-sm text-puyo-dark/40">
                スコア履歴やよく使うGTRの形を分析
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
