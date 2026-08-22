/* 蒙特卡洛 + 结构性验证。任何一条不过就不许上线。 */
const E = require('../src/engine-dice.js');

let PASS = 0, FAIL = 0;
const fails = [];
function ok(name, cond, detail) {
  if (cond) { PASS++; console.log(`  ✅ ${name}`); }
  else { FAIL++; fails.push(name); console.log(`  ❌ ${name}  ${detail || ''}`); }
}
function close(name, a, b, tol, extra) {
  ok(`${name}  (${a.toFixed(5)} vs ${b.toFixed(5)}, tol ${tol})`, Math.abs(a - b) <= tol,
     extra || `diff=${Math.abs(a - b).toFixed(5)}`);
}

// 固定种子 PRNG，让失败可复现
let _s = 20260821;
function rnd() { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; _s |= 0; return ((_s >>> 0) / 4294967296); }
const die = () => 1 + Math.floor(rnd() * 6);
const rollN = n => Array.from({ length: n }, die);

const countFace = (dice, face, wild) =>
  dice.filter(d => d === face || (wild && face !== 1 && d === 1)).length;

// ══════════════════════════════════════════════════════════════
console.log('\n【1】二项分布自洽');
for (const [n, p] of [[5, 1/3], [10, 1/6], [55, 1/3], [0, 1/3]]) {
  let s = 0; for (let k = 0; k <= n; k++) s += E.binomPMF(n, k, p);
  close(`PMF 求和=1  n=${n} p=${p.toFixed(3)}`, s, 1, 1e-9);
}
ok('binomGE(n, r<=0) = 1', E.binomGE(10, 0, 1/3) === 1 && E.binomGE(10, -3, 1/3) === 1);
ok('binomGE(n, r>n) = 0', E.binomGE(10, 11, 1/3) === 0);
ok('binomGE(0, 1, p) = 0  (零颗未知骰不可能凑出1个)', E.binomGE(0, 1, 1/3) === 0);
ok('binomGE(0, 0, p) = 1', E.binomGE(0, 0, 1/3) === 1);
close('binomGE 尾部互补 n=20 r=7', E.binomGE(20, 7, 1/3) + (() => {
  let s = 0; for (let k = 0; k <= 6; k++) s += E.binomPMF(20, k, 1/3); return s; })(), 1, 1e-9);

// ══════════════════════════════════════════════════════════════
console.log('\n【2】P(叫牌为真) vs 蒙特卡洛  — 概率层的核心闸门');
const TRIALS = 400000;
const cases = [
  { N: 2, hand: [1, 3, 3, 5, 6], bid: { count: 5, face: 3 }, wild: true },
  { N: 2, hand: [2, 2, 4, 4, 6], bid: { count: 4, face: 6 }, wild: true },
  { N: 3, hand: [1, 1, 2, 5, 5], bid: { count: 7, face: 5 }, wild: true },
  { N: 4, hand: [6, 6, 6, 2, 3], bid: { count: 9, face: 6 }, wild: true },
  { N: 5, hand: [1, 2, 3, 4, 5], bid: { count: 12, face: 4 }, wild: true },
  { N: 3, hand: [1, 1, 1, 4, 4], bid: { count: 4, face: 1 }, wild: true },   // 斋叫
  { N: 4, hand: [1, 1, 3, 3, 3], bid: { count: 3, face: 1 }, wild: true },   // 斋叫
  { N: 3, hand: [2, 2, 5, 5, 5], bid: { count: 6, face: 5 }, wild: false },  // 不飞
  { N: 2, hand: [4, 4, 4, 4, 4], bid: { count: 6, face: 4 }, wild: true },   // 手握5个
  { N: 6, hand: [3, 3, 1, 1, 6], bid: { count: 14, face: 3 }, wild: true },
];
for (const c of cases) {
  const analytic = E.pBidTrue(c.bid, c.hand, c.N, c.wild, 5);
  const k = countFace(c.hand, c.bid.face, c.wild);
  let hit = 0;
  for (let t = 0; t < TRIALS; t++) {
    if (k + countFace(rollN(5 * (c.N - 1)), c.bid.face, c.wild) >= c.bid.count) hit++;
  }
  const mc = hit / TRIALS;
  const tol = 3.5 * Math.sqrt(Math.max(mc * (1 - mc), 1e-6) / TRIALS) + 0.0015;
  close(`N=${c.N} ${c.wild ? '飞' : '不飞'} 手=[${c.hand}] 叫 ${c.bid.count}个${c.bid.face}`, analytic, mc, tol);
}

// ══════════════════════════════════════════════════════════════
console.log('\n【3】合法加注枚举：无重复 / 严格递增 / 斋规则');
function bidKey(b) { return `${b.count}-${b.face}`; }
for (const N of [2, 3, 5]) for (const wild of [true, false]) {
  for (const cur of [{ count: 3, face: 4 }, { count: 6, face: 6 }, { count: 2, face: 1 }, { count: 1, face: 2 }]) {
    const rs = E.legalRaises(cur, N, wild, 5);
    const keys = rs.map(bidKey);
    ok(`无重复  N=${N} wild=${wild} 当前${cur.count}个${cur.face}`, new Set(keys).size === keys.length,
       `${keys.length} vs ${new Set(keys).size}`);
    ok(`不超过总骰数 ${N * 5}`, rs.every(r => r.count >= 1 && r.count <= N * 5));
    ok(`不含当前叫牌本身`, !keys.includes(bidKey(cur)));
    if (wild && cur.face !== 1) {
      const zhai = rs.filter(r => r.face === 1);
      ok(`飞→斋 下限 = ceil(${cur.count}/2) = ${Math.ceil(cur.count / 2)}`,
         zhai.length > 0 && Math.min(...zhai.map(r => r.count)) === Math.ceil(cur.count / 2));
      const fei = rs.filter(r => r.face !== 1);
      ok(`飞→飞 严格递增`, fei.every(r => r.count > cur.count || (r.count === cur.count && r.face > cur.face)));
    }
    if (wild && cur.face === 1) {
      const fei = rs.filter(r => r.face !== 1);
      ok(`斋→飞 下限 = 2*${cur.count}+1 = ${2 * cur.count + 1}`,
         fei.length === 0 || Math.min(...fei.map(r => r.count)) === 2 * cur.count + 1);
      ok(`斋→斋 严格递增`, rs.filter(r => r.face === 1).every(r => r.count > cur.count));
    }
    if (!wild) ok(`不飞：全序递增`, rs.every(r => r.count > cur.count || (r.count === cur.count && r.face > cur.face)));
  }
}
{ // 开局：应枚举全部 6*T 种
  const rs = E.legalRaises(null, 3, true, 5);
  ok('开局枚举 = 6 × 总骰数', rs.length === 6 * 15, `got ${rs.length}`);
}

