// Updates from GitHub Releases (see "publish" in package.json). Only runs in the installed
// app: checks on launch and every few hours. The tray's "Check for updates" reports the result.
//
// Windows: electron-updater downloads in the background and installs when the app quits.
// macOS: electron-updater only installs code-signed apps, and the Mac build isn't signed, so
// there we look up the latest release and offer to open its download page instead.
const { app, dialog, shell, net } = require('electron');
const { autoUpdater } = require('electron-updater');

const CHECK_EVERY = 6 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY = 30 * 1000;
const MAC = process.platform === 'darwin';
const RELEASES_PAGE = 'https://github.com/sunil8113/desktop-companion/releases/latest';
const LATEST_RELEASE_API = 'https://api.github.com/repos/sunil8113/desktop-companion/releases/latest';

let manual = false;
let downloaded = false;
let announced = null; // Mac: the newer version we last told the user about

function message(options) {
  return dialog.showMessageBox({ title: 'Desk Companion', ...options });
}

function check(isManual) {
  if (!app.isPackaged) {
    if (isManual) message({ message: 'Updates are only checked in the installed app.' });
    return;
  }
  if (MAC) {
    checkMac(isManual);
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

// "1.10.0" > "1.9.2"
function isNewer(version, than) {
  const a = version.split('.').map(Number);
  const b = than.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

async function checkMac(isManual) {
  let latest;
  try {
    const res = await net.fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    latest = String((await res.json()).tag_name || '').replace(/^v/, '');
  } catch (err) {
    console.warn('[updater]', err.message);
    if (isManual) message({ type: 'warning', message: 'Could not check for updates.', detail: err.message });
    return;
  }
  if (!isNewer(latest, app.getVersion())) {
    if (isManual) message({ message: `You have the latest version (${app.getVersion()}).` });
    return;
  }
  if (!isManual && announced === latest) return; // don't nag every few hours
  announced = latest;
  const { response } = await message({
    message: `Version ${latest} is available.`,
    detail: 'Download it and drag it into Applications to replace this version. Your settings are kept.',
    buttons: ['Download', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) shell.openExternal(RELEASES_PAGE);
}

function initUpdater() {
  if (!app.isPackaged) return;
  if (!MAC) {
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
  }

  setTimeout(() => check(false), FIRST_CHECK_DELAY);
  setInterval(() => check(false), CHECK_EVERY);
}

module.exports = { initUpdater, checkForUpdates: () => check(true) };
