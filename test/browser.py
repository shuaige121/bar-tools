# -*- coding: utf-8 -*-
"""真浏览器验收：四个工具逐个点一遍，把页面上显示的数字跟 node 引擎重算对账。
断言全绿不代表好用，所以每个分支都出整页截图供人眼复核。"""
import json, subprocess, sys, threading, http.server, socketserver, functools, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE, PORT = ROOT / "site", 8791
SHOTS = ROOT / "shots"; SHOTS.mkdir(exist_ok=True)
for f in SHOTS.glob("*.png"): f.unlink()

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=str(SITE)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{PORT}"

PASS, FAIL = 0, 0; fails = []
def ok(name, cond, detail=""):
    global PASS, FAIL
    if cond: PASS += 1; print(f"  ✅ {name}")
    else:
        FAIL += 1; fails.append(name); print(f"  ❌ {name}  {detail}")

def pct(x):
    """必须与 app.js 里的 pct() 逐分支一致，否则对账的是两套规则。"""
    if x >= 1: return "100%"
    if x <= 0: return "0%"
    if x > 0.995: return ">99%"
    if x < 0.005: return "<1%"
    return f"{round(x*100)}%"

def node(js):
    return json.loads(subprocess.run(["node","-e",js],capture_output=True,text=True,check=True).stdout)
def req(name): return f'require({json.dumps(str(ROOT/"src"/name))})'

DEVICES = {"iPhone SE":(375,667), "iPhone 15 Pro":(393,852), "Pixel 7":(412,915), "iPad mini":(768,1024)}
TOOLS = [("dice","吹牛骰子"),("holdem","德州扑克"),("bj","21点"),("p24","24点")]

