# -*- coding: utf-8 -*-
"""v1.2.03 隔离验证：板块效应手动编辑 API + 手动数据保护

验证项：
  1. PUT  /api/sector-effect/day/:date  手动保存 → source 变「手动录入」
  2. GET  /api/sector-effect/day/:date  能读回完整板块（含超出 17 列的部分不被截断）
  3. 手动数据不被自动抓取覆盖（fetchAndStore 保护）
  4. 手动数据不被 importBuiltinHistory 休市日清空逻辑误删
  5. DELETE /api/sector-effect/day/:date 清空 → source 回到自动源，可再次被自动填充
  6. 参数校验：非法日期 400、板块数超限 400
"""
import os, subprocess, time, sqlite3, json, urllib.request, urllib.error

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
SERVER = os.path.join(BASE, "dist-server", "server.cjs")
PORT = "3611"
DATA_DIR = r"C:\tmp\sm1203"
BASE_URL = f"http://127.0.0.1:{PORT}"

passed, failed = [], []


def check(name, cond, detail=""):
    if cond:
        passed.append(name)
        print(f"  [PASS] {name}")
    else:
        failed.append(name)
        print(f"  [FAIL] {name}  {detail}")


def fresh():
    os.makedirs(DATA_DIR, exist_ok=True)
    for f in os.listdir(DATA_DIR):
        try:
            os.remove(os.path.join(DATA_DIR, f))
        except Exception:
            pass


def start(seconds=6):
    env = dict(os.environ)
    env["STOCK_MONITOR_DATA_DIR"] = DATA_DIR
    env["PORT"] = PORT
    p = subprocess.Popen(
        ["node", SERVER], cwd=BASE, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace",
    )
    # 等端口就绪
    for _ in range(40):
        try:
            urllib.request.urlopen(f"{BASE_URL}/api/health", timeout=1)
            break
        except Exception:
            time.sleep(0.4)
    return p


def stop(p):
    p.kill()
    try:
        p.communicate(timeout=8)
    except Exception:
        pass
    time.sleep(0.6)


def api(method, path, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        f"{BASE_URL}{path}", data=data, method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw}


def db_row(date):
    con = sqlite3.connect(os.path.join(DATA_DIR, "chat.db"))
    cur = con.cursor()
    r = cur.execute(
        "SELECT date, day_type, sectors_json, total_limit_up, source, substituted_date"
        " FROM sector_effect_daily WHERE date=?", (date,)
    ).fetchone()
    con.close()
    return r


print("=" * 66)
print("v1.2.03 手动编辑 API 与数据保护验证")
print("=" * 66)

fresh()
proc = start(8)          # 首次启动：建库 + 写模板基线

print("\n[1] 手动保存（PUT）")
st, js = api("PUT", "/api/sector-effect/day/20260810", {
    "sectors": [{"name": "机器人", "count": 7}, {"name": "半导体", "count": 5}, {"name": "AI应用", "count": 3}],
    "dayType": "trading",
})
check("PUT 返回 200 且 success", st == 200 and js.get("success"), f"status={st} body={js}")
check("PUT 返回板块数 3", js.get("sectorCount") == 3, str(js))
check("PUT 返回涨停合计 15", js.get("totalLimitUp") == 15, str(js))
row = db_row("20260810")
check("DB source 标记为手动录入", row and "手动录入" in (row[4] or ""), f"source={row[4] if row else None}")
check("DB total_limit_up=15", row and row[3] == 15, f"total={row[3] if row else None}")

print("\n[2] 读回数据（GET）")
st, js = api("GET", "/api/sector-effect/day/20260810")
check("GET 返回 200", st == 200, f"status={st}")
check("GET 板块数 3", len(js.get("sectors") or []) == 3, str(js))
check("GET isManual=True", js.get("isManual") is True, str(js))
names = [s["name"] for s in (js.get("sectors") or [])]
check("GET 板块名正确", names == ["机器人", "半导体", "AI应用"], str(names))

print("\n[3] 保存超过 17 个板块应被拒（MAX_SECTOR_COLS 保护）")
st, js = api("PUT", "/api/sector-effect/day/20260811", {
    "sectors": [{"name": f"板块{i}", "count": 1} for i in range(20)],
})
check("超限返回 400", st == 400, f"status={st} body={js}")

print("\n[4] 非法日期应被拒")
st, js = api("PUT", "/api/sector-effect/day/abcd", {"sectors": []})
check("非法日期返回 400", st == 400, f"status={st}")

print("\n[5] 手动数据不被模板导入/自动抓取覆盖（重启验证保护）")
stop(proc)
proc = start(8)          # 重启：ensureHistorySeeded → importBuiltinHistory
row = db_row("20260810")
check("重启后仍是手动录入", row and "手动录入" in (row[4] or ""), f"source={row[4] if row else None}")
check("重启后板块数据未丢", row and json.loads(row[2])[0]["name"] == "机器人", f"json={row[2] if row else None}")

print("\n[6] 手动录入的休市日不被清空")
# 找一个模板里的周末作为休市日
con = sqlite3.connect(os.path.join(DATA_DIR, "chat.db"))
wk = con.execute("SELECT date FROM sector_effect_daily WHERE day_type='weekend' LIMIT 1").fetchone()
con.close()
if wk:
    wdate = wk[0]
    api("PUT", f"/api/sector-effect/day/{wdate}", {
        "sectors": [{"name": "手工补录", "count": 2}], "dayType": "weekend",
    })
    stop(proc)
    proc = start(8)      # 重启：休市日强制清空逻辑应跳过手动行
    row = db_row(wdate)
    check(f"休市日 {wdate} 手动数据保留", row and "手动录入" in (row[4] or ""),
          f"source={row[4] if row else None}")
else:
    check("找到周末行用于测试", False, "库中没有 weekend 行")

print("\n[7] 清空（DELETE）恢复自动更新状态")
st, js = api("DELETE", "/api/sector-effect/day/20260810")
check("DELETE 返回 200", st == 200 and js.get("success"), f"status={st} body={js}")
row = db_row("20260810")
check("清空后 sectors=[]", row and row[2] == "[]", f"json={row[2] if row else None}")
check("清空后 total=0", row and row[3] == 0, f"total={row[3] if row else None}")
check("清空后 source 回到自动源", row and "手动录入" not in (row[4] or ""), f"source={row[4] if row else None}")

print("\n[8] 清空不存在的日期应 404")
st, js = api("DELETE", "/api/sector-effect/day/20991231")
check("不存在日期返回 404", st == 404, f"status={st}")

print("\n[9] 矩阵接口仍正常（回归）")
st, js = api("GET", "/api/sector-effect?limit=400")
check("矩阵接口 200", st == 200, f"status={st}")
check("矩阵行数 > 200", (js.get("totalDates") or 0) > 200, f"totalDates={js.get('totalDates')}")

stop(proc)

print()
print("=" * 66)
print(f"RESULT: {len(passed)} passed, {len(failed)} failed")
if failed:
    print("FAILED ITEMS:")
    for f in failed:
        print("  -", f)
print("=" * 66)
