> 2026-09-27時点の索引を保存した記録です。現行の入口は [docs/README.md](../README.md) を参照してください。
> 初手の分類・供給範囲など、後に判明した説明の食い違いは [現行の生成仕様](../specs/PUYO-GENERATION.md) と [調査記録](../research/DOCUMENTATION-CONSISTENCY-20261003.md) を参照してください。

# ドキュメント一覧

GTRトレーニングツールのドキュメントです。整理日：2026-09-27。

**GTR完成を第一目的とし、人間が学んで再現しやすい組み方を主要な評価軸とします。**
完成率・連鎖数だけでなく、構築順、ツモの両方の活用、自然な連鎖尾、不要なちぎり、発火点伸ばしを確認します。
合格条件と確認方法は [GTRガイドの品質・人間らしい手順の評価基準](../specs/GTR-QUALITY-CRITERIA.md) に集約しています。

## まず読む資料

| 知りたいこと | 参照先 | 文書の役割 |
|---|---|---|
| 今どこまで完了し、何が残っているか | [最新の進捗](../progress-report.md) | 採点・推薦・集計の修正、測定結果、検証範囲、残件 |
| 次に操作設定と8bitテーマをどう改善するか | [次期改善の開始準備](../design/INPUT-PIXEL-THEME-PLAN-20260927.md) | ぷよスポ風キーコンフィグ、全画面の文字・テーマ統一、多重学習の後順位タスク |
| キーコンフィグをどう実装するか | [キーコンフィグ設計案](../design/KEY-CONFIG-DESIGN-20260927.md) | プリセット・固有操作・画面ボタン・状態別入力・保存の未実装仕様 |
| 右端が高い形と平らな形をどう評価するか | [完成点と伸ばしの分離](../design/GTR-SURFACE-QUALITY-20260927.md) | Y字3/8の再調査、最小完成100点、足場と限定接続例、旧採点・ガイドとの区別 |
| ガイドでも右端以外の満点土台を選ぶには | [完成候補の拡張](../records/ADVISOR-FOUNDATION-SHAPES-20260927.md) | 右端への追加優遇を撤廃、Y字3/8の実配置経路、完成と回収を先に比較 |
| 完成形を一覧・拡大再生で見比べるには | [完成形ギャラリー](../design/GTR-COMPLETION-GALLERY.md) | Y字・座布団・L字各10例、消去順プレビュー、閲覧中のゲーム保持 |
| 結果画面で土台の消去順を見るには | [結果の連鎖プレビュー](../design/RESULT-CHAIN-PREVIEW.md) | 評価図を縦横2倍に拡大。範囲内の仮想発火を順に消去し、落下は即時切替 |
| 右側の完成見本はどう使うか | [視覚的ガイド](../specs/GTR-VISUAL-GUIDE.md)／[ゲームモード仕様](../specs/GAME-MODES.md) | 現行3図、自動・手動切替、推薦との区別。教材・土台評価・実プレイを分離 |
| 完成形を見ながら、派生の選択肢を残して組むには | [完成見本と動画学習の反映](../records/GTR-COMPLETION-VIDEO-20260927.md) | 完成3図と同点候補の受け方比較。固定500局で土台5が379→380、全1034テスト、Sol3人×3回＋Astraで受入完了 |
| ぷよの連結部に残る二重線を自然にするには | [接合部の修正設計](../design/PUYO-CONNECTION-JOIN-FIX.md)／[検証・レビュー](../reviews/015-c-connection-r1-results.md) | 顔と他画像を保ち、接触面だけ再合成。48px前後比較、素材18検査、全1009テスト、独立Sol3人＋Astraで確認 |
| 連鎖を順番に見せ、独自ドット絵で動かすには | [連鎖アニメーション設計](../design/CHAIN-ANIMATION-DESIGN.md)／[ゲーム統合設計](../design/PUYO-PIXEL-INTEGRATION.md)／[受入確認](../reviews/PUYO-PIXEL-INTEGRATION-CHECK.md) | Habitica 015。B完了。Cの両モードへの統合・1009テスト成功、実操作受入中 |
| 余る青を縦3ではなく横3の発火点伸ばしに使うには | [完成前のキー待ち構築](../records/ADVISOR-HEAD-CONSTRUCTION-20260926.md) | 同じ土台を守る開始条件、実ツモ再現、低い横3の選択と検証 |
| 完成前の相方をどう回収へ振り分けるか | [同じ土台・完成骨格を守る相方配分](../records/ADVISOR-SPARE-ALLOCATION-20260925.md) | 全盤面の接続を確認した候補比較、不採用案、測定と残件 |
| 発火口を守りながら捨てぷよを減らすには | [頭・尾への相方配分の再学習](../research/GTR-SPARE-ALLOCATION-RESEARCH-20260925.md) | 3動画の部分目視・字幕と3記事。完成優先、回収順、仕込みの条件と未実装の仮説 |
| 基本形が作れなくなったらどうするか | [基本形の保護と閉塞案内](../records/ADVISOR-FOLD-GUARD-20260925.md) | 必要マスを塞ぐ推薦の排除、原因表示、巻き戻し後の再開 |
| 発火不能な横3・L字の仕込みをどう推薦するか | [キー待ちの発火点伸ばし](../records/ADVISOR-HEAD-SCAFFOLDS-20260925.md) | 土台完成後の接続待ち、本体の早消しリスク、完成前の適用を撤回した理由 |
| 満点土台探索の導入経緯は | [低い満点土台への推薦改善](../records/ADVISOR-PERFECT-FOUNDATION-20260925.md) | 9/25時点の右端形への実装記録。現行の候補拡張は上記9/27記録を参照 |
| 2個組でも土台100点になるか | [土台100点と全盤面状態の分離](../records/FOUNDATION-SCORE-20260925.md) | 19個の土台＋範囲外の相方、基本形2＋尾3、実配置テストと固定500件の再測定 |
| 完成後も発火せず伸ばすガイドと余り採点 | [継続構築の変更記録](../records/ADVISOR-CONTINUOUS-20260924.md) | 土台5を保った頭・尾の接続、余りなし ＞ 1個 ＝ 同色連結、旧測定との区別 |
| 上側に頼らず土台内で連鎖を作るには | [土台と発火ツモの受け口](../records/ADVISOR-FOUNDATION-PREPARATION-20260924.md) | 限定した準備評価、100点率などの集計、右上構築の未解決点 |
| 土台の採点と実際の連鎖はどう違うか | [採点仕様](../specs/GTR-SCORING-SYSTEM.md)／[範囲外混入の修正](../records/GTR-EVALUATION-RANGE-20260924.md) | 範囲外を除いてから土台を採点。実プレイと推薦の発火判定は全盤面 |
| 平均余り5個以下の目標は達成したか | [v6の測定と未完了事項](../records/ADVISOR-SPARE5-20260924.md) | 凍結候補2,000件の実発火後平均4.927569個。集合別では5超もあり、最終比較・採否は未確定 |
| どこに何のコードを置くか | [機能別モジュール＋レイヤード構成](../PROJECT-STRUCTURE.md) | 現行のディレクトリ・依存方向・分割基準 |
| 何を良いガイドと評価するか | [品質・人間らしい手順の評価基準](../specs/GTR-QUALITY-CRITERIA.md) | 現在の品質方針・採否判断。新しい指標の実装済み宣言ではない |
| 人間の手順にどこまで近づいたか | [500記録の調査・比較](../research/GTR-HUMAN-PLAY-STUDY.md) | 保存済みの実測・データの限界 |
| 動画・ぷよ譜を繰り返し使うには | [ぷよ譜ライブラリ](../../benchmarks/human/README.md) | 500記録の目録、確認範囲、別案と検証の保存。譜面を唯一解にしない |
| 左端の発火点伸ばしと形の優先順 | [最初の修正候補](../records/ADVISOR-HEAD-EXTENSION-20260922.md)／[後続の改善](../records/ADVISOR-CONSTRUCTION-20260922.md) | 限定形、11骨格、完成率回復と人間らしさの未解決点 |
| 低い本線と上側の伸ばしを両立するには | [青緑の上下と候補拡張](../records/ADVISOR-LOWER-TAIL-20260922.md) | 下側で回収する1個を、元の5連鎖を保って骨格へ挿入する限定実装 |
| 1列だけ深くへこむ積み方を減らすには | [平坦さの評価と挟まれ回転](../records/ADVISOR-SURFACE-20260922.md) | 高い塔・深い谷への軟らかい減点と、左右に挟まれた縦ぷよの上下交換 |
| 追加500ゲームで何が分かったか | [色の受け口評価の試行と不採用](../records/ADVISOR-LEARNING-500-20260922.md) | 開発250・未使用検証250と従来500で比較。完成率低下のため標準推薦は維持 |
| 組ぷよの両方をどう活用するか | [同じ骨格に対する2個の用途評価](../records/ADVISOR-PAIR-USE-20260922.md) | 009-A完了。折り返し完成後・尾完成前の限定評価を採用。1,500ゲームで尾完成維持・5連鎖1件増、補助指標は混在 |
| 尾が完成してからなぜ色待ちになるか | [不足色と支持順の診断・改善試行](../records/ADVISOR-TAIL-WAIT-20260922.md) | 009-B完了。1,500ゲームで尾完成維持・5連鎖2件増。未使用集合の手数・余りの小幅悪化も保存 |
| 左接続と既存骨格をどう両立するか | [接続を先送りせず同じ骨格へ2個を使う](../records/ADVISOR-LEFT-CONNECTION-20260922.md) | 009-C完了。1,500ゲームで尾完成2件・5連鎖3件増。成功喪失なし、手数・余り・谷の一部悪化も記録 |
| 完成率を守って高い谷をさらに減らすには | [先読み発火でも現在手の形状を比較する](../records/ADVISOR-TALL-WELLS-20260922.md) | 009-D完了。1,500ゲームで尾完成・5連鎖成功を維持、谷2,347→2,181手。ちぎり微増・一部の連鎖短縮も保存 |
| 1,000ゲームで何が改善したか | [余りぷよ回収の前後比較](../records/ADVISOR-NATURAL-1000-20260919.md) | 2026-09-20完了。完成率維持、余り削減とちぎり増の両方を記録 |
| 失敗に共通する原因は何か | [1,000ゲームの失敗パターン](../research/ADVISOR-FAILURE-PATTERNS-20260920.md) | 未達228ゲームの整理、発火見逃しと30ゲームの1手置換実験。本体変更なし |
| 型が未認定の本線を打ち逃さないか | [発火優先と型認定の分離](../records/ADVISOR-READY-MAIN-FIRE-20260920.md) | 失敗分析の項目1への対応。型の構築を守るため先読み緩和案は不採用 |
| 発火点伸ばしをどう扱うか | [発火点伸ばしの学習](../research/GTR-HEAD-EXTENSION-RESEARCH.md) | 調査・8図の検証・限定実装への参照 |
| 横3・L字の仕込みと2列目の青3連結をどう区別するか | [発火不能な仕込みと本体の暴発リスク](../research/GTR-HEAD-SCAFFOLDS-20260925.md) | 7記事の再学習、報告15手の再現、独自模式例3形。推薦変更は未実施 |
| なぜ右上を残す土台がよいか | [雪崩の学習](../research/GTR-AVALANCHE-RESEARCH.md) | 土台と後続の伸ばし、色の受け口、教材ぷよ譜4本と未実装の検証項目 |
| 余る色を雪崩・鶴亀へ使えるか | [落下回収の配置ガイド](../records/ADVISOR-TAIL-CASCADE-20260924.md) | 本線の消去順を守る限定評価、既存の発火点伸ばしとの併用、比較と限界 |
| 平均7個以上の余りをどう減らすか | [設計](../design/ADVISOR-SPARE-PUYO-DESIGN-20260924.md)／[実装と採否](../records/ADVISOR-SPARE-PUYO-20260924.md) | 発火比較を採用し平均7.82→7.21個。構築順位への用途評価は既存成功を失うため不採用、診断のみ保存。1,500件の比較と限界 |
| 今の推薦処理はどう動くか | [配置推薦の設計](../specs/PLACEMENT-ADVISOR.md) | 実装方式・内部スコア |
| 同じ条件でどう比較するか | [ベンチマーク](../../benchmarks/README.md) | 再測定・差分・失敗再生 |

