仍不可放行：阻塞项是（3）前端把“规则上仍有合法加注、但被 2% 候选阈值全部滤掉”的局面误称为“叫到顶、除了开没有合法选择”；（1）本轮解除。

# 吹牛骰子引擎第七轮定向复验（Codex）

日期：2026-08-22  
范围：只裁定第六轮遗留的（1）真实 `analyze()` 淘汰闭环与（3）“只有开”局面的模拟次数/文案，并继续定向搜索“真最优没进决赛圈”的反例；（2）继续解除。未修改 `src/`、`test/`、`site/`，未 commit，未部署；本文件是唯一写入。  
输入限制：题目指定先读的 `REVIEW-codex-6.md` 在当前目录及 `/Users/leonardchow/work` 下均不存在（`find ... -name REVIEW-codex-6.md` 无输出）；本轮以题目原文给出的第六轮开头结论为基线。该缺文件是取证限制，不是产品阻塞。  
仓库状态：该目录没有 `.git`，`git status --short` 实际报 `fatal: not a git repository`，因此无法提供 git diff。  
当前快照：`src/engine-dice.js` SHA-256 `283b81651db48c7e2b91331b99197daffe7b847b5491e584cc7953b3b0364aa7`；`test/verify-dice.js` `85cab2364867dfac3fb01d941ef3336a2db98e611f8e5704a793d53a56871423`；`test/fault-inject.js` `a150ef90acf4010d1d4218a7ebb70d89cdb56e1342468738f936f641d2cc109c`；`src/app.js` `8aea3c0585f3bfb172d7f1cbcc91aa1d83781da4386b19739dbe309bb822134b`；`site/index.html` `667f79a7d3b46d05849ffeceb699eeff14ed0ded0d0389d829fedd7a9462c30e`。复验结束时不存在 `.fault-injection.lock`。

## 裁定摘要

| 项目 | 裁定 | 依据 |
|---|---|---|
| （1）真实淘汰路径黑盒闭环 | **解除** | 真实 `analyze()` 断言存在且有效；4 种会破坏目标性质、但保持 `E.ELIM` 导出值不变的内存 mutant 均报警，包括题目指定的 `250+3σ` 回退 |
| （1）继续找真最优淘汰反例 | **本轮未找到** | 风险导向生成 54 个跨人数/飞与不飞/开局与中后段/完整与部分手牌的局面；集中检查 12,000 个首轮 scene-seed 与 2,400 个三轮 scene-seed，0 个疑似、0 个真实 `analyze()` 反例 |
| （3）引擎不虚报模拟次数 | **解除** | 决赛圈为空时 `sims=0`；把它内存变异回 `simsFinal` 后，207 条变为 206/1，准确报“实得 6000” |
| （3）前端“只有开”文案 | **不解除，仍是阻塞** | `wild=true` 的 `15个6` 并没有叫到顶，按引擎规则仍有 `8个1…15个1` 共 8 个合法加注；更普通的 `5个1` 也有 35 个合法加注。它们只是全被候选阈值滤掉，页面却断言“没有别的合法选择” |
| 新引入问题 | **有，属于（3）同一阻塞** | 新浏览器闸门要求 `15个6` 必须显示“叫到顶”，但未先断言 `legalRaises().length===0`，因此把错误分类固化进测试 |

## 1. 指定主验证：207 / 207

可运行：

```bash
node test/verify-dice.js
```

实际尾部输出与计时：

```text
================================================================
  通过 207 / 失败 0
  全部通过
real 9.71
user 9.71
sys 0.08
```

退出码 `0`。

## 2. （1）黑盒断言已走真实 `analyze()`，指定回退会准确报警

### 2.1 题目指定 mutant 的独立 module-loader 复现

以下只在内存编译 mutant；磁盘源码、`E.ELIM` 导出和互斥锁都不变：

```bash
node <<'NODE'
const fs = require('fs'), path = require('path'), Module = require('module');
const enginePath = path.resolve('src/engine-dice.js');
const verifyPath = path.resolve('test/verify-dice.js');
const from = 'var surv = [], rounds = [coarse, coarse * 4, coarse * 16], bands = ELIM_BANDS;';
const to = 'coarse = 250; var surv = [], rounds = [coarse, coarse * 4, coarse * 16], bands = [3.0, 3.0, 3.0];';
const original = fs.readFileSync(enginePath, 'utf8');
if (original.split(from).length - 1 !== 1) throw new Error('mutation match count != 1');

const mutant = new Module(enginePath, module);
mutant.filename = enginePath;
mutant.paths = Module._nodeModulePaths(path.dirname(enginePath));
mutant._compile(original.replace(from, to), enginePath);
console.log('mutant E.ELIM =', JSON.stringify(mutant.exports.ELIM));

const oldLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const resolved = Module._resolveFilename(request, parent, isMain);
  if (resolved === enginePath) return mutant.exports;
  return oldLoad.apply(this, arguments);
};
require(verifyPath);
NODE
```

