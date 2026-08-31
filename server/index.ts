import express from "express";
import { query, unstable_v2_createSession, unstable_v2_authenticate, unstable_v2_logout, PermissionResult, CanUseTool } from "@tencent-ai/agent-sdk";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import * as db from "./db.js";

/**
 * 兜底探测 CodeBuddy CLI 路径并写入 env。
 *
 * 关键问题：SDK 的 cli-resolver.js 在 esbuild bundle 后，其内部的 `__dirname`
 * 会被 esbuild 的 __commonJS wrapper 改写成输出文件目录，fallback 路径
 * (`<dist-server>/../../cli/bin/codebuddy`) 解析正确但只有当环境恰好满足时才行；
 * 实际上更常见的现象是 SDK 的 fallback 也抛 "CodeBuddy CLI not found"，
 * 导致登录请求直接 502。
 *
 * 这里做主动兜底：从 dist-server 出发，按真实部署的资源结构探测
 * `<app>/cli/bin/codebuddy`，找到就写 env，让 SDK 走最可靠的"环境变量"分支。
 * Electron 主进程（electron/main.mjs）如果已注入 env，这里检测到 env 已存在就跳过。
 */
function ensureCodebuddyCLIPath(): void {
  const envPath = process.env.CODEBUDDY_CODE_PATH;
  if (envPath) {
    if (fs.existsSync(envPath)) {
      console.log(`[Server] CLI 已通过环境变量注入: ${envPath}`);
    } else {
      console.warn(`[Server] 警告: CODEBUDDY_CODE_PATH=${envPath} 但文件不存在，将重新探测`);
      delete process.env.CODEBUDDY_CODE_PATH;
    }
    return;
  }
  // 按优先级兜底探测（生产环境下 CLI 固定放在 <app>/cli/bin/codebuddy）
  const candidates = [
    path.join(__dirname, "..", "cli", "bin", "codebuddy"),    // dist-server → app/cli
    path.join(__dirname, "..", "..", "cli", "bin", "codebuddy"),
    path.join(__dirname, "..", "..", "..", "cli", "bin", "codebuddy"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        process.env.CODEBUDDY_CODE_PATH = p;
        console.log(`[Server] 自动探测到 CLI 路径: ${p}`);
        return;
      }
    } catch { /* 路径非法等异常忽略 */ }
  }
  console.warn(`[Server] 未在以下路径找到 CodeBuddy CLI: ${candidates.join(" | ")}`);
  console.warn(`[Server] Agent 通道将不可用，请确认 cli/ 目录随应用分发`);
}
ensureCodebuddyCLIPath();
import { monitor, fetchStockNames, fetchRealtimeQuotes } from "./monitor.js";
import { registerChainRoutes } from "./chain.js";
import { registerMainstreamRoutes } from "./mainstream.js";
import { registerSectorEffectRoutes } from "./sectorEffect.js";

const execAsync = promisify(exec);

// 待处理的权限请求
interface PendingPermission {
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  toolName: string;
  input: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
}

const pendingPermissions = new Map<string, PendingPermission>();

// 权限请求超时时间（5分钟）
const PERMISSION_TIMEOUT = 5 * 60 * 1000;

// 兼容 ESM/CJS 的 __dirname 获取
// 在 CJS 打包产物中 __dirname 是全局变量；在 ESM（tsx watch）中通过 import.meta.url 计算
declare const __dirname: string;
const _dirname = (() => {
  // @ts-ignore
  if (typeof __dirname !== 'undefined') return __dirname;
  // ESM fallback (tsx watch)
  const { fileURLToPath } = require("url");
  return path.dirname(fileURLToPath(import.meta.url));
})();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// 缓存可用模型列表
let cachedModels: Array<{ modelId: string; name: string; description?: string }> = [];
const defaultModel = "claude-sonnet-4";

// 健康检查
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 登录方式类型
type LoginMethod = 'env' | 'cli' | 'none';

interface LoginStatusResponse {
  isLoggedIn: boolean;
  method?: LoginMethod;
  envConfigured?: boolean;
  cliConfigured?: boolean;
  error?: string;
  apiKey?: string; // 脱敏后的 API Key
  user?: {
    userId?: string;
    userName?: string;
    userNickname?: string;
  };
  envVars?: {
    apiKey?: string;
    authToken?: string;
    internetEnv?: string;
    baseUrl?: string;
  };
}

