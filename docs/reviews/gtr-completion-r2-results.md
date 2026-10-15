# 完成見本・派生選択肢の独立レビュー R2

2026-09-27。固定対象は `gtr-completion-r2-snapshot.json` の221ファイル。
中立仕様は `gtr-completion-review-contract.md`（SHA-256 `52a7779fb35a9b048f3975c726a0cd74a582524c91dc7984a2ad2486f74a85d6`）。
全担当が15差分ファイルと関連コードを開始コピーとの比較で確認。相互共有・履歴継承なし。
レビュー中は編集・テスト・ビルド・ブラウザ操作を止め、全担当と親の照合で不一致0。

## 結果

- fresh Sol `/root/completion_r2_correctness`：全対象確認、指摘なし。
- fresh Sol `/root/completion_r2_integration`：全対象確認、表示停止中の教材タブ操作にP3候補1件。
- fresh Sol `/root/completion_r2_regression`：全対象確認、指摘なし。
- fresh Astra `/root/completion_astra_acceptance_r2`：実コードを読み、以下の限定修正を採用。他の確認済み指摘なし。
- R1の2件は解消と確認。旧ミニ図の全面復活・既存連鎖演出全体の変更は不要。

## GTR-COMP-R2-01 / P3

`GuidedPracticeScene.canBrowseCompletionExample()` が `isVisualStopped` を見ていない。
`recoverCommittedDisplay()` の盤面再描画等に失敗すると、旧教材タブが残存したまま表示停止へ入る場合がある。
その手動タブ／「案内に合わせる」が選択状態を変え、例外境界のない `updateGuide()` を再呼出しする。
盤面・供給・得点の直接変更は認定しない。停止中の通常操作抑止から漏れる新規の描画再入経路である。

最小修正は閲覧条件へ `!this.isVisualStopped` を追加。
復旧失敗で停止した状態から手動・自動の両方を試し、選択状態と描画回数が不変であることを回帰テストする。
通常時の教材操作と既存のEsc／巻き戻しを維持する。

## 検証済み証拠と次工程

型2種、80ファイル1033テスト（92.84秒、並列2）、build（7.26秒）成功。既存bundle警告あり。
v4固定500局：土台5が379→380、尾480・基本形496・100点6を維持。意図外消去・完成後喪失0。
供給と全配置を再検証し、変更game144のみ、成功喪失なし、初手2手目全500不変。
v3bからv4への実手順／停止理由の変更は0件。ちぎり・谷は開始点より微増しており、人間らしさ全般の改善は未証明。

元のSolへ限定修正を差戻し。検証後、新しいsnapshotでfresh Sol 3人とAstraのR3を実施する。
本R2を指摘なしとは扱わない。狭幅・長時間・前タスクの演出実操作残件は未確認を維持する。
