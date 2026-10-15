import { PlacementAdvisor } from '../../src/game/advisor/PlacementAdvisor'
import { FiveChainPlanner } from '../../src/game/advisor/FiveChainPlanner'
import { createMainFireBaseline } from '../../src/game/advisor/MainFireAnalysis'
import { simulateTurn, type PuyoGrid } from '../../src/game/core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../../src/game/core/types'
import { surfaceShapeCost } from '../../src/game/advisor/BoardSurface'

const colors: Record<string, PuyoColor> = { R: PuyoColor.RED, Y: PuyoColor.YELLOW, B: PuyoColor.BLUE, G: PuyoColor.GREEN }
const pair = (text: string): PuyoPair => ({ main: { color: colors[text[0]], x: 2, y: 1 }, sub: { color: colors[text[1]], x: 2, y: 0 }, rotation: 0, falling: true })
const cases = [
  { name: 'reported well', rows:['.B.Y..','.B.B.B','.B.B.G','.R.Y.G','GBYR.B','GGBY.Y','BBYY.Y'],queue:['GR','GR','RB'],fold:'GB' },
  { name: 'visible surface 50', encoded:'...............................R.....R.....Y..GR.RR.RG.BR.YGRYG.YBRRYGGYYYGBBY',queue:['RB','YB','RB'],fold:'RY' },
  { name: 'Y fifth move', rows: ['BR....', 'BBR...', 'RRY...'], queue: ['BY','GY','GY','YR','BG'], fold:'BR' },
  { name: 'green Y', rows: ['.Y....','BY....','BBY...','YYGYYY'], queue: ['GB','YY','GB'], fold:'BY' },
  { name: 'lower 159', encoded:'........................................B.....R.....B.....Y.YRB.Y.YYRBBYRRBGGY', queue:['YR','BB','YR'], fold:'YR' },
  { name: 'tail 930', encoded:'.................................................R.....BG...YGB..GYYGB.RGGBGGR', queue:['RR','GR','GY'], fold:'YG' },
]
for (const sample of cases) {
  const rows = sample.rows ?? sample.encoded!.match(/.{6}/g)!
  let grid: PuyoGrid = [...Array.from({length:13-rows.length},()=>Array(6).fill(null)), ...rows.map(r=>[...r].map(c=>colors[c]??null))]
  const pairs = sample.queue.map(pair)
  const plan = {colorA:colors[sample.fold[0]],colorB:colors[sample.fold[1]],colorC:colors[sample.fold[0]],colorD:colors[sample.fold[1]]}
  console.log(sample.name)
  for (let i=0; i<Math.min(3, sample.queue.length); i++) {
    const advice = PlacementAdvisor.getAdvice({grid,width:6,height:13},pairs[i],pairs[i+1],pairs[i+2],plan)
    console.log(advice.allPlacements.slice(0,5).map(p=>{
      const o=simulateTurn(grid,pairs[i],p.placement), b=createMainFireBaseline(o.stableGrid)
      return {place:p.placement,score:p.totalScore,tail:p.tailShape,complete:PlacementAdvisor.getCompletedTailShape(o.stableGrid,plan),surface:surfaceShapeCost(o.stableGrid),chain:b?.resolution.chainCount,left:b?.resolution.stableGrid.flat().filter(Boolean).length,fit:FiveChainPlanner.inspectCompletion(o.stableGrid,plan)?.targetId}
    }))
    grid=simulateTurn(grid,pairs[i],advice.bestPlacement!.placement).stableGrid
    console.log(grid.slice(-5).map(r=>r.map(c=>c?.[0].toUpperCase()??'.').join('')).join('/'))
  }
}
