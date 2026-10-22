// The quick assistant: a small floating JOI popup in the bottom-right corner, summoned by
// the desktop shortcut, Ctrl+Alt+J or the tray icon. It loads the same React app with the
// "#/quick" route. The window is transparent so the panel can have rounded corners and its
// own shadow, and it's created once and kept hidden so it appears instantly.

const path = require("path");
const { BrowserWindow, screen } = require("electron");

const WIDTH = 400;
const HEIGHT = 620;
const MARGIN = 12; // gap from the screen edge / taskbar

let quickWindow = null;

function cornerPosition() {
  // The display under the mouse, so it opens where the user is looking.
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea; // excludes the taskbar
  return {
    x: Math.round(area.x + area.width - WIDTH - MARGIN),
    y: Math.round(area.y + area.height - HEIGHT - MARGIN),
  };
}

function createQuickWindow({ loadRenderer, icon }) {
  if (quickWindow && !quickWindow.isDestroyed()) return quickWindow;
  const { x, y } = cornerPosition();
  quickWindow = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false, // the panel draws its own soft shadow
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: "JOI",
    icon,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  quickWindow.setAlwaysOnTop(true, "floating");
  loadRenderer(quickWindow, "/quick");
  // Closing just hides it; the app keeps running in the tray.
  quickWindow.on("close", (event) => {
    if (!quickWindow.__allowClose) {
      event.preventDefault();
      quickWindow.hide();
    }
  });
  quickWindow.on("closed", () => {
    quickWindow = null;
  });
  return quickWindow;
}

function showQuickWindow(opts, info = {}) {
  const win = createQuickWindow(opts);
  const { x, y } = cornerPosition();
  win.setBounds({ x, y, width: WIDTH, height: HEIGHT });
  const reveal = () => {
    win.show();
    win.focus();
    win.webContents.send("quick-shown", info);
  };
  if (win.webContents.isLoading()) win.webContents.once("did-finish-load", reveal);
  else reveal();
}

function hideQuickWindow() {
  if (quickWindow && !quickWindow.isDestroyed()) quickWindow.hide();
}

function toggleQuickWindow(opts) {
  if (quickWindow && !quickWindow.isDestroyed() && quickWindow.isVisible()) hideQuickWindow();
  else showQuickWindow(opts);
}

function destroyQuickWindow() {
  if (quickWindow && !quickWindow.isDestroyed()) {
    quickWindow.__allowClose = true;
    quickWindow.destroy();
  }
}

module.exports = { createQuickWindow, showQuickWindow, hideQuickWindow, toggleQuickWindow, destroyQuickWindow };