// ══════════════════════════════════════════════════════════════
console.log('\n【4】evRaise 代码 vs 其声明的模型  — 逐局模拟同一套规则');
function simulateModel(bid, hand, N, wild, dpp, opt, trials) {
  const p = E.faceProb(bid.face, wild);
  const k = E.myCount(hand, bid.face, wild);
  const cont = E.contFor(N);          // 必须跟引擎取同一个值，否则对账的是两套模型
  let acc = 0;
  for (let t = 0; t < trials; t++) {
    const bDice = rollN(dpp);
    const j = countFace(bDice, bid.face, wild);
    const ch = E.challengeProb(bid.count, j, N, wild, bid.face, dpp, opt);
    if (rnd() < ch) {
      const others = countFace(rollN(dpp * (N - 2)), bid.face, wild);
      acc += (k + j + others >= bid.count) ? 1 : 0;      // 被开：真则我不喝
    } else {
      acc += cont;                                        // 未被开：截断值
    }
  }
  return acc / trials;
}
const opt = E.DEFAULTS;
for (const c of [
  { N: 2, hand: [1, 3, 3, 5, 6], bid: { count: 4, face: 3 }, wild: true },
  { N: 3, hand: [2, 2, 2, 4, 6], bid: { count: 6, face: 2 }, wild: true },
  { N: 4, hand: [1, 1, 5, 5, 5], bid: { count: 10, face: 5 }, wild: true },
  { N: 5, hand: [3, 4, 5, 6, 2], bid: { count: 9, face: 6 }, wild: true },
  { N: 3, hand: [1, 1, 1, 2, 3], bid: { count: 4, face: 1 }, wild: true },
  { N: 4, hand: [6, 6, 2, 2, 2], bid: { count: 7, face: 2 }, wild: false },
]) {
  const analytic = E.evRaise(c.bid, c.hand, c.N, c.wild, 5, opt).ev;
  const mc = simulateModel(c.bid, c.hand, c.N, c.wild, 5, opt, 300000);
  close(`EV N=${c.N} 手=[${c.hand}] 加注 ${c.bid.count}个${c.bid.face}`, analytic, mc, 0.006);
}

// ══════════════════════════════════════════════════════════════
// 【4a】challengeProb 的方向与单调性 —— 不经过它自身，纯行为断言。
// 存在理由：测试【4】用引擎自己的 challengeProb 做模拟，是自我指涉的，
// 方向写反时两边一起反、测试全绿。故障注入抓到过这个漏网，才补的这一节。
console.log('\n【4a】下家开牌模型的方向与单调性（独立于自身的断言）');
{
  const opt = E.DEFAULTS, N = 3, dpp = 5, T = N * dpp;   // 15 颗骰
  // 荒谬到不可能为真的注 → 几乎必开
  ok('叫满 15个6、下家手上一个都没有 → 开牌概率 > 0.95',
     E.challengeProb(15, 0, N, true, 6, dpp, opt) > 0.95,
     `got ${E.challengeProb(15, 0, N, true, 6, dpp, opt).toFixed(4)}`);
  // 白送的注 → 几乎不开
  ok('叫 1个6 → 开牌概率 < 0.05',
     E.challengeProb(1, 0, N, true, 6, dpp, opt) < 0.05,
     `got ${E.challengeProb(1, 0, N, true, 6, dpp, opt).toFixed(4)}`);
  // 方向：自己手上这个点越多，越不该开
  let monoJ = true, prevJ = -1;
  for (let j = 0; j <= dpp; j++) {
    const c = E.challengeProb(8, j, N, true, 6, dpp, opt);
    if (prevJ >= 0 && c > prevJ + 1e-12) monoJ = false;
    prevJ = c;
  }
  ok('手上该点越多 → 开牌概率单调不增', monoJ);
  ok('手上0个 比 手上4个 更想开',
     E.challengeProb(8, 0, N, true, 6, dpp, opt) > E.challengeProb(8, 4, N, true, 6, dpp, opt) + 0.1);
  // 方向：叫得越高越该开
  let monoC = true, prevC = -1;
  for (let c = 1; c <= T; c++) {
    const v = E.challengeProb(c, 2, N, true, 6, dpp, opt);
    if (prevC >= 0 && v < prevC - 1e-12) monoC = false;
    prevC = v;
  }
  ok('叫的个数越高 → 开牌概率单调不减', monoC);
  ok('概率恒在 [0,1]', [0,3,8,15].every(c => [0,2,5].every(j => {
    const v = E.challengeProb(c, j, N, true, 6, dpp, opt); return v >= 0 && v <= 1; })));
  // 跨路径恒等式：challengeProb 必须 == 从下家座位算出的 pBidTrue 过 logistic。
  // pBidTrue 已被蒙特卡洛验过，所以这条同时钉死了"B 的未知骰池大小"和"开牌方向"。
  // 存在理由：故障注入发现把 unknownToB 写成全场骰数时，方向/单调性测试全都察觉不到。
  {
    let idOK = true, worst = 0, worstMsg = '';
    for (const NN of [2, 3, 5]) for (const w of [true, false]) for (const f of [1, 3, 6]) {
      const filler = (f === 3) ? 4 : 3;                      // 既不是 f 也不是万能1
      for (let j = 0; j <= 5; j++) {
        const bHand = Array(j).fill(f).concat(Array(5 - j).fill(filler));
        if (E.myCount(bHand, f, w) !== j) { idOK = false; worstMsg = `构造的手牌贡献不对 f=${f} j=${j}`; break; }
        for (const cnt of [1, 3, 6, NN * 5]) {
          const pB = E.pBidTrue({ count: cnt, face: f }, bHand, NN, w, 5);   // 从 B 的座位看
          const expect = 1 / (1 + Math.exp((pB - E.DEFAULTS.tau) / E.DEFAULTS.soft));
          const got = E.challengeProb(cnt, j, NN, w, f, 5, E.DEFAULTS);
          const d = Math.abs(expect - got);
          if (d > worst) { worst = d; worstMsg = `N=${NN} wild=${w} ${cnt}个${f} j=${j}: 期望${expect.toFixed(6)} 实得${got.toFixed(6)}`; }
          if (d > 1e-9) idOK = false;
        }
      }
    }
    ok('challengeProb ≡ logistic(下家座位上的 pBidTrue)', idOK, worstMsg);
  }

  // 语义：荒谬加注必须被标为高风险。打在 evRaise 这一层——
  // analyze 现在只把"每个点数最好的一注"送进 rollout，不再返回全部合法叫法。
  const hand1 = [2,2,3,3,4];
  const absurd = E.evRaise({count:15,face:6}, hand1, 3, true, 5, E.DEFAULTS);
  ok('加注到 15个6 的被开概率 > 0.9', absurd.pChallenged > 0.9, `got ${absurd.pChallenged.toFixed(4)}`);
  const mild = E.evRaise({count:4,face:6}, hand1, 3, true, 5, E.DEFAULTS);
  ok('加注到 4个6 的被开概率 < 0.3', mild.pChallenged < 0.3, `got ${mild.pChallenged.toFixed(4)}`);
}

