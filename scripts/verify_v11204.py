# -*- coding: utf-8 -*-
"""v1.2.04 静态验证：字体档位（小 / 中 / 大）的缩放链路是否完整

验证内容：
  1. 三档 data-font-size 的 --font-scale 值正确（0.875 / 1 / 1.25）
  2. tdesign 字号变量被覆盖为 calc 表达式（--td-font-size-*）
  3. 我的覆盖规则优先级高于 tdesign 的 :root，且位置在其后（双保险）
  4. tailwind 字号工具类（text-xs ~ text-4xl）被改写为 calc
  5. 项目自身 CSS / tsx 内联字号已变量化
  6. JS 中包含切换逻辑与档位文案
  7. 用 --font-scale 反推三档实际字号，打印对照表（对通达信规格）
"""
import glob
import os
import re

BASE = r"E:\WorkBuddy\2026-08-26-14-59-46\stock-monitor-agent"

passed, failed = [], []


def check(name, cond, detail=""):
    if cond:
        passed.append(name)
        print(f"  [PASS] {name}")
    else:
        failed.append(name)
        print(f"  [FAIL] {name}  {detail}")


css_path = glob.glob(os.path.join(BASE, "dist", "assets", "*.css"))
js_path = glob.glob(os.path.join(BASE, "dist", "assets", "index-*.js"))

print("=" * 68)
print("v1.2.04 字体档位验证")
print("=" * 68)

if not css_path or not js_path:
    print("  未找到构建产物，请先执行 vite build")
    raise SystemExit(1)

css = open(css_path[0], encoding="utf-8").read()
js = open(js_path[0], encoding="utf-8").read()

print("\n[1] 三档 --font-scale")
for lvl, expect in (("small", "0.875"), ("medium", "1"), ("large", "1.25")):
    # 注意：压缩后值为 ".875" 而非 "0.875"；且声明以 ; 结尾，不能期望紧跟 }
    m = re.search(
        r"html\[data-font-size=" + lvl + r"\]\{--font-scale:\s*([^;]+);", css
    )
    got = (m.group(1).strip() if m else "")
    # 归一化：".875" 与 "0.875" 都视为 0.875
    try:
        ok = abs(float(got) - float(expect)) < 1e-9
    except ValueError:
        ok = False
    check(f"{lvl} 档 --font-scale = {expect}", ok, f"实际={got or '(未匹配)'}")

print("\n[2] tdesign 字号变量被覆盖")
for var in (
    "--td-font-size-body-small",
    "--td-font-size-body-medium",
    "--td-font-size-body-large",
    "--td-font-size-title-medium",
    "--td-font-size-headline-large",
):
    ok = bool(re.search(re.escape(var) + r":\s*calc\(", css))
    check(f"{var} 已改为 calc 缩放", ok)

print("\n[3] 覆盖优先级与位置")
i_root = css.find("--td-font-size-body-medium: 14px")
i_mine = css.find("html[data-font-size]")
check("tdesign 原始 :root 定义存在", i_root > 0)
check("我的覆盖规则存在", i_mine > 0)
check("我的规则在 :root 之后（顺序保险）", i_mine > i_root,
      f"mine={i_mine} root={i_root}")
# html[data-font-size] 特异性 (0,1,1) > :root (0,1,0)，顺序在前也照样生效
print("        注：html[data-font-size] 特异性 (0,1,1) > :root (0,1,0)，优先级本身已足够")

print("\n[4] tailwind 字号工具类")
for cls in ("text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl",
            "text-3xl", "text-4xl"):
    # 压缩后形如：.text-xs{font-size:calc(.75rem * var(--font-scale,1))}
    ok = bool(re.search(
        r"\." + cls + r"\{font-size:calc\([^}]*var\(--font-scale", css
    ))
    check(f".{cls} 随档位缩放", ok)

print("\n[5] 项目自身样式变量化")
n_calc = len(re.findall(r"calc\(\d+(?:\.\d+)?px \* var\(--font-scale", css))
check(f"CSS 中有 {n_calc} 处 calc 缩放（应 > 40）", n_calc > 40, f"实际 {n_calc}")
n_js_calc = len(re.findall(r"calc\(\d+(?:\.\d+)?px \* var\(--font-scale", js))
check(f"JS（内联样式）中有 {n_js_calc} 处 calc 缩放（应 > 5）", n_js_calc > 5,
      f"实际 {n_js_calc}")

print("\n[6] JS 切换逻辑与文案")
for k in ("data-font-size", "--font-scale", "界面字体", "小四 12pt"):
    check(f"JS 含 {k!r}", k in js)

print("\n[7] 三档实际字号对照（按 --font-scale 换算）")
scales = {"小": 0.875, "中": 1.0, "大": 1.25}
base_rows = [
    ("表格正文 (matrix-table)", 13),
    ("日期文本 (date-text)", 12),
    ("星期/角标 (date-week)", 10),
    ("板块单元格 (cell-text)", 12.5),
    ("页面副标题", 13),
    ("按钮/输入框 (tdesign body-medium)", 14),
]
print(f"  {'元素':<34}{'小(0.875)':>12}{'中(1.0)':>12}{'大(1.25)':>12}")
print("  " + "-" * 70)
for label, px in base_rows:
    row = "".join(f"{px * scales[k]:>11.2f}px" for k in ("小", "中", "大"))
    print(f"  {label:<34}{row}")
print()
print("  通达信规格对照：小=五号 10.5pt · 中=小四 12pt（默认）· 大=小三 15pt")

print()
print("=" * 68)
print(f"RESULT: {len(passed)} passed, {len(failed)} failed")
for f in failed:
    print("  - FAILED:", f)
print("=" * 68)
