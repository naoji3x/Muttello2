const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Tello, parseAddress } = require('../electron/tello.cjs')
const program = { version: 1, steps: [{ type: 'takeoff' }, { type: 'move', direction: 'forward', distance: 50 }, { type: 'land' }] }
async function fixture(replies = {}) {
  const { validateProgram } = await import('../shared/safety.js')
  const commands = [], sockets = []
  const tello = new Tello('192.168.1.42', validateProgram, { timeout: 30, staleMs: 500, socketFactory: () => {
    const socket = new EventEmitter()
    socket.bind = () => queueMicrotask(() => socket.emit('listening'))
    socket.close = callback => { queueMicrotask(() => { socket.emit('close'); callback?.() }) }
    socket.send = (command, port, ip, callback) => {
      commands.push(command); callback?.()
      if (command === 'command') queueMicrotask(() => tello.stateSocket?.emit('message', Buffer.from('bat:80;h:0;'), { address: ip }))
      if (replies[command] !== null) setTimeout(() => socket.emit('message', Buffer.from(replies[command] || 'ok'), { address: ip, port }), 2)
    }
    sockets.push(socket); return socket
  } })
  await tello.connect()
  return { tello, commands, sockets }
}
test('startup endpoint rejects missing, repeated and non IPv4 values', () => {
  assert.equal(parseAddress([]), null)
  assert.equal(parseAddress(['--tello-ip', '192.168.1.42']), '192.168.1.42')
  for (const args of [['--tello-ip'], ['--tello-ip', 'host'], ['--tello-ip', '1.2.3.4', '--tello-ip', '1.2.3.5']]) assert.throws(() => parseAddress(args))
})
test('validated flight commands are serialized', async () => {
  const { tello, commands } = await fixture()
  try { await tello.run(program); assert.deepEqual(commands, ['command', 'speed 20', 'takeoff', 'forward 50', 'land']); assert.equal(tello.state.flight, 'grounded') } finally { tello.close() }
})
test('timeout is never retried and stops unsent movement', async () => {
  const { tello, commands } = await fixture({ takeoff: null })
  try { await assert.rejects(tello.run(program)); assert.equal(tello.state.execution, 'uncertain'); assert.deepEqual(commands, ['command', 'speed 20', 'takeoff']); await assert.rejects(tello.connect()) } finally { tello.close() }
})
test('SDK error stops the queue', async () => {
  const { tello, commands } = await fixture({ takeoff: 'error' })
  try { await assert.rejects(tello.run(program)); assert.equal(commands.includes('forward 50'), false) } finally { tello.close() }
})
test('foreign response and telemetry cannot authorize flight', async () => {
  const { tello, sockets } = await fixture({ takeoff: null })
  try {
    sockets[1].emit('message', Buffer.from('bat:99;h:90;'), { address: '1.2.3.4' })
    assert.equal(tello.state.height, 0)
    const run = tello.run(program)
    setTimeout(() => sockets[0].emit('message', Buffer.from('ok'), { address: '1.2.3.4', port: 8889 }), 10)
    await assert.rejects(run)
  } finally { tello.close() }
})
test('cancel discards future commands without landing automatically', async () => {
  const { tello, commands } = await fixture()
  try {
    const run = tello.run(program); tello.cancel(); await run
    assert.deepEqual(commands, ['command', 'speed 20']); assert.equal(tello.state.execution, 'cancelled')
  } finally { tello.close() }
})
test('battery, telemetry and unsupported photos reject before takeoff', async () => {
  const { tello, commands } = await fixture()
  try {
    tello.state.battery = 20; await assert.rejects(tello.run(program))
    tello.state.battery = 80; tello.state.lastTelemetry = 0; await assert.rejects(tello.run(program))
    tello.state.lastTelemetry = Date.now()
    await assert.rejects(tello.run({ version: 1, steps: [{ type: 'takeoff' }, { type: 'photo' }, { type: 'land' }] }))
    assert.deepEqual(commands, ['command'])
  } finally { tello.close() }
})
test('connection loss rejects in-flight command and clears queue', async () => {
  const { tello, commands } = await fixture({ takeoff: null })
  try {
    const run = tello.run(program)
    setTimeout(() => tello.fail('接続断'), 10)
    await assert.rejects(run)
    assert.equal(commands.includes('forward 50'), false)
  } finally { tello.close() }
})
test('safety rejects malformed, vertical and radial limit violations', async () => {
  const { validateProgram } = await import('../shared/safety.js')
  assert.deepEqual(validateProgram(program), [])
  const invalid = [null, { version: 2, steps: [] }, { version: 1, steps: [{ type: 'land' }] }, ...[
    [{ type: 'move', direction: 'up', distance: 200 }],
    [{ type: 'move', direction: 'forward', distance: 400 }, { type: 'move', direction: 'right', distance: 400 }],
    [{ type: 'move', direction: 'forward;emergency', distance: 50 }],
    [{ type: 'turn', direction: 'left', degrees: NaN }],
  ].map(steps => ({ version: 1, steps: [{ type: 'takeoff' }, ...steps, { type: 'land' }] }))]
  for (const item of invalid) assert.ok(validateProgram(item).length)
})
test('landing waits for the current command and cancels remaining steps', async () => {
  const { tello, commands } = await fixture()
  try {
    const run = tello.run(program)
    const landing = tello.land()
    await Promise.all([run, landing])
    assert.deepEqual(commands, ['command', 'speed 20', 'land'])
    assert.equal(tello.state.execution, 'landed')
  } finally { tello.close() }
})
test('emergency interrupts a pending command and prevents reconnection', async () => {
  const { tello, commands } = await fixture({ takeoff: null })
  try {
    const run = tello.run(program)
    const rejected = assert.rejects(run)
    await new Promise(resolve => setTimeout(resolve, 10))
    await tello.emergency(); await rejected
    assert.equal(commands.at(-1), 'emergency')
    assert.equal(commands.includes('forward 50'), false)
    assert.equal(tello.state.execution, 'emergency-stop')
    await assert.rejects(tello.connect())
  } finally { tello.close() }
})

