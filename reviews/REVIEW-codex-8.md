可以放行。

# 吹牛骰子引擎第八轮定向复验（Codex）

日期：2026-08-22  
范围：只裁定第七轮遗留的（3），核对 `legalCount`、`candidatesConsidered` 与 `src/app.js` 三态；未修改 `src/`、`test/`、`site/`，未 commit，未部署。Codex 本轮唯一写入是本报告。  
仓库状态：该目录没有 `.git`，`git status --short` 实际报 `fatal: not a git repository`，无法提供 git diff。开始、结束检查均不存在 `.fault-injection.lock`。

## 裁定摘要

| 项目 | 裁定 | 依据 |
|---|---|---|
| 引擎 `legalCount` 与候选数分离 | **通过** | `analyze()` 独立计算 `legalRaises(...).length`；指定三局面实际为 8 / 35 / 0，`candidatesConsidered` 均为 0 |
| 前端三态 | **通过** | 无加注动作时再看 `legalCount`：0 报“叫到顶”，大于 0 报“还能往上叫”；有加注时才按 `rollout` / `model` 解释 |
| 原始浏览器反例 | **通过** | 3 人飞 `15个6` 显示“还能往上叫（还有 8 种）”且不含“叫到顶”；不飞反之 |
| 第四种情况：2 人局 | **通过** | 飞 `10个6` 为 `legalCount=6 / candidates=0`，页面显示“还能往上叫（还有 6 种）”；不飞为 `0 / 0`，页面显示“叫到顶” |
| `bid=null` / `hand=[]` / `dicePerPlayer!=5` | **通过** | 开局和空手牌页面正常；非 5 骰/人的引擎计数与直接 `legalRaises().length` 一致 |
| 新引入问题 | **未发现阻塞** | 正常 3 人 rollout 仍显示实际 6000 次与 CI；正常 2 人局仍显示 2-ply 说明；源码内存重建与 `site/index.html` 完全一致 |

（3）的事实错误已解决，且补查到的 2 人局 method 分支也已在最终快照修正；本轮可以放行。

## 0. 快照说明

审查过程中 `src/app.js`、`test/verify-dice.js`、`test/browser.py`、`site/index.html` 在 11:28 左右被外部更新；`test/verify-dice.js` 又在 11:32 修正测试命名并补了一条鉴别断言。Codex 没有修改这些文件。初始快照确有一个 2 人局遗漏：三态挂在 `method==='rollout'` 下，导致 2 人局只显示“两步前瞻模型”。我报告该反例后，当前快照已改为先判断是否存在加注动作，并补了闸门。

因此以下裁定全部以**最终快照**为准；我在更新后重新跑了主闸门和真实浏览器定向复现，没有沿用旧快照的通过结论。

最终快照 SHA-256：

```text
src/engine-dice.js  7f746e72ae471e5882d8c43f794b93d2a2b47aad8c65b29058e75ee60babc649
src/app.js          f4ad4dc11235f2e9766e888a3b6424c377063e03010d69ad5481b4c27dd792a7
test/verify-dice.js c507f3587081a7cde1359fd87ea0c8ee879ef30ee75e563afed52186df091d16
site/index.html     305a313465fc72df0a398389b295c71ec781efdc3fff1578abd001f6a14278ae
```

## 1. 指定主验证：最终快照 230 / 230

可运行：

```bash
node test/verify-dice.js
```

题目提交时是 220 条；外部更新补入 10 条边界与鉴别断言后，最终快照实际输出为：

```text
================================================================
  通过 230 / 失败 0
  全部通过
real 17.62
user 16.13
sys 0.16
```

退出码 `0`。相关实际输出：

```text
✅ 飞模式 15个6：legalCount=8（应为 8）
✅ 飞模式 5个1：legalCount=35（应为 35）
✅ 不飞 15个6：legalCount=0（应为 0）
✅ 2人局叫满(飞)：没有任何加注动作
✅ 2人局叫满(飞)：legalCount=6 与 legalRaises() 一致
✅ 2人局叫满(不飞)：没有任何加注动作
✅ 2人局叫满(不飞)：legalCount=0 与 legalRaises() 一致
✅ 每人3颗叫满(飞)：legalCount=7 与 legalRaises() 一致
✅ 且飞 15个6 并非叫到顶（legalCount=8 > 0）
```

