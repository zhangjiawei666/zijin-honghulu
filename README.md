# 自选股行情监控 Agent

基于 CodeBuddy Agent SDK 构建的 Web Agent 应用，核心功能：**交易时段内每 30 分钟自动巡检自选股行情，发现买点立即弹窗提醒**。同时保留完整的 Agent 对话能力。

## 特性

- 💬 **流式对话** - 实时显示 AI 回复
- 🔧 **工具调用** - 可视化展示 Agent 工具使用
- 🔒 **权限控制** - 支持多种权限模式
- 📝 **会话管理** - 多会话切换和持久化
- 🎨 **主题切换** - 支持深色/浅色主题
- 🤖 **自定义 Agent** - 创建和管理多个 Agent 配置
- 📈 **自选股监控** - 交易时段每 30 分钟自动巡检
- 🚨 **买点弹窗提醒** - 发现买点立即通知（页面内 + 浏览器通知）

## 技术栈

- **后端**: Node.js + Express + TypeScript
- **前端**: React 18 + TypeScript + Vite
- **UI**: TDesign React 组件库
- **AI**: CodeBuddy Agent SDK
- **数据库**: SQLite (Node 22 内置 `node:sqlite`，无需原生编译)

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

这会同时启动前端（端口 5173）和后端（端口 3000）

### 3. 访问应用

打开浏览器访问 http://localhost:5173

## 项目结构

```
web-agent/
├── server/                    # 后端服务
│   ├── index.ts              # Express 服务器
│   └── db.ts                 # 数据库操作
├── src/                      # 前端源码
│   ├── components/           # React 组件
│   ├── hooks/                # 自定义 Hooks
│   ├── pages/                # 页面组件
│   ├── types.ts              # 类型定义
│   ├── config.ts             # 应用配置
│   └── App.tsx               # 应用入口
├── data/                     # 数据存储
│   └── chat.db               # SQLite 数据库
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md                 # 项目说明
└── DEVELOPMENT.md            # 二次开发指南
```

## 核心功能

### Agent SDK 集成

- 使用 `query()` API 发送消息并接收流式响应
- 使用 `unstable_v2_createSession()` 创建和管理 Agent 会话
- 使用 `unstable_v2_authenticate()` 处理身份认证
- 支持会话恢复（使用 `resume` 参数）

### 权限控制

支持四种权限模式：
- `default` - 每次工具调用需要确认
- `acceptEdits` - 自动接受编辑类操作
- `plan` - 计划模式（只读）
- `bypassPermissions` - 跳过所有权限检查

### 流式响应

使用 Server-Sent Events (SSE) 实现实时流式响应：
- 文本内容流式输出
- 工具调用实时展示
- 权限请求实时弹窗

### 数据持久化

使用 SQLite 存储：
- 会话信息和配置
- 消息历史记录
- Agent SDK 的 session_id（用于恢复对话）
- 自选股列表、巡检历史、买点信号

## 自选股行情监控

侧边栏点击 **行情监控** 进入监控页面：

### 工作方式

1. **添加自选股**：输入股票代码（如 `600519`）和名称，支持沪深京股票
2. **自动巡检**：交易时段（周一至周五 9:30-11:30 / 13:00-15:00）内每 30 分钟自动运行一次
3. **行情查询**：主通道由 CodeBuddy Agent 调用股票行情查询能力（需在 CodeBuddy CLI 中配置通达信等行情 MCP）；若 Agent 通道不可用，自动降级为内置腾讯行情接口
4. **买点判断**：基于「短线十五法 + 长线六二法」均线规则（MA5/10/20/60 + 量比）
5. **弹窗提醒**：发现买点时通过 SSE 实时推送，页面内弹出醒目通知 + 浏览器系统通知
6. **手动巡检**：可随时点击「立即巡检」强制执行一次

