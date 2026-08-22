仍不可放行：阻塞项是第（3）条的浏览器闸门仍可因错误理由通过——内存中把“有加注可选”局面的 `firstCI` 置空后，页面误称“叫到顶”，现有 6 个相关浏览器断言仍全部通过；第（1）条的当前行为与 `analyze()` 黑盒闸门已解决，第（2）条维持解除。

# 吹牛骰子引擎第六轮定向复验（Codex）

日期：2026-08-22  
范围：只裁定题述三条及本轮新闸门。未修改 `src/`、`test/`、`site/`，未 commit，未部署；本文件是我唯一的项目内写入。目录没有 `.git`，`git status --short --branch` 实际返回 `fatal: not a git repository`。

> 快照说明：评审进行中，另一进程在我报出闸门反例后更新了 `src/engine-dice.js`、`src/app.js`、`test/verify-dice.js`、`test/browser.py` 和构建后的 `site/index.html`。我没有覆盖这些改动，等 fault-injection 锁自然释放后重跑了最终快照。下面的最终裁定针对文末哈希，不是中途快照。

## 裁定摘要

| 项目 | 当前行为 | 闸门 | 裁定 |
|---|---|---|---|
| 1. `seed=2111` / 再找淘汰反例 | `6个4` 已进决赛圈；48 局面 × 500 种子未找到新反例 | 最终快照已增加对抗种子经 `E.analyze()` 的黑盒断言；只把真实淘汰退回 `250+3σ` 的内存变异会精确报错 | **解决** |
| 2. N=2 `pTrueIfChallenged` | 仍与 2-ply `evRaise` 逐位相等，与 `immediateStats` 对照确实不同 | 字段断言和反向对照均通过 | **继续解除** |
| 3. 推荐“开”时 CI | 有加注时显示有限 `±1.3`；只有“开”时不再显示虚假模拟数或 `±—` | **阻塞**：“有加注”分支只断言无坏 token+确实推荐开，不断言存在有限 CI；`firstCI=null` 变异下所有相关断言仍绿 | 行为已修，回归闸门未闭环 |

## 1. 主验证

题述快照上我实际运行了：

```bash
node test/verify-dice.js
```

当时实际输出为：

```text
================================================================
  通过 201 / 失败 0
  全部通过
NODE_EXIT=0
LOCK_AFTER=absent
```

并发更新增加 6 条断言后，我在锁不存在时又对最终快照重跑了同一命令：

```text
  ✅ 叫到顶：只有「开」一个动作
  ✅ 叫到顶：决赛圈为空
  ✅ 叫到顶：报告的模拟次数为 0（实得 0）
  ✅ 叫到顶：没有任何动作带 evCI
  ✅ 对照：正常局面照常报模拟次数（6000）且有 CI
...
================================================================
  通过 207 / 失败 0
  全部通过
NODE_EXIT=0
LOCK_AFTER=absent
```

第一次取证时，我的 zsh 包装命令曾误用只读变量名 `status`，导致包装层返回 1；Node 本体已打印 `201/0`。上述 `NODE_EXIT=0` 是改用 `rc` 后的干净重跑，该包装问题与项目无关。

## 2. 第（1）条：当前行为与黑盒闸门都已解决

### 2.1 `seed=2111` 独立复验

下面复现在我原子创建 `.fault-injection.lock` 后运行，结束时删除的是自己创建的锁；因此不会与磁盘注入并发。

```bash
node <<'NODE'
const fs=require('fs');
let fd;
try { fd=fs.openSync('.fault-injection.lock','wx'); fs.writeFileSync(fd,String(process.pid)); }
catch (e) { console.error('ABORT: lock present'); process.exit(73); }
try {
  const E=require('./src/engine-dice.js');
  const hand=[4,6,4,4,1], N=3, seed=2111;
  const universe=E.legalRaises(null,N,true,5);
  const truth=[73129,19088743,324508639].map(sd=>{
    const xs=universe.map(b=>({b,ev:E.rolloutEV(b,hand,N,true,5,30000,sd)}))
                     .sort((a,b)=>b.ev-a.ev);
    return {seed:sd,best:xs[0],runnerUp:xs[1]};
  });
  const r=E.analyze({hand,players:N,bid:null,wild:true,dicePerPlayer:5,seed});
  console.log(JSON.stringify({ELIM:E.ELIM,truth,analyze:{best:r.best.bid,
    finalists:r.finalists.length,
    has6x4:r.finalists.some(b=>b.count===6&&b.face===4),sims:r.sims}},null,2));
} finally {
  try { fs.closeSync(fd); } catch(e) {}
  try { fs.unlinkSync('.fault-injection.lock'); } catch(e) {}
}
NODE
```

