# 数学与算法复审（Codex，第二轮）

日期：2026-08-22  
范围：复核 `REVIEW-codex.md` 的 4 条问题；重点审查新加入的 dice rollout；运行题目指定的全部 verify / fault-inject 闸门。  
约束：未修改 `src/`、`test/`、`site/`，未 commit，未部署；本文件是唯一新建文件。

## 明确结论

**上次 4 条：全部修复。**

- #1 指定的三人局现在正确推荐 `5 个 5`，而不是“开”；默认 1,500 次 rollout 得 `0.809333`，开牌精确值为 `0.559264`。我另用与 `winrate-lib.js` 同结构的全量加注对手跑 100,000 局，`5 个 5` 的不喝率为 `0.81969`。
- #2 主结果已正确拆成 `pTrue`、`pChallenged`、`pTrueIfChallenged`，`app.js` 主卡片使用字段正确。不过算法说明仍残留一句错误旧文案“「被开也能活」是精确概率”，应删除或改写。
- #3 `maxSplit=0` 会移除 split，递归预算已接通；默认 `maxSplit=1` 的 400 个规则格与独立“一次分牌”公式逐格完全相等，最大误差 `0`，没有带偏默认表。
- #4 自然 Blackjack 的 `bjPay` 已生效；`peek=false` 对庄 A/10 时的平局概率也扣得正确，逐格与独立公式完全相等。

**新代码：不可以放行。**

有两个会直接改变推荐动作的已验证问题：

1. **高：2-ply 预筛会淘汰同一点数下真正最优的 rollout 动作。** 已找到三人局：当前推荐 `6 个 5`，rollout `0.859667`；被筛掉的合法 `3 个 1` 用同种子跑 30,000 次为 `0.980167`，高 `12.05` 个百分点。
2. **高：部分手牌 rollout 出现 information leakage / strategy fusion。** `dealRound` 补出的 hero 未输入骰子既用于结算，也被 `barMove` 当成 hero 后续“已知手牌”。三人局实测会把推荐从不泄漏语义下的 `3 个 6` 改成 `4 个 5`，差 `7.05` 个百分点。

此外，N=2/N≥3 的分界是一个有实测依据的临时 fallback，但它确实掩盖了 rollout 的结构性缺陷：rollout 内“后来的 hero”执行 `barMove`，真实工具后续却重新执行 `analyze`，两者在 600 个 N=2 样本状态中有 `175/600 = 29.17%` 动作不同。调 `HERO_TAU/HERO_COMFORT` 只是在调一个不同的 surrogate policy，无法消除这种 off-policy mismatch。单挑每次继续都立刻暴露该 mismatch；多人局只是在回到 hero 前更可能已由别人终结。

全部现有闸门仍为绿色，但没有覆盖上述两个错排问题。

---

## 一、逐条复核上次 4 条

### 1. 三人局 `CONT` 错排：指定局面已修复

复现：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
const input={hand:[5,5,2,5,3],players:3,
  bid:{count:5,face:3},wild:true,dicePerPlayer:5};