品質方針、調査の知見、実装仕様、過去の測定を混同しないでください。
日付付きの「最終結果」は、その変更時点の結果であり、現在の全機能の達成保証ではありません。

## ドキュメント構成

### プロジェクト概要

- [REQUIREMENT.md](../specs/REQUIREMENT.md) - 要件定義書（全体仕様）
- [ARCHITECTURE.md](../development/ARCHITECTURE.md) - 技術設計書
- [TECH_RECOMMENDATION.md](TECH_RECOMMENDATION.md) - 技術選定の詳細と理由
- [BACKEND_COMPARISON.md](BACKEND_COMPARISON.md) - バックエンド比較分析

### 品質方針・調査と根拠

- [GTR-QUALITY-CRITERIA.md](../specs/GTR-QUALITY-CRITERIA.md) - GTR完成優先と人間らしさの必須評価、採用条件、計測済み／未実装の区別
- [GTR-RESEARCH.md](../research/GTR-RESEARCH.md) - 初回36資料によるGTRの理解・学習設計。後続調査への入口
- [GTR-SOURCE-CATALOG.md](../research/GTR-SOURCE-CATALOG.md) - 参照資料の分類、要点、限界
- [GTR-OPENING-RESEARCH.md](../research/GTR-OPENING-RESEARCH.md) - 初手・2手目の方針、例外と配置ガイドの検証
- [GTR-Y-TAIL-PREFERENCE.md](../records/GTR-Y-TAIL-PREFERENCE.md) - Y字を組み始めの優先形にする調整と再現・比較測定
- [GTR-HUMAN-PLAY-STUDY.md](../research/GTR-HUMAN-PLAY-STUDY.md) - 人間の配置付き500記録、出典・限界・同盤面比較とちぎり抑制
- [GTR-HEAD-EXTENSION-RESEARCH.md](../research/GTR-HEAD-EXTENSION-RESEARCH.md) - GTR完成優先の発火点伸ばし、9記事・8盤面の調査と未実装の設計案

