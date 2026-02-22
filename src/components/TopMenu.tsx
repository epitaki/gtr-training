import { useState, useEffect } from 'react'
import { testSupabaseConnection, checkEnvironmentVariables } from '../lib/test-connection'

interface TopMenuProps {
  onSelectMode: (mode: 'guided' | 'free' | 'score-attack') => void
}

export default function TopMenu({ onSelectMode }: TopMenuProps) {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [connectionDetails, setConnectionDetails] = useState<string>('')

  useEffect(() => {
    const testConnection = async () => {
      const envCheck = checkEnvironmentVariables()
      console.log('環境変数チェック:', envCheck)

      if (!envCheck.hasUrl || !envCheck.hasKey) {
        setConnected(false)
        setConnectionDetails('環境変数が設定されていません')
        return
      }

      if (!envCheck.urlFormat || !envCheck.keyFormat) {
        setConnected(false)
        setConnectionDetails('環境変数の形式が正しくありません')
        return
      }

      const result = await testSupabaseConnection()
      console.log('Supabase接続テスト結果:', result)
      
      setConnected(result.connected)
      setConnectionDetails(result.details || result.error || '')
    }

    testConnection()
  }, [])

  const getConnectionStatus = () => {
    if (connected === null) return { text: '接続確認中...', color: 'text-yellow-400', details: '' }
    if (connected) return { text: 'Supabase接続OK ✓', color: 'text-green-400', details: connectionDetails }
    return { text: 'Supabase接続エラー ✗', color: 'text-red-400', details: connectionDetails }
  }

  const status = getConnectionStatus()

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl font-bold mb-4 text-white">GTRトレーニングツール</h1>
        <p className="text-xl mb-8 text-gray-300">ぷよぷよGTR練習ゲーム</p>
        
        <div className={`mb-6 text-sm ${status.color}`}>
          {status.text}
        </div>

        <div className="space-y-4 mb-8">
          <button 
            className="w-full bg-blue-600 hover:bg-blue-700 px-8 py-6 rounded-lg font-semibold transition-all transform hover:scale-105 text-lg"
            onClick={() => onSelectMode('guided')}
          >
            初心者用ガイド付きGTR練習
            <p className="text-sm text-blue-200 mt-1">ガイドを見ながらGTRを学ぼう</p>
          </button>
          
          <button 
            className="w-full bg-gray-700 px-8 py-6 rounded-lg font-semibold text-lg opacity-50 cursor-not-allowed"
            disabled
          >
            フリープレイ
            <p className="text-sm text-gray-400 mt-1">（後日実装予定）</p>
          </button>
          
          <button 
            className="w-full bg-purple-600 hover:bg-purple-700 px-8 py-6 rounded-lg font-semibold transition-all transform hover:scale-105 text-lg"
            onClick={() => onSelectMode('score-attack')}
          >
            GTRスコアアタック
            <p className="text-sm text-purple-200 mt-1">5回のGTRを作成しタイムを競おう</p>
          </button>
        </div>

        <div className="text-sm text-gray-400 bg-gray-800 p-4 rounded-lg">
          <h2 className="text-lg font-bold mb-2 text-gray-300">GTRとは？</h2>
          <p className="mb-2">GTR（グレート田中連鎖）は、ぷよぷよにおける効率的な連鎖の土台形の一つです。</p>
          <p className="mb-2">必ず折り返し部分を持ち、2-3列目の特定の形状と4列目以降の連鎖尾で構成されます。</p>
          <p>初心者から上級者まで幅広く使用される定番の形です。</p>
        </div>
      </div>
    </div>
  )
}