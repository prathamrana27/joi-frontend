const path = require("path");
const fs = require("fs");
const http = require("http");
const nodeCrypto = require("crypto");
const { execFile, spawn } = require("child_process");
const { app, BrowserWindow, ipcMain, shell, globalShortcut, Notification, dialog } = require("electron");

const OAUTH_HOST = "127.0.0.1";
const OAUTH_PORT = 53682;
const OAUTH_CALLBACK_PATH = "/oauth2callback";
const OAUTH_TIMEOUT_MS = 3 * 60 * 1000;
const BACKEND_HOST = process.env.JOI_BACKEND_HOST || "127.0.0.1";
const BACKEND_PORT = Number.parseInt(process.env.JOI_BACKEND_PORT || "8000", 10);
const BACKEND_STARTUP_TIMEOUT_MS = 45_000;
const BACKEND_POLL_INTERVAL_MS = 700;

let oauthInFlight = false;
let mainWindow = null;
let backendProcess = null;
let backendStartupPromise = null;
let appIsQuitting = false;
let shutdownInProgress = false;

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomUrlSafe(bytes = 32) {
  return toBase64Url(nodeCrypto.randomBytes(bytes));
}

function sha256UrlSafe(value) {
  return toBase64Url(nodeCrypto.createHash("sha256").update(value, "utf8").digest());
}

function sendOAuthHtml(res, title, message) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: Segoe UI, Arial, sans-serif; margin: 40px; background: #111827; color: #f3f4f6; }
      .card { max-width: 560px; margin: 0 auto; padding: 24px; border-radius: 14px; background: #1f2937; border: 1px solid #374151; }
      h1 { margin: 0 0 10px; font-size: 22px; }
      p { margin: 0; color: #d1d5db; line-height: 1.45; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${title}</h1>
      <p>${message}</p>
    </div>
  </body>
</html>`);
}

function runDesktopGoogleOAuth(clientId) {
  return new Promise((resolve, reject) => {
    if (!clientId || typeof clientId !== "string") {
      reject(new Error("Google client id is missing."));
      return;
    }

    const state = randomUrlSafe(24);
    const codeVerifier = randomUrlSafe(64);
    const codeChallenge = sha256UrlSafe(codeVerifier);
    const redirectUri = `http://${OAUTH_HOST}:${OAUTH_PORT}${OAUTH_CALLBACK_PATH}`;
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "select_account");

    let settled = false;
    let timeoutId = null;

    const settle = (err, payload) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const finalize = () => {
        if (err) {
          reject(err);
          return;
        }
        resolve(payload);
      };

      try {
        if (server.listening) {
          server.close(() => {
            finalize();
          });
        } else {
          finalize();
        }
      } catch (_closeErr) {
        finalize();
      }
    };

    const server = http.createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url || "/", `http://${OAUTH_HOST}:${OAUTH_PORT}`);
        if (requestUrl.pathname !== OAUTH_CALLBACK_PATH) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Not found");
          return;
        }

        const authError = requestUrl.searchParams.get("error");
        const callbackState = requestUrl.searchParams.get("state");
        const code = requestUrl.searchParams.get("code");

        if (authError) {
          sendOAuthHtml(
            res,
            "Google Sign-In Failed",
            "Sign-in was cancelled or denied. You can close this tab and try again."
          );
          settle(new Error(`Google OAuth failed: ${authError}`));
          return;
        }

        if (!code || callbackState !== state) {
          sendOAuthHtml(
            res,
            "Google Sign-In Failed",
            "Invalid callback data received. You can close this tab and retry."
          );
          settle(new Error("Invalid Google OAuth callback state or code."));
          return;
        }

        sendOAuthHtml(
          res,
          "Google Sign-In Complete",
          "You can close this tab and return to JOI Desktop."
        );

        settle(null, {
          code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri
        });
      } catch (err) {
        settle(err instanceof Error ? err : new Error(String(err)));
      }
    });

    server.once("error", (err) => {
      settle(new Error(`Unable to start OAuth callback server on ${redirectUri}: ${err.message}`));
    });

    server.listen(OAUTH_PORT, OAUTH_HOST, async () => {
      try {
        await shell.openExternal(authUrl.toString());
      } catch (err) {
        settle(new Error(`Failed to open browser for Google sign-in: ${err.message}`));
      }
    });

    timeoutId = setTimeout(() => {
      settle(new Error("Google sign-in timed out. Please try again."));
    }, OAUTH_TIMEOUT_MS);
  });
}