// ══════════════════════════════════════════════════════════════
console.log('\n【5】不变量与边界');
{
  // 回归锁：cont 标定表是 4000 轮/格自对弈实测出来的，(N-1)/N 已被证伪。
  // 谁把它改回"推导值"，这里必须响。
  ok('cont(3) = 0.50（不是被证伪的 2/3）', Math.abs(E.contFor(3) - 0.50) < 1e-9 && Math.abs(E.contFor(3) - 2/3) > 0.1,
     `got ${E.contFor(3)}`);
  ok('cont(2)=0.70 cont(6)=0.70 cont(7)=0.75',
     E.contFor(2) === 0.70 && E.contFor(6) === 0.70 && E.contFor(7) === 0.75);
  ok('cont 对超出标定范围的人数有回退值', E.contFor(12) > 0 && E.contFor(12) < 1);
  ok('cont 全部落在 (0,1)', [2,3,4,5,6,7,8,9].every(n => E.contFor(n) > 0 && E.contFor(n) < 1));
}
{
  const r = E.analyze({ hand: [6, 6, 6, 6, 6], players: 2, bid: { count: 3, face: 6 }, wild: true });
  ok('手握5个6时"3个6"必真 → 开的胜率=0', Math.abs(r.challenge.ev) < 1e-12, `ev=${r.challenge.ev}`);
  ok('此时不推荐开', r.best.kind === 'raise');
}
{
  const r = E.analyze({ hand: [2, 2, 3, 3, 4], players: 2, bid: { count: 10, face: 6 }, wild: true });
  ok('手上0个6、对方叫满10个6 → 开的胜率=1', Math.abs(r.challenge.ev - 1) < 1e-12, `ev=${r.challenge.ev}`);
  ok('此时必须推荐开', r.best.kind === 'challenge');
}
{
  const r = E.analyze({ hand: [1, 2, 3, 4, 5], players: 4, bid: { count: 4, face: 3 }, wild: true });
  ok('所有价值都在 [0,1]', r.actions.every(a => a.ev >= -1e-9 && a.ev <= 1 + 1e-9));
  ok('这注成立的概率都在 [0,1]',
     r.actions.every(a => a.kind === 'challenge' || (a.pTrue >= -1e-9 && a.pTrue <= 1 + 1e-9)));
  ok('结果按 ev 降序', r.actions.every((a, i) => i === 0 || r.actions[i - 1].ev >= a.ev - 1e-12));
}
{
  const r = E.analyze({ hand: [1, 1, 1, 1, 1], players: 3, bid: null, wild: true });
  ok('开局模式无"开"这个动作', r.challenge === null && r.actions.every(a => a.kind === 'raise'));
}
{ // 单调性：同点数下，个数越高存活率越低
  const base = { hand: [1, 4, 4, 5, 6], players: 4, wild: true };
  let prev = 1.1, mono = true;
  for (let c = 1; c <= 20; c++) {
    const s = E.pBidTrue({ count: c, face: 4 }, base.hand, base.players, true, 5);
    if (s > prev + 1e-12) mono = false;
    prev = s;
  }
  ok('存活率随个数单调不增', mono);
}
{ // 飞模式下 2..6 点的期望 = T*1/3；斋的期望 = T*1/6
  const N = 4, T = N * 5;
  let m = 0; for (let k = 0; k <= T; k++) m += k * E.binomPMF(T, k, 1 / 3);
  close('飞模式全场某点期望个数 = T/3', m, T / 3, 1e-9);
}

// ══════════════════════════════════════════════════════════════
console.log('\n【6】rollout 层（取代了被证伪的常数截断值）');
{
  ok('rolloutEV 恒在 [0,1]', [2,3,5].every(N =>
     [{count:1,face:2},{count:N*5,face:6},{count:3,face:1}].every(b => {
       const v = E.rolloutEV(b, [1,2,3,4,5], N, true, 5, 400, 42);
       return v >= 0 && v <= 1; })));
  ok('同种子结果可复现（UI 重绘不该跳数）',
     E.rolloutEV({count:5,face:5},[5,5,2,5,3],3,true,5,800,7) ===
     E.rolloutEV({count:5,face:5},[5,5,2,5,3],3,true,5,800,7));
  const absurdRoll = E.rolloutEV({count:15,face:6},[2,2,3,3,4],3,true,5,2000,11);
  ok(`叫满 15个6 必被开且必输 → rollout < 0.05（实测 ${absurdRoll.toFixed(3)}）`, absurdRoll < 0.05);
  const safeRoll = E.rolloutEV({count:2,face:6},[6,6,6,6,6],3,true,5,2000,11);
  ok(`手握5个6叫"2个6" → rollout > 0.6（实测 ${safeRoll.toFixed(3)}）`, safeRoll > 0.6);
  // 收敛性：样本翻倍后两次估计应互相靠近
  const a1 = E.rolloutEV({count:6,face:4},[4,4,1,2,3],4,true,5,6000,101);
  const a2 = E.rolloutEV({count:6,face:4},[4,4,1,2,3],4,true,5,6000,202);
  ok(`不同种子 6000 局的两次估计相差 < 0.03（${a1.toFixed(3)} vs ${a2.toFixed(3)}）`, Math.abs(a1-a2) < 0.03);

  // 部分手牌：hero 没输入的骰子必须照样发出来参与结算，否则全场骰数少了一截。
  // 存在理由：所有其它 rollout 测试都用满 5 颗手牌，heroUnknown=0，
  // 故障注入证明"漏发 hero 未知骰"在那些用例下完全观测不到。
  {
    // 结构断言：不管 hero 输了几颗，发出来的骰子总数必须恰好 N*dpp。
    let sd = 12345; const rr = () => { sd^=sd<<13; sd^=sd>>>17; sd^=sd<<5; sd|=0; return (sd>>>0)/4294967296; };
    let bad = null;
    for (const N of [2,3,5,8]) for (const known of [0,1,2,4,5]) {
      const d = E.dealRound([6,6,6,6,6].slice(0,known), N, 5, rr);
      if (d.all.length !== N*5) { bad = `N=${N} 已知${known}颗 → 发出 ${d.all.length} 颗，应为 ${N*5}`; break; }
      if (d.hands.length !== N) { bad = `N=${N} → ${d.hands.length} 手`; break; }
      if (d.hands.some(h => h.length !== 5)) { bad = `N=${N} 有手牌不是5颗`; break; }
      if (d.hands[0].slice(0,known).join() !== [6,6,6,6,6].slice(0,known).join()) { bad = `hero 已输入的骰子被改了`; break; }
    }
    ok('发牌：不论 hero 输入几颗，全场骰数恒为 人数×5，且已输入的不被改动', !bad, bad || '');
    // 这个区间随模型演进移动过：0.394 → 0.334。原因是两处修复（hero 后续不再看见
    // 补出的未知骰、barMove 排序改为与被建模的酒桌玩家一致），不是回归。
    // 真正钉住"补骰有没有发"的是上面那条结构断言；这条只当量级 sanity。
    const partial = E.rolloutEV({count:4,face:6}, [], 2, true, 5, 4000, 77);
    ok(`空手牌 2人局叫"4个6"：rollout ${partial.toFixed(3)} 落在 0.25~0.45`,
       partial > 0.25 && partial < 0.45, `got ${partial.toFixed(3)}`);
    // 手牌越少 → 未知越多 → 同一注的 pTrue 越接近纯二项，这个方向也验一下
    const full = E.pBidTrue({count:4,face:6}, [6,6,2,3,4], 2, true, 5);
    const none = E.pBidTrue({count:4,face:6}, [],          2, true, 5);
    ok('手上有2个6时"4个6"比空手牌更容易成立', full > none, `${full.toFixed(3)} vs ${none.toFixed(3)}`);
  }

  ok('minimalRaises 返回的每一注都合法', [2,3,4,6].every(N => [true,false].every(w =>
     [{count:3,face:4},{count:6,face:6},{count:2,face:1}].every(cur => {
       const legal = new Set(E.legalRaises(cur,N,w,5).map(r=>r.count+'-'+r.face));
       return E.minimalRaises(cur,N,w,5).every(r=>legal.has(r.count+'-'+r.face));
     }))));
}