实际关键输出：

```text
mutant E.ELIM = {"coarse":350,"bands":[4.5,3.5,3]}
❌ 黑盒：对抗种子经过 analyze() 后真最优仍在决赛圈
   seed=2111：真最优 6个4 不在 analyze() 的决赛圈里（决赛圈 12 个）
通过 206 / 失败 1
失败项: 黑盒：对抗种子经过 analyze() 后真最优仍在决赛圈
```

退出码 `1`。这证明报警来自真实 `analyze()` 结果，而不是从未改变的 `E.ELIM` 重算公式。

### 2.2 其他真实路径变异

我用同一内存 loader 另试了 4 种写法；每次打印出的导出值都仍是 `{"coarse":350,"bands":[4.5,3.5,3]}`：

| 只改运行时淘汰路径 | 实际结果 | 命中的关键断言 |
|---|---:|---|
| 局部 `bands=[3,3,3]`，不改导出 | 206/1 | 黑盒，`seed=3591` |
| 比较式直接用 `0.5*se`，不读 `bands` | 205/2 | 4 局面行为断言 + 黑盒，`seed=2111` |
| 历史回归：每点数按粗分只留前 4 | 205/2 | 自适应样本断言 + 黑盒，`seed=2111` |
| 把按点数分组误改成全点数一组 | **207/0** | 无 |

最后一种没有报警，所以答案不是“任何真实路径源码变化都会响”。但它在现有对抗局面没有淘汰真全局最优，不能只凭“实现变了”判成目标性质漏检；黑盒断言是行为锁，不是实现文本锁。题目指定的已知危险回退、收窄带宽和历史 top-4 截断均能被真实路径断言抓到，因此（1）的本轮闭环要求已满足。

有限对抗种子不可能证明所有未来 mutant 都会报警；这是测试的固有限制。本轮没有把这一点当作未验证阻塞。

## 3. （1）换采样策略继续搜索反例：未找到

这次没有再均匀做“48 局面 × 500 连续种子”，而是：

1. 确定性生成 54 个局面，覆盖 `N=3…8`、`wild=true/false`、开局/中段/偏高叫牌，以及手牌长度 `0/2/5`。
2. 对每局的**全部合法加注**各跑 3,000 局定 pilot 真值，不只看 `candidateRaises()`；54 局中真最优落在 2% 候选阈值外的次数为 0。
3. 按“真最优与同点数次优的差距”挑最脆弱的 12 局，差距范围 `0.83pp…3.93pp`。
4. 对这 12 局各扫 1,000 个 xorshift 非连续种子检查首轮，共 12,000 个 scene-seed；另各取 200 个种子按生产参数重放三轮，共 2,400 个 scene-seed。疑似一旦出现才调用真实 `analyze()` 确认。

实际输出：

```text
阶段A {"generated":54,"usable":54,"truthOutsideCandidate":0,"examples":[]}
脆弱局面 #52 N7 飞 h=[6,4] bid=8x5 truth=5x1 margin=0.83pp cands=55
#16 N7 飞 h=[3,4] bid=7x4 truth=5x1 margin=0.90pp cands=61
#28 N7 飞 h=[2,2,3,1,3] bid=7x3 truth=5x1 margin=1.00pp cands=59
...（共 12 局，最大 margin=3.93pp）
阶段B {"picked":12,"firstRoundSceneSeeds":12000,
       "fullThreeRoundSceneSeeds":2400,"suspects":0,"confirmed":null}
```

本轮扫描器的核心可运行逻辑如下；生产 `analyze()` 只用于确认疑似，避免把大部分时间花在最终精算上：

