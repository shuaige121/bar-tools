/* ============================================================================
 * 自对弈实测：用这个工具的人，落酒率会低到什么程度？
 * 注意：这是"性能测量"，不是"正确性验证"。它衡量的是策略强度，
 * 而不是概率算得对不对（后者由 verify.js 的蒙特卡洛负责）。
 * 每一轮 = 从摇骰到有人被开、有人喝酒。落酒率越低越好，基准线 = 1/人数。
 * ==========================================================================*/
const E = require('../src/engine-dice.js');

// binomGE 记忆化：模拟里同一组参数会被反复问，缓存后快一个数量级
const _memo = new Map();
function ge(n, r, p) {
  const k = n + ',' + r + ',' + p;
  let v = _memo.get(k);
  if (v === undefined) { v = E.binomGE(n, r, p); _memo.set(k, v); }
  return v;
}

let _s = 987654321;
const rnd = () => { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; _s |= 0; return (_s >>> 0) / 4294967296; };
const roll = n => Array.from({ length: n }, () => 1 + Math.floor(rnd() * 6));
const cnt = (dice, f, w) => dice.filter(d => d === f || (w && f !== 1 && d === 1)).length;

/** 某玩家从自己座位上看，这注为真的主观概率 */
function subjective(bid, hand, N, wild, dpp) {
  return ge(N * dpp - hand.length, bid.count - E.myCount(hand, bid.face, wild), E.faceProb(bid.face, wild));
}

// ─────────────────────────── 三种对手 ───────────────────────────

/** 典型酒桌玩家：不太可能就开；否则挑一个自己手上有货、加幅最小的注。带个体差异。 */
function barPlayer(tau, comfort) {
  return (bid, hand, N, wild, dpp) => {
    if (bid && subjective(bid, hand, N, wild, dpp) < tau) return { act: 'challenge' };
    const rs = E.legalRaises(bid, N, wild, dpp);
    if (!rs.length) return { act: 'challenge' };
    // 加幅小优先；同加幅下，自己手上这个点多的优先
    rs.sort((a, b) => (a.count - b.count) ||
      (E.myCount(hand, b.face, wild) - E.myCount(hand, a.face, wild)));
    for (const r of rs) if (subjective(r, hand, N, wild, dpp) >= comfort) return { act: 'raise', bid: r };
    let best = rs[0], bs = -1;
    for (const r of rs) { const s = subjective(r, hand, N, wild, dpp); if (s > bs) { bs = s; best = r; } }
    return { act: 'raise', bid: best };
  };
}

/** 新手：几乎不算概率，看心情开，加注随便挑一个靠前的合法注 */
const noob = (bid, hand, N, wild, dpp) => {
  if (bid && rnd() < 0.18) return { act: 'challenge' };
  const rs = E.legalRaises(bid, N, wild, dpp);
  if (!rs.length) return { act: 'challenge' };
  rs.sort((a, b) => a.count - b.count);
  return { act: 'raise', bid: rs[Math.floor(rnd() * Math.min(rs.length, 8))] };
};

/** 工具玩家：直接用 analyze 的第一名。opts 可覆盖 cont / tau 以便调参。 */
const makeTool = (opts = {}) => (bid, hand, N, wild, dpp) => {
  const r = E.analyze(Object.assign({ hand, players: N, bid, wild, dicePerPlayer: dpp }, opts));
  const b = r.actions[0];
  return b.kind === 'challenge' ? { act: 'challenge' } : { act: 'raise', bid: b.bid };
};
const toolPlayer = makeTool();

// ─────────────────────────── 一局 ───────────────────────────
function playRound(policies, N, wild, dpp) {
  const hands = Array.from({ length: N }, () => roll(dpp));
  const all = hands.flat();
  let bid = null, cur = Math.floor(rnd() * N), guard = 0;
  while (guard++ < 400) {
    const mv = policies[cur](bid, hands[cur], N, wild, dpp);
    if (mv.act === 'challenge') {
      if (!bid) { bid = { count: 1, face: 2 }; continue; }          // 无注可开，退化成加注
      const truth = cnt(all, bid.face, wild) >= bid.count;
      const prev = (cur - 1 + N) % N;
      return truth ? cur : prev;                                     // 叫牌为真 → 开的人喝
    }
    bid = mv.bid; cur = (cur + 1) % N;
  }
  return cur;   // 理论上到不了（叫牌严格递增，必然收敛）
}

