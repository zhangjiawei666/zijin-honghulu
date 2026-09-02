# -*- coding: utf-8 -*-
"""v1.2.01 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法：python -S scripts/package_v1201.py

变更（数据更新时间修正 + 「跳到今天」修复）：
  1. 调度器时间从「每个交易日 08:00（次日）」改为「每个交易日 20:00（当日）」
     - 旧逻辑在 8:00 用 todayToken 抓取上一交易日已收盘数据，存入「今天」造成日期错位
       （用户截图：9/1 周二的数据被标到 9/2 周三）。
     - 新逻辑在 20:00 用 todayToken 抓取当日已收盘数据，存入当日，标签与数据严格一致。
  2. UI 叙述同步：顶部「交易日次日 8 点更新」→「交易日当日 20:00 更新」；
     「今日待更新」单元「交易日次日 8 点更新」→「今晚 20:00 更新」。
  3. 「跳到今天」按钮修复：原实现用 row.offsetTop - wrapper.offsetTop 算偏移，
     当行 offsetParent 不是 wrapper 时得到错误值。改为 getBoundingClientRect +
     内容空间换算 + maxScroll 裁剪，定位稳定。
  4. 关于 9/1 等历史缺口的说明：东财涨停池接口不支持历史日期查询（qdate 会被回写为
     最近交易日，实测请求 9/1 实际返回 9/2 的数据并落到 9/2），因此 9/1 的数据一旦
     被旧 8 AM 错位到 9/2，就无法通过 API 重新拉回。本版 20:00 调度保证从今晚起
     每日数据落在正确日期；9/1 是已知一次性损失，不影响后续所有日期。
  5. 版本号：v1.1.10 → v1.2.01（v1.1 系列完成 10 个小版本，规则进阶到 v1.2 系列）。
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.2.01"
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
        "本版本修正板块效应数据更新时间，并修复「跳到今天」按钮。\n\n"
        "【本次更新】\n"
        "一、数据更新时间改为当日 20:00（修日期错位）\n"
        "   - 旧逻辑：每个交易日 08:00 触发，用「今天」作为日期去抓取上一交易日已收盘数据，\n"
        "     造成数据日期与标签错位（如 9/1 周二的数据被标到 9/2 周三）。\n"
        "   - 新逻辑：每个交易日 20:00 触发，用「今天」作为日期去抓取当日已收盘数据，\n"
        "     标签与数据严格一致，不再错位。\n"
        "   - 同步 UI：顶部「交易日次日 8 点更新」→「交易日当日 20:00 更新」；\n"
        "     「今日待更新」单元格改为「今晚 20:00 更新」。\n\n"
        "二、「跳到今天」按钮修复\n"
        "   - 原实现用 row.offsetTop 减去 wrapper.offsetTop 计算滚动偏移，\n"
        "     当 row 的 offsetParent 不是 wrapper 时（多层定位祖先）会得到错误值。\n"
        "   - 新实现改用 getBoundingClientRect 在内容空间精确定位 + maxScroll 裁剪，\n"
        "     任何嵌套结构下都能稳定居中滚动到今天。\n\n"
        "三、关于 9/1 等历史缺口\n"
        "   - 东财涨停池接口不支持历史日期查询（qdate 会被回写为最近交易日），\n"
        "     因此 v1.1.10 之前 8 AM 错位到 9/2 的 9/1 数据，事后无法通过 API 重新拉回。\n"
        "   - 本版 20:00 调度保证从今晚起每日数据落在正确日期，9/1 是已知一次性损失。\n\n"
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
