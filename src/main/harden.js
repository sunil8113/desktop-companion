// Our windows only ever show local pages: block navigation and pop-ups.
function harden(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

module.exports = { harden };
