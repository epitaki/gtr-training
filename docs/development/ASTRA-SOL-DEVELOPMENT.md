# 旧Astra / Sol 開発フロー（保存記録）

2026-10-04の利用者指定により、モデル別の役割設定と必須分業フローは廃止した。今後は設計・実装・テスト・レビュー・最終確認と、利用するサブエージェントをすべて `gpt-6.1-sol` に統一する。現行ルールは [AGENTS.md](../../AGENTS.md) を参照。

以下は当時の設定と実施結果を残す保存記録であり、現在の開発に適用する手順ではない。過去の担当モデルや検証結果は当時の事実として保持する。

設定日：2026-09-26。利用者承認の役割分担をGTRプロジェクトへ適用する。

## 設定

- 専用スキル：`C:/Users/sunpe/.codex/skills/astra-sol-development/SKILL.md`
- プロジェクトの入口：[AGENTS.md](../../AGENTS.md)
- 役割設定：`.codex/agents/gtr-astra-designer.toml`、`gtr-sol-implementer.toml`、`gtr-sol-reviewer.toml`、`gtr-astra-acceptance.toml`
- 設計・最終確認は `gpt-6-astra`、実装・独立レビューは `gpt-6-sol`。メイン会話や他プロジェクトの既定モデルは変更していない。
- custom roleを受け付けない実行ツールでは、モデルを明示したサブエージェントへ同じ役割の依頼を渡す。

