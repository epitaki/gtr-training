# 完成形一覧の骨格選択を画像化

2026-10-03。状態: Sol6.1設計・実装・検証・新規独立レビュー3件・別担当最終確認完了、必須修正0件で受入。既存UIタスク78b67ce5-e604-4279-bedb-dff0dccdd4d8の追加依頼。前回完了実績は保持。Habitica10/10・本体完了、本文完全一致・全チェックID/文面/完了状態を保存後GETで照合済み。

依頼: 非選択の2種が選択中に見える。Y字・座布団・L字は内部呼称なので、骨格を表したぷよ画像を見て選べるようにする（「故障」は文脈から「呼称」と解釈）。

対象は完成形一覧の選択UIと表示ラベル。選択は常に1つ明瞭、既存atlasで3種の骨格差を表し、内部名の暗記を要しない。内部ID/分類/30教材の配置と順序/10例フィルター/詳細連鎖再生/戻るfocusを維持。ゲーム計算・採点・推薦・乱数・供給・入力・認証を変更しない。

320/390/768/desktopで全図が収まり、画像読込・選択中の色と枠・aria状態・キーボード・各10例・詳細再生と戻るfocusを確認。型検査・全テスト・build、新規独立3レビューと別担当最終確認を行う。全担当gpt-6.1-sol。開始baselineはreviews/gallery-selector-baseline-20261003.json。直前と同一アプリソースで型検査・105files1,318tests・build成功済み。既存dirty変更を保護する。

## 設計契約

設計担当gallery_selector_design（gpt-6.1-sol）の確認を採用。TailPlannerのchainCellsと全30教材のC位置に一致する、共通折返し7個＋青4個の骨格図をUIデータとして持つ。Yは`...... / ABC... / AABCC. / BBC...`、座布団は`...... / ABC... / AABCCC / BB....`、Lは`...... / ABC... / AABC.. / BBCC..`。A赤/B緑/C青、下4行を既存GalleryBoardで描画。支え/後続ぷよを省略した説明を表示し、骨格図を採点・発火へ渡さない。

画像主役の3つの選択ボタン、補助名は形1/形2/形3・各10例。明るい枠・背景・「選択中」は選択1つのみ。同じ枠幅と固定高さの選択表示で位置を維持。focusは別の外側outline、aria-pressedとbuttonのEnter/Spaceを保持。未収録の✓は使わず文字で表示する。狭幅で3図を収める寸法を実測調整し、共有GalleryBoardは変更しない。

導入/region名/カード見出し/詳細見出しはUI側の形番号へ統一し、教材titleやIDは保持。骨格データの青座標と既存TailPlannerおよび各教材C座標の一致をテストし、誤分類を防ぐ。変更範囲はcomponents/gallery内の表示・表示データ・テストのみ。

寸法確認による調整: 320pxではdocument305px・main左右32pxにより273px、3列の90px図は収まらない。図の可読性を優先し、mobileは横並びの画像/ラベルを持つ3カードを縦に配置、sm以上で3列・カード内縦並びにする。セル18px・盤面約127pxとp2で、768pxのside menu併設時も収める。画像サイズは画面確認で必要なら調整する。

## 実装・画面確認

CompletionGalleryと表示データGalleryShapeDisplay、同テストを変更。共通GalleryBoardとゲーム側は維持。IAB1280/320/390/768pxで3図は各11画像読み込み済み、カード内に収まり、document client/scrollは1265/1265・305/305・375/375・753/753。各選択後1件のみaria-pressed=true、各10例を表示。選択は紫の枠/背景/選択中文字、非選択は控えめ。Tabで形2へ、Enterで形2選択、Tabで形3へ、Spaceで形3選択成功。黄色のfocus-visible outlineと選択枠を区別。詳細の形3 1は5連鎖全消し、再生し直しとEscで閉じる、起点カードへのfocus復帰成功。console warn/error0。viewportリセット済み、検証専用tab閉鎖済み。画像と計測はreviews/gallery-selector-20261003/。DPR2/別zoomは未実測。

型検査・106ファイル1,322テスト・build成功。新規4テストは骨格/Planner/全30教材の一致と選択1つ/各10例を検証。ログ`.local/gallery-selector-validation-r1.txt`。test/build初回sandboxの親dirアクセス拒否後、正規escalationで成功。build既存chunk警告のみ。実装書込を停止し開発サーバーを止め、独立レビュー中はソース・生成物・キャッシュを固定する。

## 最終受入

全担当の実モデルgpt-6.1-sol。新規3独立レビューは全員指摘なし、別担当gallery_selector_r1_acceptanceが現物・設計・検証ログ・画像・計測・3件を確認し受入。必須修正0件、候補の却下なし。[レビュー記録](../reviews/gallery-selector-r1-review.md)。固定283ファイルと79生成物/cacheはレビュー後と最終確認後に不一致0件。アプリ変更3ファイルのみ、ゲーム/教材/素材変更0件。未コミット変更を保持し、commit/push/公開はしない。
