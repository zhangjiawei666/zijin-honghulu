# -*- coding: utf-8 -*-
"""v1.2.10 验证脚本：实跑 dist-server/server.cjs，断言板块效应透视新行为。

用法：python -S scripts/verify_v11210.py

验证点：
  1. 动态列（无 18 硬上限）：window=0 时列数 > 18（旧版 MAX_SECTOR_COLS=18 会被截断）。
  2. 近 N 日主线过滤：window=0 ⊇ window=20 ⊇ window=10（列数单调不增，且均 > 18）。
  3. 周末/节假日空行：存在 dayType∈{weekend,holiday} 的行，且这些行所有单元格涨停数均为 0/空。
  4. 合并角标 + 悬停明细：至少一列 merged=true（如 农业=农业/农林牧渔/大农业），
     且矩阵中存在 parts.length>1 的单元格（同一天多个别名归并）。
  5. 9/2 严格取自腾讯文档（无商业航天）：date=20260902 的行不含 商业航天 且 count>0。
  6. 日期轴完整：totalDates == 241（交易日 162 + 周末 68 + 节假日 11）。
  7. canon API：GET /api/sector-effect/canon 返回 groups（含 农业 组）。
数据：复制生产 chat.db 到隔离临时目录，绝不直接跑在生产库上。
"""
import shutil, os, time, json, sqlite3, subprocess, urllib.request, sys

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
SRC_DB = r"C:\Users\Lenovo\AppData\Roaming\stock-monitor-agent\data\chat.db"
TMP = r"E:\tmp\verify_v11210"
PORT = 3099
BASE_URL = f"http://localhost:{PORT}"
NODE = r"C:\Users\Lenovo\.workbuddy\binaries\node\versions\22.22.2\node.exe"
SERVER_CJS = os.path.join(BASE, "dist-server", "server.cjs")

fails = []
def check(cond, msg):
    print(("  PASS " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)

def get_json(path):
    url = BASE_URL + path
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read().decode("utf-8"))

# 1) 准备隔离数据目录
if os.path.exists(TMP):
    shutil.rmtree(TMP)
os.makedirs(os.path.join(TMP, "data"))
shutil.copy2(SRC_DB, os.path.join(TMP, "data", "chat.db"))
print(f"[setup] 已复制生产 DB 到隔离目录 {TMP}")

# 2) 启动 server（隔离 data dir + 隔离端口）
env = dict(os.environ)
env["STOCK_MONITOR_DATA_DIR"] = os.path.join(TMP, "data")
env["PORT"] = str(PORT)
print(f"[start] 启动 {SERVER_CJS} (PORT={PORT}) ...")
proc = subprocess.Popen([NODE, SERVER_CJS], env=env,
                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                        cwd=BASE)
# 轮询端口就绪
ready = False
for _ in range(50):
    try:
        urllib.request.urlopen(BASE_URL + "/api/sector-effect/canon", timeout=2)
        ready = True
        break
    except Exception:
        if proc.poll() is not None:
            out = proc.stdout.read().decode("utf-8", "replace") if proc.stdout else ""
            print("[start] 服务器进程已退出：\n" + out[-2000:])
            break
        time.sleep(0.4)
if not ready:
    print("[start] 端口未在预期时间内就绪，终止")
    proc.kill()
    sys.exit(2)
print("[start] 服务器就绪")