for (const [name,opt] of [
  ['default',{}],
  ['model',{sims:0,useRollout:false}],
  ['rollout-20000',{sims:20000,useRollout:true}]
]) {
  const a=E.analyze({...input,...opt});
  console.log(name,{method:a.method,best:a.best.kind,bid:a.best.bid,
    ev:a.best.ev,challengeEV:a.challenge.ev});
}
NODE
```

实际输出：

```text
default {
  method: 'rollout', best: 'raise', bid: { count: 5, face: 5 },
  ev: 0.8093333333333333, challengeEV: 0.5592643397856005
}
model {
  method: 'model', best: 'challenge', bid: undefined,
  ev: 0.5592643397856005, challengeEV: 0.5592643397856005
}
rollout-20000 {
  method: 'rollout', best: 'raise', bid: { count: 5, face: 5 },
  ev: 0.81625, challengeEV: 0.5592643397856005
}
```

我还让 hero 固定先叫 `5 个 5`，后续 hero 用当前 `barMove`，对手按 `winrate-lib.js` 的全量 `legalRaises` 策略继续，所有候选各跑 100,000 局。实际输出：

```text
open 0.5592643397856005
{ count: 5, face: 5 } 0.81969
{ count: 5, face: 4 } 0.65507
{ count: 5, face: 6 } 0.65842
{ count: 3, face: 1 } 0.57756
{ count: 6, face: 2 } 0.38915
{ count: 6, face: 3 } 0.38946
```

结论：**(a) 上次指定局面现在排序正确，已修复。**

#### N=2/N≥3 分界是否掩盖 rollout 缺陷

实际执行题目指定的证据表：

```bash
node test/ranker-split.js 1500
```

实际输出：

```text
人数 对手             rollout   2-ply    基准    胜者
2人 bar               43.9%     38.2%    50%     2-ply
2人 mixed             39.4%     33.6%    50%     2-ply
2人 counter           50.2%     46.5%    50%     2-ply
2人 aggro             22.9%     13.9%    50%     2-ply
2人 nit               41.5%     31.3%    50%     2-ply
2人 noob              20.7%     18.5%    50%     持平
3人 bar               34.6%     31.8%    33%     2-ply
3人 mixed             22.5%     27.0%    33%     rollout
3人 counter           17.7%     26.7%    33%     rollout
3人 aggro              6.9%     11.2%    33%     rollout
3人 nit               25.5%     28.7%    33%     rollout
3人 noob               9.6%     11.9%    33%     持平
4人 bar               20.1%     16.9%    25%     2-ply
4人 mixed             14.9%     18.3%    25%     rollout
4人 counter           12.0%     20.2%    25%     rollout
4人 aggro              8.2%      7.7%    25%     持平
4人 nit               27.7%     27.9%    25%     持平
4人 noob               6.6%      6.7%    25%     持平
6人 bar                5.9%      3.5%    17%     持平
6人 mixed              5.1%      5.9%    17%     持平
6人 counter            8.3%     12.8%    17%     rollout
6人 aggro              3.9%      5.2%    17%     持平
6人 nit                7.7%     11.0%    17%     rollout
6人 noob               1.9%      2.2%    17%     持平

2人局：rollout胜 0 / 2-ply胜 5 / 持平 1
3人局：rollout胜 4 / 2-ply胜 1 / 持平 1
4人局：rollout胜 2 / 2-ply胜 1 / 持平 3
6人局：rollout胜 2 / 2-ply胜 0 / 持平 4
```

注意两点：

- 代码和表实际是 **6 种**对手，不是注释及问题文字中的 5 种。
- `test/ranker-split.js` 本身没有调用 `setHeroPolicy`，所以“五档参数扫描”不能从该文件复现。我另扫了 5 组参数。

5 组 hero 参数、每类对手 700 局的六类平均落酒率。复现：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
const W=require('./test/winrate-lib.js');
const kinds=['bar','mixed','counter','aggro','nit','noob'];
for(const x of [.2,.3,.4,.5,.6]){
  E.setHeroPolicy(x,x);
  const v=kinds.map(k=>W.drinkRate(2,
    W.makeTool({sims:400,useRollout:true}),700,k));
  console.log(x,v.reduce((a,b)=>a+b,0)/v.length);
}
E.setHeroPolicy(.4,.4);
const v=kinds.map(k=>W.drinkRate(2,
  W.makeTool({sims:0,useRollout:false}),700,k));
console.log('2-ply',v.reduce((a,b)=>a+b,0)/v.length);
NODE
```

实际输出：

```text
tau=comfort=0.2  mean 0.3579
tau=comfort=0.3  mean 0.3745
tau=comfort=0.4  mean 0.3702
tau=comfort=0.5  mean 0.3840
tau=comfort=0.6  mean 0.3986
2-ply             mean 0.3114
```

所以“调强 hero 参数没有救回单挑”这一现象我可以复现。

我的独立判断是：用户假设只说对了一半。**“单挑时立即回到 hero”是缺陷被放大的原因，但真正的代码级问题不是单纯参数太弱，而是 rollout 在评估一个并不会被实际执行的 continuation policy。**