// ══════════════════════════════════════════════════════════════
// 【7】回归锁：外部评审（Codex，2026-08-22）发现的具体错排局面。
// 旧的常数截断值 cont 把"下家没立刻开"之后的全部后续状态压成同一个数，
// 于是给加注打 0.554、排在开(0.559)之后；把这一步固定住再打完整轮，
// 加注的真实不喝率约 0.79。这条断言防止改回去。
console.log('\n【6b】回归锁：外部评审第二轮报的两条（2026-08-22）');
{
  // A：有偏的筛子不能决定谁进决赛。原来用 2-ply 分数每个点数只留一注，
  //    这个局面把必真的低斋叫淘汰给了更高的个数，差 12 个百分点。
  const inA = { hand:[1,1,6,1,5], players:3, bid:{count:4,face:5}, wild:true, dicePerPlayer:5 };
  const rA = E.analyze(inA);
  const f1 = rA.actions.find(a => a.bid && a.bid.face === 1);
  // 直接和"该点数下 rollout 的真 argmax"对账 —— 只断言"别选4个1"不够锐利：
  // 保留每档前2名时，有偏的筛子照样能让第2名蒙混过关。
  {
    const all1 = E.legalRaises(inA.bid, 3, true, 5).filter(r => r.face === 1);
    let bestBid = null, bestEV = -1;
    for (const r of all1) {
      const v = E.rolloutEV(r, inA.hand, 3, true, 5, 6000, 20260822);
      if (v > bestEV) { bestEV = v; bestBid = r; }
    }
    ok(`预筛不淘汰真正最优：点数1这档 rollout 真 argmax = ${bestBid.count}个1（${bestEV.toFixed(3)}），引擎选了 ${f1.bid.count}个1`,
       f1.bid.count === bestBid.count, `引擎选了 ${f1.bid.count}个1，真最优是 ${bestBid.count}个1`);
  }
  const evLow = E.rolloutEV({count:2,face:1}, inA.hand, 3, true, 5, 8000, 4242);
  const evHigh = E.rolloutEV({count:4,face:1}, inA.hand, 3, true, 5, 8000, 4242);
  ok(`对照：低斋叫确实明显更好（${evLow.toFixed(3)} vs ${evHigh.toFixed(3)}），说明这条锁有意义`,
     evLow > evHigh + 0.05);
  ok('候选集要足够宽（不是每个点数只留一注）', rA.candidatesConsidered >= 20,
     `只考察了 ${rA.candidatesConsidered} 个`);

  // B：补出来的 hero 未知骰不能进 hero 后续的信息集（strategy fusion）。
  //    用"只让 hero 看见原始手牌"的独立 oracle 逐位对账。
  function maskedOracle(bid, hand, N, sims, seed) {
    let st = seed | 0;
    const rnd = () => { st^=st<<13; st^=st>>>17; st^=st<<5; st|=0; return (st>>>0)/4294967296; };
    let alive = 0;
    for (let n = 0; n < sims; n++) {
      const d = E.dealRound(hand, N, 5, rnd), hands = d.hands, all = d.all;
      const ts = [0.40], cs = [0.40];
      for (let i = 1; i < N; i++) { ts.push(0.28+rnd()*0.24); cs.push(0.30+rnd()*0.20); }
      let cur = 1 % N, prev = 0, b = bid, loser = -1;
      for (let g = 0; g < 200; g++) {
        const visible = cur === 0 ? hand : hands[cur];     // ← hero 只看原始手牌
        const mv = E.barMove(b, visible, N, true, 5, ts[cur], cs[cur]);
        if (mv === null) { loser = E.myCount(all, b.face, true) >= b.count ? cur : prev; break; }
        b = mv; prev = cur; cur = (cur + 1) % N;
      }
      if (loser >= 0 && loser !== 0) alive++;
    }
    return alive / sims;
  }
  let leak = null;
  for (const [hand, N, bid] of [
    [[5,6,5,2],3,{count:4,face:5}], [[5,6,5,2],3,{count:3,face:6}],
    [[6,6],4,{count:7,face:6}], [[],2,{count:4,face:6}], [[1],5,{count:6,face:3}],
  ]) {
    const a = E.rolloutEV(bid, hand, N, true, 5, 8000, 4242);
    const b = maskedOracle(bid, hand, N, 8000, 4242);
    if (Math.abs(a - b) > 1e-12) leak = `手=[${hand}] N=${N} ${bid.count}个${bid.face}: ${a} vs ${b}`;
  }
  ok('部分手牌：补出的未知骰只参与结算，不进 hero 后续信息集', !leak, leak || '');

  // C：rollout 循环永远不该触顶（叫牌严格递增，必然收敛）
  E.rolloutEV({count:1,face:2}, [1,1,1,1,1], 8, true, 5, 3000, 5);
  ok('rollout 循环从不触顶（触顶会被保守计成 hero 喝）', E.guardHits() === 0, `触顶 ${E.guardHits()} 次`);

  // C-tie：barMove 的**次级比较**（同加幅下按自己手上这个点多的优先）单独守一条。
  //   外部评审证明：只删掉次级比较、保留主排序，180 条一条都不响。
  {
    // 造一个"两注加幅相同、但 hero 手上持有量不同"的局面，直接看 barMove 挑哪个
    let tieOK = false, detail = '';
    for (const [hand, N, cur] of [
      [[6,6,6,2,3], 3, {count:2,face:2}], [[5,5,5,5,4], 4, {count:3,face:3}],
      [[4,4,4,4,4], 2, {count:1,face:2}], [[6,6,6,6,3], 5, {count:4,face:2}],
    ]) {
      const rs = E.minimalRaises(cur, N, true, 5);
      const minC = Math.min(...rs.map(r => r.count));
      const same = rs.filter(r => r.count === minC);
      if (same.length < 2) continue;
      const counts = same.map(r => E.myCount(hand, r.face, true));
      if (Math.max(...counts) === Math.min(...counts)) continue;   // 持有量没差别，测不出
      const want = same[counts.indexOf(Math.max(...counts))];
      // comfort 设得很低，保证第一个被考察到的就会被选中 → 暴露排序本身
      const got = E.barMove(cur, hand, N, true, 5, 0.0, 0.0);
      detail = `局面 ${cur.count}个${cur.face} 手=[${hand}]：同加幅候选 ` +
               same.map((r,i)=>`${r.count}个${r.face}(持有${counts[i]})`).join(' ') +
               ` → barMove 选了 ${got.count}个${got.face}`;
      tieOK = got.count === want.count && got.face === want.face;
      break;
    }
    ok('barMove 同加幅时优先选自己手上多的那个点数', tieOK, detail);
  }

  // D：展示字段必须来自产生 EV 的那桌对手，不是另一套 logistic
  {
    const hand=[4,2,5,4,3], bid={count:2,face:1};
    const st = E.immediateStats(bid, hand, 3, true, 5);
    const old = E.evRaise(bid, hand, 3, true, 5, E.DEFAULTS);
    ok(`展示的「下家开你」按 rollout 那桌算（${(st.pChallenged*100).toFixed(1)}%），` +
       `不是旧的 logistic（${(old.pChallenged*100).toFixed(1)}%）`,
       Math.abs(st.pChallenged - old.pChallenged) > 0.02);
    const r = E.analyze({ hand, players:3, bid:{count:1,face:2}, wild:true, sims:400 });
    const any = r.actions.find(a => a.kind === 'raise');
    const st2 = E.immediateStats(any.bid, hand, 3, true, 5);
    ok('analyze 输出的 pChallenged 用的就是 immediateStats',
       Math.abs(any.pChallenged - st2.pChallenged) < 1e-12);
    // pTrueIfChallenged 要单独守 —— 外部评审证明只把这一个字段换回旧模型，180 条不响
    ok('analyze 输出的 pTrueIfChallenged 也用 immediateStats（不是旧 logistic）',
       Math.abs(any.pTrueIfChallenged - st2.pTrueIfChallenged) < 1e-12,
       `${any.pTrueIfChallenged} vs ${st2.pTrueIfChallenged}`);
    const oldD = E.evRaise(any.bid, hand, 3, true, 5, E.DEFAULTS);
    ok('两套模型的 pTrueIfChallenged 确实不同（说明上面那条锁有鉴别力）',
       Math.abs(st2.pTrueIfChallenged - oldD.pTrueIfChallenged) > 1e-6,
       `${st2.pTrueIfChallenged} vs ${oldD.pTrueIfChallenged}`);
    // N=2 走 2-ply 排序，展示字段就该来自 2-ply，不能混用 rollout 那桌
    const r2 = E.analyze({ hand, players:2, bid:{count:1,face:2}, wild:true });
    const a2raise = r2.actions.find(a => a.kind === 'raise');
    const m2 = E.evRaise(a2raise.bid, hand, 2, true, 5, E.DEFAULTS);
    ok('N=2（2-ply 排序）时展示字段也来自 2-ply，不混用 rollout 桌',
       Math.abs(a2raise.pChallenged - m2.pChallenged) < 1e-12,
       `${a2raise.pChallenged} vs ${m2.pChallenged}`);
    // pChallenged 和 pTrueIfChallenged 要分别守 —— 外部评审证明只把 N=2 的
    // pTrueIfChallenged 换回 immediateStats，191 条一条都不响。
    ok('N=2 的 pTrueIfChallenged 也来自 2-ply',
       a2raise.pTrueIfChallenged === null
         ? m2.pTrueIfChallenged === null
         : Math.abs(a2raise.pTrueIfChallenged - m2.pTrueIfChallenged) < 1e-12,
       `${a2raise.pTrueIfChallenged} vs ${m2.pTrueIfChallenged}`);
    const im2 = E.immediateStats(a2raise.bid, hand, 2, true, 5);
    ok('对照：N=2 下两套模型的 pTrueIfChallenged 确实不同（说明上面那条锁有鉴别力）',
       im2.pTrueIfChallenged === null || m2.pTrueIfChallenged === null
         || Math.abs(im2.pTrueIfChallenged - m2.pTrueIfChallenged) > 1e-6,
       `${im2.pTrueIfChallenged} vs ${m2.pTrueIfChallenged}`);
  }
}

