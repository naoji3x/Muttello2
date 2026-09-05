import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { configureStation, readOptions } from '../scripts/tello-station.mjs'

const options = { ssid: 'Dojo', password: 'secret123', ip: '192.168.10.1' }
function fixture(replies) {
  const socket = new EventEmitter()
  const sent = []
  let closed = false
  socket.close = () => { closed = true }
  socket.send = (data, port, address, callback) => {
    sent.push(data.toString())
    callback()
    const reply = replies[sent.length - 1]
    if (reply) queueMicrotask(() => socket.emit('message', Buffer.from(reply), { address, port }))
  }
  return { socket, sent, get closed() { return closed } }
}

test('credentials support environment fallback and argument precedence without leaking invalid values', () => {
  assert.deepEqual(readOptions([], { TELLO_SSID: 'Dojo', TELLO_PASSWORD: 'secret123' }), options)
  assert.equal(readOptions(['--ssid', 'Other'], { TELLO_PASSWORD: 'secret123' }).ssid, 'Other')
  for (const password of ['', 'secret value', 'secret\nvalue', 'secret\0value']) {
    assert.throws(() => readOptions(['--ssid', 'Dojo', '--password', password], {}), /PASSWORDは必須/)
  }
  assert.throws(() => readOptions(['--unknown', 'secret123'], {}), error => !error.message.includes('secret123'))
  assert.throws(() => readOptions(['--tello-ip', 'host'], { TELLO_SSID: 'Dojo', TELLO_PASSWORD: 'secret123' }), /IPv4/)
  assert.deepEqual(readOptions(['--help'], {}), { help: true })
})

test('SDK acknowledgement precedes AP settings and socket closes', async () => {
  const f = fixture(['ok', 'ok'])
  assert.equal(await configureStation(options, { socket: f.socket, timeoutMs: 30 }), 'acknowledged')
  assert.deepEqual(f.sent, ['command', 'ap Dojo secret123'])
  assert.equal(f.closed, true)
})

test('SDK rejection or timeout never sends credentials', async () => {
  for (const reply of ['error', null]) {
    const f = fixture([reply])
    await assert.rejects(configureStation(options, { socket: f.socket, timeoutMs: 20 }))
    assert.deepEqual(f.sent, ['command'])
    assert.equal(f.closed, true)
  }
})

test('AP reboot acknowledgements accept documented spacing, case and trailing NUL', async () => {
  for (const reply of ['OK, drone will reboot in 3s', 'OK,drone will reboot in 3s\0', 'ok, drone will reboot in 3s\0\r\n']) {
    const f = fixture(['ok\0', reply])
    assert.equal(await configureStation(options, { socket: f.socket }), 'rebooting')
    assert.deepEqual(f.sent, ['command', 'ap Dojo secret123'])
    assert.equal(f.closed, true)
  }
})

test('unexpected replies are not reported as rejection or accepted by an ok prefix', async () => {
  const f = fixture(['ok', 'ok but failed secret123\0'])
  await assert.rejects(configureStation(options, { socket: f.socket }), error => {
    assert.match(error.message, /想定外/)
    assert.match(error.message, /ok but failed \[PASSWORD\]/)
    assert.ok(!error.message.includes('secret123'))
    assert.ok(!error.message.includes('\0'))
    return true
  })
  assert.equal(f.closed, true)
})

test('AP timeout is unconfirmed and is not retried; rejection does not echo credentials', async () => {
  const f = fixture(['ok', null])
  assert.equal(await configureStation(options, { socket: f.socket, timeoutMs: 20 }), 'unconfirmed')
  assert.equal(f.sent.length, 2)
  assert.equal(f.closed, true)
  const rejected = fixture(['ok', 'error secret123'])
  await assert.rejects(configureStation(options, { socket: rejected.socket }), error => !error.message.includes('secret123'))
  assert.equal(rejected.closed, true)
})