复现内部 hero 与真实重新规划 hero 的差异：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
let st=731927;
const rnd=()=>{st^=st<<13;st^=st>>>17;st^=st<<5;return(st>>>0)/4294967296};
const key=x=>x?x.count+'x'+x.face:'challenge';
let mismatch=0,total=600;
for(let i=0;i<total;i++){
  const N=2, hand=Array.from({length:5},()=>1+(rnd()*6|0));
  const bid={count:1+(rnd()*(N*5-1)|0),face:1+(rnd()*6|0)};
  const internal=key(E.barMove(bid,hand,N,true,5,.4,.4));
  const a=E.analyze({hand,players:N,bid,wild:true,dicePerPlayer:5,
    useRollout:true,sims:400});
  const replanned=a.best.kind==='challenge'?'challenge':key(a.best.bid);
  if(internal!==replanned)mismatch++;
}
console.log({total,mismatch,rate:mismatch/total});
NODE
```

实际输出：

```text
{ total: 600, mismatch: 175, rate: 0.2916666666666667 }
```

`rolloutEV` 在 `src/engine-dice.js:205` 让 hero 与所有对手都走 `barMove`；真实工具在后续 hero 回合会再次走 `analyze`。改变 `HERO_TAU/HERO_COMFORT` 只能改变 `barMove` 的两个阈值，无法让它变成 `analyze`。这解释了为什么五档阈值都救不回来。

因此：**(b) 按人数分界是合理的线上止损，但确实掩盖了 rollout 尚未成为 self-consistent policy evaluator 的缺陷。** 现有证据足以确认 policy mismatch；要精确量化它占单挑退化的多少，需要实现递归/迭代的 policy evaluation 后再做 intervention，本次因禁止修改源码没有实现，不能把“退化的 100% 都由它造成”写成已验证事实。

### 2. “被开也能活”字段：主输出已修复，说明文案有残留

复现旧案例：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
const r=E.analyze({hand:[5,4,3,2,2],players:2,
  bid:{count:2,face:2},wild:true,dicePerPlayer:5});
console.log({best:r.best.kind,bid:r.best.bid,pTrue:r.best.pTrue,
  pChallenged:r.best.pChallenged,
  pTrueIfChallenged:r.best.pTrueIfChallenged});
NODE
```

实际输出：

```text
{
  best: 'raise', bid: { count: 2, face: 3 },
  pTrue: 0.8683127572016461,
  pChallenged: 0.020924359910855103,
  pTrueIfChallenged: 0.059247408973730896
}
```

`src/app.js:142-150` 的主渲染映射正确：

- “这注成立”使用 `best.pTrue`；
- “下家开你”使用 `best.pChallenged`；
- “真被开的时候，这注成立……”使用 `best.pTrueIfChallenged`。

结论：**上次的字段错配已修复。**

残留问题：`src/app.js:74` 仍写着：

```text
「被开也能活」是精确概率
```

这句话与新字段定义冲突：精确的是无条件 `pTrue`；`pTrueIfChallenged` 依赖开牌模型，不是精确无条件二项概率。主卡片已经不再使用旧标签，因此不把它算作上次问题仍未修复，但这是应在放行前修正的用户可见错误说明。

### 3. `maxSplit`：已修复，默认 400 格无偏移

我没有只看新增测试，而是用不调用 `splitHandEV` 的原始“一次分牌”公式逐格比较：S17/H17 × DAS/no-DAS × 10 种对子 × 10 张庄家明牌，共 400 格。

复现：

```bash
node <<'NODE'
const B=require('./src/engine-blackjack.js');
const P=[0,1/13,1/13,1/13,1/13,1/13,1/13,1/13,1/13,1/13,4/13];
function oneSplit(pair,dd,opt){
  let per=0;
  for(let c=1;c<=10;c++){
    let r=B.add(0,false,pair); r=B.add(r[0],r[1],c);
    let v;
    if(pair===1) v=B.standEV(r[0],dd);
    else {
      const a=B.actions(r[0],r[1],dd,opt,opt.das,false);
      v=Math.max(a.stand,a.hit,a.double==null?-Infinity:a.double);
    }
    per+=P[c]*v;
  }
  return 2*per;
}
let cells=0,maxDiff=0;
for(const hitSoft17 of [false,true]) for(const das of [false,true])
for(let pair=1;pair<=10;pair++) for(let up=1;up<=10;up++){
  const opt=B.defaults({hitSoft17,das,maxSplit:1});
  const dd=B.dealerDist(up,opt);
  maxDiff=Math.max(maxDiff,Math.abs(B.splitEV(pair,dd,opt)-oneSplit(pair,dd,opt)));
  cells++;
}
const m0=B.advise([8,8],10,{maxSplit:0});
const dd=B.dealerDist(10,B.defaults({maxSplit:1}));
console.log({cells,maxDiff,
  maxSplit0:{best:m0.best,actions:m0.actions.map(x=>x.key)},
  split8v10:{max1:B.splitEV(8,dd,B.defaults({maxSplit:1})),
             max3:B.splitEV(8,dd,B.defaults({maxSplit:3}))}});
NODE
```

实际输出：

