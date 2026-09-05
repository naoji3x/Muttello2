const dgram = require('node:dgram')
const { isIPv4 } = require('node:net')

function parseAddress(args, env = process.env) {
  const positions = args.flatMap((arg, i) => arg === '--tello-ip' ? [i] : [])
  if (!positions.length) {
    if (!env.TELLO_IP) return null
    if (!isIPv4(env.TELLO_IP)) throw new Error('TELLO_IP にIPv4アドレスを指定してください。')
    return env.TELLO_IP
  }
  const ip = args[positions[0] + 1]
  if (positions.length !== 1 || !ip || !isIPv4(ip)) throw new Error('--tello-ip にIPv4アドレスを1つ指定してください。')
  return ip
}

class Tello {
  constructor(ip, validate, { socketFactory = () => dgram.createSocket('udp4'), timeout = 15000, staleMs = 3000, connectTimeout = 5000, connectAttempts = 3, retryDelay = 1000, log = () => {} } = {}) {
    Object.assign(this, { ip, validate, socketFactory, timeout, staleMs, connectTimeout, connectAttempts, retryDelay, log })
    this.state = { configured: !!ip, connected: false, flight: 'unknown', execution: 'idle', battery: null, height: null, lastTelemetry: null, message: '', activeStep: -1 }
    this.watchdog = setInterval(() => {
      if (this.state.connected && !this.fresh()) this.fail('状態データが途絶えました。機体の状態は不明です。')
    }, 250)
    this.watchdog.unref?.()
  }
  snapshot() { return { ...this.state, cameraOn: !!this.cameraOn, cameraError: this.video?.error?.message || '', photoFolder: this.photoFolder || '' } }
  fresh() { return this.state.lastTelemetry !== null && Date.now() - this.state.lastTelemetry < this.staleMs }
  fail(message) {
    this.video?.stop()
    this.cameraOn = false
    if (this.connecting) this.connectionError = new Error(message)
    this.cancelled = true
    this.state.connected = false
    this.state.flight = 'unknown'
    if (this.state.execution !== 'emergency-stop') this.state.execution = this.flightCommandsSent || this.state.execution === 'uncertain' ? 'uncertain' : 'idle'
    this.state.message = message
    this.pending?.reject(new Error(message))
    this.log('failure', message)
  }
  async connect() {
    if (!this.ip) throw new Error('--tello-ip または .env の TELLO_IP を指定してください。')
    if (this.closed || ['uncertain', 'emergency-stop'].includes(this.state.execution) || this.state.flight === 'airborne' || this.busy || this.landing || this.connecting) throw new Error('機体を確認し、着陸後にアプリを再起動してください。')
    if (this.state.connected) return this.snapshot()
    this.connecting = true
    try {
      for (let attempt = 1; attempt <= this.connectAttempts; attempt++) {
        if (this.closed || ['uncertain', 'emergency-stop'].includes(this.state.execution)) throw new Error('接続を中止しました。')
        this.log('connect-attempt', { attempt, max: this.connectAttempts })
        try { return await this.connectAttempt() }
        catch (error) {
          if (error.code !== 'SDK_TIMEOUT' || this.closed || ['uncertain', 'emergency-stop'].includes(this.state.execution)) throw error
          if (attempt === this.connectAttempts) throw new Error(`SDKの応答がありません。${attempt}回接続を試しました。機体の電源・IP・Wi-Fi接続を確認してください。`)
          this.state.message = `機体の応答を待っています。接続を再試行します（${attempt + 1}/${this.connectAttempts}）。`
          await new Promise(resolve => setTimeout(resolve, this.retryDelay))
        }
      }
    } catch (error) {
      if (this.state.execution !== 'emergency-stop') this.state.message = error.message
      throw error
    } finally { this.connecting = false }
  }
  async connectAttempt() {
    this.connectionError = null
    try {
      await this.closeSockets()
      if (this.closed) throw new Error('アプリを終了しました。')
      Object.assign(this.state, { connected: false, battery: null, height: null, lastTelemetry: null, flight: 'unknown', activeStep: -1, message: '接続しています。' })
      this.commandSocket = this.socketFactory(); this.stateSocket = this.socketFactory()
      const commandSocket = this.commandSocket, stateSocket = this.stateSocket
      this.commandSocket.on('message', (data, remote) => {
        if (this.commandSocket !== commandSocket) return
        if (remote.address !== this.ip || remote.port !== 8889) return
        const reply = data.toString().replace(/[\0\s]+$/u, '').trim().toLowerCase()
        this.log('response', reply)
        if (reply === 'ok') this.pending?.resolve()
        else this.pending?.reject(new Error(`機体の応答: ${reply}`))
      })
      this.stateSocket.on('message', (data, remote) => {
        if (this.stateSocket !== stateSocket) return
        if (remote.address !== this.ip) return
        const values = Object.fromEntries(data.toString().trim().split(';').filter(Boolean).map(field => field.split(':')))
        const battery = Number(values.bat), height = Number(values.h)
        if (!/^\d+$/.test(values.bat || '') || !/^\d+$/.test(values.h || '') || battery > 100 || height > 10000) return
        Object.assign(this.state, { battery, height, lastTelemetry: Date.now() })
      })
      for (const socket of [commandSocket, stateSocket]) socket.on('error', error => {
        if (socket === this.commandSocket || socket === this.stateSocket) this.fail(`UDP通信エラー: ${error.message}`)
      })
      // Let both binds settle before cleanup, including when just one port is busy.
      const binds = await Promise.allSettled([this.bind(commandSocket, 0), this.bind(stateSocket, 8890)])
      const failed = binds.find(result => result.status === 'rejected')
      if (failed) throw new Error(`UDP初期化に失敗しました: ${failed.reason.message}。ほかのTelloアプリを終了して再接続してください。`)
      if (this.closed || this.commandSocket !== commandSocket) throw new Error('接続を中止しました。')
      if (this.connectionError) throw this.connectionError
      await this.command('command')
      const deadline = Date.now() + this.staleMs
      while (!this.closed && !this.connectionError && !this.fresh() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
      if (this.connectionError) throw this.connectionError
      if (this.closed || this.commandSocket !== commandSocket || this.state.execution === 'emergency-stop') throw new Error('接続を中止しました。')
      if (!this.fresh() || this.state.execution === 'uncertain') throw new Error('状態データを受信できません。Wi-Fiとファイアウォールを確認してください。')
      if (this.state.height > 10) { this.flightCommandsSent = true; throw new Error('機体を地面に置いてから接続してください。') }
      Object.assign(this.state, { connected: true, flight: 'grounded', message: '接続しました。' })
      return this.snapshot()
    } catch (error) {
      if (this.state.execution !== 'emergency-stop') this.fail(error.message)
      await this.closeSockets()
      throw error
    }
  }
  bind(socket, port) {
    return new Promise((resolve, reject) => {
      const cleanup = () => { socket.removeListener('listening', onReady); socket.removeListener('error', onError); socket.removeListener('close', onClose) }
      const onError = error => { cleanup(); reject(error) }
      const onClose = () => onError(new Error('UDPソケットが閉じられました。'))
      const onReady = () => { cleanup(); this.log('udp-bound', { port, address: socket.address?.() }); resolve() }
      socket.once('error', onError); socket.once('listening', onReady); socket.once('close', onClose)
      try { socket.bind({ port, address: '0.0.0.0', exclusive: true }) } catch (error) { onError(error) }
    })
  }
  command(command) {
    if (this.pending) return Promise.reject(new Error('別のコマンドの応答を待っています。'))
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = error => { if (settled) return; settled = true; clearTimeout(timer); this.pending = null; error ? reject(error) : resolve() }
      const timer = setTimeout(() => {
        if (command === 'command') finish(Object.assign(new Error('SDKの応答がありません。'), { code: 'SDK_TIMEOUT' }))
        else this.fail('応答がありません。再送せず停止しました。機体を確認してください。')
      }, command === 'command' ? this.connectTimeout : this.timeout)
      this.pending = { resolve: () => finish(), reject: finish }
      this.log('command', command)
      if (/^(takeoff|land|forward|back|left|right|up|down|cw|ccw)( |$)/.test(command)) this.flightCommandsSent = true
      const onError = error => { if (error && !settled) this.fail(error.message) }
      try { this.commandSocket.send(command, 8889, this.ip, onError) } catch (error) { onError(error) }
    })
  }
  async run(program) {
    if (this.busy || this.cameraBusy || this.landing || !this.state.connected || !this.fresh() || this.state.flight !== 'grounded' || this.state.height > 10) throw new Error('接続と着陸状態を確認してください。')
    if (this.state.battery < 30) throw new Error('バッテリーを30%以上にしてください。')
    const errors = this.validate(program)
    if (errors.length) throw new Error(errors.join('\n'))
    if (program.steps.some(step => step.type === 'photo') && (!this.video || !this.photoFolder)) throw new Error('写真の保存先を選んでください。')
    this.busy = true; this.cancelled = false; this.state.execution = 'running'
    const deadline = setTimeout(() => this.fail('実行が60秒を超えました。機体を確認してください。'), 60000)
    try {
      // Explicit speed makes the duration estimate independent of previous SDK sessions.
      await this.command('speed 20')
      for (const [index, step] of program.steps.entries()) {
        if (this.cancelled) break
        if (!this.fresh() || !this.state.connected) throw new Error('接続が失われました。')
        this.state.activeStep = index
        if (step.type === 'wait') {
          const until = Date.now() + step.milliseconds
          while (!this.cancelled && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20))
          continue
        }
        if (step.type === 'message') { this.state.message = step.text; continue }
        if (step.type === 'photo') {
          await this.startCamera()
          const photo = await this.video.capture(this.photoFolder, () => this.cancelled)
          this.onPhoto?.(photo)
          continue
        }
        const command = step.type === 'move' ? `${step.direction} ${step.distance}` : step.type === 'turn' ? `${step.direction === 'right' ? 'cw' : 'ccw'} ${step.degrees}` : step.type
        if (step.type === 'takeoff') this.state.flight = 'taking-off'
        if (step.type === 'land') this.state.flight = 'landing'
        await this.command(command)
        if (this.state.execution === 'uncertain' || this.state.execution === 'emergency-stop') break
        if (step.type === 'takeoff') this.state.flight = 'airborne'
        if (step.type === 'land') {
          this.state.flight = 'grounded'
          this.flightCommandsSent = false
        }
      }
      if (this.state.execution === 'running') this.state.execution = this.cancelled ? 'cancelled' : 'complete'
    } catch (error) {
      if (this.cancelled && this.state.execution === 'cancelled') this.state.message = 'プログラムを中止しました。着陸は別操作です。'
      else { if (this.state.execution !== 'emergency-stop') this.fail(error.message); throw error }
    } finally {
      clearTimeout(deadline)
      if (!this.previewRequested) await this.stopCamera()
      this.busy = false
    }
    return this.snapshot()
  }
  cancel() { this.cancelled = true; if (this.state.execution === 'running') this.state.execution = 'cancelled'; return this.snapshot() }
  async startCamera() {
    if (this.cameraOn) return
    await this.video.start()
    try { await this.command('streamon'); this.cameraOn = true; await this.video.nextFrame(() => this.closed || !this.state.connected || (this.busy && this.cancelled)) }
    catch (error) { await this.stopCamera(); throw error }
  }
  async stopCamera() {
    const active = this.cameraOn
    this.cameraOn = false
    this.video?.stop()
    if (active && this.state.connected && !this.pending) {
      try { await this.command('streamoff') } catch (error) { this.fail(error.message) }
    }
  }
  async setCamera(enabled) {
    if (typeof enabled !== 'boolean' || !this.video || !this.state.connected || this.busy || this.landing || this.cameraBusy || this.pending) throw new Error('実行が終わってからカメラを操作してください。')
    this.cameraBusy = true
    this.previewRequested = enabled
    try { if (enabled) await this.startCamera(); else await this.stopCamera() }
    catch (error) { this.previewRequested = false; throw error }
    finally { this.cameraBusy = false }
    return this.snapshot()
  }
  async land() {
    this.cancel()
    if (!this.state.connected || this.state.execution === 'uncertain' || this.landing) throw new Error('通信状態が不明です。機体を確認してください。')
    this.landing = true
    try {
      while (this.busy || this.cameraBusy) await new Promise(resolve => setTimeout(resolve, 20))
      if (!this.state.connected) throw new Error('通信状態が不明です。')
      this.state.flight = 'landing'
      await this.command('land')
      this.state.flight = 'grounded'; this.state.execution = 'landed'
      this.flightCommandsSent = false
    } catch (error) { this.fail(error.message); throw error }
    finally { this.landing = false }
    return this.snapshot()
  }
  async emergency() {
    this.video?.stop(); this.cameraOn = false
    if (!this.commandSocket || !this.ip) throw new Error('通信ソケットがありません。')
    this.cancel()
    this.pending?.reject(new Error('緊急停止しました。'))
    this.state.connected = false; this.state.flight = 'unknown'; this.state.execution = 'emergency-stop'
    this.state.message = '緊急停止を送信しました。到達と機体の状態を先生が確認してください。'
    this.log('command', 'emergency')
    await new Promise((resolve, reject) => this.commandSocket.send('emergency', 8889, this.ip, error => error ? reject(error) : resolve()))
    return this.snapshot()
  }
  closeSockets() {
    const sockets = [this.commandSocket, this.stateSocket].filter(Boolean)
    this.commandSocket = null; this.stateSocket = null
    const previous = this.closingSockets
    this.closingSockets = Promise.all([previous, ...sockets.map(socket => new Promise(resolve => {
      try { socket.close(resolve) } catch { resolve() }
    }))])
    return this.closingSockets
  }
  close() { this.video?.stop(); this.closed = true; this.cancel(); this.pending?.reject(new Error('アプリを終了しました。')); clearInterval(this.watchdog); return this.closeSockets() }
}
module.exports = { Tello, parseAddress }
