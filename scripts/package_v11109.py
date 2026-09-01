# -*- coding: utf-8 -*-
"""v1.1.09 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法：python -S scripts/package_v11109.py

变更（修复 Agent 通道跌破均线仍触发买点）：
  1. 新增 Agent 信号后置校验：用实际 K 线数据验证价格与参考均线位置关系，
     价格已跌破均线的信号直接过滤掉，不再弹窗提醒。
  2. 双重过滤机制：
     a) reason 文本含「不符/不达标/跌破…不符」等否定词 → 直接排除
     b) 数值校验：短线买点要求 close > 参考MA；中线/回踩买点要求 close >= MA*0.96
  3. 5 种标准买点各自绑定参考均线（买点1→MA10, 买点2→MA5, 买点3→MA10,
     中线买点1→MA20/MA60, 中线买点2→MA20/MA60），从 signal reason 自动提取。
  4. 校验日志输出到控制台，便于排查淘汰原因。
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.1.09"
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
        "本版本在 v1.1.08 基础上修复 Agent 通道买点误报问题。\n\n"
        "【本次更新】\n"
        "一、修复跌破均线仍触发买点提示（核心 Bug）\n"
        "   - 问题：Agent（AI 推理）通道返回的买点信号未做后置校验，\n"
        "     导致已跌破 5 日 / 10 日 / 20 日均线的股票仍然弹出买点提醒。\n"
        "   - 修复：新增「Agent 信号后置校验」双重过滤：\n"
        "     ① 文本过滤：reason 含「不符」「不达标」「跌破…不符」等否定词 → 直接排除\n"
        "     ② 数值校验：用实际 K 线数据验证收盘价与参考均线位置关系\n"
        "       · 短线买点1（MA10）/ 买点2（MA5）：必须 close > MA\n"
        "       · 短线买点3（MA10 回踩）/ 中线买点1、2：必须 close ≥ MA×0.96\n"
        "   - 效果：康龙化成、药石科技、药明康德、百普赛斯、星网锐捷等\n"
        "     已跌破均线的股票不再触发无效买点提示。\n\n"
        "【v1.1.08 已包含】\n"
        "- 修复板块效应白屏 + 对齐效果图（月份标题/图例/折叠省略）\n"
        "- 修复「跳到今天」按钮无效 + 周末/节假日行缺失\n\n"
        "【栏目顺序】\n"
        "板块效应 → 行情监控 → 涨停异动分析 → 板块产业链\n\n"
        "【功能】\n"
        "板块效应（历史矩阵 + 月份标题 + 自动更新）、行情监控、涨停异动分析、\n"
        "板块产业链、智能对话、自选股管理、自动巡检、5 个标准买点（带均线校验）、\n"
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