```text
{
  cells: 400,
  maxDiff: 0,
  maxSplit0: {
    best: 'surrender',
    actions: [ 'surrender', 'hit', 'stand', 'double' ]
  },
  split8v10: {
    max1: -0.4894876231609264,
    max3: -0.48055175515143045
  }
}
```

`splitHandEV` 的递推也与声明的“每手独立预算”一致：重新摸到对子时，这一手可选择保留普通两张牌价值，或用 `2 * splitHandEV(..., budget-1)` 变成两个子手；两个子手各自继承减一后的预算。默认 `maxSplit=1` 时 budget 为 0，完全退化为旧的一次分牌公式。

结论：**已修复；已检查，未发现问题。**

### 4. 自然 Blackjack / `bjPay`：peek=true 与 peek=false 都正确

复现：

```bash
node <<'NODE'
const B=require('./src/engine-blackjack.js');
for(const peek of [true,false]) for(const up of [1,10,6])
for(const bjPay of [1.5,1.2]){
  const r=B.advise([1,10],up,{peek,bjPay});
  const pBJ=peek?0:(up===1?4/13:up===10?1/13:0);
  const oracle=(1-pBJ)*bjPay;
  console.log({peek,up,bjPay,bestEV:r.bestEV,oracle,diff:r.bestEV-oracle});
}
NODE
```

实际输出（全部 12 格的 `diff` 都为 0）：

```text
peek=true,  up=A,  bjPay=1.5  bestEV=1.5                 oracle=1.5
peek=true,  up=10, bjPay=1.2  bestEV=1.2                 oracle=1.2
peek=false, up=A,  bjPay=1.5  bestEV=1.0384615384615383  oracle=1.0384615384615383
peek=false, up=A,  bjPay=1.2  bestEV=0.8307692307692307  oracle=0.8307692307692307
peek=false, up=10, bjPay=1.5  bestEV=1.3846153846153846  oracle=1.3846153846153846
peek=false, up=10, bjPay=1.2  bestEV=1.1076923076923078  oracle=1.1076923076923078
peek=false, up=6,  bjPay=1.5  bestEV=1.5                 oracle=1.5
peek=false, up=6,  bjPay=1.2  bestEV=1.2                 oracle=1.2
```

`peek=false` 的公式 `(1-pDealerBJ)*bjPay` 正确：双方自然 Blackjack 时平局 0，否则收取 `bjPay`。结论：**已修复；已检查，未发现问题。**

---

## 二、新 rollout 代码审查

### 新问题 A（高）：2-ply 预筛会淘汰 rollout 真正最优动作

位置：`src/engine-dice.js:301-325`。

代码按 face 只保留 2-ply 分数最高的一注，再对这 6 注做 rollout。因此“最终排序完全依据 rollout”只对入围集合成立，不对全部合法动作成立。上次已经证明 2-ply continuation 可能错得很大；它同样可能在一个 face 内选错 count。

可运行复现：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
const input={hand:[1,1,6,1,5],players:3,
  bid:{count:4,face:5},wild:true,dicePerPlayer:5};
const a=E.analyze({...input,sims:30000,useRollout:true,seed:99173});
console.log('engine best',a.best.bid,a.best.ev);
console.log('kept face=1',a.actions.find(x=>x.bid&&x.bid.face===1));
for(const count of [2,3,4,5,6,7]){
  const bid={count,face:1};
  console.log(bid,
    '2ply',E.evRaise(bid,input.hand,3,true,5).ev,
    'rollout',E.rolloutEV(bid,input.hand,3,true,5,30000,99173));
}
NODE
```

实际输出：

```text
engine best { count: 6, face: 5 } 0.8596666666666667
kept face=1: { bid:{count:4,face:1}, ev:0.8313, prescore:0.7349471531390621 }

