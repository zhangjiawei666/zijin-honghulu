# -*- coding: utf-8 -*-
"""v1.2.06 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法：python -S scripts/package_v11206.py

本版只做一件事（用户两处硬性指责的修复，未改任何表格展示规则）：
  一、修复「板块效应只显示 11 个板块」
     根因：前端 5 处硬编码 `Math.min(data.maxCols, 11)` 把后端给的 18 列砍成 11 列；
           后端 `MAX_SECTOR_COLS` 又长期写死为 17，双保险式地把第 18 列也丢了。
     修复：前端改为 `displayColCount = min(maxCols, columns.length, MAX_SECTOR_COLS)` 不再二次裁剪；
           前后端 `MAX_SECTOR_COLS` 同步改为 18，与腾讯文档模板（时间 + 板块1~板块18）对齐。
           单日查询回退视图的 `slice(0,17)` 也改为 `slice(0, MAX_SECTOR_COLS)`。
  二、修复「9/2 商业航天7 来源不明」
     根因：9/2 数据曾被同花顺实时抓取写入（商业航天 limit_up_num=7），违反「以腾讯文档为准」。
     修复：9/2 严格取自腾讯文档基线（12 个板块，含第 18 列「军工4」，无商业航天）；
           腾讯文档源数据受 `isProtectedSource` 保护，实时抓取不再覆盖已有模板/手动数据。
  三、重新同步腾讯文档全部 18 列（含此前漏读的第 18 列），基线版本戳 r2 -> r3。

日期轴、列对齐、配色、图例、折叠逻辑，以及「节假日禁止填入数据」的规则均完全未改。
版本号：v1.2.05 -> v1.2.06。
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.2.06"
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
        "本版本修复用户提出的两处问题，未改动任何表格展示规则。\n\n"
        "【本次更新】\n"
        "一、修复「板块效应只显示 11 个板块」\n"
        "   - 根因：前端 5 处硬截断 `Math.min(data.maxCols, 11)` 把后端给的 18 列砍成 11 列；\n"
        "           后端 MAX_SECTOR_COLS 又长期写死为 17，第 18 列也被漏读。\n"
        "   - 修复：前端改为按后端真实列数渲染（不再二次裁剪）；前后端 MAX_SECTOR_COLS 统一改为 18，\n"
        "           与腾讯文档模板「时间 + 板块1~板块18」对齐。单日查询回退视图一并修掉 slice(0,17)。\n"
        "   - 效果：参考表列了 18 个板块，软件现在 18 个全部显示，不再擅自省略。\n\n"
        "二、修复「2026/9/2 商业航天7 个涨停」来源不明\n"
        "   - 根因：9/2 数据曾被同花顺实时抓取写入（商业航天 limit_up_num=7），违反「以腾讯文档为准」。\n"
        "   - 修复：9/2 严格取自腾讯文档基线（12 个板块，含第 18 列「军工4」，无商业航天）；\n"
        "           腾讯文档源数据受保护，实时抓取不再覆盖已有模板/手动录入的行。\n"
        "   - 重新同步腾讯文档全部 18 列（含此前漏读的第 18 列），基线版本戳 r2 -> r3。\n\n"
        "三、未改动项（与用户约定一致）\n"
        "   - 日期轴、列对齐、配色、图例、折叠逻辑完全未改。\n"
        "   - 「节假日禁止填入数据」的规则维持：周末与法定节假日行一律为空，仅保留日期维持轴。\n\n"
        "【v1.2.05 已包含】\n"
        "- 腾讯文档数据同步（仅交易日）；数据源由东方财富切换为同花顺。\n\n"
        "【v1.2.04 已包含】\n"
        "- 界面字体三档切换（小/中/大，仿通达信字号规格）。\n\n"
        "【v1.2.03 已包含】\n"
        "- 板块效应手动编辑模式：点击日期行编辑、手动数据受保护。\n\n"
        "【v1.2.02 已包含】\n"
        "- 修正 9/1 数据归属迁移、行情通道静默兜底、一键清除弹窗。\n\n"
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
