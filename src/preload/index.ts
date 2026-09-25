import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CH, type ReminderApi } from '../shared/api'

function listen<T>(channel: string, cb: (v: T) => void): () => void {
  const h = (_e: IpcRendererEvent, v: T): void => cb(v)
  ipcRenderer.on(channel, h)
  return () => ipcRenderer.removeListener(channel, h)
}

const api: ReminderApi = {
  getSnapshot: () => ipcRenderer.invoke(CH.getSnapshot),
  onSnapshot: (cb) => listen(CH.snapshot, cb),
  onNavigate: (cb) => listen(CH.navigate, cb),
  onPlaySound: (cb) => listen(CH.playSound, cb),

  createEvent: (input) => ipcRenderer.invoke(CH.createEvent, input),
  updateEvent: (id, input) => ipcRenderer.invoke(CH.updateEvent, id, input),
  deleteEvent: (id) => ipcRenderer.invoke(CH.deleteEvent, id),
  archiveEvent: (id) => ipcRenderer.invoke(CH.archiveEvent, id),
  restoreEvent: (id, input) => ipcRenderer.invoke(CH.restoreEvent, id, input),
  done: (id) => ipcRenderer.invoke(CH.done, id),
  snooze: (id, minutes) => ipcRenderer.invoke(CH.snooze, id, minutes),
  doneAllMissed: () => ipcRenderer.invoke(CH.doneAllMissed),

  createCategory: (input) => ipcRenderer.invoke(CH.createCategory, input),
  updateCategory: (id, input) => ipcRenderer.invoke(CH.updateCategory, id, input),
  deleteCategory: (id) => ipcRenderer.invoke(CH.deleteCategory, id),

  updateSettings: (patch) => ipcRenderer.invoke(CH.updateSettings, patch),
  chooseSound: () => ipcRenderer.invoke(CH.chooseSound),
  testSound: () => ipcRenderer.invoke(CH.testSound),

  retryLoad: () => ipcRenderer.invoke(CH.retryLoad),
  resetData: () => ipcRenderer.invoke(CH.resetData),

  hideWindow: () => ipcRenderer.invoke(CH.hideWindow),
  resizeStart: (edge) => ipcRenderer.invoke(CH.resizeStart, edge),
  resizeEnd: () => ipcRenderer.invoke(CH.resizeEnd),
  overlaySize: (w, h) => ipcRenderer.invoke(CH.overlaySize, w, h)
}

contextBridge.exposeInMainWorld('reminder', api)
