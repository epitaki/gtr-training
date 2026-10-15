# ローカルSupabase移行の検証記録

状態: 実装・実環境・自動検証・新規Sol3名独立レビュー・Astra受入・docs/Habitica最終反映完了。
設計: [ローカルSupabase移行](../development/LOCAL-SUPABASE-DEVELOPMENT-20260930.md)。Habitica `65f80be6-edc5-4f4e-a6ed-e43393bb3989`。

## 開始baseline

`reviews/local-supabase-baseline-20260930.json`、ID `cfb1c78be47aa121eba9d6d3beeafd9d162c604341bcfd6cbfab1b0d9ed733cb`。
286ファイルを`C:/Users/sunpe/AppData/Local/Temp/gtr-local-supabase-before-26dykyrw`へコピー。既存dirtyのGit状態を記録。受入済みAuth R5のapp/tests/config対象281ファイルとの差0を確認した。

既存baselineとして型3種・105ファイル1332テスト（maxWorkers=2）・build成功を再利用。既存chunk警告あり。これを移行後の成功結果とは扱わない。

## 担当

- Astra設計: `/root/local_supabase_design`（gpt-6-astra）。具体契約を読取確認。
- Sol実装: `/root/local_supabase_implementation`（gpt-6-sol）。app/server/scripts/supabase/sql/tests/package/configを一人で所有。
- 親: docs、Habitica、Dockerの実行環境準備、実画面確認、snapshotとレビュー調整。
- 固定対象の新規Sol3人とAstra受入はR1で完了。担当と判定は[最終レビュー](local-supabase-r1-review.md)を参照。

## 環境準備

- WSL 2.7.14.0、Ubuntuがversion2で稼働していることを確認。リポジトリ/Git/Bun/ViteはWindowsに維持する。
- WindowsとUbuntuでdockerがPATHになく、Docker Desktopのmachine/user標準パスにも実行ファイルなし。
- Docker公式インストーラーを一時フォルダーへ取得。Authenticode Valid、発行者Docker Incを確認し、WSL2のユーザー別インストールがexit 0で完了。Docker Desktop 4.93.0起動、Engine 29.8.1/linux/WSL2の応答成功を確認。
- docker.exeは`C:/Users/sunpe/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe`。既存プロセスのPATHは更新されないため、今回の実行はそのディレクトリをプロセスPATHに前置きする。
- Supabase CLI安定版2.118.0をnpm公式レジストリで確認。プロジェクト依存を固定して実装する。
- 初回Supabase起動とローカルmigration適用は成功。ただし下記ポート公開先の問題を検出して停止。管理者初期化・認証・再起動保持は未検証。

## 別タスク

利用者の指定に従い、デプロイ設定はHabitica `8ced9e6b-9aa8-46f3-b3d6-3e949b0278da`へ登録し、再取得で保存一致・本体未完了を確認。[後続計画](../design/DEPLOYMENT-PLAN-20260930.md)。本番DB適用とアプリ公開は今回行わない。

## 実起動で見つかった問題（以下は検出時の記録。解消結果は次節）

固定CLI 2.118.0による初回startとmigration up --localは成功。Dockerネットワークのhost_binding_ipv4は127.0.0.1だったが、実コンテナのAPI54321/DB54322/analytics54327が0.0.0.0とIPv6全体へ公開されていた。直ちにsupabase:stopで停止しデータを保持した。管理者初期化前の検出。ネットワーク指定だけで成功とせず、CLI/Dockerの実公開先を調査する。最終受入にはloopbackのみの実起動と再確認が必要。

