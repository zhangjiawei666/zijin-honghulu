# -*- coding: utf-8 -*-
"""v1.2.02 隔离验证：9/1 数据迁移的三种场景

场景 A（应迁移）：9/1 是腾讯文档模板/空白 + 9/2 是东财错位数据 → 迁到 9/1，删 9/2
场景 B（不应迁移）：9/1 已是东财真实数据 + 9/2 又有东财数据 → 不回滚，保持 9/1 原样
场景 C（幂等）：迁移后再启动一次 → 不再重复迁移（9/2 已不存在）
"""
import os, subprocess, sys, time, sqlite3, json, signal

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"
SERVER = os.path.join(BASE, "dist-server", "server.cjs")
PORT = "3599"


def run_server(data_dir, seconds=5):
    """启动 server，等 seconds 秒后强杀，返回 stdout+stderr 日志"""
    env = dict(os.environ)
    env["STOCK_MONITOR_DATA_DIR"] = data_dir
    env["PORT"] = PORT
    proc = subprocess.Popen(
        ["node", SERVER],
        cwd=BASE, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace",
    )
    try:
        proc.wait(timeout=seconds)
    except subprocess.TimeoutExpired:
        proc.kill()
    try:
        out = proc.communicate(timeout=10)[0]
    except Exception:
        out = ""
    # 端口可能还被占用，稍等
    time.sleep(0.5)
    return out or ""


def query(data_dir):
    con = sqlite3.connect(os.path.join(data_dir, "chat.db"))
    cur = con.cursor()
    rows = {}
    for d, ln, src in cur.execute(
        "SELECT date, length(sectors_json), source FROM sector_effect_daily "
        "WHERE date IN ('20260901','20260902') ORDER BY date"
    ):
        rows[d] = (ln, src)
    con.close()
    return rows


def write_shifted(data_dir, sectors, date="20260902", source="东方财富涨停板行情（涨停池）",
                  sub_date=None, created="2026-09-02T06:00:00.000Z"):
    con = sqlite3.connect(os.path.join(data_dir, "chat.db"))
    cur = con.cursor()
    cur.execute(
        "INSERT OR REPLACE INTO sector_effect_daily"
        "(date,day_type,sectors_json,total_limit_up,source,substituted_date,created_at,updated_at)"
        " VALUES(?,?,?,?,?,?,?,?)",
        (date, "trading", json.dumps(sectors, ensure_ascii=False),
         sum(s["count"] for s in sectors), source, sub_date, created, created),
    )
    con.commit()
    con.close()


def blank_0901(data_dir):
    """把 9/1 清空（模拟模板空白行）"""
    con = sqlite3.connect(os.path.join(data_dir, "chat.db"))
    cur = con.cursor()
    cur.execute("UPDATE sector_effect_daily SET sectors_json='[]', total_limit_up=0 WHERE date='20260901'")
    con.commit()
    con.close()


def fresh(tag):
    d = fr"C:\tmp\{tag}"
    os.makedirs(d, exist_ok=True)
    for f in os.listdir(d):
        try:
            os.remove(os.path.join(d, f))
        except Exception:
            pass
    return d


def migrated_flag(log):
    return "已修正旧版日期错位" in log


print("=" * 60)
print("场景 A：9/1 空白 + 9/2 东财错位 → 应迁移到 9/1")
print("=" * 60)
d = fresh("smA")
run_server(d, 6)                      # 建库 + 写模板
blank_0901(d)                          # 9/1 清空
write_shifted(d, [{"name": "机器人", "count": 7}, {"name": "半导体", "count": 5}])
print("  before:", query(d))
log = run_server(d, 6)
print("  迁移日志:", migrated_flag(log))
after = query(d)
print("  after :", after)
ok_a = ("20260901" in after and after["20260901"][1].find("东方财富") >= 0
        and "20260902" not in after)
print("  结论:", "PASS" if ok_a else "FAIL")

print()
print("=" * 60)
print("场景 B：9/1 已是东财真实数据 + 9/2 又有东财数据 → 不应迁移（不回滚）")
print("=" * 60)
d2 = fresh("smB")
run_server(d2, 6)                      # 建库
# 直接把 9/1 改成东财来源 + 真实数据（模拟已修复状态）
con = sqlite3.connect(os.path.join(d2, "chat.db"))
con.execute("UPDATE sector_effect_daily SET sectors_json=?, total_limit_up=?, source=? WHERE date='20260901'",
            (json.dumps([{"name": "真实板块", "count": 9}], ensure_ascii=False), 9,
             "东方财富涨停板行情（涨停池）"))
con.commit()
con.close()
write_shifted(d2, [{"name": "错位板块", "count": 3}])
print("  before:", query(d2))
log2 = run_server(d2, 6)
print("  迁移日志:", migrated_flag(log2), "(应为 False)")
after2 = query(d2)
print("  after :", after2)
# 9/1 应保持"真实板块"，9/2 保留
con = sqlite3.connect(os.path.join(d2, "chat.db"))
s901 = con.execute("SELECT sectors_json FROM sector_effect_daily WHERE date='20260901'").fetchone()[0]
con.close()
ok_b = (not migrated_flag(log2)) and ("真实板块" in s901) and ("20260902" in after2)
print("  9/1 内容:", s901)
print("  结论:", "PASS" if ok_b else "FAIL")

print()
print("=" * 60)
print("场景 C：幂等性 —— 迁移后再启动一次不应重复迁移")
print("=" * 60)
log3 = run_server(d, 6)                # 复用场景 A 的库
print("  迁移日志:", migrated_flag(log3), "(应为 False)")
after3 = query(d)
print("  after :", after3)
ok_c = (not migrated_flag(log3)) and ("20260901" in after3) and ("20260902" not in after3)
print("  结论:", "PASS" if ok_c else "FAIL")

print()
print("=" * 60)
print("SUMMARY:", "ALL PASS" if (ok_a and ok_b and ok_c) else "SOME FAILED",
      f"(A={ok_a} B={ok_b} C={ok_c})")
print("=" * 60)
