# -*- coding: utf-8 -*-
"""v1.2.04 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法：python -S scripts/package_v11204.py

变更（版面字体三档切换，仿通达信规格）：
  1. 新增 useFontSize（src/hooks/useFontSize.ts）：小 / 中 / 大 三档，
     localStorage 持久化，在 <html> 上写 data-font-size 与 --font-scale。
  2. 缩放比例仿通达信「经典字体设置」中文字号：
       小 = 五号 10.5pt ÷ 12pt = 0.875
       中 = 小四 12pt（通达信默认）  = 1.000
       大 = 小三 15pt ÷ 12pt = 1.250
  3. 覆盖 tdesign 字号变量（--td-font-size-* / --td-line-height-*），
     让 Button / Input / Table / Dialog 等组件字号随档位缩放。
     html[data-font-size] 特异性 (0,1,1) 高于 tdesign 的 :root (0,1,0)，确保生效。
  4. 改写 tailwind 字号工具类（text-xs ~ text-4xl）为 calc() 缩放。
  5. 项目自身样式变量化：index.css 19 处 + tsx 内联 / <style> 45 处。
  6. 大号标题（headline / display）做衰减缩放，避免撑爆布局。
  7. 入口：Header 顶部栏「小 中 大」快捷切换 + 设置页「界面字体」区块。
  8. 版本号：v1.2.03 → v1.2.04。
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.2.04"
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
        "本版本新增界面字体三档切换（小 / 中 / 大，仿通达信字号规格）。\n\n"
        "【本次更新】\n"
        "一、界面字体三档切换（小 / 中 / 大）\n"
        "   - 切换入口：顶部栏右侧「小 中 大」按钮，或 设置 → 界面字体。\n"
        "   - 字号规格仿通达信「经典字体设置」：\n"
        "       小 = 五号 10.5pt（缩放 0.875）· 同屏显示更多行\n"
        "       中 = 小四 12pt  （缩放 1.000）· 通达信默认\n"
        "       大 = 小三 15pt  （缩放 1.250）· 看盘更清晰\n"
        "   - 缩放范围：表格、按钮、输入框、对话框、菜单等全部界面元素，\n"
        "     设置后自动保存，下次启动保持。\n\n"
        "二、板块效应 · 手动编辑模式（数据源异常的兜底）\n"
        "   - 操作栏新增「手动编辑」开关；开启后点击任意日期行，即可手工修改该日板块数据。\n"
        "   - 编辑框支持：板块名称与涨停数逐条增删改、日期类型切换（交易日/周末/节假日）、\n"
        "     「清空该日」一键复位。\n"
        "   - 保存后该日标记为「手动录入」，自动抓取与模板导入都不会再覆盖它，\n"
        "     表格中以紫色圆点 + ✎ 标识。\n"
        "   - 需要恢复自动更新时，点「清空该日」即可，该日重新回到可自动填充状态。\n\n"
        "三、9/1 数据归属修复\n"
        "   - 旧版本 08:00 调度把 9/1 收盘数据错位到 9/2 后，由于东财涨停池不支持历史日期，\n"
        "     9/1 真实数据无法通过 API 重新拉回。本版新增 9/1 行兜底逻辑：\n"
        "       · 当 9/2 含被错位的 9/1 数据（substituted_date=20260901，或 9/2 20:00 前的旧版无 substituted_date 记录）\n"
        "       · 且 9/1 不存在或为空 → 自动从 9/2 迁回并删除 9/2 错位行。\n"
        "       · 幂等可重复执行，不会覆盖 9/1 已有真实数据。\n\n"
        "四、行情通道取数容错\n"
        "   - 部分电脑代理/防火墙阻断腾讯行情接口时，Agent 通道会报『无法获取行情数据(内置取数失败)』，\n"
        "     提示文字让人误以为内置通道坏了。\n"
        "   - 本版 Agent 通道在实时行情 / 日 K 完全失败时静默退到内置通道，由内置通道兜底给出判定。\n"
        "   - 同时 fetchRealtimeQuotes 已支持批量失败时逐只回退、https 原生 fallback，\n"
        "     减少『一只不通全股不通』的概率。\n\n"
        "五、「一键清除弹窗」\n"
        "   - 行情监控栏目右上角新增『一键清除弹窗』按钮。\n"
        "   - 点击后同时关闭当前页面的 TDesign 通知、浏览器系统通知，并清空信号列表。\n\n"
        "【v1.2.03 已包含】\n"
        "- 板块效应手动编辑模式：点击日期行编辑、手动数据受保护。\n\n"
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
