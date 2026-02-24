const path = require("path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");

function createMainWindow() {
  const appIconPath = path.join(__dirname, "../renderer/assets/joi-logo-icon.png");
  const mainWindow = new BrowserWindow({
    width: 1460,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0b1020",
    icon: appIconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("app-version", () => app.getVersion());
  ipcMain.handle("open-external", async (_event, url) => {
    if (!url || typeof url !== "string") {
      return false;
    }
    await shell.openExternal(url);
    return true;
  });

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
