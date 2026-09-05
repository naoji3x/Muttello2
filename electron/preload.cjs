const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('muttello2', {
  getState: () => ipcRenderer.invoke('tello:getState'),
  connect: () => ipcRenderer.invoke('tello:connect'),
  runProgram: program => ipcRenderer.invoke('tello:runProgram', program),
  cancelProgram: () => ipcRenderer.invoke('tello:cancelProgram'),
  land: () => ipcRenderer.invoke('tello:land'),
  emergencyStop: () => ipcRenderer.invoke('tello:emergencyStop'),
})
