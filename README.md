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

Tello EDUを事前に以下のステーションモード（Wi-Fiのクライアントモード）へ設定し、DHCP予約などでIPを確認してください。
PCを同じネットワークに接続し、UDP 8890の受信を許可します。

```bash
npm run start -- --tello-ip 192.168.1.42
```

機体を地面に置いて「ドローンに接続する」を押し、電池と高度を確認します。
写真を含まない離陸→移動→着陸をシミュレーションし、先生が安全確認にチェックして「実機で飛ばす」を押します。
`--tello-ip` と `TELLO_IP` のどちらも未設定ならシミュレーション専用です。

### .envで接続情報を設定する

リポジトリ直下の `.env.example` を `.env` にコピーし、自分の環境に合わせて編集します。

```dotenv
TELLO_IP=192.168.1.42
TELLO_SSID=DojoWiFi
TELLO_PASSWORD="YourWifiPassword"
```

`TELLO_IP` は機体のIP、`TELLO_SSID` と `TELLO_PASSWORD` は接続先ルーターのWi-Fi情報です。パスワードに `#` が含まれる場合も値全体を引用符で囲んでください。SSID・パスワードの空白など、ヘルパーの入力制限は引き続き適用されます。

設定後は `npm run start` または `npm run dev:app` で、IPの引数を省略して起動できます。設定ヘルパーも `npm run tello:station` で3項目を読み込みます。優先順位は **コマンドライン引数 > 既存の環境変数 > .env** です。アプリをシミュレーション専用にする場合は `TELLO_IP` を空欄にし、同名の環境変数や起動引数も外してください。

**初回のAP設定では、ルーターから割り当てられるIPと直接接続時のIPが異なります。** PCを `TELLO-xxxxxx` に接続した状態では、SSID・パスワードだけを `.env` から読み、送信先を次のように上書きしてください。

```bash
npm run tello:station -- --tello-ip 192.168.10.1
```

IP設定がない場合、ヘルパーの送信先は `192.168.10.1` です。ヘルパーで `TELLO_IP` を空欄にした場合は、上記の引数を指定してください。

開発時とヘルパーは実行時のカレントフォルダの `.env`、配布アプリは実行ファイルと同じフォルダの `.env` を読みます（macOSの `.app` では `Contents/MacOS/`）。変更は次回起動時に反映されます。`.env` がなくても起動できます。

`.env` と `.env.*` はGit管理から除外し、例示用の `.env.example` だけを管理します。配布物に `.env` は含めません。SSID・パスワードに `VITE_` を付けるとWebの公開データに含まれるおそれがあるため、上記の変数名を使用してください。

中止は未送信の処理だけを破棄し、送信済みの動作やホバリングは止めません。「着陸する」は進行中の応答を待って着陸します。
初回接続の失敗や、飛行操作前の接続断では、機体を地面に置いて「ドローンに接続する」をもう一度押せます。両方のUDPソケットの解放を待ち、受信データを消してソケットを再作成し、SDKモードへの移行と新しい状態データの受信を確認します。自動再送はしません。
飛行操作のコマンド送信後に通信が不確実になった場合は追加の通常コマンドを送らず、再接続も拒否します。先生が機体の着陸・状態を確認してからアプリを再起動してください。
緊急停止は応答待ちを割り込んでモーター停止を送ります。機体が落下するため教師専用です。送信成功は到達を保証しません。
飛行状態はコマンド応答から推定しています。テレメトリー高度で実際の状態も確認してください。

### Tello EDUをステーションモードに設定する

ステーションモードでは、Tello EDUがルーターのWi-Fiに参加し、同じネットワークのPCから操作できます。初回設定はPCを機体のWi-Fiへ直接接続して行います。

1. Node.js（本プロジェクトは24.x）とnpmを用意し、このリポジトリのフォルダでターミナルを開きます。ヘルパーはNode.js標準モジュールのみを使用するため、設定だけなら `npm install` は不要です。
2. 接続先ルーターのSSIDとパスワードを確認し、2.4GHzのWi-Fiを用意します。PCと機体が通信できるよう、端末間通信を遮断するAPアイソレーションを無効にします。
3. Tello EDUを地面に置いて電源を入れ、Muttello2やほかのTello操作アプリを終了します。PCのWi-Fiを機体の `TELLO-xxxxxx` に接続します（この間、インターネットに接続できなくても構いません）。
4. ルーターにIPを事前登録する場合は、後述の「MACアドレスを確認してIPを事前予約する」を実施します。その後、PCを機体のWi-Fiへ接続した状態で、次のコマンドで**接続先ルーター**のSSIDとパスワードを設定します。

```bash
npm run tello:station -- --ssid 'DojoWiFi' --password 'YourWifiPassword'
```

Windows PowerShellで `npm.ps1` の実行ポリシーエラーが出る場合は `npm.cmd run tello:station -- --ssid 'DojoWiFi' --password 'YourWifiPassword'` を使用してください。コマンドプロンプトでは引用符を `"` にします。

ヘルパーは既定で `192.168.10.1:8889` へUDPで `command` を送り、`ok` を受信してから `ap <SSID> <PASSWORD>` を一度送ります。設定済みの機体に再設定する場合は、PCを現在の機体と同じネットワークへ接続し、`--tello-ip 192.168.1.42` のように**設定前のIP**を指定できます。

SSID・パスワードには環境変数 `TELLO_SSID` / `TELLO_PASSWORD` も使用でき、引数を省略すると参照します。引数が両方ある場合は引数が優先されます。引数に書いたパスワードはシェル履歴やプロセスの引数に残ることがあるため、履歴に残したくない場合は環境変数を利用してください。スクリプト自身はパスワードを表示・ファイル保存しません。

