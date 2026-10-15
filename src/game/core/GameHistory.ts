import { GameState, Field, PuyoPair } from './types'

function copyPair(pair: PuyoPair | null): PuyoPair | null {
  return pair ? { ...pair, main: { ...pair.main }, sub: { ...pair.sub } } : null
}

export interface GameHistoryState {
  field: Field
  currentPair: GameState['currentPair']
  nextPair: GameState['nextPair']
  nextNextPair: GameState['nextNextPair']
  score: number
  gtrCount: number
  gtrScore: number
  pairRandomState: GameState['pairRandomState']
}

export function cloneGameHistoryState(state: GameHistoryState): GameHistoryState {
  return {
    ...state,
    field: { ...state.field, grid: state.field.grid.map(row => [...row]) },
    currentPair: copyPair(state.currentPair),
    nextPair: copyPair(state.nextPair),
    nextNextPair: copyPair(state.nextNextPair),
  }
}

export class GameHistory {
  private history: GameHistoryState[] = []
  private readonly MAX_HISTORY = 100
  
  saveState(gameState: GameState) {
    // フィールドのディープコピー
    const fieldCopy: Field = {
      width: gameState.field.width,
      height: gameState.field.height,
      grid: gameState.field.grid.map(row => [...row])
    }
    
    const state: GameHistoryState = {
      field: fieldCopy,
      currentPair: copyPair(gameState.currentPair),
      nextPair: copyPair(gameState.nextPair),
      nextNextPair: copyPair(gameState.nextNextPair),
      score: gameState.score,
      gtrCount: gameState.gtrCount,
      gtrScore: gameState.gtrScore,
      pairRandomState: gameState.pairRandomState,
    }
    
    this.history.push(state)
    
    // 履歴の上限を超えたら古いものを削除
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift()
    }
  }
  
  rewind(): GameHistoryState | null {
    if (this.history.length <= 1) {
      return null // 巻き戻せない
    }
    
    // 現在の状態を削除
    this.history.pop()
    
    // 一つ前の状態を返す
    const previousState = this.history[this.history.length - 1]
    return previousState ? cloneGameHistoryState(previousState) : null
  }
  
  clear() {
    this.history = []
  }
  
  getHistoryLength(): number {
    return this.history.length
  }

  getPreviousState(): GameHistoryState | null {
    const previousState = this.history[this.history.length - 2]
    return previousState ? cloneGameHistoryState(previousState) : null
  }
}