console.log('\n【6c】回归锁：外部评审第三轮报的两条阻塞');
{
  // 阻塞1：粗筛只有 250 局，真最优完全可能因噪声排到同点数第 3。
  //   原来"每点数留前 2"会把它永久淘汰。三个独立 10 万局种子都确认 6个4 才是全局第一。
  const hA = [4,6,4,4,1];
  const rA = E.analyze({ hand: hA, players: 3, bid: null, wild: true, dicePerPlayer: 5 });
  // 不钉死"必须推荐 6个4"：6个4/5个4/4个4 的真值分别是 0.763/0.751/0.743，
  // 而精算 CI 是 ±1.3pp，最终选谁本来就受抽样波动影响 —— 钉身份的锁会随机报警。
  // 该守的是：推荐的真值不能明显差于真最优（"真最优进决赛圈"另有【6c-2】把关）。
  {
    const truth = c => E.rolloutEV(c, hA, 3, true, 5, 8000, 424242);
    let bestTrue = -1;
    for (const c of E.legalRaises(null, 3, true, 5)) {
      const v = truth(c); if (v > bestTrue) bestTrue = v;
    }
    const gap = bestTrue - truth(rA.best.bid);
    ok(`该局面推荐 ${rA.best.bid.count}个${rA.best.bid.face}，真值差真最优 ${(gap*100).toFixed(1)}pp（应 ≤ 3pp）`,
       gap <= 0.03, `差 ${(gap*100).toFixed(1)}pp`);
  }
  const truth = [4,5,6].map(c => ({ c, ev: E.rolloutEV({count:c,face:4}, hA, 3, true, 5, 20000, 91919) }));
  truth.sort((x,y) => y.ev - x.ev);
  ok(`对照：高样本下 6个4 确实第一（${truth.map(t=>t.c+'个4='+t.ev.toFixed(3)).join(' ')}）`, truth[0].c === 6);

  // 阻塞2：候选集不能按个数排名截断。8 人局 40 颗骰时合理叫数在 13 附近，
  //   "取最低的 8 注"根本够不到，会把 pTrue=87% 的 11个5 漏在外面。
  const hB = [2,1,3,2,5];
  const cB = E.candidateRaises({count:1,face:4}, hB, 8, true, 5);
  const has11 = cB.some(b => b.count === 11 && b.face === 5);
  ok(`8人局候选集包含 11个5（pTrue=${E.pBidTrue({count:11,face:5},hB,8,true,5).toFixed(3)}）`,
     has11, `候选 ${cB.length} 个，不含 11个5`);
  ok('候选集不做任何个数排名截断：pTrue 够高的一个都不能少',
     E.legalRaises({count:1,face:4}, 8, true, 5)
       .filter(r => E.pBidTrue(r, hB, 8, true, 5) >= 0.02)
       .every(r => cB.some(c => c.count === r.count && c.face === r.face)));

  // 精算必须换一条随机流，否则被选中者带 winner's curse
  {
    const inp = { hand:[5,5,2,5,3], players:3, bid:{count:5,face:3}, wild:true, dicePerPlayer:5, sims:800, seed:12345 };
    const r = E.analyze(inp);
    const b = r.actions.find(a => a.kind === 'raise');
    // 必须用 r.sims（实际精算样本），不能用输入的 sims —— 自适应会把它抬高，
    // 用错样本数会让两边天然不等，断言就因为错误的原因通过了。
    const sameSeed = E.rolloutEV(b.bid, inp.hand, 3, true, 5, r.sims, 12345);
    ok(`精算用的随机流与淘汰阶段不同（防 winner’s curse，样本 ${r.sims}）`,
       Math.abs(b.ev - sameSeed) > 1e-12, `两者相同：${b.ev}`);
    const diffSeed = E.rolloutEV(b.bid, inp.hand, 3, true, 5, r.sims, 12345 ^ 0x5bf03635);
    ok('对照：换成精算实际用的那条流，值就对上了（说明上面那条锁比的是流不是样本数）',
       Math.abs(b.ev - diffSeed) < 1e-12, `${b.ev} vs ${diffSeed}`);
  }
  // 精算样本要自适应：淘汰完只剩几个候选时固定 1500 局是浪费预算，
  // 而 1500 局(se=1.3pp)分不开真值差 2pp 的两注。
  {
    const r = E.analyze({ hand:[5,5,2,5,3], players:3, bid:{count:5,face:3}, wild:true, dicePerPlayer:5 });
    // 只测"样本随决赛圈大小反向调整"这个关系本身。原来写成
    // `finalists.length <= 8 && sims > 1500`，把两件事捆在一起：决赛圈规模一变
    // 就失败，而报错信息还说得像是自适应没生效。
    ok(`决赛圈 ${r.finalists.length} 个 → 精算样本 ${r.sims}，符合预算分摊公式`,
       r.sims === Math.max(1500, Math.min(6000, Math.round(45000 / Math.max(1, r.finalists.length)))),
       `${r.finalists.length} 个候选却给了 ${r.sims} 局`);
    ok(`决赛圈够小时样本确实高于基准 1500（实得 ${r.sims}）`,
       r.finalists.length > 30 || r.sims > 1500, `${r.finalists.length} 个 / ${r.sims} 局`);
    const r8 = E.analyze({ hand:[2,1,3,2,5], players:8, bid:{count:1,face:4}, wild:true, dicePerPlayer:5 });
    ok(`候选多时精算样本相应压低（8人局 ${r8.finalists.length} 个 → ${r8.sims} 局），总耗时可控`,
       r8.sims >= 1500 && r8.sims * r8.finalists.length <= 60000,
       `${r8.finalists.length} × ${r8.sims} = ${r8.finalists.length * r8.sims}`);
  }
}