实际关键输出：

```text
ELIM: { coarse:350, bands:[4.5,3.5,3] }
truth seed=73129:     best=6个4 0.768633, runner-up=5个4 0.751333
truth seed=19088743:  best=6个4 0.764600, runner-up=5个4 0.751767
truth seed=324508639: best=6个4 0.766600, runner-up=5个4 0.755100
analyze: { best:{count:5,face:4}, finalists:13, has6x4:true, sims:3462 }
LOCK_AFTER=absent
```

三条未在新测试中使用的 30,000 局真值流都把 `6个4` 排在全部合法加注的第一。生产最终推荐 `5个4` 不影响本条性质：真最优 `6个4` 已进入决赛圈。

### 2.2 再找反例：48 局面 × 500 种子，未找到

我用固定 PRNG 生成 48 个非题述局面，来自 N=3..8、飞/不飞、开局/跟叫。跟叫局只保留默认分析仍建议加注的局面，避免在“开明显更优”时把某个无关加注称为产品真最优。每局先用两条各 5,000 局独立流定位最优加注，再扫 500 个生产种子，同时检查 350 局/4.5σ 首轮和 1,400 局/3.5σ 第二轮。

完整可运行脚本（实测约 193 秒）：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
let s=0x6c8e9cf5|0;
function rnd(){s^=s<<13;s^=s>>>17;s^=s<<5;s|=0;return(s>>>0)/4294967296}
function same(a,b){return a.count===b.count&&a.face===b.face}
function label(c){return `${c.N}p ${c.wild?'wild':'plain'} hand=[${c.hand}] bid=${c.bid?c.bid.count+'x'+c.bid.face:'null'}`}
const cases=[];
while(cases.length<48){
  const N=3+(rnd()*6|0),wild=rnd()<.72,hand=Array.from({length:5},()=>1+(rnd()*6|0));
  let bid=null;
  if(cases.length%3!==0){
    const T=N*5,face=1+(rnd()*6|0),p=wild&&face!==1?1/3:1/6;
    const center=Math.max(1,Math.round(T*p));
    bid={count:Math.max(1,Math.min(T-1,center-2+(rnd()*7|0))),face};
  }
  const cands=E.candidateRaises(bid,hand,N,wild,5); if(cands.length<2)continue;
  let target=null,best=-1;
  for(const b of cands){
    const v=(E.rolloutEV(b,hand,N,wild,5,5000,0x13579bdf)+
             E.rolloutEV(b,hand,N,wild,5,5000,0x2468ace0))/2;
    if(v>best){best=v;target=b}
  }
  const prod=E.analyze({hand,players:N,bid,wild,dicePerPlayer:5,seed:20260822});
  if(bid&&prod.best.kind==='challenge')continue;
  cases.push({N,wild,hand,bid,cands,target,truth:best});
}
const n1=E.ELIM.coarse,n2=n1*4,se1=Math.sqrt(.25/n1),se2=Math.sqrt(.25/n2);
let checked=0,firstCuts=0,secondCuts=0,counter=null;
let closest1={margin:-Infinity},closest2={margin:-Infinity};
for(const c of cases){
  const faceC=c.cands.filter(b=>b.face===c.target.face);
  for(let seed=1;seed<=500;seed++){
    checked++;
    const r1=faceC.map(b=>({b,v:E.rolloutEV(b,c.hand,c.N,c.wild,5,n1,seed)}));
    const top1=Math.max(...r1.map(x=>x.v)),tv1=r1.find(x=>same(x.b,c.target)).v;
    const m1=top1-E.ELIM.bands[0]*se1-tv1;
    if(m1>closest1.margin)closest1={margin:m1,seed,state:label(c),target:c.target};
    if(m1>0){
      firstCuts++;
      const a=E.analyze({hand:c.hand,players:c.N,bid:c.bid,wild:c.wild,dicePerPlayer:5,seed});
      if(!a.finalists.some(b=>same(b,c.target))){counter={round:1,...closest1};break}
    }
    const surv1=r1.filter(x=>x.v>=top1-E.ELIM.bands[0]*se1).map(x=>x.b);
    if(!surv1.some(b=>same(b,c.target)))continue;
    const r2=surv1.map(b=>({b,v:E.rolloutEV(b,c.hand,c.N,c.wild,5,n2,seed+7919)}));
    const top2=Math.max(...r2.map(x=>x.v)),tv2=r2.find(x=>same(x.b,c.target)).v;
    const m2=top2-E.ELIM.bands[1]*se2-tv2;
    if(m2>closest2.margin)closest2={margin:m2,seed,state:label(c),target:c.target};
    if(m2>0){
      secondCuts++;
      const a=E.analyze({hand:c.hand,players:c.N,bid:c.bid,wild:c.wild,dicePerPlayer:5,seed});
      if(!a.finalists.some(b=>same(b,c.target))){counter={round:2,...closest2};break}
    }
  }
  if(counter)break;
}
console.log({cases:cases.length,seedsPerCase:500,checks:checked,firstCuts,secondCuts,
  counter,closestFirst:{...closest1,margin:+closest1.margin.toFixed(6)},
  closestSecond:{...closest2,margin:+closest2.margin.toFixed(6)}});
