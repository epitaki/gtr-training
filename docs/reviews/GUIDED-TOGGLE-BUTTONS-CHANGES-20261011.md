# ガイド練習の切り替えボタン（2026-10-11）

状態: 反映・検証済み。

補足文を評価範囲内のぷよだけを採点します。へ。NEXT下の状態表示を120×44pxの枠付きボタンにし、既存gravity/guide入力へ接続した。ON/OFF表示と色はクリック・キー操作で同じテキストを更新する。押下後のキャンバスフォーカスを維持し、停止/結果/報告/リプレイ/非表示/破棄/キー解放待ちでは既存入力制限を守る。採点/連鎖/ツモ/保存APIの仕様に変更なし。

スマホの横スクロール後にPhaserのcanvasBoundsがスクロール前の位置に残り、300pxずれた押下になることを実機で確認。スクロールに合わせてupdateBoundsを呼び、終了時にリスナーを解除する。既存の終了処理回帰に、位置更新と購読解除が一度だけ行われる確認を追加した。

クリックとキーの同期、盤面・乱数保持、7種類の入力制限を確認する9件の新規回帰を追加。型/build/関連144回帰成功。実Chromeの未ログインタブでPCのマウス/キーF・G、停止と結果の裏のクリック保護、結果の補足、360pxの実タッチでON/OFF両方向を確認。スマホ検証はデスクトップからの変更時に端末入力の検出を初期化し直して実施。横スクロール後も押下がボタンに一致し、ページ横はみ出しなし。元盤面と乱数は保持、例外0件・保存POST0件。画像目視済み。

証跡: [差分](guided-toggle-buttons-20261011/task-changes.patch)、[関連回帰](guided-toggle-buttons-20261011/focused-tests.json)、[型](guided-toggle-buttons-20261011/type-check.log)、[build](guided-toggle-buttons-20261011/build.log)、[実Chrome](guided-toggle-buttons-20261011/browser-check.json)、[PC](guided-toggle-buttons-20261011/desktop.png)、[360px](guided-toggle-buttons-20261011/mobile.png)。

最終確認: 型チェック・build・関連144件・全129ファイル1,761件のテスト成功。実Chromeでマウス/キーF・G/タッチの切り替え、停止/結果中の保護、横スクロール後の押下位置を確認。例外0件・保存POST0件。本人のブラウザは自由落下OFF・ガイドONでボタンを操作できる状態にし、検証用ゲストタブを閉じた。今回開始時点との差分を確認し、指定文言・ボタンと入力位置/終了処理の修正に限定されていることを確認した。

最終証跡: [全体テスト](guided-toggle-buttons-20261011/full-tests.json)、[本人ブラウザ](guided-toggle-buttons-20261011/final-browser.json)。
