仍不可放行：阻塞项是（1）粗筛的“每点数最多 4 注”仍会按名次确定性删掉位于 3σ 带内的全局真最优；（2）N=2 展示字段锁只校验了 `pChallenged`，仅把 N=2 的 `pTrueIfChallenged` 改回旧 `immediateStats` 时 191 条仍全绿。

# 数学与算法复验（Codex，第四轮）

日期：2026-08-22  
当前快照：`src/engine-dice.js` SHA-256 `0c5d4280545f80a94b617b16d36bab823081e1dd9a6935b8131eb540eccdae74`；`test/verify-dice.js` SHA-256 `516c72e1a035d1eeb5fb0414a2989c413541bd3cfd8554b68d13b49cbbff1ef5`；`test/fault-inject.js` SHA-256 `5219010d2a53938f18aaab520f5579280bcd2a519c9350e42024321228f90e62`。  
范围：只复验题述四条阻塞、三条新锁和新粗筛；未跑其他套件。未修改 `src/`、`test/`、`site/`，未 commit，未部署；本文件是唯一写入。

> 快照差异：磁盘上当前 `REVIEW-codex-3.md` 的 SHA-256 是 `a1990bb8772526498cb6fdbe2627a4c33edb2f46203a35a4f83049ff047d171b`，它没有题述的「结论摘要」和「放行前最低修正建议」标题，而且文件开头是“可以放行”。本轮没有用这份后来快照的结论代替复验，所有判定都针对当前源码重新取证。

## 1. 基线：191 / 191

可运行：

```bash
node test/verify-dice.js
```

实际输出（尾部）：

```text
================================================================
  通过 191 / 失败 0
  全部通过
real 3.55
```

退出码 `0`。开跑前后都是 `NO_FAULT_LOCK`。

## 2. 四条旧阻塞的独立复验

### 2.1 旧 top-2 反例在默认 seed 下已修复，但最多 4 注仍会删真最优

题述局面在默认 `seed=20260822` 下现在推荐 `6个4`，老 top-2 内存变异则推荐 `4个4`：

```text
current:  best={count:6,face:4}, ev=0.7666666666666667
oldTop2:  best={count:4,face:4}, ev=0.76
```

但现实现不是纯“按噪声带砍”；`keep.length < 4` 仍是一个硬名次 cap。对同一局面传入受支持的 `seed=458`，真最优 `6个4` 粗分排第 5，其 `0.688` 仍高于 3σ cutoff `0.66513`，却被 cap 删掉。这不是概率上的怀疑，而是可重现的确定性反例。

可运行复现：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
const hand=[4,6,4,4,1], N=3, seed=458, se=Math.sqrt(.25/250);
const xs=E.candidateRaises(null,hand,N,true,5).filter(b=>b.face===4)
  .map(b=>({bid:b,coarse:E.rolloutEV(b,hand,N,true,5,250,seed)}))
  .sort((a,b)=>b.coarse-a.coarse);
const cut=xs[0].coarse-3*se;
console.log({cut,face4:xs.map((x,i)=>({rank:i+1,count:x.bid.count,
  coarse:x.coarse,kept:i<4&&x.coarse>=cut}))});
console.log('engine',E.analyze({hand,players:N,bid:null,wild:true,dicePerPlayer:5,seed}).best);
for(const s of [19391,73013,99173]) {
  const all=E.legalRaises(null,N,true,5).map(b=>({bid:b,
    ev:E.rolloutEV(b,hand,N,true,5,100000,s)})).sort((a,b)=>b.ev-a.ev);
  const chosen=all.find(x=>x.bid.count===4&&x.bid.face===4);
  console.log(s,{best:all[0],chosen,gap:all[0].ev-chosen.ev});
}
NODE
```

实际输出（`face4` 只列关键前 5 名）：

```text
cut = 0.6651316701949487
rank 1: 4个4 coarse=0.760 kept=true
rank 2: 5个4 coarse=0.720 kept=true
rank 3: 3个4 coarse=0.716 kept=true
rank 4: 1个4 coarse=0.712 kept=true
rank 5: 6个4 coarse=0.688 kept=false
engine: 4个4, ev=0.7646666666666667
19391: best=6个4 0.76322, chosen=4个4 0.74303, gap=0.02019
73013: best=6个4 0.76630, chosen=4个4 0.74376, gap=0.02254
99173: best=6个4 0.76845, chosen=4个4 0.74500, gap=0.02345
```

三组都是对**全部合法叫法**各跑 100,000 局，不是只在引擎候选集内对账。差距 2.02–2.35pp 未超过新的 6pp 质量闸门，但它直接否定了“不再按名次确定性淘汰全局真最优”这条修复目标。

缓和证据：UI 调用没有传 `seed`，因此当前页面走默认 seed。我对默认 seed 另外扫了 200 个广泛随机局面（141 个有排除项的有效局面）、N=3 开局全部 252 种五骰多重集，以及 1,200 个围绕合理叫数生成的局面（1,161 个有效），没找到默认 seed 下“被排除项严格优于所有保留项”的例子。实际扫描摘要：

```text
broad random: { generated: 200, evaluated: 141, bestExcludedGap: -0.003333 }
N=3 multisets: { hands: 252, bestGap: 0 }  // 仅存 EV=1 的并列最优
targeted random: { generated: 1200, valid: 1161, excludedWithin0.5pp: 0 }
```

这些扫描只是未找到默认 seed 反例，不能抵消上面的可运行反例，也不是安全性证明。

### 2.2 `candidateRaises` 的每点数 8 注上限已解决

我直接把当前输出与“全部合法叫法中 `pTrue>=0.02`”的集合对账，没有借用引擎自己的数量断言：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js'), h=[2,1,3,2,5], bid={count:1,face:4};
const got=E.candidateRaises(bid,h,8,true,5);
const want=E.legalRaises(bid,8,true,5).filter(b=>E.pBidTrue(b,h,8,true,5)>=.02);
const key=b=>b.count+'x'+b.face, gs=new Set(got.map(key));
console.log({got:got.length,want:want.length,has11x5:gs.has('11x5'),
  pTrue11x5:E.pBidTrue({count:11,face:5},h,8,true,5),
  missing:want.filter(b=>!gs.has(key(b))).map(key)});
NODE
```

