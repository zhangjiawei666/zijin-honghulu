# -*- coding: utf-8 -*-
"""验证 v1.2.07 打包产物（dist-server/server.cjs）的关键行为。

隔离运行：独立 STOCK_MONITOR_DATA_DIR + subprocess.Popen + proc.kill()，
不污染真实数据目录，也不留后台进程。

断言：
  1) 矩阵模式，maxCols == 18 且 columns.length == 18（参考表 18 个板块全部显示）
  2) totalDates == 241（日期轴完整：162 交易日 / 68 周末 / 11 节假日）
  3) 20260902 行存在且不含「商业航天」，板块数 == 12（严格取自腾讯文档）
  4) 至少存在一行板块数 == 18（第 18 列数据已入基线）
  5) **矩阵 cells（展示层）中 20260831 含「农业」、20260901 含「农业」、20260902 含「大农业」**
     —— 这是 v1.2.07 重点修复：此前按名归并把低频板块踢出列集合导致漏展示。
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
DATA_DIR = r"C:\tmp\verify_v11207"
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

        rows = data.get("rows") or []

        # 断言 3：9/2 无商业航天 + 12 板块
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
            src = sep2.get("source")
            print(f"20260902 source = {src}")
            if "腾讯文档" not in (src or ""):
                print(f"FAIL: 20260902 source 不是腾讯文档：{src}")
                ok = False

        # 断言 4：存在 18 列行
        max_row_cols = max((len(x.get("sectors") or []) for x in rows), default=0)
        print(f"历史最大单日板块数 = {max_row_cols}")
        if max_row_cols < 18:
            print(f"FAIL: 历史最大单日板块数={max_row_cols} < 18（第 18 列未入基线）")
            ok = False

        # 断言 5（重点）：展示层 cells 必须出现农业
        def cells_have(row, kw):
            cells = row.get("cells") or []
            return any((c or {}).get("name", "").find(kw) >= 0 for c in cells)

        for dt, kw in (("20260831", "农业"), ("20260901", "农业"), ("20260902", "大农业")):
            row = next((x for x in rows if x.get("dateToken") == dt), None)
            if not row:
                print(f"FAIL: 未找到 {dt} 行")
                ok = False
                continue
            # 同时检查原始 sectors 与展示 cells
            sec_names = [s.get("name") for s in (row.get("sectors") or [])]
            cell_names = [(c or {}).get("name") for c in (row.get("cells") or []) if c]
            print(f"{dt} sectors含{kw}={kw in ''.join(sec_names)} cells含{kw}={kw in ''.join(cell_names)}")
            print(f"   cells = {cell_names}")
            if not cells_have(row, kw):
                print(f"FAIL: 矩阵展示层 {dt} 未出现「{kw}」—— 农业被漏展示！")
                ok = False
finally:
    proc.kill()
    try:
        proc.wait(timeout=5)
    except Exception:
        pass

print("RESULT:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
