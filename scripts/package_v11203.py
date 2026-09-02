# -*- coding: utf-8 -*-
"""v1.2.03 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法：python -S scripts/package_v11203.py

变更（板块效应新增手动编辑模式）：
  1. 新增单日编辑 API：
     - GET    /api/sector-effect/day/:date   读取某日完整板块（不做列截断）
     - PUT    /api/sector-effect/day/:date   手动保存板块与涨停数、日期类型
     - DELETE /api/sector-effect/day/:date   清空该日并恢复自动更新
  2. 手动录入数据受保护：写入后 source 标记为「手动录入」，
     自动抓取（fetchAndStore）、模板导入（importBuiltinHistory，含休市日强制清空）、
     垃圾清理（cleanupGarbageSectors）、9/1 日期迁移 四处都会跳过手动行。
  3. 前端新增「手动编辑」模式开关：开启后点击任意日期行弹出编辑框，
     支持板块增删改、日期类型切换、清空该日；手动行在表格中以紫色圆点 + ✎ 标记。
  4. 清空该日会把 source 改回自动数据源，该日重新回到可被自动抓取的状态。
  5. 版本号：v1.2.02 → v1.2.03。
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.2.03"
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
        "本版本为板块效应新增手动编辑模式，并修复 9/1 数据归属与行情通道容错。\n\n"
        "【本次更新】\n"
        "一、板块效应 · 手动编辑模式（数据源异常的兜底）\n"
        "   - 操作栏新增「手动编辑」开关；开启后点击任意日期行，即可手工修改该日板块数据。\n"
        "   - 编辑框支持：板块名称与涨停数逐条增删改、日期类型切换（交易日/周末/节假日）、\n"
        "     「清空该日」一键复位。\n"
        "   - 保存后该日标记为「手动录入」，自动抓取与模板导入都不会再覆盖它，\n"
        "     表格中以紫色圆点 + ✎ 标识。\n"
        "   - 需要恢复自动更新时，点「清空该日」即可，该日重新回到可自动填充状态。\n\n"
        "二、9/1 数据归属修复\n"
        "   - 旧版本 08:00 调度把 9/1 收盘数据错位到 9/2 后，由于东财涨停池不支持历史日期，\n"
        "     9/1 真实数据无法通过 API 重新拉回。本版新增 9/1 行兜底逻辑：\n"
        "       · 当 9/2 含被错位的 9/1 数据（substituted_date=20260901，或 9/2 20:00 前的旧版无 substituted_date 记录）\n"
        "       · 且 9/1 不存在或为空 → 自动从 9/2 迁回并删除 9/2 错位行。\n"
        "       · 幂等可重复执行，不会覆盖 9/1 已有真实数据。\n\n"
        "三、行情通道取数容错\n"
        "   - 部分电脑代理/防火墙阻断腾讯行情接口时，Agent 通道会报『无法获取行情数据(内置取数失败)』，\n"
        "     提示文字让人误以为内置通道坏了。\n"
        "   - 本版 Agent 通道在实时行情 / 日 K 完全失败时静默退到内置通道，由内置通道兜底给出判定。\n"
        "   - 同时 fetchRealtimeQuotes 已支持批量失败时逐只回退、https 原生 fallback，\n"
        "     减少『一只不通全股不通』的概率。\n\n"
        "四、「一键清除弹窗」\n"
        "   - 行情监控栏目右上角新增『一键清除弹窗』按钮。\n"
        "   - 点击后同时关闭当前页面的 TDesign 通知、浏览器系统通知，并清空信号列表。\n\n"
        "【v1.2.02 已包含】\n"
        "- 修正 9/1 数据归属迁移（缺失行也能迁回）、行情通道静默兜底。\n\n"
        "【v1.2.01 已包含】\n"
        "- 板块效应更新时间改为当日 20:00（修日期错位），「跳到今天」按钮修复。\n\n"
        "【v1.1.10 已包含】\n"
        "- 板块效应数据治理：6 个周末行清空、垃圾单元格清除、概念固定列、叙述严谨化。\n"
        "【v1.1.09 已包含】\n"
        "- 修复 Agent 通道跌破均线仍触发买点。\n\n"
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