```js
function eliminatedInFace(E, scene, seed) {
  const coarse = E.ELIM.coarse;
  const rounds = [coarse, coarse * 4, coarse * 16];
  let surv = E.candidateRaises(scene.bid, scene.hand, scene.N, scene.wild, 5)
              .filter(b => b.face === scene.truth.face);
  for (let ri = 0; ri < rounds.length; ri++) {
    const n = rounds[ri];
    const scored = surv.map(b => ({
      b,
      v: E.rolloutEV(b, scene.hand, scene.N, scene.wild, 5,
                     n, (seed + ri * 7919) | 0)
    }));
    const top = Math.max(...scored.map(x => x.v));
    const cutoff = top - E.ELIM.bands[ri] * Math.sqrt(0.25 / n);
    surv = scored.filter(x => x.v >= cutoff).map(x => x.b);
    if (!surv.some(b => b.count === scene.truth.count && b.face === scene.truth.face))
      return ri + 1;
  }
  return 0;
}

// 对风险排序后的 scenes：首轮用 1000 个非连续种子，三轮用其中 200 个。
// 若 eliminatedInFace(...) 非 0，再用下面的生产路径作唯一最终裁定：
const r = E.analyze({hand:scene.hand, players:scene.N, bid:scene.bid,
                     wild:scene.wild, dicePerPlayer:5, seed});
const confirmed = !r.finalists.some(b =>
  b.count === scene.truth.count && b.face === scene.truth.face);
```

这里的三轮函数只是便宜的疑似筛选；实际结果为 `suspects=0`，没有把重算结果冒充生产路径结论。该扫描不是穷尽证明，但在本轮时限内未发现新的生产反例。

## 4. （3）引擎模拟次数已闭环

当前到顶/候选为空时：

```text
actions=[challenge], finalists=0, sims=0
```

把返回值纯内存变异为 `sims: simsFinal` 后运行主验证，实际输出：

```text
❌ 叫到顶：报告的模拟次数为 0（实得 6000）  报了 6000
通过 206 / 失败 1
失败项: 叫到顶：报告的模拟次数为 0（实得 6000）
```

因此“0 次 rollout 却报 6,000 次”的引擎回归已被按症状守住；当前页面也不再显示 `±—` 或“遍数出来的”。这一半解除。

## 5. （3）仍阻塞：`firstCI == null` 不能等价于“叫到顶”

### 5.1 `15个6` 在飞局并未叫到顶

按 `legalRaises()` 自己声明并实现的飞/斋规则：飞叫可转斋，新个数从 `ceil(count/2)` 起。所以三人飞局的 `15个6` 仍可合法加注为 `8个1…15个1`；真正无法再加的是 `15个1`。不飞模式下，`15个6` 才是真正到顶。

可运行引擎复现：

```bash
node <<'NODE'
const E = require('./src/engine-dice.js');
const hand = [1,2,3,4,5];
for (const [name, N, wild, bid] of [
  ['N=3 飞 5个1', 3, true,  {count:5,face:1}],
  ['N=3 飞 15个6',3, true,  {count:15,face:6}],
  ['N=3 飞 15个1',3, true,  {count:15,face:1}],
  ['N=3 不飞 15个6',3,false,{count:15,face:6}],
  ['N=2 飞 4个1', 2, true,  {count:4,face:1}],
]) {
  const legal = E.legalRaises(bid,N,wild,5);
  const cands = E.candidateRaises(bid,hand,N,wild,5);
  const r = E.analyze({hand,players:N,bid,wild,dicePerPlayer:5});
  console.log(JSON.stringify({name,legal:legal.length,legalHead:legal.slice(0,4),
    candidates:cands.length,finalists:r.finalists.length,
    actions:r.actions.map(a=>a.kind),sims:r.sims,method:r.method}));
}
NODE
```

实际输出（压行）：

```text
N=3 飞 5个1       legal=35  candidates=0 finalists=0 actions=[challenge] sims=0 method=rollout
N=3 飞 15个6      legal=8   candidates=0 finalists=0 actions=[challenge] sims=0 method=rollout
N=3 飞 15个1      legal=0   candidates=0 finalists=0 actions=[challenge] sims=0 method=rollout
N=3 不飞 15个6    legal=0   candidates=0 finalists=0 actions=[challenge] sims=0 method=rollout
N=2 飞 4个1       legal=16  candidates=0 finalists=0 actions=[challenge] sims=0 method=model
```

前两个局面“只有开”不是规则走到顶，而是所有合法加注的 `pBidTrue < 0.02`，被 `candidateRaises()` 有意筛掉。引擎如实报 `sims=0` 没问题；错误在前端把“没有候选”说成“没有合法选择”。

### 5.2 真浏览器复现：普通 `5个1` 也被说成“叫到顶”

我用本地静态站点和 Chromium/Playwright 真实点击复现，未改页面文件。可运行：

