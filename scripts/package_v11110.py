# -*- coding: utf-8 -*-
"""v1.1.10 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法：python -S scripts/package_v11110.py

变更（板块效应数据治理 + 严谨化）：
  1. 修复 6 个周末行被错标 trading 且写入照搬腾讯文档的脏数据
     （20260523/20260524/20260620/20260627/20260628/20260822，
      原 name 为列号 "1/2/3"、备注 "低吸" 等）；现统一改为 weekend + 空板块。
  2. 清理交易日 20260619 中照搬的列号垃圾单元格（"1/2/3"，count=0）。
  3. importBuiltinHistory 对休市日（周末/节假日）每次启动强制修正 day_type 并清空板块，
     确保已入库旧脏数据被纠正（依据 sector-limitup-daily skill：周末/节假日不写虚构数据）。
  4. 新增 cleanupGarbageSectors 启动清理：剔除所有已入库行里的纯数字/备注脏单元格。
  5. "今日待更新"叙述严谨化：改为"今日待更新，交易日次日 8 点更新"；
     顶部状态改为"交易日次日 8 点更新"。
  6. 概念固定列保持不变（buildColumnMapping 已按频率把同一概念固定到同一列，
     如商业航天恒为列 0），本版仅清除污染列映射的脏数据。
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.1.10"
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
        "本版本在 v1.1.09 基础上治理板块效应表格数据并严谨化描述。\n\n"
        "【本次更新】\n"
        "一、修复周末行被误标交易日并写入脏数据\n"
        "   - 问题：v1.1.09 前把 6 个周六日（20260523/20260524/20260620/20260627/\n"
        "     20260628/20260822）错标为 trading，且照搬腾讯文档列号（1/2/3）、备注（低吸）\n"
        "     等作为板块数据写入。\n"
        "   - 修复：这 6 天改为 weekend 休市、板块清空；交易日 20260619 的列号垃圾单元格\n"
        "     一并清除。历史文件交易日数由 168 修正为 162，周末由 62 修正为 68。\n"
        "   - 依据 sector-limitup-daily skill：周末/节假日不写入当日虚构数据。\n\n"
        "二、已入库旧脏数据强制纠正\n"
        "   - importBuiltinHistory 对休市日每次启动强制修正 day_type 并清空板块；\n"
        "   - 新增 cleanupGarbageSectors 启动清理，剔除所有已入库行里的纯数字/备注垃圾单元格。\n\n"
        "三、「今日待更新」叙述严谨化\n"
        "   - 今日行描述改为「今日待更新，交易日次日 8 点更新」；\n"
        "   - 顶部状态改为「交易日次日 8 点更新」。\n\n"
        "四、概念固定列（沿用）\n"
        "   - 同一概念始终落在同一列（如商业航天恒为列 0），脏数据清除后列映射更准确。\n\n"
        "【v1.1.09 已包含】\n"
        "- 修复 Agent 通道跌破均线仍触发买点\n\n"
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