test('normal landing permits reconnection after telemetry stops on power off', async () => {
  for (const manual of [false, true]) {
    const { tello, commands } = await fixture()
    try {
      await tello.run(program)
      if (manual) await tello.land()
      tello.state.lastTelemetry = 0
      // Exercise the real watchdog, rather than calling fail directly.
      await new Promise(resolve => setTimeout(resolve, 300))
      assert.equal(tello.state.connected, false)
      assert.equal(tello.state.execution, 'idle')
      const result = await tello.connect()
      assert.equal(result.connected, true)
      assert.equal(result.flight, 'grounded')
      assert.equal(commands.at(-1), 'command')
    } finally { await tello.close() }
  }
})

test('failed landing still blocks reconnection', async () => {
  for (const manual of [false, true]) {
    const { tello } = await fixture({ land: null })
    try {
      await assert.rejects(manual ? tello.land() : tello.run(program))
      assert.equal(tello.state.execution, 'uncertain')
      await assert.rejects(tello.connect())
    } finally { await tello.close() }
  }
})

test('a new takeoff after a successful landing restores the reconnection lock', async () => {
  const replies = {}
  const { tello } = await fixture(replies)
  try {
    await tello.run(program)
    replies.takeoff = null
    await assert.rejects(tello.run(program))
    assert.equal(tello.state.execution, 'uncertain')
    await assert.rejects(tello.connect())
  } finally { await tello.close() }
})

function connectionFixture(options = {}) {
  const sockets = [], commands = [], events = []
  const behavior = { reply: 'ok', telemetry: true, bindError: false }
  const tello = new Tello('192.168.1.42', () => [], { timeout: 30, staleMs: 60, connectTimeout: 30, connectAttempts: 1, retryDelay: 1, ...options, socketFactory: () => {
    const socket = new EventEmitter()
    const index = sockets.length
    socket.bind = options => {
      socket.options = options
      setTimeout(() => {
        if (behavior.bindError && options.port === 8890) socket.emit('error', new Error('EADDRINUSE'))
        else { socket.ready = true; events.push(`bind:${index}`); socket.emit('listening') }
      }, options.port === 8890 ? 1 : 5)
    }
    socket.close = callback => setTimeout(() => {
      socket.closed = true; events.push(`close:${index}`); socket.emit('close'); callback?.()
    }, 5)
    socket.send = (command, port, address, callback) => {
      assert.ok(socket.ready && sockets[index + 1].ready, 'both sockets must bind before SDK entry')
      commands.push(command); callback?.()
      if (behavior.telemetry) sockets[index + 1].emit('message', Buffer.from('bat:80;h:0;'), { address })
      const reply = typeof behavior.reply === 'function' ? behavior.reply(commands.length) : behavior.reply
      if (reply) queueMicrotask(() => socket.emit('message', Buffer.from(reply), { address, port }))
    }
    sockets.push(socket); return socket
  } })
  return { tello, sockets, commands, events, behavior }
}

