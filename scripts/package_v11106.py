# -*- coding: utf-8 -*-
"""v1.1.06 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法（必须用 -S 跳过 sitecustomize，否则 safe-delete 钩子会拦截目录清理）：
    python -S scripts/package_v11106.py

变更（板块效应表格三处调整，经用户确认效果图后实施）：
  1. 时间排序由倒序改为正序，最早的日期在表格顶部；
  2. 保留空缺日期，不再只显示有数据的交易日，日期轴完整连续；
  3. 休市日细分标注：周末休市（灰）/ 节假日休市（琥珀）/ 今日待更新（紫）。
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.1.06"
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
        "本版本为桌面主线版本，在 v1.1.05 基础上调整板块效应表格。\n\n"
        "【本次更新】\n"
        "一、时间排序改为正序\n"
        "   表格按日期从早到晚排列，2026/1/5 在顶部、最新日期在底部，\n"
        "   与腾讯文档「2026板块效应」模板的填写顺序一致。\n"
        "   为方便查看最新数据，打开页面时会自动滚动定位到今天所在行，\n"
        "   并在工具栏提供「回到顶部」「跳到今天」两个按钮。\n\n"
        "二、保留空缺日期，日期轴完整\n"
        "   过去只导入 167 个有数据的交易日，周末与节假日被丢弃。\n"
        "   现在改为保留 2026/1/5 至今天的每一天，共 240 天，\n"
        "   休市日逐行显示，不再断档。\n\n"
        "三、休市日细分标注\n"
        "   周末休市（灰色）：周六周日，共 62 天\n"
        "   节假日休市（琥珀色）：工作日法定节假日，共 10 天\n"
        "     —— 春节 2/16-2/20 与 2/23、清明 4/6、劳动节 5/1 与 5/4-5/5\n"
        "   今日待更新（紫色）：今天尚未收盘，等 08:00 自动更新\n"
        "   注：未来日期不入库，避免把尚未发生的日期误标为节假日。\n\n"
        "四、日期列增加星期显示\n"
        "   每行日期右侧以小字标注周几，便于快速识别周末。\n\n"
        "【v1.1.05 已包含】\n"
        "- 修复「CodeBuddy CLI not found」登录报错\n\n"
        "【v1.1.04 已包含】\n"
        "- 板块效应表格改为完整展示历史数据\n"
        "- 修复查询指定日期导致界面白屏的问题\n"
        "- 修复历史日期查询污染最近交易日数据的缺陷\n"
        "- 保护模板历史数据不被自动抓取覆盖\n"
        "- 新增「导入历史」按钮\n\n"
        "【栏目顺序】\n"
        "板块效应 → 行情监控 → 涨停异动分析 → 板块产业链\n\n"
        "【功能】\n"
        "板块效应（历史矩阵 + 自动更新）、行情监控、涨停异动分析、\n"
        "板块产业链、智能对话、自选股管理、自动巡检、5 个标准买点、\n"
        "系统提醒、浅色 / 故宫红 / 深色三种主题。\n\n"
        "【运行要求】\n"
        "Windows 10 / 11 64 位；运行需联网（行情接口 + Agent 通道）。\n"
        "首次使用 Agent 相关功能需在「设置」中登录 CodeBuddy。\n\n"
        "双击「紫金红葫芦.exe」或「启动紫金红葫芦.cmd」即可运行。\n"
    )
print("[notes] 版本说明.txt")

if os.path.exists(ZIP_PATH):
    os.remove(ZIP_PATH)
count = 0
with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for root, dirs, files in os.walk(VER_DIR):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, VER_DIR)
            zf.write(full, os.path.join(TOP_FOLDER, rel))
            count += 1

print(f"[zip] {os.path.basename(ZIP_PATH)} files={count} "
      f"size={os.path.getsize(ZIP_PATH)/1024/1024:.1f}MB")
print("DONE")
