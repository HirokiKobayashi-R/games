<p align="center"><a href="README.md">English</a> &nbsp; / &nbsp; <strong>日本語</strong></p>

[← ゲームの README](../README.ja.md)

# Codex から遊ぶ

このリポジトリには Codex の **Actions** 起動入口と、作業状態に連動してゲームを終了するローカル連携を用意しています。プラグインのインストールは不要です。通常起動と監視付き起動は別の操作です。

このパス判定は `games` と単独オセロcheckoutの両方に対応します。`games` ルートの `.codex` 設定には独立起動の Terminal Dojo Action もありますが、Dojo自体にはlifecycle hooksはありません。監視付きオセロは同じGitプロジェクトの作業を監視し、同一ターンの重複イベントでは再開しません。

## 起動入口

1. ChatGPT デスクトップアプリで **Codex** を選び、この独立プロジェクトのルート（`package.json` と `.codex` があるフォルダ）をローカル Git プロジェクトとして開く。
2. 必要なら Settings → Local environments で、このリポジトリの **Terminal games** を選ぶ。設定ファイルは [`.codex/environments/environment.toml`](../.codex/environments/environment.toml)。
3. 上部の Actions メニューで **オセロ** または **作業待ちオセロ** を選ぶ。

| Action | 動作 |
| --- | --- |
| オセロ | すぐ内蔵ターミナルで公開サーバーへ接続。Codex の進捗とは独立し、終了は `q`。hooks の信頼は不要。 |
| 作業待ちオセロ | 同じプロジェクトの作業中のローカル Codex ターンを監視。承認要求・完了・中断・セッション終了で投了して終了。hooks のレビュー・信頼が必要。 |

起動のたびに Node コマンドを入力する必要はありません。Node.js 22 以上が app のターミナルの PATH に必要です。依存パッケージの追加はありません。Actions 定義はmacOS 向けに `platform = "darwin"` を指定しています。

Actions は公式のプロジェクト単位の機能です。このファイルを置いただけで他のプロジェクトや Work Cloud 全体にボタンを追加するものではありません。ユーザーが操作中の既存ターミナルや Codex 会話へ入力を注入することもありません。

## 監視付き起動の有効化はレビュー後

[`.codex/hooks.json`](../.codex/hooks.json) に以下の **6 個のプロジェクト内 hooks 定義**を用意しました。グローバルの `~/.codex/hooks.json` と `~/.codex/config.toml` は変更していません。信頼設定も変更していません。

定義はすべて次のローカルコマンドを実行し、timeout は 3 秒、同期実行です。

```sh
root="$(git rev-parse --show-toplevel)"; if [ -d "$root/terminal-othello/codex" ]; then root="$root/terminal-othello"; fi; node "$root/codex/hook.js"
```

| Hook | ゲームに伝える状態 |
| --- | --- |
| UserPromptSubmit | 作業開始。この時点ではゲーム画面を勝手に開かない。 |
| PermissionRequest | 承認要求。ゲームを終了し、Codex の通常の承認操作へ戻る。承認・拒否の判断はしない。 |
| PostToolUse | 作業が続いている間の最終確認時刻を更新。承認後の再開とは解釈しない。 |
| Stop | 作業完了。ゲームを終了。 |
| Interrupt | 作業中断。ゲームを終了。 |
| SessionEnd | セッション終了。ゲームを終了。タブを切り替えただけでは発火しない。 |

公式仕様では、非管理 hooks はユーザーが **正確な定義をレビューして信頼するまで実行されません**。設定を有効化するには、ユーザーがこの差分を確認したうえで、このリポジトリの hooks だけを信頼してください。CLI の `/hooks` でソースと定義をレビューできます。既存の他の hooks をまとめて信頼・無効化しないでください。trust の迂回オプションは使いません。

