const { BrowserWindow } = require('electron');
const paths = require('./paths');
const { harden } = require('./harden');

let win = null;

function open() {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return win;
  }
  win = new BrowserWindow({
    width: 760,
    height: 820,
    minWidth: 560,
    minHeight: 520,
    title: 'Desk Companion Settings',
    icon: paths.appIcon,
    backgroundColor: '#0d1424',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: paths.settingsPreload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  harden(win);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    win = null;
  });
  win.loadFile(paths.settingsHtml);
  return win;
}

const owns = (webContents) => Boolean(win && !win.isDestroyed() && win.webContents === webContents);
const windowFor = () => (win && !win.isDestroyed() ? win : null);

module.exports = { open, owns, windowFor };
