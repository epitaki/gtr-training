import { describe, expect, it } from 'vitest'
import { findVisibleMainFires } from './VisibleMainFireSearch'
import { analyzeCandidateFire, createMainFireBaseline } from './MainFireAnalysis'
import { inspectFirePreference, compareFirePreference, type FirePreference } from './FirePreference'
import { futureFireSurfaceCost } from './BoardSurface'
import { simulateTurn, isSpawnBlocked, type PuyoGrid, type TurnOutcome } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'
import { FIVE_CHAIN_SKELETONS } from './FiveChainSkeletons'
import { resolveChains } from '../core/ChainSimulator'

const pair = (main:PuyoColor,sub:PuyoColor):PuyoPair=>({main:{color:main,x:2,y:1},sub:{color:sub,x:2,y:0},rotation:0,falling:true})
function fixture():PuyoGrid {
  for (const C of Object.values(PuyoColor)) for (const D of Object.values(PuyoColor)) for (const E of Object.values(PuyoColor)) {
    const colors:Record<string,PuyoColor>={A:PuyoColor.RED,B:PuyoColor.BLUE,C,D,E}
    const rows=FIVE_CHAIN_SKELETONS[0]
    const grid:PuyoGrid=[...Array.from({length:13-rows.length},()=>Array(6).fill(null)),...rows.map(r=>[...r].map(c=>colors[c]??null))]
    if (!resolveChains(grid).chainCount && createMainFireBaseline(grid)?.resolution.chainCount===5) return grid
  }
  throw new Error('No valid test skeleton')
}
const classify=(grid:PuyoGrid,p:PuyoPair,o:TurnOutcome):'clean'|'collateral'|null=>{
  const b=createMainFireBaseline(grid)
  if (!b || b.resolution.chainCount<5) return null
  const f=analyzeCandidateFire(p,o,b)
  return f.isIntendedMainFire ? f.hasCollateralClear?'collateral':'clean' : null
}

