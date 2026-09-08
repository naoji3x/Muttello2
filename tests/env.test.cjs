const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { readTelloEnv } = require('../shared/env.cjs')
const { parseAddress } = require('../electron/tello.cjs')

test('.env is optional and environment overrides file without mutating process.env', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'muttello-env-'))
  try {
    assert.equal(readTelloEnv(directory, {}).TELLO_IP, undefined)
    writeFileSync(join(directory, '.env'), 'TELLO_IP=192.168.1.42\nTELLO_SSID=Dojo\nTELLO_PASSWORD="secret#123"\nUNRELATED=value\n')
    const before = process.env.TELLO_PASSWORD
    const settings = readTelloEnv(directory, { TELLO_SSID: 'Override' })
    assert.deepEqual(settings, { TELLO_IP: '192.168.1.42', TELLO_SSID: 'Override', TELLO_PASSWORD: 'secret#123' })
    assert.equal(process.env.TELLO_PASSWORD, before)
    assert.equal(parseAddress([], settings), '192.168.1.42')
    assert.equal(parseAddress(['--tello-ip', '192.168.10.1'], settings), '192.168.10.1')
    const { readOptions } = await import('../scripts/tello-station.mjs')
    assert.deepEqual(readOptions([], settings), { ip: '192.168.10.1', ssid: 'Override', password: 'secret#123' })
    assert.equal(readOptions(['--tello-ip', '192.168.10.1', '--password', 'other123'], settings).ip, '192.168.10.1')
    assert.equal(readOptions(['--password', 'other123'], settings).password, 'other123')
    assert.equal(readTelloEnv(directory, { TELLO_IP: '' }).TELLO_IP, '')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('IP environment validation and explicit invalid arguments do not fall back', () => {
  assert.equal(parseAddress([], {}), null)
  assert.equal(parseAddress([], { TELLO_IP: '' }), null)
  assert.throws(() => parseAddress([], { TELLO_IP: 'host' }), /IPv4/)
  assert.throws(() => parseAddress(['--tello-ip'], { TELLO_IP: '192.168.1.42' }), /IPv4/)
})
