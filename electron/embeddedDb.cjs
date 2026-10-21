// Private MongoDB for customer installs.
//
// JOI's backend stores its data in MongoDB. Customers won't have a database server, so the
// installer ships mongod.exe (see scripts/vendor-mongodb.ps1) and the app runs it here:
// bound to 127.0.0.1 only, on JOI's own port, with data in the user's app-data folder.
// WiredTiger journaling keeps the data safe even if the process is killed.

const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn, execFile } = require("child_process");

const DB_PORT = 27027; // not Mongo's default, so it never collides with a developer's own server
const START_TIMEOUT_MS = 30_000;

function findMongod(app) {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, "mongodb", "mongod.exe")]
    : [path.resolve(__dirname, "../vendor/mongodb/mongod.exe")];
  return candidates.find((p) => fs.existsSync(p)) || "";
}

function isPortOpen(port, timeoutMs = 600) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

// Minimal BSON for {shutdown: 1, $db: "admin"}; enough to stop mongod cleanly without
// pulling a MongoDB driver into the desktop app.
function shutdownCommand() {
  const cstr = (s) => Buffer.concat([Buffer.from(s, "utf8"), Buffer.from([0])]);
  const int32 = (n) => {
    const b = Buffer.alloc(4);
    b.writeInt32LE(n);
    return b;
  };
  const elements = Buffer.concat([
    Buffer.from([0x10]), cstr("shutdown"), int32(1),
    Buffer.from([0x02]), cstr("$db"), int32(Buffer.byteLength("admin") + 1), cstr("admin"),
  ]);
  const doc = Buffer.concat([int32(4 + elements.length + 1), elements, Buffer.from([0])]);
  const body = Buffer.concat([int32(0) /* flagBits */, Buffer.from([0]) /* section kind 0 */, doc]);
  const header = Buffer.concat([int32(16 + body.length), int32(1), int32(0), int32(2013) /* OP_MSG */]);
  return Buffer.concat([header, body]);
}

function sendShutdown(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => socket.write(shutdownCommand()));
    socket.setTimeout(3000, () => socket.destroy());
    socket.once("close", () => resolve());
    socket.once("error", () => resolve());
  });
}

function logTail(logFile, lines = 6) {
  try {
    return fs.readFileSync(logFile, "utf8").trim().split(/\r?\n/).slice(-lines).join("\n");
  } catch (_err) {
    return "";
  }
}

/**
 * Start (or reuse) JOI's private database. Returns { uri, stop } or null when no bundled
 * mongod is available (developer setups keep using their own MONGO_URI).
 */
async function startEmbeddedDb(app) {
  const exe = findMongod(app);
  if (!exe) return null;

  const uri = `mongodb://127.0.0.1:${DB_PORT}`;
  // Already running (e.g. a previous JOI instance crashed and left it up): reuse it.
  if (await isPortOpen(DB_PORT)) {
    return { uri, stop: () => sendShutdown(DB_PORT) };
  }

  const dataDir = path.join(app.getPath("userData"), "db");
  const logFile = path.join(app.getPath("userData"), "db.log");
  fs.mkdirSync(dataDir, { recursive: true });

  const proc = spawn(
    exe,
    ["--dbpath", dataDir, "--port", String(DB_PORT), "--bind_ip", "127.0.0.1", "--logpath", logFile, "--logappend", "--quiet"],
    { windowsHide: true, stdio: "ignore", cwd: path.dirname(exe) }
  );

  let exited = false;
  proc.once("exit", () => {
    exited = true;
  });

  const started = Date.now();
  while (Date.now() - started < START_TIMEOUT_MS) {
    if (exited) {
      throw new Error(`JOI's database stopped while starting.\n${logTail(logFile)}`);
    }
    if (await isPortOpen(DB_PORT)) {
      return {
        uri,
        async stop() {
          if (exited) return;
          await sendShutdown(DB_PORT);
          const deadline = Date.now() + 10_000;
          while (!exited && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 200));
          }
          if (!exited) {
            // Journaling makes a hard stop safe; it just replays the journal next start.
            await new Promise((r) => execFile("taskkill", ["/pid", String(proc.pid), "/t", "/f"], { windowsHide: true }, () => r()));
          }
        },
      };
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  try {
    proc.kill();
  } catch (_err) {
    /* already gone */
  }
  throw new Error(`JOI's database did not start in time.\n${logTail(logFile)}`);
}

module.exports = { startEmbeddedDb };
