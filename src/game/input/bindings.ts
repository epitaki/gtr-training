export const BASIC_ACTIONS = ['left', 'right', 'rotateLeft', 'rotateRight', 'softDrop', 'quickDrop', 'pause'] as const
export const APP_ACTIONS = ['rewind', 'evaluate', 'guide', 'gravity', 'share'] as const
export const ACTIONS = [...BASIC_ACTIONS, ...APP_ACTIONS] as const
export type GameAction = typeof ACTIONS[number] | 'exit' | 'newGame'
export type BoundAction = typeof ACTIONS[number]
export type Bindings = Record<BoundAction, string[]>

export const ACTION_LABELS: Record<GameAction, string> = {
  left: '左移動', right: '右移動', rotateLeft: '左回転', rotateRight: '右回転',
  softDrop: '高速落下', quickDrop: 'クイックドロップ', pause: 'ポーズ',
  rewind: '巻戻し', evaluate: '評価', guide: 'ガイド', gravity: '自由落下',
  share: '共有', exit: '終了', newGame: '新しいゲーム',
}

export function defaultBindings(): Bindings {
  return {
    left: ['ArrowLeft'], right: ['ArrowRight'], rotateLeft: ['KeyZ'], rotateRight: ['KeyX'],
    softDrop: ['ArrowDown'], quickDrop: ['ArrowUp'], pause: ['Escape'],
    rewind: ['KeyA'], evaluate: ['Space'], guide: ['KeyG'], gravity: ['KeyF'], share: ['KeyR'],
  }
}

export const ALLOWED_CODES = new Set([
  ...Array.from({ length: 26 }, (_, index) => `Key${String.fromCharCode(65 + index)}`),
  ...Array.from({ length: 10 }, (_, index) => `Digit${index}`),
  ...Array.from({ length: 10 }, (_, index) => `Numpad${index}`),
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Escape',
  'Control', 'Shift', 'Enter', 'Backspace', 'Comma', 'Period', 'Slash',
  'Semicolon', 'Quote', 'BracketLeft', 'BracketRight', 'Minus', 'Equal',
])

export function normalizedCode(code: string): string {
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Control'
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift'
  return code
}

export function validateBindings(value: unknown): value is Bindings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const object = value as Record<string, unknown>
  if (Object.keys(object).length !== ACTIONS.length) return false
  const owners = new Set<string>()
  for (const action of ACTIONS) {
    const codes = object[action]
    if (!Array.isArray(codes) || codes.length === 0 || codes.length > 8) return false
    for (const code of codes) {
      if (typeof code !== 'string' || !ALLOWED_CODES.has(code) || normalizedCode(code) !== code || owners.has(code)) return false
      owners.add(code)
    }
  }
  return true
}

export function bindingConflict(bindings: Bindings): string | null {
  const owners = new Map<string, BoundAction>()
  for (const action of ACTIONS) {
    if (!bindings[action].length) return `${ACTION_LABELS[action]}にキーを1つ以上割り当ててください`
    if (bindings[action].length > 8) return `${ACTION_LABELS[action]}の割当は8キーまでです`
    for (const code of bindings[action]) {
      if (!ALLOWED_CODES.has(code) || normalizedCode(code) !== code) return `${code}は割り当てできません`
      const previous = owners.get(code)
      if (previous) return `${displayCode(code)}は${ACTION_LABELS[previous]}と${ACTION_LABELS[action]}で重複しています`
      owners.set(code, action)
    }
  }
  return null
}

export function displayCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Numpad')) return `Num${code.slice(6)}`
  if (code.startsWith('Arrow')) return ({ ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' } as Record<string, string>)[code] ?? code
  return code === 'Space' ? 'Space' : code === 'Control' ? 'Ctrl' : code
}

export function actionKeys(bindings: Bindings, action: BoundAction): string {
  return bindings[action].map(displayCode).join(' / ')
}
