# -*- coding: utf-8 -*-
"""v1.3.5 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法：python -S scripts/package_v1135.py

本版新增「个股深度挖掘」栏目（运用 stock-deep-dive 四段递进研究链）：
  1. 新增侧栏栏目「个股深度挖掘」，置于「板块效应」与「行情监控」之间。
  2. 新增后端路由 POST /api/deepdive/analyze（SSE 流式 + 只读检索工具白名单），
     system prompt 内嵌 stock-deep-dive 四段式（行业周期定位 -> 个股竞争地位
     -> 催化与事件分层 -> 辨识度与证据验证）+ 九段式报告模板（含结论置信度、
     强制证伪回路、禁止编造数字）。
  3. 新增前端页面 StockDeepDivePage（仿「板块产业链」交互）：
     代码/名称 + 可选链接 + 研究边界 -> 四段式深度报告，支持导出 PDF / 重新生成 / 登录引导。
  4. 侧栏「新对话」按钮由顶部移至最底部（设置之后）。
  5. 既有功能零改动：chain / mainstream / sector-effect / industry-chain / monitor 等
     路由、逻辑、UI 全部保留；冒烟测试已确认 /api/chain/analyze 等行为不变。
版本号：v1.3.4 -> v1.3.5（进位铁律：到 .10 进位 minor、patch 归 .01，不可跳号）。
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.3.5"
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
        "本版本新增「个股深度挖掘」栏目，并严格统一版本号进位规则。\n\n"
        "【本次更新】\n"
        "1. 侧栏新增「个股深度挖掘」栏目（显微镜图标），位于「板块效应」与「行情监控」之间；\n"
        "   运用 stock-deep-dive 四段递进研究链，输出带置信度与证伪清单的深度报告。\n"
        "2. 后端新增 POST /api/deepdive/analyze（SSE 流式 + 只读检索工具白名单），\n"
        "   内嵌四段式方法论：行业周期定位 -> 个股竞争地位 -> 催化与事件分层 -> 辨识度与证据验证。\n"
        "3. 前端新增 StockDeepDivePage：输入代码/名称 + 可选链接 + 研究边界，\n"
        "   流式渲染深度报告，支持导出 PDF / 重新生成 / 未登录引导。\n"
        "4. 侧栏「新对话」按钮由顶部移至最底部（设置之后）。\n"
        "5. 既有功能零改动：板块效应、行情监控、涨停异动分析、板块产业链、多 Agent 对话等全部保留。\n\n"
        "【版本号进位规则（铁律）】\n"
        "   v1.0.10 -> v1.1.01 … v1.1.10 -> v1.2.01 … v1.2.10 -> v1.3.01 … v1.3.10 -> v1.4.01 …\n"
        "   本次为 v1.3.5（v1.3.4 之上顺延）。\n\n"
        "【历史已包含】\n"
        "   - v1.3.4：板块效应自动更新改为交易日 17:00+18:00 两轮 + 启动补抓 + 真实休市日跳过。\n"
        "   - v1.3.3：金色「!」合并角标 + 右下角悬浮置顶放大图标 + 节假日显式填写。\n"
        "   - v1.2.11：配色即情绪(红深=高潮防风险、红浅=低迷找机会)。\n"
        "   - v1.2.10：板块效应按板块名透视(pivot)、近 N 日主线、板块合并、手动安全网。\n\n"
        "【运行要求】\n"
        "Windows 10 / 11 64 位；运行需联网（行情接口 + Agent 通道）。\n\n"
        "双击「紫金红葫芦.exe」或「启动紫金红葫芦.cmd」即可运行。\n"
    )
print("[notes] 版本说明.txt")

if os.path.exists(ZIP_PATH):
    os.remove(ZIP_PATH)
count = 0
with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for root, dirs, files in os.walk(VER_DIR):
        for fn in files:
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, VER_DIR)
            zf.write(full, os.path.join(TOP_FOLDER, rel))
            count += 1

print(f"[zip] {os.path.basename(ZIP_PATH)} files={count} "
      f"size={os.path.getsize(ZIP_PATH)/1024/1024:.1f}MB")
print("DONE")
