# -*- coding: utf-8 -*-
"""Assemble the formal v1.0.10 x64 portable package from the desktop baseline."""
import json
import os
import shutil
import subprocess
import zipfile
from pathlib import Path

BASE = Path(r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent")
VERSION = "1.0.10"
NAME = f"紫金红葫芦-正式版-v{VERSION}-win-x64"
RELEASE = BASE / "release-formal"
STAGE = Path(r"C:\tmp\zijin-red-gourd-formal-v110-stage")
APP_SRC = STAGE / "app-source"
ELECTRON_ZIP = Path(r"C:\Users\Lenovo\AppData\Local\electron\Cache\3ba438158f002e8b1a5f6864bd5ff759d3a4493fd0811b3e2e195ad679f8b8c2\electron-v22.3.27-win32-x64.zip")
NODE = Path(r"C:\Program Files\nodejs\node.exe")
ASAR = BASE / "node_modules" / "@electron" / "asar" / "bin" / "asar.js"
OUT = RELEASE / NAME
ZIP = RELEASE / f"{NAME}.zip"

for path in (RELEASE, STAGE):
    if path.exists():
        shutil.rmtree(path)
STAGE.mkdir(parents=True)
APP_SRC.mkdir(parents=True)

if not ELECTRON_ZIP.exists():
    raise FileNotFoundError(f"Electron runtime cache missing: {ELECTRON_ZIP}")
if not NODE.exists():
    raise FileNotFoundError(f"Node runtime missing: {NODE}")
if not ASAR.exists():
    raise FileNotFoundError(f"asar tool missing: {ASAR}")

with zipfile.ZipFile(ELECTRON_ZIP) as archive:
    archive.extractall(STAGE / "runtime")

runtime = STAGE / "runtime"
# The formal branch uses the desktop v1.0.10 UI baseline and the Win7-compatible
# builtin monitor service, which avoids Node 22 node:sqlite and Agent dependencies.
shutil.copytree(BASE / "release" / "win-unpacked" / "resources" / "app" / "dist", APP_SRC / "dist")
shutil.copy2(BASE / "electron" / "main-win7.mjs", APP_SRC / "electron-main.mjs")
shutil.copy2(BASE / "electron" / "preload.mjs", APP_SRC / "preload.mjs")
shutil.copytree(BASE / "electron" / "assets", APP_SRC / "assets")
package_json = {
    "name": "stock-monitor-agent-formal",
    "version": VERSION,
    "productName": "紫金红葫芦-正式版",
    "main": "electron-main.mjs",
    "description": "紫金红葫芦-正式版，兼容 Windows 7 SP1 x64 及更高版本",
}
(APP_SRC / "package.json").write_text(json.dumps(package_json, ensure_ascii=False, indent=2), encoding="utf-8")

OUT.mkdir(parents=True)
for item in runtime.iterdir():
    target = OUT / item.name
    if item.is_dir():
        shutil.copytree(item, target)
    else:
        shutil.copy2(item, target)

resources = OUT / "resources"
resources.mkdir(exist_ok=True)
app_asar = resources / "app.asar"
subprocess.run([str(NODE), str(ASAR), "pack", str(APP_SRC), str(app_asar)], check=True)

unpacked_root = resources / "app.asar.unpacked"
unpacked = unpacked_root / "dist-server"
unpacked.mkdir(parents=True)
# win7-server.cjs resolves the frontend as ../dist from its unpacked folder.
# Keep both runtime assets together so the packaged app can serve the UI.
shutil.copytree(APP_SRC / "dist", unpacked_root / "dist")
shutil.copy2(BASE / "dist-server" / "win7-server.cjs", unpacked / "win7-server.cjs")

exe = OUT / "electron.exe"
formal_exe = OUT / "紫金红葫芦-正式版.exe"
exe.rename(formal_exe)
launcher = OUT / "启动紫金红葫芦-正式版.cmd"
launcher.write_text("@echo off\r\nstart \"紫金红葫芦-正式版\" \"%~dp0紫金红葫芦-正式版.exe\"\r\n", encoding="gbk", newline="")
notes = OUT / "版本说明.txt"
notes.write_text(
    "紫金红葫芦-正式版 v1.0.10\n\n"
    "本正式版以桌面版 v1.0.10 为基线，不属于手机版支线。\n"
    "兼容目标：Windows 7 SP1 x64、Windows 8.1 x64、Windows 10 x64、Windows 11 x64。\n"
    "功能：行情监控、自选股管理、实时价格、自动巡检、5 个标准买点、系统提醒。\n"
    "本版本不需要用户安装 Node.js，不包含 Agent、主流挖掘和板块产业链功能。\n"
    "修复：涨跌幅取腾讯行情第 32 字段（此前误取第 34 字段当日最低价）；股票名称按 GBK 正确解码。\n\n"
    "注意：Electron 22 是最后支持 Windows 7 的 Electron 主版本，已停止官方维护。\n"
    "未承诺支持 Windows 7 SP1 以前版本、32 位 Windows、Windows ARM/ARM64 或无网络环境。\n"
    "Windows 7 建议安装 SP1 及系统 SHA-2/TLS 更新，并保持系统时间准确。\n"
    "首次运行需要联网访问腾讯行情接口。请勿将此版本用于高风险或不受信任的网络环境。\n",
    encoding="utf-8",
)

with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for root, _, files in os.walk(OUT):
        for filename in files:
            full = Path(root) / filename
            archive.write(full, Path(NAME) / full.relative_to(OUT))

print(f"[formal-v110] output={ZIP}")
print(f"[formal-v110] exe={formal_exe}")
print(f"[formal-v110] app.asar={app_asar.stat().st_size} bytes")
