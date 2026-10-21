// Auto-update from GitHub Releases (see "publish" in package.json). Only runs in the
// installed app: checks on launch and every few hours, downloads in the background and
// installs when the app quits. The tray's "Check for updates" reports the result.
const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

const CHECK_EVERY = 6 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY = 30 * 1000;

let manual = false;
let downloaded = false;

function message(options) {
  return dialog.showMessageBox({ title: 'Desk Companion', ...options });
}

function check(isManual) {
  if (!app.isPackaged) {
    if (isManual) message({ message: 'Updates are only checked in the installed app.' });
    return;
  }
  if (downloaded) {
    if (isManual) offerRestart();
    return;
  }
  manual = isManual;
  autoUpdater.checkForUpdates().catch(() => {
    /* reported through the 'error' event */
  });
}

async function offerRestart() {
  const { response } = await message({
    message: 'An update is ready.',
    detail: 'Restart Desk Companion now to install it, or it will be installed the next time you quit.',
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) autoUpdater.quitAndInstall();
}

function initUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    if (manual) message({ message: `Version ${info.version} is available.`, detail: 'It is downloading in the background.' });
  });
  autoUpdater.on('update-not-available', () => {
    if (manual) message({ message: `You have the latest version (${app.getVersion()}).` });
    manual = false;
  });
  autoUpdater.on('update-downloaded', () => {
    downloaded = true;
    if (manual) offerRestart();
    manual = false;
  });
  autoUpdater.on('error', (err) => {
    console.warn('[updater]', err?.message || err);
    if (manual) message({ type: 'warning', message: 'Could not check for updates.', detail: err?.message || String(err) });
    manual = false;
  });

  setTimeout(() => check(false), FIRST_CHECK_DELAY);
  setInterval(() => check(false), CHECK_EVERY);
}

module.exports = { initUpdater, checkForUpdates: () => check(true) };