{ count: 2, face: 1 } 2ply 0.5392663992174973 rollout 0.7582
{ count: 3, face: 1 } 2ply 0.7194419450151571 rollout 0.9801666666666666
{ count: 4, face: 1 } 2ply 0.7349471531390621 rollout 0.8313
{ count: 5, face: 1 } 2ply 0.49309047615433615 rollout 0.5160333333333333
{ count: 6, face: 1 } 2ply 0.22381870802632764 rollout 0.2225
{ count: 7, face: 1 } 2ply 0.07248806807931889 rollout 0.06843333333333333
```

这里 hero 自己就有 3 个 1，`3 个 1` 是必真叫法，但 2-ply 因为更偏好 `4 个 1` 而把它淘汰。用同一 rollout 模型比较，遗漏动作比当前推荐高 `0.1205`；这不是 Monte Carlo 噪声（两个 95% 单项半宽约 `0.00566`）。

结论：**已验证新错误，阻塞放行。** 至少应每个 face 保留多个候选，并用类似本例的回归锁证明没有把 rollout 最优动作预筛掉；更稳妥的是对 dominance 后的所有候选做 rollout。

### 新问题 B（高）：部分手牌的 sampled hidden dice 泄漏给未来 hero

位置：`src/engine-dice.js:168-176`、`:196`、`:205`。

`dealRound` 做对了一半：它确实补齐 hero 未输入骰子，使 `all.length === N*dpp`，结算总数正确。但它把补出的骰子同时放进 `hands[0]`；轮到 hero 时，`rolloutEV` 把完整 `hands[0]` 传给 `barMove`。于是抽样出的“未知骰”在 hero 后续决策中变成已知。

若产品语义是页面写的“没输入的当未知处理”，任何 hero 决策都不能条件化到该抽样值；若语义是“玩家其实知道，只是没有告诉工具”，当前动作仍不能按它条件化、后续动作却突然可以，仍是前后不一致的 information set。这是典型 strategy fusion。

下面的 masked oracle 保留补骰参与 `all` 结算，但 hero 后续只看原始 `hand`：

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
    let cur=1,prev=0,b=bid,loser=-1;
    for(let g=0;g<200;g++){
      const visible=cur===0?hand:hands[cur];
      const mv=E.barMove(b,visible,N,true,5,ts[cur],cs[cur]);
      if(mv===null){loser=E.myCount(all,b.face,true)>=b.count?cur:prev;break}
      b=mv;prev=cur;cur=(cur+1)%N;
    }
    if(loser!==0)alive++;
  }
  return alive/sims;
}
const input={hand:[5,6,5,2],players:3,
  bid:{count:2,face:2},wild:true,dicePerPlayer:5};
const a=E.analyze({...input,sims:30000,useRollout:true,seed:91919});
for(const bid of [{count:4,face:5},{count:3,face:6}])
  console.log(bid,{current:E.rolloutEV(bid,input.hand,3,true,5,30000,91919),
                   masked:masked(bid,input.hand,3,30000,91919)});
console.log('engine best',a.best.bid);
NODE
```

实际输出：

```text
{ count: 4, face: 5 } { current: 0.7110666666666666, masked: 0.6556666666666666 }
{ count: 3, face: 6 } { current: 0.6655,             masked: 0.7261666666666666 }
engine best { count: 4, face: 5 }
```

不泄漏时 `3 个 6` 比 `4 个 5` 高 `0.0705`；当前实现因看到抽样出的第 5 颗 hero 骰子而把顺序反转。

结论：**`dealRound` 的发牌数量正确，但它与 `rolloutEV` 的组合对部分手牌不正确，阻塞放行。**

### 新问题 C（中）：`barMove` 与 `barPlayer` 的差异不在“窄集合”，而在排序

位置：`src/engine-dice.js:129-159`，对照 `test/winrate-lib.js:12-18`。

对 `barPlayer` 当前的阈值策略，窄集合本身足够：同一 face 上更高 count 的主观成立概率不会更高；全量策略最终选中的动作总在每个 face 的最小合法加注集合中。

真正差异是：

- `barPlayer` 先按 count 升序、再按手上贡献降序排序；
- `barMove` 直接按 `minimalRaises` 的生成顺序返回第一个达到 comfort 的动作。

例如当前叫 `1 个 2`、手牌 `[1,1,1,1,1]`、N=2、`tau=.4/comfort=.4`：

```text
minimalRaises 生成：[2x2, 1x3, 1x4, 1x5, 1x6, 1x1]
barMove：             2x2
全量 barPlayer：      1x3
```

