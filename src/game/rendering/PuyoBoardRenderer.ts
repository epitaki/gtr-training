import type * as Phaser from 'phaser'
import type { ChainSnapshot, ChainStage, ChainTrace } from '../core/ChainTrace'
import type { PuyoGrid } from '../core/ChainSimulator'
import type { PuyoColor } from '../core/types'
import { gravityMoveDuration, type PlaybackFrame } from './ChainPlayback'
import { CONNECTION_DIRECTIONS, connections, existingBeforePlacement, newAdjacencyMask, type PuyoConnection } from './PuyoConnections'
import { PuyoRenderer } from './PuyoRenderer'
import { FIELD_CONFIG, TEXT_STYLES } from './VisualConfig'

interface Individual {
  color: PuyoColor
  sprite: Phaser.GameObjects.Sprite
  overlays: Phaser.GameObjects.Sprite[]
}

export class PuyoBoardRenderer {
  private readonly individuals = new Map<string, Individual>()
  private readonly particles = new Map<string, Phaser.GameObjects.Sprite[]>()
  private label?: Phaser.GameObjects.Text
  private current: ChainSnapshot
  private stage?: ChainStage
  private beforeConnections = new Map<string, PuyoConnection>()
  private landedConnections = new Map<string, PuyoConnection>()
  private newMasks = new Map<string, number>()
  private readonly initialNewMasks = new Map<string, number>()
  private readonly prePlacementConnections: Map<string, PuyoConnection>
  private disposed = false

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fieldX: number,
    private readonly fieldY: number,
    private readonly trace: ChainTrace,
    beforePlacement: PuyoGrid,
  ) {
    this.current = trace.initial
    const initialConnections = connections(trace.initial)
    const previous = existingBeforePlacement(trace.initial, beforePlacement)
    this.prePlacementConnections = previous
    for (const [id, connection] of initialConnections) {
      this.initialNewMasks.set(id, newAdjacencyMask(connection, previous.get(id)))
    }
    try {
      for (let y = 0; y < trace.initial.ids.length; y++) for (let x = 0; x < trace.initial.ids[y].length; x++) {
        const id = trace.initial.ids[y][x]
        const color = trace.initial.grid[y][x]
        if (id === null || color === null) continue
        const sprite = scene.add.sprite(this.x(x), this.y(y), PuyoRenderer.textureKey,
          PuyoRenderer.frame(color, `connect/${initialConnections.get(id)?.mask ?? 0}`))
        sprite.setDisplaySize(48, 48).setDepth(20)
        this.individuals.set(id, { color, sprite, overlays: [] })
      }
    } catch (error) {
      this.dispose()
      throw error
    }
  }

  private x(column: number): number { return Math.round(this.fieldX + (column + 0.5) * FIELD_CONFIG.CELL_SIZE) }
  private y(row: number): number { return Math.round(this.fieldY + (row + 0.5) * FIELD_CONFIG.CELL_SIZE) }

  private show(id: string, state: string, mask = 0, entering = 0): void {
    const item = this.individuals.get(id)
    if (!item) return
    item.sprite.setFrame(PuyoRenderer.frame(item.color, state)).setAlpha(1).setVisible(true)
    for (const overlay of item.overlays) overlay?.setVisible(false)
    if (!entering) return
    for (const { bit } of CONNECTION_DIRECTIONS) {
      if (!(entering & bit) || !(mask & bit)) continue
      const rect = PuyoRenderer.shoulderRect(bit)
      const index = CONNECTION_DIRECTIONS.findIndex(direction => direction.bit === bit)
      let overlay = item.overlays[index]
      const overlayX = Math.round(item.sprite.x - 24 + (rect[0] + rect[2] / 2) * 2)
      const overlayY = Math.round(item.sprite.y - 24 + (rect[1] + rect[3] / 2) * 2)
      if (!overlay) {
        overlay = this.scene.add.sprite(overlayX, overlayY, PuyoRenderer.textureKey,
          PuyoRenderer.shoulderFrame(item.color, mask, bit))
        overlay.setDepth(21)
        item.overlays[index] = overlay
      }
      overlay.setFrame(PuyoRenderer.shoulderFrame(item.color, mask, bit))
        .setPosition(overlayX, overlayY).setDisplaySize(rect[2] * 2, rect[3] * 2)
        .setAlpha(item.sprite.alpha).setVisible(true)
    }
  }

  private showConnections(values: Map<string, PuyoConnection>, entering = new Map<string, number>(), excluded = new Set<string>()): void {
    for (const [id, item] of this.individuals) {
      if (excluded.has(id)) continue
      const mask = values.get(id)?.mask ?? 0
      this.show(id, `connect/${mask}`, mask, entering.get(id) ?? 0)
      if (!values.has(id)) item.sprite.setVisible(false)
    }
  }

  private begin(stage: ChainStage): void {
    if (this.stage === stage) return
    const firstStage = this.stage === undefined
    this.stage = stage
    this.clearParticles()
    this.beforeConnections = firstStage ? this.prePlacementConnections : connections(this.current)
    this.newMasks = stage.kind === 'clear' && this.current === this.trace.initial
      ? new Map(this.initialNewMasks) : new Map()
    if (stage.kind === 'gravity') {
      this.landedConnections = connections(stage.after)
      for (const [id, value] of this.landedConnections) {
        this.newMasks.set(id, newAdjacencyMask(value, this.beforeConnections.get(id)))
      }
    }
  }

  frame({ stage, phase, progress }: PlaybackFrame): void {
    if (this.disposed) return
    this.begin(stage)
    if (stage.kind === 'gravity') {
      if (phase === 'gravity') {
        const duration = gravityMoveDuration(Math.max(...stage.moves.map(move => move.to.y - move.from.y)))
        const moving = new Set(stage.moves.map(move => move.id))
        const arrived = new Set<string>()
        const ids = this.current.ids.map(row => row.map(id => id && moving.has(id) ? null : id))
        const grid = this.current.grid.map((row, y) => row.map((color, x) => ids[y][x] ? color : null))
        for (const move of stage.moves) {
          const own = Math.min(1, progress * duration / gravityMoveDuration(move.to.y - move.from.y))
          const item = this.individuals.get(move.id)
          if (!item) continue
          item.sprite.setPosition(this.x(move.to.x), this.y(move.from.y + (move.to.y - move.from.y) * own))
          if (own >= 1) {
            arrived.add(move.id)
            ids[move.to.y][move.to.x] = move.id
            grid[move.to.y][move.to.x] = item.color
          }
        }
        const partial = connections({ ids, grid })
        this.showConnections(partial, new Map(), new Set([...moving].filter(id => !arrived.has(id))))
        for (const move of stage.moves) if (!arrived.has(move.id)) {
          const item = this.individuals.get(move.id)
          if (!item) continue
          const own = Math.min(1, progress * duration / gravityMoveDuration(move.to.y - move.from.y))
          this.show(move.id, `fall/${own < 0.5 ? 0 : 1}`)
        }
      } else {
        for (const move of stage.moves) this.individuals.get(move.id)?.sprite.setPosition(this.x(move.to.x), this.y(move.to.y))
        this.current = stage.after
        const ms = progress * 80
        const landed = new Set(stage.moves.map(move => move.id))
        this.showConnections(this.landedConnections, ms >= 64 && ms < 80 ? this.newMasks : new Map())
        if (ms < 64) for (const id of landed) this.show(id, `land/${ms < 40 ? 0 : 1}`)
      }
      return
    }

    if (!this.label) {
      this.label = this.scene.add.text(this.fieldX + FIELD_CONFIG.COLS * FIELD_CONFIG.CELL_SIZE / 2,
        this.fieldY + FIELD_CONFIG.CELL_SIZE * 2, `${stage.chainIndex}連鎖`, {
          ...TEXT_STYLES.title, fontSize: '28px', color: '#ffdd44', stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(100)
    } else this.label.setText(`${stage.chainIndex}連鎖`)
    const cleared = new Set(stage.cleared.map(value => value.id))
    const elapsed = phase === 'emphasis' ? progress * 120 : progress * 180
    const enter = phase === 'emphasis' && elapsed < 40 ? this.newMasks : new Map<string, number>()
    this.showConnections(connections(this.current), enter, cleared)
    for (const { id } of stage.cleared) {
      const item = this.individuals.get(id)
      if (!item) continue
      if (phase === 'emphasis') this.show(id, 'clear/0')
      else if (elapsed < 120) this.show(id, `clear/${elapsed < 60 ? 1 : 2}`)
      else {
        item.sprite.setVisible(false)
        this.showParticles(id, elapsed - 120)
      }
    }
    if (phase === 'fade' && progress === 1) {
      for (const id of cleared) {
        const item = this.individuals.get(id)
        item?.sprite.destroy()
        item?.overlays.forEach(overlay => overlay?.destroy())
        this.individuals.delete(id)
      }
      this.clearParticles()
      this.current = stage.after
      this.newMasks.clear()
    }
  }

  private showParticles(id: string, elapsed: number): void {
    const item = this.individuals.get(id)
    if (!item) return
    let particles = this.particles.get(id)
    if (!particles) {
      particles = [0, 1, 2].map(index => this.scene.add.sprite(item.sprite.x, item.sprite.y,
        PuyoRenderer.textureKey, PuyoRenderer.frame(item.color, `particle/${index}`))
        .setDisplaySize(12, 12).setDepth(22))
      this.particles.set(id, particles)
    }
    const distance = Math.round(elapsed / 60 * 14)
    const offsets = [[-1, -1], [1, -1], [0, 1]]
    particles.forEach((particle, index) => particle
      .setPosition(Math.round(item.sprite.x + offsets[index][0] * distance), Math.round(item.sprite.y + offsets[index][1] * distance))
      .setAlpha(1 - elapsed / 60).setVisible(elapsed < 60))
  }

  private clearParticles(): void {
    for (const sprites of this.particles.values()) for (const sprite of sprites) sprite.destroy()
    this.particles.clear()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clearParticles()
    for (const item of this.individuals.values()) {
      item.sprite.destroy()
      item.overlays.forEach(overlay => overlay?.destroy())
    }
    this.individuals.clear()
    this.label?.destroy()
    this.label = undefined
  }
}
