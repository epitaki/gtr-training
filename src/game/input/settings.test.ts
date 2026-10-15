import { afterEach, expect, it, vi } from 'vitest'
import { defaultBindings } from './bindings'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

it('restores a valid versioned binding and leaves corrupt storage untouched', async () => {
  const bindings = defaultBindings()
  bindings.evaluate = ['KeyQ']
  const getItem = vi.fn(() => JSON.stringify({ version: 1, bindings }))
  const setItem = vi.fn()
  vi.stubGlobal('localStorage', { getItem, setItem })
  vi.resetModules()
  let settings = await import('./settings')
  expect(settings.getBindings().evaluate).toEqual(['KeyQ'])
  const corrupt = JSON.stringify({ version: 9, bindings })
  getItem.mockReturnValue(corrupt)
  settings.loadBindings()
  expect(settings.getBindings()).toEqual(defaultBindings())
  expect(settings.getSettingsNotice()).toContain('読めなかった')
  expect(setItem).not.toHaveBeenCalled()
})

it.each([
  { rewind: ['KeyU'], evaluate: ['KeyE'] },
  { rewind: ['KeyT', 'KeyU'], evaluate: ['KeyQ', 'KeyE'] },
])('restores version 1 actions exactly without adding new defaults or writing storage: %j', async actions => {
  const bindings = defaultBindings()
  bindings.rewind = actions.rewind
  bindings.evaluate = actions.evaluate
  const source = JSON.stringify({ version: 1, bindings })
  const getItem = vi.fn(() => source)
  const setItem = vi.fn()
  vi.stubGlobal('localStorage', { getItem, setItem })
  vi.resetModules()
  const settings = await import('./settings')
  expect(settings.getBindings()).toEqual(bindings)
  expect(settings.getBindings().rewind).toEqual(actions.rewind)
  expect(settings.getBindings().evaluate).toEqual(actions.evaluate)
  expect(setItem).not.toHaveBeenCalled()
})

const legacyDefaults = () => ({
  left: ['ArrowLeft', 'Numpad4'], right: ['ArrowRight', 'Numpad6'],
  rotateLeft: ['KeyZ'], rotateRight: ['KeyX'], softDrop: ['ArrowDown', 'KeyV', 'Control'],
  quickDrop: ['ArrowUp', 'Shift', 'KeyC'], pause: ['Escape', 'F1'],
  rewind: ['KeyA', 'KeyU'], evaluate: ['Space', 'KeyE'], guide: ['KeyG'], gravity: ['KeyF'], share: ['KeyR'],
})

it.each([undefined, { mode: 'mouse' }, { mode: 'both' }, { mode: 'unknown' }])(
  'migrates the complete former defaults while ignoring obsolete mouse settings: %j', async mouse => {
    const source = JSON.stringify({ version: 1, bindings: legacyDefaults(), mouse })
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem: () => source, setItem })
    vi.resetModules()
    const settings = await import('./settings')
    expect(settings.getBindings()).toEqual(defaultBindings())
    expect(settings.getSettingsNotice()).toBeNull()
    expect(setItem).not.toHaveBeenCalled()
  },
)

it('preserves customized legacy bindings including additional keys and ignores obsolete mouse mode', async () => {
  const bindings = legacyDefaults()
  bindings.evaluate = ['KeyQ', 'KeyE']
  const source = JSON.stringify({ version: 1, bindings, mouse: { mode: 'mouse' } })
  const setItem = vi.fn()
  vi.stubGlobal('localStorage', { getItem: () => source, setItem })
  vi.resetModules()
  const settings = await import('./settings')
  expect(settings.getBindings()).toEqual(bindings)
  expect(settings.getSettingsNotice()).toBeNull()
  expect(setItem).not.toHaveBeenCalled()
})

it('saves and restores added keys even when they recreate the former defaults', async () => {
  let source: string | null = null
  const setItem = vi.fn((_key: string, value: string) => { source = value })
  vi.stubGlobal('localStorage', { getItem: () => source, setItem })
  vi.resetModules()
  const settings = await import('./settings')
  const bindings = legacyDefaults()
  expect(settings.saveBindings(bindings)).toBe(true)
  const saved = JSON.parse(source!)
  expect(saved.version).toBe(1)
  expect(saved.defaultsRevision).toBe(2)
  expect(saved).not.toHaveProperty('mouse')
  settings.loadBindings()
  expect(settings.getBindings()).toEqual(bindings)
  expect(setItem).toHaveBeenCalledOnce()
})

it('restores fresh defaults and clears notices when storage is absent', async () => {
  let source: string | null = 'broken'
  vi.stubGlobal('localStorage', { getItem: () => source, setItem: vi.fn() })
  vi.resetModules()
  const settings = await import('./settings')
  expect(settings.getSettingsNotice()).not.toBeNull()
  source = null
  settings.loadBindings()
  expect(settings.getBindings()).toEqual(defaultBindings())
  expect(settings.getSettingsNotice()).toBeNull()
})

it('applies valid changes for this run when storage write fails', async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => { throw new Error('quota') },
  })
  vi.resetModules()
  const settings = await import('./settings')
  const bindings = defaultBindings()
  bindings.evaluate = ['KeyQ']
  expect(settings.saveBindings(bindings)).toBe(false)
  expect(settings.getBindings().evaluate).toEqual(['KeyQ'])
  expect(settings.getSettingsNotice()).toContain('今回のみ適用')
})

it('rejects legacy Tab bindings while preserving the saved source and showing a recovery notice', async () => {
  const bindings = defaultBindings()
  bindings.pause = ['Tab']
  const original = JSON.stringify({ version: 1, bindings })
  const getItem = vi.fn(() => original)
  const setItem = vi.fn()
  vi.stubGlobal('localStorage', { getItem, setItem })
  vi.resetModules()
  const settings = await import('./settings')
  expect(settings.getBindings()).toEqual(defaultBindings())
  expect(settings.getSettingsNotice()).toContain('読めなかった')
  expect(getItem()).toBe(original)
  expect(setItem).not.toHaveBeenCalled()
  expect(() => settings.saveBindings(bindings)).toThrow('キー設定が無効です')
  expect(setItem).not.toHaveBeenCalled()
})
