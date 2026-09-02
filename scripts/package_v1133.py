# -*- coding: utf-8 -*-
"""v1.3.3 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法：python -S scripts/package_v1133.py

本版在 v1.2.12 基础上，对板块效应再做四项完善（版本号遵从十进制进位铁律：
v1.2.10 -> v1.3.1 -> v1.3.2 -> v1.3.3，到 .10 进位、进位后下一档从 .01 起）：
  1. 合并角标回退为金色「!」：仅「别名→标准名」合成的单元格(如 农业8 = 农业5+农林牧渔3)
     右上角显示金色「!」，纯板块(单一来源)单元格不显示；悬停仍弹子板块明细。
  2. 右下角上浮的上/下圆形图标(回到顶部/跳到今天)改为 position:fixed 悬浮于最顶层
     (z-index 9999)，滚动到表格中间也始终可见；按钮放大为 48px 实心主色，更显眼。
  3. 节假日处理：遇节假日行不再折叠，始终显式保留并在表格中填写「节假日休市」；
     深色模式下该栏保持暖色以易读。周末仍按原逻辑折叠/显示。
  4. 版本号进位规则严格化（铁律，不仅限于 v1.2.x）：到 .10 即进位 minor、patch 归 .01，
     不可跳号。
版本号：v1.2.12 -> v1.3.3（中间 v1.3.1/v1.3.2 为历史进位档，本次落地为 v1.3.3）。
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.3.3"
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
        "本版本继续打磨「板块效应」栏目的交互与可视化，并严格统一版本号进位规则。\n\n"
        "【本次更新】\n"
        "1. 合并角标回退为金色「!」：仅『别名→标准名』合成的单元格(如 农业8 = 农业5+农林牧渔3)\n"
        "   右上角显示金色「!」，纯板块(单一来源)单元格不显示；悬停弹子板块明细。\n"
        "2. 右下角上浮的上/下圆形图标(回到顶部/跳到今天)改为悬浮于最顶层，滚动到表格中间也\n"
        "   始终可见；按钮放大为 48px 实心主色，更显眼，便于快速回到顶部/跳到今天。\n"
        "3. 节假日处理：遇节假日行不再折叠，始终显式保留并在表格中填写『节假日休市』；\n"
        "   深色模式下该栏保持暖色以保证可读。\n"
        "4. 版本号进位铁律：到 .10 进位 minor、patch 归 .01，不可跳号。\n\n"
        "【版本号进位规则（铁律）】\n"
        "   v1.0.10 -> v1.1.01 … v1.1.10 -> v1.2.01 … v1.2.10 -> v1.3.01 -> v1.3.10 -> v1.4.01 …\n"
        "   本次为 v1.3.3（v1.2.10 之后依次 v1.3.1 / v1.3.2 / v1.3.3）。\n\n"
        "【v1.2.12 已包含】\n"
        "   - 主线下拉精简为『只看近（全部/10/15/20）日主线』；手动编辑/板块管理移至顶部操作栏。\n\n"
        "【v1.2.11 已包含】\n"
        "   - 配色即情绪(红深=高潮防风险、红浅=低迷找机会)。\n\n"
        "【v1.2.10 已包含】\n"
        "   - 板块效应按板块名透视(pivot)：列无 18 列硬上限；近 N 日主线、板块合并、手动安全网。\n\n"
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
