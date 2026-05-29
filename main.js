const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, dialog } = require('electron');
const { fetchUserStats } = require('./lib/stats');

// ===== 配置 =====
// 真实配置在 config.json（已 gitignore），模板在 config.example.json。
// 首次运行需把 config.example.json 复制为 config.json 并填入 apiId。
const CONFIG_PATH = path.join(__dirname, 'config.json');
const CONFIG_EXAMPLE_PATH = path.join(__dirname, 'config.example.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    const msg = `缺少 config.json。\n\n请复制 config.example.json 为 config.json，并填入你的 apiId：\n  cp ${CONFIG_EXAMPLE_PATH} ${CONFIG_PATH}`;
    if (app.isReady()) dialog.showErrorBox('配置缺失', msg);
    console.error(msg);
    app.quit();
    throw new Error('config.json missing');
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  for (const k of ['apiId', 'apiHost', 'apiPath', 'pollIntervalMs']) {
    if (cfg[k] === undefined || cfg[k] === '' || cfg[k] === null) {
      throw new Error(`config.json 缺少字段: ${k}`);
    }
  }
  return cfg;
}

const CONFIG = loadConfig();
const API_ID = CONFIG.apiId;
const API_HOST = CONFIG.apiHost;
const API_PATH = CONFIG.apiPath;
const POLL_INTERVAL_MS = CONFIG.pollIntervalMs;
const DETAILS_URL = `https://${API_HOST}/admin-next/api-stats?apiId=${API_ID}`;
// =================

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
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  if (process.platform === 'darwin') icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setTitle('  $-- / $--');             // macOS 菜单栏文字；Linux 多数桌面不显示
  tray.setToolTip('Claude Code 账号额度 — $-- / $--');

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => { mainWindow && mainWindow.show(); mainWindow && mainWindow.focus(); } },
    { label: '立即刷新',   click: () => { fetchAndBroadcast(); } },
    { label: '查看详情',   click: () => { shell.openExternal(DETAILS_URL); } },
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
  try {
    const data = await fetchUserStats(API_ID, { host: API_HOST, path: API_PATH });
    lastSuccess = data;
    lastError = null;
    broadcast();
  } catch (e) {
    lastError = e.message || String(e);
    broadcast();
  }
}

function broadcast() {
  const payload = { lastSuccess, lastError, now: Date.now() };

  if (tray) {
    const txt = lastSuccess ? lastSuccess.trayText : '$-- / $--';
    tray.setTitle(lastError ? `● ${txt}` : `  ${txt}`);   // macOS only
    tray.setToolTip(`Claude Code 账号额度 — ${txt}`);
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('stats-update', payload);
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);            // 去掉默认 File/Edit/View 菜单
  createWindow();
  createTray();

  ipcMain.on('refresh-request', () => { fetchAndBroadcast(); });

  // 窗口加载完后立刻推送一次当前状态，避免 renderer 错过启动那次
  mainWindow.webContents.on('did-finish-load', () => {
    broadcast();
    fetchAndBroadcast();
  });

  setInterval(fetchAndBroadcast, POLL_INTERVAL_MS);
});

// 阻止所有窗口关闭时退出 — 走托盘菜单退出
app.on('window-all-closed', () => {
  // 这个事件在 close 被 preventDefault 后实际不会触发；保留空 handler 防止默认退出行为
});