### 学習教材・実装仕様

- [GTR-PATTERNS.md](../specs/GTR-PATTERNS.md) - GTRパターン定義（技術仕様）
- [GTR-VISUAL-GUIDE.md](../specs/GTR-VISUAL-GUIDE.md) - GTR視覚的ガイド（学習用）
- [PLACEMENT-ADVISOR.md](../specs/PLACEMENT-ADVISOR.md) - 配置推薦・5連鎖骨格探索の実装仕様
- [GTR-SCORING-SYSTEM.md](../specs/GTR-SCORING-SYSTEM.md) - 結果画面の100点満点への補正と配点。人間らしさの総合品質評価とは別

### ゲーム設計

- [CHAIN-ANIMATION-DESIGN.md](../design/CHAIN-ANIMATION-DESIGN.md) - 連鎖の順次再生、動画観察、独自8bit風素材の段階導入（設計案）
- [PUYO-PIXEL-ART-DESIGN.md](../design/PUYO-PIXEL-ART-DESIGN.md) - 015-Bの4色原案・本制作サイズ・見た目承認とゲーム統合の境界
- [CHAIN-ANIMATION-CHECK.md](../reviews/CHAIN-ANIMATION-CHECK.md) - 固定5連鎖の再現URLと、ポーズ・取消・共有・タブ復帰の実操作チェック
- [GAME-MODES.md](../specs/GAME-MODES.md) - ゲームモード仕様書
- [layout-design.md](../design/layout-design.md) - レイアウト設計書
- [PUYO-GENERATION.md](../specs/PUYO-GENERATION.md) - 2手目組み合わせ制約仕様

