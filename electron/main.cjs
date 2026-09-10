const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// ── Pasta de dados do usuário ──────────────────────────────────────────────────
const userDataPath = path.join(app.getPath('appData'), 'PDVTotal');
app.setPath('userData', userDataPath);

// ── Determina se está em modo desenvolvimento ──────────────────────────────────
const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;

// ── Configuração do Auto-Updater ──────────────────────────────────────────────
autoUpdater.autoDownload = false; // Pergunta antes ou baixa pelo botão
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater(win) {
  if (isDev) return;

  autoUpdater.on('checking-for-update', () => {
    win.webContents.send('update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update-status', { 
      status: 'available', 
      version: info.version,
      releaseNotes: info.releaseNotes 
    });
  });

  autoUpdater.on('update-not-available', () => {
    win.webContents.send('update-status', { status: 'not-available' });
  });

  autoUpdater.on('error', (err) => {
    win.webContents.send('update-status', { status: 'error', error: err.message });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    win.webContents.send('update-status', { 
      status: 'downloading', 
      percent: Math.round(progressObj.percent),
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('update-status', { status: 'downloaded', version: info.version });
  });

  // Checa atualizações 5 segundos após abrir e a cada 15 minutos
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 5000);

  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 15 * 60 * 1000);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: 'PDV Total',
    // Ícone da janela (Windows taskbar)
    icon: path.join(__dirname, '..', 'public', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow = win;

  // ── Carrega a URL correta dependendo do ambiente ─────────────────────────────
  if (isDev) {
    win.loadURL('http://localhost:8081');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // ── Remove menu padrão do Electron ────────────────────────────────────────
  win.removeMenu();

  setupAutoUpdater(win);

  // ── IPC Handlers para Atualização ──────────────────────────────────────────
  ipcMain.handle('check-for-updates', async () => {
    if (isDev) return { status: 'dev-mode' };
    return await autoUpdater.checkForUpdates();
  });

  ipcMain.handle('download-update', async () => {
    return await autoUpdater.downloadUpdate();
  });

  ipcMain.handle('quit-and-install', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // ── Impressão: Lista as impressoras disponíveis ──────────────────────────────
  ipcMain.handle('get-printers', async () => {
    return await win.webContents.getPrintersAsync();
  });

  // ── Impressão: Imprime um conteúdo HTML em uma impressora ────────────────────
  ipcMain.handle('print-html', async (event, { html, printer, silent }) => {
    const hiddenWin = new BrowserWindow({
      show: false,
      width: 400,
      height: 800,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    hiddenWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    return new Promise((resolve, reject) => {
      hiddenWin.webContents.on('did-finish-load', () => {
        // Aguarda 150ms para garantir que SVGs e estilos do cupom foram renderizados
        setTimeout(() => {
          hiddenWin.webContents.print(
            {
              silent: silent === undefined ? true : silent,
              deviceName: printer || undefined,
              printBackground: true,
              color: false, // Monocromático para impressoras térmicas (Bematech / Daruma / Elgin)
              margins: { marginType: 'none' },
            },
            (success, failureReason) => {
              hiddenWin.close();
              if (success) resolve(true);
              else reject(new Error(failureReason || 'Falha na impressão'));
            }
          );
        }, 150);
      });
    });
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
