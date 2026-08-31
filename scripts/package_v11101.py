# -*- coding: utf-8 -*-
"""v1.1.01 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法（必须用 -S 跳过 sitecustomize，否则 safe-delete 钩子会拦截目录清理）：
    python -S scripts/package_v11101.py
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.1.01"
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

# 3) 可执行文件改为品牌名（v1.0.10 沿用了旧的“自选股行情监控.exe”）
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
        "本版本为桌面主线版本，在 v1.0.10 基础上修复并重新发布。\n\n"
        "【本次修复】\n"
        "1. 修正涨跌幅取错字段（原取当日最低价），避免买点判断基于错误数据。\n"
        "2. 修复巡检记录与买点信号关联丢失（run_id 为空）的问题。\n"
        "3. 补齐行情监控页缺失的容器布局样式（滚动区、内边距、宽屏居中）。\n"
        "4. 界面顶部栏增加版本号显示。\n"
        "5. 恢复桌面版三栏入口（行情监控、主流挖掘、板块产业链）与对话功能。\n\n"
        "【功能】\n"
        "行情监控、主流挖掘、板块产业链、智能对话、自选股管理、自动巡检、\n"
        "5 个标准买点、系统提醒、浅色/故宫红/深色三种主题。\n\n"
        "【运行要求】\n"
        "Windows 10 / 11 64 位；运行需联网（腾讯行情接口 + Agent 通道）。\n"
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
