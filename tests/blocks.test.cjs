const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const vm = require('node:vm')
const { stripTypeScriptTypes } = require('node:module')
const Blockly = require('blockly')
const source = readFileSync(require.resolve('../src/blocks.ts'), 'utf8')
const output = stripTypeScriptTypes(source).replace("import * as Blockly from 'blockly'", "const Blockly = require('blockly')").replace(/export /g, '') + '\nObject.assign(exports, { registerBlocks, extractSteps })'
const exportsObject = {}
vm.runInNewContext(output, { exports: exportsObject, require })
exportsObject.registerBlocks()

test('repeat compiles nested bodies for the same safety gate and workspace round trips', async () => {
  const { validateProgram } = await import('../shared/safety.js')
  const workspace = new Blockly.Workspace()
  try {
    const start = workspace.newBlock('tello_start'), takeoff = workspace.newBlock('tello_takeoff'), repeat = workspace.newBlock('tello_repeat'), move = workspace.newBlock('tello_move'), wait = workspace.newBlock('tello_wait'), land = workspace.newBlock('tello_land')
    start.nextConnection.connect(takeoff.previousConnection)
    takeoff.nextConnection.connect(repeat.previousConnection)
    repeat.nextConnection.connect(land.previousConnection)
    repeat.getInput('DO').connection.connect(move.previousConnection)
    move.nextConnection.connect(wait.previousConnection)
    const steps = exportsObject.extractSteps(workspace)
    assert.equal(steps.length, 6)
    assert.equal(steps[2].type, 'wait')
    assert.deepEqual(validateProgram({ version: 1, steps }), [])
    const saved = Blockly.serialization.workspaces.save(workspace)
    workspace.clear(); Blockly.serialization.workspaces.load(saved, workspace)
    assert.equal(JSON.stringify(exportsObject.extractSteps(workspace)), JSON.stringify(steps))
    workspace.newBlock('tello_photo')
    assert.throws(() => exportsObject.extractSteps(workspace), /すべてのブロック/)
  } finally { workspace.dispose() }
})

test('wait and message validation cannot inject SDK commands or bypass duration limit', async () => {
  const { validateProgram } = await import('../shared/safety.js')
  for (const middle of [[{ type: 'wait', milliseconds: -1 }], [{ type: 'message', text: 42 }], [{ type: 'wait', milliseconds: 30000 }, { type: 'wait', milliseconds: 30000 }]]) {
    assert.ok(validateProgram({ version: 1, steps: [{ type: 'takeoff' }, ...middle, { type: 'land' }] }).length)
  }
})

test('fixed movement blocks compile to safe speed and flight commands', async () => {
  const { validateProgram } = await import('../shared/safety.js')
  const workspace = new Blockly.Workspace()
  try {
    const start = workspace.newBlock('tello_start'), speed = workspace.newBlock('tello_speed'), takeoff = workspace.newBlock('tello_takeoff'), up = workspace.newBlock('tello_move_up'), flip = workspace.newBlock('tello_flip'), land = workspace.newBlock('tello_land')
    speed.setFieldValue(50, 'SPEED'); up.setFieldValue(20, 'DISTANCE')
    start.nextConnection.connect(speed.previousConnection); speed.nextConnection.connect(takeoff.previousConnection); takeoff.nextConnection.connect(up.previousConnection); up.nextConnection.connect(flip.previousConnection); flip.nextConnection.connect(land.previousConnection)
    const steps = exportsObject.extractSteps(workspace)
    assert.equal(JSON.stringify(steps), JSON.stringify([{ type: 'speed', speed: 50 }, { type: 'takeoff' }, { type: 'move', direction: 'up', distance: 20 }, { type: 'flip', direction: 'forward' }, { type: 'land' }]))
    assert.deepEqual(validateProgram({ version: 1, steps }), [])
  } finally { workspace.dispose() }
})
