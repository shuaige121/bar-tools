仍不可放行：阻塞项是阻塞1仍有可复现的“全局真最优没进决赛圈”反例（`hand:[4,6,4,4,1], N=3, bid:null, seed=2111`）；阻塞2已解除，另发现推荐“开”时 CI 文案显示 `±NaN` 的新回归。

# 吹牛骰子引擎第五轮定向复验（Codex）

日期：2026-08-22  
范围：只裁定第四轮遗留的两条阻塞，并轻量检查本轮逐轮淘汰、代价上限、自适应样本和确定性同分逻辑；未重跑其他套件。未修改 `src/`、`test/`、`site/`，未 commit，未部署；本文件是唯一写入。  
当前快照：`src/engine-dice.js` SHA-256 `91b73b452f1ef95e203f05d160bd404bd42a803d8b12bad708fa0b70a423bc59`；`test/verify-dice.js` SHA-256 `4bc734d3667ce1ca4f41245b5a18ff6faaff99265093944b64224942c5d21eac`；`test/fault-inject.js` SHA-256 `de400a1263596b9a07ddb7314e12b47178a0d3a725403d5148cdd2451e98174e`；`site/index.html` SHA-256 `8b4b96578d61f44a4b14e767fc63f7eaecc35ac551e363c4c05b1fae547b56c6`。  
仓库状态：该目录没有 `.git`，`git status --short` 实际报 `fatal: not a git repository`，因此不能提供 git diff；本轮用静态审查、哈希和定向运行取证。

## 裁定摘要

| 项目 | 裁定 | 依据 |
|---|---|---|
| 阻塞1：真最优不被粗筛淘汰 | **不解除** | 名次 cap 的确全部删除了，但 `seed=2111` 时 `6个4` 在首轮以 `0.680 < 0.681131...` 被 3σ cutoff 淘汰；三组独立、全合法叫法各 50,000 局均确认它是第一 |
| 阻塞2：N=2 的 `pTrueIfChallenged` 锁 | **解除** | 生产字段与 2-ply 同源；只把这个字段换回 `immediateStats` 的内存变异使测试从 `198/0` 变成 `197/1`，且只响新增断言 |
| 新增检查 | **有一处确定回归** | N≥3 推荐“开”时 `actions[0]` 没有 `evCI`，UI 仍计算它，显示 `±NaN 个百分点` |

## 1. 指定主验证：198 / 198

可运行：

```bash
node test/verify-dice.js
```

实际输出（尾部）：

```text
================================================================
  通过 198 / 失败 0
  全部通过
real 7.95
```

退出码 `0`。开跑前后均为 `NO_FAULT_LOCK`。

## 2. 阻塞2已真正解决：单字段内存变异会准确报警

我没有运行会改写源码的整套 fault injection；按题意使用 Node module loader，在内存里编译 mutant，并让 `verify-dice.js` 的 require 命中该 mutant。磁盘源码没有写入，运行前后也没有 `.fault-injection.lock`。

可运行复现：

```bash
node <<'NODE'
const fs = require('fs');
const path = require('path');
const Module = require('module');
const enginePath = path.resolve('src/engine-dice.js');
const verifyPath = path.resolve('test/verify-dice.js');
const from = 'pTrueIfChallenged: st.pTrueIfChallenged,';
const to = 'pTrueIfChallenged: immediateStats(c.bid, hand, N, wild, dpp).pTrueIfChallenged,';
const original = fs.readFileSync(enginePath, 'utf8');
const matches = original.split(from).length - 1;
if (matches !== 1) throw new Error(`mutation match count=${matches}, expected 1`);

const mutant = new Module(enginePath, module);
mutant.filename = enginePath;
mutant.paths = Module._nodeModulePaths(path.dirname(enginePath));
mutant._compile(original.replace(from, to), enginePath);

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
❌ N=2 的 pTrueIfChallenged 也来自 2-ply  null vs 1
通过 197 / 失败 1
失败项: N=2 的 pTrueIfChallenged 也来自 2-ply
```

退出码 `1`。变异只替换 1 处；在主验证覆盖的默认分界下，N≥3 rollout 本来就以 `immediateStats` 产生 `st`，本次目标行为差异落在 N=2。新增的同源断言和“两套模型确实不同”对照都有效，第四轮指出的测试缺口已补上。

## 3. 阻塞1不解除：找到了真最优没进决赛圈的反例

### 3.1 名次 cap 确实已删除，但目标性质仍不成立

