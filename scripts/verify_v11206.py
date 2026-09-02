# -*- coding: utf-8 -*-
"""验证 v1.2.06 打包产物（dist-server/server.cjs）的关键行为。

隔离运行：独立 STOCK_MONITOR_DATA_DIR + subprocess.Popen + proc.kill()，
不污染真实数据目录，也不留后台进程。

断言：
  1) 矩阵模式，maxCols == 18 且 columns.length == 18（参考表 18 个板块全部显示）
  2) totalDates == 241（日期轴完整：162 交易日 / 68 周末 / 11 节假日）
  3) 20260902 行存在且不含「商业航天」，板块数 == 12（严格取自腾讯文档）
  4) 至少存在一行板块数 == 18（第 18 列数据已入基线）
"""
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

NODE = r"C:\Users\Lenovo\.workbuddy\binaries\node\versions\22.22.2\node.exe"
BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
SERVER = os.path.join(BASE, "dist-server", "server.cjs")
DATA_DIR = r"C:\tmp\verify_v11206"
PORT = "3107"
URL = f"http://localhost:{PORT}/api/sector-effect?limit=400"

os.makedirs(DATA_DIR, exist_ok=True)
for fn in os.listdir(DATA_DIR):
    p = os.path.join(DATA_DIR, fn)
    try:
        os.remove(p) if os.path.isfile(p) else shutil.rmtree(p)
    except OSError:
        pass

env = dict(os.environ)
env["STOCK_MONITOR_DATA_DIR"] = DATA_DIR
env["PORT"] = PORT

proc = subprocess.Popen(
    [NODE, SERVER],
    cwd=BASE, env=env,
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    text=True, encoding="utf-8",
)

ok = True
try:
    # 等待服务就绪（最多 30s）
    ready = False
    for _ in range(60):
        try:
            with urllib.request.urlopen(URL, timeout=3) as r:
                if r.status == 200:
                    ready = True
                    break
        except Exception:
            time.sleep(0.5)
    if not ready:
        print("FAIL: 服务未在 30s 内就绪")
        ok = False
    else:
        with urllib.request.urlopen(URL, timeout=10) as r:
            data = json.loads(r.read().decode("utf-8"))

        print(f"mode            = {data.get('mode')}")
        print(f"maxCols         = {data.get('maxCols')}")
        print(f"columns.length  = {len(data.get('columns') or [])}")
        print(f"totalDates      = {data.get('totalDates')}")
        stats = data.get('stats') or {}
        print(f"stats           = {stats}")

        # 断言 1：18 列
        if data.get("maxCols") != 18:
            print(f"FAIL: maxCols={data.get('maxCols')} != 18")
            ok = False
        if len(data.get("columns") or []) != 18:
            print(f"FAIL: columns.length={len(data.get('columns') or [])} != 18")
            ok = False

        # 断言 2：日期轴完整
        if data.get("totalDates") != 241:
            print(f"FAIL: totalDates={data.get('totalDates')} != 241")
            ok = False

        # 断言 3 & 4：9/2 无商业航天 + 存在 18 列行
        rows = data.get("rows") or []
        sep2 = next((x for x in rows if x.get("dateToken") == "20260902"), None)
        if not sep2:
            print("FAIL: 未找到 20260902 行")
            ok = False
        else:
            secs = sep2.get("sectors") or []
            names = [s.get("name") for s in secs]
            print(f"20260902 板块数 = {len(secs)}: {names}")
            if "商业航天" in names:
                print("FAIL: 20260902 含「商业航天」（应严格取自腾讯文档）")
                ok = False
            if len(secs) != 12:
                print(f"FAIL: 20260902 板块数={len(secs)} != 12")
                ok = False

        max_row_cols = max((len(x.get("sectors") or []) for x in rows), default=0)
        print(f"历史最大单日板块数 = {max_row_cols}")
        if max_row_cols < 18:
            print(f"FAIL: 历史最大单日板块数={max_row_cols} < 18（第 18 列未入基线）")
            ok = False

        # 源检查：9/2 应为腾讯文档模板源
        src = sep2.get("source") if sep2 else None
        print(f"20260902 source = {src}")
        if sep2 and "腾讯文档" not in (src or ""):
            print(f"FAIL: 20260902 source 不是腾讯文档：{src}")
            ok = False
finally:
    proc.kill()
    try:
        proc.wait(timeout=5)
    except Exception:
        pass

print("RESULT:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