function backendHealthCheck(timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: BACKEND_HOST,
        port: BACKEND_PORT,
        path: "/health",
        timeout: timeoutMs
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

async function waitForBackendReady(timeoutMs = BACKEND_STARTUP_TIMEOUT_MS) {
  const deadline = Date.now() + Math.max(2000, timeoutMs);
  while (Date.now() < deadline) {
    if (await backendHealthCheck()) {
      return true;
    }
    if (backendProcess && backendProcess.exitCode !== null) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, BACKEND_POLL_INTERVAL_MS));
  }
  return false;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function preparePackagedBackendRuntime(packagedBackendDir) {
  const backendDataDir = path.join(app.getPath("userData"), "backend");
  const backendToolsDataDir = path.join(backendDataDir, "tools");
  ensureDir(backendDataDir);
  ensureDir(backendToolsDataDir);

  let packagedEnvExample = path.join(packagedBackendDir, "env-template.txt");
  if (!fs.existsSync(packagedEnvExample)) {
    packagedEnvExample = path.join(packagedBackendDir, ".env.example");
  }
  const userEnvExample = path.join(backendDataDir, ".env.example");
  if (fs.existsSync(packagedEnvExample) && !fs.existsSync(userEnvExample)) {
    fs.copyFileSync(packagedEnvExample, userEnvExample);
  }

  const packagedCreds = path.join(packagedBackendDir, "tools", "credentials.json");
  const userCreds = path.join(backendToolsDataDir, "credentials.json");
  if (fs.existsSync(packagedCreds) && !fs.existsSync(userCreds)) {
    fs.copyFileSync(packagedCreds, userCreds);
  }

  return {
    envPath: path.join(backendDataDir, ".env"),
    googleToolsDir: backendToolsDataDir
  };
}

function resolveBackendLaunchConfig() {
  const repoBackendDir = path.resolve(__dirname, "../../joi-backend");
  const builtBackendDir = path.resolve(repoBackendDir, "dist/joi-backend");
  const packagedBackendDir = path.join(process.resourcesPath, "backend");
  const exeName = process.platform === "win32" ? "joi-backend.exe" : "joi-backend";

  // Prefer packaged backend when app is distributed.
  if (app.isPackaged) {
    const packagedExe = path.join(packagedBackendDir, exeName);
    if (!fs.existsSync(packagedExe)) {
      throw new Error(`Packaged backend executable not found: ${packagedExe}`);
    }
    const runtimePaths = preparePackagedBackendRuntime(packagedBackendDir);
    return {
      command: packagedExe,
      args: [],
      cwd: packagedBackendDir,
      envPath: runtimePaths.envPath,
      googleToolsDir: runtimePaths.googleToolsDir
    };
  }

  // In local development, prefer already-built backend executable if present.
  const builtExe = path.join(builtBackendDir, exeName);
  if (fs.existsSync(builtExe)) {
    return {
      command: builtExe,
      args: [],
      cwd: builtBackendDir,
      envPath: path.join(repoBackendDir, ".env"),
      googleToolsDir: path.join(repoBackendDir, "tools")
    };
  }

  // Fallback to python source execution.
  const pythonCmd = process.env.JOI_PYTHON_BIN || "python";
  const backendEntry = path.join(repoBackendDir, "api_server.py");
  return {
    command: pythonCmd,
    args: [backendEntry],
    cwd: repoBackendDir,
    envPath: path.join(repoBackendDir, ".env"),
    googleToolsDir: path.join(repoBackendDir, "tools")
  };
}

async function stopBackendProcess() {
  if (!backendProcess) {
    return;
  }

  const proc = backendProcess;
  backendProcess = null;

  if (proc.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };

    proc.once("exit", done);

    try {
      if (process.platform === "win32") {
        execFile(
          "taskkill",
          ["/pid", String(proc.pid), "/t", "/f"],
          { windowsHide: true },
          () => done()
        );
      } else {
        proc.kill("SIGTERM");
      }
    } catch (_err) {
      done();
    }

    setTimeout(done, 3000);
  });
}

