# -*- coding: utf-8 -*-
"""v1.2.05 隔离验证：腾讯文档基线同步

场景：
  A. 全新库首次启动 → 导入 241 天（交易日 162 / 周末 68 / 节假日 11）
  B. 旧库（240 天旧基线）升级 → 自动重同步到新版本，9/1 与 9/2 拿到新数据
  C. 手动录入的行在重同步时不被覆盖
  D. 周末 / 节假日行保持为空（用户要求：只同步交易日）
  E. 8/22（周六）无脏数据
"""
import json
import os
import shutil
import sqlite3
import subprocess
import time
import urllib.error
import urllib.request

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
SERVER = os.path.join(BASE, "dist-server", "server.cjs")
PORT = "3633"
URL = f"http://127.0.0.1:{PORT}"

passed, failed = [], []


def check(name, cond, detail=""):
    if cond:
        passed.append(name)
        print(f"  [PASS] {name}")
    else:
        failed.append(name)
        print(f"  [FAIL] {name}  {detail}")


def fresh(tag):
    d = fr"C:\tmp\{tag}"
    if os.path.exists(d):
        shutil.rmtree(d)
    os.makedirs(d, exist_ok=True)
    return d


def start(data_dir, seconds=7):
    env = dict(os.environ)
    env["STOCK_MONITOR_DATA_DIR"] = data_dir
    env["PORT"] = PORT
    p = subprocess.Popen(
        ["node", SERVER], cwd=BASE, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace",
    )
    for _ in range(50):
        try:
            urllib.request.urlopen(f"{URL}/api/health", timeout=1)
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


def row(data_dir, date):
    con = sqlite3.connect(os.path.join(data_dir, "chat.db"))
    cur = con.cursor()
    r = cur.execute(
        "SELECT date, day_type, sectors_json, total_limit_up, source"
        " FROM sector_effect_daily WHERE date=?", (date,)
    ).fetchone()
    con.close()
    return r


def counts(data_dir):
    con = sqlite3.connect(os.path.join(data_dir, "chat.db"))
    cur = con.cursor()
    c = {}
    for dt, n in cur.execute("SELECT day_type, COUNT(*) FROM sector_effect_daily GROUP BY day_type"):
        c[dt] = n
    total = cur.execute("SELECT COUNT(*) FROM sector_effect_daily").fetchone()[0]
    con.close()
    c["__total__"] = total
    return c


def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{URL}{path}", data=data, method=method,
                                headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}


print("=" * 68)
print("腾讯文档基线同步验证")
print("=" * 68)

# ---------- A. 全新库 ----------
print("\n[A] 全新库首次启动")
d = fresh("smSyncA")
p = start(d, 8)
stop(p)
c = counts(d)
check(f"总行数 241（实际 {c.get('__total__')}）", c.get("__total__") == 241, str(c))
check(f"交易日 162（实际 {c.get('trading')}）", c.get("trading") == 162, str(c))
check(f"周末 68（实际 {c.get('weekend')}）", c.get("weekend") == 68, str(c))
check(f"节假日 11（实际 {c.get('holiday')}）", c.get("holiday") == 11, str(c))

print("\n[D] 周末 / 节假日行为空")
r822 = row(d, "20260822")
check("8/22(周六) day_type=weekend", r822 and r822[1] == "weekend", str(r822))
check("8/22(周六) sectors 为空", r822 and json.loads(r822[2]) == [], str(r822))
r219 = row(d, "20260219")
check("2/19(春节) day_type=holiday", r219 and r219[1] == "holiday", str(r219))
check("2/19(春节) sectors 为空", r219 and json.loads(r219[2]) == [], str(r219))

print("\n[9/1 与 9/2 数据]")
r901 = row(d, "20260901")
r902 = row(d, "20260902")
s901 = json.loads(r901[2]) if r901 else []
s902 = json.loads(r902[2]) if r902 else []
check("9/1 存在且为 trading", r901 and r901[1] == "trading", str(r901))
check(f"9/1 有 14 个板块（实际 {len(s901)}）", len(s901) == 14, str([x["name"] for x in s901]))
check("9/1 来源为腾讯文档模板", r901 and "腾讯文档" in (r901[4] or ""), str(r901[4]))
check("9/2 存在且为 trading", r902 and r902[1] == "trading", str(r902))
check(f"9/2 有 11 个板块（实际 {len(s902)}）", len(s902) == 11, str([x["name"] for x in s902]))
check("9/1 与 9/2 内容不同（非错位复制）",
      [x["name"] for x in s901] != [x["name"] for x in s902])
print(f"    9/1: {[x['name'] + str(x['count']) for x in s901]}")
print(f"    9/2: {[x['name'] + str(x['count']) for x in s902]}")

# ---------- C. 手动录入保护 ----------
print("\n[C] 手动录入的行在重同步时不被覆盖")
p = start(d, 6)
st, js = api("PUT", "/api/sector-effect/day/20260810", {
    "sectors": [{"name": "手工板块", "count": 9}], "dayType": "trading",
})
check("手动保存成功", st == 200 and js.get("success"), f"{st} {js}")
stop(p)

# 模拟基线版本变更：把 meta 改成旧值，重启触发重同步
con = sqlite3.connect(os.path.join(d, "chat.db"))
con.execute("UPDATE app_meta SET value='2020-01-01' WHERE key='history_sync_version'")
con.commit()
con.close()

p = start(d, 8)
stop(p)
r810 = row(d, "20260810")
check("重同步后手动行仍为手动录入",
      r810 and "手动录入" in (r810[4] or ""), str(r810[4]))
check("重同步后手动数据未被覆盖",
      r810 and json.loads(r810[2])[0]["name"] == "手工板块", str(r810[2]))
ver = None
con = sqlite3.connect(os.path.join(d, "chat.db"))
rr = con.execute("SELECT value FROM app_meta WHERE key='history_sync_version'").fetchone()
con.close()
check(f"版本戳已更新为 2026-09-02（实际 {rr[0] if rr else None}）",
      rr and rr[0] == "2026-09-02", str(rr))

# ---------- B. 旧库升级 ----------
print("\n[B] 旧基线库升级（先污染 9/1 为东财错位数据）")
d2 = fresh("smSyncB")
p = start(d2, 8)
stop(p)
# 把 9/1 改成"东财错位数据"、9/2 改成旧内容，模拟升级前的状态
con = sqlite3.connect(os.path.join(d2, "chat.db"))
con.execute("UPDATE sector_effect_daily SET sectors_json=?, total_limit_up=?, source=? WHERE date='20260901'",
            (json.dumps([{"name": "旧错位板块", "count": 5}], ensure_ascii=False), 5,
             "东方财富涨停板行情（涨停池）"))
con.execute("UPDATE app_meta SET value='2020-01-01' WHERE key='history_sync_version'")
con.commit()
con.close()

p = start(d2, 8)
stop(p)
r901b = row(d2, "20260901")
s901b = json.loads(r901b[2]) if r901b else []
check("升级后 9/1 已被新基线覆盖",
      any(x["name"] == "短剧" for x in s901b), str([x["name"] for x in s901b]))
check("升级后 9/1 来源为腾讯文档模板",
      r901b and "腾讯文档" in (r901b[4] or ""), str(r901b[4]))
check("升级后不再含旧错位板块",
      not any(x["name"] == "旧错位板块" for x in s901b))

print()
print("=" * 68)
print(f"RESULT: {len(passed)} passed, {len(failed)} failed")
for f in failed:
    print("  - FAILED:", f)
print("=" * 68)
