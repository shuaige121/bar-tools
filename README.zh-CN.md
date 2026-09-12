# 酒桌工具箱 · bar.leonardchow.work

*[English](README.md)*

四个离线概率练习工具：手机快速录入，说明模型边界，并把时间成本算进收益。

**[打开 → bar.leonardchow.work](https://bar.leonardchow.work)** · 纯静态单文件 · 离线可用 · 可加主屏当 App · 所有计算在你手机本地完成

| 工具 | 做什么 |
|---|---|
| 🎲 **吹牛骰子** | 输入人数、你的骰子、上家叫的注 → 该开还是该往上叫，逐个叫法算胜率 |
| ♠♥ **德州扑克** | 手牌 + 公共牌 + 几个对手 → 打到河牌的胜率，以及底池要多大跟注才不亏 |
| **21点** | 你的牌 + 庄家明牌 → 要牌/停牌/双倍/分牌/投降，按精确 EV 排序；附 Hi-Lo 算牌 |
| **24点** | 四张牌 → 列出全部解法，精确有理数穷举 |

<p align="center">
  <img src="docs/screenshots/home.png" width="200">
  <img src="docs/screenshots/dice.png" width="200">
  <img src="docs/screenshots/holdem.png" width="200">
  <img src="docs/screenshots/blackjack.png" width="200">
</p>

---

## 为什么做这个

**作者本人不赌博。本站用于概率教育，让朋友看清庄家优势、抽水与时间成本，不提供投注服务。**

有庄家优势的玩法，玩家长期期望为负；单手正期望并不代表长期盈利。
玩家之间的零和游戏，全桌盈亏之和为零，不等于每个人收益都为零。
新加坡禁止未经许可或豁免的赌博；住家亲友社交赌博须满足条件，公共场所不适用该项豁免。
[法律依据：MHA](https://www.mha.gov.sg/what-we-do/maintaining-law-and-order/regulating-casino-and-gambling-industry/)。

| 工具 | 概率标注的边界 |
|---|---|
| 吹牛骰子 | 每轮结果取决于叫法、座位和对手策略，不统一写成 1/人数 |
| 德州扑克 | 对随机未知手牌的预期底池份额；多人平分按实际人数分配，不等于盈利概率 |
| 21点 | 单手 EV 与全局 EV 分开；无限副牌、可分牌后加倍、无投降示例：S17 −0.570%、H17 −0.789%、S17且6:5 −1.923% |
| 24点 | 数学练习，无赌博胜率 |

### 时间成本与净收益

分别累计全站和每个工具的可见停留时长，切后台、关屏暂停；刷新后保留。
后台旧标签页不会覆盖新累计值。页面外的游戏时间无法测量。

参考时薪 **S$12.04/小时** 来自 [MOM 快餐店柜台员 PWM](https://www.mom.gov.sg/employment-practices/progressive-wage-model/food-services-sector)，
适用期 **2026-07-01 至 2027-06-30**，覆盖符合条件雇主的公民／PR员工。
用于与麦当劳等快餐店打工作比较，**不是麦当劳官方报价或到手工资**，也不表示真的少领了工资。

**净收益 = 假设游戏收益 − 本工具使用时长 × 参考时薪。**

- 21点：输入假设累计初始下注额，选择明确的无投降规则计算长期收益示例。
- 德州、骰子：输入已扣抽水的假设净收益；不能从胜率直接推算现金收入。
- 默认金额均为0，表示不赌钱。24点从零金钱收益扣时间成本，学习和娱乐价值不作现金估值。

例：累计初始下注 S$1,000、示例收益率 −0.570%、一小时，得到 **−S$5.70 − S$12.04 = −S$17.74**。
这是期望值，不是对单次结果的保证。

首页使用 `localStorage['bar.lastUsed']` 按最近使用排序，未用过的保留默认顺序；
只在进入首页时排列，停留期间不跳动。牌面、计时和使用记录仅存本机。

本次发布见 [CHANGELOG](CHANGELOG.md)。

---

## 凭什么可信

赌桌上的工具，算错就是让人输钱。所以这个项目的重点不在功能，在**证明它没算错**。

### 数字锚在外部可查的事实上

| 引擎 | 锚点 |
|---|---|
| 德州评牌 | 枚举 C(52,5)=2,598,960 手牌，同花顺40 / 四条624 / 葫芦3744 / 同花5108 / 顺子10200 / 三条54912 / 两对123552 / 一对1098240 / 高牌1302540 —— 九个数必须与组合数学结果**精确相等** |
| 德州胜率 | 按牌型花色平均后 AA vs KK 实测 81.90%（公开引用 81.9%）、AKs vs QQ 46.0% |
| 21点 | 不内置策略表，从规则递归算 EV。无限副牌、可分牌后加倍、无投降规则下的整体期望：S17+DAS −0.570%、H17 −0.789%、21点只赔6:5 −1.923%，与公开的庄家优势一致 |
| 24点 | 1..13 四张牌共 C(16,4)=1820 组，可解 **1362** 组（74.8%），与公开常引用的数字一致 |
| 吹牛骰子 | 「这注成立」是精确二项尾概率，用 40 万次蒙特卡洛逐例校验到小数点后三位 |

### 闸门必须被证明会响

全绿不代表在验东西。每一层都配了故障注入：往引擎里注入具体错误，**确认对应的测试真的会失败**。

```
单元断言       395   node test/verify-{dice,24,holdem,blackjack}.js
故障注入        78   node test/fault-{inject,24,holdem,blackjack}.js   0 漏网
真浏览器       251   python3 test/browser.py      （含数字对账、牌面身份、触控目标）
线上匿名        28   python3 test/live-smoke.py   （含断网离线实测）
拇指可达性           python3 test/thumb-reach.py [宽 高]
```

`./build.sh` 跑完全部闸门后，把候选产物先摆到**临时目录**，让 `test/browser.py` 指向那份候选，
真浏览器也全过了才覆盖 `site/`。**中间任何一步失败，上一次通过的 `site/` 一个字节都不动。**
node 里测过的字节原样内联进 HTML（字面替换，不走正则），所以不存在"验了 A 发了 B"。

引擎故障注入只改临时副本，中断也不会污染工作区源码。

其中三条浏览器断言是**前端**故障注入：把牌面渲染在**内存里**改坏（红桃↔方块互换、
给无花色的 21点/24点 牌塞随机花色、把牌高改成 90px），每个变异都必须让对应闸门变红。
磁盘上的产物全程不动。

### 被外部评审攻过八轮

`reviews/` 里是完整记录：两个独立评审（一个只审数学、一个只审交互）来回八轮，报了 20+ 条问题，**每一条我都独立复现过，没有一条误报**。

它们抓到的东西里，最有价值的不是"算错了"，而是"**测试因为错误的原因通过了**"：

- 闸门测的是自己重算的公式，不是生产代码走的那条路 —— 改真实路径它不响
- 闸门扫的是 `NaN|undefined|Infinity`，而真实症状是 `±—` 加一句虚报的次数，症状不在扫描列表里
- 闸门把一个**事实错误**固化进了测试（断言某局面必须显示"叫到顶"，而它其实还有 8 个合法叫法）

这类缺陷靠自己读代码基本发现不了，因为写测试的人和写代码的人有同一套盲区。

---

## 跑起来

```bash
node --version            # 需要 Node 18+
pip install "playwright>=1.45" && playwright install chromium   # 浏览器测试用

./build.sh                # 跑全部闸门 → 产出 site/
python3 -m http.server 8000 --directory site
```

### 各层测试

```bash
node test/verify-dice.js          # 吹牛骰子引擎
node test/verify-holdem.js        # 德州（含 C(52,5) 全域普查）
node test/verify-blackjack.js     # 21点（含 40 万手蒙特卡洛对账）
node test/verify-24.js            # 24点（含 1820 组全域普查）

node test/fault-inject.js         # 故障注入：证明上面的闸门会响
node test/fault-holdem.js
node test/fault-blackjack.js
node test/fault-24.js

python3 test/browser.py           # 真浏览器：点击流 + 数字对账 + 几何断言
python3 test/live-smoke.py [url]  # 线上匿名验收（含断网离线）
python3 test/thumb-reach.py 375 667
python3 test/pwa-update.py site   # CSS-only SW update + offline reload
python3 test/responsive.py http://localhost:8000  # narrow / landscape / tablet flows   # 拇指可达性
```

### 性能与策略测量（非通过/失败）

```bash
node test/robustness.js       # 拿三种机制不同的局外对手测策略强度
node test/ranker-split.js     # 排序器按人数分界的证据表
node test/band-safety.js      # 淘汰带宽的全域安全扫描
node test/calibrate.js        # 参数标定
```

---

## 设计上几个非显然的决定

**吹牛骰子的排序器按人数分界**：`N≥3` 用 rollout（把这一轮用建模的对手真打完），`N=2` 用两步前瞻模型。这不是设计出来的，是量出来的 —— 单挑时 rollout 对 5 种对手全输给 2-ply，试了五档参数都救不回来。证据表在 `test/ranker-split.js`。

**淘汰只按噪声带砍，绝不按名次砍**：粗筛样本少、噪声大，真最优完全可能因为噪声排到第 5。按名次留前 N 会把它永久淘汰 —— 外部评审两次找到这样的反例。现在带宽随轮次收窄（4.5σ→3.5σ→3.0σ），全域扫描 17850 次检查 0 次砍掉真最优。

**「这注成立」是精确概率，「本轮不喝」是模拟值**，两者在界面上分开标注，模拟值附 95% 置信区间。非绝对确定时永远不显示 100%/0% —— 99.66% 四舍五入成"100%"在赌桌上是会让人输钱的谎。

**21点 / 24点 的牌不带花色，也绝不虚构一个**：21点引擎已经把 J/Q/K 并成"10 点"，它根本不知道你手上具体是哪张，画成黑桃K 就是在暗示系统知道得更多。这两个工具用无花色的双角标牌，并在"我的牌"旁边写明"10 含 J/Q/K"。德州的牌有真实点数和花色，用双角标 + 内联 SVG 花色；测试端靠**花色形状自己的几何**认花色（红桃顶部中心有凹口、方块有下尖角），不读渲染器自己给的 `data-c` 自证。

**24点用精确有理数**：但实测发现这在 4 张 1..13 的范围内是防御性的而非救命的 —— 不存在落在 24±0.001 内却不等于 24 的表达式值。这条写进代码注释了，免得下次又想当然。

---

## 结构

```
src/engine-dice.js        吹牛骰子：二项分布 + rollout + 逐轮淘汰
src/engine-holdem.js      德州：5张/7张评牌 + 蒙特卡洛胜率
src/engine-blackjack.js   21点：从规则递归算 EV
src/engine-24.js          24点：精确有理数穷举
src/app-shell.html        外壳 + 全部样式
src/app.js                路由 + 四个工具的界面
build.sh                  闸门 → 内联引擎 → 产出 site/
test/                     四层测试
reviews/                  八轮外部评审的完整记录
```

## 部署

```bash
set -a; source ~/.claude/.env; set +a
export CLOUDFLARE_API_TOKEN=$CF_API_TOKEN CLOUDFLARE_ACCOUNT_ID=<your-account-id>
NODE_OPTIONS="--require $PWD/force-ipv4.js" \
  npx wrangler pages deploy site --project-name bar-tools --branch main --commit-dirty=true
python3 test/live-smoke.py     # 部署后必跑
```

`force-ipv4.js` 是绕本机 IPv6 黑洞的猴补丁（wrangler/undici 会优先走 IPv6，不加会 `fetch failed`）。

## License

MIT