### 開発者向け

- [ASTRA-SOL-DEVELOPMENT.md](../development/ASTRA-SOL-DEVELOPMENT.md) - Astraの設計・最終確認とSolの実装・3人独立レビューの分業設定
- [PROJECT-STRUCTURE.md](../PROJECT-STRUCTURE.md) - 現行のコード構成と依存ルール
- [scripts/README.md](../../scripts/README.md) - 測定・分析・前後比較の実行方法
- [CLAUDE.md](../../CLAUDE.md) - Claude Code 開発ガイド
- [note.md](note.md) - UI設計とSPA構成
- [progress-report.md](../progress-report.md) - 冒頭に最新の状況・残件を集約。後半は旧構成を含む初期実装記録
- [benchmarks/README.md](../../benchmarks/README.md) - 固定seed評価、差分比較、失敗再生
- [ADVISOR-GOAL70-REVIEW.md](../records/ADVISOR-GOAL70-REVIEW.md) - 70%基準達成までの改善・レビュー履歴
- [ADVISOR-QUALITY-20260918.md](../records/ADVISOR-QUALITY-20260918.md) - 完成済み5連鎖の発火優先と別seedでの再測定
- [ADVISOR-NATURAL-1000-20260919.md](../records/ADVISOR-NATURAL-1000-20260919.md) - 前後各1,000ゲームと人間101記録の固定回帰、完成骨格の余剰回収と残る課題

