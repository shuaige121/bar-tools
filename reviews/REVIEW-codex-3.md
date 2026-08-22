可以放行。

# 数学与算法复验（Codex，第三轮）

日期：2026-08-22  
最终快照：`src/engine-dice.js` SHA-256 `0c5d4280545f80a94b617b16d36bab823081e1dd9a6935b8131eb540eccdae74`；`test/verify-dice.js` SHA-256 `9fe96cf9c50c4f66dae879f37b67bc594d3cf0de81d51fe8d6d893aad495f256`。  
范围：只复验 `REVIEW-codex-2.md` 的 A/B/C/D、对应回归锁、`candidateRaises` 和本轮 rollout 改动；未重跑其他测试套件。未修改 `src/`、`test/`、`site/`，未 commit，未部署；本文件是我唯一写入的文件。

> 快照说明：复验过程中共享工作区有并发更新。最初题述版本确实是“前 8 注 + N=2 无条件 `immediateStats`”，我先在该快照发现两个问题；随后外部进程把它们连同回归锁一起修复。本文结论以以上最终 hash 为准。期间另一进程运行 fault injection；我看到锁后停止所有 `require`，只在恢复到最终 hash 后复验。最后遗留的 `.fault-injection.lock` 经 `kill -0` 确认 PID 已不存在，我没有删除它。

## 明确结论

| 项目 | 最终判定 | 关键证据 |
|---|---|---|
| A：有偏预筛淘汰真最优 | **已解决** | 指定局面默认推荐 `2个1`；旧 2-ply、旧前 8、旧 top-2 粗筛注入时均有锁报红 |
| B：部分手牌信息泄漏 | **已解决** | 6 个 masked-oracle 局面逐位相等；恢复 `hands[cur]` 后 `188/189` |
| C：`barMove` 排序 | **已解决** | 408,240 组与全量目标策略零差异；删除排序后 direct lock 报红 |
| D：展示字段异模 | **已解决** | N≥3 用 `immediateStats`，N=2 用 `evRaise`；两个字段各有直接锁 |
| `candidateRaises` | **可接受** | 已取消按 count 前 8 截断，所有 `pTrue>=0.02` 的合法注全部入候选 |
| `_guardHits` | **正确** | 触顶分支不增加 `alive`；正常复验为 0 |

最终没有遗留已验证阻塞项。

## 1. 最终 verify 闸门：189 / 189

题述快照运行时先得到 `180/180`。并发更新新增 9 条有针对性的第三轮锁后，我在 fault lock 释放、hash 稳定后重新运行：

```bash
node test/verify-dice.js
```

实际输出（尾部）：

```text
================================================================
  通过 189 / 失败 0
  全部通过
```

退出码 `0`，实测约 `2.87s`。

## 2. A：指定局面与两级筛选

### 2.1 上轮指定局面已修复

可运行复现：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
const x={hand:[1,1,6,1,5],players:3,
  bid:{count:4,face:5},wild:true,dicePerPlayer:5};
const a=E.analyze(x);
console.log({best:a.best.bid,ev:a.best.ev,method:a.method,
  sims:a.sims,candidates:a.candidatesConsidered});
NODE
```

实际输出：

```text
{ best: { count: 2, face: 1 }, ev: 1,
  method: 'rollout', sims: 1500, candidates: 34 }
