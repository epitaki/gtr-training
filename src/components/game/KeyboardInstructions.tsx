import { useSyncExternalStore } from 'react'
import { ACTIONS, BASIC_ACTIONS, ACTION_LABELS, actionKeys } from '../../game/input/bindings'
import { getBindings, subscribeBindings } from '../../game/input/settings'

/** Description of applied bindings only; state-specific controls remain inside the scene. */
export default function KeyboardInstructions({ guided = false }: { guided?: boolean }) {
  const bindings = useSyncExternalStore(subscribeBindings, getBindings, getBindings)
  const actions = guided ? ACTIONS : [...BASIC_ACTIONS, 'evaluate', 'gravity'] as const
  return <section aria-label="通常プレイのキー操作"
    className={`mx-auto mt-4 w-full pixel-panel p-4 ${guided ? 'max-w-[900px]' : 'max-w-[640px]'}`}>
    <h2 className="text-base">通常プレイのキー操作</h2>
    <p className="mt-1 text-sm text-[#c4bfd3]">停止中・結果表示中などは画面内の案内を確認</p>
    <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {actions.map(action => <div key={action} className="min-w-0">
        <dt className="text-sm text-[#c4bfd3]">{ACTION_LABELS[action]}</dt>
        <dd className="break-words [overflow-wrap:anywhere]">{actionKeys(bindings, action)}</dd>
      </div>)}
    </dl>
  </section>
}
