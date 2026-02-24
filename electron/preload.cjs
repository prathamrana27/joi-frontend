const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("joiDesktop", {
  getAppVersion: () => ipcRenderer.invoke("app-version"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  platform: process.platform
});
