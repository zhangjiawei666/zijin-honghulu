# -*- coding: utf-8 -*-
"""Build the standalone Zijin Red Gourd formal edition for Win7 SP1 x64 and later."""
import json
import os
import shutil
import subprocess
import zipfile
from pathlib import Path

BASE = Path(r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent")
VERSION = "1.0.12"
NAME = f"紫金红葫芦-正式版-v{VERSION}-win-x64"
RELEASE = BASE / "release-win7"
STAGE = Path(r"C:\tmp\zijin-red-gourd-win7-stage")
APP_SRC = STAGE / "app-source"
ELECTRON_ZIP = Path(r"C:\Users\Lenovo\AppData\Local\electron\Cache\3ba438158f002e8b1a5f6864bd5ff759d3a4493fd0811b3e2e195ad679f8b8c2\electron-v22.3.27-win32-x64.zip")
NODE = Path(r"C:\Program Files\nodejs\node.exe")
ASAR = BASE / "node_modules" / "@electron" / "asar" / "bin" / "asar.js"
OUT = RELEASE / NAME
ZIP = RELEASE / f"{NAME}.zip"

if RELEASE.exists():
    shutil.rmtree(RELEASE)
if STAGE.exists():
    shutil.rmtree(STAGE)
STAGE.mkdir(parents=True)
APP_SRC.mkdir(parents=True)

with zipfile.ZipFile(ELECTRON_ZIP) as archive:
    archive.extractall(STAGE / "runtime")

runtime = STAGE / "runtime"
shutil.copytree(BASE / "dist-mobile", APP_SRC / "dist")
shutil.copy2(BASE / "electron" / "main-win7.mjs", APP_SRC / "electron-main.mjs")
shutil.copy2(BASE / "electron" / "preload.mjs", APP_SRC / "preload.mjs")
shutil.copytree(BASE / "electron" / "assets", APP_SRC / "assets")
package_json = {
    "name": "stock-monitor-agent-formal",
    "version": VERSION,
    "productName": "紫金红葫芦-正式版",
    "main": "electron-main.mjs",
    "description": "紫金红葫芦正式版，兼容 Windows 7 SP1 x64 及更高版本",
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

unpacked = resources / "app.asar.unpacked" / "dist-server"
unpacked.mkdir(parents=True)
shutil.copy2(BASE / "dist-server" / "win7-server.cjs", unpacked / "win7-server.cjs")

exe = OUT / "electron.exe"
formal_exe = OUT / f"紫金红葫芦-正式版.exe"
exe.rename(formal_exe)
launcher = OUT / "启动紫金红葫芦-正式版.cmd"
launcher.write_text("@echo off\r\nstart \"紫金红葫芦-正式版\" \"%~dp0紫金红葫芦-正式版.exe\"\r\n", encoding="gbk", newline="")
notes = OUT / "版本说明.txt"
notes.write_text(
    "紫金红葫芦-正式版 v1.0.12\n\n"
    "兼容目标：Windows 7 SP1 x64、Windows 8.1 x64、Windows 10 x64、Windows 11 x64。\n"
    "功能：自选股行情、实时价格、自动巡检、5 个标准买点、系统提醒。\n"
    "本版本不需要用户安装 Node.js，不包含 Agent、主流挖掘和板块产业链功能。\n\n"
    "注意：Electron 22 是最后支持 Windows 7 的 Electron 主版本，已停止官方维护。\n"
    "建议 Windows 7 安装 SP1 及系统 SHA-2/TLS 更新，并保持系统时间准确。\n"
    "首次运行需要联网访问腾讯行情接口。请勿将此版本用于高风险或不受信任的网络环境。\n",
    encoding="utf-8",
)

with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for root, _, files in os.walk(OUT):
        for filename in files:
            full = Path(root) / filename
            archive.write(full, Path(NAME) / full.relative_to(OUT))

print(f"[formal-win7] output={ZIP}")
print(f"[formal-win7] exe={formal_exe}")
print(f"[formal-win7] app.asar={app_asar.stat().st_size} bytes")
