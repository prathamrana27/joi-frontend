const path = require("path");
const fs = require("fs");
const http = require("http");
const nodeCrypto = require("crypto");
const { execFile, spawn } = require("child_process");
const { app, BrowserWindow, ipcMain, shell, globalShortcut, Notification, dialog, Tray, Menu, nativeImage, safeStorage } = require("electron");
const { startEmbeddedDb } = require("./embeddedDb.cjs");
const aiEngine = require("./aiEngine.cjs");
const { startAutoUpdate } = require("./updater.cjs");
const quick = require("./quickWindow.cjs");

const OAUTH_HOST = "127.0.0.1";
const OAUTH_PORT = 53682;
const OAUTH_CALLBACK_PATH = "/oauth2callback";
const OAUTH_TIMEOUT_MS = 3 * 60 * 1000;
const BACKEND_HOST = process.env.JOI_BACKEND_HOST || "127.0.0.1";
const BACKEND_PORT = Number.parseInt(process.env.JOI_BACKEND_PORT || "8000", 10);
const BACKEND_STARTUP_TIMEOUT_MS = 45_000;
const BACKEND_POLL_INTERVAL_MS = 700;
const REQUIRED_BACKEND_KEY = "OPENAI_API_KEY";

let oauthInFlight = false;
let mainWindow = null;
let backendProcess = null;
let backendStartupPromise = null;
let backendRecentLogs = [];
let backendEnvPath = "";
let appIsQuitting = false;
let shutdownInProgress = false;
let embeddedDb = null;

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

// Inline brand mark (same geometry as src/assets/logo-mark.svg) for pages served outside the app.
const BRAND_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="56" height="56"><defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ec9a76"/><stop offset=".55" stop-color="#d97757"/><stop offset="1" stop-color="#b4502f"/></linearGradient></defs><rect width="512" height="512" rx="120" fill="url(#t)"/><circle cx="300" cy="130" r="40" fill="#fdf6ee"/><path d="M300 208V318C300 384 262 408 206 396" fill="none" stroke="#fdf6ee" stroke-width="66" stroke-linecap="round"/></svg>`;