实际输出：

```text
{ got: 108, want: 108, has11x5: true,
  pTrue11x5: 0.8734733919688897, missing: [] }
```

将函数在 module loader 内存中恢复为每点数前 8 注后，实际是：

```text
{ candidateCount: 48, has11x5: false }
```

这条生产实现和回归锁都通过。

### 2.3 N=2 展示字段的当前实现已与 2-ply 同源

可运行：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js'), hand=[4,2,5,4,3];
const r=E.analyze({hand,players:2,bid:{count:1,face:2},wild:true});
const row=r.actions.find(a=>a.kind==='raise');
const model=E.evRaise(row.bid,hand,2,true,5,E.DEFAULTS);
const rolloutTable=E.immediateStats(row.bid,hand,2,true,5);
console.log({method:r.method,bid:row.bid,
 row:{ev:row.ev,pc:row.pChallenged,pt:row.pTrueIfChallenged},model,rolloutTable});
NODE
```

实际输出：

```text
method: model
bid: 2个4
row:   { ev: 0.7062773079732566, pc: 0.020924359910855103, pt: 1 }
model: { ev: 0.7062773079732566, pChallenged: 0.020924359910855103,
         pTrueIfChallenged: 1 }
rolloutTable: { pChallenged: 0, pTrueIfChallenged: null }
```

两个字段都与 `evRaise` 逐位相等，且这个局面能区分两套模型。因此生产代码已修正；其测试锁仍有缺口，见第 3 节。

### 2.4 C/D 当前行为已修正

`barMove` 直接构造局面：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js'), cur={count:1,face:2}, hand=[4,4,4,4,4];
const same=E.minimalRaises(cur,2,true,5).filter(x=>x.count===1);
console.log({same:same.map(x=>({bid:x,mine:E.myCount(hand,x.face,true)})),
  selected:E.barMove(cur,hand,2,true,5,0,0)});
NODE
```

实际输出：

```text
same: 1个3(持有0), 1个4(持有5), 1个5(持有0), 1个6(持有0), 1个1(持有0)
selected: 1个4
```

N=3 的 `pTrueIfChallenged` 展示字段也已与 `immediateStats` 同源：

```text
bid: 2个1
analyze row:       0.19624485596707816
immediateStats:    0.19624485596707816
old evRaise value: 0.20588385837796028
model difference: -0.009639002410882114
```

这两条生产实现均通过。

## 3. 三条新锁的鉴别力

### 3.1 三个完整旧实现变异都会响

我没有运行会改写 `src/` 的 fault runner，而是用 `Module._extensions['.js']` 在读入后、`_compile` 前替换内存字符串。每个 pattern 都断言只命中一处。

可运行：

