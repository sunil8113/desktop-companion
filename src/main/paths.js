const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ASSETS = path.join(ROOT, 'assets');

module.exports = {
  ROOT,
  trayIcon: path.join(ASSETS, 'tray.png'),
  appIcon: path.join(ASSETS, 'icon.png'),
  sounds: path.join(ASSETS, 'sounds'),
  characters: path.join(ASSETS, 'character'),
  localCharacters: path.join(ROOT, 'local-characters'),
  props: path.join(ASSETS, 'props'),
  settingsHtml: path.join(ROOT, 'src', 'renderer', 'settings', 'index.html'),
  overlayHtml: path.join(ROOT, 'src', 'renderer', 'overlay', 'index.html'),
  settingsPreload: path.join(ROOT, 'src', 'preload', 'settings.js'),
  overlayPreload: path.join(ROOT, 'src', 'preload', 'overlay.js'),
};
