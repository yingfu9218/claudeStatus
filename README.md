# claudeStatus

常驻系统托盘的 Electron 小程序，每 30 秒拉取一次 Claude Code 账号额度，把当前 5 分钟窗口费用与本周已花费实时显示在托盘 + 主窗口上，支持 macOS 与 Ubuntu。

主窗口预览：
- 每日费用进度条（4 位小数精度）
- Claude 模型周费用进度条
- 进度条三档配色：绿 (<60%) / 黄 (60–85%) / 红 (≥85%)
- 网络异常时保留旧数据，文案变橙色提示「连接失败，重试中…」

托盘右键菜单：显示主窗口 / 立即刷新 / 查看详情 / 退出。

---

## 安装

环境要求：Node.js ≥ 18（建议 LTS）、npm。

```bash
git clone <your-repo-url> claudeStatus
cd claudeStatus
npm install
```

`npm install` 会下载 Electron（~130MB），首次安装稍慢。

### Linux 沙箱说明

Ubuntu 24.04+ 默认限制非特权 user namespace（`apparmor_restrict_unprivileged_userns=1`），
Electron 的 SUID 沙箱因此无法启动，安装版会一启动就崩。本应用只渲染本地 UI，已在
`main.js` 里内置 `app.commandLine.appendSwitch('no-sandbox')` 关闭沙箱，**开发和安装版都无需再手动加 `--no-sandbox`**。

如果你更希望保留 Chromium 沙箱，可移除 `main.js` 里那行开关，然后用下面任一方式自行处理沙箱权限：

```bash
# A. 给 chrome-sandbox 设权限（dev 环境，每次重装 Electron 都要重跑）
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox

# B. 系统级放开非特权 user namespace
echo 'kernel.apparmor_restrict_unprivileged_userns=0' | sudo tee /etc/sysctl.d/99-userns.conf
sudo sysctl --system
```

### Ubuntu/GNOME 托盘可见性

GNOME 自 3.26 起移除了原生系统托盘。装上扩展才能看到图标：

```bash
sudo apt install gnome-shell-extension-appindicator
```

装完注销重登或重启 GNOME Shell。Wayland 会话下扩展可能仍不工作，切换到 X11 会话最稳。

---

## 配置

配置改为**在程序内填写**，无需手动复制或编辑文件。首次启动时主窗口显示「未配置账号」视图并自动弹出「账号设置」窗口，填入 `apiId` 和 `apiHost` 点保存即可。之后随时可右键托盘图标 →「账号设置」修改。

保存的配置写入跨平台的 userData 目录（由 Electron 的 `app.getPath('userData')` 决定），**不在仓库内**，也不会提交到 git：

- macOS：`~/Library/Application Support/claude-status/config.json`
- Linux：`~/.config/claude-status/config.json`
- Windows：`%APPDATA%\claude-status\config.json`

填写字段：

- `apiId`：账号 UUID，必填。
- `apiHost`：接口域名，必填（只填域名，不含 `https://`）。

`apiPath`（接口路径）和 `pollIntervalMs`（轮询间隔，默认 30 秒）为内置默认值，正常无需改动。仓库里的 `config.example.json` 仅作为字段格式的参考文档。

托盘菜单「查看详情」的 URL 由 host 和 apiId 自动拼接，格式：
`https://<apiHost>/admin-next/api-stats?apiId=<apiId>`。未配置时点「查看详情」会改为打开账号设置窗口。

---

## 使用

启动：

```bash
npm start
```

启动后：

- 主窗口立刻弹出，显示日费用 / 周费用进度条
- 系统托盘出现 Claude 橙色 sparkle 图标
- 主窗口每秒刷新「上次更新」相对时间；每 30 秒重新拉取数据
- macOS 用户：托盘标题栏会直接显示 `$dailyWindow / $weekly` 文字
- Linux 用户：托盘条上只显示图标，金额走主窗口和托盘 tooltip

### 操作