console.log('\n【6c-2】真最优必须进决赛圈（把"结构性淘汰"和"抽样噪声"分开）');
{
  // 外部评审两次抓到"真最优被淘汰"，两次都是**按名次截断**造成的。
  // 现在全程不按名次砍，只按噪声带砍。这条性质与噪声无关、可精确断言：
  //   最终选谁可以受抽样波动影响（CI 已在界面上标出），但真最优**不许在决赛之前就被排除**。
  const cases = [
    { hand:[4,6,4,4,1], N:3, bid:null },                     // 外部评审的反例
    { hand:[1,1,6,1,5], N:3, bid:{count:4,face:5} },
    { hand:[2,1,3,2,5], N:8, bid:{count:1,face:4} },
    { hand:[5,5,2,5,3], N:3, bid:{count:5,face:3} },
  ];
  let bad = null;
  for (const c of cases) {
    // 全集用**全部合法叫法**高样本定真最优，不用引擎自己的候选集
    const universe = E.legalRaises(c.bid, c.N, true, 5);
    let bestTrue = -1, bestBid = null;
    for (const b of universe) {
      const v = E.rolloutEV(b, c.hand, c.N, true, 5, 3000, 424242);
      if (v > bestTrue) { bestTrue = v; bestBid = b; }
    }
    for (const sd of [20260822, 91919, 19391, 73013]) {
      const r = E.analyze({ hand:c.hand, players:c.N, bid:c.bid, wild:true, dicePerPlayer:5, seed:sd });
      if (!r.finalists.some(b => b.count === bestBid.count && b.face === bestBid.face)) {
        bad = `${c.N}人局 手=[${c.hand}] seed=${sd}：真最优 ${bestBid.count}个${bestBid.face}` +
              `(${bestTrue.toFixed(3)}) 没进决赛圈（决赛圈 ${r.finalists.length} 个）`;
        break;
      }
    }
    if (bad) break;
  }
  ok('4 个局面 × 4 个种子：真最优一次都没被淘汰在决赛之前', !bad, bad || '');

  // 上面那条只测了 4 个种子。淘汰是随机过程 —— 外部评审就是靠扫种子找到 seed=2111
  // （250局+3σ 下真最优只差 0.0011 被砍）。这里直接对首轮淘汰扫大量种子。
  {
    // 从引擎读真实参数，不写死 —— 写死的话"把默认值改回 250/3σ"这类回归察觉不到
    const hand = [4,6,4,4,1], N = 3, coarse = E.ELIM.coarse, band = E.ELIM.bands[0];
    const cands = E.candidateRaises(null, hand, N, true, 5).filter(b => b.face === 4);
    let truthBid = null, truthV = -1;
    for (const b of cands) {
      const v = E.rolloutEV(b, hand, N, true, 5, 8000, 424242);
      if (v > truthV) { truthV = v; truthBid = b; }
    }
    const se = Math.sqrt(0.25 / coarse);
    let cutCount = 0, worstGap = 0, worstSeed = 0;
    // ⚠️ 下面这段盲扫是"按 E.ELIM 声明的公式重算一遍淘汰"，**不经过 analyze()**。
    //    外部评审指出这是闸门缺陷：把真实淘汰代码改回 250+3σ、只留 ELIM 导出值不变，
    //    201 条照样全绿。所以另加了黑盒断言（见下面 blackBox），两者都要有：
    //    重算版能定位到"是哪一步、差多少"，黑盒版才证明生产路径真的没退化。
    // 盲扫 300 个种子 + **已知的对抗种子**。
    // 单靠盲扫不够锐利：350局+3σ 的失败率是 1/5000，扫 300 个大概率碰不到，
    // 而扫 5000 个要 1400 万局太慢。把找到过的坏种子直接钉进来最划算。
    //   seed=2111 —— 外部评审在 250局+3σ 下找到
    //   seed=3591 —— 我在 350局+3σ 下扫 5000 个种子找到
    const seeds = [2111, 3591];
    for (let sd = 1; sd <= 300; sd++) seeds.push(sd);
    for (const sd of seeds) {
      let top = -1, truthScore = 0;
      for (const b of cands) {
        const v = E.rolloutEV(b, hand, N, true, 5, coarse, sd);
        if (v > top) top = v;
        if (b.count === truthBid.count) truthScore = v;
      }
      const gap = (top - band * se) - truthScore;
      if (gap > 0) { cutCount++; if (gap > worstGap) { worstGap = gap; worstSeed = sd; } }
    }
    ok(`${seeds.length} 个种子（含 2 个已知对抗种子）扫首轮淘汰：真最优 ${truthBid.count}个4 被砍 ${cutCount} 次`,
       cutCount === 0, `最坏 seed=${worstSeed} 差 ${worstGap.toFixed(4)}`);
    // 黑盒：对抗种子必须**经过 analyze()** 检查真最优在不在决赛圈。
    // 这条才是真正守住生产路径的 —— 上面那段重算版对"真实淘汰代码被改"是瞎的。
    {
      let bbBad = null;
      for (const sd of [2111, 3591, 20260822, 91919]) {
        const r = E.analyze({ hand, players: N, bid: null, wild: true, dicePerPlayer: 5, seed: sd });
        if (!r.finalists.some(b => b.count === truthBid.count && b.face === 4)) {
          bbBad = `seed=${sd}：真最优 ${truthBid.count}个4 不在 analyze() 的决赛圈里` +
                  `（决赛圈 ${r.finalists.length} 个）`;
          break;
        }
      }
      ok('黑盒：对抗种子经过 analyze() 后真最优仍在决赛圈', !bbBad, bbBad || '');
    }

    // 对照：把带宽收回 3σ、样本降回 250，就能复现外部评审的 seed=2111
    {
      const se2 = Math.sqrt(0.25 / 250);
      let top2 = -1, truth2 = 0;
      for (const b of cands) {
        const v = E.rolloutEV(b, hand, N, true, 5, 250, 2111);
        if (v > top2) top2 = v;
        if (b.count === truthBid.count) truth2 = v;
      }
      ok(`对照：250局+3σ 下 seed=2111 确实会砍掉真最优（${truth2.toFixed(4)} < ${(top2-3*se2).toFixed(4)}）`,
         truth2 < top2 - 3 * se2, '复现不出来，这条锁没有意义');
      // 再证明"只把带宽收回 3σ、样本仍是 350"也会漏 —— 说明加宽带宽本身是有用的，
      // 不是只靠样本量在兜底。
      const se3 = Math.sqrt(0.25 / coarse);
      let top3 = -1, truth3 = 0;
      for (const b of cands) {
        const v = E.rolloutEV(b, hand, N, true, 5, coarse, 3591);
        if (v > top3) top3 = v;
        if (b.count === truthBid.count) truth3 = v;
      }
      ok(`对照：${coarse}局+3σ 下 seed=3591 也会砍掉真最优（${truth3.toFixed(4)} < ${(top3-3*se3).toFixed(4)}），` +
         `说明 ${band}σ 这个带宽本身是有用的`,
         truth3 < top3 - 3 * se3, '复现不出来');
    }
  }
  // 反面对照：证明"按名次砍"确实会漏掉这个真最优 —— 这条锁不是摆设。
  // 粗筛名次本身就是随机的，所以扫多个种子：只要存在会被砍掉的情形，
  // 就说明当初那个设计有确定性缺陷。
  {
    const c = cases[0];
    const cands = E.candidateRaises(c.bid, c.hand, 3, true, 5).filter(b => b.face === 4);
    const ranks = [];
    for (const sd of [20260822, 91919, 19391, 73013, 55555, 31415, 27182, 16180]) {
      const scored = cands.map(b => ({ b, sc: E.rolloutEV(b, c.hand, 3, true, 5, 250, sd) }))
                          .sort((x, y) => y.sc - x.sc);
      ranks.push(scored.findIndex(x => x.b.count === 6) + 1);
    }
    const cutBy2 = ranks.filter(r => r > 2).length, cutBy4 = ranks.filter(r => r > 4).length;
    ok(`对照：8 个种子下真最优「6个4」的粗筛名次 [${ranks}] —— ` +
       `留前2会砍掉它 ${cutBy2} 次、留前4会砍掉 ${cutBy4} 次`,
       cutBy2 > 0, '按名次砍从来没砍掉过它，这条锁没有意义');
  }
}

