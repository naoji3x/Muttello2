const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('muttello2', {
  platform: process.platform,
  appVersion: process.env.npm_package_version || '0.1.0',
})