// 检查 CodeBuddy CLI 登录状态
// 关键：未登录时 unstable_v2_authenticate 会触发 onAuthUrl 回调并阻塞等待浏览器授权（默认 5 分钟超时）。
// 这里用 Promise.race：onAuthUrl 一触发就立即返回未登录状态，同时给 authenticate 一个短 timeout 让其自行退出。
app.get("/api/check-login", async (req, res) => {
  const response: LoginStatusResponse = {
    isLoggedIn: false,
    envConfigured: false,
    cliConfigured: false,
    envVars: {},
  };

  // 1. 检查环境变量
  const apiKey = process.env.CODEBUDDY_API_KEY;
  const authToken = process.env.CODEBUDDY_AUTH_TOKEN;
  const internetEnv = process.env.CODEBUDDY_INTERNET_ENVIRONMENT;
  const baseUrl = process.env.CODEBUDDY_BASE_URL;

  if (apiKey || authToken) {
    response.envConfigured = true;
    // 脱敏显示
    if (apiKey) {
      response.envVars!.apiKey = apiKey.slice(0, 8) + '****' + apiKey.slice(-4);
      response.apiKey = response.envVars!.apiKey;
    }
    if (authToken) {
      response.envVars!.authToken = authToken.slice(0, 8) + '****' + authToken.slice(-4);
    }
    if (internetEnv) {
      response.envVars!.internetEnv = internetEnv;
    }
    if (baseUrl) {
      response.envVars!.baseUrl = baseUrl;
    }
  }

  // 2. 使用 unstable_v2_authenticate 检查登录状态
  //    - 已登录：立即 resolve 返回 userinfo
  //    - 未登录：触发 onAuthUrl 回调（此时用 race 立即返回未登录，不等待浏览器授权）
  try {
    let needsLogin = false;

    // onAuthUrl 触发时立即 resolve 的 Promise（拿到 authUrl 但不响应它）
    let authUrlResolve: ((v: { authUrl: string }) => void) | null = null;
    const authUrlFired = new Promise<{ authUrl: string }>((resolve) => {
      authUrlResolve = resolve;
    });

    const authPromise = unstable_v2_authenticate({
      environment: 'external',
      timeout: 15000, // 未登录时 15 秒后让底层 CLI 自行退出，避免悬挂
      onAuthUrl: async (authState) => {
        needsLogin = true;
        console.log('[Check Login] 需要登录，认证 URL:', authState.authUrl);
        authUrlResolve?.({ authUrl: authState.authUrl });
        // 不抛错，保持 authenticate 挂起直到超时/客户端断开
        return;
      }
    }).catch((e: any) => {
      // 超时/取消：如果 race 已经响应则忽略；否则标记错误
      if (!needsLogin) throw e;
      return null;
    });

    const result = await Promise.race([authPromise, authUrlFired]);

    if (needsLogin) {
      // onAuthUrl 已触发 → 未登录
      response.error = '未登录，请点击一键登录';
      response.method = 'none';
      if (response.envConfigured) {
        // 环境变量仍可能可用
        response.isLoggedIn = true;
        response.method = 'env';
      }
    } else if (result && (result as any).userinfo) {
      const userinfo = (result as any).userinfo;
      response.isLoggedIn = true;
      response.cliConfigured = true;
      response.method = response.envConfigured ? 'env' : 'cli';
      response.user = {
        userId: userinfo.userId,
        userName: userinfo.userName,
        userNickname: userinfo.userNickname,
      };
      console.log('[Check Login] 已登录用户:', userinfo.userName || userinfo.userNickname);
    } else if (result) {
      // result 存在但没有 userinfo，仍然认为已登录
      response.isLoggedIn = true;
      response.cliConfigured = true;
      response.method = response.envConfigured ? 'env' : 'cli';
    } else {
      // authPromise 被 catch 吞掉且未触发 onAuthUrl → 认证异常
      if (response.envConfigured) {
        response.isLoggedIn = true;
        response.method = 'env';
      } else {
        response.error = '登录状态检测失败';
        response.method = 'none';
      }
    }
  } catch (error: any) {
    console.error("[Check Login] SDK Error:", error);

    // 如果有环境变量配置，仍然认为是登录状态
    if (response.envConfigured) {
      response.isLoggedIn = true;
      response.method = 'env';
    } else {
      response.error = error?.message || String(error);
      response.method = 'none';
    }
  }

  res.json(response);
});