Bunのroot .env.local自動読込は、公式bunfig.tomlのenv=falseで停止し、Viteの環境別loadEnvへ統一する。明示process値の不一致を上書きせず拒否する。[Bun公式設定](https://bun.com/docs/runtime/bunfig)。

## 実スタックと画面確認（2026-09-30）

ポート問題を解消。Docker Desktop 4.93.0のユーザー設定PortBindingBehaviorをdefault-local-port-binding（Localhost by default）へ変更し再起動。元設定は一時フォルダーへバックアップした。同一network/同一-p指定の無サービス一時コンテナで、変更前0.0.0.0/::、変更後127.0.0.1/::1を実inspect確認。一時コンテナは削除済み。公式[Docker Desktopネットワーク](https://docs.docker.com/desktop/features/networking/)にある設定。起動スクリプトでも実NetworkSettings.Portsの全公開先を検査する。

- start→migrate→admin-init成功。固定UUIDをAuth Admin APIで作成でき、profiles.role=adminへ昇格。公開signup無効の状態でmagic link→verifyOtp→通常authenticated JWTのログイン成功。
- 初期化再実行でも同一ユーザー1件。編集した表示名は上書きされない。
- 不要なanalytics/vectorを無効化後、7コンテナ正常。公開API54321とDB54322は127.0.0.1/::1のみ。restartを繰り返すvectorは起動しない。
- Codex内ブラウザの専用tab14でログイン、表示名保存、logout/relogin、再初期化後の保持、DB stop/start後の保持を確認。Viteを停止して標準bun run devで再起動しても通常セッションが復帰。
- DB停止中もゲストとしてガイド練習を開始し、Upキーで実配置、次ぷよと共有ボタン有効化を確認。
- 同一アプリoriginでdev:cloudへ切り替えるとゲスト/Google/GitHubだけになり、local-auth bootstrapはJSON APIでない。devへ戻すとローカル管理者セッションが復帰。クラウドDBやprovider設定を更新していない。
- 一時Python検証で実API 21項目成功。固定本人・重複なし・signup無効・通常JWT・bootstrap/login no-store・nonce再利用403・不正Host/Origin/Forwarded403・保存内容保持・匿名profile拒否・role変更拒否・他人profile閲覧/変更不可・管理者も他人を閲覧不可・.local設定403。テスト用Authユーザーは削除し、管理者表示名は「システム管理者」へ復元済み。キー/OTP/tokenは出力しない。
- 専用タブは閉じ、元のユーザータブは操作していない。自動テスト/最終レビューはこの後に実施する。

実検証補助はC:/Users/sunpe/AppData/Local/Temp/gtr-local-supabase-live-qa.py（認証値を含まない。最終版は表示名「システム管理者」を前提とする）。結果は上記のとおりで、テストスクリプト本体のGit登録はしない。

## 自動検証・最終設定確認

Sol初回検証は型検査3種、対象9ファイル29テスト、全104ファイル1315テスト、build成功（既存chunkサイズ警告のみ）。初期の型/テストモック不整合は修正、esbuildの親ディレクトリ読取制限は限定した権限拡張で実行できた。旧SQLite/cookie用テストを新Supabase経路へ置換しているため、開始105ファイル1332件から件数が変わる。ゲーム141ファイルのhashは開始時点と一致。

レビュー前の読取で、不正な非空URLがOAuth保存キー生成時にthrowする点と、mode別env上書き後の値を生成.envの正本と比較できていない点を検出しSolへ修正依頼。上記の初回成功を最終snapshotの検証とはまだ扱わない。

CLIが生成するsupabase/.temp/start-secrets/.../env/docker.envもGit除外を確認。Vite配信の拒否は実ファイル内容を返さないことを条件とし、通常URLのSPA fallback HTML 200は秘密ファイル配信とみなさない。絶対パス経由の403も確認する。

## R1固定前の最終検証

上記2点はSolが修正。不正URLでのOAuthモジュールimport、生成.envとmode別設定の3値比較・鍵取り違えの回帰テストを追加した。

- 型検査3種（type-check / type-check:server / type-check:scripts）成功。
- 全105ファイル・1318テスト成功（maxWorkers=2）。build成功、既存chunkサイズ警告のみ。
- 実API検証を再実行し23項目成功。前記21項目にCLI生成秘密ファイルの通常URL非配信と絶対パス403を追加。テストAuthユーザーを削除済み。
- Codex内ブラウザの専用tab15で、最終コードのゲスト画面→ローカル管理者ログイン→表示名「システム管理者」→再読込後のセッション保持を確認。検証用タブは閉じた。
- dist全6ファイルに実service_roleキーの含有0件。.local/supabase/.envとCLI生成docker.envのGit除外を再確認。
- レビュー固定前にViteとSupabaseを停止（DBデータ保持）。レビュー中はソース・生成物・キャッシュを変更しない。

最終自動検証ログ: .local/local-supabase-validation-r1.txt（非公開の作業ログ）。固定snapshotと独立レビュー・Astra受入結果は後続節へ記録する。

## R1最終受入

Snapshot `400956da89b85213310ffe0cb99054404e84fdf896cd68ee2f9d9b244e0d6d94`。291 source files、424 generated files、変更37件・削除5件。全3名の新規Sol独立レビューは指摘なし。Astraが実コード・設計・検証・3件の妥当性を確認し受入可、確認済み必須修正0件。候補なしのため却下候補もなし。レビュー後とAstra受入後に親が全hash不変を確認した。

[レビュー全文・担当・制約](local-supabase-r1-review.md)。最終の型3種・105ファイル1318テスト・build成功。ゲーム141ファイル変更0、共通migrationは開始時SQLと同一。既存chunk警告のみ。クラウドDB/OAuth/デプロイは未実施の別タスクで、今回の完了に含めない。

受入後は文書の進捗表記とHabiticaだけを完了更新する。旧SQLite・rootクラウド設定を保全。アプリ/テスト/設定の追加変更、commit/push/公開は行わない。

## 最終反映

- Habiticaローカル移行タスク65f80be6-edc5-4f4e-a6ed-e43393bb3989へ実装・全検証・R1受入・文書参照を保存。まず7/8項目と本文一致をGET確認、最後の記録項目を含む8/8一致をGET確認して本体を完了。その後も本体completed=true・8/8を再取得確認。
- 共通migrationのチェック表記を「共通migration・ローカル管理者初期化・DB定義のコード管理」に更新。通常seedで管理者を作る構成と混同させない。
- 関連認証タスク8503d097-3ae1-4d72-9bf9-aad9eaff9233へローカル移行完了と外部DB/OAuth残件を追記し、本文一致・本体未完了を再取得確認。
- デプロイタスク8ced9e6b-9aa8-46f3-b3d6-3e949b0278daは未完了を再確認。
- 受入後の差分は完了状況を示す文書のみ。R1で確認済みのアプリ/テスト/設定は維持する。
- 完了時の[照合記録](local-supabase-completion-audit.json)でアプリ/テスト/設定の変更0を確認。Supabaseと標準bun run devを再起動し、127.0.0.1:5175で開発画面を利用できる状態に戻した。

## 作業終了時の引継ぎ（2026-09-30）

その後、利用者の「ドキュメントタスクを更新して、一度作業を終わります」に従い、進捗・次回手順と関連Habiticaを整理。今回起動したViteを終了し、supabase:stop成功・データ保持を確認した。Docker Desktop自体は終了していない。次回はsupabase:start→devで再開する。コード変更と追加テストは行わない。

終了時のタスク状態はローカル移行8/8・本体完了、認証5/7・本体未完了、デプロイ0/5・本体未完了。残件と再開方法は[進捗冒頭](../records/ACCEPTED-WORKTREE-20261003.md)を参照。

3タスクへ終了記録を保存後、GETで本文一致・上記本体状態・チェック完了数を再取得確認済み。アプリ5175/API54321/DB54322の待受なしを確認した。