我遍历 N=2/3/4、wild=true/false、全部 252 种五骰多重集、全部 bid、三组阈值。复现：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
const key=x=>x?x.count+'x'+x.face:'challenge';
function sortedMove(minimal,bid,hand,N,wild,tau,comfort){
  const subj=b=>E.pBidTrue(b,hand,N,wild,5);
  if(subj(bid)<tau)return null;
  const rs=(minimal?E.minimalRaises:E.legalRaises)(bid,N,wild,5);
  if(!rs.length)return null;
  rs.sort((a,b)=>(a.count-b.count)||
    (E.myCount(hand,b.face,wild)-E.myCount(hand,a.face,wild)));
  for(const r of rs)if(subj(r)>=comfort)return r;
  let best=rs[0],bs=-1;
  for(const r of rs){const s=subj(r);if(s>bs){bs=s;best=r}}
  return best;
}
const hands=[];
for(let a=1;a<=6;a++)for(let b=a;b<=6;b++)for(let c=b;c<=6;c++)
for(let d=c;d<=6;d++)for(let e=d;e<=6;e++)hands.push([a,b,c,d,e]);
let checked=0,rawMismatch=0,sortedMismatch=0;
for(const N of [2,3,4])for(const wild of [true,false])for(const hand of hands)
for(let count=1;count<=N*5;count++)for(let face=1;face<=6;face++)
for(const [tau,comfort] of [[.28,.3],[.4,.4],[.52,.5]]){
  const bid={count,face};
  const full=key(sortedMove(false,bid,hand,N,wild,tau,comfort));
  const raw=key(E.barMove(bid,hand,N,wild,5,tau,comfort));
  const sorted=key(sortedMove(true,bid,hand,N,wild,tau,comfort));
  checked++; rawMismatch+=raw!==full; sortedMismatch+=sorted!==full;
}
console.log({checked,rawMismatch,sortedMismatch});
NODE
```

实际输出：

```text
{
  checked: 408240,
  rawMismatch: 83046,
  sortedMismatch: 0
}
```

我还做了 intervention：仅在独立复现版 rollout 中给 `minimalRaises` 加相同排序，N=2 每格 1,200 局、400 sims。它没有救回单挑，反而在大多数格更差：

```text
bar      current 0.4333  sorted 0.4542  2-ply 0.3550
mixed    current 0.4033  sorted 0.4125  2-ply 0.3225
counter  current 0.5100  sorted 0.5208  2-ply 0.4983
aggro    current 0.2192  sorted 0.2600  2-ply 0.1642
nit      current 0.4017  sorted 0.3933  2-ply 0.3117
noob     current 0.2117  sorted 0.2325  2-ply 0.1600
```

判断：**窄候选集本身不是问题；当前排序导致内部模型与声称的 `barPlayer` 不一致，这是问题。** 它不是 N=2 退化的充分根因（排序对齐后没有改善），但会削弱 `ranker-split` 中“bar 是 rollout 同模型对手”的论证。

### 新问题 D（中）：rollout 的展示字段来自另一套即时开牌模型

N≥3 时最终 `ev` 来自 rollout：对手的 `tau` 在 `[0.28,0.52]` 均匀抽样，并以硬阈值开牌。但 `pChallenged` / `pTrueIfChallenged` 仍来自 `evRaise`：固定 `tau=0.4`、`soft=0.08` 的 logistic 模型。

因此字段内部彼此一致，但不描述产生该动作 `ev` 的那桌 rollout 对手。可运行的精确枚举（对下一家贡献 `j` 求和）：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
const hand=[4,2,5,4,3],bid={count:2,face:1},N=3,dpp=5;
function rolloutImmediate(){
  const p=E.faceProb(bid.face,true),k=E.myCount(hand,bid.face,true);
  let pc=0,joint=0;
  for(let j=0;j<=dpp;j++){
    const pj=E.binomPMF(dpp,j,p);
    const pB=E.binomGE(N*dpp-dpp,bid.count-j,p);
    const ch=Math.max(0,Math.min(1,(.52-pB)/.24));
    const pt=E.binomGE(N*dpp-hand.length-dpp,bid.count-k-j,p);
    pc+=pj*ch; joint+=pj*ch*pt;
  }
  return {pChallenged:pc,pTrueIfChallenged:joint/pc};
}
const d=E.evRaise(bid,hand,N,true,dpp);
console.log('display',{pChallenged:d.pChallenged,
  pTrueIfChallenged:d.pTrueIfChallenged});
console.log('rollout opponent',rolloutImmediate());
NODE
```

实际输出：

```text
输入 hand=[4,2,5,4,3], N=3，考察合法加注 2个1

页面字段（logistic）：
pChallenged          0.07853279843499435
pTrueIfChallenged    0.20588385837796028

rollout 对手（tau~Uniform[.28,.52]）：
pChallenged          0.007563249953006928
pTrueIfChallenged    0.19624485596707816
```

