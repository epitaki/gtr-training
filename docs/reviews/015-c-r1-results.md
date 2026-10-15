# 015-C R1 independent review results

2026-09-26。固定対象 `015-c-r1-snapshot.json`。親の型検査2種、78ファイル1003テスト、build成功。開始点はsnapshot参照。
3人とも履歴なしのfresh gpt-6-sol / high。コード等を編集せず全体を確認。第三担当は利用枠が空いた後に起動。

1. `pixel_c_r1_correctness`: 指摘なし。全対象確認、固定223ファイル前後一致。実画面の受入は親担当。
2. `pixel_c_r1_integration`: P2候補。両scene通常盤面更新で毎フレーム同じsetFrameを再設定。GuidedPracticeScene.ts:1399、PuyoGame.ts:676。Phaserはサイズと原点も更新するため不要な仕事が増える。現在frame名との比較で抑止し、不変盤面の追加呼出し0・隣接変更時更新の回帰検査を提案。
3. `pixel_c_r1_regression`: P2候補。gravity progress=1で全員stable connectを表示し、ChainPlaybackの残時間0ではland/0が次updateとなる。PuyoBoardRenderer.ts:133、ChainPlayback.ts:78。着地より先に通常の接続絵が1frame現れる。重力終端の表示をland/0とする最小修正と、丁度の落下時間で止まる回帰テストを提案。

親：終了後に固定223ファイルを照合し不一致0。PhaserのsetFrame実装には同一frameの早期returnがなく、サイズ／原点を再計算することはローカル依存ソースから確認。重要度と採否はAstra確認へ。
重力終端候補も設計上の「早着個体はstable」「全員到着後land」との整合をAstraへ確認する。現時点では未採否・未修正。

実画面の観察／未確認は `PUYO-PIXEL-INTEGRATION-CHECK.md`。P停止・再開、固定5連鎖+200・青1個、新素材両モード起動／再起動は観察。↑取消・実タブ非表示復帰・スコア実連鎖など未確認を自動検査から目視済みと推定しない。

## Astraの判定

`pixel_c_astra_acceptance_r1`（fresh gpt-6-astra / high）が実コード、差分、呼び出し元、契約、検査を確認。固定223ファイル不一致0。
コード受入可・確認済み修正必須0件。実画面受入は未確認項目があり未完了。

- R1-INTEGRATION-01：P2として不採用。最大78セルの再設定で、計測された実害なし。任意の最適化として扱い、隣接だけの変化を反映する正しい処理を変更しない。
- R1-REGRESSION-01：P2として不採用。短距離の早着もstable→全体landとする設計。終端の通常絵は既存phase境界に整合し、空中接続・着地省略・時間追加・確定境界変更ではない。終端だけの表示調整は任意であり今回は行わない。

Astraは複数回の再生／取消での所有物数、dispose後のframe、全phaseの実描画停止の直接検査が不足することも注記。コード上のガードに欠陥は認めないが、自動検査済みとは書かない。
親はC設計にある反復・停止の検証を補うため、同じSolへテスト追加だけを依頼。コード修正はせず、追加後に新しい固定対象で再レビューする。
