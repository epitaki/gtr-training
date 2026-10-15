import type { ChainSnapshot, ChainTrace, ClearStage } from '../core/ChainTrace'
import { cloneGrid, type PuyoGrid } from '../core/ChainSimulator'
import type { Position } from '../core/types'

export interface ResultChainFrame {
  grid: PuyoGrid
  fading: readonly Position[]
  alpha: number
  chainIndex: number | null
  starterPosition: Position | null
  phase: 'initial' | 'fade' | 'gap' | 'complete'
}

export interface ResultChainSink {
  frame(frame: ResultChainFrame): void
}

const INITIAL_MS = 600
const FADE_MS = 300
const GAP_MS = 200
const MAX_DELTA_MS = 50

/** A trace-only, display-only player. Gravity changes the shown snapshot instantly. */
export class ResultChainPlayback {
  private readonly clears: ClearStage[]
  private clearIndex = 0
  private elapsed = 0
  private phase: ResultChainFrame['phase'] = 'initial'
  private snapshot: ChainSnapshot
  private disposed = false

  constructor(
    private readonly trace: ChainTrace,
    private readonly sink: ResultChainSink,
    private readonly starterId?: string,
  ) {
    this.clears = trace.stages.filter((stage): stage is ClearStage => stage.kind === 'clear')
    this.snapshot = trace.initial
    this.sink.frame(this.makeFrame())
    if (!this.clears.length) this.finish()
  }

  get isFinished(): boolean { return this.phase === 'complete' }

  cancel(): void { this.disposed = true }

  replay(): void {
    if (this.disposed) return
    this.clearIndex = 0
    this.elapsed = 0
    this.phase = 'initial'
    this.snapshot = this.trace.initial
    this.sink.frame(this.makeFrame())
    if (!this.clears.length) this.finish()
  }

  update(delta: number): void {
    if (this.disposed || this.isFinished || !Number.isFinite(delta) || delta <= 0) return
    let remaining = Math.min(delta, MAX_DELTA_MS)
    while (remaining > 0 && !this.isFinished) {
      const duration = this.phase === 'initial' ? INITIAL_MS : this.phase === 'fade' ? FADE_MS : GAP_MS
      const step = Math.min(remaining, duration - this.elapsed)
      this.elapsed += step
      remaining -= step
      if (this.phase === 'fade') this.sink.frame(this.makeFrame())
      if (this.elapsed < duration) break
      this.elapsed = 0
      if (this.phase === 'initial') {
        const firstClear = this.clears[0]
        const initialGravity = this.trace.stages.slice(0, this.trace.stages.indexOf(firstClear))
          .reverse().find(stage => stage.kind === 'gravity')
        if (initialGravity) this.snapshot = initialGravity.after
        this.phase = 'fade'
        this.sink.frame(this.makeFrame())
      } else if (this.phase === 'fade') {
        const stage = this.clears[this.clearIndex]
        const stageIndex = this.trace.stages.indexOf(stage)
        const next = this.trace.stages[stageIndex + 1]
        this.snapshot = next?.kind === 'gravity' ? next.after : stage.after
        this.phase = 'gap'
        this.sink.frame(this.makeFrame())
      } else {
        this.clearIndex++
        if (this.clearIndex === this.clears.length) this.finish()
        else {
          this.phase = 'fade'
          this.sink.frame(this.makeFrame())
        }
      }
    }
  }

  private finish(): void {
    this.phase = 'complete'
    this.sink.frame(this.makeFrame())
  }

  private makeFrame(): ResultChainFrame {
    const clear = this.clears[this.clearIndex]
    let starterPosition: Position | null = null
    if (this.starterId) {
      for (let y = 0; y < this.snapshot.ids.length; y++) {
        const x = this.snapshot.ids[y].indexOf(this.starterId)
        if (x !== -1) { starterPosition = { x, y }; break }
      }
    }
    return {
      grid: cloneGrid(this.snapshot.grid),
      fading: this.phase === 'fade' ? clear?.cleared.map(puyo => puyo.position) ?? [] : [],
      alpha: this.phase === 'fade' ? 1 - this.elapsed / FADE_MS : 1,
      chainIndex: this.phase === 'initial' || this.phase === 'complete' ? null : clear?.chainIndex ?? null,
      starterPosition,
      phase: this.phase,
    }
  }
}