// Branded result page for the system-browser OAuth step. On success it deep-links back
// into the app via joi:// (browsers can't close a tab they didn't open, so we hand off).
function sendOAuthHtml(res, title, message, ok = false) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  const returnBlock = ok
    ? `<a class="btn" href="joi://auth/done">Return to JOI</a>
       <p class="hint">Not switching automatically? Click the button, or just close this tab.</p>
       <script>setTimeout(function(){ location.href = "joi://auth/done"; }, 500);
               setTimeout(function(){ try { window.close(); } catch (e) {} }, 1500);</script>`
    : `<p class="hint">You can close this tab and try again from JOI.</p>`;
  res.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title} · JOI</title>
    <style>
      body { margin:0; min-height:100vh; display:grid; place-items:center; font-family: Inter, "Segoe UI", system-ui, sans-serif;
             background: radial-gradient(900px 600px at 85% -10%, rgba(217,119,87,.14), transparent 60%), #faf7f2; color:#17150f; }
      .card { width:min(440px, 90vw); padding:40px 36px; border-radius:26px; background:rgba(255,255,255,.8);
              border:1px solid rgba(23,21,15,.1); box-shadow:0 24px 50px -20px rgba(28,26,23,.22); text-align:center; }
      h1 { margin:20px 0 8px; font-family: Georgia, serif; font-size:28px; letter-spacing:-.01em; }
      p { margin:0; color:#595247; line-height:1.55; }
      .btn { display:inline-block; margin-top:24px; padding:12px 26px; border-radius:999px; color:#fff; text-decoration:none; font-weight:600;
             background:linear-gradient(135deg,#e68a67,#d97757 55%,#c45f3d); box-shadow:0 10px 30px -10px rgba(217,119,87,.55); }
      .hint { margin-top:14px; font-size:13px; color:#857d70; }
    </style>
  </head>
  <body>
    <div class="card">
      ${BRAND_MARK_SVG}
      <h1>${title}</h1>
      <p>${message}</p>
      ${returnBlock}
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
            "Sign-in cancelled",
            "Google sign-in was cancelled or denied."
          );
          settle(new Error(`Google OAuth failed: ${authError}`));
          return;
        }

        if (!code || callbackState !== state) {
          sendOAuthHtml(
            res,
            "Sign-in didn't complete",
            "The sign-in response was invalid or expired."
          );
          settle(new Error("Invalid Google OAuth callback state or code."));
          return;
        }

        sendOAuthHtml(
          res,
          "You're signed in",
          "Taking you back to JOI…",
          true
        );
        // Bring the app forward ourselves too, in case the browser blocks the joi:// hand-off.
        focusAppWindow();

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

function tryCopyFileIfMissing(sourcePath, destinationPath) {
  try {
    if (!fs.existsSync(sourcePath) || fs.existsSync(destinationPath)) {
      return false;
    }
    fs.copyFileSync(sourcePath, destinationPath);
    return true;
  } catch (_err) {
    return false;
  }
}

function parseEnvFileValue(filePath, key) {
  if (!filePath || !key) {
    return "";
  }
  try {
    if (!fs.existsSync(filePath)) {
      return "";
    }
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = String(rawLine || "").trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }
      const name = line.slice(0, separatorIndex).trim();
      if (name !== key) {
        continue;
      }
      const value = line.slice(separatorIndex + 1).trim();
      return value.replace(/^['"]|['"]$/g, "");
    }
  } catch (_err) {
    return "";
  }
  return "";
}

function upsertEnvValue(filePath, key, value) {
  // Insert or replace a KEY=value line in a .env file, creating the file if needed.
  try {
    let lines = [];
    if (fs.existsSync(filePath)) {
      lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    }
    let replaced = false;
    const newLine = `${key}=${value}`;
    for (let i = 0; i < lines.length; i += 1) {
      const trimmed = String(lines[i] || "").trim();
      if (trimmed.startsWith("#")) {
        continue;
      }
      const sep = trimmed.indexOf("=");
      if (sep > 0 && trimmed.slice(0, sep).trim() === key) {
        lines[i] = newLine;
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      if (lines.length && String(lines[lines.length - 1]).trim() !== "") {
        lines.push("");
      }
      lines.push(newLine);
    }
    fs.writeFileSync(filePath, lines.join("\n"), "utf8");
    return true;
  } catch (_err) {
    return false;
  }
}

function ensureRuntimeJwtSecret(envPath) {
  // Each install gets its own strong signing secret so tokens can never be
  // forged with a shared/default value. Generated once, then persisted.
  const WEAK = new Set(["", "dev-only-change-me", "change-me", "secret"]);
  const current = parseEnvFileValue(envPath, "AUTH_JWT_SECRET");
  if (!WEAK.has(String(current).trim()) && String(current).trim().length >= 32) {
    return;
  }
  const generated = nodeCrypto.randomBytes(48).toString("hex");
  upsertEnvValue(envPath, "AUTH_JWT_SECRET", generated);
}

function isTemplateEnvValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (normalized.includes("xxxxxxxx")) {
    return true;
  }
  if (normalized.includes("replace_with")) {
    return true;
  }
  if (normalized.includes("your_")) {
    return true;
  }
  return false;
}

function resolveUsableBackendApiKey(envPath) {
  const fromProcessEnv = String(process.env[REQUIRED_BACKEND_KEY] || "").trim();
  if (!isTemplateEnvValue(fromProcessEnv)) {
    return fromProcessEnv;
  }
  const fromFile = parseEnvFileValue(envPath, REQUIRED_BACKEND_KEY);
  if (!isTemplateEnvValue(fromFile)) {
    return fromFile;
  }
  return "";
}

function envFileHasUsableApiKey(envPath) {
  return !isTemplateEnvValue(parseEnvFileValue(envPath, REQUIRED_BACKEND_KEY));
}

function resolveLlmProvider(envPath) {
  const fromProcess = String(process.env.JOI_LLM_PROVIDER || "").trim().toLowerCase();
  if (fromProcess) {
    return fromProcess;
  }
  const fromFile = String(parseEnvFileValue(envPath, "JOI_LLM_PROVIDER") || "").trim().toLowerCase();
  return fromFile || "openai";
}

function assertBackendConfigReady(envPath, envExamplePath = "") {
  // Local / self-hosted providers (Ollama, OpenAI-compatible) do not need an
  // OpenAI key, so only enforce it when OpenAI is actually the chat provider.
  const provider = resolveLlmProvider(envPath);
  if (provider !== "openai") {
    return;
  }

  const apiKey = resolveUsableBackendApiKey(envPath);
  if (apiKey) {
    return;
  }

  const templateHint = envExamplePath
    ? ` Use ${envExamplePath} as a reference.`
    : "";
  throw new Error(
    `Missing required ${REQUIRED_BACKEND_KEY}. Add it in ${envPath}.${templateHint}`
  );
}

function pushBackendLog(line) {
  const text = String(line || "").trim();
  if (!text) {
    return;
  }
  backendRecentLogs.push(text);
  if (backendRecentLogs.length > 10) {
    backendRecentLogs = backendRecentLogs.slice(-10);
  }
}

function getBackendLogTail(maxLines = 5) {
  if (!backendRecentLogs.length) {
    return "";
  }
  return backendRecentLogs.slice(-Math.max(1, maxLines)).join("\n");
}

const SHIPPED_ENV_KEYS = [
  "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_ALLOWED_CLIENT_IDS",
  "SLACK_CLIENT_ID", "SLACK_REDIRECT_URI", "SLACK_EXCHANGE_URL",
];

function preparePackagedBackendRuntime(packagedBackendDir) {
  const backendDataDir = path.join(app.getPath("userData"), "backend");
  const backendToolsDataDir = path.join(backendDataDir, "tools");
  const userEnvPath = path.join(backendDataDir, ".env");
  const userEnvExample = path.join(backendDataDir, ".env.example");
  const packagedEnvPath = path.join(packagedBackendDir, ".env");
  ensureDir(backendDataDir);
  ensureDir(backendToolsDataDir);

  let packagedEnvExample = path.join(packagedBackendDir, "env-template.txt");
  if (!fs.existsSync(packagedEnvExample)) {
    packagedEnvExample = path.join(packagedBackendDir, ".env.example");
  }

  // First run: copy packaged runtime env when available so portable builds work immediately.
  tryCopyFileIfMissing(packagedEnvPath, userEnvPath);
  // Fallback: create editable .env from template if no concrete env exists.
  tryCopyFileIfMissing(packagedEnvExample, userEnvPath);
  tryCopyFileIfMissing(packagedEnvExample, userEnvExample);

  // Settings that ship with JOI (its Google sign-in client) reach existing installs on
  // update: fill them in where the user's file is blank, never overwrite a value.
  for (const key of SHIPPED_ENV_KEYS) {
    const shipped = String(parseEnvFileValue(packagedEnvExample, key) || "").trim();
    const current = String(parseEnvFileValue(userEnvPath, key) || "").trim();
    if (shipped && !current) upsertEnvValue(userEnvPath, key, shipped);
  }

  // If runtime .env is still a template, replace it with packaged runtime env when available.
  if (
    fs.existsSync(packagedEnvPath) &&
    !envFileHasUsableApiKey(userEnvPath) &&
    envFileHasUsableApiKey(packagedEnvPath)
  ) {
    try {
      fs.copyFileSync(packagedEnvPath, userEnvPath);
    } catch (_err) {
      // If copy fails (portable runtime), launch directly with packaged env path.
    }
  }

  let selectedEnvPath = userEnvPath;
  if (!envFileHasUsableApiKey(selectedEnvPath) && envFileHasUsableApiKey(packagedEnvPath)) {
    selectedEnvPath = packagedEnvPath;
  }
  if (!fs.existsSync(selectedEnvPath) && fs.existsSync(packagedEnvExample)) {
    selectedEnvPath = packagedEnvExample;
  }

  let selectedEnvExamplePath = userEnvExample;
  if (!fs.existsSync(selectedEnvExamplePath) && fs.existsSync(packagedEnvExample)) {
    selectedEnvExamplePath = packagedEnvExample;
  }

  const packagedCreds = path.join(packagedBackendDir, "tools", "credentials.json");
  const userCreds = path.join(backendToolsDataDir, "credentials.json");
  tryCopyFileIfMissing(packagedCreds, userCreds);

  // Guarantee a per-install signing secret on the writable runtime env file.
  if (selectedEnvPath === userEnvPath) {
    ensureRuntimeJwtSecret(userEnvPath);
  }

  return {
    envPath: selectedEnvPath,
    envExamplePath: selectedEnvExamplePath,
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
      envExamplePath: runtimePaths.envExamplePath,
      googleToolsDir: runtimePaths.googleToolsDir
    };
  }

  // In local development run the Python source, so code changes take effect. The built
  // executable is a frozen snapshot from the last `npm run dist:win`; use it only when
  // testing the packaged backend on purpose (JOI_USE_BUILT_BACKEND=1).
  const builtExe = path.join(builtBackendDir, exeName);
  if (process.env.JOI_USE_BUILT_BACKEND === "1" && fs.existsSync(builtExe)) {
    return {
      command: builtExe,
      args: [],
      cwd: builtBackendDir,
      envPath: path.join(repoBackendDir, ".env"),
      envExamplePath: path.join(repoBackendDir, "dotenv-example"),
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
    envExamplePath: path.join(repoBackendDir, "dotenv-example"),
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
    backendEnvPath = launch.envPath;
    assertBackendConfigReady(launch.envPath, launch.envExamplePath);
    backendRecentLogs = [];
    const env = {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      JOI_ENV_PATH: launch.envPath,
      JOI_GOOGLE_TOOLS_DIR: launch.googleToolsDir
    };

    // Installed copies run their own private database; developers keep their own server
    // unless they opt in with JOI_EMBEDDED_DB=1.
    if (app.isPackaged || process.env.JOI_EMBEDDED_DB === "1") {
      embeddedDb = await startEmbeddedDb(app);
      if (embeddedDb) {
        env.MONGO_URI = embeddedDb.uri;
      }
    }

    backendProcess = spawn(launch.command, launch.args, {
      cwd: launch.cwd,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    backendProcess.stdout?.on("data", (chunk) => {
      const line = String(chunk || "").trim();
      if (line) {
        pushBackendLog(line);
        console.log(`[backend] ${line}`);
      }
    });

    backendProcess.stderr?.on("data", (chunk) => {
      const line = String(chunk || "").trim();
      if (line) {
        pushBackendLog(line);
        console.error(`[backend] ${line}`);
      }
    });

    backendProcess.once("exit", (code, signal) => {
      const expected = appIsQuitting;
      if (!expected) {
        const reason = signal ? `signal ${signal}` : `code ${code}`;
        const tail = getBackendLogTail();
        const detail = tail ? `\n\nRecent backend logs:\n${tail}` : "";
        dialog.showErrorBox("Backend Stopped", `JOI backend stopped unexpectedly (${reason}).${detail}`);
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

// ---------------------------------------------------------------------------
//  24/7 Notification Agent (runs in the main process, survives window close)
// ---------------------------------------------------------------------------
let tray = null;
let notifyWs = null;
let notifyToken = null;
let notifyReconnectTimer = null;
let notifyHeartbeat = null;
let tokenSyncTimer = null;
const ICON_PATH = path.join(__dirname, "../assets/icon.png");
const TRAY_ICON_PATH = path.join(__dirname, "../assets/tray.png"); // tray@2x.png auto-picked on HiDPI
// Launched by Windows at login (setLoginItemSettings) → stay in the tray, don't pop a window.
const startHidden = process.argv.includes("--hidden");

function tokenFilePath() {
  return path.join(app.getPath("userData"), "agent-token.bin");
}

function persistToken(token) {
  try {
    const buf = safeStorage && safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(token)
      : Buffer.from(token, "utf8");
    fs.writeFileSync(tokenFilePath(), buf);
  } catch (_e) { /* best-effort */ }
}

function loadPersistedToken() {
  try {
    const p = tokenFilePath();
    if (!fs.existsSync(p)) return "";
    const buf = fs.readFileSync(p);
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      try { return safeStorage.decryptString(buf); } catch (_e) { return ""; }
    }
    return buf.toString("utf8");
  } catch (_e) { return ""; }
}

function clearPersistedToken() {
  try { fs.existsSync(tokenFilePath()) && fs.unlinkSync(tokenFilePath()); } catch (_e) { /* ignore */ }
}

// Read the auth token from whichever renderer is loaded (no renderer changes needed).
async function readTokenFromWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return "";
  try {
    const token = await mainWindow.webContents.executeJavaScript(`(() => {
      try {
        const a = localStorage.getItem('joi.auth.v1');
        if (a) { const o = JSON.parse(a); if (o && o.access_token) return o.access_token; }
      } catch (e) {}
      try {
        const b = localStorage.getItem('joi_auth_state_v1');
        if (b) { const o = JSON.parse(b); if (o && (o.accessToken || o.access_token)) return o.accessToken || o.access_token; }
      } catch (e) {}
      return "";
    })()`, true);
    return String(token || "");
  } catch (_e) { return ""; }
}

function showAgentNotification(title, body) {
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title: title || "JOI", body: body || "", icon: ICON_PATH });
    n.on("click", () => showMainWindow());
    n.show();
  } catch (_e) { /* ignore */ }
}

function disconnectNotifySocket() {
  if (notifyReconnectTimer) { clearTimeout(notifyReconnectTimer); notifyReconnectTimer = null; }
  if (notifyHeartbeat) { clearInterval(notifyHeartbeat); notifyHeartbeat = null; }
  if (notifyWs) {
    try { notifyWs.onclose = null; notifyWs.close(); } catch (_e) { /* ignore */ }
    notifyWs = null;
  }
}

function connectNotifySocket(token) {
  if (!token) return;
  if (notifyWs && notifyToken === token) return; // already connected with this token
  disconnectNotifySocket();
  notifyToken = token;

  const url = `ws://${BACKEND_HOST}:${BACKEND_PORT}/ws/notifications?token=${encodeURIComponent(token)}`;
  let ws;
  try {
    ws = new WebSocket(url); // Node 22 global WebSocket (Electron main)
  } catch (_e) {
    notifyReconnectTimer = setTimeout(() => connectNotifySocket(notifyToken), 5000);
    return;
  }
  notifyWs = ws;

  ws.addEventListener("open", () => {
    notifyHeartbeat = setInterval(() => { try { ws.send("ping"); } catch (_e) { /* ignore */ } }, 30000);
  });
  ws.addEventListener("message", (ev) => {
    let d; try { d = JSON.parse(ev.data); } catch (_e) { return; }
    if (d && d.type === "notification") showAgentNotification(d.title, d.body);
    else if (d && d.type === "wake") wakeAssistant();
  });
  ws.addEventListener("close", () => {
    if (notifyHeartbeat) { clearInterval(notifyHeartbeat); notifyHeartbeat = null; }
    if (notifyToken) notifyReconnectTimer = setTimeout(() => connectNotifySocket(notifyToken), 3000);
  });
  ws.addEventListener("error", () => { try { ws.close(); } catch (_e) { /* ignore */ } });
}

// Keep the agent's token in sync with the signed-in user.
async function syncAgentToken() {
  const fromWindow = await readTokenFromWindow();
  if (fromWindow) {
    if (fromWindow !== notifyToken) {
      persistToken(fromWindow);
      connectNotifySocket(fromWindow);
    }
    return;
  }
  // No token in the window. If a window is open, the user is signed out → stop.
  if (mainWindow && !mainWindow.isDestroyed()) {
    clearPersistedToken();
    disconnectNotifySocket();
    notifyToken = null;
  }
  // If no window (background autostart), keep the persisted-token connection alive.
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow({ forceShow: true });
    registerGlobalHotkeys();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

// Windows won't let a background app steal focus with focus() alone; briefly going
// always-on-top is the standard, reliable way to bring the window to the front.
function focusAppWindow() {
  showMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.setAlwaysOnTop(true);
    mainWindow.focus();
    app.focus({ steal: true });
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(false);
    }, 300);
  } catch (_e) { /* ignore */ }
}

// ---- Quick assistant popup (bottom-right corner) ----
// Set once the AI engine and model are confirmed ready (or not needed); until then the
// shortcut opens the full app, which shows the first-run setup.
let engineReady = false;

const quickOpts = () => ({ loadRenderer, icon: ICON_PATH });

// Signed in = the agent knows a token (live window or the persisted copy).
function hasSignedInUser() {
  return Boolean(notifyToken || loadPersistedToken());
}

function canUseQuickAssistant() {
  return engineReady && hasSignedInUser();
}

// Desktop shortcut, Ctrl+Alt+J and the tray icon all come here.
function summonAssistant() {
  if (canUseQuickAssistant()) quick.toggleQuickWindow(quickOpts());
  else focusAppWindow();
}

// "Hey JOI" (backend wake_word.py): open the popup already listening for the request.
function wakeAssistant() {
  if (canUseQuickAssistant()) quick.showQuickWindow(quickOpts(), { listen: true });
  else focusAppWindow();
}

function openFullApp(conversationId) {
  quick.hideQuickWindow();
  focusAppWindow();
  if (!conversationId || !mainWindow || mainWindow.isDestroyed()) return;
  const send = () => emitDesktopEvent("open_session", { id: conversationId });
  if (mainWindow.webContents.isLoading()) mainWindow.webContents.once("did-finish-load", send);
  else send();
}

function createTray() {
  if (tray) return;
  try {
    const image = nativeImage.createFromPath(TRAY_ICON_PATH);
    tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
    tray.setToolTip("JOI: Ctrl+Alt+J to ask");
    const menu = Menu.buildFromTemplate([
      { label: "Ask JOI        Ctrl+Alt+J", click: () => summonAssistant() },
      { label: "Open full app", click: () => openFullApp() },
      { type: "separator" },
      { label: "Quit JOI", click: () => { appIsQuitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);
    tray.on("click", () => summonAssistant());
    tray.on("double-click", () => openFullApp());
  } catch (_e) { /* tray optional */ }
}

function startAgent() {
  createTray();
  // Only the installed app should auto-start; in dev this would register the bare electron.exe.
  if (app.isPackaged) {
    try { app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] }); } catch (_e) { /* ignore */ }
  }
  // Connect immediately from a persisted token (covers autostart before the user signs in again).
  const persisted = loadPersistedToken();
  if (persisted) connectNotifySocket(persisted);
  // Poll the window for the current token (login/logout) every 15s.
  if (tokenSyncTimer) clearInterval(tokenSyncTimer);
  tokenSyncTimer = setInterval(() => { syncAgentToken(); }, 15000);
}

// The React UI is built by Vite into ./dist (same folder) for both dev and packaged.
function resolveRendererIndex() {
  return path.join(__dirname, "../dist/index.html");
}

// Load the React app into a window, optionally at a hash route ("/quick" = the popup).
function loadRenderer(win, route = "") {
  // Dev convenience: set JOI_UI_DEV_URL=http://localhost:5173 for hot-reload.
  const devUrl = process.env.JOI_UI_DEV_URL;
  if (!app.isPackaged && devUrl) {
    win.loadURL(route ? `${devUrl}#${route}` : devUrl);
  } else {
    win.loadFile(resolveRendererIndex(), route ? { hash: route } : undefined);
  }
}

const BRAND_BG = "#faf7f2";

// ---- Splash: shown instantly while the backend boots (can take several seconds) ----
let splashWindow = null;

function createSplashWindow() {
  if (startHidden) return; // autostart at login: stay quiet in the tray
  splashWindow = new BrowserWindow({
    width: 380,
    height: 300,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    skipTaskbar: false,
    show: false,
    backgroundColor: BRAND_BG,
    icon: ICON_PATH,
    title: "JOI",
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:${BRAND_BG};font-family:Inter,"Segoe UI",system-ui,sans-serif;color:#17150f;-webkit-user-select:none;-webkit-app-region:drag}
    .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
          background:radial-gradient(420px 260px at 80% -10%,rgba(217,119,87,.16),transparent 70%)}
    .mark{filter:drop-shadow(0 12px 24px rgba(196,95,61,.35));animation:float 2.4s ease-in-out infinite}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
    .name{font-family:Georgia,serif;font-size:26px;font-weight:600;letter-spacing:-.01em}
    .status{font-size:13px;color:#857d70;display:flex;align-items:center;gap:8px}
    .dots span{display:inline-block;width:5px;height:5px;margin:0 2px;border-radius:50%;background:#d97757;animation:b 1.2s infinite}
    .dots span:nth-child(2){animation-delay:.15s}.dots span:nth-child(3){animation-delay:.3s}
    @keyframes b{0%,80%,100%{opacity:.25;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
  </style></head><body><div class="wrap">
    <div class="mark">${BRAND_MARK_SVG.replace('width="56" height="56"', 'width="72" height="72"')}</div>
    <div class="name">JOI</div>
    <div class="status">Starting up <span class="dots"><span></span><span></span><span></span></span></div>
  </div></body></html>`;
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  splashWindow.once("ready-to-show", () => splashWindow && splashWindow.show());
  splashWindow.on("closed", () => { splashWindow = null; });
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
  splashWindow = null;
}

function createMainWindow({ forceShow = false, show = true } = {}) {
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: "JOI",
    show: false, // reveal on ready-to-show so there's no unstyled flash
    backgroundColor: BRAND_BG,
    icon: ICON_PATH,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => {
    closeSplashWindow();
    // show=false: created in the background (the quick popup opens instead).
    if (forceShow || (show && !startHidden)) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  loadRenderer(mainWindow);

  // Pick up the signed-in user's token for the 24/7 notification socket.
  mainWindow.webContents.on("did-finish-load", () => { syncAgentToken(); });

  // Close to tray instead of quitting, so notifications keep working in background.
  mainWindow.on("close", (event) => {
    if (!appIsQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
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
    // Open / hide the quick assistant from anywhere (JOI lives in the tray after login).
    globalShortcut.register("CommandOrControl+Alt+J", () => summonAssistant());
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

// ---- Single instance + joi:// deep links ----
// Only one JOI may run. A second launch (shortcut, Start menu, or a joi:// link from the
// browser after OAuth) hands its arguments to the running instance and exits.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

function findDeepLink(argv) {
  return (argv || []).find((a) => typeof a === "string" && a.startsWith("joi://")) || "";
}

function handleDeepLink(url) {
  if (!url) return;
  focusAppWindow();
  emitDesktopEvent("deep_link", { url });
}

app.on("second-instance", (_event, argv) => {
  const link = findDeepLink(argv);
  if (link) handleDeepLink(link);
  else summonAssistant(); // desktop / Start-menu shortcut while JOI is running
});

// Register joi:// so the browser can hand the user back to the app after sign-in.
try {
  if (process.defaultApp && process.argv.length >= 2) {
    // Dev: electron.exe <app path>
    app.setAsDefaultProtocolClient("joi", process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient("joi");
  }
} catch (_e) { /* non-fatal */ }

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  ipcMain.handle("app-version", () => app.getVersion());
  ipcMain.handle("open-external", async (_event, url) => {
    // Only web links: never let the renderer launch local files/apps via the shell.
    if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
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
  // First-run setup of the on-device AI engine and model (only for the local provider).
  ipcMain.handle("engine-status", async () => {
    if (!usesLocalModel()) return { ready: true, engine: "remote" };
    try {
      const status = await aiEngine.engineStatus(app, localModelName());
      if (status.ready) engineReady = true;
      return status;
    } catch (err) {
      return { ready: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle("engine-setup", async (event) => {
    if (!usesLocalModel()) return { ok: true };
    const send = (payload) => {
      if (!event.sender.isDestroyed()) event.sender.send("engine-progress", payload);
    };
    try {
      await aiEngine.runSetup(app, localModelName(), send);
      engineReady = true;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  // Quick assistant popup → main process.
  ipcMain.handle("quick-hide", () => {
    quick.hideQuickWindow();
    return true;
  });
  ipcMain.handle("quick-open-main", (_event, conversationId) => {
    openFullApp(typeof conversationId === "string" ? conversationId : "");
    return true;
  });
  ipcMain.handle("active-app-context", async () => {
    if (process.platform === "win32") {
      return getWindowsActiveAppContext();
    }
    return { app: "", title: "", pid: 0 };
  });

  createSplashWindow();

  try {
    await ensureBackendRunning();
  } catch (err) {
    closeSplashWindow();
    const reason = err instanceof Error ? err.message : String(err);
    const tail = getBackendLogTail();
    const detail = tail ? `\n\nRecent backend logs:\n${tail}` : "";
    dialog.showErrorBox("Backend Startup Failed", `Unable to start JOI backend.\n\n${reason}${detail}`);
    app.quit();
    return;
  }

  // Signed in and the AI engine ready: launch straight into the small corner popup, with
  // the full window loaded hidden in the background. Otherwise open the full app, which
  // handles sign-in and first-run setup.
  try {
    engineReady = !usesLocalModel() || (await aiEngine.engineStatus(app, localModelName())).ready;
  } catch (_e) {
    engineReady = false;
  }
  const launchIntoQuick = !startHidden && canUseQuickAssistant() && !findDeepLink(process.argv);
  createMainWindow({ show: !launchIntoQuick });
  registerGlobalHotkeys();
  startAgent();
  startAutoUpdate({ app, notify: showAgentNotification });
  if (launchIntoQuick) {
    closeSplashWindow();
    quick.showQuickWindow(quickOpts());
  } else {
    quick.createQuickWindow(quickOpts()); // prewarm so Ctrl+Alt+J opens instantly
  }

  // Cold-started by a joi:// link (app wasn't running when the browser handed off).
  const launchLink = findDeepLink(process.argv);
  if (launchLink) handleDeepLink(launchLink);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      registerGlobalHotkeys();
    }
  });
});

function backendSetting(key) {
  return String(process.env[key] || parseEnvFileValue(backendEnvPath, key) || "").trim();
}

function usesLocalModel() {
  return backendSetting("JOI_LLM_PROVIDER").toLowerCase() === "ollama";
}

function localModelName() {
  return backendSetting("JOI_OLLAMA_MODEL") || "qwen2.5:3b";
}

// The backend keeps the local model loaded while JOI runs (no cold starts). The backend
// is force-killed on quit, so its own shutdown hook can't run — free the GPU from here.
async function unloadLocalModel() {
  const read = backendSetting;
  if (!usesLocalModel()) return;
  const base = (read("JOI_OLLAMA_BASE_URL") || "http://127.0.0.1:11434").replace(/\/+$/, "").replace(/\/v1$/, "");
  const model = localModelName();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, keep_alive: 0 }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

app.on("before-quit", (event) => {
  if (shutdownInProgress) {
    return;
  }
  shutdownInProgress = true;
  appIsQuitting = true;
  event.preventDefault();
  quick.destroyQuickWindow();
  unloadLocalModel()
    .catch(() => {})
    .then(() => stopBackendProcess())
    .catch(() => {})
    .then(() => embeddedDb && embeddedDb.stop())
    .catch(() => {})
    .then(() => aiEngine.stopEngine())
    .catch(() => {})
    .finally(() => {
      app.removeAllListeners("before-quit");
      app.quit();
    });
});

app.on("will-quit", () => {
  appIsQuitting = true;
  globalShortcut.unregisterAll();
  if (tokenSyncTimer) clearInterval(tokenSyncTimer);
  disconnectNotifySocket();
  try { tray && tray.destroy(); } catch (_e) { /* ignore */ }
});

app.on("window-all-closed", () => {
  // Intentionally do NOT quit: the tray agent keeps running so 24/7 notifications
  // continue even when the window is closed. Quit only via the tray's "Quit JOI".
});
