# 账号设置功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 apiId/apiHost 从项目代码中移出，改为用户在程序内通过「账号设置」窗口输入，保存到跨平台的 userData 目录，下次启动自动加载。

**Architecture:** 新增平台无关的 `lib/config.js`（纯 I/O，接收 configDir 参数）负责读写配置。`main.js` 在 `app.whenReady()` 内用 `app.getPath('userData')` 读配置，未配置时自动弹出独立设置窗口。设置窗口（`renderer/settings.html` + `settings.js` + `settings-preload.js`）通过 IPC 与主进程交互保存配置。

**Tech Stack:** Electron 32, Node 内置 `node:test` / `node:assert`，CommonJS。

---

## File Structure

- **Create** `lib/config.js` — 配置读写（平台无关，纯函数 + I/O，接收 configDir）。
- **Create** `test/config.test.js` — `lib/config.js` 单元测试。
- **Create** `renderer/settings.html` — 设置窗口页面。
- **Create** `renderer/settings.js` — 设置窗口渲染逻辑。
- **Create** `settings-preload.js` — 设置窗口的 preload，暴露 `window.settingsApi`。
- **Modify** `main.js` — 删除旧 loadConfig/顶层 CONFIG，改为 ready 后读 userData；新增 openSettingsWindow、IPC handler、托盘菜单项、未配置广播。
- **Modify** `renderer/index.html` — 增加「未配置」视图。
- **Modify** `renderer/renderer.js` — 处理 payload.configured 标志，渲染未配置视图。
- **Modify** `renderer/style.css` — 设置窗口表单样式 + 未配置视图样式。

---

## Task 1: lib/config.js + 测试

**Files:**
- Create: `lib/config.js`
- Test: `test/config.test.js`

- [ ] **Step 1: 写失败的测试**

Create `test/config.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULTS, getConfigPath, loadConfig, saveConfig, isConfigured } = require('../lib/config');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claudestatus-test-'));
}

test('getConfigPath 拼出 configDir/config.json', () => {
  assert.equal(getConfigPath('/foo/bar'), path.join('/foo/bar', 'config.json'));
});

test('loadConfig: 文件不存在时返回空 apiId/apiHost + 默认常量', () => {
  const dir = tmpDir();
  const cfg = loadConfig(dir);
  assert.equal(cfg.apiId, '');
  assert.equal(cfg.apiHost, '');
  assert.equal(cfg.apiPath, DEFAULTS.apiPath);
  assert.equal(cfg.pollIntervalMs, DEFAULTS.pollIntervalMs);
});

test('saveConfig 后 loadConfig 能读回 apiId/apiHost', () => {
  const dir = tmpDir();
  saveConfig(dir, { apiId: 'abc', apiHost: 'h.com' });
  const cfg = loadConfig(dir);
  assert.equal(cfg.apiId, 'abc');
  assert.equal(cfg.apiHost, 'h.com');
  assert.equal(cfg.apiPath, DEFAULTS.apiPath);
  assert.equal(cfg.pollIntervalMs, DEFAULTS.pollIntervalMs);
});

test('saveConfig 在目录不存在时自动创建', () => {
  const dir = path.join(tmpDir(), 'nested', 'deep');
  saveConfig(dir, { apiId: 'x', apiHost: 'y.com' });
  assert.ok(fs.existsSync(path.join(dir, 'config.json')));
});

test('saveConfig 只写 apiId/apiHost 两个字段', () => {
  const dir = tmpDir();
  saveConfig(dir, { apiId: 'x', apiHost: 'y.com' });
  const raw = JSON.parse(fs.readFileSync(getConfigPath(dir), 'utf8'));
  assert.deepEqual(Object.keys(raw).sort(), ['apiHost', 'apiId']);
});

test('saveConfig 对空 apiId 抛错', () => {
  const dir = tmpDir();
  assert.throws(() => saveConfig(dir, { apiId: '', apiHost: 'y.com' }), /apiId/);
});

test('saveConfig 对空 apiHost 抛错', () => {
  const dir = tmpDir();
  assert.throws(() => saveConfig(dir, { apiId: 'x', apiHost: '' }), /apiHost/);
});

test('isConfigured: 两字段都非空才 true', () => {
  assert.equal(isConfigured({ apiId: 'x', apiHost: 'y.com' }), true);
  assert.equal(isConfigured({ apiId: '', apiHost: 'y.com' }), false);
  assert.equal(isConfigured({ apiId: 'x', apiHost: '' }), false);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/config.test.js`
