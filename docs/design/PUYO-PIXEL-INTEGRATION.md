# 015-C ピクセル素材のゲーム統合

2026-09-26。Astra設計担当 `pixel_c_astra_design` が既存APIと015-Bの素材を確認。利用者の「続けて」を受けて実装する。
本書は[基本再生設計](CHAIN-ANIMATION-DESIGN.md)と[015-B素材契約](PUYO-PIXEL-PRODUCTION.md)を引き継ぐ。原画・生成済みPNG・manifestは変更しない。

## 範囲と責務

ガイドとスコアアタックへ4色素材を組み込み、確定盤面の接続、個別落下・着地・消滅と粒を表示する。
coreの物理・Trace形式、採点・推薦・履歴・供給・乱数・再現形式は変えない。ガイドは完成後も発火を勧めない。
音、紫、おじゃま、UI全面改修、スコアアタックへの新たなP・巻き戻し機能は対象外。

- `PuyoRenderer`：PNGロード予約、manifestからのフレーム登録、最近傍フィルタ、用途別の素材選択。
- 小さな純粋モジュール：4近傍maskと方向ごとの隣接個体ID。色だけの差分にしない。
- `PuyoBoardRenderer`：再生中のID→sprite、フレーム、肩overlay、粒とラベルを所有する。
- `ChainPlayback`：既存の段階順序・停止理由・delta上限・完了境界を維持。コマは既存progressから選ぶ。
- 両scene：通常のfieldSprites所有を維持し、素材選択・表示寸法と固定前盤面の受渡しのみ拡張する。

通常盤面の旧消去／着地Tweenは即時更新・破棄へ置換し、盤面復元で二重演出を出さない。
スコアpopupなど対象外の装飾を全面的に整理しない。

## ロードと用途別表示

preloadでViteのPNG URLをロード予約し、createの冒頭でTextureへ184名すべてを登録してからspriteを作る。
alias名も省略しない。共通キーとTextureManager内の存在／frame有無で冪等に管理する。
別Gameでも再登録できるようモジュールのloadedフラグだけに頼らない。失敗した素材のまま表示を開始しない。
Texture単位でNEARESTを指定し、UI文字を一括でピクセル化しない。共有atlasをscene終了時に削除しない。

| 用途 | 原画と表示 | 接続 |
|---|---|---|
| 確定盤面 | connect／24→48px | 実盤面の上下左右の同色。隣接だけの変化も毎回反映 |
| 操作中ペア | idle／24→48px | 実盤面へ加えない |
| NEXT | idle／24→48px | 単体。NEXT2と共通の段差付き枠の左上 |
| NEXT2 | idle／24→48px | 単体。共通枠の右下。NEXTと同じ寸法・明るさ |
| 教材2経路 | mini8／8→16px | 18pxセルを維持。支持の「?」は変更しない |
| 推薦ghost | idle／24→48px | 表示物のalphaを使い、元画像に二重焼込みしない |

NEXT/NEXT2の上記寸法と枠は、2026-10-10の利用者指定を反映した現行仕様。初期統合時のmini12/36px・24px表示から変更し、幅120px・高さ288pxの単一枠へまとめた。供給・乱数・ツモ状態は維持する。[現行表示設計](NEXT-PREVIEW-20261010.md)。

中央原点0.5、移動の最終画面座標は整数にする。ghostの既存パルスと清掃は維持してよい。

## 個体と接続の状態

Trace.initialは配置後の盤面なので、両sceneから描画器へ固定前gridを追加で渡す。
initialの同じセルIDのうち、固定前に占有されていた個体だけから旧接続を作る。初手の新接続も区別できる。
IDごとの色・位置・sprite、段階直前snapshot、各方向の隣接ID、移動／clear対象、初期の新規関係を保持する。

現在の同色接続の隣接IDが以前と違う方向だけnewAdjacencyMaskを立てる。
同じmaskで同色個体が交代した場合も新規。同じ2個が一緒に移動して関係を保てば既存の関係とする。
gravity中はまだ移動中の個体を接続から除外し、静止側も空中の個体につながらない。
到着済みの個体は終点に固定し、未着地の個体を混ぜた最終maskを先取りしない。
clear・取消・盤面復元・新段階では古いenterを失効させる。

## 時間と演出

物理待ち時間・独立Tween・独立timerを追加しない。落下は各個体の `clamp(90+30d,90,300)` ms。
短距離は先に終点へ到着し、その後は動かさない。着地コマは全員到着後の既存landで1回だけ再生する。

| 区間（開始含む・終了含まず） | 表示 |
|---|---|
| gravity | 個別経過の前半fall/0、後半fall/1。到着後は終点で固定 |
| land 0–40ms | 移動個体だけland/0 |
| land 40–64ms | 移動個体だけland/1 |
| land 64–80ms | 通常体＋新規関係の肩enter。新規隣接を得た静止個体も対象 |
| land終了 | stable connect |
| landなしの初期emphasis 0–40ms | clear対象はclear/0優先、対象外の初期新規関係だけ肩enter |
| emphasis残り（全120ms） | clear対象はclear/0、他はstable |
| fade 0–60ms | clear/1 |
| fade 60–120ms | clear/2 |
| fade 120–180ms | 対象本体を隠してparticle/0..2。完了時に対象IDと粒を破棄 |

0連鎖で段階なしなら即stable。16msのenterは毎描画frameでの観測を保証しない。
粒は例えば対象ごとに3個、6px原画を2倍。固定offset・ID等とphase時刻から位置／alphaを求める。
Math.random・ツモ乱数・独立時計のemitterを使わない。同段の別色／別群も同期させる。

## 肩の部分合成

基底はconnect/currentMask。manifestのshoulderRectsに従い、同じcurrentMaskのenter画像から肩を参照する追加frameを登録する。
新規bitに対応する肩だけ、小さなoverlayとして重ねる。矩形数値を別定義に複製しない。
画像・manifestを書き換えず、CanvasTextureの合成cacheも増やさない。
overlayは本体の原点・倍率・座標・alphaに揃え、最大4個を必要に応じ生成して再利用する。
毎updateで新規生成せず、clear／移動／取消で不要overlayを非表示／破棄する。

## 検証と受入

- 全16mask、異色・斜め・端、通常盤面の隣接だけの変化。
- 固定前盤面からの初期新規関係、静止隣接、同色ID交代、同じID関係のままの移動、current3/new1。
- 異距離落下・空中接続の除外・到着後固定・整数座標、各phaseの時刻境界、clear優先。
- 同段の複数色／別群、粒の同期。全phaseのpauseで画像／overlay／粒が不変。
- cancel/disposeの反復と破棄後更新、連続再生で所有物が増えない。
- 同一／別TextureManagerで登録、alias184名、nearest、用途別寸法、読込失敗。
- 既存Trace／Playback／sceneの物理・得点・供給・履歴・乱数・取消検査を維持。型検査・全体テスト・build。
- ブラウザで両モードの起動・再起動、接続・ちぎり・着地・多段連鎖・粒→次ツモと各サイズを確認。
- ガイドのP・↑・reset・Esc・共有拒否、実タブ非表示復帰、SPACE仮評価と実盤面の分離。

前段Aの↑取消・実タブ復帰・スコア側実連鎖は未個別確認。今回実際に観察できた項目だけ更新し、自動テストで目視済みとしない。
開始点の保管：`C:/Users/sunpe/AppData/Local/Temp/gtr-pixel-c-baseline-75fa2ecf3c0c4eb88be8e94c9f2d48e4`。
dirty HEADの全差分を今回の変更に含めない。課題管理は既存Habitica015-Cで行う。
