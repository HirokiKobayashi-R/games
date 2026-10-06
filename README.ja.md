<p align="center"><a href="README.md">English</a> / <strong>日本語</strong></p>

<h1 align="center">Terminal Games</h1>
<p align="center">小さなゲームを、本物のターミナルで。</p>

| ゲーム | 遊び方 | 必要な環境 |
| --- | --- | --- |
| [● Terminal Othello ○](terminal-othello/README.ja.md) | ランダム対人戦。待機中はローカルCPUと練習 | Node.js 22以上、macOS / Linux端末、最低40列×22行 |
| [Terminal Dojo](terminal-dojo/README.ja.md) | CPU格闘戦。誘って、避けて、隙に一撃 | Python 3.9以上、curses対応POSIX端末、最低64列×22行 |

どちらも標準ライブラリで動き、プレイヤー登録や実行用パッケージの導入は不要です。ソース・テスト・起動方法はゲームごとに独立しています。オセロのメッセージとCodex Action名は現在日本語、Dojoの画面表示は英語です。説明は日英対応です。

## 入手して遊ぶ

```sh
git clone https://github.com/HirokiKobayashi-R/games.git
cd games
node terminal-othello/client.js --url https://terminal-othello.hiroki-c3a.workers.dev
```

Dojoは `games` のルートから実行します。

```sh
python3 terminal-dojo/dojo.py
```

オセロはすぐに相手を検索し、見つかるまでCPUと遊べます。矢印／座標 + Enterで着手、`q`で終了。DojoはEnterで開始し、A/Dで移動、Wでジャンプ、Jで攻撃、Kでガード、Pで停止、Qで終了します。全操作は各ゲームのガイドを参照してください。

ダウンロード派には [v0.2.0リリース](https://github.com/HirokiKobayashi-R/games/releases/tag/v0.2.0) があります。`terminal-othello-source.tar.gz`、`terminal-dojo-source.tar.gz`、オセロのローカルnpm用tarball、`SHA256SUMS`を配布します。必要なゲームだけ展開し、そのフォルダで `node client.js --url https://terminal-othello.hiroki-c3a.workers.dev` または `python3 dojo.py` を実行します。GitHub認証は不要。npmレジストリには公開していません。

## オセロのプレビュー

![オセロのターミナル盤面](docs/othello-preview.png)

オンラインQAの実PTY出力を参考フォントで再描画した画像で、GUI撮影ではありません。落ち着いた暗い盤面、輪郭を計算した丸い石、左右のスコアカード、ミント色の手番表示、専用の結果表示に刷新しました。最大表示は **100列×48行**、標準は **80列×40行**。256色／truecolorに対応し、`NO_COLOR=1`でプレーン文字表示へ戻せます。[変更前後](docs/othello-redesign-comparison.png) · [標準サイズ](docs/othello-80x40.png) · [結果画面](docs/othello-result.png) · [オンラインQA](docs/othello-qa-v0.4.0.md)。

## 非公式Codexプラグイン

オセロ **v0.4.0** をこのGitHubカタログから非公式プラグインとして配布します。スキルから別の **macOS Terminal** で起動し、遊びながらCodexで作業を続けられます。Node.js 22以上が必要で、MCPや自動hooksはありません。

```sh
codex plugin marketplace add HirokiKobayashi-R/games --ref main
codex plugin add terminal-othello@hiroki-games
```

Codex CLIの `/skills` から **Play Terminal Othello** を選びます。[導入・更新・実行内容](terminal-othello/PLUGIN.ja.md) · [v0.4.0ダウンロード](https://github.com/HirokiKobayashi-R/games/releases/tag/v0.4.0)。OpenAIの公式プラグインディレクトリへの掲載ではありません。v0.3.0のプラグイン起動はユーザー確認済みです。同じ起動処理と新版クライアントをCLI/PTYで確認し、新版の実GUIでの目視は未検証です。

## 従来のCodexプロジェクトActions

このrepoをローカルCodexプロジェクトとして開き、同梱の **Terminal games** 環境を使います。macOS向けActionsでオセロ・作業待ちオセロ・Dojoを起動できます。作業待ちオセロは6個のプロジェクトhooksのレビュー・信頼が必要で、完了・承認要求・中断・終了に合わせて投了します。[日本語の設定ガイド](terminal-othello/codex/README.ja.md) · [English](terminal-othello/codex/README.md)。

実際のCodex Actions画面と実callbackは未検証で、合成イベントのPTYテストで投了・復元を確認しています。Work Cloudの親タスク監視は非対応。グローバル設定や信頼設定は自動変更しません。Dojoにはlifecycle連携がありません。

## 公開APIと対応範囲

既存公開APIを使うのはオセロだけです。Cloudflare Workers Free + SQLite Durable Objects / workers.devで動作します。**無料枠は有限**で、このPoCは**最大128セッション**。アカウントの枠は共有され、無料枠超過でリクエストが停止する場合があります。[オセロの制限](terminal-othello/README.ja.md#公開-api-と制限)と[Cloudflare公式料金](https://developers.cloudflare.com/durable-objects/platform/pricing/)を確認してください。大規模運用の可用性保証はありません。DojoはオフラインでAPI枠を消費しません。この統合によるサーバー再デプロイは不要です。

テスト方法は各ゲームに記載しています。macOSのPTYで操作・リサイズ・勝敗・端末復元を検証し、他OS／フォントや実キーボードの感触はユーザー確認が必要です。各ゲームのディレクトリは単独でも使えます。ルートの `.codex` は統合repo用で、オセロには単独用定義も同梱します。重複したhookイベントで停止済みターンを再開しません。

## ライセンスと移行

プロジェクトのライセンスは未選択・未追加です。公開ソースであること自体はオープンソースの権利許諾ではありません。オセロはnpmレジストリ公開を防ぐ `private: true` を維持し、ローカルtarball導入は可能です。

Terminal OthelloとTerminal Dojoの新しい配布先です。以前の単独オセロrepoのリリースは旧版として独立しています。現在の版はこのrepoとリリースを使ってください。
