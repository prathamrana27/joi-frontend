const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("joiDesktop", {
  getAppVersion: () => ipcRenderer.invoke("app-version"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  startGoogleDesktopOAuth: (clientId) => ipcRenderer.invoke("google-desktop-oauth", clientId),
  showDesktopNotification: (title, body) => ipcRenderer.invoke("notify-desktop", { title, body }),
  getActiveAppContext: () => ipcRenderer.invoke("active-app-context"),
  engineStatus: () => ipcRenderer.invoke("engine-status"),
  runEngineSetup: () => ipcRenderer.invoke("engine-setup"),
  onEngineProgress: (handler) => {
    if (typeof handler !== "function") {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("engine-progress", listener);
    return () => {
      ipcRenderer.removeListener("engine-progress", listener);
    };
  },
  onDesktopEvent: (handler) => {
    if (typeof handler !== "function") {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("desktop-hotkey-event", listener);
    return () => {
      ipcRenderer.removeListener("desktop-hotkey-event", listener);
    };
  },
  platform: process.platform
});