NODE
```

实际摘要：

```text
cases: 48
seedsPerCase: 500
checks: 24000
firstCuts: 0
secondCuts: 0
counter: null
closestFirst:  margin=-0.057410 seed=420 state="6p plain hand=[4,3,6,5,2] bid=null" target=4个6
closestSecond: margin=-0.028199 seed=181 state="6p plain hand=[4,3,6,5,2] bid=null" target=4个6
real 192.92
```

`margin = cutoff - targetScore`，负数表示保留。这是有限经验扫描，不是“永远不会误删”的概率证明；按题意，本轮没有找到可报告的新种子+局面反例。

### 2.3 `ELIM` 参数闸门已改为真黑盒

中途快照的对抗种子只从 `E.ELIM` 读值后手工重算 cutoff，不经 `analyze()`。当时只把生产应用点改回 `250+3σ`、保留 `E.ELIM` 导出值时，测试确实会 `201/0`。

最终快照已加入 `seed=2111/3591/... -> E.analyze() -> r.finalists` 的黑盒断言。我对同一生产脱钩变异重跑 207 条，现在会准确转红：

```text
MUTANT exportedELIM={coarse:350,bands:[4.5,3.5,3]} has6x4=false
❌ 黑盒：对抗种子经过 analyze() 后真最优仍在决赛圈
   seed=2111：真最优 6个4 不在 analyze() 的决赛圈里（决赛圈 12 个）
通过 206 / 失败 1
失败项: 黑盒：对抗种子经过 analyze() 后真最优仍在决赛圈
NODE_EXIT=1
LOCK_AFTER=absent
```

可运行变异：

```bash
node <<'NODE'
const fs=require('fs'),path=require('path'),Module=require('module');
const ep=path.resolve('src/engine-dice.js'),vp=path.resolve('test/verify-dice.js');
let src=fs.readFileSync(ep,'utf8');
for(const [from,to] of [
 ['var coarse = opts.coarseSims == null ? ELIM_COARSE : opts.coarseSims;',
  'var coarse = opts.coarseSims == null ? 250 : opts.coarseSims;'],
 ['var surv = [], rounds = [coarse, coarse * 4, coarse * 16], bands = ELIM_BANDS;',
  'var surv = [], rounds = [coarse, coarse * 4, coarse * 16], bands = [3, 3, 3];']]){
  if(src.split(from).length-1!==1)throw new Error('mutation match count != 1');
  src=src.replace(from,to);
}
const m=new Module(ep,module);m.filename=ep;m.paths=Module._nodeModulePaths(path.dirname(ep));m._compile(src,ep);
const r=m.exports.analyze({hand:[4,6,4,4,1],players:3,bid:null,wild:true,dicePerPlayer:5,seed:2111});
console.log('MUTANT',{exportedELIM:m.exports.ELIM,
  has6x4:r.finalists.some(b=>b.count===6&&b.face===4)});