describe('visible-pair main fire search',()=>{
  it('compares readiness after all visible pairs, independently of earlier ready roots',()=>{
    const colors:Record<string,PuyoColor>={R:PuyoColor.RED,G:PuyoColor.GREEN,B:PuyoColor.BLUE,Y:PuyoColor.YELLOW}
    const grid:PuyoGrid='...........................................Y...G.GRG.G.YBG.GRYGRYBRRYGGYYYGBBY'
      .match(/.{6}/g)!.map(row=>[...row].map(c=>colors[c]??null))
    const depths:number[]=[]
    findVisibleMainFires(grid,[pair(PuyoColor.BLUE,PuyoColor.GREEN),pair(PuyoColor.RED,PuyoColor.RED),pair(PuyoColor.GREEN,PuyoColor.BLUE)],
      ()=>null,2,(board,_root,_surface,depth)=>{
        expect(board.flat().filter(Boolean).length).toBe(grid.flat().filter(Boolean).length+6)
        expect(createMainFireBaseline(board)!.resolution.chainCount).toBeGreaterThanOrEqual(5)
        depths.push(depth)
      })
    expect(depths).toContain(2)
    expect(depths).not.toContain(0)
    expect(depths).not.toContain(1)
  })
  it('proves a third-pair tail rebuild without counting the unseen trigger as a fire',()=>{
    const colors:Record<string,PuyoColor>={R:PuyoColor.RED,G:PuyoColor.GREEN,B:PuyoColor.BLUE,Y:PuyoColor.YELLOW}
    const encoded='...................................................R.G.GRR.GRGYBGBRRGYYGGGYBGG'
    const grid:PuyoGrid=encoded.match(/.{6}/g)!.map(row=>[...row].map(c=>colors[c]??null))
    const pairs=[pair(PuyoColor.GREEN,PuyoColor.YELLOW),pair(PuyoColor.RED,PuyoColor.GREEN),pair(PuyoColor.RED,PuyoColor.RED)]
    let rebuilt=grid
    for(const [index,placement] of [{column:4,rotation:2},{column:5,rotation:0},{column:4,rotation:0}].entries()){
      const result=simulateTurn(rebuilt,pairs[index],placement)
      expect(result.valid).toBe(true)
      expect(result.chainCount).toBe(0)
      rebuilt=result.stableGrid
    }
    expect(createMainFireBaseline(rebuilt)!.resolution.chainCount).toBe(6)
    const ready:Array<{board:PuyoGrid;root:{column:number;rotation:number}}>=[]
    const result=findVisibleMainFires(grid,pairs,classify,2,(board,root,_surface,depth)=>{
      expect(depth).toBe(2)
      ready.push({board,root})
    })
    expect(result.size).toBe(0)
    expect(ready).toContainEqual({board:rebuilt,root:{column:4,rotation:2}})
    const actual=simulateTurn(rebuilt,pair(PuyoColor.RED,PuyoColor.GREEN),{column:0,rotation:0})
    expect(classify(rebuilt,pair(PuyoColor.RED,PuyoColor.GREEN),actual)).toBe('clean')
    expect(actual.stableGrid.flat().filter(Boolean)).toHaveLength(5)
  })
  it('matches exhaustive legal two-pair fires and real residual counts',()=>{
    const grid=fixture(), p=pair(PuyoColor.GREEN,PuyoColor.YELLOW), next=pair(PuyoColor.RED,PuyoColor.BLUE)
    const input=JSON.stringify({grid,p,next})
    const expected=new Map<string,FirePreference>()
    for(let rotation=0;rotation<4;rotation++)for(let column=0;column<6;column++){
      const placed=simulateTurn(grid,p,{column,rotation})
      if(!placed.valid || placed.chainCount || isSpawnBlocked(placed.stableGrid) || placed.stableGrid[9][0]!==null)continue
      for(let r=0;r<4;r++)for(let x=0;x<6;x++){
        const outcome=simulateTurn(placed.stableGrid,next,{column:x,rotation:r})
        if(!outcome.valid || !outcome.chainCount || isSpawnBlocked(outcome.stableGrid))continue
        const kind=classify(placed.stableGrid,next,outcome)
        if(!kind)continue
        const preference=inspectFirePreference(outcome,1,kind==='collateral',futureFireSurfaceCost(placed.stableGrid),placed.stableGrid)
        const key=`${column}:${rotation}`
        if(compareFirePreference(preference,expected.get(key))<0)expected.set(key,preference)
      }
    }
    expect(expected.size).toBeGreaterThan(0)
    expect(findVisibleMainFires(grid,[p,next],classify)).toEqual(expected)
    expect(JSON.stringify({grid,p,next})).toBe(input)
  })

  it('prefers actual CURRENT fire, does not search the fourth pair, and obeys rejection',()=>{
    const grid=fixture(), fire=pair(PuyoColor.RED,PuyoColor.BLUE), waiting=pair(PuyoColor.GREEN,PuyoColor.YELLOW)
    const result=findVisibleMainFires(grid,[fire,waiting,waiting],classify)
    expect(result.size).toBeGreaterThan(0)
    expect([...result.values()].every(f=>f.depth===0)).toBe(true)
    expect(findVisibleMainFires(grid,[waiting,waiting,waiting,fire],classify).size).toBe(0)
    expect(findVisibleMainFires(grid,[fire],()=>null).size).toBe(0)
  })

  it('does not fill missing cells or claim that a ready board is an actual fire',()=>{
    const empty:PuyoGrid=Array.from({length:13},()=>Array(6).fill(null))
    const waiting=pair(PuyoColor.GREEN,PuyoColor.YELLOW)
    expect(findVisibleMainFires(empty,[waiting,waiting,waiting],classify).size).toBe(0)
    let ready=0
    const found=findVisibleMainFires(fixture(),[waiting,waiting],classify,2,(grid,_root,_surface,depth)=>{
      expect(createMainFireBaseline(grid)!.resolution.chainCount).toBeGreaterThanOrEqual(5)
      expect(depth).toBe(1)
      ready++
    })
    expect(ready).toBeGreaterThan(0)
    expect(found.size).toBe(0)
    expect(findVisibleMainFires([],[],classify).size).toBe(0)
    expect(findVisibleMainFires(fixture(),[],classify).size).toBe(0)
  })
})
