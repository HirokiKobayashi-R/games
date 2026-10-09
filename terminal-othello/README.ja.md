<p align="center"><a href="README.md">English</a> &nbsp; / &nbsp; <strong>日本語</strong></p>

<h1 align="center">● Terminal Othello ○</h1>
<p align="center">相手を探す。待ちながら練習する。すべて、ターミナルで。</p>
<p align="center"><code>Node.js 22+</code> &nbsp; <code>実行時依存なし</code> &nbsp; <a href="https://github.com/HirokiKobayashi-R/games/releases/tag/v0.4.0">v0.4.0 をダウンロード</a></p>

---

ターミナルだけで遊ぶオンラインオセロの小さな PoC。合言葉・部屋作成・ユーザー登録はありません。

- **相手はランダム。** 起動すると検索開始。黒白もランダムです。
- **待っている間は練習。** ローカル CPU と遊べます。相手が見つかると通知音とメッセージが出て、新しい盤面で対人戦が始まります。
- **サーバーが対局を検証。** 合法手・手番・パス・勝敗を確認し、キャンセル競合と切断復帰も扱います。

説明は日英に対応しています。ゲーム内のメッセージと Codex の Action 名は現在、日本語です。

## ダウンロードして遊ぶ

**v0.4.0** に中央配置の盤面と非公式Codexプラグインを含みます。現在のソースを試す場合:

```sh
git clone https://github.com/HirokiKobayashi-R/games.git
cd games/terminal-othello
node client.js --url https://terminal-othello.hiroki-c3a.workers.dev
```

macOS / Linux のターミナルと **Node.js 22 以上**を用意し、空のフォルダで実行してください。GitHub のログイン、npm アカウント、クライアントの依存導入は不要です。

```sh
curl -fL -o terminal-othello-source.tar.gz https://github.com/HirokiKobayashi-R/games/releases/download/v0.4.0/terminal-othello-source.tar.gz
curl -fL -o SHA256SUMS https://github.com/HirokiKobayashi-R/games/releases/download/v0.4.0/SHA256SUMS
shasum -a 256 -c SHA256SUMS --ignore-missing
tar -xzf terminal-othello-source.tar.gz
cd terminal-othello
node client.js --url https://terminal-othello.hiroki-c3a.workers.dev
```

矢印キーと Enter、または `d3` のような座標と Enter で着手します。終了は `q` / Ctrl-C。相手も同じ方法で接続すると、マッチングの対象になります。

