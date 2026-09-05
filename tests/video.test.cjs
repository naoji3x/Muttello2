const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const { mkdtemp, readFile, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { Video } = require('../electron/video.cjs')
const ffmpeg = require('ffmpeg-static')

test('real H.264 decoder yields a preview frame without recording a video file', async () => {
  const encoded = spawnSync(ffmpeg, ['-f', 'lavfi', '-i', 'testsrc=size=64x48:rate=30', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-g', '30', '-pix_fmt', 'yuv420p', '-f', 'h264', 'pipe:1'])
  assert.equal(encoded.status, 0, encoded.stderr.toString())
  const socket = new EventEmitter()
  socket.bind = (_options, callback) => callback()
  socket.close = () => socket.emit('close')
  const video = new Video('192.168.1.42', { socketFactory: () => socket, timeout: 5000 })
  try {
    await video.start()
    const waiting = video.nextFrame()
    socket.emit('message', encoded.stdout, { address: '192.168.1.42' })
    const feeding = setInterval(() => socket.emit('message', encoded.stdout, { address: '192.168.1.42' }), 50)
    waiting.finally(() => clearInterval(feeding)).catch(() => {})
    const frame = await waiting
    assert.equal(frame[0], 255); assert.equal(frame[1], 216)
  } finally { video.stop() }
})

test('decoded JPEG fixture survives split frames and saves a fresh snapshot', async () => {
  const generated = spawnSync(ffmpeg, ['-f', 'lavfi', '-i', 'color=c=blue:s=64x48', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1'])
  assert.equal(generated.status, 0)
  const jpeg = generated.stdout
  const video = new Video('192.168.1.42', { timeout: 100 })
  video.socket = { close() {} }
  video.decode(jpeg.subarray(0, 7)); assert.equal(video.frame, undefined)
  video.decode(jpeg.subarray(7)); assert.deepEqual(video.frame, jpeg)
  const folder = await mkdtemp(path.join(tmpdir(), 'muttello-photo-'))
  try {
    const saving = video.capture(folder)
    setTimeout(() => video.decode(jpeg), 10)
    const photo = await saving
    assert.deepEqual(await readFile(path.join(folder, photo.name)), jpeg)
    assert.ok(photo.url.startsWith('data:image/jpeg;base64,'))
    await assert.rejects(video.nextFrame(), /受信できません/)
    await assert.rejects(video.nextFrame(() => true), /中止/)
  } finally { video.stop(); await rm(folder, { recursive: true, force: true }) }
})

test('video filters foreign UDP packets, binds 11111, and tears down decoder', async () => {
  const socket = new EventEmitter()
  socket.bind = (options, callback) => { assert.equal(options.port, 11111); callback() }
  socket.close = () => { socket.closed = true; socket.emit('close') }
  const child = new EventEmitter()
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough()
  child.kill = () => { child.killed = true }
  const video = new Video('192.168.1.42', { socketFactory: () => socket, spawnProcess: () => child, decoderPath: 'fixture' })
  await video.start()
  socket.emit('message', Buffer.from('foreign'), { address: '1.2.3.4' })
  assert.equal(child.stdin.read(), null)
  socket.emit('message', Buffer.from('accepted'), { address: '192.168.1.42' })
  assert.equal(child.stdin.read().toString(), 'accepted')
  video.stop(); assert.ok(socket.closed); assert.ok(child.killed)
})
