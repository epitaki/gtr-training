import { randomBytes } from 'node:crypto'

export class LoginNonces {
  private values = new Map<string, number>()
  issue(): string {
    const now = Date.now()
    this.values.forEach((expires, key) => { if (expires <= now) this.values.delete(key) })
    while (this.values.size >= 256) this.values.delete(this.values.keys().next().value!)
    const key = randomBytes(32).toString('base64url')
    this.values.set(key, now + 5 * 60_000)
    return key
  }
  consume(value: string | string[] | undefined): boolean {
    if (typeof value !== 'string') return false
    const expires = this.values.get(value)
    this.values.delete(value)
    return !!expires && expires > Date.now()
  }
}
