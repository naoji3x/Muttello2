import dgram from 'node:dgram'
import { isIPv4 } from 'node:net'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'

const help = `Tello EDUを地面に置き、PCを機体のWi-Fiに接続して実行してください。
npm run tello:station -- --ssid <SSID> --password <PASSWORD>
環境変数 TELLO_SSID / TELLO_PASSWORD も使用できます（引数優先）。
--tello-ip <IPv4>  設定前の機体IP（既定: 192.168.10.1）
--help             この説明を表示`

export function readOptions(args, env = process.env) {
  let values
  try {
    ;({ values } = parseArgs({ args, options: {
      ssid: { type: 'string' }, password: { type: 'string' },
      'tello-ip': { type: 'string', default: '192.168.10.1' },
      help: { type: 'boolean', default: false },
    } }))
  } catch {
    throw new Error('引数が不正です。--help を確認してください。')
  }
  if (values.help) return { help: true }
  const ssid = values.ssid ?? env.TELLO_SSID
  const password = values.password ?? env.TELLO_PASSWORD
  // The SDK uses whitespace-delimited tokens and specifies no escaping scheme.
  for (const [name, value] of [['SSID', ssid], ['PASSWORD', password]]) {
    if (typeof value !== 'string' || !value || /[\s\p{Cc}]/u.test(value)) {
      throw new Error(`${name}は必須です。このヘルパーでは空白・制御文字を含む値は使用できません。`)
    }
  }
  if (Buffer.byteLength(ssid, 'utf8') > 32) throw new Error('SSIDはUTF-8で32バイト以内にしてください。')
  if (!isIPv4(values['tello-ip'])) throw new Error('--tello-ipにはIPv4を指定してください。')
  return { ssid, password, ip: values['tello-ip'] }
}

export async function configureStation({ ssid, password, ip }, {
  socket = dgram.createSocket('udp4'), port = 8889, timeoutMs = 15000,
} = {}) {
  let pending
  const onError = () => pending?.(new Error('UDP通信に失敗しました。Wi-Fi接続とファイアウォールを確認してください。'))
  socket.on('error', onError)
  function send(command, stage) {
    return new Promise((resolve, reject) => {
      const finish = (error, result) => {
        clearTimeout(timer)
        socket.off('message', onMessage)
        pending = undefined
        if (error) reject(error)
        else resolve(result)
      }
      const onMessage = (message, remote) => {
        if (remote.address !== ip || remote.port !== port) return
        const raw = message.toString('utf8')
        const response = raw.replace(/[\0\s]+$/u, '').trim().toLowerCase()
        // SDK 3.0 documents this longer acknowledgement for ap; some firmware
        // also appends a C-string NUL terminator to UDP responses.
        if (response === 'ok') finish(null, 'acknowledged')
        else if (stage === 'AP設定' && /^ok,\s*drone will reboot in 3s$/.test(response)) {
          finish(null, 'rebooting')
        } else {
          const detail = JSON.stringify(raw.replaceAll(password, '[PASSWORD]').replaceAll(ssid, '[SSID]').slice(0, 256))
          const reason = /^(error\b|unknown command\b|unactive\b)/.test(response)
            ? 'が機体に拒否されました'
            : 'で想定外の応答を受信しました（成功・失敗は未確認）'
          finish(new Error(`${stage}${reason}。機体応答: ${detail}`))
        }
      }
      const timer = setTimeout(() => {
        if (stage === 'AP設定') finish(null, 'unconfirmed')
        else finish(new Error('SDKモードの応答がありません。PCをTelloのWi-Fiに接続してください。'))
      }, timeoutMs)
      pending = finish
      socket.on('message', onMessage)
      try {
        socket.send(Buffer.from(command, 'utf8'), port, ip, error => { if (error) onError() })
      } catch { onError() }
    })
  }
  try {
    await send('command', 'SDKモードへの移行')
    return await send(`ap ${ssid} ${password}`, 'AP設定')
  } finally {
    try { socket.close() } catch { /* Socket may not have bound after a send failure. */ }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = readOptions(process.argv.slice(2))
    if (options.help) console.log(help)
    else {
      console.log('Tello EDUへステーションモード設定を送信します。')
      const result = await configureStation(options)
      if (result === 'unconfirmed') {
        console.error('AP設定を送信しましたが応答は未確認です。Wi-Fi切り替えの可能性があります。自動再送はしません。')
        process.exitCode = 2
      } else if (result === 'rebooting') {
        console.log('AP設定が受理されました。機体は約3秒後に再起動します。')
      } else console.log('AP設定のok応答を受信しました。')
      console.log('PCを設定先Wi-Fiへ接続し、ルーターのDHCP一覧でTelloの接続とIPを確認してください。')
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
