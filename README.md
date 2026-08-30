# Muttello2

日本の小学生がTello EDUをブロックプログラミングで操作するための、macOS向けデスクトップアプリです。

現在は、最終的な利用感を確認するためのUIプロトタイプです。Blocklyでブロックをつなぎ、体育館を想定したシミュレーターで実行の流れを確認できます。

## 現在できること

- 日本語のBlocklyエディタ
- 3つのミッションの選択と完了チェック
- 離陸、着陸、移動、回転、写真ブロック
- ミッション選択時は空のワークスペースから開始
- Blocklyパレット下部の「すべてのブロックを消す」
- ミッション例
  - 写真をとって帰ろう
  - 曲がってゴールへ行こう
  - 高いところで写真をとろう
- 体育館の飛行経路シミュレーター
- 飛行前チェックの表示
- 「ドローンに接続する」と「飛ばす」ボタンのUI
- macOS用Electronアプリの生成

## 未実装の機能

以下はUIだけで、実機にはまだ接続しません。

- Tello EDUへのUDP通信
- クライアントモード用の`--tello-ip <IPv4>`起動引数
- 実際のバッテリー・状態データ受信
- 実機への飛行コマンド送信
- `streamon`による映像受信と写真のPC保存
- プロジェクトの保存・読み込み
- 実行キュー、タイムアウト、緊急停止の実装

実装範囲と安全要件は[PLAN.md](PLAN.md)を参照してください。

## 開発環境

- Node.js 24
- npm
- React + TypeScript + Vite
- Blockly
- Electron + electron-builder

依存関係をインストールします。

```bash
npm install
```

ブラウザでUIを開く場合:

```bash
npm run dev
```

Electronアプリとして開く場合:

```bash
npm run dev:app
```

## macOSアプリのビルド

Apple Silicon向けの`.app`、DMG、ZIPを生成します。

```bash
npm run dist:mac
```

生成先:

```text
release/mac-arm64/Muttello2.app
release/Muttello2-<version>-arm64.dmg
release/Muttello2-<version>-arm64-mac.zip
```

現在の配布物はApple Silicon（arm64）向けで、Developer IDによる署名・notarizationはしていません。初回起動時にGatekeeperの警告が出た場合は、Finderでアプリを右クリックして「開く」を選択してください。

## ビルド出力の注意

ViteのUI出力とElectron Builderの配布物は必ず別フォルダにします。

```text
build/    # Viteが生成するUI資産
release/  # Electron Builderが生成する.app / DMG / ZIP
```

Electronのパッケージ版は`file://`でUIを読み込むため、Viteのアセットパスは相対パス（`./assets/...`）で出力します。この設定がないと、アプリは白画面になります。

## 安全上の前提

実機機能を追加する際は、次を守ります。

- 対象はTello EDU 1台
- Tello EDUは学校Wi-Fiのクライアントモードで接続
- 実機モードでは`--tello-ip <IPv4>`を必須にする
- コマンドは1件ずつ送信し、応答またはタイムアウトを待つ
- 飛行コマンドはタイムアウト後に自動再送しない
- プログラム停止、着陸、緊急モーター停止を分離する
- 緊急停止は教師向けの明示的な操作に限定する
- 体育館向けの初期上限は高度250cm、横方向500cm

## 主な構成

```text
src/
  App.tsx       # React UI
  blocks.ts     # Blocklyブロックと実行ステップの変換
  styles.css    # UIスタイル
electron/
  main.cjs      # Electronメインプロセス
  preload.cjs   # 制限されたRenderer API
build/          # Vite出力（Git管理外）
release/        # macOS配布物（Git管理外）
```

## 検証

UIの本番ビルドは次で確認します。

```bash
npm run build
```

macOS配布物まで含めて確認する場合:

```bash
npm run dist:mac
```
