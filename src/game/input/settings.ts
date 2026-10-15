import { ACTIONS, defaultBindings, validateBindings, type Bindings } from './bindings'

export const KEY_SETTINGS_STORAGE_KEY = 'gtr-key-bindings-v1'
let current = defaultBindings()
let notice: string | null = null
const listeners = new Set<() => void>()

function publish() { listeners.forEach(listener => listener()) }

export function getBindings(): Bindings { return current }
export function getSettingsNotice(): string | null { return notice }
export function subscribeBindings(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// Only the complete former setting 2 defaults migrate. Any custom keys stay intact.
const legacyDefaults: Bindings = {
  left: ['ArrowLeft', 'Numpad4'], right: ['ArrowRight', 'Numpad6'],
  rotateLeft: ['KeyZ'], rotateRight: ['KeyX'], softDrop: ['ArrowDown', 'KeyV', 'Control'],
  quickDrop: ['ArrowUp', 'Shift', 'KeyC'], pause: ['Escape', 'F1'],
  rewind: ['KeyA', 'KeyU'], evaluate: ['Space', 'KeyE'], guide: ['KeyG'], gravity: ['KeyF'], share: ['KeyR'],
}

function isLegacyDefault(bindings: Bindings): boolean {
  return ACTIONS.every(action => bindings[action].length === legacyDefaults[action].length &&
    bindings[action].every((code, index) => code === legacyDefaults[action][index]))
}

export function loadBindings(): void {
  try {
    const raw = localStorage.getItem(KEY_SETTINGS_STORAGE_KEY)
    if (raw === null) {
      current = defaultBindings()
      notice = null
      publish()
      return
    }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || (parsed as { version?: unknown }).version !== 1 ||
        !validateBindings((parsed as { bindings?: unknown }).bindings)) throw new Error('invalid bindings')
    const bindings = (parsed as { bindings: Bindings }).bindings
    current = (parsed as { defaultsRevision?: unknown }).defaultsRevision === undefined && isLegacyDefault(bindings)
      ? defaultBindings() : bindings
    notice = null
  } catch {
    current = defaultBindings()
    notice = '保存されたキー設定を読めなかったため、設定1の初期設定を使用しています。元のデータは保持しました。'
  }
  publish()
}

export function saveBindings(bindings: Bindings): boolean {
  if (!validateBindings(bindings)) throw new Error('キー設定が無効です')
  current = structuredClone(bindings)
  let saved = true
  try {
    localStorage.setItem(KEY_SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, defaultsRevision: 2, bindings: current }))
    notice = null
  } catch {
    saved = false
    notice = '今回のみ適用しました。保存できなかったため、次回は以前の設定で始まります。'
  }
  publish()
  return saved
}

loadBindings()
