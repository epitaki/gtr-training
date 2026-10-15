# 履歴のツモでガイド練習（2026-10-15）

状態: 反映・検証済み。

履歴の各回詳細に「このツモで練習」を追加。検証した確定手順の色ペアをApp→GuidedGame→GameManager→Sceneへ渡し、空の盤面から通常ガイドの推薦で練習を開始する。旧記録/空/不正手順/盤面不一致からは開始できない。記録終了後は既存PRNGの生成へ移行し、NEXT/NEXT2にも適用。手順の絶対番号を使うため独立カーソルを持たず、既存の巻き戻し/復旧がそのまま機能する。新ゲームは通常の初手制約付きランダム生成へ。報告/再現URLの任意フィールドに色列を含め、続きを復元する。採点/推薦/ツモの通常生成規則やDB/APIは変更していない。

今回開始時点との差分をレビュー。履歴の閲覧だけではゲームを破棄せず、明示的な練習開始だけが新規ゲームへ切り替える。通常結果には新ボタンを出さない。新フィールドなしの既存再現URLも利用できる。手順の上限/色を検証し、モジュールの依存方向の回帰も成功。

関連196テスト・型（本体とブラウザ検証ページ）・build成功。さらに上限100手の履歴が古い手を破棄した後の絶対手数回帰を追加し、全体テストで成功した。実Chromeの開発専用固定履歴で各回の詳細→練習を実際にクリックし、空盤面/通常ガイドON・検証モードOFF、記録4手とランダム5手目のCURRENT/NEXT/NEXT2一致、ランダム境界後の巻き戻し/置き直し一致を確認。360pxでボタンの収まりと実タッチでの練習開始を確認し、画像目視済み。例外0件・DB書込0件、検証タブは閉じた。Appの履歴取得→選択→開始→再閲覧→同ゲーム復帰→通常起動の導線はコンポーネントテストで確認。最終確認では本人のクラウド履歴の各回詳細からも開始し、記録の色列とSceneの一致・書込0件を確認した。

証跡: [今回差分](history-guided-practice-20261015/task-changes.patch)、[関連テスト](history-guided-practice-20261015/focused-tests.json)、[型](history-guided-practice-20261015/type-check.log)、[build](history-guided-practice-20261015/build.log)、[Chrome](history-guided-practice-20261015/browser-check.json)、[各回詳細](history-guided-practice-20261015/history-detail.png)、[練習](history-guided-practice-20261015/guided-practice.png)、[360px](history-guided-practice-20261015/mobile-action.png)。

最終確認: 型チェック（本体・ブラウザ検証ページ）・build・関連196件・全132ファイル1,789件のテスト成功。実Chromeで記録4手とランダム移行後のCURRENT/NEXT/NEXT2、巻き戻し/置き直し、360pxで実タッチによる開始を確認。本人のクラウド履歴→各回詳細→新ボタンからも開始し、記録の色列一致とDB書込0件を確認。ブラウザは本人の履歴から始めたガイド練習を自由落下OFFで表示している。

最終証跡: [全体テスト](history-guided-practice-20261015/full-tests.json)、[本人の履歴からの開始](history-guided-practice-20261015/final-browser.json)。
