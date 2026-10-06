<p align="center"><a href="PLUGIN.md">English</a> / <strong>日本語</strong></p>

# Terminal Othello — 非公式Codexプラグイン

スキルを明示的に選ぶと、**別のmacOS Terminal**でオセロを開きます。ランダムマッチングを待つ間はローカルCPUと練習し、相手が見つかると新しい盤面で対戦します。起動の応答後もゲームは独立して動き、Codexで別の作業を続けられます。Codexのタスク状態は監視しません。

**v0.4.0**では盤面、丸い石、スコアカード、手番・接続状態、結果表示を刷新しています。GitHubで配布する非公式プラグインで、OpenAI公認や公式のPlugins Directoryへの掲載ではありません。ライセンスは未選定で、ソース公開はオープンソースライセンスの付与を意味しません。

## インストール

必要なもの：ローカルの **macOS**、Terminal.app、CodexプロセスのPATH上にある **Node.js 22以上**、Git、`plugin`コマンド対応のCodex CLI。カタログの確認には **0.153.2** を使いました。`node --version` と `codex plugin --help` で確認してください。ランタイムの自動導入はしません。

次のコマンドをユーザー自身のターミナルで実行します。配布元の登録とプラグインの導入により、Codexのユーザー設定が更新されます。

```sh
codex plugin marketplace add HirokiKobayashi-R/games --ref main
codex plugin add terminal-othello@hiroki-games
```

スキルが表示されなければCodexを再起動します。**Codex CLI**では `/skills` から **Play Terminal Othello**（スキル名 `othello`）を選びます。選択UIが提示する `$` メンションも利用できます。**デスクトップアプリ**では `@` からOthelloのスキルを選択できる場合があります。独自の `/othello` コマンドは登録しません。利用可能なUIは環境で異なり、デスクトップの実インストール・選択UIは未検証です。

スキルは導入先の `scripts/othello.sh` を実行します。NodeとmacOSを確認し、macOS標準の `lockf` で小さな監督プロセスを分離起動して、`/usr/bin/open -a Terminal` に一時的な `.command` ファイルを渡します。別端末の実行処理が、同じ絶対パスのNodeで同梱クライアントを起動します。通常の承認・サンドボックス規則に従い、Terminal起動が拒否された場合は迂回せず、手動コマンドを案内します。

最大盤面は **100列×48行**、標準表示は **80列×40行** 推奨。矢印または `d3` + Enterで着手、`m` で検索の停止・再開、`q` で終了します。円・ブロック文字が2列幅の端末では `OTHELLO_STONE_WIDTH=2`、色と反転演出を無効にする場合は `NO_COLOR=1` を使えます。起動環境に設定するか、その回の起動時に渡すようスキルに依頼してください。ゲーム内メッセージは現在日本語です。

## 更新・削除

更新前にゲームを終了します。このカタログだけを更新し、最新の内容を再インストールします。

```sh
codex plugin marketplace upgrade hiroki-games
codex plugin remove terminal-othello@hiroki-games
codex plugin add terminal-othello@hiroki-games
```

Codexを再起動してスキルを読み直します。削除する場合：

```sh
codex plugin remove terminal-othello@hiroki-games
codex plugin marketplace remove hiroki-games
```

固定版を使うには登録時の `--ref main` を `--ref v0.4.0` に変えます。タグ固定の場合、更新しても新しい版には移りません。版を変更するにはカタログを削除し、希望するタグで再登録してください。

## ダウンロード版カタログ・手動起動