初始快照的指定命令也实跑过，当时为 `220 / 220`、退出码 0、`real 13.58`；因最终快照已变化，不拿它代替上面的最终验证。

## 2. 引擎与前端三态一致性

### 2.1 引擎数据源正确分离

`src/engine-dice.js` 当前为：

```js
var legalCount = legalRaises(bid, N, wild, dpp).length;
var cands = candidateRaises(bid, hand, N, wild, dpp), finalists = [];
// ...
candidatesConsidered: cands.length,
legalCount: legalCount,
```

所以规则枚举数与通过 `pTrue>=0.02` 的候选数没有混用。指定三局面的可运行复现：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
for(const [name,bid,wild] of [
 ['飞 15个6',{count:15,face:6},true],
 ['飞 5个1', {count:5,face:1}, true],
 ['不飞 15个6',{count:15,face:6},false],
]) {
  const r=E.analyze({hand:[1,2,3,4,5],players:3,bid,wild,dicePerPlayer:5});
  console.log(name,{legalCount:r.legalCount,candidates:r.candidatesConsidered,
    raises:r.actions.filter(a=>a.kind==='raise').length,sims:r.sims});
}
NODE
```

实际输出：

```text
飞 15个6   { legalCount: 8,  candidates: 0, raises: 0, sims: 0 }
飞 5个1    { legalCount: 35, candidates: 0, raises: 0, sims: 0 }
不飞 15个6 { legalCount: 0,  candidates: 0, raises: 0, sims: 0 }
```

### 2.2 前端不再把规则态挂在计算方法上

`src/app.js` 最终结构是：

```js
var hasRaise = false, firstCI = null;
for (...) {
  if (r.actions[q].kind === 'raise') hasRaise = true;
  if (firstCI == null && r.actions[q].evCI != null) firstCI = r.actions[q].evCI;
}
if (!hasRaise)
  explain = r.legalCount === 0 ? '...叫到顶...' : '...还能往上叫...';
else if (r.method === 'rollout' && firstCI != null)
  explain = '...实际模拟次数与 CI...';
else
  explain = '...单挑两步前瞻模型...';
```

这覆盖的是完整状态组合，而不只是 3 人局：

| 是否有加注动作 | `legalCount` / method | 页面说明 |
|---|---|---|
| 否 | `0` | 规则上叫到顶 |
| 否 | `>0` | 规则上还能叫，但候选全被阈值滤掉 |
| 是 | `rollout` + CI | 实际模拟次数与 CI |
| 是 | `model` | 单挑 2-ply 模型 |

在当前引擎中，只要 `candidatesConsidered>0`，每个出现的点数档至少保留一个 finalist，不会凭淘汰阶段把全部加注动作清空；因此 UI 的 `!hasRaise` 与本次需要表达的“无可展示候选”一致。

## 3. 真浏览器定向复现

我对最终 `site/index.html` 启动本地静态服务，用 Playwright Chromium 真实点击。关键实际输出如下：

```text
3人飞 15个6：
规则上还能往上叫（还有 8 种），但成立概率都低到不值得考虑，只能开。「开」那一行是精确概率，没有模型成分。

3人不飞 15个6：
这注已经叫到顶了，规则上没有更高的叫法，只能开。「开」那一行是精确概率，没有模型成分。

2人飞 10个6：
规则上还能往上叫（还有 6 种），但成立概率都低到不值得考虑，只能开。「开」那一行是精确概率，没有模型成分。

2人不飞 10个6：
这注已经叫到顶了，规则上没有更高的叫法，只能开。「开」那一行是精确概率，没有模型成分。
```

上述四局面的备选列表都只有“开”一行，不出现“条形 = …”、模拟次数或空 CI。

正常分支也实际检查：

```text
3人空手牌开局：
条形 = 本轮不喝的概率：把这一注固定住，用建模的对手把这一轮真打完 6,000 遍数出来的（±1.3 个百分点）。

