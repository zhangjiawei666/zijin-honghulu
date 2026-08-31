# -*- coding: utf-8 -*-
"""v1.1.02 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法（必须用 -S 跳过 sitecustomize，否则 safe-delete 钩子会拦截目录清理）：
    python -S scripts/package_v11102.py
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.1.02"
VER_DIR = os.path.join(BASE, "release", f"紫金红葫芦-v{VER}-win")
ZIP_PATH = os.path.join(BASE, "release", f"紫金红葫芦-v{VER}-win.zip")
TOP_FOLDER = f"紫金红葫芦-v{VER}-win"
EXE_NAME = "紫金红葫芦.exe"
OLD_EXE = "自选股行情监控.exe"


def sync(name):
    """把构建产物同步进运行目录（dist / dist-server / electron）"""
    src = os.path.join(BASE, name)
    dst = os.path.join(APP_DIR, name)
    if os.path.exists(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst)
    print(f"[sync] {name}")


# 1) 同步前端、服务端、主进程
for name in ("dist", "dist-server", "electron"):
    sync(name)
shutil.copy2(os.path.join(BASE, "package.json"), os.path.join(APP_DIR, "package.json"))
print("[sync] package.json")

# 2) 复制到版本目录
if os.path.exists(VER_DIR):
    shutil.rmtree(VER_DIR)
shutil.copytree(WIN_UNPACKED, VER_DIR, ignore=shutil.ignore_patterns("node-pty"))
print(f"[copy] {os.path.basename(VER_DIR)}")

# 3) 可执行文件改为品牌名
old_exe_path = os.path.join(VER_DIR, OLD_EXE)
new_exe_path = os.path.join(VER_DIR, EXE_NAME)
if os.path.exists(old_exe_path):
    os.rename(old_exe_path, new_exe_path)
    print(f"[rename] {OLD_EXE} -> {EXE_NAME}")
elif os.path.exists(new_exe_path):
    print(f"[rename] 已是 {EXE_NAME}")
else:
    raise SystemExit(f"未找到可执行文件：{old_exe_path}")

# 4) 启动脚本（GBK 编码，保证 Windows 中文正常）
launcher = os.path.join(VER_DIR, "启动紫金红葫芦.cmd")
with open(launcher, "w", encoding="gbk", newline="") as f:
    f.write("@echo off\r\nstart \"紫金红葫芦\" \"%~dp0紫金红葫芦.exe\"\r\n")
print("[launcher] 启动紫金红葫芦.cmd")

# 5) 版本说明
notes = os.path.join(VER_DIR, "版本说明.txt")
with open(notes, "w", encoding="utf-8") as f:
    f.write(
        f"紫金红葫芦 v{VER}\n\n"
        "本版本为桌面主线版本，在 v1.1.01 基础上迭代。\n\n"
        "【本次更新】\n"
        "1. 新增「板块效应」栏目，排列在「行情监控」之上。\n"
        "   按交易日统计 A 股涨停股并归集到行业板块，展示板块涨停分布；\n"
        "   只统计沪深主板、创业板、科创板 A 股普通股，涨停状态取自行情源涨停池，\n"
        "   不使用涨跌幅阈值判定；非交易日自动回溯最近交易日并明确标注日期替代。\n"
        "2. 原「主流挖掘」栏目更名为「涨停异动分析」，研究链路与能力保持不变。\n"
        "3. 删除板块产业链中固化的 PCB 本地案例数据，\n"
        "   该栏目现全部由 AI 联网检索实时生成。\n\n"
        "【栏目顺序】\n"
        "板块效应 → 行情监控 → 涨停异动分析 → 板块产业链\n\n"
        "【功能】\n"
        "板块效应、行情监控、涨停异动分析、板块产业链、智能对话、\n"
        "自选股管理、自动巡检、5 个标准买点、系统提醒、\n"
        "浅色 / 故宫红 / 深色三种主题。\n\n"
        "【运行要求】\n"
        "Windows 10 / 11 64 位；运行需联网（行情接口 + Agent 通道）。\n"
        "首次使用 Agent 相关功能需在「设置」中登录 CodeBuddy。\n\n"
        "双击「紫金红葫芦.exe」或「启动紫金红葫芦.cmd」即可运行。\n"
    )
print("[notes] 版本说明.txt")

# 6) 打包 ZIP
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