```

用旧精算随机流另跑 30,000 局时，`2个1=0.999633`、`3个1=0.993100`、`4个1=0.831300`；指定错排已经消失。

### 2.2 原“前 8 注”确实不安全，最终代码已取消

在题述快照，我找到一个确定反例：7 人飞局、手牌 `[5,2,5,5,1]`、当前 `1个5`；点数 6 的旧候选只含 count `1..8`，但同 rollout 模型真最优是被删掉的 `9个6`。

当时的可运行复现：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
const hand=[5,2,5,5,1],N=7,bid={count:1,face:5},sims=50000;
const kept=new Set(E.candidateRaises(bid,hand,N,true,5)
  .filter(b=>b.face===6).map(b=>b.count));
for(const seed of [19391,73013,99173]){
  const xs=E.legalRaises(bid,N,true,5).filter(b=>b.face===6).map(b=>({
    count:b.count,ev:E.rolloutEV(b,hand,N,true,5,sims,seed),
    pTrue:E.pBidTrue(b,hand,N,true,5),kept:kept.has(b.count)}));
  const inside=xs.filter(x=>x.kept).sort((a,b)=>b.ev-a.ev)[0];
  const all=xs.sort((a,b)=>b.ev-a.ev)[0];
  console.log({seed,inside,all,gap:all.ev-inside.ev});
}
NODE
```

题述快照实际输出：

```text
seed 19391: kept best 7个6=0.94430；all best 9个6=0.98764；gap=0.04334
seed 73013: kept best 7个6=0.94594；all best 9个6=0.98856；gap=0.04262
seed 99173: kept best 7个6=0.94286；all best 9个6=0.98676；gap=0.04390
```

`9个6` 的 `pTrue=0.833217`，问题纯粹来自 count 硬上限，不是 `<0.05` 阈值。

最终 `candidateRaises` 已改为：枚举全部合法加注，只丢 `pTrue<0.02`，不再按 count 排名截断。相同反例现在 `candidateHas9x6=true`，`analyze(..., sims:30000, seed:19391)` 的 face=6 行为 `9个6 / EV 0.9886`。

最终新增的独立 8 人锁也覆盖高 count：

```text
✅ 8人局候选集包含 11个5（pTrue=0.873）
✅ 候选集不做任何个数排名截断：pTrue 够高的一个都不能少
```

### 2.3 粗筛噪声：具体 top-2 反例已锁住

最终代码不再机械“每点数留前 2”，而是保留粗分距该 face 最优不超过 `3*sqrt(0.25/250)` 的候选，最多 4 注；精算还换了独立随机流，避免 winner's curse。

当前回归局面：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js'),h=[4,6,4,4,1];
const r=E.analyze({hand:h,players:3,bid:null,wild:true,dicePerPlayer:5});
const truth=[4,5,6].map(c=>({c,ev:E.rolloutEV(
  {count:c,face:4},h,3,true,5,20000,91919)})).sort((a,b)=>b.ev-a.ev);
console.log({best:r.best.bid,truth});
NODE
```

实际输出：

```text
best: { count: 6, face: 4 }
truth: 6个4=0.768, 5个4=0.754, 4个4=0.747
```

恢复旧 top-2 后，该锁单独报红：推荐变成 `4个4`，结果 `188/189`。

## 3. B：部分手牌信息泄漏已修复

当前 `rolloutEV` 在 hero 回合使用 `hand`，对手回合才使用 `hands[cur]`；补出的 hero 未知骰只留在 `all` 参与结算。

独立 masked oracle 复现：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
function masked(bid,hand,N,sims,seed){
  let st=seed|0;
  const rnd=()=>{st^=st<<13;st^=st>>>17;st^=st<<5;st|=0;return(st>>>0)/4294967296};
  let alive=0;
  for(let n=0;n<sims;n++){
    const {hands,all}=E.dealRound(hand,N,5,rnd),ts=[.4],cs=[.4];
    for(let i=1;i<N;i++){ts.push(.28+rnd()*.24);cs.push(.30+rnd()*.20)}
    let cur=1%N,prev=0,b=bid,loser=-1;
    for(let g=0;g<200;g++){
      const mv=E.barMove(b,cur===0?hand:hands[cur],N,true,5,ts[cur],cs[cur]);
      if(mv===null){loser=E.myCount(all,b.face,true)>=b.count?cur:prev;break}
      b=mv;prev=cur;cur=(cur+1)%N;
    }
    if(loser>=0&&loser!==0)alive++;
  }
  return alive/sims;
}
for(const [hand,N,bid] of [
  [[5,6,5,2],3,{count:4,face:5}], [[5,6,5,2],3,{count:3,face:6}],
  [[6,6],4,{count:7,face:6}], [[],2,{count:4,face:6}],
  [[1],5,{count:6,face:3}], [[2,3,4],6,{count:8,face:5}]
]){
  const a=E.rolloutEV(bid,hand,N,true,5,8000,4242);
  const b=masked(bid,hand,N,8000,4242);
  console.log({hand,N,bid,diff:a-b});
}
NODE
```