### 文書とタスクの管理

この一覧は学習資料・仕様・検証記録を管理します。削除済みの `tasks/` を再作成する運用は行いません。
課題管理は利用者が移行したHabiticaと区別し、文書整理だけで外部タスクを追加・更新しません。
利用者からタスク更新も依頼された場合は、Habiticaの既存項目を優先して更新し、完了範囲・残件・
受入条件を記録します。古い実発火・7連鎖の条件を現行の非発火ガイドへそのまま適用しません。
2026-09-27以降、依頼された開発タスクは開始時に登録・設計文書を更新し、完了時にタスクと仕様・検証・進捗を更新します。
Habiticaへ反映できないときは登録／更新待ちを明記し、完了報告へ混ぜません。詳細な運用は `AGENTS.md` を参照してください。

## 学習者向け推奨読書順序

### 1. まず概要を掴む

1. [REQUIREMENT.md](../specs/REQUIREMENT.md) - どんなツールなのか

### 2. GTRを学ぶ

1. [GTR-VISUAL-GUIDE.md](../specs/GTR-VISUAL-GUIDE.md) - **まずここから！** 図解で分かりやすく説明
2. [GTR-PATTERNS.md](../specs/GTR-PATTERNS.md) - より詳細な技術仕様

### 3. 実践する

1. ゲームを起動して実際に練習
2. 完成だけでなく、各ぷよの役割と消える順序を確認する
3. 不自然な手順はゲーム内のフィードバック機能から盤面・ツモと一緒に共有する

## 開発者向け推奨読書順序

### 1. プロジェクト理解

1. [REQUIREMENT.md](../specs/REQUIREMENT.md) - 要件定義
2. [GTR-QUALITY-CRITERIA.md](../specs/GTR-QUALITY-CRITERIA.md) - 完成と人間らしさをどう評価するか
3. [PROJECT-STRUCTURE.md](../PROJECT-STRUCTURE.md) - 現行構成・依存方向（全体の設計経緯は [ARCHITECTURE.md](../development/ARCHITECTURE.md)）
4. [CLAUDE.md](../../CLAUDE.md) - 開発ガイド

### 2. GTRロジック理解

1. [GTR-RESEARCH.md](../research/GTR-RESEARCH.md) - 用語、合意点、意見が分かれる点、設計原則
2. 初手・連鎖尾・人間手順・発火点伸ばしのうち、変更対象に関係する調査を読む
3. [PLACEMENT-ADVISOR.md](../specs/PLACEMENT-ADVISOR.md) - 実装済みの探索と制約
4. `src/game/core/ChainSimulator.ts` - 着地・消去・重力・連鎖の共通実装
5. [GTR-PATTERNS.md](../specs/GTR-PATTERNS.md) と `src/game/gtr/GTRPatterns.ts` - 検出・評価

### 3. ゲームモード理解

1. [GAME-MODES.md](../specs/GAME-MODES.md) - モード仕様
2. [PUYO-GENERATION.md](../specs/PUYO-GENERATION.md) - ぷよ生成制約

### 4. 実装・拡張

