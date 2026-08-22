# 数学与算法独立评审

日期：2026-08-22  
范围：仅审 `src/engine-dice.js`、`src/engine-24.js`、`src/engine-holdem.js`、`src/engine-blackjack.js` 的数学、规则和算法正确性；不审 UI 或代码风格。

## 结论摘要

发现 4 项已验证问题：

1. **高：三人吹牛骰的常数 `CONT` 会把正确加注排在“开”之后。** 这不是二项分布错误，而是把所有“下家不立刻开”的后续状态压成同一个常数造成的错误决策；对引擎自己的标定对手也能复现。
2. **中：吹牛骰展示的“被开也能活”取错了概率。** 返回的是无条件 `P(叫牌为真)`，不是 `P(叫牌为真 | 下家开牌)`；实测可显示 86.8%，而同一模型真正的条件概率只有 5.9%。
3. **中：Blackjack 的 `maxSplit` 完全没有生效。** 默认“一次分牌”规则本身算对了，但传入 0 或大于 1 都不会改变动作或 EV；某些规则组合会因此给错动作。
4. **中：Blackjack 的自然黑杰克 EV 忽略 `bjPay`。** `A,10` 对庄 6、3:2 赔率应为 `+1.5`，`advise` 却返回约 `+0.903`。

以下重点经检查未发现问题：

- `legalRaises` 的飞→斋 `ceil(x/2)`、斋→飞 `2x+1` 以及合法叫法全集；
- `challengeProb` 与 `evRaise` 的“下家手牌贡献 `j`”联合计算本身；
- Blackjack peek 后从 21 桶扣除庄家黑杰克再归一化；
- Hold’em 中“对手互相平分但都赢 hero”的判定；
- Hold’em 跨迭代复用部分 Fisher–Yates 数组；
- 24 点求解器在网站输入域（四张 1..13 整数牌）内的完备性与精确性；
- Hold’em 的 5/7 张评牌。

## 验证基线

实际执行结果：

```text
verify-dice.js       157 / 157
verify-24.js          23 / 23
verify-holdem.js      41 / 41
verify-blackjack.js   84 / 84
fault-inject.js       12 个预设故障全部抓到
fault-24.js            4 个预设故障全部抓到
```

目录中没有 `.git`，所以 `git status` 返回 `fatal: not a git repository`；本次用 SHA-256 前后对照确认 `src/`、`test/` 未改动。

---

## 已验证问题 1：`CONT` 的状态压缩会在三人局给错动作

**位置：** `src/engine-dice.js:119-125`、`src/engine-dice.js:136-150`、`src/engine-dice.js:195-200`

### 错误场景

输入：

```js
{
  hand: [5, 5, 2, 5, 3],
  players: 3,
  bid: { count: 5, face: 3 },
  wild: true,
  dicePerPlayer: 5
}
```

引擎输出：

```text
推荐：开
开牌 EV：       0.5592643398
最好加注：      5 个 5
加注模型 EV：   0.5541361472
```

因此引擎把“开”排第一。但把 `5 个 5` 作为首步固定下来，再按 `test/winrate-lib.js` 的标定对手继续完整打完一轮，200,000 局得到：

```text
加注实际不喝率：0.790005
95% CI：        ±0.001785
```

即在它自己的标定对手定义下，加注约 79.0%，明显优于开牌的精确值 55.93%，动作排序反了。

### 根因验证

对同一状态进一步拆分 300,000 局：

```text
                         引擎 2-ply       完整 rollout
下家立刻开概率             0.251506          0.241533
立刻被开时存活率           0.715248          0.688532
下家不立刻开后的存活率     固定 0.500000     0.822858
总存活率                   0.554136          0.790413
```

立刻开牌的两项预测相当接近；主要误差来自 `CONT[3] = 0.5`。`evRaise` 把任何 bid、手牌、下家贡献 `j` 下的继续分支都估成 0.5，但完整局中的继续价值是强烈依赖状态和座位的。本例真实条件继续价值约 0.823。

这也解释了为什么现有 `verify-dice.js` 全绿：其 `simulateModel` 在下家不开始终止时也直接加同一个 `cont`，验证的是代码是否忠实实现自身假设，不验证该假设能否代表完整一轮。

### 三人局与过拟合判断

实际重跑 `node test/winrate.js 50000`：

```text
2 人，工具 vs 酒桌玩家：落酒 37.2%，基准 50.0%（相对改善 26%）
3 人，工具 vs 酒桌玩家：落酒 32.6%，基准 33.3%（相对改善  2%）
4 人，工具 vs 酒桌玩家：落酒 17.7%，基准 25.0%（相对改善 29%）
```