Expected: FAIL — `Cannot find module '../lib/config'`

- [ ] **Step 3: 写最小实现**

Create `lib/config.js`:

```javascript
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  apiPath: '/apiStats/api/user-stats',
  pollIntervalMs: 30000,
};

function getConfigPath(configDir) {
  return path.join(configDir, 'config.json');
}

function loadConfig(configDir) {
  const base = { ...DEFAULTS, apiId: '', apiHost: '' };
  try {
    const raw = fs.readFileSync(getConfigPath(configDir), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...base,
      apiId: typeof parsed.apiId === 'string' ? parsed.apiId : '',
      apiHost: typeof parsed.apiHost === 'string' ? parsed.apiHost : '',
    };
  } catch {
    return base;
  }
}

function saveConfig(configDir, { apiId, apiHost } = {}) {
  if (typeof apiId !== 'string' || apiId.trim() === '') {
    throw new Error('apiId 不能为空');
  }
  if (typeof apiHost !== 'string' || apiHost.trim() === '') {
    throw new Error('apiHost 不能为空');
  }
  fs.mkdirSync(configDir, { recursive: true });
  const data = { apiId: apiId.trim(), apiHost: apiHost.trim() };
  fs.writeFileSync(getConfigPath(configDir), JSON.stringify(data, null, 2), 'utf8');
  return data;
}

function isConfigured(cfg) {
  return Boolean(cfg && typeof cfg.apiId === 'string' && cfg.apiId.trim()
    && typeof cfg.apiHost === 'string' && cfg.apiHost.trim());
}

module.exports = { DEFAULTS, getConfigPath, loadConfig, saveConfig, isConfigured };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/config.test.js`
Expected: PASS — 8 tests pass

- [ ] **Step 5: 跑全部测试确保没破坏 stats**

Run: `npm test`
Expected: PASS — 全部通过（含 stats.test.js）

- [ ] **Step 6: 提交**

```bash
git add lib/config.js test/config.test.js
git commit -m "feat: add platform-agnostic config module"
```

注：`test/` 在 `.gitignore` 中，`git add` 会被忽略。若需纳入版本控制用 `git add -f test/config.test.js`。先检查 `git status` 确认。

---

## Task 2: settings-preload.js

**Files:**
- Create: `settings-preload.js`

- [ ] **Step 1: 写实现**（preload 是 Electron 集成层，无单测，靠 Task 5 手动验证）

Create `settings-preload.js`:

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (data) => ipcRenderer.invoke('settings:save', data),
  close: () => ipcRenderer.send('settings:close'),
});
```

- [ ] **Step 2: 提交**

```bash
git add settings-preload.js
git commit -m "feat: add settings window preload bridge"
```

---

## Task 3: 设置窗口页面（html + js + css）

**Files:**
- Create: `renderer/settings.html`
- Create: `renderer/settings.js`
- Modify: `renderer/style.css`

- [ ] **Step 1: 创建 settings.html**

Create `renderer/settings.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'">
  <title>账号设置</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main>
    <h2>账号设置</h2>
    <div class="field">
      <label for="apiId">API ID</label>
      <input id="apiId" type="text" autocomplete="off" spellcheck="false" placeholder="UUID 格式的 apiId">
    </div>
    <div class="field">
      <label for="apiHost">API Host</label>
      <input id="apiHost" type="text" autocomplete="off" spellcheck="false" placeholder="例如 example.com（不含 https://）">
    </div>
    <p id="form-error" class="form-error" hidden></p>
    <div class="actions">
      <button id="cancel-btn" type="button" class="secondary">取消</button>
      <button id="save-btn" type="button">保存</button>
    </div>
  </main>
  <script src="settings.js"></script>
