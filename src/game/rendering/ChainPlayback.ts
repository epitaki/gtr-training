import type { ChainTrace, ChainStage } from '../core/ChainTrace'

export type PlaybackPhase = 'gravity' | 'land' | 'emphasis' | 'fade'

export interface PlaybackFrame {
  stage: ChainStage
  phase: PlaybackPhase
  progress: number
}

export interface PlaybackSink {
  frame(frame: PlaybackFrame): void
  complete(): void
  cancel?(): void
}

const MAX_DELTA = 50
export const gravityMoveDuration = (distance: number): number =>
  Math.min(300, Math.max(90, 90 + distance * 30))
const phaseDuration = (stage: ChainStage, phase: PlaybackPhase): number => {
  if (phase === 'emphasis') return 120
  if (phase === 'fade') return 180
  if (phase === 'land') return 80
  const distance = Math.max(...(stage.kind === 'gravity' ? stage.moves.map(move => move.to.y - move.from.y) : [0]))
  return gravityMoveDuration(distance)
}

export class ChainPlayback {
  private stageIndex = 0
  private phaseIndex = 0
  private elapsed = 0
  private finished = false
  private readonly pauses = new Set<string>()

  constructor(private readonly trace: ChainTrace, private readonly sink: PlaybackSink) {}

  get isFinished(): boolean { return this.finished }
  get isPaused(): boolean { return this.pauses.size > 0 }

  pause(reason: string): void { this.pauses.add(reason) }
  resume(reason: string): void { this.pauses.delete(reason) }

  cancel(): void {
    if (this.finished) return
    this.finished = true
    this.sink.cancel?.()
  }

  update(delta: number): void {
    if (this.finished || this.isPaused) return
    let remaining = Number.isFinite(delta) && delta > 0 ? Math.min(delta, MAX_DELTA) : 0
    if (this.trace.stages.length === 0) {
      this.finished = true
      this.sink.complete()
      return
    }
    while (!this.finished) {
      const stage = this.trace.stages[this.stageIndex]
      if (!stage) {
        this.finished = true
        this.sink.complete()
        return
      }
      const phases: PlaybackPhase[] = stage.kind === 'gravity' ? ['gravity', 'land'] : ['emphasis', 'fade']
      const phase = phases[this.phaseIndex]
      const duration = phaseDuration(stage, phase)
      const step = Math.min(remaining, duration - this.elapsed)
      this.elapsed += step
      remaining -= step
      this.sink.frame({ stage, phase, progress: this.elapsed / duration })
      if (this.elapsed < duration) return
      this.elapsed = 0
      this.phaseIndex++
      if (this.phaseIndex === phases.length) {
        this.stageIndex++
        this.phaseIndex = 0
      }
      if (remaining === 0 && this.stageIndex < this.trace.stages.length) return
    }
  }
}
