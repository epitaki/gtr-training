import { GameState, Field, PuyoColor } from './types'

interface HistoryState {
  field: Field
  currentPair: GameState['currentPair']
  nextPair: GameState['nextPair']
  nextNextPair: GameState['nextNextPair']
  score: number
  gtrCount: number
  gtrScore: number
}

export class GameHistory {
  private history: HistoryState[] = []
  private readonly MAX_HISTORY = 100
  
  saveState(gameState: GameState) {
    // フィールドのディープコピー
    const fieldCopy: Field = {
      width: gameState.field.width,
      height: gameState.field.height,
      grid: gameState.field.grid.map(row => [...row])
    }
    
    const state: HistoryState = {
      field: fieldCopy,
      currentPair: gameState.currentPair ? { ...gameState.currentPair } : null,
      nextPair: gameState.nextPair ? { ...gameState.nextPair } : null,
      nextNextPair: gameState.nextNextPair ? { ...gameState.nextNextPair } : null,
      score: gameState.score,
      gtrCount: gameState.gtrCount,
      gtrScore: gameState.gtrScore
    }
    
    this.history.push(state)
    
    // 履歴の上限を超えたら古いものを削除
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift()
    }
  }
  
  rewind(): HistoryState | null {
    if (this.history.length <= 1) {
      return null // 巻き戻せない
    }
    
    // 現在の状態を削除
    this.history.pop()
    
    // 一つ前の状態を返す
    const previousState = this.history[this.history.length - 1]
    return previousState ? { ...previousState } : null
  }
  
  clear() {
    this.history = []
  }
  
  getHistoryLength(): number {
    return this.history.length
  }
}