</body>
</html>
```

- [ ] **Step 2: 创建 settings.js**

Create `renderer/settings.js`:

```javascript
const apiIdEl = document.getElementById('apiId');
const apiHostEl = document.getElementById('apiHost');
const errEl = document.getElementById('form-error');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');

function showError(msg) {
  errEl.textContent = msg;
  errEl.hidden = !msg;
}

async function init() {
  const cfg = await window.settingsApi.get();
  apiIdEl.value = cfg.apiId || '';
  apiHostEl.value = cfg.apiHost || '';
}

saveBtn.addEventListener('click', async () => {
  showError('');
  const data = { apiId: apiIdEl.value.trim(), apiHost: apiHostEl.value.trim() };
  const res = await window.settingsApi.save(data);
  if (res && res.ok) {
    window.settingsApi.close();
  } else {
    showError((res && res.error) || '保存失败');
  }
});

cancelBtn.addEventListener('click', () => window.settingsApi.close());

init();
```

- [ ] **Step 3: 在 style.css 末尾追加表单样式**

Append to `renderer/style.css`:

```css
/* settings form */
.field { margin-bottom: 12px; }
.field label { display: block; font-size: 11px; opacity: 0.65; margin-bottom: 4px; }
.field input {
  width: 100%;
  font-size: 13px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid rgba(128,128,128,0.4);
  background: transparent;
  color: inherit;
}
.form-error { font-size: 11px; color: #ff3b30; margin-bottom: 10px; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
button.secondary { background: rgba(128,128,128,0.25); color: inherit; }
```

- [ ] **Step 4: 提交**

```bash
git add renderer/settings.html renderer/settings.js renderer/style.css
git commit -m "feat: add settings window UI"
```

---

## Task 4: 主窗口「未配置」视图

**Files:**
- Modify: `renderer/index.html`
- Modify: `renderer/renderer.js`

- [ ] **Step 1: index.html 增加未配置视图**

In `renderer/index.html`, 在 `<div id="error-view" ...>` 块之后、`<div id="data-view" ...>` 之前插入：

```html
    <div id="unconfigured-view" hidden>
      <h2>未配置账号</h2>
      <p class="subtitle">请右键托盘图标 → 账号设置，填写 apiId 和 apiHost。</p>
    </div>
```

- [ ] **Step 2: renderer.js 处理 configured 标志**

In `renderer/renderer.js`:

(a) 在 `els` 对象里增加 unconfigured 引用 —— 找到 `data: document.getElementById('data-view'),` 这一行，在其后加：

```javascript
  unconfigured: document.getElementById('unconfigured-view'),
```

(b) 替换 `showView` 函数为：

```javascript
function showView(name) {
  els.loading.hidden = name !== 'loading';
  els.error.hidden = name !== 'error';
  els.data.hidden = name !== 'data';
  els.unconfigured.hidden = name !== 'unconfigured';
}
```

(c) 在 `render` 函数开头（`const { lastSuccess, lastError, now } = payload;` 之后）增加未配置优先判断：

```javascript
  if (payload.configured === false) {
    showView('unconfigured');
    return;
  }
```

- [ ] **Step 3: 提交**

```bash
git add renderer/index.html renderer/renderer.js
git commit -m "feat: add unconfigured view to main window"
```

---

## Task 5: main.js 接线（核心改动）

**Files:**
- Modify: `main.js`

- [ ] **Step 1: 替换顶部 require 与删除旧 config 逻辑**

In `main.js`, 替换文件顶部到 `// =================` 之间的整段（当前第 1–36 行：从 `const path = ...` 到 `// =================`）为：

```javascript
const path = require('node:path');
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } = require('electron');
const { fetchUserStats } = require('./lib/stats');
const { loadConfig, saveConfig, isConfigured } = require('./lib/config');

let CONFIG = null;        // 运行时配置，在 app ready 后从 userData 读取
let CONFIG_DIR = null;    // app.getPath('userData')

function detailsUrl() {
  if (!CONFIG || !isConfigured(CONFIG)) return null;
  return `https://${CONFIG.apiHost}/admin-next/api-stats?apiId=${CONFIG.apiId}`;
}
```

说明：删除了 `fs`、`dialog` require（不再用）；删除了顶层 `loadConfig()`、`CONFIG`/`API_ID` 等常量和 `DETAILS_URL`。后续代码改用 `CONFIG.xxx` 和 `detailsUrl()`。

- [ ] **Step 2: 修改 createWindow 不变，修改 fetchAndBroadcast 跳过未配置**

In `main.js`, 替换 `fetchAndBroadcast` 函数为：

```javascript
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
```

- [ ] **Step 3: broadcast 增加 configured 标志**

In `main.js`, 在 `broadcast` 函数里替换 `const payload = { lastSuccess, lastError, now: Date.now() };` 为：

```javascript
  const payload = { lastSuccess, lastError, now: Date.now(), configured: isConfigured(CONFIG) };