有効化後、同じプロジェクトでローカル Codex の作業を開始し、**作業待ちオセロ**を押します。作業中のターンが一つならそれを監視します。複数なら最終更新時刻と匿名 ID の番号を選びます。監視できるターンがなければ起動を断り、通常起動へ勝手に切り替えません。

承認要求に戻ったあと、PostToolUse だけでゲームを勝手に再開しません。次のユーザー入力によるターン開始後、再び Action を押してください。完了・中断後も自動で再起動しません。

## 安全に戻る仕組み

監視付きランチャーは自分が起動したゲームプロセスだけを管理します。状態が変わると SIGTERM を送り、クライアントが `cancel` を送信して応答を待ち、カーソル・tty・元画面を復元します。対人戦中なら相手には投了による勝ちが表示され、CPU 戦や待機中なら検索を解除します。通信自体が断たれて取消が届かない場合は、サーバーの既存の2分の切断猶予が適用されます。

監視対象の別ターン・別セッションのイベントは終了判定に混ぜません。選択後に次のターンへ移った場合は終了します。状態ファイルが消えた・壊れた、または5分間更新がなければ状態不明として終了します。長時間の思考やツール実行でも5分間イベントがないと終了する、保守的な仕様です。

戻る先は元の Codex 画面と内蔵ターミナルです。承認を自動でクリックしたり、アプリのフォーカスを強制移動したり、実行中の Codex へ文字を送り込んだりはしません。

## プライバシーと変更範囲

- hook の stdin はローカルで処理し、プロンプト・ソース・tool_input・tool_response・transcript を保存しない。transcript ファイルは開かない。
- OS の一時ディレクトリにユーザー専用 `0700` フォルダを作り、`0600` の小さな JSON を保存する。内容は状態、更新時刻、SHA-256 にしたセッション/ターン ID、形式バージョンのみ。プロジェクトのフォルダ名も保存せずハッシュにする。
- hook にはネットワーク処理がなく、ゲーム API へ送るのは従来の参加・着手・取消だけ。Codex の状態や識別子も送らない。
- hook は常に `{}` を返し、Codex の承認、安全設定、モデル、継続判断を変更しない。
- グローバル hooks の登録、プラグインのインストール、新しい権限や認証は自動で追加しない。

別リポジトリへ広げる場合は、そのプロジェクトに対応する Action と hooks を追加する変更を別途レビューしてください。グローバル hooks に登録する場合は既存定義とのマージとユーザーの個別承認が必要です。今回そこまでは実行していません。

## 対応範囲と検証結果

**確認済み:** 丸石の1/2文字幅テスト、並行イベント・完了後の遅延 heartbeat・別ターンの無視・状態の最小化とファイル権限、合成した lifecycle 入力から本物の hook/launcher/client を経由する二者 PTY 対戦・自動投了・相手の勝ち・端末復元。

**未確認:** このアプリの Actions ボタンの実表示・クリック、ユーザーが hooks を信頼した後の実際の Codex callback。合成イベントのテストを、登録済み hooks の実動確認として扱わないでください。

**非対応:** Work Cloud/クラウド orchestrator の親タスク状態をローカル hooks から検出すること。ローカル実行環境へ委譲されていても、親がクラウドなら同じ制約があります。個人環境でそのために使えるローカル command hooks は公式にサポートされていません。プラグインを入れるだけでもこの制限は解消しません。

検証:

```sh
npm test
python3 test/codex-terminal.py https://terminal-othello.hiroki-c3a.workers.dev
```

上のテストはテスト用 lifecycle 入力を生成するだけで、hooks の登録・信頼設定・Codex タスクの操作は行いません。PTY テストでは公開サーバーに実際の対局を作るため、他の利用者が遊んでいない時間に実施してください。

公式資料: [Actions / local environments](https://developers.openai.com/codex/app/local-environments)、[Hooks](https://learn.chatgpt.com/docs/hooks)、[Plugin hooks](https://developers.openai.com/plugins/build/plugins#bundled-mcp-servers-and-lifecycle-hooks)。
