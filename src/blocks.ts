import * as Blockly from 'blockly'

export type DroneStep =
  | { type: 'takeoff' }
  | { type: 'land' }
  | { type: 'move'; direction: string; distance: number }
  | { type: 'turn'; direction: string; degrees: number }
  | { type: 'flip'; direction: string }
  | { type: 'speed'; speed: number }
  | { type: 'photo' }
  | { type: 'wait'; milliseconds: number }
  | { type: 'message'; text: string }

const definitions = [
  { type: 'tello_wait', message0: '%1 秒 待つ', args0: [{ type: 'field_number', name: 'SECONDS', value: 1, min: 0.1, max: 30, precision: 0.1 }], previousStatement: null, nextStatement: null, colour: '#7667c8' },
  { type: 'tello_message', message0: 'メッセージ %1', args0: [{ type: 'field_input', name: 'TEXT', text: 'できた！' }], previousStatement: null, nextStatement: null, colour: '#7667c8' },
  { type: 'tello_repeat', message0: '%1 回 くりかえす', args0: [{ type: 'field_number', name: 'COUNT', value: 2, min: 1, max: 10, precision: 1 }], message1: '%1', args1: [{ type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: '#7667c8' },
  {
    type: 'tello_start',
    message0: 'プログラムを はじめる',
    nextStatement: null,
    colour: '#ffb000',
    tooltip: 'ここからプログラムを始めます',
  },
  {
    type: 'tello_takeoff',
    message0: '離陸する',
    previousStatement: null,
    nextStatement: null,
    colour: '#00a67d',
    tooltip: 'Telloが自動で離陸します',
  },
  {
    type: 'tello_land',
    message0: '着陸する',
    previousStatement: null,
    nextStatement: null,
    colour: '#e45b4f',
    tooltip: 'Telloを安全に着陸させます',
  },
  {
    type: 'tello_move',
    message0: '%1 に %2 cm 動く',
    args0: [
      {
        type: 'field_dropdown',
        name: 'DIRECTION',
        options: [
          ['前', 'forward'],
          ['後ろ', 'back'],
          ['左', 'left'],
          ['右', 'right'],
          ['上', 'up'],
          ['下', 'down'],
        ],
      },
      { type: 'field_number', name: 'DISTANCE', value: 50, min: 20, max: 500, precision: 10 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: '#2587c5',
    tooltip: '20cmから500cmの範囲で動かします',
  },
  {
    type: 'tello_turn',
    message0: '%1 に %2 度 回る',
    args0: [
      {
        type: 'field_dropdown',
        name: 'DIRECTION',
        options: [
          ['右', 'right'],
          ['左', 'left'],
        ],
      },
      { type: 'field_number', name: 'DEGREES', value: 90, min: 1, max: 360, precision: 1 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: '#7667c8',
    tooltip: 'Telloの向きを変えます',
  },
  { type: 'tello_move_up', message0: '🚁 上に %1 cm 上がる', args0: [{ type: 'field_number', name: 'DISTANCE', value: 50, min: 20, max: 250, precision: 10 }], previousStatement: null, nextStatement: null, colour: '#55b98e' },
  { type: 'tello_move_down', message0: '🚁 下に %1 cm 下がる', args0: [{ type: 'field_number', name: 'DISTANCE', value: 50, min: 20, max: 250, precision: 10 }], previousStatement: null, nextStatement: null, colour: '#55b98e' },
  { type: 'tello_move_left', message0: '🚁 左に %1 cm 動く', args0: [{ type: 'field_number', name: 'DISTANCE', value: 50, min: 20, max: 500, precision: 10 }], previousStatement: null, nextStatement: null, colour: '#55b98e' },
  { type: 'tello_move_right', message0: '🚁 右に %1 cm 動く', args0: [{ type: 'field_number', name: 'DISTANCE', value: 50, min: 20, max: 500, precision: 10 }], previousStatement: null, nextStatement: null, colour: '#55b98e' },
  { type: 'tello_move_forward', message0: '🚁 前に %1 cm 進む', args0: [{ type: 'field_number', name: 'DISTANCE', value: 50, min: 20, max: 500, precision: 10 }], previousStatement: null, nextStatement: null, colour: '#55b98e' },
  { type: 'tello_move_back', message0: '🚁 後ろに %1 cm 下がる', args0: [{ type: 'field_number', name: 'DISTANCE', value: 50, min: 20, max: 500, precision: 10 }], previousStatement: null, nextStatement: null, colour: '#55b98e' },
  { type: 'tello_turn_right', message0: '🚁 %1 度右に回る', args0: [{ type: 'field_number', name: 'DEGREES', value: 90, min: 1, max: 360, precision: 1 }], previousStatement: null, nextStatement: null, colour: '#55b98e' },
  { type: 'tello_turn_left', message0: '🚁 %1 度左に回る', args0: [{ type: 'field_number', name: 'DEGREES', value: 90, min: 1, max: 360, precision: 1 }], previousStatement: null, nextStatement: null, colour: '#55b98e' },
  { type: 'tello_flip', message0: '🚁 %1 に宙返りする', args0: [{ type: 'field_dropdown', name: 'DIRECTION', options: [['前', 'forward'], ['後ろ', 'back'], ['左', 'left'], ['右', 'right']] }], previousStatement: null, nextStatement: null, colour: '#55b98e' },
  { type: 'tello_speed', message0: '🚁 スピードを %1 cm/s にする', args0: [{ type: 'field_number', name: 'SPEED', value: 50, min: 10, max: 100, precision: 10 }], previousStatement: null, nextStatement: null, colour: '#55b98e' },
  {
    type: 'tello_photo',
    message0: '写真をとる 📷',
    previousStatement: null,
    nextStatement: null,
    colour: '#d4689a',
    tooltip: '映像を始めて、写真をPCに保存します',
  },
]

export const toolbox: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'はじめる・おわる',
      colour: '#ffb000',
      contents: [
        { kind: 'block', type: 'tello_start' },
        { kind: 'block', type: 'tello_takeoff' },
        { kind: 'block', type: 'tello_land' },
      ],
    },
    {
      kind: 'category',
      name: 'うごき',
      colour: '#55b98e',
      contents: [
        { kind: 'block', type: 'tello_move_up' },
        { kind: 'block', type: 'tello_move_down' },
        { kind: 'block', type: 'tello_move_left' },
        { kind: 'block', type: 'tello_move_right' },
        { kind: 'block', type: 'tello_move_forward' },
        { kind: 'block', type: 'tello_move_back' },
        { kind: 'block', type: 'tello_turn_right' },
        { kind: 'block', type: 'tello_turn_left' },
        { kind: 'block', type: 'tello_flip' },
        { kind: 'block', type: 'tello_speed' },
      ],
    },
    {
      kind: 'category',
      name: 'くりかえし・待つ',
      colour: '#7667c8',
      contents: [{ kind: 'block', type: 'tello_repeat' }, { kind: 'block', type: 'tello_wait' }, { kind: 'block', type: 'tello_message' }],
    },
    {
      kind: 'category',
      name: 'カメラ',
      colour: '#d4689a',
      contents: [{ kind: 'block', type: 'tello_photo' }],
    },
  ],
}

export const missions = [
  {
    id: 'goal',
    number: 1,
    title: 'ゴールまで飛ばす',
    shortTitle: 'ゴールまで飛ばす',
    description: 'スタートからまっすぐ進んで、ゴール地点まで飛んで着陸しよう。',
    goal: 'ゴール地点まで進んで着陸する',
    icon: '🎯',
  },
  {
    id: 'over-mountain',
    number: 2,
    title: '山を越える',
    shortTitle: '山を越える',
    description: '真ん中にある山よりも高く上がって、山を飛び越えてゴールに着陸しよう。',
    goal: '高さを上げて山を越えて着陸する',
    icon: '⛰️',
  },
  {
    id: 'around-mountain',
    number: 3,
    title: '山を一周する',
    shortTitle: '山を一周する',
    description: '山のまわりを回って一周し、スタート地点に戻って着陸しよう。',
    goal: '山のまわりを回って一周する',
    icon: '🔄',
  },
  {
    id: 'around-mountain-left',
    number: 4,
    title: '山を「左に回る」で一周する',
    shortTitle: '左回りで一周',
    description: '「左に回る」ブロックを使って、山のまわりを反時計回りに一周しよう。',
    goal: '「左に回る」を使って山を一周する',
    icon: '↺',
  },
  {
    id: 'around-mountain-twice',
    number: 5,
    title: '山を二周する',
    shortTitle: '山を二周する',
    description: '「くりかえし」ブロックなどを上手に使って、山のまわりを二周しよう。',
    goal: '山のまわりを二周して着陸する',
    icon: '🔁',
  },
  {
    id: 'time-attack',
    number: 6,
    title: 'タイムアタック',
    shortTitle: 'タイムアタック',
    description: 'スピードブロックを使って速度を上げ、すばやくゴールまで飛ばそう！',
    goal: 'スピードを上げてゴールまで飛ばす',
    icon: '⚡',
  },
] as const

let isDefined = false

export function registerBlocks() {
  if (!isDefined) {
    Blockly.defineBlocksWithJsonArray(definitions)
    isDefined = true
  }
}

export function extractSteps(workspace: Blockly.WorkspaceSvg): DroneStep[] {
  const roots = workspace.getTopBlocks(true)
  if (roots.length > 1) throw new Error('はじめるブロックを1つにして、すべてのブロックをつなげてください。')
  const start = roots.find((block) => block.type === 'tello_start')
  const steps: DroneStep[] = []
  function visit(first: Blockly.Block | null, depth = 0) {
  if (depth > 10) throw new Error('くりかえしの入れ子がおおすぎます。')
  let block = first
  while (block) {
    if (steps.length >= 100) throw new Error('プログラムは展開後100ブロック以内にしてください。')
    switch (block.type) {
      case 'tello_repeat': {
        const count = Number(block.getFieldValue('COUNT'))
        if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('くりかえしは1〜10回です。')
        for (let i = 0; i < count; i++) visit(block.getInputTargetBlock('DO'), depth + 1)
        break
      }
      case 'tello_wait': steps.push({ type: 'wait', milliseconds: Math.round(Number(block.getFieldValue('SECONDS')) * 1000) }); break
      case 'tello_message': steps.push({ type: 'message', text: block.getFieldValue('TEXT') }); break
      case 'tello_takeoff':
        steps.push({ type: 'takeoff' })
        break
      case 'tello_land':
        steps.push({ type: 'land' })
        break
      case 'tello_move':
        steps.push({
          type: 'move',
          direction: block.getFieldValue('DIRECTION'),
          distance: Number(block.getFieldValue('DISTANCE')),
        })
        break
      case 'tello_move_up': steps.push({ type: 'move', direction: 'up', distance: Number(block.getFieldValue('DISTANCE')) }); break
      case 'tello_move_down': steps.push({ type: 'move', direction: 'down', distance: Number(block.getFieldValue('DISTANCE')) }); break
      case 'tello_move_left': steps.push({ type: 'move', direction: 'left', distance: Number(block.getFieldValue('DISTANCE')) }); break
      case 'tello_move_right': steps.push({ type: 'move', direction: 'right', distance: Number(block.getFieldValue('DISTANCE')) }); break
      case 'tello_move_forward': steps.push({ type: 'move', direction: 'forward', distance: Number(block.getFieldValue('DISTANCE')) }); break
      case 'tello_move_back': steps.push({ type: 'move', direction: 'back', distance: Number(block.getFieldValue('DISTANCE')) }); break
      case 'tello_turn':
        steps.push({
          type: 'turn',
          direction: block.getFieldValue('DIRECTION'),
          degrees: Number(block.getFieldValue('DEGREES')),
        })
        break
      case 'tello_turn_right': steps.push({ type: 'turn', direction: 'right', degrees: Number(block.getFieldValue('DEGREES')) }); break
      case 'tello_turn_left': steps.push({ type: 'turn', direction: 'left', degrees: Number(block.getFieldValue('DEGREES')) }); break
      case 'tello_flip': steps.push({ type: 'flip', direction: block.getFieldValue('DIRECTION') }); break
      case 'tello_speed': steps.push({ type: 'speed', speed: Number(block.getFieldValue('SPEED')) }); break
      case 'tello_photo':
        steps.push({ type: 'photo' })
        break
    }
    block = block.getNextBlock()
  }
  }
  visit(start?.getNextBlock() ?? null)

  return steps
}

export function stepLabel(step: DroneStep) {
  if (step.type === 'wait') return `${step.milliseconds / 1000}秒 待つ`
  if (step.type === 'message') return step.text
  if (step.type === 'takeoff') return '離陸する'
  if (step.type === 'land') return '着陸する'
  if (step.type === 'photo') return '写真をとる'
  if (step.type === 'flip') return `${({ forward: '前', back: '後ろ', left: '左', right: '右' } as Record<string, string>)[step.direction]}に宙返りする`
  if (step.type === 'speed') return `スピードを ${step.speed}cm/s にする`
  if (step.type === 'move') {
    const labels: Record<string, string> = {
      forward: '前', back: '後ろ', left: '左', right: '右', up: '上', down: '下',
    }
    return `${labels[step.direction]}に ${step.distance}cm 動く`
  }
  return `${step.direction === 'right' ? '右' : '左'}に ${step.degrees}度 回る`
}