// ============= 一键登录 API（SSE 流式） =============
// 前端调用后：
//   1. 若已登录 → 立即收到 success 事件
//   2. 若未登录 → 收到 auth_url 事件（前端用系统浏览器打开）→ 用户授权后收到 success 事件
app.post("/api/auth/login", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send({ type: "meta", message: "正在检查登录状态..." });

  let closed = false;
  req.on("close", () => {
    closed = true;
    console.log("[Auth Login] 客户端断开连接");
  });

  // 心跳，防止代理/连接超时（浏览器授权最长 5 分钟）
  const heartbeat = setInterval(() => {
    if (!closed) res.write(": heartbeat\n\n");
  }, 15000);

  try {
    const result = await unstable_v2_authenticate({
      environment: 'external',
      onAuthUrl: async (authState) => {
        console.log('[Auth Login] 生成认证 URL:', authState.authUrl);
        if (!closed) {
          send({
            type: "auth_url",
            url: authState.authUrl,
            state: authState.state,
            message: "请在浏览器中完成授权",
          });
        }
      }
    });

    clearInterval(heartbeat);
    const userinfo = (result as any)?.userinfo;
    console.log('[Auth Login] 登录成功:', userinfo?.userName || userinfo?.userNickname);
    if (!closed) {
      send({
        type: "success",
        user: userinfo ? {
          userId: userinfo.userId,
          userName: userinfo.userName,
          userNickname: userinfo.userNickname,
        } : undefined,
      });
      res.end();
    }
  } catch (error: any) {
    clearInterval(heartbeat);
    console.error('[Auth Login] 登录失败:', error);
    if (!closed) {
      send({ type: "error", message: error?.message || "登录失败，请重试" });
      res.end();
    }
  }
});

// 退出登录
app.post("/api/auth/logout", async (req, res) => {
  try {
    await unstable_v2_logout({ environment: 'external' });
    console.log('[Auth Logout] 已退出登录');
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Auth Logout] 退出失败:', error);
    res.status(500).json({ success: false, error: error?.message || "退出登录失败" });
  }
});

// 保存环境变量配置
app.post("/api/save-env-config", (req, res) => {
  const { apiKey, authToken, internetEnv, baseUrl } = req.body;
  
  if (!apiKey && !authToken) {
    return res.status(400).json({ error: '请至少配置 API Key 或 Auth Token' });
  }
  
  const configuredVars: string[] = [];
  
  // 设置环境变量（仅在当前进程有效）
  if (apiKey) {
    process.env.CODEBUDDY_API_KEY = apiKey;
    configuredVars.push('CODEBUDDY_API_KEY');
  }
  if (authToken) {
    process.env.CODEBUDDY_AUTH_TOKEN = authToken;
    configuredVars.push('CODEBUDDY_AUTH_TOKEN');
  }
  if (internetEnv) {
    process.env.CODEBUDDY_INTERNET_ENVIRONMENT = internetEnv;
    configuredVars.push('CODEBUDDY_INTERNET_ENVIRONMENT');
  }
  if (baseUrl) {
    process.env.CODEBUDDY_BASE_URL = baseUrl;
    configuredVars.push('CODEBUDDY_BASE_URL');
  }
  
  // 清除模型缓存，以便重新获取
  cachedModels = [];
  
  res.json({ 
    success: true, 
    message: `已设置: ${configuredVars.join(', ')}`,
    note: '环境变量仅在当前服务器进程有效，重启后需要重新设置'
  });
});

