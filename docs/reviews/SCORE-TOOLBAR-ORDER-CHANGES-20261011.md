# スコアアタックの操作順（2026-10-11）

状態: 反映・検証済み。

スコアアタック上部のキー設定ボタンを停止／再開の前へ移動し、ガイド練習と同じ順にした。変更前の作業開始時点との比較では、既存の1行移動のみ。配色・クリック処理・フォーカス・停止や採点・保存の条件は変更しない。新しいテストは追加しない。

型チェック・build・関連4回帰・全1,752回帰（129ファイル、並列数2）に成功。実ChromeでPCの両モードと360pxのスコア画面にキー設定 → 停止／再開 → 終了の順を確認し、キー設定の開閉も確認。初回の検証スクリプトでは盤面親の検索範囲とモバイル下部の終了ボタンまで含めた集計が誤っており、上部ボタンの親だけを対象として修正した。製品コードの追加変更はなし。

証跡: [開始時との差分](score-toolbar-order-20261011/task-changes.patch)、[型](score-toolbar-order-20261011/type-check.log)、[build](score-toolbar-order-20261011/build.log)、[関連回帰](score-toolbar-order-20261011/focused-tests.json)、[実Chrome](score-toolbar-order-20261011/browser-check.json)、[PC](score-toolbar-order-20261011/desktop.png)、[360px](score-toolbar-order-20261011/mobile.png)。

[全回帰](score-toolbar-order-20261011/full-tests.json)。画像を目視し、ブラウザには変更済みスコア画面を表示。Habitica文言整理親へ指定13の受入を反映し、親タスクは全画面レビュー継続のため未完了を保持。
