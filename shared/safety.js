// Used by both the browser and the trusted main-process safety gate.
export function validateProgram(program) {
  const errors = []
  if (!program || program.version !== 1 || !Array.isArray(program.steps) || program.steps.length > 100) return ['プログラムの形式が正しくありません。']
  let flying = false, landed = false, altitude = 0, x = 0, y = 0, heading = 0, seconds = 0
  for (const step of program.steps) {
    if (!step || typeof step !== 'object') { errors.push('不明なブロックです。'); break }
    if (landed) { errors.push('着陸の後にはブロックを置けません。'); break }
    if (step.type === 'takeoff') {
      if (flying) errors.push('離陸は1回だけにしてください。')
      flying = true; altitude = 80; seconds += 10
    } else if (step.type === 'land') {
      if (!flying) errors.push('離陸してから着陸してください。')
      flying = false; landed = true; seconds += 10
    } else if (step.type === 'wait') {
      if (!Number.isInteger(step.milliseconds) || step.milliseconds < 100 || step.milliseconds > 30000) errors.push('待つ時間は0.1〜30秒にしてください。')
      else seconds += step.milliseconds / 1000
    } else if (step.type === 'message') {
      if (typeof step.text !== 'string' || step.text.length > 200) errors.push('メッセージは200文字以内にしてください。')
    } else {
      if (!flying) errors.push('離陸してから動かしてください。')
      if (step.type === 'move') {
        const vertical = ['up', 'down'].includes(step.direction)
        if (!['forward', 'back', 'left', 'right', 'up', 'down'].includes(step.direction) || !Number.isInteger(step.distance) || step.distance < 20 || step.distance > (vertical ? 250 : 500)) { errors.push('移動の向きと距離を確認してください。'); continue }
        if (vertical) altitude += step.distance * (step.direction === 'up' ? 1 : -1)
        else {
          const angle = (heading + ({ forward: 0, right: 90, back: 180, left: -90 }[step.direction])) * Math.PI / 180
          x += Math.sin(angle) * step.distance; y += Math.cos(angle) * step.distance
        }
        if (altitude <= 0 || altitude > 250) errors.push('高さは地面より上、250cm以下にしてください。')
        if (Math.hypot(x, y) > 500.001) errors.push('出発点から500cm以内にしてください。')
        seconds += step.distance / 20 + 2
      } else if (step.type === 'turn') {
        if (!['left', 'right'].includes(step.direction) || !Number.isInteger(step.degrees) || step.degrees < 1 || step.degrees > 360) errors.push('回転は1〜360度にしてください。')
        else heading += step.degrees * (step.direction === 'right' ? 1 : -1)
        seconds += 5
      } else if (step.type === 'photo') seconds += 10
      else errors.push('対応していないブロックです。')
    }
  }
  if (!landed) errors.push('離陸と着陸をつなげてください。')
  if (seconds > 60) errors.push('プログラムを短くしてください（見積もり60秒以内）。')
  return [...new Set(errors)]
}