对三人局把 `cont=0.30..0.75` 各跑 50,000 局，最好一格也只有 32.296%（基准 33.333%）；默认 0.50 是 32.716%。这说明根因不是“0.50 恰好没调准”，而是单一标量无法表达后续状态。

对“是否过拟合”的判断分两层：

- **已确认的方法学问题：** `test/calibrate.js:13-18` 用同一批 4,000 局同时选超参数和报最优值，没有 holdout；`barPlayer` 又复用了引擎的 `pBidTrue`、`legalRaises` 和相似阈值逻辑。这张表只能视为对该合成对手的 policy knob，不能视为可迁移的概率。
- **未验证的怀疑：** 它对真实酒桌玩家是否过拟合。仓库没有真人对局或独立 opponent model 数据，无法实证外推误差；不能仅凭合成模拟断言真人表现。

三人局特别弱的最可信根因是：下家继续后，只隔一名玩家动作就会重新轮到 hero，后续价值对“谁加了什么、第三家会不会开、回到 hero 时的新 bid”非常敏感；固定 `CONT` 丢掉了这些信息。二人局主要靠精确的直接开牌分支仍能获利，四人以上则有更多玩家在轮回到 hero 前吸收风险。

### 可运行复现

下面片段先打印错误排序；完整 rollout 使用的策略和随机阈值与 `test/winrate-lib.js` 相同。

```js
const E = require('./src/engine-dice.js');
const input = {
  hand:[5,5,2,5,3], players:3,
  bid:{count:5,face:3}, wild:true, dicePerPlayer:5
};
const a = E.analyze(input);
console.log(a.best.kind, a.challenge.ev);
console.log(a.actions.find(x => x.kind === 'raise'));
// 实际输出：challenge 0.5592643397856005
// 最好加注 5x5 的模型 EV = 0.5541361472358268
```

完整强制首步 rollout 的实际输出已在上面的“根因验证”中给出；采用固定 xorshift seed `314159265`，300,000 局。

可直接重跑该 rollout（从仓库根目录执行）：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
let s=314159265;
const rnd=()=>{s^=s<<13;s^=s>>>17;s^=s<<5;s|=0;return(s>>>0)/4294967296};
const roll=n=>Array.from({length:n},()=>1+(rnd()*6|0));
const count=(xs,f)=>xs.filter(x=>x===f||(f!==1&&x===1)).length;
const subjective=(bid,hand)=>E.pBidTrue(bid,hand,3,true,5);

function bar(tau,comfort){return (bid,hand)=>{
  if(subjective(bid,hand)<tau)return {challenge:true};
  const rs=E.legalRaises(bid,3,true,5);
  if(!rs.length)return {challenge:true};
  rs.sort((a,b)=>(a.count-b.count)||
    (E.myCount(hand,b.face,true)-E.myCount(hand,a.face,true)));
  for(const r of rs)if(subjective(r,hand)>=comfort)return {bid:r};
  let best=rs[0],p=-1;
  for(const r of rs){const q=subjective(r,hand);if(q>p){p=q;best=r}}
  return {bid:best};
}}
function tool(bid,hand){
  const x=E.analyze({hand,players:3,bid,wild:true,dicePerPlayer:5}).best;
  return x.kind==='challenge'?{challenge:true}:{bid:x.bid};
}

