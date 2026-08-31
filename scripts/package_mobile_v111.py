# -*- coding: utf-8 -*-
"""手机版 v1.0.11 发布包：前端 PWA + 独立监控服务。"""
import os
import shutil
import zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
RELEASE = os.path.join(BASE, "release")
VERSION = "1.0.11"
NAME = f"紫金红葫芦手机版-v{VERSION}"
OUT = os.path.join(RELEASE, NAME)
ZIP = os.path.join(RELEASE, f"{NAME}.zip")

if os.path.exists(OUT):
    shutil.rmtree(OUT)
os.makedirs(OUT)

for folder in ("dist-mobile",):
    shutil.copytree(os.path.join(BASE, folder), os.path.join(OUT, folder))

os.makedirs(os.path.join(OUT, "dist-server"))
shutil.copy2(os.path.join(BASE, "dist-server", "mobile-server.cjs"), os.path.join(OUT, "dist-server", "mobile-server.cjs"))
shutil.copy2(os.path.join(BASE, "package.json"), os.path.join(OUT, "package.json"))
shutil.copy2(os.path.join(BASE, "README.md"), os.path.join(OUT, "README.md"))

launcher = '''@echo off\nsetlocal\nset PORT=3000\nset STOCK_MONITOR_BUILTIN_ONLY=1\nset STOCK_MONITOR_DATA_DIR=%~dp0data\nif not exist "%STOCK_MONITOR_DATA_DIR%" mkdir "%STOCK_MONITOR_DATA_DIR%"\nnode "%~dp0dist-server\\mobile-server.cjs"\n'''
with open(os.path.join(OUT, "启动手机版服务.cmd"), "w", encoding="gbk", newline="\r\n") as file:
    file.write(launcher)

if os.path.exists(ZIP):
    os.remove(ZIP)
count = 0
with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for root, _, files in os.walk(OUT):
        for filename in files:
            full = os.path.join(root, filename)
            rel = os.path.relpath(full, OUT)
            archive.write(full, os.path.join(NAME, rel))
            count += 1
print(f"[zip] {ZIP} files={count}")