[リリース](https://github.com/HirokiKobayashi-R/games/releases/tag/v0.4.0)にはローカル npm 導入用の tarball とチェックサムもあります。**npm レジストリには未公開です。** 以前の単独repoの v0.1.0 は旧版です。

## 盤面の見た目

v0.4は落ち着いた暗い盤面、輪郭を計算して描く丸い石、左右のスコアカード、ミント色の手番表示、専用の結果表示に統一しました。マッチング、切断復帰、合法手、選択マスを別の視覚表現に分け、着手が受理されたら古い通知・エラーを消します。画面も操作もターミナル内です。

**100列×48行**で最大盤面、**80列×40行**が標準表示です。30行では小さな盤面、行数・色数が少ない端末では中央配置の●○表示へ切り替わります。最低40列×22行。それ未満では着手を止めますが、`q` と `m` は使えます。リサイズ中もオンライン対局は進みます。

ANSIの256色／truecolorとUnicodeの四分割ブロック文字を使い、反転は240msです。画像プロトコル、ブラウザ、追加フォント、実行時パッケージは不要です。`NO_COLOR=1` はプレーン文字表示に切り替え、演出を止めます。円やブロック文字が2列幅になる端末では `OTHELLO_STONE_WIDTH=2` を指定してください。字形や文字セルの縦横比による差は残ります。新版を実GUIで目視した検証は行っていません。

```sh
OTHELLO_STONE_WIDTH=2 node client.js --url https://terminal-othello.hiroki-c3a.workers.dev
```

[変更前後](https://github.com/HirokiKobayashi-R/games/blob/main/docs/othello-redesign-comparison.png) · [100列×48行](https://github.com/HirokiKobayashi-R/games/blob/main/docs/othello-preview.png) · [80列×40行](https://github.com/HirokiKobayashi-R/games/blob/main/docs/othello-80x40.png) · [結果画面](https://github.com/HirokiKobayashi-R/games/blob/main/docs/othello-result.png)。オンラインQAの実PTY出力を参考フォントで再描画した画像で、GUIのスクリーンショットではありません。

## 操作

| 操作 | キー |
| --- | --- |
| 選択・着手 | 矢印 + Enter、または `d3` + Enter |
| 検索のキャンセル・再開 | `m` |
| 対人戦の投了 | 対戦中に `m` |
| CPU の盤面を初期化 | `n` |
| 終局後に次の相手を探す | `r` |
| 終了・待機取消・対戦中は投了 | `q` / Ctrl-C |
| 座標入力の消去 | Escape / Backspace |

**●** 黒 · **○** 白。小さなミント色の印が合法手（文字表示では `+`）、ミント色の四隅が選択位置、金色の隅が最終手です。推奨端末サイズは **80 列 × 40 行以上**です。合法手がなければ自動パスし、両者が置けなくなったら枚数で勝敗・引き分けを判定します。

## 公開 API と制限

この PoC は **Cloudflare Workers Free + SQLite Durable Objects** 向けの構成です。2026-10-08のアカウント情報・稼働確認の読み取りは HTTP 403 となり、現在の契約・請求・使用量・公開バージョンは再確認できていません。

- API: https://terminal-othello.hiroki-c3a.workers.dev
- [稼働確認](https://terminal-othello.hiroki-c3a.workers.dev/health): `/health`
- `/` は `Not Found` を返します。ブラウザ用ゲーム画面はありません。クライアントが `/connect` の WebSocket 接続先を自動で選びます。

`--url` または `OTHELLO_URL` にはベース URL を指定します。未指定時は `http://127.0.0.1:8787` に接続します。公開接続は HTTPS / WSS 必須です。

**無料枠は無制限ではありません。** アプリは **最大128セッション**の PoC で、世界規模の本番運用や継続提供を保証する構成ではありません。Cloudflare の枠は同じアカウントの他のアプリと共有します。Durable Objects Free の公表枠は日次 requests 100,000、duration 13,000 GB-s、rows read 5,000,000、rows written 100,000、合計保存容量 5 GB。該当する上限を超えると操作が失敗し、Worker 自体にも別の上限があります。公開前に最新の[公式料金](https://developers.cloudflare.com/durable-objects/platform/pricing/)を確認してください。匿名接続なので濫用に備えた使用量監視も必要です。

## Codex から遊ぶ

[非公式Othelloプラグイン](PLUGIN.ja.md)を導入すると、明示的に選んだスキルから別のmacOS Terminalで起動できます。

```sh
codex plugin marketplace add HirokiKobayashi-R/games --ref main
codex plugin add terminal-othello@hiroki-games
```

Codex CLIの `/skills` から **Play Terminal Othello** を選びます。デスクトップでの選択、更新、実行内容、検証範囲は[プラグインガイド](PLUGIN.ja.md)へ。MCPや自動hooksは不要です。v0.3.0のプラグイン起動はユーザーが確認済みです。同じ起動経路と新版クライアントをPTYで検証していますが、開発側でGUI操作は行っていません。

### 従来のプロジェクトActions（任意）

リポジトリを clone し、`games`（または独立したオセロcheckout）を Codex の**ローカル Git プロジェクト**として開きます。

```sh
git clone https://github.com/HirokiKobayashi-R/games.git
cd games/terminal-othello
```

必要なら Settings → Local environments で **Terminal games** を選びます。同梱の macOS 向け Actions は次の二つです。

| Codex に表示される Action | 動作 |
| --- | --- |
| **オセロ** | 内蔵ターミナルで独立して起動。終了は `q`。hooks の信頼は不要。 |
| **作業待ちオセロ** | 同じプロジェクトのローカル作業を監視。完了・承認要求・中断・セッション終了で投了して終了。6個のプロジェクト hooks のレビュー・信頼が必要。 |

具体的な hooks、データの扱い、終了動作は [Codex 設定ガイド](codex/README.ja.md)を参照してください。グローバル設定や hooks の信頼を自動変更することはありません。

> **検証範囲:** ランチャーと自動投了は合成した lifecycle イベントで確認済みです。実際の Codex Actions 画面と、信頼後の実 callback は**未検証**です。Work Cloud の親タスク監視は非対応です。

## 切断と復帰

接続断では同じランダムなセッション秘密を使って自動再接続します。サーバーから正本の盤面を受け取るため、復帰時に古い手を再送しません。

クライアントのプロセスを再起動して復帰したい場合は、最初からセッションファイルを指定します。

```sh
node client.js --url http://127.0.0.1:8787 --session alice.session.json
```

相手は `bob.session.json` など別のファイルを使います。ファイルは `0600` で作成し、Git から除外します。秘密はその対局へ復帰する資格なので共有しないでください。同じファイルで新しく接続すると、以前の接続が置き換わります。ファイルなしでも、実行中プロセスのネットワーク再接続は可能です。

- **復帰猶予は2分。** 過ぎると接続中の相手の勝ち、双方が時間切れなら引き分けです。切断中の人を新しい相手と組み合わせず、2分で待機も解除します。
- **30分間着手なし。** 引き分けになります。古いセッションと参照のない対局も削除します。
- **キャンセルとマッチングの競合。** 取消が先なら待機解除、組合せが先なら投了です。
- `q` / Ctrl-C / SIGTERM は端末モード・カーソル・元画面を復元します。SIGKILL や端末の強制終了では復元処理を実行できません。

## ローカル開発

ソースのルートで固定済み開発依存を導入し、Worker を起動します。

```sh
npm ci
npm run dev
```

別の二つのターミナルで、同じルートから実行します。

```sh
node client.js --url http://127.0.0.1:8787
```

クライアントは Node 標準機能のみ。Wrangler は固定バージョンの開発依存です。

| ファイル | 役割 |
| --- | --- |
| [client.js](client.js) / [render.js](render.js) | 端末入力・描画・Node WebSocket クライアント |
| [rules.js](rules.js) | 共有の純粋な盤面ロジック。CPU はクライアントだけで実行 |
| [arena.js](arena.js) | 組合せ・取消・手番／revision 検証・復帰期限 |
| [worker.js](worker.js) | HTTP / WebSocket と SQLite 永続状態 |
| [codex/](codex/) | 任意のローカル Actions・lifecycle 連携 |

単一 Durable Object でイベントを直列化し、待機列と対局の全状態を1行に保存してから通知します。シャーディング・アカウント・ランキングはありません。セッションは256 bitの秘密の SHA-256 で識別します。相手に識別子や秘密は送らず、秘密は URL ではなく WebSocket subprotocol で渡します。

**ソースの費用保護（未デプロイ）:** 盤面状態が変わった場合だけ保存し、期限が変わった場合だけalarmを更新、内容が変わった接続だけに状態を通知します。`sync` は送信元だけに返信し、期限を延長しません。不正JSON・不明な操作は盤面状態を読み出す前に切断します。別のサイズ制限されたSQLite行で処理予算を8件ずつ先に確保し、新しい外部サービスやパッケージは追加しません。

| 処理予算 | 上限 |
| --- | --- |
| 接続＋アプリメッセージ全体 | UTC日次20,000件分・暦分ごと1,200件分 |
| DOに届く接続試行 | UTC日次1,000回・暦分ごと120回 |
| 同じセッション | 暦分ごと120件分・接続6回 |
| 制限で記録するセッション識別子 | 暦分ごと128件 |

予算は処理前に予約し、再接続や再起動で復活しません。休止によるメモリー破棄・分の切替時に未使用分は捨てるため、実際に使える件数は少なくなることがあります。拒否を繰り返しても予算の再保存は続きません。切断等の後始末・自動ping/pongはこの予算の対象外で、対局／セッションの期限がなくなるとalarmは停止します。これは処理量の予算であり、**金額の上限ではありません**。拒否した要求もCloudflareへ届き、枠は他アプリと共有され、Paid契約なら課金され得ます。予算通知にも支出停止機能はありません。公開を承認する前に、所有アカウントのWorkers契約・課金対象使用量・他の有料リソース・公開版を確認してください。

クライアントは自動再試行8回または障害継続2分を目安に停止し、ポリシー／予算拒否・セッション期限切れの切断では直ちに停止します。待機時間に揺らぎを入れ、接続が1分間安定するまで再試行回数をリセットしません。CPU練習は継続でき、`r` で同じセッションの接続を手動で再開します。期限切れで終了した対局は復帰できません。このソース修正は公開Workerやv0.4.0配布物には反映されていません。2026-10-09も既存Cloudflare CLI認証が期限切れで、デプロイは保留です。ユーザーの画面ではWorkers FreeとSQLite namespaceを個別に確認していますが、両者のアカウント同一性は未照合です。公開バージョンを確認するまで、公開APIにこの保護が適用済みとは扱わないでください。

[WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) では接続情報を attachment に保存し、20秒間隔の ping/pong に自動応答します。期限処理には Durable Object alarm を使い、サーバー常駐タイマーは置きません。1接続あたり10操作/秒・メッセージ512文字の上限があります。

### ローカルパッケージを作る

ソースのルートで実行します。

```sh
npm pack --pack-destination /tmp
```

空のディレクトリで導入します。

```sh
npm install --no-audit --no-fund /tmp/terminal-othello-0.2.0.tgz
./node_modules/.bin/terminal-othello --url https://terminal-othello.hiroki-c3a.workers.dev
```

レジストリではなくローカル tarball を導入します。グローバルインストールは不要です。`bin` は `client.js` を指し、`package.json` で配布ファイルを明示します。ソース・サーバーコード・Codex 設定・テストを含み、認証・ログ・セッション・`.git`・`node_modules`・`.wrangler` は除外します。npm tarball に `package-lock.json` は入らないため、固定依存で開発する場合はソースアーカイブと `npm ci` を使ってください。

### 自分の Worker を公開する

[wrangler.jsonc](wrangler.jsonc) は workers.dev と SQLite `new_sqlite_classes` のみを有効にしています。アカウント ID や独自ドメインは含みません。

1. 自分の Cloudflare アカウント・既存認証・Workers Free の利用可否・使用量を確認する。認証情報はプロジェクト外に保管する。
2. Worker 名を確認し、既存の公開先を意図せず上書きしない。
3. 自分でデプロイを許可して `npm run deploy` を実行する。新しいログイン・権限・規約はアカウント所有者が確認する。
4. 出力された URL の `/health`、`npm run test:integration -- <URL>`、二つのターミナル接続を確認する。

この設定に有料プランや独自ドメインは不要です。今回の説明更新では既存サーバーの再デプロイや認証変更を行いません。

## 検証

`npm ci` 後、ソースのルートで実行します。

```sh
npm test
npm run test:integration
npx wrangler deploy --dry-run --outdir dist
```

統合テストは一時 localhost Worker と SQLite を起動し、終了後に片付けます。非合法手・手番違反・古い手、組合せ、完走とパス、取消競合、4人同時参加、セッション置換、復帰、Worker 再起動後の盤面／待機列復元を確認します。

端末スモークテストは `npm run dev` を別途起動してから実行します。

```sh
python3 test/terminal.py
```

PTY テストは macOS / Linux の Python 標準ライブラリを使います。公開 API に対して実行する場合:

```sh
python3 test/online-qa.py https://terminal-othello.hiroki-c3a.workers.dev
```

二つの実PTYクライアントを低頻度で操作します。テスト専用preloadが状態を観察し、両側の対局IDが一致するまで着手送信を遮断します。未知の組合せは中止します。他の統合・lifecycleテストはlocalhostで実行してください。[v0.4.0オンラインQA結果](https://github.com/HirokiKobayashi-R/games/blob/main/docs/othello-qa-v0.4.0.md)。

**確認済み:** 未認証での配布物取得とチェックサム、クリーン導入、単体テスト18件、公開APIの二者対戦、CPU待機・通知・新盤面、取消・復帰、端末復元、合成 Codex イベントと投了。

**ユーザー確認済み:** v0.3.0のプラグイン起動。**開発側では未検証:** 実GUIの見た目、Codex UI／callback、大規模負荷、無料枠到達時の挙動、実 hibernation 時間／課金メーター、検証した macOS 環境以外での実動作。SQLite の再起動復元はローカルで確認し、本番 Worker の強制再起動は行っていません。合成 lifecycle テストでは hooks 登録・信頼や実 Codex タスクの操作を行いません。

## ライセンスと配布

配布先は [GitHub Releases](https://github.com/HirokiKobayashi-R/games/releases) です。**ライセンスは未選択・未追加です。** 公開リポジトリであること自体はオープンソースの権利許諾を意味しません。`private: true` は npm レジストリへの公開を防ぐ設定で、GitHub からの取得やローカル tarball の導入は可能です。npm レジストリには公開していません。
