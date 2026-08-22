# -*- coding: utf-8 -*-
"""对着线上真实 URL 走一遍，不用本地服务器。
CF 的脚本注入、zone 缓存策略、SW 更新、离线可用性，这些只有线上才验得到。"""
import sys, re
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "https://bar.leonardchow.work"
P = F = 0; fails = []
def ok(n, c, d=""):
    global P, F
    if c: P += 1; print(f"  ✅ {n}")
    else: F += 1; fails.append(n); print(f"  ❌ {n}  {d}")

with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(viewport={"width":375,"height":667}, device_scale_factor=3,
                         is_mobile=True, has_touch=True)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)

    print(f"\n线上冒烟 {BASE}")
    pg.goto(BASE, wait_until="networkidle", timeout=30000)
    ok("首页 4 个入口", pg.locator(".tile").count() == 4)

    # 骰子：走一个真实场景，确认线上算出来的数跟本地一致
    pg.click('.tile[data-go="dice"]'); pg.wait_for_timeout(250)
    pg.click('#players button[data-n="3"]'); pg.click("#clr")
    for d in [5,5,5,1,2]: pg.click(f'#pad button[data-v="{d}"]')
    pg.click('#faces button[data-f="5"]'); pg.click('#counts button[data-c="4"]')
    pg.wait_for_timeout(250)
    # 不钉死具体叫法：5个5 和 6个5 的真值只差 0.5pp，而 1500 局的标准误是 1.3pp，
    # 引擎在它们之间的选择本来就带随机性，对用户也没区别。守性质而不是守身份。
    # （"推荐不能明显差于真最优"这条由 verify-dice 的【6d】对着全部合法叫法把关。）
    ok("骰子：推荐加注而不是开（上家叫4个5而我一个人就有4个，开必输）",
       "开" not in pg.inner_text(".vact"), pg.inner_text(".vact"))
    ok("骰子：推荐的是 5 点这一档（我手上最强的点）",
       pg.locator(".vact svg").get_attribute("aria-label") == "5点",
       pg.locator(".vact svg").get_attribute("aria-label"))
    pt = pg.locator('.stat:has-text("这注成立") .v').inner_text()
    ok(f"骰子：这注成立 ≥85%（实得 {pt}）", int(pt.strip("%>< ")) >= 85, pt)
    ok("骰子：「本轮不喝」是 rollout 出来的（说明里写明模拟局数）",
       "遍数出来的" in pg.inner_text("#out"), pg.inner_text("#out")[-160:])
    pg.screenshot(path="shots/live_dice.png")

    pg.goto(BASE + "/#holdem", wait_until="networkidle"); pg.wait_for_timeout(250)
    pg.click('#opps button[data-o="1"]'); pg.click("#clr")
    for r, s in [(12,0),(12,1)]:                       # As Ah
        pg.click(f'#hp-suits button[data-s="{s}"]'); pg.click(f'#hp-ranks button[data-r="{r}"]')
    pg.wait_for_timeout(1000)
    eq = pg.inner_text(".vact")
    ok(f"德州：AA 对 1 家胜率 {eq}（应在 84~86%）", 84.0 <= float(eq.strip('%')) <= 86.0, eq)
    pg.screenshot(path="shots/live_holdem.png")

    pg.goto(BASE + "/#bj", wait_until="networkidle"); pg.wait_for_timeout(250)
    pg.click('#up button[data-v="6"]'); pg.click("#clr")
    for c in [1,1]: pg.click(f'#pad button[data-v="{c}"]')
    pg.wait_for_timeout(350)
    ok("21点：A,A 对庄 6 → 分牌", pg.inner_text(".vact") == "分牌", pg.inner_text(".vact"))
    pg.screenshot(path="shots/live_bj.png")

    pg.goto(BASE + "/#p24", wait_until="networkidle"); pg.wait_for_timeout(250)
    pg.click("#clr")
    for n in [3,8,3,8]: pg.click(f'#pad button[data-v="{n}"]')
    pg.wait_for_timeout(450)
    ok("24点：大字是算式 8 ÷ (3 − 8 ÷ 3) = 24",
       pg.inner_text(".vact") == "8 ÷ (3 − 8 ÷ 3) = 24", pg.inner_text(".vact"))
    ok("24点：副行写「共 1 种解法」", "共 1 种解法" in pg.inner_text(".verdict"))
    pg.screenshot(path="shots/live_p24.png")

    for path, want in [("/manifest.webmanifest", "short_name"), ("/sw.js", "cdn-cgi")]:
        r = pg.request.get(BASE + path)
        ok(f"{path} 200 且内容正确", r.status == 200 and want in r.text(), f"status={r.status}")

    # zone 级 Browser Cache TTL(4h) 会盖掉 _headers 里的 no-cache，而那个设置是整个
    # leonardchow.work 共用的、不归这个站管。验不了的东西不该当闸门 —— 改验我真正能控的：
    r = pg.request.get(BASE + "/sw.js")
    print(f"     （参考：sw.js 的 cache-control = {r.headers.get('cache-control')}，被 zone 设置覆盖，用下面两条绕开）")
    html = pg.request.get(BASE + "/").text()
    m = re.search(r"register\('/sw\.js\?v=([0-9a-f]{10})',\s*\{\s*updateViaCache:\s*'none'\s*\}", html)
    ok("SW 注册 URL 带内容版本号（内容一变就强制换新 SW）", bool(m), "没找到版本化的注册调用")
    ok("SW 注册声明 updateViaCache:'none'（检查更新时绕过 HTTP 缓存）", bool(m))
    pg.goto(BASE, wait_until="networkidle"); pg.wait_for_timeout(1800)
    reg = pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>r?(r.active&&r.active.scriptURL)||(r.installing&&r.installing.scriptURL)||null:null)")
    ok(f"浏览器里实际注册的就是该版本", bool(reg) and m and m.group(1) in str(reg), str(reg))

    # 离线：装好 SW 后断网还能用
    ctx.set_offline(True)
    pg.goto(BASE + "/#p24", wait_until="domcontentloaded", timeout=20000)
    pg.wait_for_timeout(500)
    off = pg.locator("#pad button").count() == 13
    ok("断网后仍能打开并使用（PWA 离线）", off, f"键盘 {pg.locator('#pad button').count()} 键")
    if off:
        pg.click("#clr")
        for n in [1,2,3,4]: pg.click(f'#pad button[data-v="{n}"]')
        pg.wait_for_timeout(350)
        ok("断网后 24点 仍能求解", "= 24" in pg.inner_text(".vact"), pg.inner_text(".vact"))
    ctx.set_offline(False)

    # 离线阶段浏览器必然报 ERR_INTERNET_DISCONNECTED（那正是我们制造的状态）；
    # CF 注入的 bot 检测脚本也不归这个站管。都不算本站的 JS 报错。
    real = [e for e in errs if "cdn-cgi" not in e and "challenge" not in e.lower()
            and "ERR_INTERNET_DISCONNECTED" not in e and "Failed to load resource" not in e]
    ok("线上无本站 JS 报错", not real, "; ".join(real[:3]))
    ctx.close(); br.close()

print("\n" + "=" * 60)
print(f"  线上冒烟: 通过 {P} / 失败 {F}")
if fails: print("  失败: " + " | ".join(fails))
sys.exit(1 if F else 0)