const hand=[5,5,2,5,3];
const input={hand,players:3,bid:{count:5,face:3},wild:true,dicePerPlayer:5};
const result=E.analyze(input);
const raise=result.actions.find(x=>x.kind==='raise');
let immediate=0, immediateAlive=0, continued=0, continuedAlive=0;
const N=300000;
for(let n=0;n<N;n++){
  const hands=[hand,roll(5),roll(5)], all=hands.flat();
  const policy=[tool,
    bar(.28+rnd()*.24,.30+rnd()*.20),
    bar(.28+rnd()*.24,.30+rnd()*.20)];
  let bid=raise.bid, cur=1, prev=0, move=policy[1](bid,hands[1]);
  if(move.challenge){
    immediate++;
    if(count(all,bid.face)>=bid.count)immediateAlive++;
    continue;
  }
  continued++; bid=move.bid; prev=1; cur=2;
  for(let guard=0;guard<100;guard++){
    move=policy[cur](bid,hands[cur]);
    if(move.challenge){
      const loser=count(all,bid.face)>=bid.count?cur:prev;
      if(loser!==0)continuedAlive++;
      break;
    }
    bid=move.bid; prev=cur; cur=(cur+1)%3;
  }
}
console.log({
  engineBest:result.best.kind,
  challengeEV:result.challenge.ev,
  modelRaiseEV:raise.ev,
  pImmediateChallenge:immediate/N,
  pSurviveIfImmediate:immediateAlive/immediate,
  pSurviveGivenContinue:continuedAlive/continued,
  rolloutRaiseEV:(immediateAlive+continuedAlive)/N
});
NODE
```

---

## 已验证问题 2：“被开也能活”用了无条件概率

**位置：** `src/engine-dice.js:148-156`、`src/engine-dice.js:185-191`，错误赋值在第 188 行。

`evRaise` 已经正确计算并返回 `pTrueIfChallenged`，但 `analyze` 又把：

```js
safety: pBidTrue(r, hand, N, wild, dpp)
```

作为“被开时的存活率”。下家是否开与他手里的命中数 `j` 强相关，所以通常有：

```text
P(真 | 被开) != P(真)
```

### 错误场景

```js
const E = require('./src/engine-dice.js');
const r = E.analyze({
  hand:[5,4,3,2,2], players:2,
  bid:{count:2,face:2}, wild:true, dicePerPlayer:5
});
console.log(r.best);
```

实际输出节选：

```text
best bid:             2 个 3
safety:               0.8683127572
pChallenged:          0.0209243599
pTrueIfChallenged:    0.0592474090
```

这里 hero 对 3 的贡献只有 1 个。无条件看，对手五颗骰至少再出一个 1/3 命中的概率是 86.8%；但对手几乎只会在自己没货时开，所以“真的已经被开”条件下，这注为真的概率仅 5.9%。

该字段不参与第 195 行的动作排序，所以它不是问题 1 的成因；但它会把风险显示反，足以让用户对推荐加注产生错误信心。正确的同模型字段已经存在，应是 `m.pTrueIfChallenged`。

---

## 吹牛骰其余检查

### `legalRaises`：已检查，未发现问题

**位置：** `src/engine-dice.js:87-113`

我没有只检查几个例子，而是写了独立合法性谓词，遍历：

- 玩家数 2..8；
- `wild=true/false`；
- 当前 count 从 1 到总骰数；
- 当前 face 1..6；
- 所有候选 count/face。

实际输出：

```text
currentBidsChecked: 2100
mismatchCount: 0
```

结论：

- 飞→斋包含且仅包含 `count >= ceil(x/2)`；偶数时允许等价换斋，如 6 个 5 → 3 个 1；
- 斋→飞包含且仅包含 `count >= 2x+1`；
- 飞→飞、斋→斋、不飞模式的同数升点/升数关系正确；
- 没有重复、遗漏、超出总骰数或保留当前叫牌本身；
- 开局正好枚举 `6*T` 个叫法。

### `challengeProb` / `evRaise` 的即时分支：已检查，未发现代数或条件化错误

**位置：** `src/engine-dice.js:128-157`

下家贡献 `j ~ Binom(dpp,p)`；下家主观概率只把自己手牌排除；hero 被开后的真牌概率再只对其余骰子积分。这三层的未知骰数量与条件关系是自洽的，没有重复计入下家手牌。

现有 6 个 analytic-vs-Monte-Carlo 用例全部通过；我在问题 1 的完整 rollout 中还独立观察到即时开牌概率 0.2515 vs 0.2415、被即时开时存活率 0.7152 vs 0.6885。差异来自 logistic 对手与标定用均匀阈值对手不是同一个函数，不是骰子计数错误。

因此：**2-ply 的即时分支没有内部矛盾；矛盾出现在把 state-dependent 的后续 value 当成固定“本轮不喝概率”，并继续以概率语义展示。**

---

## 已验证问题 3：Blackjack `maxSplit` 声明后完全未使用

**位置：** `src/engine-blackjack.js:21-30`、`src/engine-blackjack.js:127-140`、`src/engine-blackjack.js:157-165`

`defaults` 保存了 `maxSplit`，但 `splitEV` 没有“剩余可分次数”状态；抽到同点牌时直接当普通两张牌调用 `actions`，不会再次分牌。`advise` 也不根据 `maxSplit` 决定是否提供 split。

### 明确错误场景：禁止分牌仍推荐分牌

```js
const B = require('./src/engine-blackjack.js');
for (const maxSplit of [0,1,3]) {
  const r = B.advise([8,8], 10, {
    maxSplit, hitSoft17:false, das:true, surrender:true
  });
  console.log(maxSplit, r.best,
    r.actions.find(x => x.key === 'split').ev,
    r.actions.map(x => x.key));
}
```

实际输出三行完全相同：

```text
0 split -0.4894876232 [split,surrender,hit,stand,double]
1 split -0.4894876232 [split,surrender,hit,stand,double]
3 split -0.4894876232 [split,surrender,hit,stand,double]
```

`maxSplit:0` 时 split 是非法动作；合法动作中应选 surrender（`-0.5`），引擎却推荐 split。

### “只分一次”是否污染默认策略表

我另写了带全局剩余 split budget 的精确 DP。状态为 `(pendingHands, remainingSplits)`；每个待发牌的 split hand 抽到同点牌时，比较“当普通手打”与“再分成两个 pending hand”。结果：

```text
默认 maxSplit=1：engine splitEV 与独立 DP 最大误差 1.11e-16
扫描范围：S17/H17 × DAS/no-DAS × 10 种对子 × 10 张庄家明牌，共 400 格
```

所以“只分一次、分 A 后每手只发一张”作为一套明确规则时，当前默认格子是算对的。

若允许最多三次分牌，EV 会明显变化：

```text
8,8 对庄 7（不涉及 resplit aces）：0.211530 → 0.321042
A,A 对庄 7（允许 resplit aces）：   0.462889 → 0.626948
```

在常用的 peek=true、S17/H17、DAS/no-DAS 组合里，这些 EV 变化没有翻转 400 格中的首选动作；因此不能声称线上默认表因 resplit 缺失而有大量错格。

但在引擎已支持的组合 `peek:false, hitSoft17:true, maxSplit:3`，若 `maxSplit` 按注释也允许再次分 A，`A,A` 对庄 A 会翻转：

```text
engine：hit，EV -0.297825（旧 split EV -0.354467）
正确： split，resplit DP EV -0.290175
```

由于代码没有独立的 `resplitAces` 规则开关，这一场景的适用前提必须明确；但 `maxSplit` 被完全忽略本身是已确认事实。

---

## 已验证问题 4：自然黑杰克的 `bjPay` 没进入 `advise`

**位置：** `src/engine-blackjack.js:21-29`、`src/engine-blackjack.js:151-173`

`advise` 只设置 `isBlackjack`，仍把自然黑杰克当普通 21 点送入 `standEV`。`bjPay` 在整个引擎的 EV 计算中没有被读取。

### 错误场景

```js
const B = require('./src/engine-blackjack.js');
for (const bjPay of [1.5, 1.2]) {
  const r = B.advise([1,10], 6, {bjPay, peek:true});
  console.log(bjPay, r.best, r.bestEV);
}
```

实际输出：

```text
1.5 stand 0.90283674384258
1.2 stand 0.90283674384258
```

庄家明牌 6 不可能已经是 blackjack；自然黑杰克已经锁定赔率，所以正确 EV 分别是 `+1.5` 和 `+1.2`。动作“stand”没错，但金额 EV 明确错误。

`test/verify-blackjack.js:72-78` 在计算整体 house edge 时手工 special-case 了 player blackjack，因此整体 EV 测试绕开并掩盖了 `advise` 的这个错误。

---

## Blackjack 其余重点检查

### peek 归一化：已检查，未发现问题

**位置：** `src/engine-blackjack.js:45-76`

`d[21]` 在归一化前确实同时包含两张 blackjack 和多张牌组成的 21；但代码只减去已知两张 blackjack 分支的精确概率 `pBJ`，所以剩下的正是多张牌 21。随后全部结果除以 `1-pBJ`，就是条件分布 `P(result | no dealer BJ)`。

我用独立递归直接枚举第二张牌，并在抽第二张前排除 blackjack 补牌，结果：

```text
S17, up=A:  raw P(21)=0.3615581306, pBJ=0.3076923077
              engine peek P(21)=0.07780618858
              oracle peek P(21)=0.07780618858