当前逐轮代码没有 `slice`、top-N 或每点数数量 cap；每轮确实逐点数保留 `coarse >= top - 3*se` 的全部候选。这解决了第四轮 `seed=458` 的**名次截断机制**。

但“误差来自抽样”与“真最优是否被永久排除”是两个不同问题：抽样噪声可以解释误删的来源，却不会让被删的动作重新进入精算。题目要求我寻找“真最优没进决赛圈”的反例，并明确说找到即是真阻塞；当前实现存在这样的支持参数反例。

局面：

```text
hand=[4,6,4,4,1], players=3, bid=null, wild=true, dicePerPlayer=5, seed=2111
```

首轮 250 局中，同点数档的最高粗分是 `4个4=0.776`；真最优 `6个4=0.680`。代码使用的单候选 `se=sqrt(0.25/250)`，所以 cutoff 是：

```text
0.776 - 3 * sqrt(0.25/250) = 0.6811316701949487
```

于是 `0.680 < 0.6811316701949487`，`6个4` 在第一轮被永久淘汰，只越界约 0.11pp。

可运行复现（先直接查看首轮，再走生产 `analyze()`，最后对全部合法叫法作独立高样本确认）：

```bash
node <<'NODE'
const E = require('./src/engine-dice.js');
const hand = [4,6,4,4,1], N = 3, seed = 2111, n = 250;
const face4 = E.candidateRaises(null, hand, N, true, 5)
  .filter(b => b.face === 4)
  .map(b => ({bid:b, ev:E.rolloutEV(b, hand, N, true, 5, n, seed)}))
  .sort((a,b) => b.ev-a.ev);
const target = face4.find(x => x.bid.count === 6);
const cut = face4[0].ev - 3*Math.sqrt(0.25/n);
console.log('coarse', {top:face4[0], target, cut, kept:target.ev >= cut});

const r = E.analyze({hand, players:N, bid:null, wild:true, dicePerPlayer:5, seed});
console.log('analyze', {
  best:r.best.bid, finalists:r.finalists.length, sims:r.sims,
  has6x4:r.finalists.some(b => b.count===6 && b.face===4)
});

const universe = E.legalRaises(null, N, true, 5);
for (const truthSeed of [19391,73013,99173]) {
  const xs = universe.map(b => ({bid:b,
    ev:E.rolloutEV(b, hand, N, true, 5, 50000, truthSeed)}))
    .sort((a,b) => b.ev-a.ev);
  console.log('truth', truthSeed, xs.slice(0,3));
}
NODE
```

实际输出（对象压成单行）：

```text
coarse { top:{bid:{count:4,face:4},ev:0.776},
         target:{bid:{count:6,face:4},ev:0.68},
         cut:0.6811316701949487, kept:false }
analyze { best:{count:5,face:4}, finalists:12, sims:3750, has6x4:false }
truth 19391: 6个4=0.76314, 5个4=0.75076, 4个4=0.74106
truth 73013: 6个4=0.76804, 5个4=0.75430, 4个4=0.74410
truth 99173: 6个4=0.77038, 5个4=0.75566, 4个4=0.74300
```

三组 truth 都是**全部合法叫法**各跑 50,000 局；三次第一名均为 `6个4`，不是只在 face=4 或引擎候选集内对账。生产 `analyze()` 的 finalist 明确不含它。因此现有 `【6c-2】4 个局面 × 4 个种子` 的绿灯被同一个已知局面的第 5 个 seed 直接反驳。

### 3.2 为什么当前“3σ”不能证明“统计上确实更差”

代码的 `sqrt(0.25/n)` 是**一个 Bernoulli 均值**的最坏情形标准误；淘汰判断比较的是“样本最高候选减当前候选”这一个差值，而且最高候选还是在多候选中用同一批数据选出来的。当前实现没有计算 paired difference 的方差，也没有处理每点数多候选、最多三轮带来的 multiple comparisons。

即使先按两个独立 Bernoulli 均值的最坏情形近似，差值的 SE 也是 `sqrt(0.5/n)`，250 局下 3σ 为 13.42pp，而当前阈值是 9.49pp。代码使用 CRN，实际 paired SE 可能更小，但必须从配对结果估计，不能直接拿单臂 SE 代替。这个统计口径缺口正好在 `seed=2111` 上表现为假阴性。

`【6c-2】` 也不是“精确真值闸门”：它用固定 seed 的 3,000 局 Monte Carlo 在全合法叫法中选 oracle，只是可复现，不是数学精确；并且只覆盖 4 个局面 × 4 个 seed。它有回归价值，但不足以支持“真最优不会被淘汰”的全称结论。