2人正常加注局面：
条形 = 本轮不喝的概率：单挑时用两步前瞻模型估的（实测单挑这样比全程模拟更准）。「开」那一行是精确概率，没有模型成分。
```

因此四类页面说明与引擎输出一致。

## 4. 题目点名的其他边界

可运行：

```bash
node <<'NODE'
const E=require('./src/engine-dice.js');
const cases=[
 ['opening/full', {hand:[1,2,3,4,5],players:3,bid:null,wild:true,dicePerPlayer:5}],
 ['opening/empty',{hand:[],players:3,bid:null,wild:true,dicePerPlayer:5}],
 ['empty 15x6',  {hand:[],players:3,bid:{count:15,face:6},wild:true,dicePerPlayer:5}],
 ['empty 5x1',   {hand:[],players:3,bid:{count:5,face:1},wild:true,dicePerPlayer:5}],
 ['4d wild top', {hand:[1,2,3,4],players:3,bid:{count:12,face:6},wild:true,dicePerPlayer:4}],
 ['4d plain top',{hand:[1,2,3,4],players:3,bid:{count:12,face:6},wild:false,dicePerPlayer:4}],
 ['7d wild top', {hand:[],players:3,bid:{count:21,face:6},wild:true,dicePerPlayer:7}],
];
for(const [name,o] of cases){const r=E.analyze(o); console.log(name,{
 legal:r.legalCount,direct:E.legalRaises(o.bid,o.players,o.wild,o.dicePerPlayer).length,
 candidates:r.candidatesConsidered,sims:r.sims,ci:r.actions.some(a=>a.evCI!=null)});}
NODE
```

实际输出：

```text
opening/full  { legal: 90, direct: 90, candidates: 44, sims: 6000, ci: true }
opening/empty { legal: 90, direct: 90, candidates: 51, sims: 6000, ci: true }
empty 15x6    { legal: 8,  direct: 8,  candidates: 0,  sims: 0,    ci: false }
empty 5x1     { legal: 35, direct: 35, candidates: 1,  sims: 6000, ci: true }
4d wild top   { legal: 7,  direct: 7,  candidates: 0,  sims: 0,    ci: false }
4d plain top  { legal: 0,  direct: 0,  candidates: 0,  sims: 0,    ci: false }
7d wild top   { legal: 11, direct: 11, candidates: 0,  sims: 0,    ci: false }
```

结论：

- `bid=null`：合法叫法 90，完整/空手牌都有候选和 CI，正常显示模拟说明。
- `hand=[]`：不会使 `legalCount` 错位；飞 `15个6` 仍是 8 / 0。空手牌飞 `5个1` 因未知骰更多，留下 1 个超过阈值的候选，回到正常模拟分支，合理。
- `dicePerPlayer!=5`：引擎始终用同一个 `dpp` 计算 `legalCount` 和候选；4 / 7 骰边界数值正确。当前 UI 固定传 5，页面不存在改变每人骰数的入口。

## 5. 新问题与验证限制

- 未发现本次修复引入的运行时阻塞。`src/app-shell.html` + 四引擎 + `src/app.js` 以内存方式重建后，与 `site/index.html` 字节完全一致：103351 bytes，SW version `fc399234ed`。
- 测试命名也已在最终快照纠正：飞 `15个6` 的相关断言改称“无候选”，并新增 `legalCount=8 > 0` 鉴别断言，不再把“没有值得细算的候选”混称为“规则上叫到顶”。
- 本轮没有运行四套 fault injection、完整 180 条浏览器套件、线上匿名或全量 band-safety；这些不用于支持本轮裁定，也没有写成“已验证”。实际运行的是最终 230 条、引擎边界矩阵、当前 bundle 一致性检查和本地 Chromium 定向复现。
- 没有“未验证的怀疑”作为放行保留项。
