// electron-builder afterPack hook: stamp JOI's icon and version details into JOI.exe, so
// the desktop shortcut, taskbar and Start menu show JOI's logo instead of Electron's.
//
// electron-builder can do this itself (win.signAndEditExecutable), but that downloads a
// tool bundle whose macOS symlinks can't be unpacked on Windows without admin rights or
// Developer Mode. rcedit does the same job on any machine.

const path = require("path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;
  const { rcedit } = await import("rcedit");
  const info = context.packager.appInfo;
  const exe = path.join(context.appOutDir, `${info.productFilename}.exe`);
  await rcedit(exe, {
    icon: path.join(context.packager.projectDir, "assets", "icon.ico"),
    "file-version": info.version,
    "product-version": info.version,
    "version-string": {
      ProductName: "JOI",
      FileDescription: "JOI",
      CompanyName: "JOI",
      InternalName: "JOI",
      OriginalFilename: `${info.productFilename}.exe`,
      LegalCopyright: `© ${new Date().getFullYear()} JOI`,
    },
  });
  console.log(`  • stamped JOI icon and version ${info.version} into ${path.basename(exe)}`);
};