[Release v0.4.0](https://github.com/HirokiKobayashi-R/games/releases/tag/v0.4.0)に `terminal-othello-plugin.tar.gz` と `SHA256SUMS` があります。プラグイン用アーカイブにはカタログ、クライアント、スキル、起動処理を同梱し、サーバー開発依存や従来のプロジェクトhooksは含めません。空のディレクトリで確認・展開します。

```sh
curl -fL -o terminal-othello-plugin.tar.gz https://github.com/HirokiKobayashi-R/games/releases/download/v0.4.0/terminal-othello-plugin.tar.gz
curl -fL -o SHA256SUMS https://github.com/HirokiKobayashi-R/games/releases/download/v0.4.0/SHA256SUMS
shasum -a 256 -c SHA256SUMS --ignore-missing
tar -xzf terminal-othello-plugin.tar.gz
codex plugin marketplace add ./terminal-othello-plugin
codex plugin add terminal-othello@hiroki-games
```

`hiroki-games` という配布元は一度に一つ使います。Git版と展開版を切り替える前に既存のカタログを削除してください。展開版を登録中はそのフォルダを残します。展開版の更新は内容を置き換えて再インストールします。Gitのmarketplace upgradeはGit版に対して使います。

プラグインを導入せず、自分のターミナルで直接遊ぶ場合：

```sh
node terminal-othello-plugin/terminal-othello/client.js --url https://terminal-othello.hiroki-c3a.workers.dev
```

## 実行内容・権限・制限

- MCP、OAuth、APIトークン、npmレジストリ導入、起動処理によるグローバル設定編集、自動hooksはありません。プラグインの導入は明示的なCodex操作です。Gitソースにある従来の `.codex` Action/hookファイルはプラグインhooksとして宣言せず、このスキルからも呼びません。
- ローカル書き込みは非公開権限の `/tmp/terminal-othello-<uid>/` に限ります。起動ごとのコマンド・設定・状態ファイル、Unix制御ソケットとロックファイルです。終了した起動要求は削除し、競合防止のため空のロックファイルだけ残します。強制終了時には一時ファイルが残る場合がありますが、OSのロックは保持プロセスの終了時に解放されます。Codexセッションやプロジェクトファイルは読みません。
- プラグイン起動はOSユーザーごとに一つ。起動中・対局中の再実行は「already running」を返します。直接起動したクライアントは別扱いです。Terminalの開始確認は最大10秒待ち、制御ソケットが閉じた後の遅延要求や失敗要求ではゲームを開始できません。OSの起動失敗を、別のGUI手段で再試行しません。
- `https://terminal-othello.hiroki-c3a.workers.dev` に送るのは対局メッセージとランダムな一時復帰トークンだけです。CPUはローカルで動き、Codexの会話は送りません。`OTHELLO_URL` で接続先を変更できます。Cloudflare Freeの上限とPoCの128セッション制限があり、無制限・稼働保証ではありません。
- 自動の別端末起動は **macOSのみ** 対応。Linux/WindowsのGUI起動やブラウザ・クラウドだけの実行は非対応です。独立したPOSIXクライアントは別途利用できます。

## 検証済み・未検証

macOSで確認済み：Codex CLI 0.153.2がコマンド限定の設定指定でv0.4.0のmanifest/catalogを認識、スキーマと配布内容、Node確認、空白・アポストロフィ・シェル記号を含むパス、同時要求、起動失敗・タイムアウト、CPU着手、`q`・SIGINT・SIGTERM、PTYモード・カーソル・代替画面の復元。既存のルール、マッチング、パス・終局、復帰、表示テストはソース内に維持しています。

自動テストではGUI起動部分を置き換えています。**v0.3.0のプラグイン起動はユーザーが確認済み**で、同じ起動経路を維持しています。開発側ではデスクトップUI操作や新版の実Terminalウィンドウの目視を行っていません。検証のためにユーザーのCodex設定・信頼判断・セッションを変更していません。起動応答は端末内の実行処理が開始したことを示し、ウィンドウを目視したという意味ではありません。読み取り専用のカタログ確認はインストールテストではありません。

ソースからの検証：

```sh
cd terminal-othello
npm test
python3 test/plugin-terminal.py
python3 test/visual.py
```

PythonテストにはmacOS/Python 3が必要で、ゲームにはNodeだけが必要です。配布作成はPython標準ライブラリを使い、新しい実行時依存は追加していません。

仕様：[OpenAIのプラグイン形式・カタログ](https://developers.openai.com/plugins/build/plugins)、[スキルの呼び出し](https://learn.chatgpt.com/docs/build-skills)。CLIの導入・削除構文はローカルの `codex plugin --help` でも確認しています。