### 3.3 解除阻塞1还需要什么

最低要求：

1. 把上面的 `seed=2111` 加入 finalist 回归，oracle 必须对**全部合法叫法**取值，并用足以稳定分出第一名的独立高样本或配对 CI；断言 `6个4` 在 `finalists`。
2. 淘汰判据改为真正针对候选差值的同时置信界。更省样本的做法是保留 CRN，并记录每局各候选的 0/1 结果，直接估计 `top - candidate` 的 paired variance；只有差值的 simultaneous lower bound 大于 0 才淘汰。对候选和轮次用 Bonferroni/Holm 或 time-uniform bound 控制 family-wise error。
3. 预算触顶时保留所有“尚未证明显著更差”的候选进入决赛，而不是为了凑固定数量继续砍。这样明显差的候选仍可在 250/1000 局快速退出，只有约 2pp 的近邻留到精算，不需要把 26 个候选一律各跑约 5,000 局。

若产品要求的是“对每一个 seed 都绝不误删真最优”，有限 Monte Carlo 淘汰无法给确定性保证；只能不做有损淘汰，或计算模型期望的精确值。现实可验证的放行标准应写成明确的错误概率上限，并配一个覆盖固定局面库、边界 seed 库的高样本回归，而不是把 4×4 通过称为精确保证。

仅把当前带宽机械放宽到 `3*sqrt(0.5/n)` 并加入 `seed=2111`，可以作为便宜的短期缓解，但仍没有处理 CRN 的实际 covariance、winner selection 和 multiple comparisons，不能单独当成性质证明。

## 4. 本轮改动的轻量旁查

### 4.1 自适应样本和代价上限：默认路径未见新的引擎错误

本机单次实测：

```text
3p: 115.7ms, finalists=13, sims=3462, finalCost=45006
4p:  81.9ms, finalists= 8, sims=5625, finalCost=45000
6p:  64.7ms, finalists= 7, sims=6000, finalCost=42000
8p: 242.1ms, finalists=26, sims=1731, finalCost=45006
```

`45006` 来自 `Math.round(45000/finalists)`，只比名义预算多 6 局，不构成实质问题。8 人局本机单次低于 300ms；**手机真机耗时未验证**。逐轮“≤8 提前停”和“下一轮成本超过 45000 就停”的控制流与题述一致。

### 4.2 确定性同分：实现存在，但只作用于同一点数档

同一点数内，最终分数差不超过 `tie` 时确实按精确 `pTrue` 较高、再按 count 较低选择，没有发现 slice/cap 回流。不同点数之间仍由最后的 raw `ev` 排序；这与代码注释“每个点数只留最好的一注”的范围一致。本轮没有把跨点数的抽样波动另立为阻塞。

注释写“1 个标准误”，实现实际使用 `1.96 * sqrt(0.25/simsFinal)`，即最坏情形 95% 单臂半宽；这是文案口径不一致，非本轮阻塞。

### 4.3 新回归：推荐“开”时显示 `±NaN 个百分点`

`src/app.js` 和内联的 `site/index.html` 都在 rollout 模式下无条件读取 `r.actions[0].evCI`。但 challenge 是精确动作，没有 `evCI`；当它排第一时，表达式产生 `NaN`。

可运行复现：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
const r=E.analyze({hand:[2,3,4,5,6],players:3,
  bid:{count:15,face:6},wild:true,dicePerPlayer:5});
console.log({method:r.method,best:r.best,
  displayed:`±${(r.actions[0].evCI*100).toFixed(1)} 个百分点`});
NODE
```

实际输出：

```text
{ method: 'rollout',
  best: { kind: 'challenge', ev: 1, pBidTrue: 0, exact: true },
  displayed: '±NaN 个百分点' }
```

这是确定性、用户可见的新问题，不是未验证的怀疑。应在 best 为 challenge 时说明“开是精确概率”，并从首个 raise 或 `r.sims` 取得 rollout 候选的误差；若没有 raise，则不要声称把“这一注”模拟了若干遍。

## 最终判定

- 阻塞2：**解除**。
- 阻塞1：**不解除**；不是为了要求 2pp 候选必须稳定选对，而是因为题目指定的更弱性质“真最优必须进决赛圈”本身已经被 `seed=2111` 反例否定。
- 另外修复 CI 的 `NaN` 展示回归后再放行。