SDKの空白区切りコマンドを使用するため、このヘルパーでは空白・改行・制御文字を含むSSIDやパスワード、および空の値を受け付けません。SSIDはUTF-8で32バイト以内にしてください。使用方法は `npm run tello:station -- --help` でも確認できます。

5. 設定後、PCを接続先ルーターのWi-Fiへ切り替えます。ルーターの接続端末・DHCPリース一覧でTello EDUが接続されたことと、割り当てられたIPを確認してください。必要に応じて機体を再起動し、IPが変わらないようDHCP予約を設定します。
6. 確認したIPを指定して `npm run start -- --tello-ip 192.168.1.42` で起動します。Windowsのファイアウォール設定は後述の「Windowsの実機通信」を参照してください。ヘルパーの通信許可対象はNode.jsです。

各コマンドの応答待ちは15秒です。SDK移行失敗・通信エラー・機体の拒否応答は終了コード1になります。AP設定の応答がない場合は、Wi-Fi切り替えによる切断の可能性があるため「未確認」と表示して終了コード2にします。`ok` を受信した場合もルーターへの接続完了までは保証しません。自動再送はせず、まずDHCP一覧を確認してください。

接続先を間違えたなどで機体へ接続できなくなった場合は、電源が入った状態で電源ボタンを5秒間長押ししてWi-FiのSSID・パスワードをリセットし、機体のWi-Fiへ接続して設定し直します。

コマンドとリセット操作は[公式Tello SDK 2.0ガイド](https://dl-cdn.ryzerobotics.com/downloads/Tello/Tello%20SDK%202.0%20User%20Guide.pdf)の「Architecture」「Set Commands」「Reset Tello Wi-Fi」を参照しています。このヘルパーの実機検証は未実施です。

#### AP設定の応答とトラブルシューティング

ヘルパーは `ok` に加え、`OK, drone will reboot in 3s`（カンマ後の空白なし・末尾NUL文字付きも含む）をAP設定の成功応答として扱います。再起動通知は[公式SDK 3.0ガイドのSetting Commands](https://dl.djicdn.com/downloads/RoboMaster%20TT/Tello_SDK_3.0_User_Guide_en.pdf)に記載されています。受理後は機体の再起動を待ち、ルーターのDHCP一覧で接続を確認してください。

旧版のヘルパーは `ok` 以外をすべて拒否と表示していたため、再起動通知を誤判定する場合がありました。旧版で「AP設定が機体に拒否されました」と表示された場合も、まずルーター側で接続済みか確認してください。

修正版はエラー・想定外の応答を、指定したパスワードとSSIDを伏せて表示します。`unknown command` なら機体のモデルとファームウェアのAP設定対応を確認し、`error` の場合は表示された詳細、接続先のSSID・パスワード、ルーター設定を確認してください。想定外の応答は成功とも拒否とも断定せず、終了コード1で停止します。

#### MACアドレスを確認してIPを事前予約する

Windowsでは、PCをTello EDUのWi-Fi（`TELLO-xxxxxx`）へ直接接続した状態で、PowerShellまたはコマンドプロンプトから次を実行します。ステーションモードの設定前に実施してください。

```powershell
ping -n 1 192.168.10.1
arp -a 192.168.10.1
```

`ping` は機体との通信を試み、IPとMACアドレスの対応をARPキャッシュへ取得するために実行します。`ping` がタイムアウトしても、`arp` にMACアドレスが表示されていれば確認できます。

出力例（MACアドレスは説明用の架空の値です）：

```text
  インターネット アドレス  物理アドレス           種類
  192.168.10.1             02-11-22-33-44-55     動的
```

`192.168.10.1` の行の「物理アドレス」が、直接接続中のTelloのMACアドレスです。`ipconfig /all` に表示されるPC自身の物理アドレスや、機体のシリアル番号とは異なります。表示されない場合は、PCが機体のWi-Fiに接続されていることと、PCのIPv4が `192.168.10.x` になっていることを確認して再実行します。WindowsのARP表示については[Microsoftの公式説明](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/arp)を参照してください。

1. 確認したMACアドレスを控え、PCをルーター側のネットワークへ戻して管理画面を開きます。
2. 「DHCP予約」「固定割り当て」「静的DHCP」などの設定で、MACアドレスと希望するIP（例：`192.168.1.42`）を登録します。IPはルーターのLANと同じサブネット内で、ほかの端末と重複せず、ルーターの予約ルールに合うものを選んでください。MACの区切り文字は管理画面に合わせます（例：`02:11:22:33:44:55`）。
3. PCを再び機体のWi-Fiへ接続し、`npm run tello:station` の設定手順に戻ります。`192.168.10.1` は設定時の直接接続用IPであり、ルーターに予約するIPとは別です。
4. ステーションモードで接続後、ルーターのDHCP一覧で実際のMACと割り当てIPを照合します。

**直接接続時とステーションモード時のMACが同じになることは、参照したSDK 2.0ガイドでは保証されておらず、本プロジェクトでも実機未確認です。** 事前予約が適用されない場合は、ルーターの接続端末一覧で機体の電源オン・オフに対応する端末を確認し、実際に使われたMACで予約を修正してから機体を再起動してください。MAC認証も設定するネットワークでは、ステーションモードで使われるMACを確認してから許可登録してください。

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
- 実機モードでは`--tello-ip <IPv4>`または`TELLO_IP`を必須にする
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
