// Abstract construction candidates, not a catalogue of uniquely correct play.
// Every actual four-color assignment is checked for no early clear and a real
// five-chain by FiveChainPlanner before it can enter the search.
// A/B = fold, C = tail, D/E = later links. Keep all originals for continuity.
export const FIVE_CHAIN_SKELETONS: readonly (readonly string[])[] = [
  ['..DE..', 'ABCDE.', 'AABCCE', 'BBCDDE'],
  ['..DE..', 'ABCDE.', 'AABCDE', 'BBCCDE'],
  ['..E...', '..D...', 'ABCEE.', 'AABCCC', 'BBDDDE'],
  // Alternatives with column 6 three cells high: the later links need not
  // always continue as the same low, two-step staircase on the right.
  ['....E.', 'ABCDED', 'AABCCE', 'BBCDDE'],
  ['..D.E.', 'ABC.ED', 'AABCCE', 'BBCDDE'],
  ['...D..', 'ABCEEE', 'AABCCC', 'BBDDDE'],
  ['....D.', 'ABCEEE', 'AABCCC', 'BBDDDE'],
  ['.....D', 'ABCEEE', 'AABCCC', 'BBDDDE'],
  ['..DE..', 'ABCD.D', 'AABCEE', 'BBCCDE'],
  ['...E..', 'ABCDEE', 'AABCDD', 'BBCCDE'],
  ['....E.', 'ABCDEE', 'AABCDD', 'BBCCDE'],
]