// 获取可用模型列表
app.get("/api/models", async (req, res) => {
  try {
    if (cachedModels.length === 0) {
      console.log("[Models] Creating session to fetch available models...");
      
      const session = await unstable_v2_createSession({ 
        cwd: process.cwd()
      });
      
      console.log("[Models] Session created, calling getAvailableModels()...");
      const models = await session.getAvailableModels();
      console.log("[Models] Got", models.length, "models");
      
      if (models && Array.isArray(models)) {
        cachedModels = models;
      }
    }
    
    res.json({ 
      models: cachedModels.length > 0 ? cachedModels : [
        { modelId: "claude-sonnet-4", name: "Claude Sonnet 4" }
      ],
      defaultModel 
    });
  } catch (error: any) {
    console.error("[Models] Error:", error);
    res.json({
      models: [
        { modelId: "claude-sonnet-4", name: "Claude Sonnet 4" },
        { modelId: "claude-opus-4", name: "Claude Opus 4" }
      ],
      defaultModel,
      error: error?.message || String(error)
    });
  }
});

// ============= 会话 API =============

// 获取所有会话（包含消息数量）
app.get("/api/sessions", (req, res) => {
  try {
    const sessions = db.getAllSessions();
    const sessionsWithMessages = sessions.map(session => {
      const messages = db.getMessagesBySession(session.id);
      return {
        ...session,
        messageCount: messages.length
      };
    });
    res.json({ sessions: sessionsWithMessages });
  } catch (error: any) {
    console.error("[Sessions] Error:", error);
    res.status(500).json({ error: error?.message || "获取会话失败" });
  }
});

// 获取单个会话及其消息
app.get("/api/sessions/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = db.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: "会话不存在" });
    }
    
    const messages = db.getMessagesBySession(sessionId);
    
    // 解析 tool_calls JSON
    const parsedMessages = messages.map(msg => ({
      ...msg,
      tool_calls: msg.tool_calls ? JSON.parse(msg.tool_calls) : null
    }));
    
    res.json({ session, messages: parsedMessages });
  } catch (error: any) {
    console.error("[Session] Error:", error);
    res.status(500).json({ error: error?.message || "获取会话失败" });
  }
});

// 创建新会话
app.post("/api/sessions", (req, res) => {
  try {
    const { model = defaultModel, title = "新对话" } = req.body;
    const now = new Date().toISOString();
    
    const session = db.createSession({
      id: uuidv4(),
      title,
      model,
      sdk_session_id: null,
      created_at: now,
      updated_at: now
    });
    
    res.json({ session });
  } catch (error: any) {
    console.error("[Create Session] Error:", error);
    res.status(500).json({ error: error?.message || "创建会话失败" });
  }
});

// 更新会话
app.patch("/api/sessions/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title, model } = req.body;
    
    const success = db.updateSession(sessionId, { title, model });
    
    if (!success) {
      return res.status(404).json({ error: "会话不存在" });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("[Update Session] Error:", error);
    res.status(500).json({ error: error?.message || "更新会话失败" });
  }
});

// 删除会话
app.delete("/api/sessions/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const success = db.deleteSession(sessionId);
    
    if (!success) {
      return res.status(404).json({ error: "会话不存在" });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("[Delete Session] Error:", error);
    res.status(500).json({ error: error?.message || "删除会话失败" });
  }
});

// ============= 聊天 API =============

// 权限响应 API
app.post("/api/permission-response", (req, res) => {
  const { requestId, behavior, message } = req.body;
  
  console.log(`[Permission] Response received: requestId=${requestId}, behavior=${behavior}`);
  
  const pending = pendingPermissions.get(requestId);
  if (!pending) {
    console.log(`[Permission] Request not found: ${requestId}`);
    return res.status(404).json({ error: "权限请求不存在或已超时" });
  }
  
  // 清除请求
  pendingPermissions.delete(requestId);
  
  if (behavior === 'allow') {
    pending.resolve({
      behavior: 'allow',
      updatedInput: pending.input
    });
  } else {
    pending.resolve({
      behavior: 'deny',
      message: message || '用户拒绝了此操作'
    });
  }
  
  res.json({ success: true });
});