实际输出：6 个局面全部 `diff: 0`。恢复 `visible=hands[cur]` 后：

```text
❌ 部分手牌：补出的未知骰只参与结算，不进 hero 后续信息集
   手=[1] N=5 6个3: 0.751875 vs 0.702
通过 188 / 失败 1
```

B 通过。

## 4. C：`barMove` 排序已修复

我遍历 N=2/3/4、wild=true/false、252 种五骰多重集、全部 bid、三组阈值，将当前 `minimalRaises + sort` 与全量 `legalRaises + 同 sort` 对账。

可运行复现核心：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js'),key=x=>x?x.count+'x'+x.face:'challenge';
function full(bid,hand,N,wild,tau,comfort){
  const subj=b=>E.pBidTrue(b,hand,N,wild,5);
  if(subj(bid)<tau)return null;
  const rs=E.legalRaises(bid,N,wild,5);
  rs.sort((a,b)=>(a.count-b.count)||
    (E.myCount(hand,b.face,wild)-E.myCount(hand,a.face,wild)));
  for(const r of rs)if(subj(r)>=comfort)return r;
  let best=rs[0],bs=-1;for(const r of rs){const s=subj(r);if(s>bs){bs=s;best=r}}
  return best;
}
// hands 为全部 252 种有序五骰；按正文所列 N/wild/bid/阈值遍历
// mismatch += key(E.barMove(...)) !== key(full(...))
console.log({checked:408240,mismatch:0});
NODE
```

实际完整遍历输出：

```text
{ checked: 408240, mismatch: 0 }
```

删除 sort 后最终 direct lock 实际报红：

```text
❌ barMove 同加幅时优先选自己手上多的那个点数
   当前1个2，手=[4,4,4,4,4]，旧实现选 2个2；应选 1个4
通过 185 / 失败 4
```

C 通过。

## 5. D：两种方法分支均与展示字段同源

### 5.1 N≥3 rollout

独立精确枚举 `tau~U[0.28,0.52]`，局面 `hand=[4,2,5,4,3] / N=3 / 2个1`：

```text
immediateStats = independent oracle = {
  pChallenged: 0.007563249953006928,
  pTrueIfChallenged: 0.19624485596707816
}
旧 logistic = {
  pChallenged: 0.07853279843499435,
  pTrueIfChallenged: 0.20588385837796028
}
```

### 5.2 N=2 model

最终代码已按 `sims>0` 分支，N=2 使用产生 EV 的 `evRaise` stats。

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
const hand=[4,2,5,4,3],bid={count:1,face:1};
const r=E.analyze({hand,players:2,bid:{count:1,face:2},wild:true});
const row=r.actions.find(a=>a.bid&&a.bid.count===1&&a.bid.face===1);
const model=E.evRaise(bid,hand,2,true,5,E.DEFAULTS);
console.log({method:r.method,row:{ev:row.ev,pc:row.pChallenged,
  pt:row.pTrueIfChallenged},model});
NODE
```

实际输出：

```text
method: 'model'
row:   { ev: 0.6782917167332538,
         pc: 0.03148416081028633,
         pt: 0.010501448726756386 }
model: { ev: 0.6782917167332538,
         pChallenged: 0.03148416081028633,
         pTrueIfChallenged: 0.010501448726756386 }
```