1. 変更対象の品質軸・再現局面・比較条件を先に決める
2. 実装・検証後、完成率と手順の自然さを別々に報告する
3. 採用案・不採用案・悪化例・未実装部分を関係する文書へ残す

## GTR対応状況

| 対象 | 対応状況 | 説明 |
|---|---|---|
| 左折り標準GTRコア | ✅ 対応 | 1-3列目の7ぷよを相対色で検出 |
| コアからの連鎖 | ✅ 対応 | 採点は評価範囲内のみ。推薦・実プレイの発火判定は全盤面の消去・重力をシミュレーション |
| 右上の土台段差チェック | ✅ 修正済み | 右端4段目の支持・段差・土台連鎖への参加を確認。中央を高く積む推薦の解消とは別 |
| 100点率・土台内5連鎖率 | ✅ 専用集計を追加 | 保存盤面を同じ採点器で比較。満点条件は範囲内19個へ変更し、範囲外の相方と全盤面の接続状態は別評価 |
| 学習用Y字接続 | ✅ 対応 | 適合する5連鎖骨格の構築時にY字を優先。完成・発火の判定は実シミュレーション |
| 人間らしい構築手順 | 改善途上 | 初手・Y字優先・自由形のちぎり抑制は実装。総合的な自然さは未達成 |
| 発火点伸ばし | 限定形を実装 | 左端の支持色＋落下キー。元の本線への接続を検証。一般的な多重は未対応 |
| 雪崩・鶴亀 | 限定的な落下回収評価 | 完成骨格からの接続と消去順を検証。未完成の任意形・色受け全般は未対応 |
| 逆折りGTR | ❌ 対象外 | 左右反転の検出・ガイドは未実装 |
| 変則・多重折り返し | ❌ 対象外 | 現行カリキュラムは標準コアを優先 |

## ドキュメント更新履歴

- **2026-09-24**:
  - 最新進捗と初期実装記録を分離し、採点範囲・右上表示の修正と検証範囲を整理
  - 土台評価と全盤面の実発火を区別。余り削減候補の2,000件の測定と残る採否判断を追記
  - 100点率・土台内5連鎖率の専用集計を追加。満点条件の見直しと中央の高積みは未完了として区別
- **2026-09-19**:
  - 品質方針・調査・実装・測定履歴を分けて索引を整理
  - 「人間らしい構築」を主要な必須評価軸として定義
  - 既存70%基準、保存済みの実測、未実装の伸ばし評価を区別
  - 削除済みタスクファイルへのリンクと再作成する運用案内を除去
- **2026-09-04**:
  - 36資料を公式、歴史・海外、国内講座、研究、検証ツールに分けて再調査
  - GTRの広義・狭義、先折り・後折りの両論、403パターン調査の適用限界を整理
  - 資料台帳と段階別カリキュラム、配置ガイドの実装原則を追加
  - 実ゲーム・GTR評価・配置推薦・回帰計測の連鎖処理を共通化
  - 通常・悪条件の2ツモモードによる固定seedベンチマーク、基準差分、失敗再生を追加
- **2026-09-03**:
  - GTR外部調査を実施し、列固定ではなく発火シミュレーションで評価する方針を文書化
  - PlacementAdvisorのフェーズ判定と連鎖評価を更新
- **2026-02-22**:
  - GAME-MODES.md 更新（PlacementAdvisor、Fキー、Gキー、ビジュアル改善を反映）
  - progress-report.md 全面更新（Phase 2完了を反映）
  - README.md 更新（ドキュメント一覧の整理）
- **2024-11-30**:
  - GTR-SCORING-SYSTEM.md 作成
  - GTR-PATTERNS.md, GTR-VISUAL-GUIDE.md 更新
- **2024-11-24**:
  - layout-design.md 作成
- **2024-08-11**:
  - GAME-MODES.md 作成
  - PUYO-GENERATION.md 作成
- **2024-08-08**:
  - GTR-PATTERNS.md 作成
  - GTR-VISUAL-GUIDE.md 作成
  - docs/README.md 作成

---

質問や改善提案がありましたら、GitHubのIssuesでお知らせください。
