# -*- coding: utf-8 -*-
"""v1.2.07 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法：python -S scripts/package_v11207.py

本版修复（用户最新指责：农业板块有涨停却没显示）：
  根因：矩阵模式用「全局频率列映射」(buildColumnMapping) 把每个板块钉到固定列——
        只保留所有交易日里出现最频繁的 18 个板块为列；农业只在 8/31、9/1、9/2 少数几天
        出现、频率低，排不进 top-18，于是 alignRow 找不到归属列就把它静默丢弃。
        数据明明在库里，却被展示层丢掉——这就是"抄漏农业"的真凶。
  修复：改回「按文档列位的位置映射」——每行板块数组即「板块1~板块N」的列顺序
        （用户在腾讯文档里每天按列位手填），直接按位置渲染，不再做按名归并。
        用户填进去的每一个板块（含农业）都按位置显示，不会被踢出列集合。
        单日模式本就返回完整列表，不受影响。
  效果：8/31 农业显示于「板块12」、9/1 农业显示于「板块13」、9/2「大农业」显示于「板块10」。

未改动项：日期轴、列对齐(列位语义)、配色、图例、折叠逻辑，以及「节假日禁止填入数据」规则均完全未改。
版本号：v1.2.06 -> v1.2.07。
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.2.07"
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
        "本版本修复用户提出的「农业板块有涨停却没显示」问题，未改动任何表格展示规则。\n\n"
        "【本次更新】\n"
        "修复「农业板块明明有涨停，却没展示在表格中」\n"
        "   - 根因：矩阵模式此前用「全局频率列映射」，只把出现最频繁的 18 个板块钉成固定列；\n"
        "           农业只在 8/31、9/1、9/2 少数几天出现、频率低，排不进 top-18，\n"
        "           被静默丢弃——数据在库里却没显示出来。\n"
        "   - 修复：改回「按文档列位的位置映射」，每行板块数组即「板块1~板块N」的列顺序，\n"
        "           直接按位置渲染，不再做按名归并。用户填进去的每一个板块都按位置显示。\n"
        "   - 效果：8/31 农业→板块12、9/1 农业→板块13、9/2 大农业→板块10，均正常显示。\n\n"
        "【v1.2.06 已包含】\n"
        "   - 板块效应 18 个板块全部显示（前后端 MAX_SECTOR_COLS 统一 18，移除 11 列硬截断）。\n"
        "   - 9/2 严格取自腾讯文档（无商业航天），重新同步全部 18 列（含第 18 列）。\n\n"
        "【v1.2.05 已包含】\n"
        "- 腾讯文档数据同步（仅交易日）；数据源由东方财富切换为同花顺。\n\n"
        "【v1.2.04 已包含】\n"
        "- 界面字体三档切换（小/中/大，仿通达信字号规格）。\n\n"
        "【v1.2.03 已包含】\n"
        "- 板块效应手动编辑模式：点击日期行编辑、手动数据受保护。\n\n"
        "【v1.2.02 已包含】\n"
        "- 修正 9/1 数据归属迁移、行情通道静默兜底、一键清除弹窗。\n\n"
        "【未改动项（与用户约定一致）】\n"
        "   - 日期轴、列对齐、配色、图例、折叠逻辑完全未改。\n"
        "   - 「节假日禁止填入数据」的规则维持：周末与法定节假日行一律为空，仅保留日期维持轴。\n\n"
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
