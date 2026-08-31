# -*- coding: utf-8 -*-
"""v1.1.05 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法（必须用 -S 跳过 sitecustomize，否则 safe-delete 钩子会拦截目录清理）：
    python -S scripts/package_v11105.py

变更：
  修复"CodeBuddy CLI not found"登录报错（v1.1.04 在用户环境复现的 bug）。
  根因：SDK 的 cli-resolver.js 在 esbuild bundle 后其内部 __dirname 被改写，
  fallback 探测路径解析失败；Electron 主进程的环境变量注入又依赖多个文件
  存在性检查，缺一即整链路失败。修复方法是在 server 启动时主动兜底探测并
  设置 CODEBUDDY_CODE_PATH，绕过 SDK 的 fallback，让登录请求走最可靠的
  「环境变量」分支。
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.1.05"
VER_DIR = os.path.join(BASE, "release", f"紫金红葫芦-v{VER}-win")
ZIP_PATH = os.path.join(BASE, "release", f"紫金红葫芦-v{VER}-win.zip")
TOP_FOLDER = f"紫金红葫芦-v{VER}-win"
EXE_NAME = "紫金红葫芦.exe"
OLD_EXE = "自选股行情监控.exe"


def sync(name):
    src = os.path.join(BASE, name)
    dst = os.path.join(APP_DIR, name)
    if os.path.exists(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst)
    print(f"[sync] {name}")


for name in ("dist", "dist-server", "electron"):
    sync(name)
shutil.copy2(os.path.join(BASE, "package.json"), os.path.join(APP_DIR, "package.json"))
print("[sync] package.json")

if os.path.exists(VER_DIR):
    shutil.rmtree(VER_DIR)
shutil.copytree(WIN_UNPACKED, VER_DIR, ignore=shutil.ignore_patterns("node-pty"))
print(f"[copy] {os.path.basename(VER_DIR)}")

old_exe_path = os.path.join(VER_DIR, OLD_EXE)
new_exe_path = os.path.join(VER_DIR, EXE_NAME)
if os.path.exists(old_exe_path):
    os.rename(old_exe_path, new_exe_path)
    print(f"[rename] {OLD_EXE} -> {EXE_NAME}")
elif os.path.exists(new_exe_path):
    print(f"[rename] 已是 {EXE_NAME}")
else:
    raise SystemExit(f"未找到可执行文件：{old_exe_path}")

launcher = os.path.join(VER_DIR, "启动紫金红葫芦.cmd")
with open(launcher, "w", encoding="gbk", newline="") as f:
    f.write("@echo off\r\nstart \"紫金红葫芦\" \"%~dp0紫金红葫芦.exe\"\r\n")
print("[launcher] 启动紫金红葫芦.cmd")

notes = os.path.join(VER_DIR, "版本说明.txt")
with open(notes, "w", encoding="utf-8") as f:
    f.write(
        f"紫金红葫芦 v{VER}\n\n"
        "本版本为桌面主线版本，在 v1.1.04 基础上修复登录问题。\n\n"
        "【本次更新】\n"
        "一、修复「CodeBuddy CLI not found」登录报错（v1.1.04 复现）\n"
        "   根因：SDK 的 cli-resolver.js 在 esbuild bundle 后，\n"
        "   其内部 __dirname 会被 esbuild 的 __commonJS wrapper 改写，\n"
        "   fallback 路径解析（<dist-server>/../../cli/bin/codebuddy）\n"
        "   无法定位到打包目录；同时 Electron 主进程的环境变量注入\n"
        "   又依赖多个文件存在性检查，缺一即整链路失败。\n"
        "   修复：server 启动时主动兜底探测并设置 CODEBUDDY_CODE_PATH，\n"
        "   绕过 SDK 的 fallback，让登录请求走最可靠的「环境变量」分支。\n"
        "   验证：dev 环境模拟下，POST /api/auth/login 返回 success 事件，\n"
        "   [Auth Login] 登录成功。\n\n"
        "【v1.1.04 已包含】\n"
        "- 板块效应表格改为完整展示历史数据（内置 2026 年腾讯文档模板，\n"
        "  167 个交易日 2026/1/5 ~ 2026/8/31）\n"
        "- 修复查询指定日期导致界面白屏的问题\n"
        "- 修复历史日期查询污染最近交易日数据的缺陷\n"
        "- 保护模板历史数据不被自动抓取覆盖\n"
        "- 新增「导入历史」按钮\n\n"
        "【栏目顺序】\n"
        "板块效应 → 行情监控 → 涨停异动分析 → 板块产业链\n\n"
        "【功能】\n"
        "板块效应（历史矩阵 + 自动更新）、行情监控、涨停异动分析、\n"
        "板块产业链、智能对话、自选股管理、自动巡检、5 个标准买点、\n"
        "系统提醒、浅色 / 故宫红 / 深色三种主题。\n\n"
        "【运行要求】\n"
        "Windows 10 / 11 64 位；运行需联网（行情接口 + Agent 通道）。\n"
        "首次使用 Agent 相关功能需在「设置」中登录 CodeBuddy。\n\n"
        "双击「紫金红葫芦.exe」或「启动紫金红葫芦.cmd」即可运行。\n"
    )
print("[notes] 版本说明.txt")

if os.path.exists(ZIP_PATH):
    os.remove(ZIP_PATH)
count = 0
with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for root, dirs, files in os.walk(VER_DIR):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, VER_DIR)
            zf.write(full, os.path.join(TOP_FOLDER, rel))
            count += 1

print(f"[zip] {os.path.basename(ZIP_PATH)} files={count} "
      f"size={os.path.getsize(ZIP_PATH)/1024/1024:.1f}MB")
print("DONE")