S17, up=10: raw P(21)=0.1114243385, pBJ=0.07692307692
              engine peek P(21)=0.03737636673
              oracle peek P(21)=0.03737636673

S17/H17、up=A/10 四组最大绝对误差：5.55e-17
每组概率和：1
```

因此 `out[21] = (d[21] - pBJ) * scale` 是正确的，没有误删多张牌 21。

### 递归 hit/stand/double：已检查，未发现问题

无限副牌概率、soft ace 降级、S17/H17 停牌条件、double 一张后强制 stand 均自洽。现有 Monte Carlo 与解析 non-pair EV 对账通过；没有发现会翻转基本策略锚点的错误。

---

## Hold’em 检查

### 多人平局计数：已检查，未发现问题

**位置：** `src/engine-holdem.js:151-170`

怀疑场景“两个对手互相打平，但都赢 hero”不会误计 hero tie。只要第一个更高分对手出现，`beaten=true` 永不复原；后续 `os === best` 只有同时等于 `heroScore` 才增加 hero 的 `ties`。

定向复现：

```js
const H = require('./src/engine-holdem.js');
const h = xs => xs.map(H.parseCard);
console.log(H.equity(
  h(['3s','4d']),
  h(['Ah','Kh','Qh','Jh','2c']),
  [h(['Ts','9d']), h(['Tc','8d'])],
  1000
));
```

两名对手都以 Broadway straight 打平并胜过 hero。实际输出：

```text
{ win: 0, tie: 0, lose: 1, equity: 0, iters: 1000 }
```

hero 与若干对手共同最高时，`ties` 从 1 开始按同分人数增加，`tieShare += 1/ties` 也正确。

### 部分洗牌跨迭代复用：已检查，未发现偏差

**位置：** `src/engine-holdem.js:152-159`

一次 partial Fisher–Yates 从任意起始排列出发，前 `k` 位都是所有 ordered k-sample 的均匀分布；这个条件分布不依赖进入该轮时的排列。因此无需把 `d` 重置成最初的 `deck`，连续迭代也不会引入边际偏差或序列相关。

我对缩小模型 `n=5,k=3` 做了精确穷举：遍历全部 120 个可能的起始排列，再遍历每轮全部 `5*4*3=60` 条 swap 选择路径。实际输出：

```text
starts: 120
orderedPrefixes: 60
minDistinct: 60
maxDistinct: 60
badStarts: 0
```

每个任意起始排列都恰好生成全部 60 个有序前缀各一次；复用数组是正确优化。

### 5/7 张评牌与 equity 抽样：已检查，未发现问题

**位置：** `src/engine-holdem.js:35-114`、`src/engine-holdem.js:132-175`

- `eval5` 全部 `C(52,5)=2,598,960` 手的九类计数与组合数学精确一致；
- `eval7` 在 200,000 手随机七张牌上与 21 个 `eval5` 子集最大值全部一致；
- 三组固定 heads-up 手牌的 Monte Carlo equity 与穷举 `C(48,5)` 真值误差均小于 0.1 个百分点；
- 未发现 board 与未知对手发牌重用、重复牌或 tie share 错误。

---

## 24 点检查：已检查，未发现问题

**位置：** `src/engine-24.js:20-115`

除现有测试的 11,423 条返回表达式独立求值、用牌多重集复核和公开可解组合数检查外，我另写了一个实现路线不同的 BigInt subset DP：

- 每个 bitmask 只保存可达的规范化 BigInt 分数集合；
- 每个 mask 枚举两个不交子集的分割；
- 对 `+ - * /` 及非交换方向求闭包；
- 不保存表达式树，不调用引擎的 `rat/apply/search`。

遍历四张牌的全部非降组合：

```text
total: 1820
mismatchCount: 0
firstMismatch: null
```

因此在网站实际输入域 `1..13`、四张牌、目标 24 下，没有发现假阳性或漏解。精确有理数运算、除零保护、减除双向枚举和渲染括号也均通过现有独立表达式求值器。

说明：`solve` 注释称长度“任意”，但底层使用 JavaScript `Number` 存分子分母；若将来扩展到很多张牌或很大的整数，可能越过 `2^53-1`。这不影响当前四张 1..13 的产品输入域，故只记为**未验证的未来风险**，不列为现有 bug。

---

## 建议优先级

1. 先处理骰子 `CONT`：改成依赖 `(N, bid, hand summary, j, next seat)` 的 continuation value，或把 rollout 加深到至少完整轮回；在此之前不要把 raise EV 称为概率。
2. 将骰子第 188 行 `safety` 改用已经算好的 `m.pTrueIfChallenged`；若还想展示无条件真牌率，另设不含糊的字段名。
3. Blackjack 对 `isBJ` 直接返回规则赔率 EV，并增加 `bjPay=1.5/1.2` 回归测试。
4. 要么真正实现 `maxSplit`/`resplitAces`，要么删除该伪规则开关并明确固定为只分一次；至少先拒绝 `maxSplit:0` 时提供 split。
