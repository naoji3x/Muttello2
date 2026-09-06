const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('muttello2', {
  setCamera: enabled => ipcRenderer.invoke('tello:setCamera', enabled),
  selectPhotoFolder: () => ipcRenderer.invoke('tello:selectPhotoFolder'),
  exportLogs: () => ipcRenderer.invoke('tello:exportLogs'),
  onFrame: callback => { const listener = (_event, frame) => callback(frame); ipcRenderer.on('tello:frame', listener); return () => ipcRenderer.removeListener('tello:frame', listener) },
  onPhoto: callback => { const listener = (_event, photo) => callback(photo); ipcRenderer.on('tello:photo', listener); return () => ipcRenderer.removeListener('tello:photo', listener) },
  getState: () => ipcRenderer.invoke('tello:getState'),
  connect: () => ipcRenderer.invoke('tello:connect'),
  runProgram: program => ipcRenderer.invoke('tello:runProgram', program),
  cancelProgram: () => ipcRenderer.invoke('tello:cancelProgram'),
  land: () => ipcRenderer.invoke('tello:land'),
  emergencyStop: () => ipcRenderer.invoke('tello:emergencyStop'),
})