```bash
python3 - <<'PY'
import threading, http.server, socketserver
from functools import partial
from playwright.sync_api import sync_playwright
PORT=8793
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',PORT),partial(Quiet,directory='site'))
threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    br=p.chromium.launch(); pg=br.new_page(viewport={'width':393,'height':852})
    for label,count,face in [('飞局5个1',5,1),('飞局15个6',15,6),('飞局15个1',15,1)]:
        pg.goto(f'http://127.0.0.1:{PORT}/#dice',wait_until='networkidle')
        pg.evaluate('localStorage.clear()'); pg.reload(wait_until='networkidle')
        pg.click('#players button[data-n="3"]'); pg.click('#clr')
        for d in [1,2,3,4,5]: pg.click(f'#pad button[data-v="{d}"]')
        pg.click(f'#faces button[data-f="{face}"]')
        pg.click(f'#counts button[data-c="{count}"]')
        print(label,'|',pg.inner_text('.vact'),'|',pg.inner_text('#out .note'))
    br.close()
srv.shutdown(); srv.server_close()
PY
```

实际输出：

```text
飞局5个1  | 开 他！ | 这注已经叫到顶了，除了开没有别的合法选择。「开」那一行是精确概率，没有模型成分。
飞局15个6 | 开 他！ | 这注已经叫到顶了，除了开没有别的合法选择。「开」那一行是精确概率，没有模型成分。
飞局15个1 | 开 他！ | 这注已经叫到顶了，除了开没有别的合法选择。「开」那一行是精确概率，没有模型成分。
```

前两行分别仍有 35 和 8 个合法加注，页面陈述是可证伪的。新前端 4 条闸门只检查“不出现遍数”“不出现 `±—`”“出现叫到顶”“仍推荐开”；它没有检查这个局面是否真的 `legalRaises().length===0`。其中“必须出现叫到顶”反而要求错误文案存在，所以不能解除（3）。

### 5.3 N=2 还有同根进入路径

二人飞局 `[1,2,3,4,5]`、当前 `4个1` 有 16 个合法加注，但候选同样被全筛掉。浏览器实际文案为：

```text
N=2 飞 4个1 | 推荐= 开 他！ |
条形 = 本轮不喝的概率：单挑时用两步前瞻模型估的（实测单挑这样比全程模拟更准）。「开」那一行是精确概率，没有模型成分。
```

这次没有声称“无合法选择”，但决赛圈为空，也没有任何加注执行过两步前瞻；在唯一动作明确为精确“开”的同时先说“用两步前瞻模型估的”仍不准确。它与 N≥3 的问题同根：前端只看 `method/evCI`，没有区分“规则无合法加注”和“合法加注被候选阈值筛空”。

## 6. 建议的最小闭环

不要再用 `firstCI == null` 推断规则状态。引擎应显式返回原始合法加注数（例如 `legalRaisesConsidered` / `hasLegalRaise`），前端至少区分：

1. `legalRaises.length === 0`：可以说“叫到顶，除了开没有合法选择”；飞局回归样例应使用 `T个1`，不飞使用 `T个6`。
2. `legalRaises.length > 0 && candidatesConsidered === 0`：应说“规则上仍可加注，但这些加注都低于工具的候选阈值，因此只建议开；本次未运行 rollout/两步前瞻”，不能说不合法，也不能虚报模型计算。
3. 有决赛候选：N≥3 报真实 rollout 次数和有效 CI；N=2 才报两步前瞻。

相应闸门要同时钉住“真正到顶”和“候选阈值筛空但仍有合法加注”两条路径。保留当前 `sims===0`、无 `±—`、无“遍数出来的”、仍推荐开的断言。

## 7. 未验证项与最终裁定

- 未运行会改写磁盘并使用互斥锁的四套完整 fault injection 75 条；本轮按题意改用 6 次 module-loader 纯内存变异，且复验前后均无 `.fault-injection.lock`。题目所述其他故障注入计数本轮未独立复核。
- 未重跑完整 177 条浏览器套件；只对本轮两条相关分支做了真实 Chromium 定向点击。线上匿名 17 条和三机型线上拇指测试本轮未复核。
- 风险导向反例扫描不是穷尽证明；在本轮明确样本范围内是 `0` 反例，不把未扫空间写成已验证。

最终裁定：**（1）解除；（3）的“模拟次数不虚报”已修，但“只有开”的状态分类与文案仍错误，因此整体仍不可放行。**
