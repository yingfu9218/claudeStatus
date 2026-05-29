# 账号设置功能设计

日期：2026-05-29

## 背景与目标

当前 `apiId`、`apiHost` 等配置写在项目根目录的 `config.json`（gitignore），由用户手动复制 `config.example.json` 并填写。缺配置时程序弹错误框并退出。

目标：

- 将 `apiId` 和 `apiHost` 从项目代码中移除，改为由用户在程序内输入。
- 托盘右键菜单新增「账号设置」，点击弹出设置窗口，可填写 `apiId` / `apiHost`。
- 点击保存后写入本地，下次启动自动加载。
- 配置存储位置需在 Linux / macOS / Windows 三平台都能正常读写。

`apiPath` 和 `pollIntervalMs` 不交给用户编辑，作为代码内置常量。

## 配置存储

### 位置

使用 Electron 的跨平台抽象 `app.getPath('userData')`，**绝不硬编码任何平台路径**。应用名取自 `package.json` 的 `name`（`claude-status`），各平台实际落地位置：

| 平台 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/claude-status/config.json` |
| Linux | `$XDG_CONFIG_HOME/claude-status/config.json`（默认 `~/.config/claude-status/config.json`） |
| Windows | `%APPDATA%\claude-status\config.json` |

### 文件结构

文件只存用户输入的两个字段：

```json
{ "apiId": "xxx", "apiHost": "xxx.com" }
```

`apiPath`（`/apiStats/api/user-stats`）和 `pollIntervalMs`（`30000`）作为代码常量，不写入文件。运行时配置 = 文件内容 + 内置常量合并而成。

### 跨平台注意事项

1. **不硬编码路径**：全程只调用 `app.getPath('userData')`，让 Electron 按平台规范返回路径。
2. **目录可能不存在**：首次运行 `userData` 目录可能尚未创建。写文件前 `fs.mkdirSync(dir, { recursive: true })`，否则 Linux/Windows 首次保存会因父目录缺失失败。
3. **时机**：`app.getPath('userData')` 必须在 `app` ready 之后调用。当前代码在模块顶层（ready 之前）同步读配置，必须改为在 `app.whenReady()` 内部读取。
4. **平台无关的 config 模块**：`lib/config.js` 的函数接收 `configDir` 参数（由 `main.js` 在 ready 后传入 `app.getPath('userData')`），不在模块层依赖 `app`，便于单测传临时目录。

### lib/config.js（新增模块）

纯 I/O、平台无关。导出：

- `DEFAULTS` — `{ apiPath: '/apiStats/api/user-stats', pollIntervalMs: 30000 }`
- `getConfigPath(configDir)` — 拼出 `configDir/config.json`。
- `loadConfig(configDir)` — 读文件并与 `DEFAULTS` 合并返回完整运行配置 `{ apiId, apiHost, apiPath, pollIntervalMs }`；文件不存在或解析失败时返回 `{ ...DEFAULTS, apiId: '', apiHost: '' }`（不抛错）。
- `saveConfig(configDir, { apiId, apiHost })` — 校验两字段非空字符串；`mkdirSync(configDir, { recursive: true })` 后写入 `{ apiId, apiHost }`（只写这两个字段）。校验失败抛错。
- `isConfigured(cfg)` — `apiId` 和 `apiHost` 均为非空字符串时返回 `true`。

`config.example.json` 保留作为字段文档，项目根的 `config.json` 不再被读取。

## 启动流程与首次运行

- `app` 永远正常初始化：创建主窗口 + 托盘。删除旧的「缺配置就 `app.quit()`」逻辑。
- 在 `app.whenReady()` 内：`configDir = app.getPath('userData')`，`config = loadConfig(configDir)`。
  - **已配置**（`isConfigured` 为 true）→ 正常拉取数据并轮询。
  - **未配置** → 主窗口数据区显示「未配置账号，请填写设置」提示；**自动打开设置窗口**。
- 轮询 `setInterval` 始终运行，但 `fetchAndBroadcast` 在未配置时直接跳过网络请求，广播一个明确的「未配置」状态给 renderer。

### 未配置状态的传递

`broadcast()` 的 payload 增加一个标志位 `configured: boolean`。renderer 根据它显示「未配置」视图（优先级高于 loading/error/data）。

## 设置窗口

- 新增 `renderer/settings.html`、`renderer/settings.js`，样式复用/扩展 `renderer/style.css`。
- 独立 `BrowserWindow`，约 360×260，不可缩放，`autoHideMenuBar`，走专用 preload `settings-preload.js`（contextIsolation，nodeIntegration false）。
- 界面：两个输入框（apiId、apiHost）+「保存」「取消」按钮。打开时通过 IPC 预填当前配置。
- **窗口单例**：模块级 `settingsWindow` 引用；再次点「账号设置」时若已存在则 `focus()`，不重复创建；`closed` 时置空。

### 保存流程

1. renderer 收集 `{ apiId, apiHost }`，通过 `settings:save`（invoke/handle）发给主进程。
2. 主进程调用 `saveConfig(configDir, payload)`：
   - 校验失败 → 返回 `{ ok: false, error }`，renderer 在窗口内显示错误，不关闭。
   - 成功 → 写盘，重新 `loadConfig` 更新内存运行配置，返回 `{ ok: true }`。
3. renderer 收到 `ok` 后请求关闭（`settings:close`）。
4. 主进程关闭设置窗口，并立即 `fetchAndBroadcast()` 用新配置拉数据；主窗口从「未配置」切回正常视图。

## 托盘菜单

在「立即刷新」与「查看详情」之间插入「账号设置」：

```
显示主窗口
立即刷新
账号设置        ← 新增
查看详情
─────────
退出
```

- 「账号设置」点击 → `openSettingsWindow()`。
- 「查看详情」依赖 `apiId`：未配置时点击不打开外链，而是直接打开设置窗口（等同于点「账号设置」）。已配置时行为不变（打开外链）。

## IPC 接口

主进程 `ipcMain.handle` / `ipcMain.on`：

- `settings:get`（invoke/handle，renderer → main）：返回当前 `{ apiId, apiHost }` 供表单预填。
- `settings:save`（invoke/handle）：入参 `{ apiId, apiHost }`，返回 `{ ok, error? }`。
- `settings:close`（on）：关闭设置窗口。

`settings-preload.js` 暴露：

```js
window.settingsApi = {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (data) => ipcRenderer.invoke('settings:save', data),
  close: () => ipcRenderer.send('settings:close'),
};
```

主窗口 `preload.js` 不变（仍是 `stats-update` / `refresh-request`）；主窗口 renderer 增加对 payload 中 `configured` 标志的处理。

## 测试

- 新增 `test/config.test.js`，用临时目录（`os.tmpdir()` + 随机子目录）测试 `lib/config.js`：
  - save 后 load 能读回 `apiId` / `apiHost`。
  - 文件不存在时 `loadConfig` 返回空 `apiId`/`apiHost` + 默认常量，`isConfigured` 为 false。
  - `loadConfig` 合并默认常量（`apiPath`、`pollIntervalMs`）正确。
  - `saveConfig` 对空字段抛错。
  - `saveConfig` 在目录不存在时能自动创建（mkdir recursive）。
- 现有 `lib/stats.js` 测试不受影响。
- 设置窗口 UI 属 Electron 集成层，不做自动化测试，靠手动验证（首次运行自动弹窗、保存后自动拉数据、重启自动加载、三平台路径正确）。

## 不在本次范围（YAGNI）

- 不让用户编辑 `apiPath` / `pollIntervalMs`。
- 不做配置加密 / 多账号 / 配置导入导出。
- 不做设置窗口的自动化 E2E 测试。
