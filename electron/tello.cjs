const dgram = require('node:dgram')
const { isIPv4 } = require('node:net')

function parseAddress(args) {
  const positions = args.flatMap((arg, i) => arg === '--tello-ip' ? [i] : [])
  if (!positions.length) return null
  const ip = args[positions[0] + 1]
  if (positions.length !== 1 || !ip || !isIPv4(ip)) throw new Error('--tello-ip にIPv4アドレスを1つ指定してください。')
  return ip
}

class Tello {
  constructor(ip, validate, { socketFactory = () => dgram.createSocket('udp4'), timeout = 15000, staleMs = 3000, log = () => {} } = {}) {
    Object.assign(this, { ip, validate, socketFactory, timeout, staleMs, log })
    this.state = { configured: !!ip, connected: false, flight: 'unknown', execution: 'idle', battery: null, height: null, lastTelemetry: null, message: '', activeStep: -1 }
    this.watchdog = setInterval(() => {
      if (this.state.connected && !this.fresh()) this.fail('状態データが途絶えました。機体の状態は不明です。')
    }, 250)
    this.watchdog.unref?.()
  }
  snapshot() { return { ...this.state } }
  fresh() { return this.state.lastTelemetry !== null && Date.now() - this.state.lastTelemetry < this.staleMs }
  fail(message) {
    this.cancelled = true
    this.state.connected = false
    this.state.flight = 'unknown'
    this.state.execution = 'uncertain'
    this.state.message = message
    this.pending?.reject(new Error(message))
    this.log('failure', message)
  }
  async connect() {
    if (!this.ip) throw new Error('起動時に --tello-ip を指定してください。')
    if (['uncertain', 'emergency-stop'].includes(this.state.execution) || this.state.flight === 'airborne' || this.busy || this.connecting) throw new Error('機体を確認し、着陸後にアプリを再起動してください。')
    if (this.state.connected) return this.snapshot()
    this.connecting = true
    try {
      this.commandSocket = this.socketFactory(); this.stateSocket = this.socketFactory()
      this.commandSocket.on('message', (data, remote) => {
        if (remote.address !== this.ip || remote.port !== 8889) return
        const reply = data.toString().trim()
        this.log('response', reply)
        if (reply === 'ok') this.pending?.resolve()
        else if (reply.startsWith('error')) this.pending?.reject(new Error(`機体の応答: ${reply}`))
      })
      this.stateSocket.on('message', (data, remote) => {
        if (remote.address !== this.ip) return
        const values = Object.fromEntries(data.toString().trim().split(';').filter(Boolean).map(field => field.split(':')))
        const battery = Number(values.bat), height = Number(values.h)
        if (!/^\d+$/.test(values.bat || '') || !/^\d+$/.test(values.h || '') || battery > 100 || height > 10000) return
        Object.assign(this.state, { battery, height, lastTelemetry: Date.now() })
      })
      for (const socket of [this.commandSocket, this.stateSocket]) socket.on('error', error => this.fail(`UDP通信エラー: ${error.message}`))
      await Promise.all([this.bind(this.commandSocket, 0), this.bind(this.stateSocket, 8890)])
      await this.command('command')
      const deadline = Date.now() + this.staleMs
      while (!this.fresh() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
      if (!this.fresh() || this.state.execution === 'uncertain') throw new Error('状態データを受信できません。Wi-Fiとファイアウォールを確認してください。')
      if (this.state.height > 10) throw new Error('機体を地面に置いてから接続してください。')
      Object.assign(this.state, { connected: true, flight: 'grounded', message: '接続しました。' })
      return this.snapshot()
    } catch (error) {
      this.fail(error.message)
      this.closeSockets()
      throw error
    } finally { this.connecting = false }
  }
  bind(socket, port) {
    return new Promise((resolve, reject) => {
      const onError = error => { socket.removeListener('listening', onReady); reject(error) }
      const onReady = () => { socket.removeListener('error', onError); resolve() }
      socket.once('error', onError); socket.once('listening', onReady); socket.bind(port)
    })
  }
  command(command) {
    if (this.pending) return Promise.reject(new Error('別のコマンドの応答を待っています。'))
    return new Promise((resolve, reject) => {
      const finish = error => { clearTimeout(timer); this.pending = null; error ? reject(error) : resolve() }
      const timer = setTimeout(() => { this.fail('応答がありません。再送せず停止しました。機体を確認してください。') }, this.timeout)
      this.pending = { resolve: () => finish(), reject: finish }
      this.log('command', command)
      this.commandSocket.send(command, 8889, this.ip, error => { if (error) this.fail(error.message) })
    })
  }
  async run(program) {
    if (this.busy || this.landing || !this.state.connected || !this.fresh() || this.state.flight !== 'grounded' || this.state.height > 10) throw new Error('接続と着陸状態を確認してください。')
    if (this.state.battery < 30) throw new Error('バッテリーを30%以上にしてください。')
    const errors = this.validate(program)
    if (errors.length) throw new Error(errors.join('\n'))
    if (program.steps.some(step => step.type === 'photo')) throw new Error('実機の写真保存は未対応です。写真ブロックを外してください。')
    this.busy = true; this.cancelled = false; this.state.execution = 'running'
    const deadline = setTimeout(() => this.fail('実行が60秒を超えました。機体を確認してください。'), 60000)
    try {
      // Explicit speed makes the duration estimate independent of previous SDK sessions.
      await this.command('speed 20')
      for (const [index, step] of program.steps.entries()) {
        if (this.cancelled) break
        if (!this.fresh() || !this.state.connected) throw new Error('接続が失われました。')
        this.state.activeStep = index
        const command = step.type === 'move' ? `${step.direction} ${step.distance}` : step.type === 'turn' ? `${step.direction === 'right' ? 'cw' : 'ccw'} ${step.degrees}` : step.type
        if (step.type === 'takeoff') this.state.flight = 'taking-off'
        if (step.type === 'land') this.state.flight = 'landing'
        await this.command(command)
        if (this.state.execution === 'uncertain' || this.state.execution === 'emergency-stop') break
        if (step.type === 'takeoff') this.state.flight = 'airborne'
        if (step.type === 'land') this.state.flight = 'grounded'
      }
      if (this.state.execution === 'running') this.state.execution = this.cancelled ? 'cancelled' : 'complete'
    } catch (error) {
      if (this.state.execution !== 'emergency-stop') this.fail(error.message)
      throw error
    } finally { clearTimeout(deadline); this.busy = false }
    return this.snapshot()
  }
  cancel() { this.cancelled = true; if (this.state.execution === 'running') this.state.execution = 'cancelled'; return this.snapshot() }
  async land() {
    this.cancel()
    if (!this.state.connected || this.state.execution === 'uncertain' || this.landing) throw new Error('通信状態が不明です。機体を確認してください。')
    this.landing = true
    try {
      while (this.busy) await new Promise(resolve => setTimeout(resolve, 20))
      if (!this.state.connected) throw new Error('通信状態が不明です。')
      this.state.flight = 'landing'
      await this.command('land')
      this.state.flight = 'grounded'; this.state.execution = 'landed'
    } catch (error) { this.fail(error.message); throw error }
    finally { this.landing = false }
    return this.snapshot()
  }
  async emergency() {
    if (!this.commandSocket || !this.ip) throw new Error('通信ソケットがありません。')
    this.cancel()
    this.pending?.reject(new Error('緊急停止しました。'))
    this.state.connected = false; this.state.flight = 'unknown'; this.state.execution = 'emergency-stop'
    this.state.message = '緊急停止を送信しました。到達と機体の状態を先生が確認してください。'
    this.log('command', 'emergency')
    await new Promise((resolve, reject) => this.commandSocket.send('emergency', 8889, this.ip, error => error ? reject(error) : resolve()))
    return this.snapshot()
  }
  closeSockets() { for (const socket of [this.commandSocket, this.stateSocket]) { try { socket?.close() } catch {} } }
  close() { this.cancel(); this.pending?.reject(new Error('アプリを終了しました。')); clearInterval(this.watchdog); this.closeSockets() }
}
module.exports = { Tello, parseAddress }
