# -*- coding: utf-8 -*-
"""v1.3.4 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法：python -S scripts/package_v1134.py

本版聚焦「板块效应数据更新调度」的改造（版本号进位铁律 v1.3.3 -> v1.3.4）：
  1. 自动更新触发时间由「工作日 20:00 单次」改为「交易日 17:00 + 18:00 两轮」
     （按日重置轮次；收盘后涨停数已定稿，第二轮为定稿补抓/容错缓冲）。
  2. 启动补抓：App 在当天 18:00 之后才打开，若今日尚未更新则立即补一次，
     规避「关 App 期间漏更」。
  3. 真实休市日跳过：新增 EXCHANGE_HOLIDAYS_2026 集合 + isTradingDay（周一到周五且非法定休市日）；
     每年初按国务院安排更新；即便误配，fetchAndStore 空结果不写库保护仍兜底。
  4. 数据源与写入逻辑完全不变（同花顺 block_top 主源 / 东财涨停池回退 / 腾讯文档基线；
     按日期幂等 upsert + 空结果不写库）。
版本号：v1.3.3 -> v1.3.4（进位铁律：到 .10 进位 minor、patch 归 .01，不可跳号）。
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.3.4"
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
        "本版本改造「板块效应」自动更新调度，并严格统一版本号进位规则。\n\n"
        "【本次更新】\n"
        "1. 自动更新由『工作日 20:00 单次』改为『交易日 17:00 + 18:00 两轮』：\n"
        "   收盘后涨停清单即定稿，两轮抓的是同一份数据，第二轮作为定稿补抓/容错缓冲。\n"
        "2. 启动补抓：App 在当天 18:00 之后才打开、且今日尚未更新，则立即补一次，\n"
        "   规避关 App 期间漏更（两轮窗口都已过才补，与 17:00/18:00 定时互不重复）。\n"
        "3. 真实休市日跳过：内置 2026 年 A 股休市日集合，法定假日不触发抓取；\n"
        "   每年初按国务院安排更新；即便误配，空结果不写库保护仍兜底，不覆盖有效记录。\n"
        "4. 数据源与写入逻辑完全不变（同花顺主源 / 东财回退 / 腾讯文档基线；按日幂等 upsert）。\n\n"
        "【版本号进位规则（铁律）】\n"
        "   v1.0.10 -> v1.1.01 … v1.1.10 -> v1.2.01 … v1.2.10 -> v1.3.01 -> v1.3.10 -> v1.4.01 …\n"
        "   本次为 v1.3.4（v1.3.3 之上顺延）。\n\n"
        "【历史已包含】\n"
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
