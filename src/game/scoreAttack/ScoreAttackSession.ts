import { SCORE_ATTACK_ROUNDS, type ScoreAttackEvaluator, type ScoreAttackSnapshot, type ScoreAttackState, type ScoreAttackRound } from './types'

export const emptyScoreAttackState = (): ScoreAttackState => ({ rounds: [], finished: false, totalScore: null })

/** A set owns submitted copies; evaluation cannot write back into a running scene. */
export class ScoreAttackSession {
  private state = emptyScoreAttackState()
  private disposed = false
  private readonly listeners = new Set<() => void>()
  constructor(private readonly evaluator: ScoreAttackEvaluator) {}
  getSnapshot = (): ScoreAttackState => this.state
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  submit(snapshot: ScoreAttackSnapshot): boolean {
    if (this.disposed || this.state.finished) return false
    const index = this.state.rounds.length
    this.publish([...this.state.rounds, { snapshot: structuredClone(snapshot), evaluation: null, error: null }])
    this.evaluate(index)
    return true
  }

  retryFailed(): void {
    if (this.disposed) return
    const failed = this.state.rounds.flatMap((round, index) => round.error ? [index] : [])
    for (const index of failed) {
      this.replace(index, { ...this.state.rounds[index], error: null })
      this.evaluate(index)
    }
  }

  private evaluate(index: number): void {
    const round = this.state.rounds[index]
    this.evaluator.evaluate(round.snapshot).then(evaluation => {
      if (!this.disposed) this.replace(index, { ...round, evaluation })
    }, () => {
      if (!this.disposed) this.replace(index, { ...round, error: '採点できませんでした。保存した盤面から再試行できます。' })
    })
  }

  private replace(index: number, round: ScoreAttackRound): void {
    this.publish(this.state.rounds.map((old, oldIndex) => oldIndex === index ? round : old))
  }

  private publish(rounds: readonly ScoreAttackRound[]): void {
    const finished = rounds.length === SCORE_ATTACK_ROUNDS
    this.state = { rounds, finished, totalScore: finished && rounds.every(round => round.evaluation)
      ? rounds.reduce((sum, round) => sum + round.evaluation!.analysis.score.totalScore, 0) : null }
    this.listeners.forEach(listener => listener())
  }

  dispose(): void { this.disposed = true; this.listeners.clear(); this.evaluator.dispose() }
}
