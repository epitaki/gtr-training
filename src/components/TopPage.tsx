import type { GameMode } from '../App'

interface TopPageProps { onSelectMode: (mode: GameMode) => void }

const MiniPuyo = ({ color }: { color: string }) => (
  <span className={`block h-7 w-7 rounded-full ${color} shadow-[inset_0_-4px_0_rgba(0,0,0,0.12)] ring-2 ring-white/20`} />
)

export default function TopPage({ onSelectMode }: TopPageProps) {
  return (
    <div className="mx-auto max-w-6xl font-puyo">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#171426] px-6 py-10 shadow-2xl shadow-indigo-950/20 sm:px-10 lg:px-14 lg:py-14">
        <div className="absolute -right-24 -top-32 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative grid items-center gap-10 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-300/10 px-3 py-1.5 text-xs font-bold tracking-wide text-violet-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
              GTRを、置いて覚える。
            </div>
            <h1 className="max-w-2xl text-4xl font-black leading-[1.12] tracking-tight text-white sm:text-5xl lg:text-6xl">
              迷わない積み方を、
              <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-amber-200 bg-clip-text text-transparent">手の感覚に。</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">
              次の一手をガイドで確かめながら、ぷよぷよの定番連鎖土台「GTR」を実戦形式で身につけよう。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button onClick={() => onSelectMode('guided')} className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3.5 font-extrabold text-[#171426] shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:bg-violet-50">
                ガイド練習を始める
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </button>
              <button onClick={() => onSelectMode('score-attack')} className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-6 py-3.5 font-bold text-white transition hover:-translate-y-0.5 hover:bg-white/10">
                スコアアタック
              </button>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
            <div className="absolute inset-4 rounded-[2rem] bg-violet-500/25 blur-2xl" />
            <div className="relative rounded-[1.75rem] border border-white/10 bg-[#0d0b16]/90 p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between text-xs font-bold text-slate-400">
                <span>GTR FORMATION</span><span className="text-emerald-400">GOOD</span>
              </div>
              <div className="grid grid-cols-6 gap-1.5 rounded-2xl border border-white/5 bg-black/30 p-4">
                {Array.from({ length: 30 }, (_, i) => {
                  const colors: Record<number, string> = { 18: 'bg-rose-400', 19: 'bg-sky-400', 24: 'bg-rose-400', 25: 'bg-rose-400', 26: 'bg-sky-400', 20: 'bg-amber-300', 27: 'bg-sky-400', 21: 'bg-emerald-400', 22: 'bg-amber-300', 28: 'bg-emerald-400', 29: 'bg-amber-300' }
                  return colors[i] ? <MiniPuyo key={i} color={colors[i]} /> : <span key={i} className="h-7 w-7 rounded-full border border-white/[0.04]" />
                })}
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3">
                <span className="text-sm text-slate-400">折り返し進捗</span>
                <div className="flex items-center gap-3"><span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10"><span className="block h-full w-4/5 rounded-full bg-violet-400" /></span><b className="text-sm text-white">80%</b></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-10">
        <div className="mb-5 flex items-end justify-between">
          <div><p className="mb-1 text-xs font-extrabold tracking-[.18em] text-violet-600">TRAINING MODES</p><h2 className="text-2xl font-black text-slate-900">今日の練習を選ぶ</h2></div>
          <p className="hidden text-sm text-slate-500 sm:block">まずはガイド練習がおすすめ</p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <button onClick={() => onSelectMode('guided')} className="group rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-violet-300 hover:shadow-xl hover:shadow-violet-900/10 sm:p-7">
            <div className="flex items-start justify-between"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-2xl">◈</span><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">初心者におすすめ</span></div>
            <h3 className="mt-6 text-xl font-black text-slate-900">ガイド付き練習</h3>
            <p className="mt-2 leading-7 text-slate-500">おすすめ配置を見ながら、折り返しから連鎖尾まで一手ずつ練習します。</p>
            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5 text-sm"><span className="text-slate-400">巻き戻し・配置ガイド付き</span><span className="font-extrabold text-violet-600 transition-transform group-hover:translate-x-1">始める →</span></div>
          </button>
          <button onClick={() => onSelectMode('score-attack')} className="group rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-amber-300 hover:shadow-xl hover:shadow-amber-900/10 sm:p-7">
            <div className="flex items-start justify-between"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-2xl">↗</span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">腕試し</span></div>
            <h3 className="mt-6 text-xl font-black text-slate-900">スコアアタック</h3>
            <p className="mt-2 leading-7 text-slate-500">ガイドなしでGTRを組み、完成速度と形の精度からスコアを測ります。</p>
            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5 text-sm"><span className="text-slate-400">評価・詳細フィードバック</span><span className="font-extrabold text-amber-600 transition-transform group-hover:translate-x-1">挑戦する →</span></div>
          </button>
        </div>
      </section>

      <section className="mb-8 grid gap-5 rounded-3xl border border-slate-200/80 bg-white/60 p-6 sm:grid-cols-3 sm:p-8">
        {[['01', '置く', 'ガイドを参考にぷよを配置'], ['02', '振り返る', '評価で形と連鎖尾を確認'], ['03', '身につける', '繰り返して判断を高速化']].map(([n, title, body]) => (
          <div key={n} className="flex gap-4"><span className="text-sm font-black text-violet-400">{n}</span><div><h3 className="font-extrabold text-slate-800">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{body}</p></div></div>
        ))}
      </section>
    </div>
  )
}
