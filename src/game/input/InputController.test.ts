import { describe, expect, it } from 'vitest'
import { InputController } from './InputController'
import { ACTIONS, bindingConflict, defaultBindings, validateBindings } from './bindings'

describe('keyboard bindings', () => {
  it('starts each action with one key and rejects ambiguous or invalid saved bindings', () => {
    const bindings = defaultBindings()
    expect(bindings.rewind).toEqual(['KeyA'])
    expect(bindings.evaluate).toEqual(['Space'])
    expect(ACTIONS.every(action => bindings[action].length === 1)).toBe(true)
    expect(validateBindings(bindings)).toBe(true)
    bindings.evaluate = ['KeyA']
    expect(bindingConflict(bindings)).toContain('巻戻しと評価')
    expect(validateBindings(bindings)).toBe(false)
    bindings.evaluate = ['OSLeft']
    expect(validateBindings(bindings)).toBe(false)
    bindings.evaluate = ['Tab']
    expect(validateBindings(bindings)).toBe(false)
    expect(bindingConflict(bindings)).toContain('Tabは割り当てできません')
  })

  it('rejects a manually added Space conflict with evaluation', () => {
    const bindings = defaultBindings()
    bindings.quickDrop.push('Space')
    expect(bindings.rewind).toEqual(['KeyA'])
    expect(bindings.evaluate).toEqual(['Space'])
    expect(bindingConflict(bindings)).toContain('Spaceはクイックドロップと評価で重複')
    expect(validateBindings(bindings)).toBe(false)
  })

  it.each([['KeyA', 'KeyU', 'rewind'], ['Space', 'KeyE', 'evaluate']] as const)(
    'handles %s and %s as one %s action until both are released', (first, second, action) => {
      const bindings = defaultBindings()
      bindings[action].push(second)
      const input = new InputController(bindings)
      input.pressPhysical(first)
      expect(input.frame(0)).toEqual(new Set([action]))
      input.pressPhysical(second)
      expect(input.frame(1)).toEqual(new Set())
      input.releasePhysical(first)
      expect(input.frame(2)).toEqual(new Set())
      input.releasePhysical(second)
      input.pressPhysical(second)
      expect(input.frame(3)).toEqual(new Set([action]))
      input.releasePhysical(second)
    },
  )

  it('preserves short press edges, repeats movement at 150ms, and leaves single actions one shot', () => {
    const input = new InputController(defaultBindings())
    input.pressPhysical('KeyX')
    input.releasePhysical('KeyX')
    expect(input.frame(0)).toEqual(new Set(['rotateRight']))
    expect(input.frame(1)).toEqual(new Set())
    input.pressPhysical('ArrowLeft')
    expect(input.frame(10)).toEqual(new Set(['left']))
    expect(input.frame(159)).toEqual(new Set())
    expect(input.frame(160)).toEqual(new Set(['left']))
    input.releasePhysical('ArrowLeft')
    expect(input.frame(310)).toEqual(new Set())
  })

  it('shares action state across synonymous keys and both physical modifiers', () => {
    const bindings = defaultBindings()
    bindings.softDrop.push('Control')
    bindings.left.push('Numpad4')
    const input = new InputController(bindings)
    input.pressPhysical('ControlLeft')
    input.pressPhysical('ControlRight')
    expect(input.frame(0)).toEqual(new Set(['softDrop']))
    input.releasePhysical('ControlLeft')
    expect(input.frame(150)).toEqual(new Set(['softDrop']))
    input.releasePhysical('ControlRight')
    expect(input.frame(300)).toEqual(new Set())
    expect(input.actionForCode('Numpad4')).toBe('left')
  })

  it('cancels opposing movement and rotation, including a new direction against a held one', () => {
    const input = new InputController(defaultBindings())
    input.pressPhysical('ArrowLeft')
    input.pressPhysical('ArrowRight')
    input.pressPhysical('KeyZ')
    input.pressPhysical('KeyX')
    expect(input.frame(0)).toEqual(new Set())
    input.releasePhysical('ArrowRight')
    input.releasePhysical('KeyX')
    expect(input.frame(150)).toEqual(new Set(['left']))
    input.pressPhysical('KeyZ')
    expect(input.frame(151)).toEqual(new Set())
    input.pressPhysical('KeyX')
    expect(input.frame(152)).toEqual(new Set())
  })

  it('cancels opposite short taps even when both keys were released before the frame', () => {
    const input = new InputController(defaultBindings())
    for (const code of ['ArrowLeft', 'ArrowRight', 'KeyZ', 'KeyX']) {
      input.pressPhysical(code)
      input.releasePhysical(code)
    }
    expect(input.frame(0)).toEqual(new Set())
  })

  it.each([
    ['KeyZ', 'KeyX'], ['KeyX', 'KeyZ'],
  ])('cancels a short opposite rotation against held %s, including mixed pointer input', (held, opposite) => {
    for (const pointer of [false, true]) {
      const input = new InputController(defaultBindings())
      const heldAction = held === 'KeyZ' ? 'rotateLeft' : 'rotateRight'
      if (pointer) input.press(heldAction, 'pointer:rotate:1')
      else input.pressPhysical(held)
      expect(input.frame(0)).toEqual(new Set([heldAction]))
      input.pressPhysical(opposite)
      input.releasePhysical(opposite)
      expect(input.frame(1)).toEqual(new Set())
      if (pointer) input.release('pointer:rotate:1')
      else input.releasePhysical(held)
      expect(input.frame(2)).toEqual(new Set())
    }
  })

  it('waits for semantic and physical sources to release after a state change', () => {
    const input = new InputController(defaultBindings())
    input.press('quickDrop', 'pointer:quickDrop:1')
    expect(input.frame(0)).toEqual(new Set(['quickDrop']))
    input.suppressUntilRelease()
    input.releasePhysical('ArrowUp')
    expect(input.isGated()).toBe(true)
    input.press('quickDrop', 'pointer:quickDrop:2')
    input.pressPhysical('ArrowUp')
    expect(input.isGated()).toBe(true)
    expect(input.frame(1)).toEqual(new Set())
    input.release('pointer:quickDrop:1')
    input.releasePhysical('ArrowUp')
    expect(input.isGated()).toBe(false)
    expect(input.frame(2)).toEqual(new Set())
    input.release('pointer:quickDrop:2')
    input.press('quickDrop', 'pointer:quickDrop:3')
    expect(input.frame(3)).toEqual(new Set(['quickDrop']))
    input.releaseAll()
    expect(input.isGated()).toBe(false)
  })

  it('drops held edges on apply and waits for old sources to release', () => {
    const input = new InputController(defaultBindings())
    input.pressPhysical('KeyX')
    input.setBindings(defaultBindings())
    expect(input.frame(0)).toEqual(new Set())
    input.pressPhysical('KeyX', true)
    expect(input.frame(150)).toEqual(new Set())
    input.releasePhysical('KeyX')
    input.pressPhysical('KeyX')
    expect(input.frame(151)).toEqual(new Set(['rotateRight']))
    input.releaseAll()
    input.pressPhysical('KeyX', true)
    expect(input.frame(152)).toEqual(new Set())
    input.releasePhysical('KeyX')
    input.pressPhysical('KeyX')
    expect(input.frame(153)).toEqual(new Set(['rotateRight']))
  })
})
