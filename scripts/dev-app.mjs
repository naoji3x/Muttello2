import { createServer } from 'vite'
import { spawn } from 'node:child_process'
import electron from 'electron'

// Forward arguments without shell quoting (including Windows paths with spaces).
const server = await createServer({ server: { host: '127.0.0.1', port: 5173, strictPort: true } })
await server.listen()
const child = spawn(electron, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173' },
})
let stopping = false
async function stop(code) {
  if (stopping) return
  stopping = true
  if (child.exitCode === null) child.kill()
  await server.close()
  process.exitCode = code
}
child.on('error', error => { console.error(error); void stop(1) })
child.on('exit', code => void stop(code ?? 1))
process.on('SIGINT', () => void stop(130))
process.on('SIGTERM', () => void stop(143))
