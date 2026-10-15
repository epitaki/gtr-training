import { applyPairPlacement, canApplyPairPlacement, resolveChains, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const colors = [PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW] as const
const invalid = () => new Error('保存した盤面や手順が正しくありません')
export function encodeBoard(grid: PuyoGrid): string {
  if (grid.length !== 13 || grid.some(row => row.length !== 6)) throw invalid()
  const cells = grid.flat().map(color => color === null ? 0 : colors.indexOf(color) + 1)
  if (cells.some((value, index) => value === 0 && grid.flat()[index] !== null)) throw invalid()
  return Array.from({ length: 39 }, (_, i) => alphabet[(cells[2 * i] << 3) | cells[2 * i + 1]]).join('')
}
export function decodeBoard(code: string): PuyoGrid {
  if (!/^[A-Za-z0-9_-]{39}$/.test(code)) throw invalid()
  const cells = [...code].flatMap(character => {
    const value = alphabet.indexOf(character)
    return [value >> 3, value & 7].map(color => { if (color > 4) throw invalid(); return color === 0 ? null : colors[color - 1] })
  })
  return Array.from({ length: 13 }, (_, y) => cells.slice(y * 6, (y + 1) * 6))
}
export function encodePlacedPair(pair: PuyoPair): string {
  const encode = (puyo: PuyoPair['main']) => {
    const color = colors.indexOf(puyo.color)
    if (color < 0 || !Number.isInteger(puyo.x) || !Number.isInteger(puyo.y) || puyo.x < 0 || puyo.x > 5 || puyo.y < 0 || puyo.y > 12) throw invalid()
    return (color << 7) | (puyo.y * 6 + puyo.x)
  }
  const value = (encode(pair.main) << 9) | encode(pair.sub)
  return alphabet[value >> 12] + alphabet[(value >> 6) & 63] + alphabet[value & 63]
}
export function decodePlacedPair(code: string): PuyoPair {
  if (!/^[A-Za-z0-9_-]{3}$/.test(code)) throw invalid()
  const value = [...code].reduce((sum, char) => (sum << 6) | alphabet.indexOf(char), 0)
  const puyo = (bits: number) => {
    const cell = bits & 127
    if (cell > 77) throw invalid()
    return { color: colors[bits >> 7], x: cell % 6, y: Math.floor(cell / 6) }
  }
  const main = puyo(value >> 9), sub = puyo(value & 511)
  const dx = sub.x - main.x, dy = sub.y - main.y
  const rotation = dx === 0 && dy === -1 ? 0 : dx === 1 && dy === 0 ? 1 : dx === 0 && dy === 1 ? 2 : dx === -1 && dy === 0 ? 3 : -1
  if (rotation < 0) throw invalid()
  return { main, sub, rotation, falling: true }
}
export function replayPlacements(moves: string, count = moves.length / 3): PuyoGrid {
  if (moves.length % 3 || moves.length > 30000 || !Number.isInteger(count) || count < 0 || count > moves.length / 3) throw invalid()
  let grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
  for (let i = 0; i < count; i++) {
    const pair = decodePlacedPair(moves.slice(i * 3, i * 3 + 3))
    const landing = { mainPos: pair.main, subPos: pair.sub, valid: true }
    if (!canApplyPairPlacement(grid, landing)) throw invalid()
    grid = resolveChains(applyPairPlacement(grid, pair, landing)).stableGrid
  }
  return grid
}
