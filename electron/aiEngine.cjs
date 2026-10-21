// JOI's on-device AI engine: check the hardware, find or install the engine, run it
// hidden, and make sure the model is downloaded. Users only ever see "JOI".
//
// The engine is Ollama. It's too big to bundle (≈1.5 GB), so first-run setup downloads
// a pinned release, verifies its SHA-256, and unpacks it into JOI's app-data folder.

const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const nodeCrypto = require("crypto");
const { spawn, execFile } = require("child_process");

// Pinned engine release. Bump all three together; take the digest from the GitHub
// release API ("digest" on the ollama-windows-amd64.zip asset).
const ENGINE = {
  version: "v0.40.0",
  url: "https://github.com/ollama/ollama/releases/download/v0.40.0/ollama-windows-amd64.zip",
  size: 1468064949,
  sha256: "3623e256762ca89bd6fa99b0cc4106401919ce9df926411673e632e3ea287bb5",
};
const ENGINE_HOST = "127.0.0.1:11434";
const API = `http://${ENGINE_HOST}`;
const GB = 1024 ** 3;

let engineProc = null;

const exists = (p) => {
  try {
    return fs.existsSync(p);
  } catch (_err) {
    return false;
  }
};

function managedDir(app) {
  return path.join(app.getPath("userData"), "engine");
}

function managedExe(app) {
  return path.join(managedDir(app), "ollama.exe");
}

function systemExe() {
  return path.join(process.env.LOCALAPPDATA || "", "Programs", "Ollama", "ollama.exe");
}

