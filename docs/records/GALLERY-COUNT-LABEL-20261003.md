# 骨格選択の件数・選択中文字を削除

2026-10-03。利用者「10例の文字はいらない」「あと選択中の文字もいらない」。既存UIタスク78b67ce5-e604-4279-bedb-dff0dccdd4d8の追加1項目、10/11・本体未完了を保存後GET照合済み。実装前に追加仕様を同項目へ反映。

対象: CompletionGalleryの骨格選択カードの10例と選択中span、読み上げ名の件数、導入文の各10例を削除。図・形1/2/3・明るい選択枠/背景・aria-pressed・黄色focusoutlineを維持。既存表示テストのbutton nameを追随させ、選択中文字のassertionを撤去する。選択1件のariaと各10件/順番の検証は維持し、新しい写経テストは追加しない。教材数/フィルター/配置/順番/詳細再生/keyboard/focus/ゲーム計算は維持。全担当Sol6.1で設計確認、実装と型/全テスト/build、狭幅と選択画面確認、新規独立3レビュー、別最終確認を行う。開始baselineはreviews/gallery-count-baseline-20261003.json、直前同一ソースの検証は106ファイル1,322テスト・型検査・build成功。既存dirty変更を保護。

状態: Sol6.1設計・実装・検証・新規独立3レビュー・別担当最終確認完了、必須修正0件で受入。設計担当gallery_selector_designが2指定と既存選択/操作の維持を確認。受入条件は件数表記と選択中文字なし、画像・選択1つ・各10件の動作維持、必須検証とレビュー受入成功。

画面確認: IAB1280/320pxで本文/選択ラベルに10例/選択中文字なし。画像各11個読込、カード内に収まり、横overflowなし（client/scroll1265/1265・305/305）。3形の切替で選択1つ・各10件を維持。Enterで形2、Spaceで形3を選択できる。console warn/error0。viewportリセット、検証tab閉鎖済み。画像・計測はreviews/gallery-count-20261003/。詳細再生など未変更箇所の直前受入は維持し、今回は再操作していない。

実装変更2ファイル（CompletionGallery.tsx/GalleryShapeDisplay.test.tsx）のみ。型検査・106files1,322tests・build成功、既存chunk警告のみ。test/build初回sandbox親dir読込拒否後、正規escalationで成功。ログ.local/gallery-count-validation-r1.txt。レビュー中はソース・生成物/cacheを固定し、書込検証とブラウザを実行しない。

全担当の実モデルgpt-6.1-sol。新規3レビュー指摘なし、別担当gallery_count_r1_acceptanceが設計/コード/検証/画像/3件を確認し受入、必須修正0。固定283ファイル＋115生成物/cacheはレビュー後・最終確認後とも不一致0件、ゲーム/教材/素材変更0。[R1記録](../reviews/gallery-count-r1-review.md)。Habitica11/11・本体完了、本文と全チェックのID/文面/完了状態を保存後GET照合済み。commit/push/公開は行わない。
