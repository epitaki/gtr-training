import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PuyoColor, type PuyoPair } from '../../game/core/types'
import PairOrientationPicker from './PairOrientationPicker'
const pair: PuyoPair = { main: { color: PuyoColor.BLUE, x: 2, y: 1 }, sub: { color: PuyoColor.YELLOW, x: 2, y: 0 }, rotation: 0, falling: true }

describe('visual orientation picker', () => {
  it('renders four actual-color choices, one selected option and a clear option', () => {
    const html = renderToStaticMarkup(<PairOrientationPicker pair={pair} value={2} onChange={() => {}} />)
    expect(html.match(/<svg/g)).toHaveLength(4)
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html).toContain('aria-label="下から黄→青を選ぶ" aria-pressed="true"')
    expect(html).toContain('#5687f5')
    expect(html).toContain('#f3c94f')
    expect(html).toContain('指定しない')
  })
  it('disables colors when no pair is available but still allows clearing the choice', () => {
    const html = renderToStaticMarkup(<PairOrientationPicker pair={null} value={null} onChange={() => {}} />)
    expect(html.match(/disabled=""/g)).toHaveLength(4)
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
  })
})