モデル別の役割設定は[公式ドキュメント](https://learn.chatgpt.com/docs/agent-configuration/subagents)に従う。
今回の設定は自律的な常駐サービスではなく、依頼された作業を進めるときに適用する手順である。

## 手順

```text
Astra設計 → Sol実装・テスト → 新しいSol 3人の独立レビュー → Astra確認
                 ↑                                         │
                 └──────── 確認済みの指摘を返す ────────────┘
```

実装者とreviewerを分離し、reviewerには他者の指摘や実装者の履歴を渡さない。
レビュー中は対象を固定し、Astraはレビュー結果だけでなくコード・仕様・検証も確認する。
修正があればSolへ戻し、修正版を新しいSol 3人が確認する。
対象内の確認済み修正点0件・必須検証成功・Astra確認完了をもって終了する。
停滞、振動、仕様判断、モデルや権限の不足があれば未完了として報告する。

説明だけの依頼では作業を開始せず、設計のみ・レビューのみの依頼ではその範囲を超えて編集しない。
既存のreview-fix-loopとtriple-independent-code-reviewを利用し、コードの修正担当をSolに固定する。

## 初回適用：015-A

対象：[連鎖アニメーション設計](../design/CHAIN-ANIMATION-DESIGN.md)のAのみ。Bの新画像とCの個別フレームは対象外。

- スキルの公式検証スクリプト成功。UIメタデータ、役割TOML 4件の読み込み検査成功。
- Astra設計担当：`animation_astra_design`（`gpt-6-astra`）。現行APIと設計の実装前確認を完了。
- 変更前ソース保管：`C:/Users/sunpe/AppData/Local/Temp/gtr-animation-baseline-0a4bbbc1aaa94201aad56dd1efdcbea6`
- 実装前の型検査・ビルド成功。`bun run test -- --maxWorkers=2` は71ファイル・946テスト成功。
- 当初のバックアップはテスト探索範囲に入ったため、リポジトリ外の一時フォルダーへ移した。その混在した試験は基準値に使わない。
- Sol実装担当：`animation_sol_implementation`（`gpt-6-sol`）。015-Aの初回実装と対象42テストを提出。

### R1：初回実装のレビュー

- 親の型検査・全74ファイル958テスト・ビルド成功。既存の大きいbundle警告は継続。
- [固定対象](../reviews/015-a-r1-snapshot.json)：161ファイル、集約 `bc6e13d8d2948a33c8974665bab67b8f541c80caa5fcac697e2770da9831c9b9`。終了後も不変。
- 独立Sol：`animation_r1_correctness`、`animation_r1_integration`、`animation_r1_regression`。全員新規・履歴なし・読み取り専用。
- Astra受入：`animation_astra_acceptance_r1`。コード・設計・テストを確認し、下表をSolへ差し戻し。受入は未完了。

| ID | 優先度 | 確認済み課題 | 検出 |
|---|---|---|---|
| ANIM-001 | P2 | スコア側でタブ離脱中のkeyup欠落による入力停止 | Sol 1・2 |
| ANIM-002 | P2 | 確定後の表示例外で半確定の状態を復元扱いにする | Sol 1・3 |
| ANIM-003 | P2 | 取消後の推薦ゴーストが戻らない | Sol 2・3 |
| ANIM-004 | P3 | 共有不可の説明が再生終了後も残る | Sol 2・3 |
| ANIM-005 | P3 | 再生中に設定操作を受け付けない旨の案内がない | Astra |

ANIM-001のP1判定は不採用（限定条件で発生し、元キーの再押下・離上で復帰可能なためP2）。
ANIM-002に対する常時全巻戻し案は不採用。確定と表示の境界を分け、確定後の表示失敗では供給済みの状態を維持する。
両シーンの状態列同値、各再生段階の中断・破棄、トレースの独立した中間盤面などのテストを追加する。

実画面の部分確認：ガイドの固定5連鎖で途中消去・落下・3連鎖表示・最後に青1個・NEXT進行を観察。
モバイル幅の再生中共有不可statusを確認。スコア側は起動・通常落下・0連鎖供給・終局を確認。
自動操作の短いキー入力をPhaserが拾わない場面があり、P・途中↑・タブ非表示復帰・スコア側の実連鎖表示は未確認。
途中編集のHMRエラーはフル再読込後に再発していない。ユーザーのプレイ用タブは操作していない。
検証用の一時的な画面幅は元へ戻した。実画面の未確認事項を自動テストで完了扱いにはしない。

### R1修正後の検証

Solが5件を修正し、状態列比較・表示例外・取消・各再生段階・終了処理のテストを追加。
親の再検証は全75ファイル980テスト成功（113.52秒）、型検査・ビルド成功。既存のbundleサイズ警告は継続。
新しい3人の独立レビューとAstra受入はこれから実施する。

実操作の追加報告：利用者からPで「停止しない」と報告された。
確認時の検証タブは報告ダイアログのコメント欄にフォーカスがあり、Pの文字入力が見えた。
報告中のゲーム入力抑制は仕様どおりであり、この観察だけでは再生ポーズの不具合とは断定しない。
報告画面を閉じた通常操作での再確認を案内し、Sol診断・Astra設計確認を並行する。
ユーザー入力が入った検証タブは以降の自動操作対象から外した。

Astra追加設計確認：`animation_astra_design` が、Phaserの同一フレーム内keydown/keyupで
JustDownが消える別経路を確認。報告された症状の原因とは断定せず、連鎖中Pの限定修正をSolへ依頼した。
契約は設計§13。報告ダイアログ・通常入力・IME設定は変えない。

R1修正後の別検証タブでは1→2連鎖と落下、再生中の共有不可、終了後の案内消去と通常共有を確認。
共有画面の診断表示は2手目・直前1手、5連鎖20個消去・得点200、左下の青1個のみ、
CURRENT黄/青・NEXT緑/赤だった。通常の共有操作から取得し、ページ内のゲーム状態は直接書き換えていない。

短押し対策後、別検証タブで2連鎖目の落下中にP短押し→ポーズ表示、次の観察でも盤面不変、
再びPで同じ途中から再開を実画面確認。↑の自動短押しでは変化を観察できず、巻戻しの実操作確認は残る。
この確認は修正版のP操作についての証拠であり、利用者の過去の試行の原因を断定するものではない。

### R2：短押し対策を含む再レビュー

- 親の型検査・全75ファイル986テスト（124.42秒）・ビルド成功。既存bundle警告は継続。
- [固定対象](../reviews/015-a-r2-snapshot.json)：163ファイル、集約 `64607dd544c6fb23d92a05753eae2f7c7773767584141a0a6c12652d627392a4`。終了後も不変。
- 独立Sol：`animation_r2_correctness`、`animation_r2_integration`、`animation_r2_regression_retry`。
  3人目は起動枠不足で初回が失敗したため、先行担当の終了後に新規で起動。実施したレビューは3人分、履歴共有なし。
- Astra受入：`animation_astra_acceptance_r2`。確認済み指摘1件を採用しSolへ差し戻し。
- ANIM-006 / P2：スコア側でGTR成立手の先行表示が失敗すると、復旧後もGTR回数・点数・品質表示が古い。
  計算済み結果と確定済み状態から必須表示を復旧し、再失敗なら表示停止。再加点・再判定・再供給・演出再実行はしない。
- 不採用：ガイドの履歴保存／次手保存点への任意例外注入による部分巻戻し懸念。
  正常入力では検証済みplain-dataのメモリ内複製だけで、外部I/Oや表示呼出しがなく、具体的な例外経路を確認できなかった。
  任意mock throwやメモリ枯渇を前提とする汎用トランザクションは追加しない。
- コード修正後に新しい3レビューとAstra確認が必要。↑取消・実タブ非表示復帰・スコアの実連鎖表示も未確認で、015-A受入は未完了。

### R3：コード確認完了・実操作受入中

- SolがANIM-006を修正。実GTR成立＋1連鎖のケースで、先行表示失敗からのラベル復旧、再失敗時の操作停止を追加検証。
- 親の型検査・全75ファイル988テスト（122.78秒）・ビルド成功。基準946テストから42件増加。既存bundleサイズ警告は継続。
- [固定対象](../reviews/015-a-r3-snapshot.json)：163ファイル、集約 `a2e7a42a07def319dafd68e8c50007c152bbe5f98ca1c65d6efb1930964e08c2`。
- 独立Sol：`animation_r3_correctness`、`animation_r3_integration`、`animation_r3_regression_retry`。全員「指摘なし」。
  3人目は起動枠不足のため先行担当の終了後に新規起動。実施した3件の履歴は分離。
- Astra受入：`animation_astra_acceptance_r3`。コード・仕様・テスト・設定を照合し、確認済みコード修正点0件、追加差戻し不要。
- 親とAstraが163ファイルを終了後に再照合し、不一致0。レビュー期間内にソース・設定・設計を変更していない。
- 累計3ラウンド、独立Solレビュー9件、Astra受入3回。採用したANIM-001〜006とP短押し対策を反映。
  任意例外だけを前提とした履歴トランザクション案は追加していない。

**015-Aのコード確認は完了したが、タスク全体の受入は未完了。**
残りは途中↑取消、実タブ非表示・復帰とPポーズ維持、スコアアタックの実消去連鎖／途中のNEXT抑制。
操作ツールの短押しで確認できない項目を、テスト成功やコードレビューで実操作済みとは扱わない。
確認手順と5連鎖の固定局面は [実操作チェック](../reviews/CHAIN-ANIMATION-CHECK.md)。
Habiticaの015-Aと親015は未完了を維持し、015-B/Cは未着手のまま。コミット・公開はしていない。

### 次段階：015-Bの見た目確認

利用者の「確認した次に進んで」を受け、015-Bのコンセプト制作へ進んだ。
設計担当 `pixel_puyo_b_design`（gpt-6-astra / high）が現行コード・設計と、完成した原案を直接確認。
進行担当がimagegenで新規生成＋2回の修正を行い、画像と全プロンプトをプロジェクトへ保存した。
詳細は [015-B素材設計](../design/PUYO-PIXEL-ART-DESIGN.md)。ゲームコードは変更せず、既存src155ファイルとの不一致0。
今回は絵柄承認前で停止するため、Sol実装・独立コードレビュー・テスト再実行は行っていない。
Aの未特定の実操作項目を個別に成功扱いにはせず、Bも完成扱いにはしていない。C統合は未着手。

### 015-B：承認後の素材制作・R1

利用者が原案と画像生成＋スクリプト加工を承認。`pixel_b_production_design`（Astra）が制作契約を確認し、`pixel_b_sol_implementation`（Sol）が素材パイプラインと検査を実装。
詳細は [実装用素材の制作契約](../design/PUYO-PIXEL-PRODUCTION.md)。現在も015-Cのゲーム接続は未着手。

- 開始基準：2種の型検査、75ファイル988テスト（93.03秒）、ビルド成功。
- R1前の検証：2種の型検査、同988テスト（122.90秒）、ビルド成功。最終胴体調整後の素材7検査も成功。既存bundleサイズ警告のみ。
- [R1固定対象](../reviews/015-b-r1-snapshot.json)：17ファイル。全レビューとAstra終了時までハッシュ不一致0。既存src155ファイルも開始点と一致。
- 独立Sol：`pixel_b_r1_correctness`、`pixel_b_r1_integration`、`pixel_b_r1_regression_retry`。第3枠は起動枠不足の後、先行終了後にfreshで起動。実施は3件。
- Astra受入：`pixel_b_astra_acceptance_r1`。候補を統合しP2を4件採用、Solへ差戻し。
- B-R1-01：必須46状態の欠落・未知名を生成前に拒否する。
- B-R1-02：緑の上接続でも成立コマと安定コマに差を持たせる。
- B-R1-03：ミニ版で生成原画の表情を保持する。新しい絵の描き直しではなく顔ROIと縮小サンプリングを調整する。
- B-R1-04：実在するland/emphasisと接続成立の時刻・優先順位・段階なし時の扱いを対応表へ明記する。
- 棄却：QA見出しの重なり。文字の右端367と十字の左端380は横方向に離れ、実画像で重ならない。

修正後は新規Sol3人とAstraの再確認が必要。現段階のBは未完了。

### 015-B：R2

- R1の4件を修正し、親の素材10検査成功。保存画素からのbuildでatlas／manifest／QA画像・HTML／画素データのハッシュ不一致0。
- [R2固定対象](../reviews/015-b-r2-snapshot.json)：18ファイル。前後のハッシュ不一致0。既存src155ファイルは開始点と一致。
- fresh Sol：`pixel_b_r2_correctness`、`pixel_b_r2_integration`、`pixel_b_r2_regression`。枠に合わせ第3担当は先行終了後に起動。
- Astra受入：`pixel_b_astra_acceptance_r2`。2件を確定しSolへ差戻し。
- B-R2-01 / P2：原画の等分セル境界で青crossに黄上端が混入し、黄色は自身の上端を欠損。個別ROI／成分分離で切り出す。正しい原画境界は青 `[351,650,590,876]`、黄 `[350,938,590,1163]`。
- B-R2-02 / P3：複合マスクと成立コマを含む全接続境界RGBAを共通基準と比較。不正な辺の画素編集を検査で検知する。
- 不採用：来歴のsourceRectsを任意に範囲外へ壊した入力の追加防御。通常buildの切出しには使われず、現行値の範囲外参照もない。実際の抽出不良はB-R2-01で修正する。

R1の課題を解消したうえで別の抽出不良と検査不足を発見したもので、同じ指摘の停滞ではない。再修正後にfresh Sol3人とAstra R3を行う。

### 015-B：R3

- R2の2件を修正。親の素材12検査成功、再生成hash不一致0、ゲーム既存src155ファイル不変。
- [R3固定対象](../reviews/015-b-r3-snapshot.json)：18ファイル。全レビューとAstra終了時hash不一致0。
- fresh Sol：`pixel_b_r3_correctness`、`pixel_b_r3_integration`、`pixel_b_r3_regression_retry`。第三担当の初回はサービス認証エラーで未完。許容1回のfresh再試行で3件を完了。
- Astra受入：`pixel_b_astra_acceptance_r3`。確認済み1件をSolへ差戻し。
- B-CONNECT-MIXED-ENTER / P2：既存右接続2へ上が加わった現在3／新規1で、enter3全体では旧右肩も変わる。184フレームを維持し、新規肩だけをstableへ重ねる矩形対応表・QA・検査を追加する。
- 不採用：sourceRects／faceSamplingの任意破損拒否。現在の52原画矩形・24顔サンプルは範囲・包含・配置を実測し正常。通常buildの切出入力ではなく、前回と同じ来歴への追加防御。

修正後はfresh Sol3人とAstra R4を実施する。ゲーム描画への部分合成はCの実装範囲。

### 015-B：R4

- 混在接続の対応表・静的QAを追加。親の素材13検査成功（324の有効な新規接続部分集合を含む）、再生成hash不一致0。
- [R4固定対象](../reviews/015-b-r4-snapshot.json)：18ファイル。レビュー後もhash不一致0。
- fresh Sol：`pixel_b_r4_correctness` と `pixel_b_r4_integration` は指摘なし。`pixel_b_r4_regression` はQA見本の指定を1件指摘。
- Astra受入：`pixel_b_astra_acceptance_r4`。B-R4-01 / P3を採用。T字見本中央のmask12を14へ直し、全8見本を実際の同色隣接関係と照合する検査を追加する。
- 同じ修正でQAの72px／48pxのラベルを明確化する。寸法・原画・アトラスの変更には広げない。
- Astraが全8見本を調べ、現在の不一致はT字中央だけと確認。素材自体への新しい指摘はない。

修正後、fresh Sol3人とAstra R5で確認する。

### 015-B：R5・素材制作完了

- SolがT字見本を修正し、全8配置の同色隣接から接続maskを照合する独立検査を追加。盤面素材のatlas・manifest・画素データはR4から変更なし。
- 親の素材14検査成功（3.275秒）。保存画素からの再生成でatlas／manifest／QA画像・HTML／画素データのハッシュ不一致0。
- [R5固定対象](../reviews/015-b-r5-snapshot.json)：18ファイル。既存src155ファイルを含む開始点の199ファイルは不変（追記したscripts/READMEは比較から除外）。
- fresh Sol：`pixel_b_r5_correctness`、`pixel_b_r5_integration`、`pixel_b_r5_regression`。履歴を共有せず、第三担当は先行2人の終了後に起動。
- 最終Sol3人は全員「指摘なし」。全3件の終了後、親が固定18ファイルを照合し不一致0。
- Astra受入：`pixel_b_astra_acceptance_r5`（gpt-6-astra / high）。コードと画像・仕様の実物を読み、015-B受入可・確認済み修正点0、追加差戻し不要と判断。
- Astraは184フレームの保存画素と実atlas、52原画矩形・24顔サンプル、来歴・時間契約を読み取り専用で照合。終了時にAstraと親が固定18ファイルを再確認し不一致0。
- 静的QAをブラウザでも確認し、修正したT字接続、動作コマ、小サイズ表情、既存／新規の混在接続を目視。015-Cの実ゲーム演出の検証ではない。

**015-Bの受入完了。** 累計5ラウンド、独立Solレビュー15件、Astra受入5回。R1の4件・R2の2件・R3とR4各1件、計8件の採用指摘を解消した。
過去の棄却候補（実画像で非重複のQA見出し、正常な来歴メタデータを任意破損させた追加防御）は、上記の理由で変更していない。
最終の素材14検査、再生成一致、型検査2種・全75ファイル988テスト・ビルドが成功。ゲーム側への素材importや実行時依存追加はない。
既存のbundleサイズ警告を解消したとは扱わず、無欠陥保証もしない。

次の015-Cでは本素材を実ゲームへ接続する。実再生での肩部分合成、16msの成立コマの見え方、個別落下／着地／消滅の中断・破棄と両モードの表示は未実施。
015-Aの途中↑取消・実タブ非表示復帰・スコア側実連鎖の未個別確認も維持する。B完了を理由に015-A／Cや親015を完了扱いにしない。
素材見本：[QA画像](../../assets/puyo/source/production-v1/qa-preview.png)／[拡大確認ページ](../../assets/puyo/source/production-v1/qa-preview.html)。

Habitica反映：015-B（`4230bafb-39f5-486e-a924-f3a092bf7973`）の既存6項目を完了し、履歴を残して最終R5の記録を追記、タスク本体を完了した。保存後のGETでcompleted=true／6項目完了／完了記録の保存を確認。015-A・C・親015は更新していない。

## 015-C：ゲームへの素材・個別演出の統合

利用者の「続けて」を受けて開始。`pixel_c_astra_design`（gpt-6-astra / high）が既存コードとB契約を確認し、[統合設計](../design/PUYO-PIXEL-INTEGRATION.md)を具体化した。
固定前gridから初期の新規隣接を区別、ID関係で既存／新規を判定し、アトラス肩矩形の小overlayで部分合成する。
短距離個体は先に終点で固定し、全員到着後の既存landで1回だけ着地コマを再生する。coreや時間契約は拡張しない。

- 開始点保管：`C:/Users/sunpe/AppData/Local/Temp/gtr-pixel-c-baseline-75fa2ecf3c0c4eb88be8e94c9f2d48e4`。src/scripts/assets/docsと関連設定を保護。
- 親の開始前検証：型検査2種・75ファイル988テスト（120.56秒）・ビルド成功。既存bundleサイズ警告あり。
- 実装担当：`pixel_c_sol_implementation`（gpt-6-sol / high）。描画層・両sceneの素材選択と関連テストを担当。
- B原画・生成PNG・manifest・加工手順は不変。推薦・採点・供給・履歴・乱数は対象外。
- 開始時は新規Sol3人のレビュー、Astra最終確認、Cの実画面受入が未実施。以下にその後の記録を追加する。

### 015-C：実装・R1・受入検証追加・R2

Solがatlas登録、IDに基づく新規接続と肩の部分合成、個別落下／着地／消滅・同期粒、両sceneの表示を実装。
実装中の親確認で、疎な肩overlay配列の安全な非表示と初回gravityで固定前の接続を保持する2点を修正し、それぞれ回帰テストを追加した。
初回実装後：型検査2種、78ファイル1003テスト（112.28秒）、build成功（7.89秒）。

- R1固定対象：[223ファイル](../reviews/015-c-r1-snapshot.json)。fresh Sol `pixel_c_r1_correctness`、`pixel_c_r1_integration`、`pixel_c_r1_regression` が独立確認。
- Astra `pixel_c_astra_acceptance_r1` は実コードを確認し、コード受入可・修正必須0と判断。[候補2件の不採用理由](../reviews/015-c-r1-results.md)を保存。
- C設計の反復・停止検証を補うため、同じSolが `PuyoBoardRenderer.test.ts` のみに6テストを追加。実装コードはR1から不変。
- 24回の完了／着地途中取消／粒途中取消でspriteとtextの生存0・destroy1回、dispose後のframeで生成／更新なし、全phaseでuser+hiddenの独立pause/resumeを直接検査。
- 親の再検証：型検査2種、78ファイル1009テスト（108.77秒）、build成功（7.71秒）。既存bundle警告は未解消。
- R2固定対象：[224ファイル](../reviews/015-c-r2-snapshot.json)。fresh Sol `pixel_c_r2_correctness`、`pixel_c_r2_integration`、`pixel_c_r2_regression` は全員指摘なし。3人の終了後に親が全件照合し不一致0。
- Astra `pixel_c_astra_acceptance_r2`（fresh gpt-6-astra / high）が実コードと追加検査を確認。コード受入可・確認済み修正必須0、追加差戻し不要。固定224ファイル不一致0。[レビュー結果](../reviews/015-c-r2-results.md)を参照。
- 合計2ラウンド・fresh Sol6件・Astra2回。最終3件は指摘なし。コード側は完了し、実操作受入を残す。

実画面：別タブで両モードの起動／再起動、4色素材、横・縦・L字接続、NEXT／教材ミニ／半透明ghostを確認。
固定5連鎖の落下・つぶれ・分裂・粒、+200・青1個、P停止／再開、途中共有拒否と完了後の復帰を観察。
↑取消は自動短押しで確認できず、実タブ非表示復帰・スコア実連鎖なども未確認。実キーボード結果は利用者へ任意質問中。
詳細は[実画面確認表](../reviews/PUYO-PIXEL-INTEGRATION-CHECK.md)。自動テストと目視を混同せず、015-A・C・親015の実操作受入は未完了を維持する。

Habitica保存後GET確認：015-C（`4ad614bf-4fa5-4ff4-bf83-766fb6cd1d95`）は4/7項目完了・本体completed=false。素材接続、個別落下／着地、同期消滅、ブラウザ確認記録を完了にした。
見やすさの全経路・操作取消／リセット等・長時間実機検証の3項目を残し、R2コード確認完了と未確認の詳細をnotesへ追記。015-A・親015は今回更新していない。
親の終了時固定224ファイル照合も不一致0。

### 015-C：接合部の内部輪郭を修正

利用者の「連結が二本の線だけに見えて不自然」を限定修正。
`connection_join_astra_design`（gpt-6-astra / high）が実画像とコードから[設計](../design/PUYO-CONNECTION-JOIN-FIX.md)を作成。
`connection_join_sol_implementation`（gpt-6-sol / high）が接続だけの再合成、保存画素、比較素材と検査を実装した。
開始コピーは `C:/Users/sunpe/AppData/Local/Temp/gtr-connect-baseline-028d55e757944cea9370e9b3a4d73877`。
顔ROI・非接続フレーム・metadata・原画・manifest・runtime159ファイルを維持し、接続120フレーム3648画素だけを更新。

素材18検査と型2種が成功。標準並列の全体検証で既存推薦／benchmark10件のtimeoutとworker timeoutが出たが、コード・時間制限を変えず並列数2に抑え、全1009テスト成功（109.56秒）。build成功（7.71秒）、既存bundle警告あり。
対象[232ファイル](../reviews/015-c-connection-r1-snapshot.json)を固定後、fresh Sol3人 `connection_r1_correctness`／`connection_r1_integration`／`connection_r1_regression` は全員指摘なし。履歴なし・相互共有なし・読み取り専用で実施し、前後ハッシュも全一致。
fresh Astra `connection_astra_acceptance_r1` が実コード・検査・比較画像を確認し、受入可・必須修正0・追加差戻し不要と判定。Astraも前後232ファイル一致。
今回の接続限定修正は1ラウンドで完了。[検証結果と制約](../reviews/015-c-connection-r1-results.md)を参照。
実盤面の横／縦／L字／全色2×2を確認。16ms肩enterの実画面捕捉、以前の取消／タブ復帰等は未確認として残し、015-C全体と親015を完了扱いにしない。
Habiticaの既存015-Cへ今回の修正記録だけ追記。保存後GETでnotes反映、completed=false、4/7チェックの内容・状態が更新前と同一であることを確認した。

## 2026-09-27：完成見本・動画原則のガイド反映

- Astra設計：`completion_panel_astra_design`（gpt-6-astra / high）。完成図の教材表示と推薦を分離し、v1表示→v2派生加点→v3完全同点比較を確認。R1受入でv4安定再配置の契約を追加した。
- Sol実装：`completion_panel_sol_implementation`（gpt-6-sol / high）。app／testの編集者を一人に保ち、親は記録・検証を担当。
- 開始点：[研究記録](../records/GTR-COMPLETION-VIDEO-20260927.md)のbaselineコピー。今回15差分を既存dirty worktreeと区別。
- 推薦v1は尾完成480→479で事前維持条件を満たさず不採用。数値スコア・探索を維持し、完全同等な候補の受け方だけを比較するv3／v4へ限定した。
- R1：fresh Sol `completion_r1_correctness`／`completion_r1_integration`／`completion_r1_regression` とfresh Astra `completion_astra_acceptance_r1`。支持色の説明と比較の非推移性、P2を2件採用。旧ミニ図の全面復活は不要と判断。[記録](../reviews/gtr-completion-r1-results.md)。
- R2：fresh Sol `completion_r2_correctness`／`completion_r2_integration`／`completion_r2_regression` とfresh Astra `completion_astra_acceptance_r2`。表示停止中の教材操作P3を1件採用。[記録](../reviews/gtr-completion-r2-results.md)。
- R3：fresh Sol `completion_r3_correctness`／`completion_r3_integration`／`completion_r3_regression` は全員指摘なし。終了後にfresh Astra `completion_astra_acceptance_r3` が実コードを読み、受入可・確認済み修正点0と判定。[記録](../reviews/gtr-completion-r3-results.md)。
- 各ラウンドは全15差分と関連コードを独立確認。相互結果と履歴を与えず、レビュー中は書込みを停止。R3のworkspace固定221ファイルは前後一致。

合計3ラウンド、独立Sol9件、Astra3回で採用3指摘を解消し、本件は完了。
最終検証は型2種・80ファイル1034テスト（123.28秒）・build（8.48秒）成功。既存bundle警告は残る。
固定500局で土台5は379→380（75.8→76.0%）、尾480・基本形496・100点6を維持。変更game144のみ、成功喪失・意図外消去・完成後喪失0。
R2の表示停止修正後も推薦／採点／供給／物理／測定コードはv4測定版と一致。表示ガードだけの変更で再測定は不要と確認した。
既知集合の1件増に留まり、ちぎり・谷は微増。汎化性能や人間らしさ全般の改善、実発火後の余り改善を認定しない。
狭幅・長時間・既存演出の実操作残件を維持し、旧015全体の完了や外部タスク更新には広げていない。
