import { ACTIONS, normalizedCode, type Bindings, type BoundAction, type GameAction } from './bindings'

const REPEATING = new Set<GameAction>(['left', 'right', 'softDrop'])
const INTERVAL = 150

/** Input sources are kept separately so releasing one finger or modifier cannot release another. */
export class InputController {
  private bindings: Bindings
  private readonly held = new Map<string, GameAction>()
  private readonly physical = new Set<string>()
  private readonly blocked = new Set<string>()
  private readonly blockedSources = new Set<string>()
  private readonly pending = new Set<GameAction>()
  private readonly last = new Map<GameAction, number>()
  private releaseGate = false

  constructor(bindings: Bindings) { this.bindings = bindings }

  setBindings(bindings: Bindings): void {
    this.bindings = bindings
    this.suppressUntilRelease()
  }

  actionForCode(code: string): BoundAction | undefined {
    const normalized = normalizedCode(code)
    return ACTIONS.find(action => this.bindings[action].includes(normalized))
  }

  pressPhysical(code: string, repeat = false): boolean {
    const action = this.actionForCode(code)
    if (!action) return false
    if (this.physical.has(code)) return true
    if (repeat || this.blocked.has(code)) return true
    this.physical.add(code)
    this.press(action, `key:${code}`)
    return true
  }

  releasePhysical(code: string): void {
    this.physical.delete(code)
    this.blocked.delete(code)
    this.release(`key:${code}`)
  }

  press(action: GameAction, source: string): void {
    if (this.releaseGate || this.held.has(source)) return
    const active = this.isHeld(action)
    this.held.set(source, action)
    if (!active) this.pending.add(action)
  }

  release(source: string): void {
    this.held.delete(source)
    this.blockedSources.delete(source)
    if (this.physical.size === 0 && this.blocked.size === 0 && this.blockedSources.size === 0) this.releaseGate = false
  }

  releaseAll(): void {
    this.held.clear()
    this.physical.clear()
    this.blocked.clear()
    this.blockedSources.clear()
    this.pending.clear()
    this.last.clear()
    this.releaseGate = false
  }

  suppressUntilRelease(): void {
    for (const code of this.physical) this.blocked.add(code)
    for (const source of this.held.keys()) this.blockedSources.add(source)
    this.held.clear()
    this.pending.clear()
    this.last.clear()
    this.releaseGate = this.blocked.size > 0 || this.blockedSources.size > 0
  }

  isHeld(action: GameAction): boolean { return [...this.held.values()].includes(action) }
  isGated(): boolean { return this.releaseGate }

  /** Consume one frame; an edge survives keyup before the next update. */
  frame(time: number): Set<GameAction> {
    if (this.releaseGate) return new Set()
    const result = new Set(this.pending)
    this.pending.clear()
    for (const action of REPEATING) {
      if (!this.isHeld(action)) { this.last.delete(action); continue }
      const previous = this.last.get(action)
      if (result.has(action)) this.last.set(action, time)
      else if (previous === undefined || time - previous >= INTERVAL) {
        result.add(action)
        this.last.set(action, time)
      }
    }
    if ((result.has('left') && result.has('right')) ||
        (result.has('left') && this.isHeld('right')) ||
        (result.has('right') && this.isHeld('left'))) {
      result.delete('left'); result.delete('right')
    }
    if ((result.has('rotateLeft') && result.has('rotateRight')) ||
        (result.has('rotateLeft') && this.isHeld('rotateRight')) ||
        (result.has('rotateRight') && this.isHeld('rotateLeft')) ||
        (this.isHeld('rotateLeft') && this.isHeld('rotateRight'))) {
      result.delete('rotateLeft'); result.delete('rotateRight')
    }
    return result
  }
}