```

- [ ] **Step 4: 新增 openSettingsWindow 函数**

In `main.js`, 在 `createTray` 函数定义之前（即 `function createTray() {` 上一行）插入：

```javascript
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
    },
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}
```

- [ ] **Step 5: 托盘菜单增加「账号设置」，并修改「查看详情」**

In `main.js`, 替换 `const contextMenu = Menu.buildFromTemplate([ ... ]);` 整块为：

```javascript
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
```

- [ ] **Step 6: app.whenReady 内读取配置 + 注册 IPC**

In `main.js`, 替换 `app.whenReady().then(() => { ... });` 整块为：

```javascript
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
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

  mainWindow.webContents.on('did-finish-load', () => {
    broadcast();
    fetchAndBroadcast();
    if (!isConfigured(CONFIG)) openSettingsWindow();
  });

  setInterval(fetchAndBroadcast, CONFIG.pollIntervalMs);
});
```

- [ ] **Step 7: 跑测试确保没破坏单测**

Run: `npm test`
Expected: PASS — config.test.js + stats.test.js 全部通过（main.js 无单测，但不能引入语法错误导致 require 失败；test 不 require main.js，所以主要靠下一步手动启动验证）

- [ ] **Step 8: 手动验证启动（无语法错误 + 首次弹窗）**

先临时移走已有配置（如果存在），验证首次运行：

```bash
# macOS 示例路径；Linux 为 ~/.config/claude-status，Windows 为 %APPDATA%\claude-status
node -e "console.log(require('electron'))" >/dev/null 2>&1 || true
npm start
```

Expected:
- 程序启动，主窗口显示「未配置账号」视图，设置窗口自动弹出。
- 在设置窗口填入 apiId / apiHost → 点保存 → 设置窗口关闭，主窗口切换到数据视图并开始拉取。
- 退出程序后再 `npm start` → 自动加载刚才的配置，直接进数据视图，不再弹设置窗。
- 右键托盘 → 「账号设置」可再次打开窗口并预填当前值；「查看详情」在已配置时打开外链。

- [ ] **Step 9: 提交**

```bash
git add main.js
git commit -m "feat: wire account settings into main process"
```

---

## Task 6: 收尾文档

**Files:**
- Modify: `config.example.json`（保留为字段文档，更新注释意图）
- Modify: `README` 或 `CLAUDE.md`（如存在，说明配置已改为程序内输入）

- [ ] **Step 1: 检查是否有 README/CLAUDE.md 提到旧的 config.json 流程**

Run: `grep -rn "config.json\|config.example" README* CLAUDE.md 2>/dev/null`
Expected: 列出需要更新的文档位置（可能为空）。

- [ ] **Step 2: 若有文档提到「复制 config.example.json」流程，更新为「首次启动自动弹出账号设置」**

按 grep 结果逐处修改文案。无匹配则跳过此步。

- [ ] **Step 3: 提交（若有改动）**

```bash
git add -A
git commit -m "docs: update setup instructions for in-app account settings"
```

---

## Notes

- 之前两次未提交的修复（`main.js` 的 Dock activate、`lib/stats.js` 的托盘文本）已存在于工作区。Task 5 重写 `app.whenReady` 和 `contextMenu` 时**必须保留** Dock `app.on('activate')` 处理。Task 5 的替换范围不含 `app.on('activate')` 块，故会自然保留。
- `.gitignore` 包含 `test/` 与 `docs/`：提交测试/计划文档时按需 `git add -f`，先 `git status` 确认。
