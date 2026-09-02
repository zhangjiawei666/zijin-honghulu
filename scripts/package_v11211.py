# -*- coding: utf-8 -*-
"""v1.2.11 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法：python -S scripts/package_v11211.py

本版在 v1.2.10「按板块名透视」基础上，对板块效应栏目的交互与可视化做六项完善：
  1. 合并角标可靠显示：归并板块(农业/电力…)的每一非空单元格右上角均显示金色「!」，
     悬停展示子板块明细(如 半导体=[半导体4, 光刻胶10])。
  2. 配色即情绪：单元格红深=当日该板块涨停多=情绪高潮(防风险)；红浅=涨停少=低迷(找机会)。
     颜色按全表最大涨停数做色阶，无涨停则留空。
  3. 跳到今天：点击「跳到今天」平滑滚动到最新一日(无「今日待更新」行时滚到表底)。
  4. 精简操作栏：删除「指定日期查询 / 手动更新 / 查看全部 / 导入历史」四个按钮(美观)。
  5. 控件顺序：表头仅保留「回到顶部 / 跳到今天 / 只看近(10/15/20)日主线」，且主线下拉置于跳到今天之后。
  6. 删除表头统计文字(共X天/交易日X…)，仅留三控件 + 颜色图例。
版本号：v1.2.10 -> v1.2.11。
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.2.11"
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
        "本版本在「板块效应」栏目的可视化与交互上做六项完善，让主线追踪与情绪判读更直观。\n\n"
        "【本次更新】\n"
        "1. 配色即情绪：单元格红深 = 当日该板块涨停多 = 情绪高潮(防风险)；\n"
        "   红浅 = 涨停少 = 低迷(找机会)。颜色按全表最大涨停数做色阶，无涨停则留空。\n"
        "2. 合并角标可靠显示：归并板块(农业/农林牧渔/大农业→农业、电力/智能电网/算电协同→电力 等)\n"
        "   的每一非空单元格右上角均显示金色「!」，悬停展示子板块明细。\n"
        "3. 跳到今天：点击平滑滚动到最新一日(无「今日待更新」行时滚到表底)。\n"
        "4. 精简操作栏：删除「指定日期查询 / 手动更新 / 查看全部 / 导入历史」。\n"
        "5. 控件顺序：表头仅保留「回到顶部 / 跳到今天 / 只看近(10/15/20)日主线」，主线下拉置于跳到今天之后。\n"
        "6. 删除表头统计文字(共X天/交易日X…)，仅留三控件 + 颜色图例。\n\n"
        "【v1.2.10 已包含】\n"
        "   - 板块效应改为按板块名透视(pivot)：列 = 历史板块标准名并集，无 18 列硬上限；\n"
        "   - 近 N 日主线视图、板块合并(可累加25组)、手动安全网(列头右键+板块管理弹窗)。\n\n"
        "【v1.2.07 已包含】\n"
        "   - 修复「农业板块有涨停却没显示」（旧版全局频率列映射静默丢弃低频板块）。\n\n"
        "【v1.2.05 已包含】\n"
        "- 腾讯文档数据同步（仅交易日）；数据源由东方财富切换为同花顺。\n\n"
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
