const dgram = require('node:dgram')
const { spawn } = require('node:child_process')
const { writeFile } = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

class Video {
  constructor(ip, { socketFactory = () => dgram.createSocket('udp4'), spawnProcess = spawn, decoderPath, timeout = 8000, log = () => {} } = {}) {
    Object.assign(this, { ip, socketFactory, spawnProcess, decoderPath, timeout, log })
    this.buffer = Buffer.alloc(0)
  }
  async start() {
    if (this.socket) return
    this.error = null
    this.packets = 0; this.sequence = 0; this.stderr = ''
    const executable = this.decoderPath || require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked')
    // Preserve the initial SPS/IDR during probing. Sample by frame count, not
    // timestamps: raw drone H.264 timing metadata need not match arrival rate.
    const child = this.child = this.spawnProcess(executable, ['-loglevel', 'error', '-flags', 'low_delay', '-probesize', '2048', '-analyzeduration', '1', '-fpsprobesize', '0', '-f', 'h264', '-i', 'pipe:0', '-vf', "select='not(mod(n,3))',scale=640:-2,settb=expr=1/10,setpts=N", '-fps_mode', 'passthrough', '-enc_time_base', '1:10', '-c:v', 'mjpeg', '-f', 'image2pipe', '-flush_packets', '1', 'pipe:1'], { windowsHide: true })
    const fail = error => { if (this.child === child) { this.error = new Error(`カメラ: ${error.message}`); this.stop() } }
    child.on('error', fail)
    child.on('exit', () => fail(new Error('映像デコーダーが終了しました。')))
    child.stdin.on('error', fail)
    child.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk.toString()).slice(-2000) })
    child.stdout.on('data', chunk => { if (this.child === child) this.decode(chunk) })
    const socket = this.socket = this.socketFactory()
    socket.on('message', (data, remote) => {
      if (this.socket !== socket || remote.address !== this.ip) return
      this.packets++
      if (child.stdin.writableLength > 2 * 1024 * 1024) { fail(new Error('映像の処理が追いつきません。')); return }
      child.stdin.write(data)
    })
    socket.on('error', fail)
    try {
      await new Promise((resolve, reject) => {
        socket.once('error', reject)
        socket.once('close', () => reject(new Error('カメラ受信を終了しました。')))
        socket.bind({ port: 11111, address: '0.0.0.0', exclusive: true }, resolve)
      })
      if (this.error) throw this.error
    } catch (error) { this.stop(); throw error }
  }
  decode(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    if (this.buffer.length > 4 * 1024 * 1024) { this.error = new Error('映像フレームが大きすぎます。'); this.stop(); return }
    while (true) {
      const start = this.buffer.indexOf(Buffer.from([255, 216]))
      if (start < 0) { this.buffer = this.buffer.subarray(-1); return }
      const end = this.buffer.indexOf(Buffer.from([255, 217]), start + 2)
      if (end < 0) { this.buffer = this.buffer.subarray(start); return }
      this.frame = Buffer.from(this.buffer.subarray(start, end + 2))
      this.frameTime = Date.now()
      this.sequence = (this.sequence || 0) + 1
      this.buffer = this.buffer.subarray(end + 2)
    }
  }
  async nextFrame(cancelled = () => false, { allowRecent = false } = {}) {
    const sequence = this.sequence
    const deadline = Date.now() + this.timeout
    while (Date.now() < deadline) {
      if (cancelled()) throw new Error('撮影を中止しました。')
      if (this.error) throw this.error
      if (!this.socket) throw new Error('カメラがOFFです。')
      if (this.frame && (this.sequence !== sequence || (allowRecent && Date.now() - this.frameTime < 2000))) return Buffer.from(this.frame)
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    this.log('video-timeout', { packets: this.packets, frames: this.sequence, stderr: this.stderr })
    throw new Error(this.packets ? '映像データは届いていますが、新しい画像に変換できません。カメラをOFFにしてからONにしてください。' : 'カメラ映像を受信できません。Wi-FiとUDP 11111を確認してください。')
  }
  preview() { return this.frame && Date.now() - this.frameTime < 2000 ? `data:image/jpeg;base64,${this.frame.toString('base64')}` : null }
  async capture(folder, cancelled) {
    const frame = await this.nextFrame(cancelled)
    const name = `tello-${Date.now()}-${randomUUID()}.jpg`
    await writeFile(path.join(folder, name), frame, { flag: 'wx' })
    return { name, url: `data:image/jpeg;base64,${frame.toString('base64')}` }
  }
  stop() {
    const socket = this.socket, child = this.child
    this.socket = null; this.child = null; this.frame = null; this.buffer = Buffer.alloc(0)
    try { socket?.close() } catch {}
    child?.kill()
  }
}
module.exports = { Video }
