# -*- coding: utf-8 -*-
"""v1.2.02 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法：python -S scripts/package_v11202.py

变更（修正 9/1 数据归属 + 行情通道容错 + 一键清除弹窗）：
  1. 板块效应 9/1 数据迁移补强：
     - 旧版 9/1 数据错位到 9/2 的修复，原来要求 9/1 行必须存在；现在 9/1 缺失时也会
       从 9/2 复制一份并改日期为 9/1，幂等可重复执行。
  2. 行情监控取数容错：
     - Agent 通道在实时行情或日 K 完全失败时，改为静默返回 []，由内置通道兜底；
       旧版本会抛出"无法获取行情数据(内置取数失败)"导致用户误以为内置通道坏了。
     - 内置通道 fetchRealtimeQuotes 整批失败时返回 [] 而非抛错。
  3. 「一键清除弹窗」按钮：MonitorAlert 维护浏览器系统通知列表，
     点击清除时同时关闭页面通知、系统通知、清空信号列表。
  4. 版本号：v1.2.01 → v1.2.02。
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.2.02"
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
        "本版本修复 9/1 数据归属与行情通道取数容错，新增「一键清除弹窗」。\n\n"
        "【本次更新】\n"
        "一、9/1 数据归属修复\n"
        "   - 旧版本 08:00 调度把 9/1 收盘数据错位到 9/2 后，由于东财涨停池不支持历史日期，\n"
        "     9/1 真实数据无法通过 API 重新拉回。本版新增 9/1 行兜底逻辑：\n"
        "       · 当 9/2 含被错位的 9/1 数据（substituted_date=20260901，或 9/2 20:00 前的旧版无 substituted_date 记录）\n"
        "       · 且 9/1 不存在或为空 → 自动从 9/2 迁回并删除 9/2 错位行。\n"
        "       · 幂等可重复执行，不会覆盖 9/1 已有真实数据。\n\n"
        "二、行情通道取数容错\n"
        "   - 部分电脑代理/防火墙阻断腾讯行情接口时，Agent 通道会报『无法获取行情数据(内置取数失败)』，\n"
        "     提示文字让人误以为内置通道坏了。\n"
        "   - 本版 Agent 通道在实时行情 / 日 K 完全失败时静默退到内置通道，由内置通道兜底给出判定。\n"
        "   - 同时 fetchRealtimeQuotes 已支持批量失败时逐只回退、https 原生 fallback，\n"
        "     减少『一只不通全股不通』的概率。\n\n"
        "三、「一键清除弹窗」\n"
        "   - 行情监控栏目右上角新增『一键清除弹窗』按钮。\n"
        "   - 点击后同时关闭当前页面的 TDesign 通知、浏览器系统通知，并清空信号列表。\n\n"
        "【v1.2.01 已包含】\n"
        "- 板块效应更新时间改为当日 20:00（修日期错位），「跳到今天」按钮修复。\n\n"
        "【v1.1.10 已包含】\n"
        "- 板块效应数据治理：6 个周末行清空、垃圾单元格清除、概念固定列、叙述严谨化。\n"
        "【v1.1.09 已包含】\n"
        "- 修复 Agent 通道跌破均线仍触发买点。\n\n"
        "【栏目顺序】\n"
        "板块效应 → 行情监控 → 涨停异动分析 → 板块产业链\n\n"
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
