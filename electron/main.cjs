const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL)

function createWindow() {
  const mainWindow = new BrowserWindow({
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

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
