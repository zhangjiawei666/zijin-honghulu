# -*- coding: utf-8 -*-
"""v1.2.12 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法：python -S scripts/package_v11212.py

本版在 v1.2.11 基础上，对板块效应交互再做四项完善：
  1. 合并角标精细化为「别名→标准名」合成单元格专属：仅当日该列由多个子板块归并合成的
     单元格(如 农业8 = 农业5+农林牧渔3)右上角显示金色圆点+；纯板块单元格(单一来源)不显示。
     悬停仍弹子板块明细。
  2. 主线下拉标签精简为「只看近（全部/10/15/20）日主线」，去掉冗余「近…日」字样。
  3. 控件归位：「手动编辑」「板块管理」移至表格顶部操作栏(原回到顶部/跳到今天位置)；
     「回到顶部」「跳到今天」改为右下角上浮的上/下圆形图标按钮。
  4. 深色模式美化：表头/日期列/休市行/单元格/月份分隔/右键菜单均按暗色主题配色，
     配色即情绪在暗色下改用半透明深红叠加 + 白字，保证可读。
版本号：v1.2.11 -> v1.2.12。
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.2.12"
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
        "本版本继续打磨「板块效应」栏目的交互与可视化。\n\n"
        "【本次更新】\n"
        "1. 合并角标精细化为「别名→标准名」合成单元格专属：仅当日由多个子板块归并合成的\n"
        "   单元格(如 农业8 = 农业5+农林牧渔3)右上角显示金色圆点+；纯板块(单一来源)单元格不显示。\n"
        "   悬停任一合并单元格仍弹子板块明细。\n"
        "2. 主线下拉标签精简为「只看近（全部/10/15/20）日主线」，去掉冗余『近…日』字样。\n"
        "3. 控件归位：「手动编辑」「板块管理」移至表格顶部操作栏；\n"
        "   「回到顶部」「跳到今天」改为表格右下角上浮的上/下圆形图标按钮。\n"
        "4. 深色模式美化：表头/日期列/休市行/单元格/月份分隔/右键菜单均按暗色主题配色；\n"
        "   配色即情绪在暗色下改用半透明深红叠加 + 白字，保证可读。\n\n"
        "【v1.2.11 已包含】\n"
        "   - 配色即情绪(红深=高潮防风险、红浅=低迷找机会)、合并角标可靠显示、跳到今天。\n\n"
        "【v1.2.10 已包含】\n"
        "   - 板块效应按板块名透视(pivot)：列无 18 列硬上限；近 N 日主线、板块合并(25组)、手动安全网。\n\n"
        "【v1.2.07 已包含】\n"
        "   - 修复「农业板块有涨停却没显示」。\n\n"
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
