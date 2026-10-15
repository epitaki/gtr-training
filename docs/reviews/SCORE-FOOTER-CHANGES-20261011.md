# スコア画面下部の文言削除（2026-10-11）

利用者指定のBUILD / CONNECT / CHAINを削除。PuyoGameの描画3行だけを取り除き、採点・落下・保存・キー操作への変更はない。今回開始時のコピーとの差分で確認した。

- 型検査・build: 成功。
- ChainAnimationScenes / ScoreAttackGame: 69テスト成功。
- 実Chrome: 装飾文言なし、上部GTR回数とTOTAL SCOREを保持、実行時例外0件。
- スコア画面を利用者のブラウザに表示。全画面文言整理は継続中。

証跡: [差分](score-footer-20261011/task-changes.patch)、[関連テスト](score-footer-20261011/focused-tests.json)、[ブラウザ](score-footer-20261011/browser-footer.json)、[型検査](score-footer-20261011/type-check.log)、[build](score-footer-20261011/build.log)。