“下家开你”可显示约 `8%`，而产生 rollout EV 的对手模型实际只有约 `0.8%`。这不是上次“无条件/条件概率错配”的回归，但属于新的一致性问题。建议字段注明其模型，或直接按 rollout 的 opponent distribution 计算。

### `minimalRaises` 规则合法性：已检查，未发现问题

现有 `verify-dice.js` 逐类验证返回项都属于 `legalRaises`；我又在上述 408,240 组比较中确认，全量 `barPlayer` 所选动作都能由正确排序后的窄集合复现。飞→斋、斋→飞、不飞模式的边界没有发现遗漏或非法动作。

结论：**候选生成规则已检查，未发现问题；问题是 `barMove` 没按所声称策略排序。**

### `binomGE` 有界记忆化：已检查，未发现正确性风险

key 包含 `(n,r,p)`；缓存值即使为 0 也能被 `hit !== undefined` 正确命中；清空只影响性能，不改变计算。强制插入 20,050 组不同 key 跨过清空阈值后复核：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
function direct(n,r,p){let s=0;for(let k=r;k<=n;k++)s+=E.binomPMF(n,k,p);return Math.min(1,s)}
const xs=[[40,13,1/3],[35,9,1/6],[20,7,.271828]];
const before=xs.map(x=>E.binomGE(...x));
for(let i=0;i<20050;i++)E.binomGE(30,1+i%30,(i+1)/20052);
const after=xs.map(x=>E.binomGE(...x));
const oracle=xs.map(x=>direct(...x));
console.log({before,after,oracle,
  maxBeforeAfter:Math.max(...before.map((v,i)=>Math.abs(v-after[i]))),
  maxVsDirect:Math.max(...after.map((v,i)=>Math.abs(v-oracle[i])))});
NODE
```

实际输出：

```text
before = after = oracle =
[0.6031228041675809, 0.11621108190046059, 0.28747221938047024]
maxBeforeAfter: 0
maxVsDirect: 0
```

结论：**已检查，未发现问题。**

### 共同随机数（CRN）：正确、有低频可观测效果，不同意“不可观测”这个绝对表述

在当前实现中，每个候选每局消耗的随机数数量在进入动作循环前就是固定的：同 seed 确实让候选面对同一批骰子和性格参数。它不改变任何单候选估计的边际期望；在候选结果正相关时会降低差值方差。

独立实测。这里的“独立候选种子”使用 candidate hash 打散 seed：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
function rank(input,sims,base,crn){
  const xs=E.analyze({...input,sims:0,useRollout:false}).actions.map(a=>{
    if(a.kind==='challenge')return {key:'open',ev:a.ev};
    const h=Math.imul(a.bid.count,0x9e3779b1)^
            Math.imul(a.bid.face,0x85ebca6b);
    return {key:a.bid.count+'x'+a.bid.face,
      ev:E.rolloutEV(a.bid,input.hand,input.players,true,5,sims,
        crn?base:(base^h))};
  }).sort((a,b)=>b.ev-a.ev);
  return xs[0].key;
}
const fixed={hand:[5,5,2,5,3],players:3,
  bid:{count:5,face:3},wild:true,dicePerPlayer:5};
let same120=0;
for(let s=1;s<=120;s++)
  same120+=rank(fixed,400,s*7919,true)===rank(fixed,400,s*7919,false);

let st=24680;
const rnd=()=>{st^=st<<13;st^=st>>>17;st^=st<<5;return(st>>>0)/4294967296};
function stateMatch(sims){
  let same=0;
  for(let q=0;q<200;q++){
    const N=3+(rnd()*4|0),hand=Array.from({length:5},()=>1+(rnd()*6|0));
    const input={hand,players:N,
      bid:{count:1+(rnd()*(N*5-1)|0),face:1+(rnd()*6|0)},
      wild:true,dicePerPlayer:5};
    same+=rank(input,sims,20260822,true)===rank(input,sims,20260822,false);
  }
  return same;
}
function stats(xs){
  const mean=xs.reduce((a,b)=>a+b,0)/xs.length;
  const variance=xs.reduce((s,x)=>s+(x-mean)**2,0)/(xs.length-1);
  return {mean,variance,sd:Math.sqrt(variance)};
}
const same=[],ind=[];
for(let s=1;s<=500;s++){
  const base=s*104729;
  const a=E.rolloutEV({count:5,face:5},fixed.hand,3,true,5,200,base);
  same.push(a-E.rolloutEV({count:5,face:6},fixed.hand,3,true,5,200,base));
  ind.push(a-E.rolloutEV({count:5,face:6},fixed.hand,3,true,5,200,
    base^0x5bd1e995));
}
console.log({same120,match400:stateMatch(400),match1500:stateMatch(1500),
  crn:stats(same),independent:stats(ind)});
NODE
```