try:
    # 3) 近 N 日窗口
    print("\n[验证] 近 N 日主线窗口过滤")
    cols0 = get_json("/api/sector-effect?mode=matrix&window=0")
    cols10 = get_json("/api/sector-effect?mode=matrix&window=10")
    cols15 = get_json("/api/sector-effect?mode=matrix&window=15")
    cols20 = get_json("/api/sector-effect?mode=matrix&window=20")
    n0, n10, n15, n20 = (len(c["columns"]) for c in (cols0, cols10, cols15, cols20))
    print(f"  列数 window=0:{n0}  10:{n10}  15:{n15}  20:{n20}  totalDates={cols0.get('totalDates')}")
    check(n0 > 18, f"动态列无 18 硬上限（window=0 列数 {n0} > 18）")
    check(n0 >= n20 >= n10, f"窗口列数单调不增（0:{n0} >= 20:{n20} >= 10:{n10}）")
    check(n20 > 18 and n10 > 18, f"近 20/10 日列数仍 > 18（{n20}/{n10}）")
    check(cols0.get("totalDates") == 241, f"日期轴完整 totalDates={cols0.get('totalDates')} == 241")

    # 4) 周末/节假日空行
    print("\n[验证] 周末/节假日空行")
    rows = cols0["rows"]
    rest_rows = [r for r in rows if r.get("dayType") in ("weekend", "holiday")]
    check(len(rest_rows) > 0, f"存在周末/节假日行（{len(rest_rows)} 行）")
    empty_ok = all(
        all((c.get("count", 0) == 0) for c in r.get("cells", {}).values())
        for r in rest_rows
    )
    check(empty_ok, "所有周末/节假日行的单元格涨停数均为 0/空")

    # 5) 合并角标 + 悬停明细
    print("\n[验证] 合并角标 + 子板块悬停明细")
    merged_cols = [c for c in cols0["columns"] if c.get("merged")]
    check(len(merged_cols) > 0, f"至少一列 merged=true（合并列：{[c['key'] for c in merged_cols][:8]}）")
    agri = next((c for c in cols0["columns"] if c["key"] == "农业"), None)
    check(agri is not None and agri.get("merged"), "农业 列存在且为合并列（农业/农林牧渔/大农业）")
    # 扫描矩阵找 parts.length>1 的单元格
    multi_part = 0
    for r in rows:
        for ck, cell in r.get("cells", {}).items():
            if isinstance(cell, dict) and len(cell.get("parts", [])) > 1:
                multi_part += 1
    check(multi_part > 0, f"存在 parts.length>1 的合并单元格（同一天多别名归并，共 {multi_part} 处）")
    if multi_part > 0:
        # 展示一个示例
        for r in rows:
            for ck, cell in r.get("cells", {}).items():
                if isinstance(cell, dict) and len(cell.get("parts", [])) > 1:
                    print(f"    示例：{r['date']} {ck} = " + str(cell["parts"]))
                    break
            else:
                continue
            break

    # 6) 9/2 无商业航天
    print("\n[验证] 9/2 严格取自腾讯文档（无商业航天）")
    row92 = next((r for r in rows if r.get("dateToken") == "20260902"), None)
    check(row92 is not None, "存在 20260902 行（dateToken）")
    if row92:
        ch = row92.get("cells", {}).get("商业航天")
        has_ch = isinstance(ch, dict) and ch.get("count", 0) > 0
        check(not has_ch, "20260902 行不含 商业航天（count>0）")
        agri92 = row92.get("cells", {}).get("农业")
        print(f"    9/2 农业列：{agri92}  | 商业航天列：{ch}")

    # 7) canon API
    print("\n[验证] canon 配置 API")
    canon = get_json("/api/sector-effect/canon")
    groups = canon.get("groups", {})
    check("农业" in groups and any(a in groups["农业"] for a in ("农林牧渔", "大农业")),
          f"canon groups 含 农业 组（{groups.get('农业')}）")
    check(len(groups) >= 20, f"canon groups 数量 >= 20（{len(groups)} 组，可累加扩展）")

finally:
    proc.kill()
    try:
        proc.wait(timeout=5)
    except Exception:
        pass

print("\n" + ("=" * 50))
if fails:
    print(f"验证失败 {len(fails)} 项：")
    for f in fails:
        print("  - " + f)
    sys.exit(1)
else:
    print("全部验证通过 ✅")
    sys.exit(0)
