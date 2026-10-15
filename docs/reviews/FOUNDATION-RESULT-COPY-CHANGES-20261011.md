# 土台評価の文言と文字描画（2026-10-11）

状態: 反映・検証済み。

提示画像に該当するGuidedPracticeSceneの土台評価表示を整理した。完成状態の見出しと教材の連鎖尾基本形チェックを撤去し、SCORE: 数値点、基本形と短い評価範囲説明へ。仮置き補足/連鎖内訳/発火・実在・範囲外の説明は表示しない。3/4/5連鎖・最小土台・余りの判定と再生/新ゲーム/退出は保持する。不要になった表示用の解析呼出しと連鎖尾チェック引数を除去した。

ドットフォントは16px（点数32px）へ揃え、結果のテキストのみ4倍密度/Phaser.Textures.FilterMode.NEARESTへ。addUITextは明示resolutionを尊重し、他の画面の既定2を保持する。PhaserのNEAREST値は1であり、検証用モックと実機確認もこの定数に合わせた。フォント密度と補間を実画像で比較し、字形の輪郭を確認した。

今回の開始時点との差分だけをレビュー。採点/物理/解析仕様/保存に変更なし。既存表示テストの期待値を現仕様へ更新し、範囲外の接続がある100点盤面や3/5/7連鎖の評価、再生/中断/入力保護の回帰を維持。型/build/関連122回帰に成功。

実Chromeはクラウドと異なるlocalhostの未ログインタブで確認。100点教材盤面で実採点値を使用し、指定文言/説明撤去、12テキストの16/32px・密度4/NEAREST、再生で元盤面/乱数が不変、360pxでページ横はみ出しなしと既存盤面スクロールを確認。例外0件・保存POST0件。画像を目視し文字の輪郭を確認。実ユーザーの保存履歴は変更しない。

証跡: [差分](foundation-result-copy-20261011/task-changes.patch)、[関連回帰](foundation-result-copy-20261011/focused-tests.json)、[型](foundation-result-copy-20261011/type-check.log)、[build](foundation-result-copy-20261011/build.log)、[実機確認](foundation-result-copy-20261011/after-check.json)、[変更前](foundation-result-copy-20261011/before.png)、[変更後](foundation-result-copy-20261011/after.png)、[360px](foundation-result-copy-20261011/mobile.png)。

全体テストは129ファイル1,752件中1,751成功、既存server/localAuth/plugin.test.tsの1件が5秒の時間切れ。失敗したファイルを並列数1で再実行し4件すべて成功（計567ms）。製品コード・テストの制限時間は変更しない。[全体実行](foundation-result-copy-20261011/full-tests.json)、[個別再確認](foundation-result-copy-20261011/timeout-recheck.json)。

ゲスト検証タブは終了し、本人の既存アプリで現在の実盤面を評価した更新済み結果を表示。教材盤面を本人のゲームやDBには入れない。[最終表示](foundation-result-copy-20261011/final-browser.json)。Habitica指定14の受入を反映し、全画面整理親は継続する。