### 监控相关 API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/monitor/status` | GET | 监控状态（开关、交易时段、下次巡检） |
| `/api/monitor/events` | GET | SSE 事件流（买点提醒） |
| `/api/monitor/run` | POST | 手动触发巡检 |
| `/api/monitor/toggle` | POST | 开启/关闭自动监控 |
| `/api/monitor/runs` | GET | 巡检历史 |
| `/api/monitor/signals` | GET | 买点信号列表 |
| `/api/watchlist` | GET/POST | 自选股查询/添加 |
| `/api/watchlist/:id` | DELETE | 删除自选股 |

### 说明

- 节假日（如法定假期）需在监控页关闭开关或依赖交易日判断（默认仅按周一至周五判断）
- 买点判断规则不构成投资建议，请结合大盘、基本面与仓位管理独立决策
- Agent 通道需要在 CodeBuddy CLI 环境配置行情类 MCP 工具（如通达信），内置通道开箱即用
- Agent 通道使用的模型可在 `.env` 中通过 `CODEBUDDY_MODEL` 指定（默认 `claude-sonnet-4`），需与当前登录账号可用的模型一致

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/check-login` | GET | 检查 CodeBuddy 登录状态 |
| `/api/models` | GET | 获取可用模型列表 |
| `/api/sessions` | GET | 获取所有会话 |
| `/api/sessions` | POST | 创建新会话 |
| `/api/sessions/:id` | GET | 获取单个会话 |
| `/api/sessions/:id` | PATCH | 更新会话 |
| `/api/sessions/:id` | DELETE | 删除会话 |
| `/api/chat` | POST | 发送消息（SSE 流式响应） |
| `/api/permission-response` | POST | 响应权限请求 |

## 环境要求

- Node.js 18+
- npm 或 yarn

## 配置

### 方式一：环境变量配置

创建 `.env` 文件：

```bash
PORT=3000
CODEBUDDY_API_KEY=your_api_key
CODEBUDDY_AUTH_TOKEN=your_auth_token
CODEBUDDY_BASE_URL=https://api.example.com
CODEBUDDY_INTERNET_ENVIRONMENT=external
```

### 方式二：使用 CodeBuddy CLI 登录

```bash
# 登录 CodeBuddy
codebuddy login

# 启动应用（会自动使用 CLI 的登录信息）
npm run dev
```

### 方式三：Web UI 配置

在应用的设置页面中配置环境变量（仅在当前服务器进程有效）。

## 开发

```bash
# 开发模式（同时启动前后端）
npm run dev

# 单独启动后端
npm run dev:server

# 单独启动前端
npm run dev:client

# 构建生产版本
npm run build

# 运行生产版本
npm start
```

## 桌面版（Windows 便携版）

无需安装 Node.js，下载解压后双击即用。

### 下载与使用

1. 下载 `自选股行情监控-v1.0.0-win.zip`（约 150MB）
2. 解压到任意目录（如桌面）
3. 双击运行 `自选股行情监控.exe`
4. 应用会自动启动内置行情服务并打开窗口

### 数据存储

- 自选股、监控历史、买点信号等数据保存在 `%APPDATA%\stock-monitor-agent\data\chat.db`
- 卸载时删除上述目录即可清除所有数据

### 二次打包（开发者）

```bash
# 安装打包工具（首次）
npm install -D electron electron-builder esbuild

# 生成图标 + 构建前端 + 打包服务端 + 手动组装桌面版
npm run build
npm run bundle:server
node scripts/gen-icon.mjs

# 复制 Electron 二进制并组装（Windows）
# 1. 复制 node_modules/electron/dist 到 release/win-unpacked
# 2. 将 dist/、dist-server/、electron/、build/、package.json 放入 resources/app/
# 3. 重命名 electron.exe 为 自选股行情监控.exe
```

> 注：当前环境受 safe-delete 策略限制，electron-builder 自动打包会中断，因此采用手动组装方式产出绿色便携版。

---

## 二次开发

如果你想基于这个模板进行定制化开发，请查看 [DEVELOPMENT.md](./DEVELOPMENT.md) 获取详细指南，包括：

- 项目架构详解
- 核心功能实现原理
- 10+ 常见定制场景示例
- API 完整参考
- 调试和部署指南

## License

MIT