function run(label, N, mkPolicies, rounds, wild = true, dpp = 5) {
  const drinks = new Array(N).fill(0);
  for (let r = 0; r < rounds; r++) {
    const pol = mkPolicies();
    drinks[playRound(pol, N, wild, dpp)]++;
  }
  const me = drinks[0] / rounds, base = 1 / N;
  const se = Math.sqrt(me * (1 - me) / rounds);
  console.log(
    `  ${label.padEnd(30)} 落酒率 ${(me * 100).toFixed(1)}% ±${(se * 196).toFixed(1)}` +
    `  | 基准 ${(base * 100).toFixed(1)}%  | 相对少喝 ${(((base - me) / base) * 100).toFixed(0)}%` +
    (N === 2 ? `  | 对局胜率 ${((1 - me) * 100).toFixed(1)}%` : '')
  );
  return me;
}

// ─────────────────────────── 调参扫描 ───────────────────────────
if (process.argv[2] === 'sweep') {
  const R = +(process.argv[3] || 2500);
  const mkBar0 = () => barPlayer(0.28 + rnd() * 0.24, 0.30 + rnd() * 0.20);
  console.log(`\ncont 扫描  ${R} 轮/格   （数字 = 落酒率%，越低越好；括号内 = 相对基准少喝%）\n`);
  const CONTS = [0.30, 0.40, 0.45, 0.50, 0.55, 0.60, 0.70, 0.80, null];
  const NS = [2, 3, 4, 6];
  console.log('  cont     ' + NS.map(n => `${n}人(基准${(100/n).toFixed(0)}%)`.padStart(15)).join(''));
  for (const c of CONTS) {
    let line = '  ' + (c === null ? '(N-1)/N' : c.toFixed(2)).padEnd(9);
    for (const N of NS) {
      const tool = makeTool(c === null ? {} : { cont: c });
      let d = 0;
      for (let r = 0; r < R; r++) {
        const pol = [tool, ...Array.from({length:N-1}, mkBar0)];
        if (playRound(pol, N, true, 5) === 0) d++;
      }
      const me = d / R, base = 1 / N;
      line += `${(me*100).toFixed(1)}% (${(((base-me)/base)*100).toFixed(0).padStart(3)}%)`.padStart(15);
    }
    console.log(line);
  }
  console.log('');
  process.exit(0);
}

const ROUNDS = +(process.argv[2] || 6000);
console.log(`\n吹牛自对弈  ${ROUNDS} 轮/组   （0 号位 = 用工具的人，落酒率越低越好）\n`);

// 酒桌对手带个体差异：开牌阈值 τ~[0.28,0.52]，安全线 comfort~[0.30,0.50]
const mkBar = () => barPlayer(0.28 + rnd() * 0.24, 0.30 + rnd() * 0.20);

for (const N of [2, 3, 4, 6]) {
  console.log(`── ${N} 人局 ──`);
  run('工具 vs 典型酒桌玩家', N, () => [toolPlayer, ...Array.from({length:N-1}, mkBar)], ROUNDS);
  run('工具 vs 新手',         N, () => [toolPlayer, ...Array.from({length:N-1}, () => noob)], ROUNDS);
  run('工具 vs 工具（镜像）', N, () => Array.from({length:N}, () => toolPlayer), ROUNDS);
  run('对照：酒桌玩家坐0号位', N, () => Array.from({length:N}, mkBar), ROUNDS);
  console.log('');
}
console.log('  ± 是 95% 置信区间（百分点）。"镜像"应贴近基准线，否则说明存在位置优势而非策略优势。\n');
