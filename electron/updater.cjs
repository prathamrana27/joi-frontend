// Background auto-update for installed copies of JOI.
//
// Releases live next to the installer on S3 (see "publish" in package.json). Each release
// uploads JOI-Setup-<version>.exe, its .blockmap and latest.yml; electron-updater checks
// latest.yml, downloads only the changed blocks, verifies the SHA-512, and installs when
// the user quits JOI. Once the app is code-signed, updates must also carry the same
// publisher signature.

const { autoUpdater } = require("electron-updater");

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

function startAutoUpdate({ app, notify }) {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on("update-downloaded", (info) => {
    notify(
      `JOI ${info.version} is ready`,
      "It installs automatically the next time you quit JOI from the tray."
    );
  });
  // Offline, or no release published yet: try again on the next interval.
  autoUpdater.on("error", () => {});

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 30_000); // let JOI finish starting first
  setInterval(check, CHECK_EVERY_MS);
}

module.exports = { startAutoUpdate };
