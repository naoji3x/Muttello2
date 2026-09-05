const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { parseEnv } = require('node:util')

// Return configuration without copying secrets into process.env or the renderer.
function readTelloEnv(directory = process.cwd(), env = process.env) {
  let file = {}
  try { file = parseEnv(readFileSync(resolve(directory, '.env'), 'utf8')) }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error('.envを読み込めません。ファイルの形式とアクセス権を確認してください。')
  }
  return Object.fromEntries(['TELLO_IP', 'TELLO_SSID', 'TELLO_PASSWORD'].map(key => [key, env[key] ?? file[key]]))
}

module.exports = { readTelloEnv }