| 操作 | 行为 |
|---|---|
| 左键点击托盘 | 切换主窗口显示/隐藏 |
| 关闭主窗口（X） | 缩到托盘，进程继续运行 |
| 右键托盘 → 显示主窗口 | 把主窗口拉回前台 |
| 右键托盘 → 立即刷新 | 立刻发起一次请求 |
| 右键托盘 → 查看详情 | 用系统默认浏览器打开账号详情页 |
| 右键托盘 → 退出 | 彻底关闭进程 |

### 错误状态

- 网络断开时：旧数据保留，主窗口「上次更新」行变橙色，托盘 setTitle 前缀变成 `●`
- 启动时第一次请求就失败：主窗口显示「无法连接到服务器」+ 立即刷新按钮

恢复网络后下一轮（≤30 秒）自动复位。

---

## 打包 / 构建安装包

用 [electron-builder](https://www.electron.build/) 出包。**每个平台的安装包只能在对应系统（或对应的 CI runner）上构建**：

| 目标用户 | 产物 | 构建平台 |
|---|---|---|
| Ubuntu / Linux | `.AppImage`、`.deb` | Linux |
| macOS | `.dmg` | **必须** macOS（Apple 工具链不跨平台） |
| Windows | `Setup .exe`（NSIS） | Windows（Linux 上需装 Wine，不推荐） |

产物统一输出到 `release/` 目录。

### 准备

```bash
npm install          # 含 electron-builder
```

应用图标：源图是 `assets/icon.png`，构建用图标是 `build/icon.png`（1024×1024 方形，由源图缩放补白生成）。三平台的 `.ico` / `.icns` 由 electron-builder 在构建时从这张 PNG 自动派生，无需手动转换。如需重新生成 `build/icon.png`（例如换了源图）：

```bash
npm run icon          # 跑 scripts/gen-icon.js，用 jimp 把 assets/icon.png 缩放补白成 1024×1024
```

### 命令

```bash
# Linux（AppImage + deb）—— 在 Linux 上跑
npm run dist:linux
#   → release/ClaudeStatus-0.1.0.AppImage
#   → release/claude-status_0.1.0_amd64.deb

# macOS（dmg）—— 在 Mac 上跑
npm run dist:mac
#   → release/ClaudeStatus-0.1.0.dmg

# Windows（NSIS 安装器）—— 在 Windows 上跑
npm run dist:win
#   → release/ClaudeStatus Setup 0.1.0.exe

# 不打安装器，只解包到 release/<platform>-unpacked/（快速冒烟）
npm run pack:dir

# 三平台一起（仅当当前系统支持时，一般用于 CI）
npm run dist:all
```

### 安装产物

- **AppImage**：`chmod +x 'Claude Status-0.1.0.AppImage'` 后直接运行。
- **deb**：`sudo dpkg -i claude-status_0.1.0_amd64.deb`（缺依赖时 `sudo apt -f install`）。
- **dmg**：拖进 Applications。未签名包首次打开需右键 →「打开」绕过 Gatekeeper；正式分发需 Apple Developer 证书 + 公证。
- **exe**：双击安装，可自选安装目录。

### 跨平台一键出包（可选）

三平台分别在各自系统构建较繁琐，推荐用 GitHub Actions 的 `ubuntu-latest` / `macos-latest` / `windows-latest` 三个 runner 各跑一次对应的 `npm run dist:*`，统一收集 `release/` 产物。（本仓库暂未内置 workflow。）

---

## 开发

跑单元测试：

```bash
npm test
```

测试覆盖 `lib/stats.js` 的 `normalize()` 与 `barColor()` 边界。HTTPS 请求未做 mock，靠手动启动验证。

目录速览：

```
claudeStatus/
├── main.js              # Electron 主进程：窗口、托盘、30s 轮询、IPC
├── preload.js           # contextBridge：暴露 IPC 给 renderer
├── lib/stats.js         # fetchUserStats / normalize / barColor（无 Electron 依赖）
├── renderer/            # 主窗口 HTML / CSS / JS
├── assets/tray-icon.png # 托盘图标
└── test/                # node:test 单元测试 + fixtures
```

`lib/stats.js` 是纯 Node 模块（仅依赖 `node:https`），可独立单测。`main.js` 是唯一接触 Electron 的装配层。
