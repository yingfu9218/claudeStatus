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

### Linux 额外步骤（沙箱权限）

Ubuntu / 其他 Linux 上首次启动会报 `chrome-sandbox` SUID 错误。选一个修：

**A. 改沙箱权限（推荐，保留安全沙箱）**

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

注意：每次 `npm install` 重装 Electron 都要重新跑一遍。

**B. 启动时禁用沙箱（最省事）**

```bash
npm start -- --no-sandbox
```

或永久写进 `package.json`：

```json
"start": "electron . --no-sandbox"
```

**C. 启用非特权用户命名空间（系统级一劳永逸）**

```bash
echo 'kernel.unprivileged_userns_clone=1' | sudo tee /etc/sysctl.d/99-userns.conf
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

真实配置放在 `config.json`，已加入 `.gitignore`，**不会提交到 git**。仓库里只有模板 `config.example.json`。

首次拉代码后：

```bash
cp config.example.json config.json
# 然后编辑 config.json 填入你的 apiId
```

`config.json` 字段：

```json
{
  "apiId": "你的-uuid-账号-id",
  "apiHost": "xxxx.com",
  "apiPath": "/apiStats/api/user-stats",
  "pollIntervalMs": 30000
}
```

字段说明：

- `apiId`：账号 UUID，必填。
- `apiHost` / `apiPath`：接口域名和路径，正常无需改。
- `pollIntervalMs`：轮询间隔毫秒数，默认 30 秒。

启动时如果 `config.json` 不存在或字段缺失，程序会弹错误对话框提示并退出。

托盘菜单「查看详情」的 URL 由 host 和 apiId 自动拼接，格式：
`https://<apiHost>/admin-next/api-stats?apiId=<apiId>`

---

## 使用

启动：

```bash
npm start
# Linux 沙箱未配置时：
npm start -- --no-sandbox
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
- 启动时第一次请求就失败：主窗口显示「无法连接到 crs.lightaibox.com」+ 立即刷新按钮

恢复网络后下一轮（≤30 秒）自动复位。

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