with sync_playwright() as pw:
    br = pw.chromium.launch()

    # ── 1. 首页与导航 ────────────────────────────────────────────
    print("\n【1】首页 / 进入 / 返回")
    ctx = br.new_context(viewport={"width":375,"height":667}, device_scale_factor=3, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    errs=[]
    pg.on("pageerror", lambda e: errs.append(f"PAGEERROR {e}"))
    pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
    pg.goto(BASE, wait_until="networkidle")
    ok("首页 4 个入口", pg.locator(".tile").count()==4, f"got {pg.locator('.tile').count()}")
    ok("首页不显示返回键", pg.locator("#back").is_hidden())
    pg.screenshot(path=str(SHOTS/"00_home.png"))
    for tid, tname in TOOLS:
        pg.goto(BASE, wait_until="networkidle")
        pg.click(f'.tile[data-go="{tid}"]'); pg.wait_for_timeout(120)
        ok(f"进入「{tname}」标题正确", tname in pg.inner_text("#title"), f"got {pg.inner_text('#title')!r}")
        ok(f"「{tname}」显示返回键", pg.locator("#back").is_visible())
        pg.click("#back"); pg.wait_for_timeout(120)
        ok(f"从「{tname}」能返回首页", pg.locator(".tile").count()==4)
    # 浏览器物理返回键
    pg.goto(BASE, wait_until="networkidle"); pg.click('.tile[data-go="bj"]'); pg.wait_for_timeout(100)
    pg.go_back(); pg.wait_for_timeout(150)
    ok("浏览器物理返回键也能回首页", pg.locator(".tile").count()==4)
    # 直接访问深链
    pg.goto(BASE+"/#holdem", wait_until="networkidle")
    ok("直接打开 #holdem 深链有效", "德州" in pg.inner_text("#title"))
    ok("导航过程无 JS 报错", not errs, "; ".join(errs[:3]))

    # ── 2. 各机型无横向溢出 ──────────────────────────────────────
    print("\n【2】四机型 × 四工具：横向溢出 / JS 报错")
    for dname,(w,h) in DEVICES.items():
        c2 = br.new_context(viewport={"width":w,"height":h}, device_scale_factor=2, is_mobile=True, has_touch=True)
        p2 = c2.new_page(); e2=[]
        p2.on("pageerror", lambda e: e2.append(str(e)))
        p2.on("console", lambda m: e2.append(m.text) if m.type=="error" else None)
        bad=[]
        for tid,tname in [("","首页")]+TOOLS:
            p2.goto(BASE+("/#"+tid if tid else "/"), wait_until="networkidle"); p2.wait_for_timeout(80)
            sw = p2.evaluate("document.documentElement.scrollWidth")
            cw = p2.evaluate("document.documentElement.clientWidth")
            if sw > cw+1: bad.append(f"{tname}({sw}>{cw})")
        ok(f"{dname} 全部页面无横向溢出", not bad, "; ".join(bad))
        ok(f"{dname} 无 JS 报错", not e2, "; ".join(e2[:2]))
        c2.close()

    # ── 3. 吹牛骰子：点击流 + 数字对账 ───────────────────────────
    print("\n【3】吹牛骰子：真实点击流 × 数字对账")
    DICE = [
        ("该开-对方叫8个6", 3, [2,3,4,5,2], (8,6), False),
        ("该加注-手握4个5", 3, [5,5,5,1,2], (4,5), False),
        ("斋叫-对方叫3个1", 4, [1,1,3,4,6], (3,1), False),
        ("不飞模式",        3, [6,6,2,3,4], (5,6), True),
        ("我先叫",          5, [1,1,6,6,6], None,  False),
        ("只输2颗骰",       4, [6,6],       (7,6), False),
        ("8人局40颗骰",     8, [1,2,3,4,5], (14,4),False),
    ]
    for title, players, hand, bid, nowild in DICE:
        pg.goto(BASE+"/#dice", wait_until="networkidle")
        pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
        if nowild: pg.click("#hbtn")
        pg.click(f'#players button[data-n="{players}"]'); pg.click("#clr")
        for d in hand: pg.click(f'#pad button[data-v="{d}"]')
        if bid is None: pg.click("#firstBtn")
        else:
            pg.click(f'#faces button[data-f="{bid[1]}"]'); pg.click(f'#counts button[data-c="{bid[0]}"]')
        pg.wait_for_timeout(90)
        # 注意：不传 sims/seed，用与页面完全相同的默认值，rollout 才是确定性的
        exp = node(f"""const E={req('engine-dice.js')};
          const r=E.analyze({{hand:{json.dumps(hand)},players:{players},
            bid:{json.dumps({'count':bid[0],'face':bid[1]}) if bid else 'null'},
            wild:{json.dumps(not nowild)},dicePerPlayer:5}});
          const b=r.actions[0];
          console.log(JSON.stringify({{kind:b.kind,count:b.bid?b.bid.count:null,face:b.bid?b.bid.face:null,
            ev:b.ev,pTrue:b.pTrue===undefined?null:b.pTrue,
            pch:b.pChallenged===undefined?null:b.pChallenged}}));""")
        act, vis = pg.inner_text(".vact"), pg.inner_text(".verdict")
        if exp["kind"]=="challenge":
            ok(f"{title} → 推荐「开」，赢面 {pct(exp['ev'])}", "开" in act and pct(exp["ev"]) in vis, f"{act!r} / {vis[:80]!r}")
        else:
            ok(f"{title} → 叫 {exp['count']}个{exp['face']}", f"{exp['count']}个" in act
               and pg.locator(".vact svg").get_attribute("aria-label")==f"{exp['face']}点", f"got {act!r}")
            for lbl,val in (("这注成立",exp["pTrue"]),("下家开你",exp["pch"]),("本轮不喝",exp["ev"])):
                ok(f"{title} → {lbl} = {pct(val)}",
                   pg.locator(f'.stat:has-text("{lbl}") .v').inner_text()==pct(val),
                   f'页面 {pg.locator(f".stat:has-text(\"{lbl}\") .v").inner_text()}')
        def _n(t):
            t=t.strip('%'); return 99.5 if t.startswith('>') else (0.5 if t.startswith('<') else float(t))
        pcs=[_n(x) for x in pg.locator(".alt .pc").all_inner_texts()]
        ok(f"{title} → 备选 {len(pcs)} 条且降序", len(pcs)>=2 and pcs==sorted(pcs,reverse=True), str(pcs))
        ok(f"{title} → 备选不超过 7 条（每点数最优 + 开）", len(pcs)<=7, f"{len(pcs)} 条")
        pg.screenshot(path=str(SHOTS/f"10_dice_{title}.png"))

    # 推荐「开」时不能出现 ±NaN —— 开是精确值、没有 CI，UI 照算就会显示 NaN。
    pg.goto(BASE + "/#dice", wait_until="networkidle")
    pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
    pg.click('#players button[data-n="3"]'); pg.click("#clr")
    for d in [2,3,4,5,2]: pg.click(f'#pad button[data-v="{d}"]')
    pg.click('#faces button[data-f="6"]'); pg.click('#counts button[data-c="8"]')
    pg.wait_for_timeout(900)
    out_txt = pg.inner_text("#out")
    ok("骰子：推荐「开」时不出现 NaN/undefined/Infinity",
       not any(x in out_txt for x in ("NaN", "undefined", "Infinity")), out_txt[-160:])
    ok("骰子：该局面确实推荐「开」（说明上面那条检查覆盖到了这条分支）",
       "开" in pg.inner_text(".vact"), pg.inner_text(".vact"))

    # 叫到顶（上家叫满）时一个合法加注都没有，一次模拟都没跑过 —— 界面不许说"跑了 N 遍"。
    # 原来会显示「真打完 6,000 遍（±— 个百分点）」，而 NaN 闸门只扫 NaN/undefined/Infinity，
    # 所以错误地通过了。
    pg.goto(BASE + "/#dice", wait_until="networkidle")
    pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
    pg.click('#players button[data-n="3"]'); pg.click("#clr")
    for d in [1,2,3,4,5]: pg.click(f'#pad button[data-v="{d}"]')
    pg.click('#faces button[data-f="6"]'); pg.click('#counts button[data-c="15"]')
    pg.wait_for_timeout(600)
    tail = pg.inner_text("#out")
    ok("骰子：无候选时不谎报模拟次数", "遍数出来的" not in tail, tail[-140:])
    ok("骰子：无候选时不显示空的 ±—", "±—" not in tail, tail[-140:])
    # ⚠️ 飞模式下 15个6 **不是**叫到顶：规则上还有 8 个合法斋叫（8个1…15个1），
    # 只是 pTrue 最高 0.00027 被候选阈值滤掉。原来这条断言要求它显示"叫到顶"，
    # 等于把一个事实错误固化进了测试（外部评审指出的）。
    ok("骰子：飞模式 15个6 说的是「还能往上叫但不值得」而不是「叫到顶」",
       "还能往上叫" in tail and "叫到顶" not in tail, tail[-160:])
    ok("骰子：并说明还剩几种合法叫法", "8 种" in tail, tail[-160:])
    ok("骰子：无候选时仍推荐「开」", "开" in pg.inner_text(".vact"), pg.inner_text(".vact"))

    # 真正叫到顶：不飞模式下 15个6 一个合法加注都没有
    pg.click("#hbtn"); pg.wait_for_timeout(500)     # 切到「不飞」
    tail2 = pg.inner_text("#out")
    ok("骰子：不飞模式 15个6 才是真的叫到顶", "叫到顶" in tail2, tail2[-160:])
    ok("骰子：真叫到顶时不说「还能往上叫」", "还能往上叫" not in tail2, tail2[-160:])
    pg.click("#hbtn"); pg.wait_for_timeout(300)     # 切回「飞」

    # 第四种情况：2 人局走 2-ply 模型，叫满时同样没有加注可选。
    # 判据若挂在 method 上会落进"单挑用两步前瞻模型估的"分支，去解释不存在的条形。
    pg.goto(BASE + "/#dice", wait_until="networkidle")
    pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
    pg.click('#players button[data-n="2"]'); pg.click("#clr")
    for d in [1,2,3,4,5]: pg.click(f'#pad button[data-v="{d}"]')
    pg.click('#faces button[data-f="6"]'); pg.click('#counts button[data-c="10"]')
    pg.wait_for_timeout(500)
    t2 = pg.inner_text("#out")
    ok("骰子：2人局叫满时不解释不存在的条形", "条形" not in t2, t2[-160:])
    ok("骰子：2人局叫满时说的是「还能往上叫但不值得」", "还能往上叫" in t2, t2[-160:])
    ok("骰子：2人局叫满时不谎报模拟次数", "遍数出来的" not in t2, t2[-160:])
    ok("骰子：2人局叫满时无备选列表", pg.locator(".alt").count() <= 1,
       f"{pg.locator('.alt').count()} 行")

    # 满手牌交互（曾出过"清空后键盘回不来"的卡死）
    pg.goto(BASE+"/#dice", wait_until="networkidle")
    pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
    for d in [1,1,1,1,1]: pg.click(f'#pad button[data-v="{d}"]')
    ok("满 5 颗后键盘换成「下一轮」", pg.locator("#nextRound").count()==1)
    pg.click("#nextRound"); pg.wait_for_timeout(80)
    ok("「下一轮」后键盘回来", pg.locator('#pad button[data-v]').count()==6)
    for d in [2,2,2,2,2]: pg.click(f'#pad button[data-v="{d}"]')
    pg.click("#clr"); pg.wait_for_timeout(80)
    ok("「清空」后键盘也回来（回归：曾卡死）", pg.locator('#pad button[data-v]').count()==6)

    # ── 4. 德州扑克 ──────────────────────────────────────────────
    print("\n【4】德州扑克：选牌 × 胜率对账")
    R = {'2':0,'3':1,'4':2,'5':3,'6':4,'7':5,'8':6,'9':7,'T':8,'J':9,'Q':10,'K':11,'A':12}
    Su = {'s':0,'h':1,'d':2,'c':3}
    def pick(pg, cards):
        for cs in cards:
            pg.click(f'#hp-suits button[data-s="{Su[cs[1]]}"]')
            pg.click(f'#hp-ranks button[data-r="{R[cs[0]]}"]')
    for title, hole, board, opps in [
        ("翻牌前AA-1家",   ["As","Ah"], [], 1),
        ("翻牌前72o-5家",  ["7h","2d"], [], 5),
        ("翻牌成同花顺",   ["As","Ks"], ["Qs","Js","Ts"], 2),
        ("河牌-两对",      ["Ah","Kd"], ["As","Kc","7h","3d","9s"], 3),
    ]:
        pg.goto(BASE+"/#holdem", wait_until="networkidle")
        pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
        pg.click(f'#opps button[data-o="{opps}"]'); pg.click("#clr")
        pick(pg, hole+board)
        pg.wait_for_timeout(400)
        exp = node(f"""const H={req('engine-holdem.js')};
          const p=s=>H.parseCard(s);
          const hole={json.dumps(hole)}.map(p), board={json.dumps(board)}.map(p);
          const unknown=5-board.length+{opps}*2;
          const it = unknown<=2?120000:({opps}<=2?60000:30000);
          H.setSeed(20260822);
          const r=H.equity(hole,board,{opps},it);
          console.log(JSON.stringify({{eq:r.equity,win:r.win,tie:r.tie,lose:r.lose}}));""")
        def p1(x):
            if x>=1: return "100%"
            if x<=0: return "0%"
            if x>0.9995: return ">99.9%"
            if x<0.0005: return "<0.1%"
            return f"{x*100:.1f}%"
        ok(f"{title} → 胜率 {p1(exp['eq'])}", pg.inner_text(".vact")==p1(exp["eq"]),
           f"页面 {pg.inner_text('.vact')!r}")
        for lbl,val in (("赢",exp["win"]),("平分",exp["tie"]),("输",exp["lose"])):
            got = pg.locator(f'.stat:has-text("{lbl}") .v').first.inner_text()
            ok(f"{title} → {lbl} {p1(val)}", got==p1(val), f"页面 {got}")
        pg.screenshot(path=str(SHOTS/f"20_holdem_{title}.png"))
    # 同一张牌不能选两次
    pg.goto(BASE+"/#holdem", wait_until="networkidle"); pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
    pick(pg, ["As"])
    ok("已选的牌在键盘上被禁用", pg.locator(f'#hp-ranks button[data-r="{R["A"]}"]').is_disabled())
    pg.click('.pcard[data-c]'); pg.wait_for_timeout(80)
    ok("点已选的牌可以移除", pg.locator('.pcard[data-c]').count()==0)

    # ── 5. 21点 ─────────────────────────────────────────────────
    print("\n【5】21点：决策 × EV 对账")
    for title, mine, up, h17 in [
        ("硬16对庄10", [10,6], 10, False), ("A,A对庄6", [1,1], 6, False),
        ("硬11对庄10", [5,6], 10, False),  ("软18对庄9", [1,7], 9, False),
        ("庄软17要牌", [10,6], 1, True),   ("20点对庄A", [10,10], 1, False),
    ]:
        pg.goto(BASE+"/#bj", wait_until="networkidle")
        pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
        if h17: pg.click("#hbtn")
        pg.click(f'#up button[data-v="{up}"]'); pg.click("#clr")
        for c in mine: pg.click(f'#pad button[data-v="{c}"]')
        pg.wait_for_timeout(150)
        exp = node(f"""const B={req('engine-blackjack.js')};
          const r=B.advise({json.dumps(mine)},{up},{{hitSoft17:{json.dumps(h17)},das:true,surrender:true}});
          console.log(JSON.stringify({{best:r.bestName,ev:r.bestEV,bust:r.dealerBust,total:r.total,soft:r.soft,
            list:r.actions.map(a=>[a.name,a.ev])}}));""")
        ok(f"{title} → 推荐「{exp['best']}」", pg.inner_text(".vact")==exp["best"], f"页面 {pg.inner_text('.vact')!r}")
        ok(f"{title} → 庄家爆牌 {pct(exp['bust'])}", pct(exp["bust"]) in pg.inner_text(".verdict"))
        names = pg.locator(".alt .nm").all_inner_texts()
        evs = [float(x) for x in pg.locator(".alt .pc").all_inner_texts()]
        ok(f"{title} → 动作列表 {len(names)} 项且按EV降序", evs==sorted(evs,reverse=True), str(evs))
        ok(f"{title} → 首项EV = {exp['ev']:.4f}", abs(evs[0]-exp["ev"])<0.0006, f"页面 {evs[0]}")
        raw = pg.locator(".alt .pc").all_inner_texts()
        ok(f"{title} → 排序里没有两行显示成同一个数（否则先后看着像随机）",
           len(set(raw))==len(raw), str(raw))
        pg.screenshot(path=str(SHOTS/f"30_bj_{title}.png"))
    # Hi-Lo 计数器
    pg.goto(BASE+"/#bj", wait_until="networkidle"); pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
    for c in [2,3,4,5,6]: pg.click(f'#count button[data-cv="{c}"]')
    ok("Hi-Lo：5张小牌 → 流水 +5", "+5" in pg.locator('.stat:has-text("流水计数") .v').inner_text(),
       pg.locator('.stat:has-text("流水计数") .v').inner_text())
    for c in [10,10,10,10,10]: pg.click(f'#count button[data-cv="{c}"]')
    ok("Hi-Lo：再5张大牌 → 归零", pg.locator('.stat:has-text("流水计数") .v').inner_text()=="0")
    pg.click("#reset"); pg.wait_for_timeout(60)
    ok("Hi-Lo 归零键有效", pg.locator('.stat:has-text("流水计数") .v').inner_text()=="0")

    # ── 6. 24点 ─────────────────────────────────────────────────
    print("\n【6】24点：求解 × 结果对账")
    for title, nums in [("经典3388",[3,8,3,8]), ("经典1555",[1,5,5,5]), ("简单1234",[1,2,3,4]), ("无解1113",[1,1,1,3])]:
        pg.goto(BASE+"/#p24", wait_until="networkidle")
        pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
        pg.click("#clr")
        for n in nums: pg.click(f'#pad button[data-v="{n}"]')
        pg.wait_for_timeout(250)
        exp = node(f"""const S={req('engine-24.js')};
          const r=S.solve({json.dumps(nums)},24,60);
          console.log(JSON.stringify({{solvable:r.solvable,count:r.count,first:r.solutions[0]||null}}));""")
        if exp["solvable"]:
            # 展示层把程序员符号换成人念的符号；这里必须用同一套规则，否则对账的是两套写法
            want = exp["first"].replace("*","×").replace("/","÷").replace(" - "," − ")
            ok(f"{title} → 大字是最短算式 {want} = 24", pg.inner_text(".vact")==f"{want} = 24",
               f"页面 {pg.inner_text('.vact')!r}")
            ok(f"{title} → 副行写「共 {exp['count']} 种解法」",
               f"共 {exp['count']} 种解法" in pg.inner_text(".verdict"), pg.inner_text(".vwhy"))
            sols_txt = pg.inner_text(".sols")
            ok(f"{title} → 解法行里没有程序员符号 * /", "*" not in sols_txt and "/" not in sols_txt)
            rows = pg.locator(".sol").count()
            ok(f"{title} → 列出 {rows} 条解", rows==min(exp["count"],60), f"got {rows} want {min(exp['count'],60)}")
            vw = pg.evaluate("() => { const e = document.querySelector('.vact'); return [e.scrollWidth, e.clientWidth]; }")
            ok(f"{title} → 算式不撑破结论卡 ({vw[0]}≤{vw[1]})", vw[0] <= vw[1] + 1)
        else:
            ok(f"{title} → 显示「无解」", pg.inner_text(".vact")=="无解", f"页面 {pg.inner_text('.vact')!r}")
        pg.screenshot(path=str(SHOTS/f"40_p24_{title}.png"))

    # ── 6b. 录入成本：数真实点击次数，并设预算 ────────────────────
    # "操作方便"必须可测，否则只是自我感觉。这里数的是从进入工具到屏幕上出现
    # 结论卡为止的真实点击次数（人数/规则这类有记忆的设置不计入首轮之后）。
    print("\n【6b】录入成本：从进入工具到出答案要点几下")
    def count_taps(hash_, steps, budget, label):
        pg.goto(BASE + hash_, wait_until="networkidle")
        pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
        taps = 0
        for sel in steps:
            pg.click(sel); taps += 1
        pg.wait_for_timeout(600)
        got = pg.locator(".verdict").count()
        ok(f"{label}：{taps} 下出答案（预算 ≤{budget}）", got == 1 and taps <= budget,
           f"点了 {taps} 下，结论卡 {got} 个")
        return taps

    R2 = {'2':0,'3':1,'4':2,'5':3,'6':4,'7':5,'8':6,'9':7,'T':8,'J':9,'Q':10,'K':11,'A':12}
    Su2 = {'s':0,'h':1,'d':2,'c':3}
    # 吹牛骰子：5 颗骰 + 点数 + 个数（人数有记忆，首轮之后不用点）
    count_taps("/#dice",
        [f'#pad button[data-v="{d}"]' for d in [5,5,5,1,2]] +
        ['#faces button[data-f="5"]', '#counts button[data-c="4"]'], 7, "吹牛骰子")
    # 德州：同花两张手牌 = 花色1下 + 点数2下
    count_taps("/#holdem",
        [f'#hp-suits button[data-s="{Su2["s"]}"]',
         f'#hp-ranks button[data-r="{R2["A"]}"]', f'#hp-ranks button[data-r="{R2["K"]}"]'], 3, "德州(同花手牌)")
    # 21点：庄家明牌 + 两张自己的牌
    count_taps("/#bj",
        ['#up button[data-v="10"]', '#pad button[data-v="10"]', '#pad button[data-v="6"]'], 3, "21点")
    # 24点：四张牌
    count_taps("/#p24", [f'#pad button[data-v="{n}"]' for n in [3,8,3,8]], 4, "24点")
    # 德州：整手牌录完为止，选牌键盘必须始终够得着（吸底）。
    # 实测过没吸底时录完两张手牌键盘就掉到 710px，而 iPhone SE 只有 667px。
    pg.goto(BASE + "/#holdem", wait_until="networkidle")
    pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
    worst = 0
    for su, rk in [("s","A"),("s","K"),("h","Q"),("d","J"),("c","9"),("s","2"),("h","3")]:
        pg.click(f'#hp-suits button[data-s="{Su2[su]}"]')
        pg.click(f'#hp-ranks button[data-r="{R2[rk]}"]')
        pg.wait_for_timeout(120)
        bb = pg.locator("#hp-ranks").bounding_box()
        worst = max(worst, bb["y"] + bb["height"])
    ok(f"德州：录满 7 张牌全程键盘不出首屏（最低 {worst:.0f} ≤ 667）", worst <= 667,
       "中途要滚动才够得着键盘")
    # 固定底栏会盖住结论卡下半截（实测压掉 7px，文字被切一半，看着像坏了）。
    # 每次出结果后自动把结论卡滚到键盘之上，两者必须同时完整可见。
    ov = pg.evaluate("""() => { const v=document.querySelector('.verdict'), d=document.querySelector('.dock');
        const vb=v.getBoundingClientRect(), db=d.getBoundingClientRect();
        return [Math.round(vb.top), Math.round(vb.bottom), Math.round(db.top)]; }""")
    ok(f"德州：结论卡完整露在键盘之上（卡 {ov[0]}~{ov[1]}，键盘顶 {ov[2]}）",
       ov[1] <= ov[2] and ov[0] >= 0, "结论卡被固定键盘压住或滚出了顶部")
    dis = pg.evaluate("() => [...document.querySelectorAll('#hp-ranks button')].filter(b=>b.disabled).length")
    ok("德州：录满 7 张后键盘没有被整片禁用（骰子/24点踩过同样的坑）", dis==0, f"{dis} 个按钮被 disable")
    pg.click(f'#hp-ranks button[data-r="{R2["5"]}"]'); pg.wait_for_timeout(300)
    ok("德州：满了再点一张 = 开新一手", pg.locator('#hole .pcard[data-c]').count()==1
       and pg.locator('#board .pcard[data-c]').count()==0,
       f"手牌 {pg.locator('#hole .pcard[data-c]').count()} 张，公共牌 {pg.locator('#board .pcard[data-c]').count()} 张")
    pg.screenshot(path=str(SHOTS/"92_holdem_dock.png"))

    # M1：德州「该不该跟」必须和大字同框可见（原来在 note 里被吸底键盘整段遮住，
    # 四张截图里一次都没出现）。
    pg.goto(BASE + "/#holdem", wait_until="networkidle")
    pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
    for su, rk in [("s","A"),("s","K"),("h","Q"),("d","J"),("c","9")]:
        pg.click(f'#hp-suits button[data-s="{Su2[su]}"]'); pg.click(f'#hp-ranks button[data-r="{R2[rk]}"]')
    pg.wait_for_timeout(700)
    vtxt = pg.inner_text(".verdict")
    ok("德州：「跟才不亏」在结论卡内", "跟才不亏" in vtxt or "怎么跟都不亏" in vtxt, vtxt[:120])
    geo = pg.evaluate("""() => { const els=[...document.querySelectorAll('.verdict .vwhy')];
        const t=els.find(e=>/跟才不亏|怎么跟都不亏/.test(e.innerText));
        if(!t) return null; const b=t.getBoundingClientRect(), d=document.querySelector('.dock').getBoundingClientRect();
        return [Math.round(b.top), Math.round(b.bottom), Math.round(d.top)]; }""")
    ok(f"德州：该句不被吸底键盘遮住（{geo}）", geo is not None and geo[1] <= geo[2] and geo[0] >= 0)

    # 「该不该跟」这句在整个胜率区间上都不能出胡话。
    # 曾经在 95.3%~99.9% 区间输出「至少要有你跟注额的 0.0 倍」——单点测试测不出，
    # 只有扫整个区间才抓得到。这里直接在页面上下文里跑那段措辞逻辑。
    bad = pg.evaluate("""() => {
      function say(e){
        if (e > 0.999) return '这手基本必赢，怎么跟都不亏。';
        var m = 1/e - 1;
        if (m < 0.05) return '这手赢面极大，底池里随便有点钱，跟就不亏。';
        return '底池至少要有你跟注额的 ' + m.toFixed(m < 1 ? 2 : 1) + ' 倍，跟才不亏。';
      }
      const bad = [];
      for (let i = 1; i <= 2000; i++) {
        const e = i / 2000, t = say(e);
        if (/的 0(\.0+)? 倍/.test(t) || /NaN|Infinity|undefined/.test(t)) bad.push([e, t]);
      }
      return bad.slice(0, 3);
    }""")
    ok("德州：「该不该跟」在整个胜率区间都不出胡话（0.0倍/NaN/Infinity）", not bad, str(bad))

    # M2：Hi-Lo 归零是全站唯一误触后不可恢复的操作，必须两段确认
    pg.goto(BASE + "/#bj", wait_until="networkidle")
    pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
    for c in [2,3,4,5,6]: pg.click(f'#count button[data-cv="{c}"]')
    ok("Hi-Lo：先记 5 张小牌 → 流水 +5", "+5" in pg.locator('.stat:has-text("流水计数") .v').inner_text())
    pg.click("#reset"); pg.wait_for_timeout(80)
    ok("Hi-Lo：第一次点归零只是进入确认态，流水不变",
       pg.locator('.stat:has-text("流水计数") .v').inner_text() == "+5"
       and "确定" in pg.inner_text("#reset"), pg.inner_text("#reset"))
    # 武装后 400ms 内的点击被防抖挡掉（防连撤时误触抹掉整靴计数），所以要等过去
    pg.wait_for_timeout(500)
    pg.click("#reset"); pg.wait_for_timeout(80)
    ok("Hi-Lo：等过防抖后第二次点才真归零", pg.locator('.stat:has-text("流水计数") .v').inner_text() == "0")
    # 补记点错了要能撤回来（原来无征兆也不可恢复）
    for c in [2,3,10]: pg.click(f'#count button[data-cv="{c}"]')
    ok("Hi-Lo：记了 +1+1-1 → 流水 +1", pg.locator('.stat:has-text("流水计数") .v').inner_text() == "+1",
       pg.locator('.stat:has-text("流水计数") .v').inner_text())
    pg.click("#undoCount"); pg.wait_for_timeout(60)
    ok("Hi-Lo：撤一张 → 流水回到 +2", pg.locator('.stat:has-text("流水计数") .v').inner_text() == "+2",
       pg.locator('.stat:has-text("流水计数") .v').inner_text())
    for _ in range(5): pg.click("#undoCount")
    pg.wait_for_timeout(60)
    ok("Hi-Lo：撤到底不会撤成负数或报错",
       pg.locator('.stat:has-text("流水计数") .v').inner_text() == "0"
       and "共记录 0 张" in pg.inner_text("#cinfo"), pg.inner_text("#cinfo")[:60])
    # 归零武装后 400ms 内的点击不执行：连撤多张时一记快拍会把整靴计数抹掉，
    # 而武装时按钮文字变宽会 reflow，把"确定归零？"推到刚才手指的落点下。
    for c in [2,3,4]: pg.click(f'#count button[data-cv="{c}"]')
    before = pg.locator('.stat:has-text("流水计数") .v').inner_text()
    pg.evaluate("() => { const b=document.getElementById('reset'); b.click(); b.click(); }")
    pg.wait_for_timeout(80)
    ok(f"Hi-Lo：快速连点归零不清零（流水仍 {before}）",
       pg.locator('.stat:has-text("流水计数") .v').inner_text() == before,
       pg.locator('.stat:has-text("流水计数") .v').inner_text())
    pg.wait_for_timeout(500)
    pg.click("#reset"); pg.wait_for_timeout(80)
    ok("Hi-Lo：间隔 >400ms 的第二次点击正常清零",
       pg.locator('.stat:has-text("流水计数") .v').inner_text() == "0")

    # 「记完这手」之后，真数必须完整露在 dock 之上（原来 scrollIntoView 对不齐 fixed dock）
    pg.goto(BASE + "/#bj", wait_until="networkidle")
    pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
    pg.click('#up button[data-v="10"]')
    for c in [10, 6]: pg.click(f'#pad button[data-v="{c}"]')
    pg.wait_for_timeout(200)
    pg.click("#tally"); pg.wait_for_timeout(250)
    tg = pg.evaluate("""() => { const c=document.getElementById('cinfo'), d=document.querySelector('.dock');
        const cb=c.getBoundingClientRect(), db=d.getBoundingClientRect();
        return [Math.round(cb.top), Math.round(cb.bottom), Math.round(db.top)]; }""")
    ok(f"21点：记完这手后真数完整露在键盘之上（{tg[0]}~{tg[1]}，键盘顶 {tg[2]}）",
       tg[1] <= tg[2] and tg[0] >= 0, "真数骑在键盘上沿或被遮住")
    # 手动往下滚过之后再 tally，不能把用户拉回去
    pg.evaluate("() => document.scrollingElement.scrollTop += 60")
    before_top = pg.evaluate("() => document.scrollingElement.scrollTop")
    pg.click('#up button[data-v="6"]')
    for c in [9]: pg.click(f'#pad button[data-v="{c}"]')
    pg.click("#tally"); pg.wait_for_timeout(250)
    after_top = pg.evaluate("() => document.scrollingElement.scrollTop")
    ok(f"21点：tally 只往下补、不把手动滚出来的位置拉回去（{before_top}→{after_top}）",
       after_top >= before_top - 1)

    # 「记完这手」要在 dock 里（原来在 y≈80 换手区最深处）
    ok("21点：「记完这手」在吸底键盘内",
       pg.evaluate("() => !!document.querySelector('.dock #tally')"))

    # S2：推荐斋叫时输出侧要标出来
    pg.goto(BASE + "/#dice", wait_until="networkidle")
    pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
    pg.click('#players button[data-n="8"]'); pg.click("#clr")
    for d in [1,1,1,2,3]: pg.click(f'#pad button[data-v="{d}"]')
    pg.click('#faces button[data-f="4"]'); pg.click('#counts button[data-c="14"]')
    pg.wait_for_timeout(1200)
    act = pg.inner_text(".vact")
    if "个" in act and pg.locator('.vact svg').get_attribute("aria-label") == "1点":
        ok("骰子：推荐斋叫时大字带「斋」标注", "斋" in act, f"大字是 {act!r}")
    else:
        ok("骰子：该局面未推荐斋叫（跳过 S2 检查）", True)

    # 第二轮：骰子的"下一轮"应该只花 1 下就回到可输入状态
    pg.goto(BASE + "/#dice", wait_until="networkidle")
    pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
    for d in [5,5,5,1,2]: pg.click(f'#pad button[data-v="{d}"]')
    pg.click('#faces button[data-f="5"]'); pg.click('#counts button[data-c="4"]')
    pg.click("#nextRound"); pg.wait_for_timeout(120)
    ok("吹牛骰子：一下「下一轮」即回到可输入状态（人数保留）",
       pg.locator('#pad button[data-v]').count() == 6 and pg.locator("#tray .slot").count() == 0
       and pg.locator('#players button.on').inner_text() == "3")

    # ── 7. 触控目标 / PWA / 离线 ─────────────────────────────────
    print("\n【7】触控目标 · PWA · 离线")
    small_all=[]
    for tid,_ in [("","")]+TOOLS:
        pg.goto(BASE+("/#"+tid if tid else "/"), wait_until="networkidle"); pg.wait_for_timeout(80)
        small = pg.evaluate("""() => { const bad=[];
          document.querySelectorAll('button,.slot,.act,.pcard[data-c]').forEach(el=>{
            const r=el.getBoundingClientRect();
            if(r.width && (r.width<38||r.height<38)) bad.push(`${el.className||el.tagName}:${Math.round(r.width)}x${Math.round(r.height)}`);
          }); return bad; }""")
        small_all += small
    ok("所有可点元素 ≥38px", not small_all, "; ".join(sorted(set(small_all))[:5]))
    for path, needle in [("/manifest.webmanifest",'"short_name"'),("/sw.js","addEventListener"),
                         ("/icon-180.png",None),("/icon-512.png",None)]:
        r = pg.request.get(BASE+path)
        ok(f"{path} 可取回 ({r.status})", r.status==200 and (needle is None or needle in r.text()))
    pg.goto(BASE, wait_until="networkidle")
    ok("Service Worker 已注册", bool(pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!r)")))

    # ── 8. 首屏可见性 ────────────────────────────────────────────
    print("\n【8】iPhone SE 首屏：输入完就该看见结论")
    pg.goto(BASE+"/#dice", wait_until="networkidle"); pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
    pg.click('#players button[data-n="3"]')
    for d in [5,5,5,1,2]: pg.click(f'#pad button[data-v="{d}"]')
    pg.click('#faces button[data-f="5"]'); pg.click('#counts button[data-c="4"]')
    pg.wait_for_timeout(120)
    b = pg.locator(".verdict").bounding_box()
    ok(f"骰子结论卡完整在首屏内 (bottom={b['y']+b['height']:.0f} ≤ 667)", b["y"]+b["height"] <= 669)
    pg.screenshot(path=str(SHOTS/"90_firstscreen_dice.png"))

    # 德州：结论卡曾经在选牌键盘下面，iPhone SE 上要滚动才看得到
    pg.goto(BASE+"/#holdem", wait_until="networkidle"); pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
    pick(pg, ["As","Ah"]); pg.wait_for_timeout(400)
    bb = pg.locator(".verdict").bounding_box()
    ok(f"德州结论卡顶部在首屏内 (top={bb['y']:.0f} < 667)", bb["y"] < 667, "要滚动才看得到胜率")
    ok("德州：结论卡排在选牌键盘之上",
       bb["y"] < pg.locator("#hp-suits").bounding_box()["y"])
    pg.screenshot(path=str(SHOTS/"91_firstscreen_holdem.png"))

    # 24点：选满后键盘不许变成一片灰死按钮（骰子那边踩过同样的坑）
    pg.goto(BASE+"/#p24", wait_until="networkidle"); pg.evaluate("localStorage.clear()"); pg.reload(wait_until="networkidle")
    for n in [3,8,3,8]: pg.click(f'#pad button[data-v="{n}"]')
    pg.wait_for_timeout(200)
    dis = pg.evaluate("""() => [...document.querySelectorAll('#pad button')].filter(b=>b.disabled).length""")
    ok("24点：选满四张后键盘没有被整片禁用", dis==0, f"{dis} 个按钮被 disable")
    pg.click('#pad button[data-v="5"]'); pg.wait_for_timeout(200)
    ok("24点：满了再点一张 = 开新一组",
       pg.locator("#slots .pcard[data-i]").count()==1, 
       f"槽位里有 {pg.locator('#slots .pcard[data-i]').count()} 张")

    # 首页标题不许出现两遍
    pg.goto(BASE, wait_until="networkidle")
    ok("首页 header 标题为空（避免与 hero 重复）", pg.inner_text("#title").strip()=="",
       f"header 显示 {pg.inner_text('#title')!r}")
    ok("首页 hero 标题在", "酒桌工具箱" in pg.inner_text(".hero h2"))
    # 曾经 CSS 写 .t-24 而实际 class 是 t-p24，导致那块没色条、图标不上色。
    # 断言全绿但肉眼一看就不对 —— 所以把"每块都有各自的强调色"变成可测的。
    stripes = pg.evaluate("""() => [...document.querySelectorAll('.tile')].map(t => ({
        cls: t.className,
        bar: getComputedStyle(t,'::after').backgroundColor,
        ic:  getComputedStyle(t.querySelector('.ic')).color }))""")
    ok("四块磁贴各有色条", len(set(x["bar"] for x in stripes))==4,
       "; ".join(f'{x["cls"]}:{x["bar"]}' for x in stripes))
    ok("四块磁贴图标各有颜色", len(set(x["ic"] for x in stripes))==4,
       "; ".join(f'{x["cls"]}:{x["ic"]}' for x in stripes))
    ok("没有磁贴的色条是透明/未设置",
       all(x["bar"] not in ("rgba(0, 0, 0, 0)","transparent") for x in stripes),
       "; ".join(f'{x["cls"]}:{x["bar"]}' for x in stripes))
    pg.screenshot(path=str(SHOTS/"00_home.png"))

    ctx.close(); br.close()

httpd.shutdown()
print("\n"+"="*66)
print(f"  浏览器验收: 通过 {PASS} / 失败 {FAIL}   截图 → {SHOTS}")
if fails: print("  失败: " + " | ".join(fails[:8]))
sys.exit(1 if FAIL else 0)
