const path = require('node:path');
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } = require('electron');
const { fetchUserStats } = require('./lib/stats');
const { loadConfig, saveConfig, isConfigured } = require('./lib/config');

// Ubuntu 24.04+ 默认限制非特权 user namespace（AppArmor
// apparmor_restrict_unprivileged_userns=1），Electron 的 SUID 沙箱因此无法启动，
// 安装版（/opt 下）会一启动就崩。本应用只渲染本地 UI，关闭沙箱影响很小。
// 某些桌面环境 /dev/shm 权限或挂载异常会让 Chromium 渲染进程崩溃，
// 导致本地 file:// 页面加载失败；改用临时目录保存共享内存。
// 必须在 app ready 之前追加这些开关。
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let CONFIG = null;        // 运行时配置，在 app ready 后从 userData 读取
let CONFIG_DIR = null;    // app.getPath('userData')

function detailsUrl() {
  if (!CONFIG || !isConfigured(CONFIG)) return null;
  return `https://${CONFIG.apiHost}/admin-next/api-stats?apiId=${CONFIG.apiId}`;
}

let mainWindow = null;
let tray = null;
let lastSuccess = null;     // 上一次成功的规范化对象
let lastError = null;       // 字符串或 null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 320,
    resizable: false,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  // Packaged Linux builds can load the local file before app.whenReady's later
  // setup continues, so bind load events before calling loadFile().
  mainWindow.webContents.on('did-finish-load', () => {
    broadcast();
    fetchAndBroadcast();
    if (!isConfigured(CONFIG)) openSettingsWindow();
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`Main window failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`Main window renderer exited: ${details.reason} (${details.exitCode})`);
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html')).catch((e) => {
    console.error(`Main window loadFile failed: ${e.message || e}`);
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

let settingsWindow = null;

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 360,
    height: 280,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function createTray() {
  // macOS 用模板图标（黑色 + 透明），系统自动按菜单栏主题反色；
  // 其他平台用彩色 sparkle。
  const iconPath = process.platform === 'darwin'
    ? path.join(__dirname, 'assets', 'tray-iconTemplate.png')
    : path.join(__dirname, 'assets', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  // 模板图像：xxxTemplate.png 命名约定 Electron 会自动识别，无需手动 setTemplateImage

  tray = new Tray(icon);
  tray.setTitle('$-- / $--');               // macOS 菜单栏文字；Linux 多数桌面不显示
  tray.setToolTip('Claude Code 账号额度 — $-- / $--');
  if (process.platform === 'darwin') {
    tray.setIgnoreDoubleClickEvents(true);  // 单击立即响应，不等双击判定
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => { mainWindow && mainWindow.show(); mainWindow && mainWindow.focus(); } },
    { label: '立即刷新',   click: () => { fetchAndBroadcast(); } },
    { label: '账号设置',   click: () => { openSettingsWindow(); } },
    { label: '查看详情',   click: () => {
        const url = detailsUrl();
        if (url) shell.openExternal(url);
        else openSettingsWindow();
      } },
    { type: 'separator' },
    { label: '退出',       click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

async function fetchAndBroadcast() {
  if (!isConfigured(CONFIG)) {
    broadcast();
    return;
  }
  try {
    const data = await fetchUserStats(CONFIG.apiId, { host: CONFIG.apiHost, path: CONFIG.apiPath });
    lastSuccess = data;
    lastError = null;
    broadcast();
  } catch (e) {
    lastError = e.message || String(e);
    broadcast();
  }
}

function broadcast() {
  const payload = { lastSuccess, lastError, now: Date.now(), configured: isConfigured(CONFIG) };

  if (tray) {
    const txt = lastSuccess ? lastSuccess.trayText : '$-- / $--';
    tray.setTitle(lastError ? `●${txt}` : txt);          // macOS only；去前缀空格压缩宽度
    tray.setToolTip(`Claude Code 账号额度 — ${txt}`);
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('stats-update', payload);
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);            // 去掉默认 File/Edit/View 菜单
  CONFIG_DIR = app.getPath('userData');
  CONFIG = loadConfig(CONFIG_DIR);

  createWindow();
  createTray();

  ipcMain.on('refresh-request', () => { fetchAndBroadcast(); });

  ipcMain.handle('settings:get', () => ({ apiId: CONFIG.apiId, apiHost: CONFIG.apiHost }));

  ipcMain.handle('settings:save', (_e, data) => {
    try {
      saveConfig(CONFIG_DIR, data);
      CONFIG = loadConfig(CONFIG_DIR);
      fetchAndBroadcast();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  });

  ipcMain.on('settings:close', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
  });

  setInterval(fetchAndBroadcast, CONFIG.pollIntervalMs);
});

// macOS：点击 Dock 图标触发 activate，显示主窗口
app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
});

// 阻止所有窗口关闭时退出 — 走托盘菜单退出
app.on('window-all-closed', () => {
  // 这个事件在 close 被 preventDefault 后实际不会触发；保留空 handler 防止默认退出行为
});