// 发送消息并获取流式响应
app.post("/api/chat", async (req, res) => {
  const { sessionId, message, model, systemPrompt, cwd, permissionMode } = req.body;
  
  // 请求日志
  console.log(`\n[Chat] ========== 新请求 ==========`);
  console.log(`[Chat] SessionId: ${sessionId}`);
  console.log(`[Chat] Model: ${model}`);
  console.log(`[Chat] Message: ${message?.slice(0, 100)}${message?.length > 100 ? '...' : ''}`);
  console.log(`[Chat] CWD: ${cwd || 'default'}`);

  if (!message) {
    console.log(`[Chat] 错误: 消息为空`);
    return res.status(400).json({ error: "消息不能为空" });
  }

  // 获取或创建会话
  let session = sessionId ? db.getSession(sessionId) : null;
  const now = new Date().toISOString();
  
  if (!session) {
    // 创建新会话
    console.log(`[Chat] 创建新会话`);
    session = db.createSession({
      id: sessionId || uuidv4(),
      title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
      model: model || defaultModel,
      sdk_session_id: null,  // 稍后从 SDK 获取
      created_at: now,
      updated_at: now
    });
  } else {
    console.log(`[Chat] 使用现有会话, SDK Session: ${session.sdk_session_id || 'none'}`);
  }

  const selectedModel = model || session.model;
  
  // 获取 SDK session ID（用于恢复对话）
  const sdkSessionId = session.sdk_session_id;

  // 创建用户消息 ID 和助手消息 ID
  const userMessageId = uuidv4();
  const assistantMessageId = uuidv4();

  // 保存用户消息到数据库
  try {
    db.createMessage({
      id: userMessageId,
      session_id: session.id,
      role: 'user',
      content: message,
      model: null,
      created_at: now,
      tool_calls: null
    });
    console.log(`[Chat] 用户消息已保存: ${userMessageId}`);
  } catch (dbError: any) {
    console.error(`[Chat] 保存用户消息失败:`, dbError);
    return res.status(500).json({ error: "保存消息失败", detail: dbError?.message });
  }

  // 设置 SSE 头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // 默认系统提示词
  const defaultSystemPrompt = "你是一个专业的AI助手，善于帮助用户解决各种问题。请用简洁清晰的方式回答问题。";
  
  // 工作目录：优先使用请求中的 cwd，否则使用当前目录
  const workingDir = cwd || process.cwd();

  try {
    console.log(`[Chat] 调用 SDK query...`);
    console.log(`[Chat] - Model: ${selectedModel}`);
    console.log(`[Chat] - Resume: ${sdkSessionId || 'none'}`);
    console.log(`[Chat] - CWD: ${workingDir}`);
    console.log(`[Chat] - PermissionMode: ${permissionMode || 'default'}`);
    
    // 创建 canUseTool 回调
    const canUseTool: CanUseTool = async (toolName, input, options) => {
      console.log(`[Permission] Tool request: ${toolName}`);
      console.log(`[Permission] Input:`, JSON.stringify(input, null, 2));
      
      // bypassPermissions 模式直接放行
      if (permissionMode === 'bypassPermissions') {
        console.log(`[Permission] Bypassing permissions for ${toolName}`);
        return { behavior: 'allow', updatedInput: input };
      }
      
      // 创建权限请求
      const requestId = uuidv4();
      const permissionRequest = {
        requestId,
        toolUseId: options.toolUseID,
        toolName,
        input,
        sessionId: session.id,
        timestamp: Date.now()
      };
      
      // 发送权限请求到前端
      res.write(`data: ${JSON.stringify({ 
        type: "permission_request", 
        ...permissionRequest
      })}\n\n`);
      
      // 创建 Promise 等待用户响应
      return new Promise<PermissionResult>((resolve, reject) => {
        const pending: PendingPermission = {
          resolve,
          reject,
          toolName,
          input,
          sessionId: session.id,
          timestamp: Date.now()
        };
        
        pendingPermissions.set(requestId, pending);
        
        // 设置超时
        setTimeout(() => {
          if (pendingPermissions.has(requestId)) {
            pendingPermissions.delete(requestId);
            console.log(`[Permission] Request timeout: ${requestId}`);
            resolve({
              behavior: 'deny',
              message: '权限请求超时'
            });
          }
        }, PERMISSION_TIMEOUT);
      });
    };
    
    // 使用 Query API 发送消息
    // 如果有 sdk_session_id，使用 resume 恢复对话上下文
    const stream = query({
      prompt: message,
      options: {
        cwd: workingDir,
        model: selectedModel,
        maxTurns: 10,
        systemPrompt: systemPrompt || defaultSystemPrompt,
        permissionMode: permissionMode || 'default',
        canUseTool,
        ...(sdkSessionId ? { resume: sdkSessionId } : {})  // 使用 resume 恢复对话
      }
    });

    let fullResponse = "";
    let toolCalls: Array<{ 
      id: string; 
      name: string; 
      input?: Record<string, unknown>;
      status: string; 
      result?: string;
      isError?: boolean;
    }> = [];
    let newSdkSessionId: string | null = null;  // 用于存储 SDK 返回的 session_id

    // 发送会话ID和消息ID
    res.write(`data: ${JSON.stringify({ 
      type: "init", 
      sessionId: session.id, 
      userMessageId, 
      assistantMessageId,
      model: selectedModel 
    })}\n\n`);

    // 当前正在执行的工具 ID（用于匹配 tool_result）
    let currentToolId: string | null = null;

    // 处理流式响应
    for await (const msg of stream) {
      console.log("[Stream] Message type:", msg.type, msg);
      
      // 处理 system 消息，获取 SDK 的 session_id
      if (msg.type === "system" && (msg as any).subtype === "init") {
        newSdkSessionId = (msg as any).session_id;
        console.log(`[Stream] Got SDK session_id: ${newSdkSessionId}`);
        
        // 保存 SDK session_id 到数据库（如果是新的）
        if (newSdkSessionId && newSdkSessionId !== sdkSessionId) {
          db.updateSession(session.id, { sdk_session_id: newSdkSessionId });
          console.log(`[Stream] Saved SDK session_id to database`);
        }
      } else if (msg.type === "assistant") {
        const content = msg.message.content;

        if (typeof content === "string") {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ type: "text", content })}\n\n`);
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text") {
              fullResponse += block.text;
              res.write(`data: ${JSON.stringify({ type: "text", content: block.text })}\n\n`);
            } else if (block.type === "tool_use") {
              currentToolId = block.id || uuidv4();
              const toolInput = (block as any).input || {};
              console.log(`[Stream] Tool use: id=${currentToolId}, name=${block.name}`);
              console.log(`[Stream] Tool input:`, JSON.stringify(toolInput, null, 2));
              
              const toolCall = { 
                id: currentToolId, 
                name: block.name, 
                input: toolInput,
                status: "running" 
              };
              toolCalls.push(toolCall);
              res.write(`data: ${JSON.stringify({ 
                type: "tool", 
                id: toolCall.id,
                name: toolCall.name,
                input: toolCall.input,
                status: toolCall.status
              })}\n\n`);
            }
          }
        }
      } else if ((msg as any).type === "tool_result") {
        // 处理工具结果（独立的消息类型）
        const msgAny = msg as any;
        const toolId = msgAny.tool_use_id || currentToolId;
        const isError = msgAny.is_error || false;
        const content = msgAny.content;
        
        console.log(`[Stream] Tool result: tool_use_id=${toolId}, is_error=${isError}`);
        console.log(`[Stream] Tool result content type:`, typeof content);
        console.log(`[Stream] Tool result content:`, typeof content === 'string' ? content.slice(0, 500) : JSON.stringify(content, null, 2)?.slice(0, 500));
        
        const tool = toolCalls.find(t => t.id === toolId) || toolCalls[toolCalls.length - 1];
        if (tool) {
          tool.status = isError ? "error" : "completed";
          tool.isError = isError;
          tool.result = typeof content === 'string' 
            ? content 
            : JSON.stringify(content);
          res.write(`data: ${JSON.stringify({ 
            type: "tool_result", 
            toolId: tool.id, 
            content: tool.result,
            isError: isError
          })}\n\n`);
        }
        currentToolId = null;
      } else if (msg.type === "result") {
        // 完成时确保所有工具都标记为完成
        toolCalls.forEach(tool => {
          if (tool.status === "running") {
            tool.status = "completed";
            res.write(`data: ${JSON.stringify({ type: "tool_result", toolId: tool.id, content: tool.result || "已完成" })}\n\n`);
          }
        });
        const doneMsg = msg as any;
        res.write(`data: ${JSON.stringify({ type: "done", duration: doneMsg.duration_ms, cost: doneMsg.total_cost_usd })}\n\n`);
      }
    }

    // 保存助手消息到数据库
    db.createMessage({
      id: assistantMessageId,
      session_id: session.id,
      role: 'assistant',
      content: fullResponse,
      model: selectedModel,
      created_at: new Date().toISOString(),
      tool_calls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null
    });

    // 更新会话标题（如果是第一条消息）
    const messages = db.getMessagesBySession(session.id);
    if (messages.length <= 2) {
      db.updateSession(session.id, { 
        title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
        model: selectedModel
      });
    }

    console.log(`[Chat] 请求完成 ✓`);
    res.end();
  } catch (error: any) {
    console.error(`\n[Chat] ========== 错误 ==========`);
    console.error(`[Chat] Error Name:`, error?.name);
    console.error(`[Chat] Error Message:`, error?.message);
    console.error(`[Chat] Error Code:`, error?.code);
    console.error(`[Chat] Error Stack:`, error?.stack);
    console.error(`[Chat] Full Error:`, JSON.stringify(error, null, 2));
    
    const errorMessage = error?.message || "处理请求时发生错误";
    res.write(`data: ${JSON.stringify({ type: "error", message: errorMessage })}\n\n`);
    res.end();
  }
});

// ============= 行情监控 API =============

// 监控状态
app.get("/api/monitor/status", (req, res) => {
  res.json({ status: monitor.getStatus() });
});

// 移动端行情快照：一次请求返回自选股的实时价格和涨跌幅
app.get("/api/quotes", async (req, res) => {
  try {
    const items = db.getWatchlist();
    const marketCodes = items.map(item => {
      const code = item.code.trim().toLowerCase();
      if (/^(sh|sz|bj)/.test(code)) return code;
      return /^6|^9/.test(code) ? `sh${code}` : /^4|^8/.test(code) ? `bj${code}` : `sz${code}`;
    });
    const quotes = await fetchRealtimeQuotes(marketCodes);
    res.json({
      quotes: items.map(item => {
        const code = item.code.trim().toLowerCase();
        const marketCode = /^(sh|sz|bj)/.test(code) ? code : /^6|^9/.test(code) ? `sh${code}` : /^4|^8/.test(code) ? `bj${code}` : `sz${code}`;
        const quote = quotes.get(marketCode);
        return { ...item, name: quote?.name || item.name, price: quote?.price ?? null, changePct: quote?.changePct ?? null };
      }),
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(502).json({ error: error?.message || "获取行情失败" });
  }
});

// SSE 事件流（买点提醒等）
app.get("/api/monitor/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  monitor.addClient(res);
});

// 自选股列表
app.get("/api/watchlist", (req, res) => {
  try {
    res.json({ items: db.getWatchlist() });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "获取自选股失败" });
  }
});

// 添加自选股
app.post("/api/watchlist", (req, res) => {
  try {
    const { code, name } = req.body || {};
    if (!code) return res.status(400).json({ error: "股票代码不能为空" });

    const normalized = String(code).trim();
    // 简单校验：6位数字 或 带市场前缀
    const codeOnly = normalized.replace(/^(sh|sz|bj)/i, "");
    if (!/^\d{6}$/.test(codeOnly)) {
      return res.status(400).json({ error: "股票代码格式不正确，应为 6 位数字（如 600519）" });
    }

    const existing = db.getWatchlist().find(w => w.code === normalized || w.code === codeOnly);
    if (existing) return res.status(409).json({ error: `股票 ${existing.name || codeOnly}(${existing.code}) 已在自选股中` });

    const item = db.addWatchItem({
      id: uuidv4(),
      code: codeOnly,
      name: String(name || codeOnly).trim(),
      created_at: new Date().toISOString(),
    });
    res.json({ item });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "添加自选股失败" });
  }
});

// 批量导入自选股
// 请求体: { items: [{ code: "600519", name?: "贵州茅台" }, ...] }，单次最多 200 条
app.post("/api/watchlist/batch", async (req, res) => {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "请至少提供一条要导入的股票" });
    }
    if (items.length > 200) {
      return res.status(400).json({ error: "单次最多导入 200 只股票" });
    }

    // 现有自选股（用于去重）
    const existing = db.getWatchlist();
    const existingCodes = new Set(existing.map(w => w.code));

    // 第一轮：逐条校验 + 去重，收集缺少名称的代码
    interface ParsedItem { code: string; name: string; }
    const parsed: ParsedItem[] = [];
    const skipped: { code: string; name?: string; reason: string }[] = [];
    const errors: { code: string; name?: string; error: string }[] = [];
    const seen = new Set<string>();
    const needNameCodes: string[] = [];

    for (const raw of items) {
      const inputCode = String(raw?.code ?? raw ?? "").trim();
      let name = String(raw?.name ?? "").trim();
      const codeOnly = inputCode.replace(/^(sh|sz|bj)/i, "");

      if (!/^\d{6}$/.test(codeOnly)) {
        errors.push({ code: inputCode, name: name || undefined, error: "代码格式不正确，应为 6 位数字（如 600519）" });
        continue;
      }
      if (seen.has(codeOnly)) {
        skipped.push({ code: codeOnly, name: name || undefined, reason: "与本次导入的其它条目重复" });
        continue;
      }
      seen.add(codeOnly);
      if (existingCodes.has(codeOnly)) {
        skipped.push({ code: codeOnly, name: name || undefined, reason: "已在自选股中" });
        continue;
      }
      parsed.push({ code: codeOnly, name });
      if (!name) needNameCodes.push(codeOnly);
    }

    // 批量补全名称（腾讯接口，失败不影响导入，名称默认用代码）
    let nameMap = new Map<string, string>();
    if (needNameCodes.length > 0) {
      try {
        nameMap = await fetchStockNames(needNameCodes);
      } catch (err) {
        console.warn("[Watchlist] 批量补全名称失败（不影响导入）:", err);
      }
    }

    // 组装并事务插入
    const now = new Date().toISOString();
    const toAdd = parsed.map(p => ({
      id: uuidv4(),
      code: p.code,
      name: p.name || nameMap.get(p.code) || p.code,
      created_at: now,
    }));
    let inserted = 0;
    if (toAdd.length > 0) {
      inserted = db.addWatchItemsBulk(toAdd);
    }

    res.json({
      added: toAdd.slice(0, inserted),
      addedCount: inserted,
      skipped,
      skippedCount: skipped.length,
      errors,
      errorCount: errors.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "批量导入自选股失败" });
  }
});

// 删除自选股
app.delete("/api/watchlist/:id", (req, res) => {
  try {
    const success = db.deleteWatchItem(req.params.id);
    if (!success) return res.status(404).json({ error: "自选股不存在" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "删除自选股失败" });
  }
});

// 手动触发巡检
app.post("/api/monitor/run", async (req, res) => {
  try {
    const result = await monitor.runCheck("manual");
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "巡检失败" });
  }
});

// 开启/关闭监控
app.post("/api/monitor/toggle", (req, res) => {
  const { enabled } = req.body || {};
  monitor.setEnabled(!!enabled);
  res.json({ enabled: monitor.isEnabled() });
});

// 运行历史
app.get("/api/monitor/runs", (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit || "20")), 100);
  res.json({ runs: db.getRecentRuns(limit) });
});

// 买点信号
app.get("/api/monitor/signals", (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit || "50")), 200);
  res.json({ signals: db.getRecentSignals(limit) });
});

// ============= 产业链分析 API =============

registerChainRoutes(app);
registerMainstreamRoutes(app);
registerSectorEffectRoutes(app);

// ============= 生产模式静态服务（桌面打包后由 Express 直接提供前端页面） =============

const distDir = path.join(_dirname, "..", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA 路由回退（排除 API 路径）
  app.get(/^\/(?!api(\/|$)).*/, (req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
  console.log(`[Server] 静态页面目录: ${distDir}`);
}

// 启动服务器
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║                                            ║
║     ◉ API 服务器已启动                      ║
║                                            ║
║     地址: http://localhost:${PORT}            ║
║     数据库: SQLite (data/chat.db)          ║
║                                            ║
╚════════════════════════════════════════════╝
  `);

  // 启动行情监控
  monitor.start();
});