async function api(pathname, { method = "GET", body, timeoutMs = 2000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${pathname}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function engineUp() {
  try {
    return (await api("/api/version")).ok;
  } catch (_err) {
    return false;
  }
}

async function hasModel(model) {
  try {
    const res = await api("/api/tags");
    const data = await res.json();
    return (data.models || []).some((m) => m.name === model || m.model === model);
  } catch (_err) {
    return false;
  }
}

function nvidiaGpu() {
  return new Promise((resolve) => {
    execFile(
      "nvidia-smi",
      ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
      { windowsHide: true, timeout: 4000 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const [name, mem] = String(stdout).split("\n")[0].split(",").map((s) => s.trim());
        resolve(name ? { name, vramGB: Math.round((Number(mem) / 1024) * 10) / 10 } : null);
      }
    );
  });
}

function freeDiskGB(dir) {
  try {
    const s = fs.statfsSync(dir);
    return Math.round(((s.bavail * s.bsize) / GB) * 10) / 10;
  } catch (_err) {
    return null;
  }
}

/** What this PC has, and whether JOI will run well on it. */
async function hardwareReport(app, { needsEngine }) {
  const ramGB = Math.round((os.totalmem() / GB) * 10) / 10;
  const diskGB = freeDiskGB(app.getPath("userData"));
  const gpu = await nvidiaGpu();
  // Engine download + unpacked engine + model; the zip is deleted after unpacking.
  const needDiskGB = needsEngine ? 7 : 2.5;
  const issues = [];
  if (ramGB < 7) issues.push(`JOI works best with 8 GB of memory; this PC has ${ramGB} GB, so replies may be slow.`);
  if (diskGB !== null && diskGB < needDiskGB) {
    issues.push(`Setup needs about ${needDiskGB} GB of free disk space; only ${diskGB} GB is free.`);
  }
  return {
    ramGB,
    diskGB,
    gpu,
    needDiskGB,
    blocking: diskGB !== null && diskGB < needDiskGB,
    issues,
    speed: gpu && gpu.vramGB >= 3.5 ? "fast" : "standard",
  };
}

/** Start an installed engine if it isn't already running. */
async function startEngine(app) {
  if (await engineUp()) return "running";
  const managed = managedExe(app);
  const exe = [managed, systemExe()].find(exists);
  if (!exe) return "missing";

  const env = { ...process.env, OLLAMA_HOST: ENGINE_HOST };
  if (exe === managed) {
    // Keep JOI's own engine self-contained inside JOI's data folder.
    env.OLLAMA_MODELS = path.join(app.getPath("userData"), "models");
  }
  engineProc = spawn(exe, ["serve"], { env, windowsHide: true, stdio: "ignore", cwd: path.dirname(exe) });
  engineProc.once("exit", () => {
    engineProc = null;
  });

  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (await engineUp()) return "started";
    if (!engineProc) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  return "failed";
}

/** Stop the engine only if JOI started it (never a server the user runs themselves). */
function stopEngine() {
  if (!engineProc) return Promise.resolve();
  const pid = engineProc.pid;
  engineProc = null;
  return new Promise((r) => execFile("taskkill", ["/pid", String(pid), "/t", "/f"], { windowsHide: true }, () => r()));
}

// Resumable download that follows redirects (GitHub release assets redirect to a CDN).
function download(url, dest, onBytes) {
  const part = `${dest}.part`;
  return new Promise((resolve, reject) => {
    const attempt = (target, redirects) => {
      const have = exists(part) ? fs.statSync(part).size : 0;
      const req = https.get(
        target,
        { headers: { "User-Agent": "JOI-Desktop", ...(have ? { Range: `bytes=${have}-` } : {}) } },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            if (redirects > 5) return reject(new Error("Too many redirects"));
            return attempt(new URL(res.headers.location, target).toString(), redirects + 1);
          }
          if (res.statusCode === 416) {
            res.resume();
            return resolve(fs.renameSync(part, dest)); // already complete
          }
          if (res.statusCode !== 200 && res.statusCode !== 206) {
            res.resume();
            return reject(new Error(`Download failed (HTTP ${res.statusCode})`));
          }
          const resumed = res.statusCode === 206;
          let done = resumed ? have : 0;
          const out = fs.createWriteStream(part, { flags: resumed ? "a" : "w" });
          res.on("data", (chunk) => {
            done += chunk.length;
            onBytes(done);
          });
          res.pipe(out);
          out.on("finish", () => {
            fs.renameSync(part, dest);
            resolve();
          });
          res.on("error", reject);
          out.on("error", reject);
        }
      );
      req.on("error", reject);
    };
    attempt(url, 0);
  });
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = nodeCrypto.createHash("sha256");
    fs.createReadStream(file)
      .on("data", (d) => hash.update(d))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

async function installEngine(app, progress) {
  const dir = managedDir(app);
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(app.getPath("userData"), "engine-download.zip");

  if (!exists(zip)) {
    await download(ENGINE.url, zip, (bytes) =>
      progress({ phase: "engine", label: "Downloading JOI's AI engine", done: bytes, total: ENGINE.size })
    );
  }

  progress({ phase: "engine", label: "Checking the download", done: ENGINE.size, total: ENGINE.size });
  const digest = await sha256File(zip);
  if (digest !== ENGINE.sha256) {
    fs.rmSync(zip, { force: true });
    throw new Error("The engine download was corrupted or tampered with, so JOI deleted it. Please try again.");
  }

  progress({ phase: "engine", label: "Unpacking", done: ENGINE.size, total: ENGINE.size });
  // Windows 10+ ships bsdtar, which unpacks .zip archives.
  await new Promise((resolve, reject) =>
    execFile("tar", ["-xf", zip, "-C", dir], { windowsHide: true }, (err) => (err ? reject(err) : resolve()))
  );
  fs.rmSync(zip, { force: true });
  if (!exists(managedExe(app))) throw new Error("The engine files were not where JOI expected after unpacking.");
}

async function pullModel(model, progress) {
  const res = await fetch(`${API}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`Model download failed (HTTP ${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.error) throw new Error(msg.error);
      if (msg.total) {
        progress({ phase: "model", label: "Downloading JOI's brain", done: msg.completed || 0, total: msg.total });
      } else if (msg.status === "success") {
        progress({ phase: "model", label: "Downloaded", done: 1, total: 1 });
      }
    }
  }
}

/** Quick check used at launch: is everything in place? */
async function engineStatus(app, model) {
  const state = await startEngine(app);
  const ready = (state === "running" || state === "started") && (await hasModel(model));
  return { ready, engine: state, model };
}

/** Full first-run setup with progress callbacks. Safe to re-run; skips finished steps. */
async function runSetup(app, model, progress) {
  let state = await startEngine(app);
  const hardware = await hardwareReport(app, { needsEngine: state === "missing" });
  progress({ phase: "check", hardware });
  if (hardware.blocking) throw new Error(hardware.issues.join(" "));

  if (state === "missing" || state === "failed") {
    if (state === "missing") await installEngine(app, progress);
    state = await startEngine(app);
    if (state !== "running" && state !== "started") throw new Error("JOI's AI engine didn't start. Restart your PC and try again.");
  }

  if (!(await hasModel(model))) await pullModel(model, progress);

  progress({ phase: "warm", label: "Waking JOI up" });
  try {
    await api("/api/generate", { method: "POST", body: { model, prompt: "hi", stream: false, options: { num_predict: 1 } }, timeoutMs: 120_000 });
  } catch (_err) {
    // Warm-up is best effort; the backend warms the model again at startup.
  }
  progress({ phase: "done" });
  return { ready: true };
}

module.exports = { engineStatus, runSetup, stopEngine, hardwareReport, ENGINE };
