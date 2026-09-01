# -*- coding: utf-8 -*-
"""v1.1.08 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法：python -S scripts/package_v11108.py

变更（修复白屏 + 对齐效果图）：
  1. 修复板块效应页面白屏：添加 try-catch 渲染错误边界兜底，
     防止任何运行时异常导致整页空白；重排 hook 声明顺序消除潜在 TDZ 问题。
  2. 新增月份分隔标题行（如"1 月 · 正序排列，最早的日期在最上方"）。
  3. 新增颜色图例栏（榜首板块红 / 中列板块蓝 / 周末休市灰 / 节假日琥珀 / 今日紫）。
  4. 新增连续休市日折叠省略行（≥3 天时折叠为"… 省略 x–y 共 N 天 …"）。
  5. 继续保留 v1.1.07 的 scrollToToday 手动 offset 修复和周末/节假日行补齐修复。
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.1.08"
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
        "本版本在 v1.1.07 基础上修复白屏并完整对齐效果图。\n\n"
        "【本次更新】\n"
        "一、修复板块效应页面白屏\n"
        "   - 添加渲染级 try-catch 错误边界，任何运行时异常不再导致整页空白\n"
        "   - 重排 React hooks 声明顺序，消除潜在的 TDZ（暂时性死区）问题\n"
        "   - 即使数据加载失败也会显示明确的错误提示和重试按钮\n\n"
        "二、新增月份分隔标题行\n"
        "   每月数据前插入标题行，如「1 月 · 正序排列，最早的日期在最上方」\n"
        "   「2 月 · 春节长假，连续休市完整保留」等，便于快速定位时间段。\n\n"
        "三、新增颜色图例栏\n"
        "   在统计数字下方增加图例说明：\n"
        "   榜首板块（浅红）| 中列板块（浅蓝）| 周末休市（灰）|\n"
        "   节假日休市（琥珀）| 今日待更新（紫色）。\n\n"
        "四、新增连续休市日折叠\n"
        "   连续 ≥3 天的周末/节假日自动折叠为省略行\n"
        "   （如「… 省略 1/13 – 2/12 共 21 天 …」），减少无效滚动。\n\n"
        "【v1.1.07 已包含】\n"
        "- 修复「跳到今天」按钮无效（手动 offset 计算）\n"
        "- 修复周末/节假日行缺失（240 天完整日期轴）\n\n"
        "【栏目顺序】\n"
        "板块效应 → 行情监控 → 涨停异动分析 → 板块产业链\n\n"
        "【功能】\n"
        "板块效应（历史矩阵 + 月份标题 + 自动更新）、行情监控、涨停异动分析、\n"
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
        for fn in files:
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, VER_DIR)
            zf.write(full, os.path.join(TOP_FOLDER, rel))
            count += 1

print(f"[zip] {os.path.basename(ZIP_PATH)} files={count} "
      f"size={os.path.getsize(ZIP_PATH)/1024/1024:.1f}MB")
print("DONE")
