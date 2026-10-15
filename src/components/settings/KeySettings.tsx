import { useEffect, useState } from 'react'
import {
  ACTIONS, ACTION_LABELS,
  bindingConflict, defaultBindings, displayCode, type Bindings, type BoundAction,
} from '../../game/input/bindings'
import { getBindings, getSettingsNotice, saveBindings } from '../../game/input/settings'
import { startKeyCapture } from './keyCapture'

interface Props { onClose: () => void; allowGravityToggle?: boolean }

export default function KeySettings({ onClose, allowGravityToggle = true }: Props) {
  const [draft, setDraft] = useState<Bindings>(() => structuredClone(getBindings()))
  const [capture, setCapture] = useState<BoundAction | null>(null)
  const [message, setMessage] = useState(getSettingsNotice() ?? '')
  const conflict = bindingConflict(draft)

  useEffect(() => {
    if (!capture) return
    return startKeyCapture(window, {
      onCapture: code => {
        setDraft(old => ({ ...old, [capture]: old[capture].includes(code) ? old[capture] : [...old[capture], code] }))
        setCapture(null)
        setMessage('')
      },
      onCancel: () => { setCapture(null); setMessage('キー取得を取り消しました。設定内容は変わっていません。') },
      onInvalid: code => setMessage(`${code}は割り当てできません`),
    })
  }, [capture])

  const save = () => {
    if (conflict) { setMessage(conflict); return }
    try {
      if (saveBindings(draft)) onClose()
      else setMessage(getSettingsNotice() ?? '今回のみ適用しました。保存できませんでした。')
    }
    catch (error) { setMessage(error instanceof Error ? error.message : '設定を適用できませんでした') }
  }

  return <div role="dialog" aria-modal="true" aria-label="キー設定"
    className="fixed inset-0 z-50 overflow-auto bg-black/80 p-4 text-white">
    <div className="mx-auto max-w-2xl rounded-none border border-[#6f648d] bg-[#211d33] p-5">
      <h2 className="mb-3 text-xl font-normal">キー設定</h2>
      <p className="mb-4 text-sm text-[#c4bfd3]">ゲーム画面を選ぶと設定した操作でプレイに戻ります。Ctrl・Shiftは左右共通、NumキーはNumLockに関係なく同じ操作です。キー取得中のTab / Shift+Tabは取得だけを取り消し、フォーカスを移動します。</p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[#ffe99b]">設定1</span>
        <button type="button" onClick={() => { setDraft(old => ({ ...defaultBindings(), ...(!allowGravityToggle ? { gravity: old.gravity } : {}) })); setMessage('設定1の初期値に戻しました。保存すると適用されます。') }} className="rounded-none border border-[#6f648d] px-3 py-2">初期設定に戻す</button>
      </div>
      <p className="mb-4 text-sm text-[#c4bfd3]">初期設定は各操作1キーです。「追加」で同じ操作に使うキーを増やせます。</p>
      <div className="grid gap-2">
        {ACTIONS.filter(action => allowGravityToggle || action !== 'gravity').map(action => <div key={action} className="flex flex-wrap items-center gap-2 rounded-none bg-[#211d33] p-2">
          <span className="w-32 font-normal">{ACTION_LABELS[action]}</span>
          {draft[action].map(code => <button key={code} type="button" aria-label={`${ACTION_LABELS[action]}から${displayCode(code)}を削除`}
            onClick={() => setDraft(old => ({ ...old, [action]: old[action].filter(item => item !== code) }))}
            className="rounded-none border border-[#6f648d] px-2 py-1 text-sm">{displayCode(code)} ×</button>)}
          <button type="button" aria-label={`${ACTION_LABELS[action]}にキーを追加`} onClick={() => { setCapture(action); setMessage('キーを押してください。Tab / Shift+Tabで取得だけを取り消し、フォーカスを移動できます。') }}
            className="rounded-none border border-[#6f648d] px-2 py-1 text-sm">追加</button>
        </div>)}
      </div>
      {capture && <button type="button" onClick={() => setCapture(null)} className="mt-3 rounded-none bg-amber-700 px-3 py-2">キー取得を取消</button>}
      {(conflict || message) && <p role="status" className="mt-3 text-[#ffe99b]">{conflict ?? message}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" disabled={Boolean(conflict) || Boolean(capture)} onClick={save} className="rounded-none bg-emerald-700 px-5 py-2 disabled:opacity-40">保存</button>
        <button type="button" onClick={onClose} className="rounded-none bg-[#211d33] px-5 py-2">取消</button>
      </div>
    </div>
  </div>
}