test('failed initial handshake closes both sockets and can reconnect with a fresh SDK handshake', async () => {
  const { tello, sockets, behavior, commands, events } = connectionFixture()
  try {
    behavior.reply = null
    await assert.rejects(tello.connect(), /応答がありません/)
    assert.equal(tello.state.execution, 'idle')
    assert.ok(sockets.every(socket => socket.closed))
    behavior.reply = 'OK\0'
    await tello.connect()
    assert.deepEqual(commands, ['command', 'command'])
    assert.equal(tello.state.connected, true)
    assert.ok(events.indexOf('close:0') < events.indexOf('bind:2'))
    assert.ok(events.indexOf('close:1') < events.indexOf('bind:2'))
    assert.deepEqual(sockets[3].options, { port: 8890, address: '0.0.0.0', exclusive: true })
    sockets[1].emit('message', Buffer.from('bat:1;h:900;'), { address: tello.ip })
    sockets[0].emit('error', new Error('late error'))
    assert.equal(tello.state.height, 0)
    assert.equal(tello.state.connected, true)
  } finally { await tello.close() }
})

test('port binding failure waits for the other bind and releases ports before retry', async () => {
  const { tello, sockets, behavior, commands } = connectionFixture()
  try {
    behavior.bindError = true
    await assert.rejects(tello.connect(), /EADDRINUSE/)
    assert.deepEqual(commands, [])
    assert.ok(sockets.every(socket => socket.closed))
    behavior.bindError = false
    await tello.connect()
    assert.equal(tello.state.connected, true)
  } finally { await tello.close() }
})

test('previous telemetry cannot satisfy a new connection and concurrent connects cannot create extra sockets', async () => {
  const { tello, sockets, behavior } = connectionFixture()
  try {
    await tello.connect()
    tello.fail('接続断')
    behavior.telemetry = false
    const retry = tello.connect()
    await assert.rejects(tello.connect())
    await assert.rejects(retry, /状態データ/)
    assert.equal(sockets.length, 4)
    assert.equal(tello.state.lastTelemetry, null)
    assert.equal(tello.state.connected, false)
  } finally { await tello.close() }
})

test('closing during bind cancels connection without sending SDK commands', async () => {
  const { tello, commands } = connectionFixture()
  const connecting = tello.connect()
  const rejected = assert.rejects(connecting)
  await new Promise(resolve => setTimeout(resolve, 1))
  await tello.close()
  await rejected
  assert.deepEqual(commands, [])
  assert.equal(tello.state.connected, false)
})

test('one connect call retries a lost SDK response on new sockets', async () => {
  const { tello, behavior, commands, sockets, events } = connectionFixture({ connectAttempts: 3 })
  try {
    behavior.reply = attempt => attempt === 1 ? null : 'ok'
    assert.equal((await tello.connect()).connected, true)
    assert.deepEqual(commands, ['command', 'command'])
    assert.equal(sockets.length, 4)
    assert.ok(events.indexOf('close:1') < events.indexOf('bind:2'))
  } finally { await tello.close() }
})

test('SDK retries stop at the configured limit and expose the final failure', async () => {
  const { tello, behavior, commands, sockets } = connectionFixture({ connectAttempts: 3 })
  try {
    behavior.reply = null
    await assert.rejects(tello.connect(), /3回接続を試しました/)
    assert.deepEqual(commands, ['command', 'command', 'command'])
    assert.ok(sockets.every(socket => socket.closed))
    assert.equal(tello.connecting, false)
    assert.equal(tello.state.connected, false)
    assert.match(tello.state.message, /3回/)
  } finally { await tello.close() }
})

test('explicit SDK rejection is not retried', async () => {
  const { tello, behavior, commands } = connectionFixture({ connectAttempts: 3 })
  try {
    behavior.reply = 'error'
    await assert.rejects(tello.connect(), /機体の応答/)
    assert.deepEqual(commands, ['command'])
  } finally { await tello.close() }
})

test('closing during retry delay prevents another SDK send', async () => {
  const { tello, behavior, commands } = connectionFixture({ connectAttempts: 3, retryDelay: 100 })
  behavior.reply = null
  const rejected = assert.rejects(tello.connect(), /接続を中止/)
  try {
    for (let i = 0; i < 100 && !tello.state.message.includes('再試行'); i++) await new Promise(resolve => setTimeout(resolve, 5))
    assert.match(tello.state.message, /再試行/)
    await assert.rejects(tello.connect())
    await tello.close()
    await rejected
    assert.deepEqual(commands, ['command'])
  } finally { await tello.close() }
})