console.log('\n【6c-3】没有加注可选时不许虚报模拟次数');
{
  // 外部评审指出：飞模式下上家叫 15个6 **并没有叫到顶** ——
  // 规则上还有 8 个合法斋叫（8个1…15个1），只是 pTrue 最高 0.00027 被候选阈值滤掉。
  // 「规则上不能再叫」和「能叫但全是自杀」是两回事，界面不能混为一谈。
  for (const [label, bid, wild, wantLegal] of [
    ['飞模式 15个6', { count:15, face:6 }, true,  8],
    ['飞模式 5个1',  { count:5,  face:1 }, true,  35],
    ['不飞 15个6',   { count:15, face:6 }, false, 0],
  ]) {
    const r = E.analyze({ hand:[1,2,3,4,5], players:3, bid, wild, dicePerPlayer:5 });
    ok(`${label}：legalCount=${r.legalCount}（应为 ${wantLegal}）`, r.legalCount === wantLegal,
       `报了 ${r.legalCount}`);
    ok(`${label}：候选为 0（全被 pTrue 阈值滤掉）`, r.candidatesConsidered === 0);
    ok(`${label}：不虚报模拟次数`, r.sims === 0, `报了 ${r.sims}`);
  }
  // 第四种情况（我自查发现，不在外部评审清单里）：
  // 2 人局走 2-ply 模型，叫满时同样一个加注都没有。前端判据若挂在 method 上，
  // 会落进"单挑用两步前瞻模型估的"分支，去解释根本不存在的条形。
  for (const [label, N, bid, wild, dpp] of [
    ['2人局叫满(飞)',   2, {count:10,face:6}, true,  5],
    ['2人局叫满(不飞)', 2, {count:10,face:6}, false, 5],
    ['每人3颗叫满(飞)', 4, {count:12,face:6}, true,  3],
  ]) {
    const r = E.analyze({ hand:[1,2,3,4,5].slice(0,dpp), players:N, bid, wild, dicePerPlayer:dpp });
    ok(`${label}：没有任何加注动作`, !r.actions.some(a => a.kind === 'raise'),
       `有 ${r.actions.filter(a=>a.kind==='raise').length} 个加注`);
    ok(`${label}：legalCount=${r.legalCount} 与 legalRaises() 一致`,
       r.legalCount === E.legalRaises(bid, N, wild, dpp).length);
    ok(`${label}：不虚报模拟次数`, r.sims === 0, `报了 ${r.sims}`);
  }

  ok('只有「不飞 15个6」才是真的叫到顶',
     E.analyze({hand:[1,2,3,4,5],players:3,bid:{count:15,face:6},wild:false}).legalCount === 0 &&
     E.analyze({hand:[1,2,3,4,5],players:3,bid:{count:15,face:6},wild:true}).legalCount > 0);

  // 飞模式下上家叫 15个6 时一个**值得细算的候选**都没有，一次 rollout 都没跑过。
  // ⚠️ 它并不是"叫到顶"——规则上还有 8 个合法斋叫，只是 pTrue 低到被阈值滤掉。
  //    这组断言测的是"无候选时不虚报"，与是否叫到顶无关，名字别再写成"叫到顶"。
  // 原来仍报 sims=6000、界面显示"跑了 6000 遍（±—）"，是虚报。
  const r = E.analyze({ hand:[1,2,3,4,5], players:3, bid:{count:15,face:6}, wild:true, dicePerPlayer:5 });
  ok('无候选：只有「开」一个动作', r.actions.length === 1 && r.actions[0].kind === 'challenge');
  ok('无候选：决赛圈为空', r.finalists.length === 0);
  ok(`无候选：报告的模拟次数为 0（实得 ${r.sims}）`, r.sims === 0, `报了 ${r.sims}`);
  ok('无候选：没有任何动作带 evCI', r.actions.every(a => a.evCI == null));
  ok(`且它并非叫到顶（legalCount=${r.legalCount} > 0）`, r.legalCount > 0, '这个局面其实叫到顶了，夹具选错了');
  // 对照：有加注可选时必须照常报真实次数
  const r2 = E.analyze({ hand:[1,2,3,4,5], players:3, bid:{count:5,face:6}, wild:true, dicePerPlayer:5 });
  ok(`对照：正常局面照常报模拟次数（${r2.sims}）且有 CI`,
     r2.sims > 0 && r2.actions.some(a => a.evCI != null));
}