async function ensureBackendRunning() {
  if (await backendHealthCheck()) {
    return;
  }

  if (backendStartupPromise) {
    await backendStartupPromise;
    return;
  }

  backendStartupPromise = (async () => {
    const launch = resolveBackendLaunchConfig();
    const env = {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      JOI_ENV_PATH: launch.envPath,
      JOI_GOOGLE_TOOLS_DIR: launch.googleToolsDir
    };

    backendProcess = spawn(launch.command, launch.args, {
      cwd: launch.cwd,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    backendProcess.stdout?.on("data", (chunk) => {
      const line = String(chunk || "").trim();
      if (line) {
        console.log(`[backend] ${line}`);
      }
    });

    backendProcess.stderr?.on("data", (chunk) => {
      const line = String(chunk || "").trim();
      if (line) {
        console.error(`[backend] ${line}`);
      }
    });

    backendProcess.once("exit", (code, signal) => {
      const expected = appIsQuitting;
      if (!expected) {
        const reason = signal ? `signal ${signal}` : `code ${code}`;
        dialog.showErrorBox("Backend Stopped", `JOI backend stopped unexpectedly (${reason}).`);
      }
    });

    const ready = await waitForBackendReady(BACKEND_STARTUP_TIMEOUT_MS);
    if (!ready) {
      await stopBackendProcess();
      throw new Error(
        `Backend failed to become healthy at http://${BACKEND_HOST}:${BACKEND_PORT}/health`
      );
    }
  })();

  try {
    await backendStartupPromise;
  } finally {
    backendStartupPromise = null;
  }
}

function createMainWindow() {
  const appIconPath = path.join(__dirname, "../renderer/assets/joi-logo-icon.png");
  mainWindow = new BrowserWindow({
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

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function emitDesktopEvent(name, payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("desktop-hotkey-event", { name, payload });
}

function registerGlobalHotkeys() {
  try {
    globalShortcut.unregisterAll();
    globalShortcut.register("CommandOrControl+Space", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (!mainWindow.isVisible()) {
          mainWindow.show();
        }
        mainWindow.focus();
      }
      emitDesktopEvent("quick_command_toggle", {});
    });
    globalShortcut.register("CommandOrControl+Shift+M", () => {
      emitDesktopEvent("voice_toggle", {});
    });
  } catch (_err) {
    // Best-effort only; app should still function without shortcuts.
  }
}

function getWindowsActiveAppContext() {
  const script = [
    "$source = @'",
    "using System;",
    "using System.Text;",
    "using System.Runtime.InteropServices;",
    "public static class Win32 {",
    "  [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();",
    "  [DllImport(\"user32.dll\", SetLastError=true)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);",
    "  [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);",
    "}",
    "'@;",
    "Add-Type -TypeDefinition $source -ErrorAction SilentlyContinue | Out-Null;",
    "$hwnd = [Win32]::GetForegroundWindow();",
    "$sb = New-Object System.Text.StringBuilder 1024;",
    "[Win32]::GetWindowText($hwnd, $sb, $sb.Capacity) | Out-Null;",
    "$pid = 0; [Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null;",
    "$proc = Get-Process -Id $pid -ErrorAction SilentlyContinue;",
    "$obj = [PSCustomObject]@{ app = if($proc){$proc.ProcessName}else{\"\"}; title = $sb.ToString(); pid = $pid };",
    "$obj | ConvertTo-Json -Compress"
  ].join(" ");

  return new Promise((resolve) => {
    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout: 4000, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          resolve({ app: "", title: "", pid: 0 });
          return;
        }
        try {
          const parsed = JSON.parse(String(stdout || "{}").trim() || "{}");
          resolve({
            app: String(parsed.app || ""),
            title: String(parsed.title || ""),
            pid: Number(parsed.pid || 0)
          });
        } catch (_err) {
          resolve({ app: "", title: "", pid: 0 });
        }
      }
    );
  });
}

app.whenReady().then(async () => {
  ipcMain.handle("app-version", () => app.getVersion());
  ipcMain.handle("open-external", async (_event, url) => {
    if (!url || typeof url !== "string") {
      return false;
    }
    await shell.openExternal(url);
    return true;
  });
  ipcMain.handle("google-desktop-oauth", async (_event, clientId) => {
    if (oauthInFlight) {
      throw new Error("Google sign-in is already in progress.");
    }
    oauthInFlight = true;
    try {
      return await runDesktopGoogleOAuth(clientId);
    } finally {
      oauthInFlight = false;
    }
  });
  ipcMain.handle("notify-desktop", async (_event, payload) => {
    const title = String(payload?.title || "JOI");
    const body = String(payload?.body || "");
    try {
      if (Notification.isSupported()) {
        const notification = new Notification({ title, body });
        notification.show();
      }
      return true;
    } catch (_err) {
      return false;
    }
  });
  ipcMain.handle("active-app-context", async () => {
    if (process.platform === "win32") {
      return getWindowsActiveAppContext();
    }
    return { app: "", title: "", pid: 0 };
  });

  try {
    await ensureBackendRunning();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    dialog.showErrorBox("Backend Startup Failed", `Unable to start JOI backend.\n\n${reason}`);
    app.quit();
    return;
  }

  createMainWindow();
  registerGlobalHotkeys();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      registerGlobalHotkeys();
    }
  });
});

app.on("before-quit", (event) => {
  if (shutdownInProgress) {
    return;
  }
  shutdownInProgress = true;
  appIsQuitting = true;
  event.preventDefault();
  stopBackendProcess()
    .catch(() => {})
    .finally(() => {
      app.removeAllListeners("before-quit");
      app.quit();
    });
});

app.on("will-quit", () => {
  appIsQuitting = true;
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