实际输出：

```text
固定旧错排局面，120 个主种子、400 sims：
CRN 与独立候选种子首选相同 120/120；两边均 120 次选 5x5。

随机 N=3..6 状态：
400 sims：  首选相同 184/200 = 92%
1500 sims： 首选相同 196/200 = 98%

旧错排局面 5x5 - 5x6，500 个主种子、每候选 200 sims：
CRN 差值标准差          0.03393897
独立种子差值标准差      0.04252875
```

方差从 `0.00180869` 降到 `0.00115185`，约降 36%；默认 1,500 sims 下仍有 2% 随机状态改变首选。因此：

- 同意它在当前默认样本量下**对大多数最终动作低可观测**；
- 不同意“不可观测”；统计效果和少量动作变化都能量到；
- 保留 CRN 是正确选择；不把它做成容易受 Monte Carlo 波动影响的 fault-injection 闸门也是合理的。

结论：**已检查，未发现正确性问题。**

### rollout 结算与座位推进：已检查，未发现问题

- `cur=1, prev=0` 正确表示 hero 已经叫完，轮到下家；
- 叫牌为真时开的人 `cur` 喝，叫牌为假时上一位叫牌者 `prev` 喝；
- wild/斋的实际计数与 `myCount` 规则一致；
- 当前 UI 范围 N=2..8、dpp=5 下，合法 bid 单调推进，200 步 guard 不会成为正常终止路径；
- fault injection 把胜负方向、alive 方向、漏发玩家、永不开牌分别反转后，现有闸门都实际报红。

结论：**除预筛、信息集和 policy mismatch 外，结算与推进已检查，未发现问题。**

---

## 三、全部闸门与文件完整性

### Verify 闸门

严格按题目顺序串行执行：

```bash
node test/verify-dice.js
node test/verify-24.js
node test/verify-holdem.js
node test/verify-blackjack.js
```

实际结果：

```text
verify-dice.js       通过 173 / 失败 0
verify-24.js          通过  23 / 失败 0
verify-holdem.js      通过  41 / 失败 0
verify-blackjack.js   通过 101 / 失败 0
```

### Fault-injection 闸门

未并发执行任何 require 源码的任务；四组严格串行：

```bash
node test/fault-inject.js
node test/fault-24.js
node test/fault-holdem.js
node test/fault-blackjack.js
```

实际结果：

```text
fault-inject.js       抓到 21 / 漏网 0；复原后基线仍全绿
fault-24.js           抓到  4 / 漏网 0；复原后基线仍全绿
fault-holdem.js       抓到 14 / 漏网 0；复原后基线仍全绿
fault-blackjack.js    抓到 19 / 漏网 0；复原后基线仍全绿
```

### 临时改写复原确认

目录没有 `.git`，所以无法用 `git status` 检查；实际返回：

```text
fatal: not a git repository (or any of the parent directories): .git
```

我在 fault injection 前后分别执行：

```bash
find src test site -type f -print0 | sort -z |
  xargs -0 shasum -a 256 | shasum -a 256
```

前后输出完全一致：

```text
c703bb0a9df047e6c9fe9d52bd7f732868792df24b9c2ab289547ff2b1c27537  -
```

没有残留 `.bak` 或 `*~` 文件。故障注入的临时改写已全部复原。

---

## 放行前建议

1. 先修预筛：不能让已经被证伪的 2-ply 每个 face 只留一注；增加本文 `3 个 1` 的回归用例。
2. 明确定义部分手牌的信息语义，并保证当前与未来 hero 的信息集一致；结算可补骰，但策略函数不能无条件看到抽样出的 missing dice。
3. 让 rollout 的 future hero 执行与部署一致的 policy（或做迭代 policy evaluation），再重新判断是否还需要 N=2/N≥3 分界。
4. `barMove` 若声称等价于 `barPlayer`，应在窄集合上复用相同排序；随后重跑 `ranker-split`，不要沿用旧数字。
5. 让 `pChallenged` / `pTrueIfChallenged` 与最终 EV 使用同一 opponent distribution，并修正 `app.js:74` 的旧文案。

在前两项修好并加入能响的回归闸门之前，**不建议放行新 rollout。**