console.log('\n【6c-4】带宽安全性：跨局面抽查（全量扫描见 test/band-safety.js）');
{
  // 带宽 [4.5,3.5,3.0] 的安全性此前只在一个局面上扫过。
  // 全量扫描（test/band-safety.js，4 分片 × 40 局面 × 25 种子）做过
  // 17850 次首轮淘汰检查、0 次砍掉真最优。这里放一个缩小版做常驻抽查。
  let sd = 13579;
  const rnd = () => { sd^=sd<<13; sd^=sd>>>17; sd^=sd<<5; sd|=0; return (sd>>>0)/4294967296; };
  const coarse = E.ELIM.coarse, band = E.ELIM.bands[0], se = Math.sqrt(0.25 / coarse);
  let checked = 0, cutN = 0, worstMsg = '';
  for (let t = 0; t < 6; t++) {
    const N = 2 + (rnd()*7|0), wild = rnd() < 0.85;
    const hand = Array.from({length: 1 + (rnd()*5|0)}, () => 1 + (rnd()*6|0));
    const T = N*5;
    const bid = rnd() < 0.15 ? null
              : { count: 1 + (rnd()*Math.max(1, Math.floor(T*0.55))|0), face: 1 + (rnd()*6|0) };
    const cands = E.candidateRaises(bid, hand, N, wild, 5);
    const byFace = {};
    for (const c of cands) (byFace[c.face] = byFace[c.face] || []).push(c);
    for (const f in byFace) {
      const lst = byFace[f];
      if (lst.length < 2) continue;
      let truth = null, tv = -1;
      for (const b of lst) {
        const v = E.rolloutEV(b, hand, N, wild, 5, 2000, 424242);
        if (v > tv) { tv = v; truth = b; }
      }
      for (let sIdx = 1; sIdx <= 4; sIdx++) {
        let top = -1, ts = 0;
        for (const b of lst) {
          const v = E.rolloutEV(b, hand, N, wild, 5, coarse, sIdx * 7919 + t);
          if (v > top) top = v;
          if (b.count === truth.count) ts = v;
        }
        checked++;
        if ((top - band*se) - ts > 0) {
          cutN++;
          worstMsg = `${N}人局 wild=${wild} 手=[${hand}] 点数${f}：真最优 ${truth.count}个${f} 被砍`;
        }
      }
    }
  }
  ok(`跨局面抽查 ${checked} 次首轮淘汰：真最优被砍 ${cutN} 次`, cutN === 0, worstMsg);
  ok('抽查确实覆盖到了足够多的比较', checked >= 20, `只有 ${checked} 次`);
}

console.log('\n【6d】推荐质量：随机局面上，推荐的注不能明显差于真最优');
{
  // 钉死"某局面必须推荐某一注"是脆的：两个候选真值差 0.5pp 时，1500 局的标准误有 1.3pp，
  // 引擎在它们之间的选择本来就是随机的，而对用户来说选哪个都一样。
  // 真正该守的性质是：**推荐的注不能明显差于真最优**。
  let sd = 20260822;
  const rnd = () => { sd^=sd<<13; sd^=sd>>>17; sd^=sd<<5; sd|=0; return (sd>>>0)/4294967296; };
  let worst = 0, worstDesc = '', checked = 0;
  for (let t = 0; t < 8; t++) {          // 全集扫描较贵，局面数减半
    const N = 3 + (rnd() * 4 | 0);
    const hand = Array.from({length: 5}, () => 1 + (rnd() * 6 | 0));
    const T = N * 5;
    const bid = { count: 1 + (rnd() * Math.floor(T * 0.5) | 0), face: 1 + (rnd() * 6 | 0) };
    const r = E.analyze({ hand, players: N, bid, wild: true, dicePerPlayer: 5 });
    if (r.best.kind === 'challenge') continue;          // 开是精确的，不在这条的范围内
    checked++;
    // 全集必须是**全部合法叫法**，不能用引擎自己的候选集 ——
    // 那样是自我指涉：候选集漏了真最优，这条闸门也发现不了。
    const universe = E.legalRaises(bid, N, true, 5);
    let bestTrue = -1, bestBid = null;
    for (const c of universe) {
      const v = E.rolloutEV(c, hand, N, true, 5, 1500, 555);
      if (v > bestTrue) { bestTrue = v; bestBid = c; }
    }
    const chosenTrue = E.rolloutEV(r.best.bid, hand, N, true, 5, 1500, 555);
    const gap = bestTrue - chosenTrue;
    if (gap > worst) {
      worst = gap;
      worstDesc = `${N}人局 手=[${hand}] 上家${bid.count}个${bid.face} → 引擎选 ` +
                  `${r.best.bid.count}个${r.best.bid.face}(${chosenTrue.toFixed(3)})，` +
                  `全合法叫法里真最优是 ${bestBid.count}个${bestBid.face}(${bestTrue.toFixed(3)})`;
    }
  }
  ok(`${checked} 个随机局面上，推荐与真最优的最大差距 ${(worst*100).toFixed(1)}pp（应 ≤ 3pp）`,
     worst <= 0.03, worstDesc);
  ok('确实抽到了足够多的加注局面', checked >= 4, `只有 ${checked} 个`);
}

console.log('\n【7】回归锁：Codex 报的错排局面');
{
  // 关键：**不传 sims**，走引擎自己的默认分界。原来显式传 sims:4000 绕过了它，
  // 故障注入证明"把分界改成所有人数都用 2-ply"时这条测试照样全绿。
  const input = { hand:[5,5,2,5,3], players:3, bid:{count:5,face:3}, wild:true, dicePerPlayer:5 };
  const r = E.analyze(input);
  ok('3 人局默认走 rollout', r.method === 'rollout', `got ${r.method}`);
  ok('2 人局默认走 2-ply 模型（实测单挑它对 5 种对手全胜）',
     E.analyze({ hand:[5,5,2,5,3], players:2, bid:{count:3,face:3}, wild:true }).method === 'model');
  ok('6 人局默认走 rollout',
     E.analyze({ hand:[5,5,2,5,3], players:6, bid:{count:9,face:3}, wild:true }).method === 'rollout');
  ok('可以用 useRollout 显式覆盖分界',
     E.analyze({ hand:[5,5,2,5,3], players:2, bid:{count:3,face:3}, wild:true, useRollout:true }).method === 'rollout');
  const bestRaise = r.actions.find(a => a.kind === 'raise');
  ok(`该局面必须推荐加注而不是开（开的精确值 ${r.challenge.ev.toFixed(3)}）`,
     r.best.kind === 'raise', `却推荐了 ${r.best.kind}`);
  ok(`最优加注的 rollout 值 > 0.70（实测 ${bestRaise.ev.toFixed(3)}，旧模型只给 ${bestRaise.prescore.toFixed(3)}）`,
     bestRaise.ev > 0.70);
  ok('旧 2-ply 模型确实会把它排在开之后（说明这条锁有意义）',
     bestRaise.prescore < r.challenge.ev,
     `prescore ${bestRaise.prescore.toFixed(3)} vs 开 ${r.challenge.ev.toFixed(3)}`);
}

console.log(`\n${'='.repeat(64)}`);
console.log(`  通过 ${PASS} / 失败 ${FAIL}`);
if (FAIL) { console.log('  失败项: ' + fails.join(' | ')); process.exit(1); }
console.log('  全部通过');
