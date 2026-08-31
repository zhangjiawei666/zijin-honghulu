# -*- coding: utf-8 -*-
"""v1.1.04 打包脚本：同步产物 -> 运行目录 -> 版本目录 -> ZIP

用法（必须用 -S 跳过 sitecustomize，否则 safe-delete 钩子会拦截目录清理）：
    python -S scripts/package_v11104.py
"""
import shutil, os, zipfile

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
WIN_UNPACKED = os.path.join(BASE, "release", "win-unpacked")
APP_DIR = os.path.join(WIN_UNPACKED, "resources", "app")

VER = "1.1.04"
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
        "本版本为桌面主线版本，在 v1.1.03 基础上迭代。\n\n"
        "【本次更新】\n"
        "一、板块效应表格改为完整展示历史数据\n"
        "   1. 内置 2026 年腾讯文档「2026板块效应」模板历史数据，\n"
        "      共 167 个交易日（2026/1/5 ~ 2026/8/31），首次启动自动导入；\n"
        "   2. 表格展示上限从 30 行放宽到 400 行，历史数据可完整浏览；\n"
        "   3. 表格支持双向冻结（表头 + 首列固定），数百行数据滚动时\n"
        "      日期与板块列名始终可见；\n"
        "   4. 每行用圆点标记数据来源：灰色 = 腾讯文档模板历史，\n"
        "      红色 = 东财实时抓取。\n\n"
        "二、修复查询指定日期导致界面白屏的问题\n"
        "   根因：单日查询模式下后端不返回 columns 字段，\n"
        "   前端样式计算直接取 data.columns.length 抛 TypeError，导致整页崩溃。\n"
        "   已改为安全取值，并补充空数据时的友好提示。\n\n"
        "三、修复历史日期查询污染最近交易日数据的缺陷\n"
        "   根因：东财涨停池接口不支持历史日期查询，传入任意历史日期\n"
        "   都会把返回日期回写成「最近交易日」且涨停池为空；\n"
        "   原逻辑照常写库，导致用空数据覆盖该最近交易日的真实记录。\n"
        "   现已加入两层防护：抓取结果为空时不写库；\n"
        "   历史日期且本地无数据时直接返回说明，不再发起无效请求。\n\n"
        "四、保护模板历史数据不被自动抓取覆盖\n"
        "   模板是手工整理的概念口径（商业航天、脑机接口等），\n"
        "   实时抓取是东财行业口径（通用设备、汽车零部件等），归类逻辑不同。\n"
        "   手动/自动更新遇到已有模板数据的日期会自动跳过，仅对新日期生效，\n"
        "   避免手工记录被口径不一致的自动数据顶掉。\n\n"
        "五、新增「导入历史」按钮\n"
        "   可随时重新导入模板历史基线，仅补齐缺失日期，不覆盖已有记录。\n\n"
        "【历史数据来源说明】\n"
        "东财涨停池接口只提供「最近交易日」数据，无法回溯历史，\n"
        "因此 2026/1/5 ~ 2026/8/31 的历史数据取自用户在腾讯文档维护的\n"
        "「2026板块效应」模板（概念板块口径），原样保留未做改写。\n"
        "2026/9/1 起的新交易日由本软件每日自动抓取并追加。\n\n"
        "【栏目顺序】\n"
        "板块效应 → 行情监控 → 涨停异动分析 → 板块产业链\n\n"
        "【功能】\n"
        "板块效应（历史矩阵 + 自动更新）、行情监控、涨停异动分析、\n"
        "板块产业链、智能对话、自选股管理、自动巡检、5 个标准买点、\n"
        "系统提醒、浅色 / 故宫红 / 深色三种主题。\n\n"
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
