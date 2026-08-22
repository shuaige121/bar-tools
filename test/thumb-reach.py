# -*- coding: utf-8 -*-
"""拇指可达性实测。iPhone SE 667px 单手持握：
   0~200 需换手 / 200~450 需伸展 / 450~667 自然拇指区。
   高频操作应落在自然区，破坏性操作不该落在自然区（防误触）。"""
import threading, http.server, socketserver, functools, pathlib
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parent.parent/"site"
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
h=socketserver.TCPServer(("127.0.0.1",8797), functools.partial(Q,directory=str(SITE)))
threading.Thread(target=h.serve_forever,daemon=True).start()
B="http://127.0.0.1:8797"
R={'2':0,'3':1,'4':2,'5':3,'6':4,'7':5,'8':6,'9':7,'T':8,'J':9,'Q':10,'K':11,'A':12}
SU={"s":0,"h":1,"d":2,"c":3}

VH = 667
def zone(y):
    if y > VH: return "屏幕外"
    # 按视口高度比例划分：顶 30% 换手，中 30% 伸展，底 40% 拇指自然区
    if y < VH*0.30: return "换手区"
    if y < VH*0.62: return "伸展区"
    return "拇指区"

SCEN = [
  ("吹牛骰子","#dice",
   lambda p:[p.click(f'#pad button[data-v="{d}"]') for d in [5,5,5,1,2]] +
            [p.click('#faces button[data-f="5"]'), p.click('#counts button[data-c="4"]')],
   {"#pad":"骰子键盘(高频·每轮5下)", "#faces":"点数(高频)", "#counts":"个数(高频)",
    "#clr":"清空(破坏性)", "#players":"人数(低频·有记忆)", "#firstBtn":"我先叫(低频)"}),
  ("德州扑克","#holdem",
   lambda p:[ (p.click(f'#hp-suits button[data-s="{SU[s]}"]'), p.click(f'#hp-ranks button[data-r="{R[r]}"]'))
              for s,r in [("s","A"),("s","K"),("h","Q"),("d","J"),("c","9")]],
   {"#hp-ranks":"点数键盘(高频·每张1下)", "#hp-suits":"花色(高频)",
    "#clr":"全部清空(破坏性)", "#undo":"退一张(纠错)", "#opps":"对手数(低频·有记忆)"}),
  ("21点","#bj",
   lambda p:[p.click('#up button[data-v="10"]'), p.click('#pad button[data-v="10"]'), p.click('#pad button[data-v="6"]')],
   {"#pad":"我的牌键盘(高频)", "#up":"庄家明牌(高频·每手1下)",
    # 对记牌的人这是每手 1 下 —— 按高频算，不是中频
    "#tally":"记完这手(高频·记牌者每手1下)", "#clr":"清空(破坏性)",
    "#undoCount":"撤一张(纠错)", "#count":"Hi-Lo键盘(中频·可选功能)"}),
  ("24点","#p24",
   lambda p:[p.click(f'#pad button[data-v="{n}"]') for n in [3,8,3,8]],
   {"#pad":"牌面键盘(高频·每组4下)", "#clr":"清空(破坏性)"}),
]
with sync_playwright() as pw:
    br=pw.chromium.launch()
    import sys
    W,H=(int(sys.argv[1]),int(sys.argv[2])) if len(sys.argv)>2 else (375,667)
    globals()['VH']=H
    print(f"视口 {W}×{H}   换手区<{int(H*0.30)}  伸展区<{int(H*0.62)}  拇指区≥{int(H*0.62)}")
    c=br.new_context(viewport={"width":W,"height":H},is_mobile=True,has_touch=True)
    p=c.new_page()
    warn=[]
    for name,h2,act,elems in SCEN:
        p.goto(B+"/"+h2, wait_until="networkidle"); p.evaluate("localStorage.clear()")
        p.reload(wait_until="networkidle"); p.wait_for_timeout(150)
        act(p); p.wait_for_timeout(700)
        print(f"\n{name}（已录入到出结果的状态）")
        for sel,label in elems.items():
            bb=p.locator(sel).bounding_box()
            if not bb: print(f"   {label:26} (不可见)"); continue
            mid=bb['y']+bb['height']/2
            z=zone(mid)
            flag=""
            if "高频" in label and z in ("换手区","屏幕外"): flag=f" ⚠️ 高频却在{z}"; warn.append(f"{name}:{label}({z})")
            if "中频" in label and z=="屏幕外": flag=" ⚠️ 要滚动才够得着"; warn.append(f"{name}:{label}(屏幕外)")
            if "破坏性" in label and z=="拇理区": pass
            if "破坏性" in label and z=="拇指区": flag=" ⚠️ 破坏性操作在拇指区(易误触)"; warn.append(f"{name}:{label}")
            print(f"   {label:26} y={mid:5.0f}  {z}{flag}")
    print("\n" + ("⚠️  " + "; ".join(warn) if warn else "✅ 没有「高频操作够不着」或「破坏性操作落在拇指区」的情况"))
    h.shutdown(); c.close(); br.close()
import sys as _s
_s.exit(1 if warn else 0)