const old=Module._load;
Module._load=function(req,parent,isMain){
  if(Module._resolveFilename(req,parent,isMain)===ep)return m.exports;
  return old.apply(this,arguments);
};
require(vp);
NODE
```

## 3. 第（2）条：继续解除

独立对账：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js'),hand=[4,2,5,4,3];
const r=E.analyze({hand,players:2,bid:{count:1,face:2},wild:true});
const a=r.actions.find(x=>x.kind==='raise');
const model=E.evRaise(a.bid,hand,2,true,5,E.DEFAULTS);
const rollout=E.immediateStats(a.bid,hand,2,true,5);
console.log({bid:a.bid,output:[a.pChallenged,a.pTrueIfChallenged],
  model:[model.pChallenged,model.pTrueIfChallenged],
  rollout:[rollout.pChallenged,rollout.pTrueIfChallenged]});
NODE
```

实际输出：

```text
bid: { count:2, face:4 }
output:  [0.020924359910855103, 1]
model:   [0.020924359910855103, 1]
rollout: [0, null]
```

当前两个字段均与产生 N=2 EV 的 2-ply 模型同源，对照又能证明两套模型在该局面确实不同。维持第五轮“已解除”的裁定。

## 4. 第（3）条：当前 UI 正确，但浏览器闸门仍阻塞

### 4.1 两个“开”分支的实际页面都已正确

我用最终 `site/index.html` 启动本地 HTTP 服务，在 headless Chromium 中通过真实点击录入。

有加注备选：N=3，手牌 `[2,3,4,5,2]`，上家 `8个6`：

```text
推荐: 开 他！
说明: 条形 = 本轮不喝的概率：把这一注固定住，用建模的对手把这一轮真打完 6,000 遍数出来的（±1.3 个百分点）。
badTokens: []
```

challenge-only：N=3，手牌 `[1,2,3,4,5]`，上家 `15个6`：

```text
推荐: 开 他！
说明: 这注已经叫到顶了，除了开没有别的合法选择。「开」那一行是精确概率，没有模型成分。
badTokens: []
```

引擎在第二局也已如实返回 `candidates=0, finalists=0, sims=0`；`src/app.js` 与已构建的 `site/index.html` 内联版本一致，没有 src/site 断层。

### 4.2 确定闸门反例：有加注时丢掉 CI，相关断言仍全绿

当前 `test/browser.py` 对 `8个6` 只检查：

1. 页面不含 `NaN|undefined|Infinity`；
2. 确实推荐“开”。

新增的叫到顶局面又检查了 4 条：不虚报模拟、不显示 `±—`、文案含“叫到顶”、仍推荐“开”。这 6 条都没有断言“存在加注时必须显示有限 CI”。

我不改磁盘文件，只在本地 HTTP 响应的 HTML 中在 `var explain;` 前注入 `firstCI = null`，然后在 Chromium 里重放两个局面并逐条计算现有断言。

可运行复现：

