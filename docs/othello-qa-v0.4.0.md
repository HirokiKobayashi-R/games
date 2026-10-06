# Othello v0.4.0: design and online QA

[English](#english) / [日本語](#日本語)

## English

The bright checkerboard and cross-shaped stone construction in v0.3.0 were replaced by a restrained dark surface, geometrically sampled round discs, score cards, mint turn/selection markers, and a separate result state. The same visual hierarchy covers matchmaking, play, reconnection and completion. Accepted moves clear stale notifications. The API, game rules and plugin launch path are unchanged.

[Before / after at 80 × 40](othello-redesign-comparison.png) · [100 × 48 game](othello-preview.png) · [80 × 40 game](othello-80x40.png) · [Result](othello-result.png).

These images reconstruct **real PTY output** with illustrative fonts and canonical block shapes. They are not Terminal GUI screenshots. The smaller character grid necessarily limits roundness/detail; there is no image-protocol or font dependency. ANSI 256-color and truecolor output, one/two-column ambiguous glyphs, 16-color fallback and NO_COLOR are covered by rendering tests. Real GUI glyph appearance remains unverified. The user confirmed that the v0.3.0 plugin launches successfully; v0.4.0 retains that launcher.

Public endpoint: `https://terminal-othello.hiroki-c3a.workers.dev`. [Machine-readable report](othello-qa-v0.4.0.json).

| Check | Result |
| --- | --- |
| Two independent real clients, operated through PTYs | Same game ID and opposite colors verified before moves |
| CPU practice, cancel/resume queue, random matching | Passed; fresh 2:2 human board and bell |
| Every accepted move | Board, turn, revision, legal moves and score identical on both clients |
| Wrong turn, illegal cell, repeated Enter | Rejected; only one valid revision accepted |
| Resize to 40 × 22, below minimum, and back; repeated navigation | Board preserved; hidden moves ignored |
| WebSocket disconnect / reconnect | Opponent sees offline state; same session and board recovered |
| Full game | 60 moves, 4 automatic passes; black 19, white 45 |
| Scoring and victory | Board independently counted; both clients agree white wins |
| Next match and resignation | Confirmed pair; remaining player wins |
| Graceful exit | Both PTYs restore terminal modes, cursor and alternate screen |
| Unknown public opponents | 0 encountered |

The test preload only logs incoming game state/errors and blocks outgoing moves to any game ID not explicitly confirmed as belonging to both test clients. It never logs tokens or headers. An unconfirmed pairing aborts; no automated play is sent to an unknown opponent. Commands are paced and only two game clients are active. No high-load test, deployment, authentication or quota change was performed.

Not exercised in this public run: an actual draw, expiry of the two-minute grace period, 30-minute inactivity, simultaneous cancel/join ordering, Worker restart, hibernation duration, quota exhaustion or other operating systems. Draw/expiry/cancellation races have local unit coverage; earlier localhost integration covers SQLite restart recovery. The current public result proves neither those production scenarios nor broad availability.

The 18 unit tests and macOS PTY suites also cover geometry/width/overflow, rendering states, flip transitions, public-test move isolation, plugin duplicate launches, spaces/quotes in paths, opener failure/timeout, Node prerequisites, NO_COLOR, resize and restoration. No new runtime dependencies were added. Optional preview regeneration uses Pillow on the maintainer's macOS environment.

```sh
cd terminal-othello
npm test
python3 test/plugin-terminal.py
python3 test/visual.py
python3 test/online-qa.py https://terminal-othello.hiroki-c3a.workers.dev
```

## 日本語

v0.3.0の強い市松模様と十字に見える石を、落ち着いた暗い盤面、輪郭を計算する丸い石、左右のスコアカード、ミント色の手番・選択表示、専用の結果表示へ変更しました。待機から対局・復帰・終了まで同じルールで情報を整理しています。受理された着手で古い通知を消します。API、ルール、プラグイン起動経路は変更していません。

上の画像リンクは**実PTY出力の再描画**です。参考フォントと標準的なブロック形状を使い、GUIのスクリーンショットではありません。文字セル数による輪郭・細部の限界は残ります。256色・truecolor、曖昧幅1列／2列、16色の代替表示、NO_COLORをテストしていますが、新版の実GUI字形は未検証です。v0.3.0のプラグイン起動はユーザー確認済みで、同じ起動処理を維持しています。

公開APIで二つの実クライアントをPTY操作し、対局IDの一致と反対の色を確認してから着手しました。CPU待機、検索取消・再開、新盤面への切替、不正手・連打の拒否、サイズ変更、WebSocket切断と自動復帰、次の対戦、退出時の相手勝利、端末復元まで成功しました。**60手・自動パス4回、黒19対白45**で終局。毎手の盤面・手番・revision・合法手・スコアを照合し、最終枚数は別途数え直しました。未知の相手との組合せは0件でした。

テスト専用preloadは受信した対局状態・エラーだけを記録し、確認済みの対局ID以外への着手を遮断します。秘密トークンやヘッダーは記録せず、未知の組合せなら中止します。操作は低頻度で、同時に動くゲームクライアントは二つです。高負荷試験、デプロイ、認証・無料枠の設定変更は行っていません。

今回の公開試験では、引き分け、2分の復帰猶予切れ、30分の無着手、取消と参加の同時競合、Worker再起動、hibernation時間、無料枠超過、他OSは未検証です。引き分け・期限切れ・取消競合はローカル単体テスト、SQLite再起動復元は以前のlocalhost統合テストで確認しています。今回の成功を、それらの本番条件や稼働保証とは扱いません。

単体18件とmacOSのPTYテストでは、円の形・文字幅・表示範囲・状態表示・反転、未知の対戦相手への着手遮断、プラグインの重複起動、空白・引用符入りパス、起動失敗・タイムアウト、Node確認、NO_COLOR、リサイズ、端末復元も確認しています。実行時の依存追加はありません。任意のプレビュー再生成だけ、開発用macOS環境のPillowを使います。