两个字段都逐位相等。D 通过。

## 6. 回归锁鉴别力：最终版已补齐

我用 Node module loader 只在内存中逐项恢复旧逻辑，未写磁盘。最终 189 条的实际结果：

| 内存变异 | 实际结果 | 报红点 |
|---|---:|---|
| A：恢复 2-ply 每 face 一注 | `186/189` | 指定 argmax、候选宽度、无 count 截断 |
| B：恢复 `visible=hands[cur]` | `188/189` | masked oracle |
| C：删除 `barMove` sort | `185/189` | direct tie-break；另有数值锁 |
| D：所有 stats 恢复 `evRaise` | `187/189` | `pChallenged`、`pTrueIfChallenged` |
| D：只恢复 `pTrueIfChallenged` | `188/189` | 新字段级锁（旧 180 条曾漏掉） |
| 候选恢复“前 8 + `<0.05`” | `187/189` | `11个5`、无 count 截断 |
| 粗筛恢复每 face top 2 | `188/189` | `6个4` 具体错排 |

关键实际输出：

```text
D_only_pTrueIf_old:
  ❌ analyze 输出的 pTrueIfChallenged 也用 immediateStats（不是旧 logistic）
     0.20588385837796028 vs 0.19624485596707816

candidate_old_first8:
  ❌ 8人局候选集包含 11个5（pTrue=0.873）
     候选 48 个，不含 11个5

coarse_old_top2:
  ❌ 粗筛按噪声带砍：该局面推荐 4个4（真最优是 6个4）
```

判断：A/B/C/D 的精确旧实现现在都会响；此前最薄弱的 C direct lock、D 条件字段、N=2 分支、前 8 注和 top-2 粗筛都已补齐。

## 7. `candidateRaises` 的剩余边界

最终 `CAND_PTRUE_FLOOR=0.02` 仍是 heuristic，不是数学上的 admissible proof。`rolloutEV` 对 count 没有已证明单调性，所以“某个 `pTrue<0.02` 的 bluff 永不可能更优”不能当定理。

我对完全不支持目标点的压力方向枚举 N=3..8、wild=true/false、目标点和当前 bid；在旧 `<0.05` 过滤下覆盖 7,853 组，每注 500 局，没有一组被过滤动作优于保留动作：

```text
{ filterCases: 7853, badAtGapOver003: 0, maxObservedGap: 0 }
```

最终阈值更低到 0.02，风险只落在该扫描中更极端的子集。我没有找到反例；因此列为**未验证的怀疑**，不阻塞本次放行。

同理，粗筛“3 SE 内、最多 4 注”仍有非零 Monte Carlo 误筛概率，不是精确 argmax 保证；但 rollout 本身就是估计器，当前已有具体 top-2 反例锁、独立精算流和保守噪声带，未找到最终实现的当前错排，按模型工具的精度要求可接受。

## 8. `_guardHits` 与新问题

`loser<0` 时当前代码执行 `_guardHits++` 后直接 `continue`，不会增加 `alive`，所以触顶确实保守计 hero 喝。最终 verify 和 masked oracle 均为 0；未发现结算、座位推进或 guard 新问题。

本轮并发修复还把精算随机流与粗筛分离，避免用同一批随机样本选中再打分的 winner's curse；同一精算阶段仍使用 CRN。未发现这项改动引入正确性回归。

## 9. N=2 已知 off-policy mismatch

**这条已知局限不阻塞放行。** 强制 rollout 时，后来的 hero 仍走 `barMove`，而真实下一次会重新 `analyze`，结构性 mismatch 没有消失；但默认 N=2 已明确绕开 rollout，使用实测更强的 2-ply。你给出的最新 `ranker-split 1200` 结果继续支持该分界。

如果产品将来把 N=2 默认切回 rollout，这条必须重新作为阻塞项；在当前默认路径下，可以带着这个诚实记录的模型局限放行。
