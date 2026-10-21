const path = require('path');
const { app } = require('electron');

const ROOT = path.join(__dirname, '..', '..');
const ASSETS = path.join(ROOT, 'assets');
const BUNDLED_CHARACTERS = path.join(ROOT, 'local-characters');

module.exports = {
  ROOT,
  trayIcon: path.join(ASSETS, 'tray.png'),
  appIcon: path.join(ASSETS, 'icon.png'),
  sounds: path.join(ASSETS, 'sounds'),
  characters: path.join(ASSETS, 'character'),
  // The installed app keeps personal companions in <userData> so they survive updates.
  // A build that bundles some copies them there on first run (see seedCompanions in main.js).
  localCharacters: app.isPackaged ? path.join(app.getPath('userData'), 'local-characters') : BUNDLED_CHARACTERS,
  bundledCharacters: BUNDLED_CHARACTERS,
  props: path.join(ASSETS, 'props'),
  settingsHtml: path.join(ROOT, 'src', 'renderer', 'settings', 'index.html'),
  overlayHtml: path.join(ROOT, 'src', 'renderer', 'overlay', 'index.html'),
  settingsPreload: path.join(ROOT, 'src', 'preload', 'settings.js'),
  overlayPreload: path.join(ROOT, 'src', 'preload', 'overlay.js'),
};