```bash
python3 - <<'PY'
from playwright.sync_api import sync_playwright
import functools,http.server,json,pathlib,socketserver,threading,urllib.parse
ROOT=pathlib.Path.cwd()/"site"
html=(ROOT/'index.html').read_text()
needle='      var explain;'
assert html.count(needle)==1
mutated=html.replace(needle,'      firstCI = null; // in-memory fault injection\n'+needle)
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        if urllib.parse.urlsplit(self.path).path in ('/','/index.html'):
            data=mutated.encode(); self.send_response(200)
            self.send_header('Content-Type','text/html; charset=utf-8')
            self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
        else: super().do_GET()
socketserver.TCPServer.allow_reuse_address=True
h=socketserver.TCPServer(('127.0.0.1',8798),functools.partial(H,directory=str(ROOT)))
threading.Thread(target=h.serve_forever,daemon=True).start()
def enter(pg,hand,count):
    pg.goto('http://127.0.0.1:8798/#dice',wait_until='networkidle')
    pg.evaluate('localStorage.clear()'); pg.reload(wait_until='networkidle')
    pg.click('#players button[data-n="3"]'); pg.click('#clr')
    for d in hand: pg.click(f'#pad button[data-v="{d}"]')
    pg.click('#faces button[data-f="6"]'); pg.click(f'#counts button[data-c="{count}"]')
    pg.wait_for_timeout(900)
    out=pg.inner_text('#out')
    return {'act':pg.inner_text('.vact'),'note':pg.inner_text('#out .note'),
            'bad':[x for x in ('NaN','undefined','Infinity') if x in out],'out':out}
with sync_playwright() as pw:
    br=pw.chromium.launch(); pg=br.new_page(viewport={'width':375,'height':667})
    a=enter(pg,[2,3,4,5,2],8); b=enter(pg,[1,2,3,4,5],15)
    checks={
      'open_with_raises_no_bad_tokens':not a['bad'],
      'open_with_raises_is_open':'开' in a['act'],
      'top_no_fake_sims':'遍数出来的' not in b['out'],
      'top_no_empty_ci':'±—' not in b['out'],
      'top_says_max':'叫到顶' in b['out'],
      'top_is_open':'开' in b['act'],
    }
    print(json.dumps({'mutatedHasRaisesNote':a['note'],'checks':checks,
                      'allPass':all(checks.values())},ensure_ascii=False,indent=2))
    br.close()
h.shutdown()
PY
```

实际输出：

```json
{
  "mutatedHasRaisesNote": "这注已经叫到顶了，除了开没有别的合法选择。「开」那一行是精确概率，没有模型成分。",
  "checks": {
    "open_with_raises_no_bad_tokens": true,
    "open_with_raises_is_open": true,
    "top_no_fake_sims": true,
    "top_no_empty_ci": true,
    "top_says_max": true,
    "top_is_open": true
  },
  "allPass": true
}
```

这不是未验证的怀疑：页面对“有加注”局面给出了事实错误的“叫到顶”说明，而现有 6 个相关断言确实全绿。最小闭环是：在 `8个6` 这个已知“开排第一但仍有加注备选”的局面，断言文案包含实际模拟局数，且 CI 匹配有限数（例如 `±\d+(\.\d+)?`），再用上面的 `firstCI=null` 变异证明它会转红。

## 5. 本轮其他新问题（非阻塞）

默认配置下第三个 `3.0σ` band 不可达：第二轮后若存活数 `<=8` 会立即 break；若 `>=9`，第三轮最低代价是 `9 * 5600 = 50,400 > 45,000`，也会立即 break。因此默认 UI/引擎下 `ELIM_BANDS[2]` 永远不会使用。

这不会错删候选，反而是保守地提前停止，所以不列为放行阻塞；但“带宽随三轮收窄”与实际默认控制流不符，当前种子扫描也只读了 `bands[0]`。

除这项和上述浏览器闸门缺口外，本轮没有找到其他已验证的新正确性回归。

## 6. 未运行项与最终快照

`python3 test/browser.py` **未运行**：它会删除并重写 `shots/*.png`，不是本轮三条所需的最小验证。本轮已用不写项目文件的独立 headless Chromium 重放它新增的 6 个相关断言，并做了上述反向变异。没有对其他页面断言作任何结论。

最终 SHA-256：

```text
283b81651db48c7e2b91331b99197daffe7b847b5491e584cc7953b3b0364aa7  src/engine-dice.js
8aea3c0585f3bfb172d7f1cbcc91aa1d83781da4386b19739dbe309bb822134b  src/app.js
85cab2364867dfac3fb01d941ef3336a2db98e611f8e5704a793d53a56871423  test/verify-dice.js
622c4c9fb289c8ebaeefc283d780409d345691579ade940561d947d6bf35e4d5  test/browser.py
667f79a7d3b46d05849ffeceb699eeff14ed0ded0d0389d829fedd7a9462c30e  site/index.html
```

所有会加载骰子源码的最终有效命令均在锁外运行，或像 2.1 一样先原子取得锁。评审中曾有一次命令启动时锁不存在、结束时另一进程已建锁；该次输出已丢弃并在 2.1 原子取锁后重跑。最终 `.fault-injection.lock` 为 absent。
