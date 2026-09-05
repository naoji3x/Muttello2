# Muttello2

日本の小学生がTello EDUをブロックプログラミングで操作するための、Windows・macOS向けデスクトップアプリです。

Blocklyと体育館シミュレーターに加え、ElectronからTello EDUへ接続する実装を追加しています。実機・ファームウェアでの動作検証はまだ行っていません。

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
- Windows用インストーラー・ZIP、macOS用Electronアプリの生成設定

## 実機接続の実装状況

- 起動時のIPv4検証、SDKモードへの移行、UDP 8889へのコマンド送信
- UDP 8890のバッテリー・高度受信（指定IPのみ受理）
- 共通のバージョン付きプログラム検証をUIとメインプロセスで実施
- 高度・移動距離・出発点からの距離・推定時間のチェック
- バッテリー30%以上、3秒以内の状態受信、地上状態でのみ開始
- コマンドを1件ずつ実行し、15秒の応答タイムアウトや接続断で停止。自動再送なし
- プログラム中止、着陸、確認ダイアログ付き緊急モーター停止
- ローカル診断ログ（ElectronのuserDataフォルダ内 `tello.log`）
- 偽UDPソケットで正常応答・エラー・タイムアウト・接続断を自動検証

## まだ対応していないもの

- 映像デコードと写真のPC保存。写真を含む実機プログラムは**離陸前に拒否**します
- プロジェクトのファイル保存・読み込み
- 待機・繰り返し・メッセージブロック
- 実機でのM0検証、Windows実環境での起動・配布検証、署名・notarization

実装範囲と安全要件は[PLAN.md](PLAN.md)を参照してください。M3は進行中です。

## 実機で起動する

Tello EDUを事前にWi-Fiのクライアントモードへ設定し、DHCP予約などでIPを確認してください。
PCを同じネットワークに接続し、UDP 8890の受信を許可します。

```bash
npm run start -- --tello-ip 192.168.1.42
```

機体を地面に置いて「ドローンに接続する」を押し、電池と高度を確認します。
写真を含まない離陸→移動→着陸をシミュレーションし、先生が安全確認にチェックして「実機で飛ばす」を押します。
`--tello-ip`なしではシミュレーション専用です。

中止は未送信の処理だけを破棄し、送信済みの動作やホバリングは止めません。「着陸する」は進行中の応答を待って着陸します。
通信が不確実になった場合は追加の通常コマンドを送らず、再接続も拒否します。先生が機体の着陸・状態を確認してからアプリを再起動してください。
緊急停止は応答待ちを割り込んでモーター停止を送ります。機体が落下するため教師専用です。送信成功は到達を保証しません。
飛行状態はコマンド応答から推定しています。テレメトリー高度で実際の状態も確認してください。

## Webで公開する

`npm run build` の `build/` を静的ホスティングに配置できます。
Web版はブロック編集とシミュレーションに対応し、実機ボタンは無効です。
実機通信にはElectronのNode.js UDPを使用します。Webからの実機操作用ゲートウェイは実装していません。

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

## Windowsでの開発

Windows 11 x64を初期対象とします。Node.js 24とGit for Windowsをインストールし、Windows側のPowerShellまたはコマンドプロンプトで作業してください（WSLではなくWindows版Node.jsを使用）。
macOSの `node_modules/` はコピーせず、リポジトリを取得して依存関係を入れ直します。

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run dev:app
```

PowerShellで `npm.ps1` の実行ポリシーエラーが出る場合も、上記の `npm.cmd` で実行できます。コマンドプロンプトでは通常の `npm` でも構いません。
開発画面から実機接続する場合は、起動引数を渡します。

```powershell
npm.cmd run dev:app -- --tello-ip 192.168.1.42
```

開発サーバーのポート5173が使用中の場合は起動を中止します。先に起動した開発サーバーを終了してください。

### Windowsの実機通信

- PCとTello EDUを同じWi-Fiに接続します。アクセスポイントの端末間通信制限にも注意してください。
- Windows Defenderファイアウォールで、開発時はリポジトリ内の `node_modules\electron\dist\electron.exe`、配布版はインストール先の `Muttello2.exe` のUDP通信を許可します。学校管理の端末では管理者に設定を依頼してください。
- 状態受信はローカルUDP 8890です。コマンドは機体のUDP 8889へ送信し、その応答をローカルの動的ポートで受信します。8890だけの許可ではコマンド応答が遮断される場合があります。
- 診断ログは通常 `%APPDATA%\muttello2\tello.log` に保存されます。

### Windowsアプリのビルド

Windows端末で実行します。初回はElectronとNSISなどのビルドツールをダウンロードするためインターネット接続が必要です。

```powershell
npm.cmd run dist:win
```

生成先は `release/Muttello2-<version>-x64-setup.exe`（ユーザー単位のインストーラー）と `release/Muttello2-<version>-x64-win.zip` です。
ZIPは全体を展開して使用してください。ビルド直後の展開済みアプリで実機接続する例:

```powershell
& ".\release\win-unpacked\Muttello2.exe" --tello-ip 192.168.1.42
```

インストール版も `Muttello2.exe` に同じ引数を渡します。ショートカットから使う場合はリンク先の実行ファイルパスの後に `--tello-ip 192.168.1.42` を追加してください。
Windows版のコード署名は未設定です。配布前にWindows実機で起動・接続を検証してください。
設定は[electron-builderのWindowsガイド](https://www.electron.build/docs/win/)と[NSISガイド](https://www.electron.build/nsis/)を参照しています。

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

実機機能では、次を前提とします。

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
  tello.cjs     # UDP通信・実行・状態管理
shared/         # UIとメインプロセスの共通安全検証
tests/          # 実機なしで動作する通信・安全検証テスト
build/          # Vite出力（Git管理外）
release/        # Windows・macOS配布物（Git管理外）
```

## 検証

通信・安全検証テストとUIの本番ビルドは次で確認します。

```bash
npm test
npm run build
```

macOS配布物まで含めて確認する場合:

```bash
npm run dist:mac
```

通信仕様は[公式SDK 2.0ガイド](https://dl-cdn.ryzerobotics.com/downloads/Tello/Tello%20SDK%202.0%20User%20Guide.pdf)、IPC制限は[Electron公式ガイド](https://www.electronjs.org/docs/latest/tutorial/ipc)を参照しています。
