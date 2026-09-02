# -*- coding: utf-8 -*-
"""v1.2.10 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法：python -S scripts/package_v11210.py

本版核心改造（板块效应「按板块名透视」，彻底去掉写死的 18 列表头）：
  1. 后端矩阵改用「按板块名透视(pivot)」：
     - 列 = 历史上出现过的所有板块「标准名」并集，不再写死 板块1~18、不再有 18 列硬上限；
       新概念随数据自动新增列（实测 window=0 下 94 列，远超旧 18 列上限）。
     - 单日板块数组按「标准名」聚合到对应列，某日涨停为 0 则单元格留空（不丢列、不丢板块）。
  2. 近 N 日主线视图：
     - 下拉「只看近(10/15/20)日主线」(默认 15)，同时控制列排序(近窗活跃度降序)与
       仅显示近 N 交易日有涨停的板块；选「全部」则展示全样本。
  3. 板块合并(可累加配置，非白名单)：
     - SECTOR_CANON_GROUPS 把同驱动子板块归并(农业/农林牧渔/大农业→农业、电力/智能电网/算电协同→电力…)，
       共 25 组，后续新增只需往配置里加，绝不写死。
     - 合并单元格右上角金色「!」角标；悬停展示子板块明细(如 半导体=[半导体4, 光刻胶10])。
  4. 周末/节假日空行保留：日期轴含周末(68)+节假日(11)共 79 个空行，仅维持轴、单元格全空。
  5. 手动安全网(防数据混乱最后一道)：
     - 列头右键菜单：重命名 / 合并到… / 拆分(独立成列) / 隐藏本列(仅视图)。
     - 「板块管理」弹窗：查看全部标准列及其别名、添加合并、重命名、拆分、一键重置为自动。
     - 合并/重命名/拆分规则存 app_meta(热更新)，不被自动同步覆盖；重置即回到自动透视。
  6. 数据抓取通道完全不变（同花顺 block_top 主源、东财回退、腾讯文档基线导入逻辑原样保留）。
版本号：v1.2.07 -> v1.2.10。
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.2.10"
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
        "本版本对「板块效应」栏目做核心重构：表头由写死的「板块1~18」改为「按板块名透视」，\n"
        "彻底解决新概念无法上表、低频板块被静默丢弃的问题。\n\n"
        "【本次更新】\n"
        "1. 板块效应改为按板块名透视(pivot)：\n"
        "   - 列 = 历史上出现过的所有板块标准名并集，无 18 列硬上限，新概念随数据自动新增列；\n"
        "   - 同一板块固定在同一列，某日涨停为 0 则单元格留空（不丢列、不丢板块）。\n"
        "2. 近 N 日主线视图：下拉「只看近(10/15/20)日主线」(默认 15)，\n"
        "   同时控制列排序(近窗活跃度降序)与仅显示近 N 交易日有涨停的板块。\n"
        "3. 板块合并(可累加配置)：农业/农林牧渔/大农业→农业、电力/智能电网/算电协同→电力 等共 25 组；\n"
        "   合并单元格右上角金色「!」角标，悬停展示子板块明细。\n"
        "4. 周末/节假日空行保留：日期轴含周末与节假日空行，仅维持轴、单元格全空。\n"
        "5. 手动安全网：列头右键可重命名/合并/拆分/隐藏；「板块管理」弹窗可查看别名、\n"
        "   添加合并、重置为自动透视，规则热更新且不被自动同步覆盖。\n"
        "6. 数据抓取通道完全不变（同花顺主源、东财回退、腾讯文档基线导入原样保留）。\n\n"
        "【v1.2.07 已包含】\n"
        "   - 修复「农业板块有涨停却没显示」（旧版全局频率列映射静默丢弃低频板块）。\n\n"
        "【v1.2.05 已包含】\n"
        "- 腾讯文档数据同步（仅交易日）；数据源由东方财富切换为同花顺。\n\n"
        "【v1.2.04 已包含】\n"
        "- 界面字体三档切换（小/中/大，仿通达信字号规格）。\n\n"
        "【v1.2.03 已包含】\n"
        "- 板块效应手动编辑模式：点击日期行编辑、手动数据受保护。\n\n"
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
