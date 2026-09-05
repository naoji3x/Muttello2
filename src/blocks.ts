import * as Blockly from 'blockly'

export type DroneStep =
  | { type: 'takeoff' }
  | { type: 'land' }
  | { type: 'move'; direction: string; distance: number }
  | { type: 'turn'; direction: string; degrees: number }
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
    { kind: 'category', name: 'くりかえし・待つ', colour: '#7667c8', contents: [{ kind: 'block', type: 'tello_repeat' }, { kind: 'block', type: 'tello_wait' }, { kind: 'block', type: 'tello_message' }] },
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
      colour: '#2587c5',
      contents: [
        { kind: 'block', type: 'tello_move' },
        { kind: 'block', type: 'tello_turn' },
      ],
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
  { id: 'first', number: 1, title: 'はじめての離陸と着陸', shortTitle: '離陸と着陸', description: 'はじめる・離陸・着陸の3つをつなぎ、シミュレーションしよう。', goal: '安全に離陸して着陸する', icon: '↑' },
  {
    id: 'photo',
    number: 2,
    title: '写真をとって帰ろう',
    shortTitle: 'まっすぐ飛ぼう',
    description: '離陸して前に進み、写真をとってから安全に着陸しよう。',
    goal: '写真を1まい保存する',
    icon: '📷',
  },
  {
    id: 'turn',
    number: 3,
    title: '曲がってゴールへ行こう',
    shortTitle: '右に曲がろう',
    description: '前へ進んで右に90度回り、ゴールへ向かおう。',
    goal: '曲がり角を通って着陸する',
    icon: '↱',
  },
  {
    id: 'high-photo',
    number: 4,
    title: '高いところで写真をとろう',
    shortTitle: '上へ飛ぼう',
    description: '高く上がって写真をとり、元の高さまで戻って着陸しよう。',
    goal: '高さ180cmで写真をとる',
    icon: '☁️',
  },
  { id: 'repeat', number: 5, title: 'くりかえしを使おう', shortTitle: 'くりかえそう', description: '離陸したら「前に20cm・1秒待つ」を2回くりかえして着陸しよう。', goal: 'くりかえしと待つを使う', icon: '↻' },
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
  if (depth > 10) throw new Error('くりかえしの入れ子が多すぎます。')
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
      case 'tello_turn':
        steps.push({
          type: 'turn',
          direction: block.getFieldValue('DIRECTION'),
          degrees: Number(block.getFieldValue('DEGREES')),
        })
        break
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
  if (step.type === 'move') {
    const labels: Record<string, string> = {
      forward: '前', back: '後ろ', left: '左', right: '右', up: '上', down: '下',
    }
    return `${labels[step.direction]}に ${step.distance}cm 動く`
  }
  return `${step.direction === 'right' ? '右' : '左'}に ${step.degrees}度 回る`
}
