# -*- coding: utf-8 -*-
"""v1.0.10 打包脚本：同步 win-unpacked -> 版本目录 -> ZIP"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")
VER = "1.0.10"
VER_DIR = os.path.join(BASE, "release", f"紫金红葫芦-v{VER}-win")
ZIP_PATH = os.path.join(BASE, "release", f"紫金红葫芦-v{VER}-win.zip")
TOP_FOLDER = f"紫金红葫芦-v{VER}-win"

def sync(src_name):
    src = os.path.join(BASE, src_name)
    dst = os.path.join(APP_DIR, src_name)
    if os.path.exists(dst): shutil.rmtree(dst)
    shutil.copytree(src, dst)
    print(f"[sync] {src_name}")

for name in ("dist", "dist-server", "electron"):
    sync(name)
shutil.copy2(os.path.join(BASE, "package.json"), os.path.join(APP_DIR, "package.json"))
if os.path.exists(VER_DIR): shutil.rmtree(VER_DIR)
shutil.copytree(WIN_UNPACKED, VER_DIR, ignore=shutil.ignore_patterns("node-pty"))
if os.path.exists(ZIP_PATH): os.remove(ZIP_PATH)
count = 0
with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for root, dirs, files in os.walk(VER_DIR):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, VER_DIR)
            zf.write(full, os.path.join(TOP_FOLDER, rel))
            count += 1
print(f"[zip] {os.path.basename(ZIP_PATH)} files={count} size={os.path.getsize(ZIP_PATH)/1024/1024:.1f}MB")
print("DONE")
