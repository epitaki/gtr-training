// Same-input acceptance, including a physical audit of every possible CURRENT
// fire. Do not credit non-fired games as zero leftovers or hide lost successes.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { parseBenchmarkReportJson } from '../../src/benchmark/BenchmarkReportValidation'
import { decodeBenchmarkGrid, type BenchmarkGameResult } from '../../src/benchmark/AdvisorBenchmark'
import { createMainFireBaseline, analyzeCandidateFire } from '../../src/game/advisor/MainFireAnalysis'
import { isSpawnBlocked, simulateTurn } from '../../src/game/core/ChainSimulator'
import type { PuyoPair } from '../../src/game/core/types'

const [output,...paths]=process.argv.slice(2)
if(!output || !paths.length || paths.length%2)throw new Error('output.json before.json after.json [before.json after.json ...]')
const summarize=(games:BenchmarkGameResult[])=>{
  const fired=games.filter(g=>g.actualFire)
  const total=fired.reduce((sum,g)=>sum+g.leftoverPuyos!,0)
  return {games:games.length,core:games.filter(g=>g.coreCompleted).length,tail:games.filter(g=>g.guidedTargetCompleted).length,
    five:games.filter(g=>g.actualFire&&g.maxIntendedChain>=5).length,fired:fired.length,
    nonFired:games.length-fired.length,leftovers:total,average:fired.length?total/fired.length:null,
    overSeven:fired.filter(g=>g.leftoverPuyos!>=8).length,
    unintended:games.filter(g=>g.unintendedClearCount>0).length,gameOver:games.filter(g=>g.gameOver).length}
}
const cases=[]
const seenGames=new Set<string>()
const beforeAll:BenchmarkGameResult[]=[],afterAll:BenchmarkGameResult[]=[]
for(let index=0;index<paths.length;index+=2){
  const [beforePath,afterPath]=paths.slice(index,index+2)
  const before=parseBenchmarkReportJson(readFileSync(beforePath,'utf8'),beforePath)
  const after=parseBenchmarkReportJson(readFileSync(afterPath,'utf8'),afterPath)
  if(!isDeepStrictEqual(before.config,after.config))throw new Error('Different benchmark conditions')
  const oldGames=before.modes.flatMap(m=>m.games),newGames=after.modes.flatMap(m=>m.games)
  for(const game of oldGames){
    const identity=`${game.mode}:${game.gameSeed}`
    if(seenGames.has(identity))throw new Error(`Duplicate game across cohorts: ${identity}`)
    seenGames.add(identity)
  }
  const missed:Array<{game:number;turn:number}>=[]
  for(const [i,g] of newGames.entries()){
    const old=oldGames[i]
    if(!old||g.gameSeed!==old.gameSeed||g.gameIndex!==old.gameIndex||g.mode!==old.mode||g.openingKind!==old.openingKind||g.maxTurns!==old.maxTurns)throw new Error('Unpaired game')
    for(const turn of g.turns){
      const grid=decodeBenchmarkGrid(turn.gridBefore),base=createMainFireBaseline(grid)
      if(!base||base.resolution.chainCount<5)continue
      const pair:PuyoPair={main:{color:turn.currentPair.main,x:2,y:1},sub:{color:turn.currentPair.sub,x:2,y:0},rotation:0,falling:true}
      let available=false
      for(let r=0;r<4&&!available;r++)for(let x=0;x<6&&!available;x++){
        const outcome=simulateTurn(grid,pair,{column:x,rotation:r})
        available=outcome.valid&&!isSpawnBlocked(outcome.stableGrid)&&analyzeCandidateFire(pair,outcome,base).isIntendedMainFire
      }
      if(available&&(!turn.intendedMainFire||turn.intendedMainChainCount<5))missed.push({game:g.gameIndex,turn:turn.turn})
    }
  }
  beforeAll.push(...oldGames);afterAll.push(...newGames)
  const success=(g:BenchmarkGameResult)=>g.actualFire&&g.maxIntendedChain>=5
  cases.push({beforePath,afterPath,hashes:[beforePath,afterPath].map(p=>createHash('sha256').update(readFileSync(p)).digest('hex')),
    seed:before.config.seed,before:summarize(oldGames),after:summarize(newGames),missedCurrentFires:missed,
    lost:newGames.filter((g,i)=>success(oldGames[i])&&!success(g)).map(g=>g.gameIndex),
    gained:newGames.filter((g,i)=>!success(oldGames[i])&&success(g)).map(g=>g.gameIndex),
    delayed:newGames.filter((g,i)=>g.fireTurn!==null&&oldGames[i].fireTurn!==null&&g.fireTurn>oldGames[i].fireTurn!).map(g=>g.gameIndex)})
}
const before=summarize(beforeAll),after=summarize(afterAll)
const gates={averageAtMostFive:after.average!==null&&after.average<=5,
  coreMaintained:after.core>=before.core,completionMaintained:after.tail>=before.tail,fiveMaintained:after.five>=before.five,
  noSkippedCurrentFires:cases.every(c=>c.missedCurrentFires.length===0),
  gameOversNotIncreased:after.gameOver<=before.gameOver,unintendedNotIncreased:after.unintended<=before.unintended}
const result={before,after,gates,passed:Object.values(gates).every(Boolean),cases}
writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({before,after,gates,passed:result.passed},null,2))
if(!result.passed)process.exitCode=1
