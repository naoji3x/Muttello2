const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const { Video } = require('./video.cjs')

const { Tello, parseAddress } = require('./tello.cjs')
const { readTelloEnv } = require('../shared/env.cjs')
const { appendFileSync } = require('node:fs')
let tello
let mainWindow

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL)

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#f5f8fb',
    title: 'Muttello2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', event => event.preventDefault())
  mainWindow.on('close', event => {
    if (tello && (tello.busy || ['airborne', 'taking-off', 'landing'].includes(tello.state.flight))) {
      event.preventDefault()
      tello.cancel()
      dialog.showMessageBox(mainWindow, { message: '実行を中止しました。着陸してからアプリを閉じてください。' })
    }
  })
  mainWindow.on('closed', () => { if (tello) { tello.previewRequested = false; void tello.stopCamera() } })

  if (isDevelopment) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'build', 'index.html'))
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`Failed to load ${validatedUrl}: ${errorCode} ${errorDescription}`)
  })

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.error(`[renderer:${level}] ${sourceId}:${line} ${message}`)
  })

  if (process.env.MUTTELLO_DEBUG === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }
}

app.whenReady().then(async () => {
  const { validateProgram } = await import('../shared/safety.js')
  let ip
  try {
    const directory = app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd()
    ip = parseAddress(process.argv, readTelloEnv(directory))
  } catch (error) { dialog.showErrorBox('接続設定エラー', error.message); app.quit(); return }
  tello = new Tello(ip, validateProgram, { log: (kind, value) => {
    try { appendFileSync(path.join(app.getPath('userData'), 'tello.log'), JSON.stringify({ time: new Date().toISOString(), kind, value }) + '\n') } catch (error) { console.error('ログ保存失敗', error.message) }
  } })
  tello.video = new Video(ip)
  tello.onPhoto = photo => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('tello:photo', photo) }
  const previewTimer = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed() && tello.cameraOn) mainWindow.webContents.send('tello:frame', tello.video.preview())
  }, 100)
  previewTimer.unref()
  createWindow()
  const actions = {
    setCamera: enabled => tello.setCamera(enabled),
    selectPhotoFolder: async () => {
      if (tello.busy) throw new Error('実行中は保存先を変更できません。')
      const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] })
      if (!result.canceled && !tello.busy) tello.photoFolder = result.filePaths[0]
      return tello.snapshot()
    },
    exportLogs: async () => {
      const result = await dialog.showSaveDialog(mainWindow, { defaultPath: 'tello-diagnostics.log' })
      if (!result.canceled && result.filePath) await fs.copyFile(path.join(app.getPath('userData'), 'tello.log'), result.filePath)
    },
    getState: () => tello.snapshot(), connect: () => tello.connect(),
    runProgram: program => tello.run(program), cancelProgram: () => tello.cancel(), land: () => tello.land(),
    emergencyStop: async () => {
      const result = await dialog.showMessageBox(mainWindow, { type: 'warning', title: '先生用：緊急モーター停止', message: 'モーターを直ちに停止します。飛行中の機体は落下します。', buttons: ['戻る', 'モーターを停止する'], defaultId: 0, cancelId: 0, noLink: true })
      return result.response === 1 ? tello.emergency() : tello.snapshot()
    },
  }
  for (const [name, action] of Object.entries(actions)) ipcMain.handle(`tello:${name}`, async (event, value) => {
    if (event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('許可されていない操作です。')
    return action(value)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => tello?.cancel())
app.on('will-quit', () => tello?.close())