```bash
for mut in bar_secondary ptrue_old n2_immediate; do
  echo "MUTATION=$mut"
  MUT="$mut" node <<'NODE' | rg '❌|通过 [0-9]+ / 失败|失败项:|全部通过'
const fs=require('fs'), Module=require('module'), path=require('path');
const target=path.resolve('src/engine-dice.js'), orig=Module._extensions['.js'];
const muts={
  bar_secondary:[
    'return (a.count - b.count) || (myCount(hand, b.face, wild) - myCount(hand, a.face, wild));',
    'return (a.count - b.count);'],
  ptrue_old:[
    'pTrueIfChallenged: st.pTrueIfChallenged,',
    'pTrueIfChallenged: evRaise(c.bid, hand, N, wild, dpp, tune).pTrueIfChallenged,'],
  n2_immediate:[
`      var st = sims > 0 ? immediateStats(c.bid, hand, N, wild, dpp)
                        : evRaise(c.bid, hand, N, wild, dpp, tune);`,
    '      var st = immediateStats(c.bid, hand, N, wild, dpp);']
};
Module._extensions['.js']=function(mod,file) {
  if(path.resolve(file)!==target) return orig(mod,file);
  let s=fs.readFileSync(file,'utf8'), [from,to]=muts[process.env.MUT];
  if(s.split(from).length-1!==1) throw Error('mutation pattern mismatch');
  mod._compile(s.replace(from,to),file);
};
require('./test/verify-dice.js');
NODE
done
```

实际结果：

```text
bar_secondary:
  ❌ barMove 同加幅时优先选自己手上多的那个点数
  通过 190 / 失败 1

ptrue_old:
  ❌ analyze 输出的 pTrueIfChallenged 也用 immediateStats
     0.20588385837796028 vs 0.19624485596707816
  通过 190 / 失败 1

n2_immediate_all_fields:
  ❌ N=2（2-ply 排序）时展示字段也来自 2-ply
     0 vs 0.020924359910855103
  通过 190 / 失败 1
```

因此，题述的三个**完整旧实现**回退都不再漏网。`test/fault-inject.js` 也实际有 31 个注入项：

```bash
rg -c "^  \\['" test/fault-inject.js
# 31
```

### 3.2 但 N=2 锁只守了两个字段中的一个

当前 N=2 断言只比较 `a2raise.pChallenged` 和 `m2.pChallenged`，没有比较 `pTrueIfChallenged`。下面的 module-loader 变异只在 `sims===0` 时把后一字段恢复为旧 `immediateStats`，会使上一节局面的页面值从 `1` 变成 `null`，却全绿：

```bash
node <<'NODE'
const fs=require('fs'), Module=require('module'), path=require('path');
const target=path.resolve('src/engine-dice.js'), orig=Module._extensions['.js'];
Module._extensions['.js']=function(mod,file) {
  if(path.resolve(file)!==target) return orig(mod,file);
  let s=fs.readFileSync(file,'utf8');
  const from='pTrueIfChallenged: st.pTrueIfChallenged,';
  const to='pTrueIfChallenged: sims > 0 ? st.pTrueIfChallenged : ' +
    'immediateStats(c.bid, hand, N, wild, dpp).pTrueIfChallenged,';
  if(s.split(from).length-1!==1) throw Error('mutation pattern mismatch');
  mod._compile(s.replace(from,to),file);
};
require('./test/verify-dice.js');
NODE
```

实际输出（尾部）：

```text
================================================================
  通过 191 / 失败 0
  全部通过
```

这不影响“当前生产实现是对的”的判定，但意味着“N=2 展示字段同源”回归锁仍不完整；一个真实字段级回归可以不响。这是本轮第二个阻塞项。

## 4. 本轮改动引入的其他问题

除上述“最多 4 注”反例和 N=2 锁缺口外，未发现新的已验证正确性回归。

- `candidateRaises` 与全合法集的 `pTrue>=0.02` 子集完全相等。
- N=2 当前两个展示字段都与 `evRaise` 相等。
- N≥3 精算使用 `seed ^ 0x5bf03635`，而粗筛使用原 `seed`；191 条中的独立流锁通过。
- `site/index.html` 也能搜到 `CAND_PTRUE_FLOOR=0.02`、`keep.length < 4`、分支 `st`、以及 `seed ^ 0x5bf03635`，没看到“只改了 src、页面仍是旧引擎”的本轮断层。

未验证的怀疑：`pTrue<0.02` 过滤和有限 Monte Carlo 本身都不是 argmax 保证；本轮没有对这两点做穷尽证明，也没找到额外的 >6pp 质量反例。

## 5. 放行前最低修正建议

1. 要么删掉每点数 4 注 cap，真正保留全部 3σ 带内候选；要么把放行标准明确改为“可容忍 ≤6pp 的确定性错选”，不再声称已解决真最优被按名次淘汰。若保留 cap，至少应把上面 `seed=458` 反例加进质量闸门，并按产品容差断言 gap，不要断言固定 argmax。
2. N=2 锁同时断言 `pChallenged` 和 `pTrueIfChallenged` 都逐位等于 `evRaise`，再把上面“仅 N=2 pTrue 改回 immediateStats”的变异加入 `test/fault-inject.js`。
