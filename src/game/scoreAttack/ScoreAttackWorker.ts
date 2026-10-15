import type { EvaluationResponse, ScoreAttackEvaluation, ScoreAttackEvaluator, ScoreAttackSnapshot } from './types'

export class ScoreAttackWorker implements ScoreAttackEvaluator {
  private worker?: Worker
  private sequence = 0
  private disposed = false
  private readonly pending = new Map<number, { resolve: (value: ScoreAttackEvaluation) => void; reject: (error: Error) => void }>()

  constructor(private readonly createWorker = () => new Worker(new URL('./evaluation.worker.ts', import.meta.url), { type: 'module' })) {}

  evaluate(snapshot: ScoreAttackSnapshot): Promise<ScoreAttackEvaluation> {
    return new Promise((resolve, reject) => {
      if (this.disposed) { reject(new Error('採点を終了しました')); return }
      try {
        if (!this.worker) {
          const worker = this.createWorker()
          this.worker = worker
          worker.addEventListener('message', (event: MessageEvent<EvaluationResponse>) => {
            if (this.worker !== worker) return
            const request = this.pending.get(event.data.id)
            if (!request) return
            this.pending.delete(event.data.id)
            if ('error' in event.data) request.reject(new Error(event.data.error))
            else request.resolve(event.data.evaluation)
          })
          const failed = () => {
            if (this.worker !== worker) return
            this.stop(new Error('採点できませんでした。もう一度お試しください。'))
          }
          worker.addEventListener('error', failed)
          worker.addEventListener('messageerror', failed)
        }
        const id = ++this.sequence
        this.pending.set(id, { resolve, reject })
        try { this.worker.postMessage({ id, snapshot }) }
        catch (error) { this.pending.delete(id); reject(error) }
      } catch (error) { reject(error) }
    })
  }

  private stop(error: Error): void {
    this.worker?.terminate()
    this.worker = undefined
    this.pending.forEach(request => request.reject(error))
    this.pending.clear()
  }

  dispose(): void { this.disposed = true; this.stop(new Error('採点を終了しました')) }
}
