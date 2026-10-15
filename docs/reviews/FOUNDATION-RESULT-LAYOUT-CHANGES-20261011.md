# 土台評価の全体配置（2026-10-11）

状態: 反映・検証済み。

仮想発火→仮発火、案内をSpace 新しいゲーム / Esc ホームへ。コンテナの上部40px起点を撤去し、点数は画面高さの9%、盤面と評価は32.5%から、説明とキー案内は下端から176px/112pxの位置へ。点数48px、主要文字24px、盤面セル48pxに拡大した。4倍密度/NEAREST、採点・再生・キー処理は維持する。開始時点との差分は表示と、拡大に対応した既存マーカー描画回帰の期待座標のみ。

型/build/関連122・全1,752回帰成功。実Chromeのゲスト用localhostで100点盤面と空盤面を確認し、文言/全テキストが枠内/盤面と評価・再生と下部説明が重ならない/上下の75%以上を使う配置を検証。48pxセル、再生で盤面と乱数不変、実Spaceで新ゲーム、実Escでホームへ戻ることも確認。360pxは既存の盤面スクロールを保持し、ページの横はみ出しなし。例外0件・保存POST0件。

証跡: [差分](foundation-result-layout-20261011/task-changes.patch)、[関連回帰](foundation-result-layout-20261011/focused-tests.json)、[型](foundation-result-layout-20261011/type-check.log)、[build](foundation-result-layout-20261011/build.log)、[実Chrome](foundation-result-layout-20261011/after-check.json)、[PC](foundation-result-layout-20261011/after.png)、[360px](foundation-result-layout-20261011/mobile.png)。

再生完了時も仮発火：5連鎖 終了と表示することを確認。再生更新のデルタ上限を尊重して複数更新で完了まで進め、本体の再生仕様は変更しない。画像目視済み。検証用ゲストタブを閉じ、本人のアプリに現在の実盤面の更新済み結果を表示。Habitica指定15の受入を反映し、全画面整理親は継続。[全回帰](foundation-result-layout-20261011/full-tests.json)、[最終表示](foundation-result-layout-20261011/final-browser.json)。
