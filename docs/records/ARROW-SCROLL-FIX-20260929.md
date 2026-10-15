# 下キーとページスクロールの同時反応 — 2026-09-29

状態: Astra追加設計・Sol実装・全体検証・実ブラウザの結果比較・独立レビュー3件・Astra技術受入まで完了。利用者報告「下押すとスクロールバーも一緒に反応する」。追加回答でCodex内ブラウザの下矢印長押し、配置後から次ツモ生成までとリザルトで発生と確認済み。

対象: 既存Habiticaキー設定タスク `4a6ca92f-cfe3-4f5f-9588-1e3ea42f0b01` に不具合修正項目を追加する。優先度は操作不具合P2、マウス割当追加より先に修正する。マウスは既存のUI後延期を維持。UIタスク全体の視覚確認は未完了のまま。

## 開始時点

[baseline](../reviews/arrow-scroll-baseline-20260929.json)に204ソース／配布素材・設定のhashと退避先を保存。前回UI受入snapshotとのアプリ差分0件。直前同一ソースの型検査、92files/1275tests、build成功をbaseline検証として再利用。既存dirty変更は今回の所有物とせず保護する。

## 原因とAstra設計

通常のcanvas focus時に下矢印を1回押す実ブラウザ確認ではdocument scrollTop169.60pxから変わらず、通常押下は既に既定動作を抑止している。コード上では消費済みの保持キーが連鎖／結果／ポーズ等の `acceptsAction=false` 状態へ移ると、継続repeatがpreventDefault前に拒否され、ブラウザへ抜ける。

親のCodex IABでリザルトの新規Downを再現。canvas focusを維持したままdocument scrollTop169.60→209.60px（+40px）。両SceneのlandCurrentPairは消去なしでもChainPlaybackを作成し、commitまでsoftDropを拒否するため生成待ちでも同じ経路が成立する。

Astra追加設計で所有記録案を撤回。PhaserInputAdapterの既定抑止とaction許可を分離する。ゲーム面focus中、現在の割当に存在するArrowLeft/Right/Up/Down・Space（結果special Spaceも含む）は、action拒否状態でも初回／repeatのブラウザ既定動作だけを抑止する。拒否状態ではpress／pressPhysicalを呼ばず、pending／physical／保持／解除待ちを変更しない。accepted経路とその抑止は現状維持しpreventDefault二重呼出しは避ける。

focus、editable、IME、hidden、既存修飾shortcutの除外が先。未割当、拒否された通常文字キー、ゲーム外の操作は従来どおり。Adapterに状態名や新しい保持集合を加えない。InputController、React、Sceneの状態ゲート、評価・推薦・乱数・ツモ・連鎖物理は変更しない。

## 受入と検証

- 下矢印の初回・repeatで既定動作を抑止し、既存150msゲーム反復を維持。
- 通常Down→実landCurrentPair→accepts=false→repeatでは抑止を維持し、次ツモ生成前の盤面・履歴・乱数・供給を変更しない。
- 状態が許可へ戻ってもkeyupまで次ツモを動かさず、keyup→新規押下で再開。
- リザルトの新規Down／repeatも抑止し、結果状態・盤面・点数・履歴・乱数を変更しない。
- 未割当キー、拒否中のKeyE等、ゲーム外focus、入力欄／contenteditable、IME、Alt、Tab、既存Ctrl/Meta文字shortcutは非消費。
- 既存blur／hidden／releaseAll／disposeと復帰時の入力解除を維持する。
- 結果special Spaceの解除待ちと単発再挑戦を維持。両Sceneとの境界を既存harnessで確認。
- 基本検証はtype-check／全test／build。固定した今回差分を新規Sol3人で独立レビューしAstra受入。
- 両モードの縦scroll可能な画面で短押し・通常操作、外部focus／設定のブラウザ操作を確認。CUAには保持時間付きkeydown/upが公開されていないため、長押しと状態遷移のrepeatは自動回帰テストで再現し、実キーボード長押しを未実測の場合は区別して記録する。

## 進捗

- Astra設計: gpt-6-astra / arrow_scroll_design、完了。親は通常下矢印短押しでscrollTop不変を確認。
- Habitica: 既存キー設定タスクへ未完了チェック `a5acbc71-cc5c-4d80-bbf9-55ead5f2a0a5` を追加。notes／全checklist文面・状態の再取得一致、本体falseを確認。
- Sol実装: gpt-6-sol / key_config_implementation。変更はPhaserInputAdapter.ts、同test、ChainAnimationScenes.test.tsの3件。対象2files/57testsとtype-check成功。初回testはsandbox親読込制限で起動不可、承認後の再実行でテスト監視メソッドの誤り1件を調整して最終成功。
- 親のCodex IAB確認: ガイド結果でDownを5回押してscrollTop169.60不変（修正前は1回で+40）。スコア結果でも5回押して165.60不変。Spaceで再挑戦しEscapeでポーズした後もDown3回で165.60不変。通常プレイでDown入力から評価へ遷移できる。ゲーム外のキー設定button focusではDownによるブラウザscroll0→40を維持。設定は保存せず取消。
- 実機の長押し操作はCUAに保持keydown/upがないため未実測。両Sceneの実landCurrentPair→commit、repeat、解除待ち、結果の新規Down/repeatを自動回帰テストで確認。
- 全体検証: `bun run test --maxWorkers=2` 92files/1278tests成功（112.53秒）。`bun run build` 成功（8.26秒）、既存500kB超chunk警告あり。Solの同一ソースtype-checkも成功。開始時204ファイルのうち変更は上記3件のみ、残り201件一致。CLI変更なし。
- 独立レビュー: 新規gpt-6-sol 3人、今回差分全体を独立readonly確認し全員指摘なし。gpt-6-astra / arrow_scroll_acceptanceが実コード・設計・検証・3結果を照合し技術受入可、確認済み修正点0件。固定snapshot `4b5f6368ee44555686480eb0ba01d989b323e79335c2ebe3d97916149afbad3e`。source205＋生成物27のhash不一致0。[受入記録](../reviews/arrow-scroll-r1-review.md)。
- 実機長押し未実測を明示したうえで、自動repeat/状態遷移回帰とIAB実操作比較で必要検証を満たすとAstraが判断。利用者のUI視覚確認とマウス延期は別の残件として維持。
- Habitica受入後更新: 今回不具合チェックだけを完了へ変更し、notes／全checklistのID・文面・状態を再取得照合、一致。キー設定タスク10/11、本体false、今回不具合true、マウスfalseを確認。完了工程のdocs反映後も受入アプリ・配布物は不変。
