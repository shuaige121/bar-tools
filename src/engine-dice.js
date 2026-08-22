/* ============================================================================
 * 吹牛 / 大话骰 (Liar's Dice) 决策引擎
 * 纯函数，无 DOM 依赖。node 下跑测试用的就是这份文件，浏览器里内联的也是这份。
 *
 * 术语 / 规则约定
 *   - N 名玩家，每人 dpp 颗骰（默认 5）。总骰数 T = N * dpp。
 *   - 叫牌 bid = {count, face}：宣称全场 face 点的骰子总数 >= count。
 *   - wild=true（"飞"）：1 是万能牌，可当 2..6 任意点；但叫 1（"斋"）时只算真正的 1。
 *   - wild=false（"不飞"/"斋局"）：1 就是普通点数。
 *
 * 概率层（精确，可用蒙特卡洛验证）：
 *   单颗未知骰命中 face 的概率 p：飞模式下 face∈2..6 为 2/6，face=1 为 1/6；不飞一律 1/6。
 *   我方贡献 k 已知 → P(叫牌为真) = P(Binom(U, p) >= count - k)，U = dpp*(N-1)。
 *
 * 决策层（模型，非定理 —— UI 里必须标明）：
 *   价值 = P(这一轮不是我喝)，取值 [0,1]。
 *   - 开：价值 = P(叫牌为假)。精确。
 *   - 加注到 b'：下家 B 的贡献 j ~ Binom(dpp, p)。B 只看得到自己的 j，
 *     其主观 P(b' 为真) = P(Binom(dpp*(N-1), p) >= b'.count - j)。
 *     B 以 logistic(阈值 tau) 决定是否开我。
 *       · B 开我 → 我不喝当且仅当 b' 为真：P(Binom(dpp*(N-2), p) >= b'.count - k - j)
 *       · B 不开（继续加注）→ 截断值 cont = (N-1)/N（"皮球踢出去，酒随机落在别人头上"）
 *     关键：B 的开牌决策与叫牌真伪都依赖同一个 j，二者的相关性被完整保留 —— 这正是这个游戏的核心。
 * ==========================================================================*/

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DiceEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 组合数学 ----------
  var LF = [0];                       // log(n!) 预表，够 200 颗骰用
  for (var i = 1; i <= 400; i++) LF[i] = LF[i - 1] + Math.log(i);

  function lchoose(n, k) { return LF[n] - LF[k] - LF[n - k]; }

  /** P(X = k), X ~ Binom(n, p) */
  function binomPMF(n, k, p) {
    if (k < 0 || k > n) return 0;
    if (p <= 0) return k === 0 ? 1 : 0;
    if (p >= 1) return k === n ? 1 : 0;
    return Math.exp(lchoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
  }

  /** P(X >= r), X ~ Binom(n, p)。有界记忆化：rollout 会把同一组参数问上百万次。 */
  var _geCache = {}, _geN = 0;
  function binomGE(n, r, p) {
    if (r <= 0) return 1;
    if (r > n) return 0;
    var key = n + '|' + r + '|' + p;
    var hit = _geCache[key];
    if (hit !== undefined) return hit;
    var s = 0;
    for (var k = r; k <= n; k++) s += binomPMF(n, k, p);
    if (s > 1) s = 1;
    if (_geN > 20000) { _geCache = {}; _geN = 0; }   // 防无界增长
    _geCache[key] = s; _geN++;
    return s;
  }

  // ---------- 规则层 ----------

  /** 单颗未知骰命中 face 的概率 */
  function faceProb(face, wild) {
    if (!wild) return 1 / 6;
    return face === 1 ? 1 / 6 : 2 / 6;
  }

  /** 我手上对 face 的贡献（飞模式下 2..6 点要把 1 算进去） */
  function myCount(hand, face, wild) {
    var c = 0;
    for (var i = 0; i < hand.length; i++) {
      if (hand[i] === face) c++;
      else if (wild && face !== 1 && hand[i] === 1) c++;
    }
    return c;
  }

  /** P(叫牌为真 | 我的手牌)。精确。 */
  function pBidTrue(bid, hand, N, wild, dpp) {
    dpp = dpp || 5;
    var U = N * dpp - hand.length;          // 我没输入的骰也算未知
    return binomGE(U, bid.count - myCount(hand, bid.face, wild), faceProb(bid.face, wild));
  }

  /**
   * 枚举所有合法加注。
   * 飞模式的"斋"规则（华语酒桌通行版）：
   *   飞叫 → 斋叫：新个数 >= ceil(count/2)      例：6个5 → 3个1
   *   斋叫 → 飞叫：新个数 >= 2*count + 1        例：3个1 → 7个任意
   *   同类之间：个数递增；个数相同则点数递增。
   */
  function legalRaises(bid, N, wild, dpp) {
    dpp = dpp || 5;
    var T = N * dpp, out = [], c, f;
    function push(cc, ff) { if (cc >= 1 && cc <= T) out.push({ count: cc, face: ff }); }

    if (!bid) {                                   // 我先叫，全场无人叫过
      for (f = 1; f <= 6; f++) for (c = 1; c <= T; c++) push(c, f);
      return out;
    }
    if (!wild) {                                  // 不飞：六个点一视同仁
      for (f = 1; f <= 6; f++)
        for (c = bid.count; c <= T; c++)
          if (c > bid.count || f > bid.face) push(c, f);
      return out;
    }
    if (bid.face !== 1) {                         // 当前是飞叫
      for (f = 2; f <= 6; f++)
        for (c = bid.count; c <= T; c++)
          if (c > bid.count || f > bid.face) push(c, f);
      for (c = Math.ceil(bid.count / 2); c <= T; c++) push(c, 1);   // 转斋
    } else {                                      // 当前是斋叫
      for (c = bid.count + 1; c <= T; c++) push(c, 1);
      for (f = 2; f <= 6; f++)
        for (c = 2 * bid.count + 1; c <= T; c++) push(c, f);        // 退回飞叫
    }
    return out;
  }

  // ---------- rollout：把一轮真打完 ----------

  /**
   * 只取"每个点数上加幅最小的那一注"（外加转斋/退回飞叫的边界注）。
   * 这既接近真人打法（酒桌上都是小步加），也让 rollout 里的候选集从 ~200 降到 ≤7，
   * 否则每步都 legalRaises 全枚举会慢两个数量级。
   */
  function minimalRaises(bid, N, wild, dpp) {
    var T = N * dpp, out = [], f, c;
    if (!bid) { for (f = 1; f <= 6; f++) out.push({ count: Math.max(1, Math.round(T * faceProb(f, wild))), face: f }); return out; }
    if (!wild) {
      for (f = 1; f <= 6; f++) { c = (f > bid.face) ? bid.count : bid.count + 1; if (c <= T) out.push({ count: c, face: f }); }
      return out;
    }
    if (bid.face !== 1) {
      for (f = 2; f <= 6; f++) { c = (f > bid.face) ? bid.count : bid.count + 1; if (c <= T) out.push({ count: c, face: f }); }
      c = Math.ceil(bid.count / 2); if (c >= 1 && c <= T) out.push({ count: c, face: 1 });
    } else {
      if (bid.count + 1 <= T) out.push({ count: bid.count + 1, face: 1 });
      c = 2 * bid.count + 1;
      for (f = 2; f <= 6; f++) if (c <= T) out.push({ count: c, face: f });
    }
    return out;
  }

  /** 建模的酒桌对手：不太可能就开；否则挑一个自己手上有货、加幅最小的注。 */
  function barMove(bid, hand, N, wild, dpp, tau, comfort) {
    var subj = function (b, h) { return binomGE(N * dpp - h.length, b.count - myCount(h, b.face, wild), faceProb(b.face, wild)); };
    if (bid && subj(bid, hand) < tau) return null;                 // null = 开
    var rs = minimalRaises(bid, N, wild, dpp);
    if (!rs.length) return null;
    // 排序必须与被建模的酒桌玩家一致：先按加幅小，同加幅下按"自己手上这个点多"。
    // 原来直接吃 minimalRaises 的生成顺序，外部评审指出这会挑出不同的注。
    rs.sort(function (a, b) {
      return (a.count - b.count) || (myCount(hand, b.face, wild) - myCount(hand, a.face, wild));
    });
    var best = null, bestS = -1, i, sc;
    for (i = 0; i < rs.length; i++) {
      sc = subj(rs[i], hand);
      if (sc >= comfort) return rs[i];
      if (sc > bestS) { bestS = sc; best = rs[i]; }
    }
    return best;
  }

  /**
   * 发一整轮的骰子。hero 没输入的那几颗**必须照样发出来**参与结算，
   * 否则全场骰数会少一截、结算口径整个偏掉。抽成独立函数是为了能直接断言
   * all.length === N*dpp —— 行为断言在这里不可靠（漏发会让数值升高而不是崩掉，
   * 方向和直觉相反，我据此写的第一版闸门就没抓到）。
   */
  function dealRound(hand, N, dpp, rnd) {
    var hands = [hand.slice()], all = hand.slice(), i, j, d;
    for (i = hand.length; i < dpp; i++) { d = 1 + (rnd() * 6 | 0); hands[0].push(d); all.push(d); }
    for (i = 1; i < N; i++) {
      var h = [];
      for (j = 0; j < dpp; j++) { d = 1 + (rnd() * 6 | 0); h.push(d); all.push(d); }
      hands.push(h);
    }
    return { hands: hands, all: all };
  }

  /**
   * 把 hero 已经叫出的 bid 之后的整轮打完，返回 hero 不喝的比例。
   *
   * 取代原来那个常数截断值 cont。外部评审证明常数会把"下家不立刻开"之后的
   * 全部后续状态压成同一个数，在三人局能让动作排序整个反过来
   * （某局面：模型给加注 0.554 排在开 0.559 之后，实测加注真值 0.790）。
   * 这里不再估，直接打。
   */
  var HERO_TAU = 0.40, HERO_COMFORT = 0.40;
  var _guardHits = 0;                       // rollout 循环触顶次数，正常必须恒为 0
  function guardHits() { return _guardHits; }
  function setHeroPolicy(t, c) { HERO_TAU = t; HERO_COMFORT = c; }

  function rolloutEV(bid, hand, N, wild, dpp, sims, seed) {
    var st = (seed | 0) || 987654321;
    function rnd() { st ^= st << 13; st ^= st >>> 17; st ^= st << 5; st |= 0; return (st >>> 0) / 4294967296; }
    var alive = 0, i;
    _guardHits = 0;

    for (var n = 0; n < sims; n++) {
      var dealt = dealRound(hand, N, dpp, rnd), hands = dealt.hands, all = dealt.all;
      // hero 后续回合用更强的策略（HERO_TAU/HERO_COMFORT），对手各有各的性格。
      // 起因：给 hero 也用通用酒桌策略时，2 人局明显吃亏 —— 因为加注后皮球立刻转回自己，
      // rollout 里 hero 的后续水平直接决定继续打的价值；人多时中间隔着别人，影响就小。
      var taus = [HERO_TAU], comforts = [HERO_COMFORT];
      for (i = 1; i < N; i++) { taus.push(0.28 + rnd() * 0.24); comforts.push(0.30 + rnd() * 0.20); }

      var cur = 1 % N, prev = 0, curBid = bid, guard = 0, loser = -1;
      while (guard++ < 200) {
        // hero(0号位)后续决策只能看见他真正输入过的骰子。
        // 补出来的那几颗要参与结算(all)，但**不能**进 hero 的信息集 ——
        // 否则就是 strategy fusion：当前这一步不知道、下一步突然知道了。
        // 外部评审实测这个泄漏能把推荐从「3个6」翻成「4个5」，差 7 个百分点。
        var visible = (cur === 0) ? hand : hands[cur];
        var mv = barMove(curBid, visible, N, wild, dpp, taus[cur], comforts[cur]);
        if (mv === null) {                                          // 开
          var actual = 0;
          for (i = 0; i < all.length; i++)
            if (all[i] === curBid.face || (wild && curBid.face !== 1 && all[i] === 1)) actual++;
          loser = (actual >= curBid.count) ? cur : prev;             // 叫牌为真 → 开的人喝
          break;
        }
        curBid = mv; prev = cur; cur = (cur + 1) % N;
      }
      // guard 触顶时 loser 还是 -1，若直接判 `loser !== 0` 会被算成"hero 没喝"，
      // 静默抬高结果。叫牌严格递增所以理论上到不了（实测最长 7 步），
      // 但真到了要保守计成 hero 喝，并计数供测试断言为 0。
      if (loser < 0) { _guardHits++; continue; }
      if (loser !== 0) alive++;
    }
    return alive / sims;
  }

  // ---------- 决策层 ----------

  var DEFAULTS = { tau: 0.40, soft: 0.08 };   // 下家开牌阈值 / logistic 软化宽度

  // 截断值 cont —— "把皮球踢出去之后，我这一轮不喝的概率"。
  // 原先用 (N-1)/N 推导，实测是错的：3 人局下工具反而比基准更容易喝
  // （40.4% vs 33.3%）。改为对着建模的酒桌玩家逐人数标定，每格 4000 轮自对弈，
  // 取"最优值 1 个标准误内的候选中位数"以免拟合噪声。见 test/calibrate.js。
  // 诚实说明：它实际起的是"激进度"旋钮的作用，不是一个推导出来的概率。
  var CONT = { 2: 0.70, 3: 0.50, 4: 0.50, 5: 0.55, 6: 0.70, 7: 0.75, 8: 0.70 };
  function contFor(N) { return CONT[N] != null ? CONT[N] : 0.72; }

  /** 下家看到自己的 j 之后，开我这一注的概率 */
  function challengeProb(bidCount, j, N, wild, face, dpp, opt) {
    var p = faceProb(face, wild);
    var unknownToB = N * dpp - dpp;                       // B 只看得见自己那 dpp 颗
    var pB = binomGE(unknownToB, bidCount - j, p);        // B 主观认为"这注是真的"的概率
    return 1 / (1 + Math.exp((pB - opt.tau) / opt.soft)); // pB 越低越想开
  }

  /**
   * 下家立刻开这一注的概率、以及"真被开时这注成立"的概率 ——
   * **按 rollout 里那桌对手**算（tau ~ Uniform[0.28,0.52] 的硬阈值），
   * 而不是 evRaise 用的固定 tau=0.4 logistic。
   * 外部评审指出：页面显示"下家开你 8%"而产生该 EV 的对手实际只有 0.8%，
   * 两个数字描述的不是同一桌人。
   */
  function immediateStats(bid, hand, N, wild, dpp) {
    var p = faceProb(bid.face, wild), k = myCount(hand, bid.face, wild);
    var unknownToB = N * dpp - dpp, others = N * dpp - hand.length - dpp;
    var pc = 0, joint = 0;
    for (var j = 0; j <= dpp; j++) {
      var pj = binomPMF(dpp, j, p);
      if (pj < 1e-15) continue;
      var pB = binomGE(unknownToB, bid.count - j, p);
      var ch = (0.52 - pB) / 0.24;                    // P(tau > pB)，tau~U[0.28,0.52]
      if (ch < 0) ch = 0; else if (ch > 1) ch = 1;
      pc += pj * ch;
      joint += pj * ch * binomGE(others, bid.count - k - j, p);
    }
    return { pChallenged: pc, pTrueIfChallenged: pc > 1e-12 ? joint / pc : null };
  }

  /** 加注到 bid 的价值 = P(这一轮不是我喝)。见文件头模型说明。 */
  function evRaise(bid, hand, N, wild, dpp, opt) {
    dpp = dpp || 5; opt = opt || DEFAULTS;
    var p = faceProb(bid.face, wild);
    var k = myCount(hand, bid.face, wild);
    var nOthers = N * dpp - hand.length - dpp;   // 除我已知的和下家那手之外的骰
    var cont = (opt.cont != null) ? opt.cont : contFor(N);    // 见 CONT 表的说明
    var ev = 0, pChallengedTotal = 0, pSurviveIfChallenged = 0;

    for (var j = 0; j <= dpp; j++) {
      var pj = binomPMF(dpp, j, p);
      if (pj < 1e-15) continue;
      var ch = challengeProb(bid.count, j, N, wild, bid.face, dpp, opt);
      var pTrue = binomGE(nOthers, bid.count - k - j, p);
      ev += pj * (ch * pTrue + (1 - ch) * cont);
      pChallengedTotal += pj * ch;
      pSurviveIfChallenged += pj * ch * pTrue;
    }
    return {
      ev: ev,
      pChallenged: pChallengedTotal,                                            // 下家开我的概率
      pTrueIfChallenged: pChallengedTotal > 1e-12 ? pSurviveIfChallenged / pChallengedTotal : null
    };
  }

  /**
   * 值得细算的候选集：只按"这注还有没有可能成立"筛，不按个数排名截断。
   *
   * 两次教训都在这个函数上：
   *  ① 最早用便宜的 2-ply 分数每个点数只留一注 —— 有偏的筛子把真最优直接淘汰
   *     （三人局手握三个1，必真的「3个1」被淘汰给「4个1」，差 12 个百分点）。
   *  ② 改成"每个点数取个数最低的 8 注"仍然错 —— 那等于假设"个数越低越好"。
   *     8 人局 40 颗骰时合理叫数在 T/3≈13 附近，从最低个数数 8 个根本够不到：
   *     外部评审找到 pTrue=87% 的「11个5」被漏在候选外，比入围最优高 4.7 个百分点。
   * 所以现在不做任何排名截断，只丢掉几乎不可能成立的（实测最大候选规模约 110，跑得动）。
   */
  var CAND_PTRUE_FLOOR = 0.02;
  // 淘汰参数集中在这里，测试从 ELIM 读，避免写死导致"改了默认值察觉不到"
  var ELIM_COARSE = 350, ELIM_BANDS = [4.5, 3.5, 3.0];
  function candidateRaises(bid, hand, N, wild, dpp) {
    var all = legalRaises(bid, N, wild, dpp), out = [], i;
    for (i = 0; i < all.length; i++)
      if (pBidTrue(all[i], hand, N, wild, dpp) >= CAND_PTRUE_FLOOR) out.push(all[i]);
    return out;
  }

  /**
   * 主入口。返回排好序的建议列表。bid = null 表示我先叫。
   *
   * 三级，全部用同一个 rollout 模型，不掺任何有偏的启发式打分：
   *   ① 候选集：每个点数取个数最低的几注（见 candidateRaises）
   *   ② 粗筛：小样本 rollout，每个点数留最好的 2 注
   *   ③ 精算：大样本 rollout，最终排序，展示时每个点数留 1 注
   */
  function analyze(opts) {
    var hand = opts.hand, N = opts.players, bid = opts.bid || null;
    var wild = opts.wild !== false, dpp = opts.dicePerPlayer || 5;
    var useRollout = opts.useRollout != null ? opts.useRollout : (N >= 3);
    var sims = opts.sims == null ? (useRollout ? 1500 : 0) : opts.sims;
    var coarse = opts.coarseSims == null ? ELIM_COARSE : opts.coarseSims;
    var seed = opts.seed == null ? 20260822 : opts.seed;
    var tune = { tau: (opts.tau == null ? DEFAULTS.tau : opts.tau),
                 soft: (opts.soft == null ? DEFAULTS.soft : opts.soft),
                 cont: opts.cont };

    var actions = [], i, f;

    // 动作一：开。终局动作，精确，零模型成分。
    var challenge = null;
    if (bid) {
      var pTrue = pBidTrue(bid, hand, N, wild, dpp);
      challenge = { kind: 'challenge', ev: 1 - pTrue, pBidTrue: pTrue, exact: true };
      actions.push(challenge);
    }

    // legalCount 与 candidatesConsidered 必须分开报：
    //   前者 = 规则上还能不能往上叫；后者 = 还有没有值得细算的叫法。
    // 两者混为一谈会让界面把"还能叫但全都低于 2% 成立率"说成"叫到顶了"。
    // 实例：飞模式下上家叫 15个6，规则上还有 8 个合法斋叫（8个1…15个1），
    // 只是 pTrue 最高才 0.00027 被阈值滤掉 —— 那不是叫到顶。
    var legalCount = legalRaises(bid, N, wild, dpp).length;
    var cands = candidateRaises(bid, hand, N, wild, dpp), finalists = [];

    if (sims > 0) {
      // ② 逐轮淘汰。**任何一轮都不按名次截断** ——
      //    第一版按名次留前 2、第二版留前 4，外部评审两次都找到反例：
      //    真最优明明落在 3σ 带内，却因为排名靠后被砍掉（某局面差 2.0~2.3 个百分点）。
      //    现在样本逐轮翻倍、带宽随之收窄，只淘汰"统计上确实更差"的；
      //    到最后仍分不开的，用确定性判据（成立概率高、个数低）挑，而不是用噪声排名挑。
      // 带宽随轮次收窄：首轮样本最少、噪声最大，要最保守。
      // 实测（局面 [4,6,4,4,1] N=3，扫 3000 个种子）：250局+3σ 会有 1 次把真最优淘汰掉
      // （外部评审找到的 seed=2111，只差 0.0011）；350局+4.5σ 是 0/3000。
      var surv = [], rounds = [coarse, coarse * 4, coarse * 16], bands = ELIM_BANDS;
      for (i = 0; i < cands.length; i++) surv.push({ bid: cands[i], coarse: 0 });
      for (var ri = 0; ri < rounds.length; ri++) {
        var rs2 = rounds[ri], se = Math.sqrt(0.25 / rs2), byF = {};
        for (i = 0; i < surv.length; i++) {
          surv[i].coarse = rolloutEV(surv[i].bid, hand, N, wild, dpp, rs2, seed + ri * 7919);
          (byF[surv[i].bid.face] || (byF[surv[i].bid.face] = [])).push(surv[i]);
        }
        var next = [];
        for (f in byF) {
          var lst = byF[f], top = -1;
          for (i = 0; i < lst.length; i++) if (lst[i].coarse > top) top = lst[i].coarse;
          for (i = 0; i < lst.length; i++) if (lst[i].coarse >= top - bands[ri] * se) next.push(lst[i]);
        }
        surv = next;
        if (surv.length <= 8) break;                 // 已经足够窄，不必再多跑一轮
        // 再多跑一轮的代价 = 存活数 × 下一轮样本。太贵就此打住（8 人局 108 个候选时
        // 第三轮要 10 万局、单次 analyze 涨到 470ms，手机上更慢）。
        if (ri + 1 < rounds.length && surv.length * rounds[ri + 1] > 45000) break;
      }
      finalists = surv;
    } else {
      // N=2 走 2-ply 模型（实测单挑它更强，见 test/ranker-split.js）
      var bf = {};
      for (i = 0; i < cands.length; i++) {
        var c1 = cands[i], m1 = evRaise(c1, hand, N, wild, dpp, tune);
        if (!bf[c1.face] || m1.ev > bf[c1.face].coarse) bf[c1.face] = { bid: c1, coarse: m1.ev };
      }
      for (f in bf) finalists.push(bf[f]);
    }

    // ③ 精算。样本自适应：淘汰完通常只剩 3~6 个候选，固定 1500 局是浪费预算 ——
    //    真值差 2pp 的两注在 1500 局(se=1.3pp)下分不开，5000 局(se=0.7pp)就分得开。
    //    按总预算分摊，候选少就多跑，同时给 8 人局那种候选多的局面兜住耗时。
    var FINAL_BUDGET = 45000;
    var simsFinal = sims > 0
      ? Math.max(sims, Math.min(6000, Math.round(FINAL_BUDGET / Math.max(1, finalists.length))))
      : 0;

    var scored = [];
    for (i = 0; i < finalists.length; i++) {
      var c = finalists[i];
      // 展示字段必须与产生 ev 的模型同源：N>=3 的 ev 来自 rollout → 用 rollout 那桌对手算；
      // N=2 的 ev 来自 2-ply 模型 → 就得用 2-ply 的 logistic，否则又是"两个数字描述两桌人"。
      var st = sims > 0 ? immediateStats(c.bid, hand, N, wild, dpp)
                        : evRaise(c.bid, hand, N, wild, dpp, tune);
      scored.push({
        kind: 'raise', bid: c.bid,
        // 精算换一条随机流：粗筛用 seed 选出的 finalist，若精算复用同一批局，
        // 选中者的分数会带 winner's curse（被选中恰恰因为在那批局上运气好）。
        // 同一阶段内仍共用种子（CRN，配对比较方差更小）。
        ev: sims > 0 ? rolloutEV(c.bid, hand, N, wild, dpp, simsFinal, seed ^ 0x5bf03635) : c.coarse,
        evCI: sims > 0 ? 1.96 * Math.sqrt(0.25 / simsFinal) : null,
        pTrue: pBidTrue(c.bid, hand, N, wild, dpp),        // 精确、无模型
        pChallenged: st.pChallenged,
        pTrueIfChallenged: st.pTrueIfChallenged,
        prescore: evRaise(c.bid, hand, N, wild, dpp, tune).ev,   // 仅供诊断/回归对照
        mine: myCount(hand, c.bid.face, wild)
      });
    }
    // 展示时每个点数只留最好的一注。ev 在 1 个标准误内视为打平，
    // 打平时按"这注成立的概率高 → 个数低"这类确定性判据挑，不让噪声决定。
    var tie = 1.96 * Math.sqrt(0.25 / (simsFinal > 0 ? simsFinal : 1e9));
    var best = {};
    for (i = 0; i < scored.length; i++) {
      var a = scored[i], cur2 = best[a.bid.face];
      if (!cur2) { best[a.bid.face] = a; continue; }
      if (a.ev > cur2.ev + tie) { best[a.bid.face] = a; continue; }
      if (cur2.ev > a.ev + tie) continue;
      if (a.pTrue > cur2.pTrue || (a.pTrue === cur2.pTrue && a.bid.count < cur2.bid.count))
        best[a.bid.face] = a;
    }
    for (f in best) actions.push(best[f]);

    actions.sort(function (x, y) { return y.ev - x.ev; });
    return {
      actions: actions, challenge: challenge, best: actions[0],
      // 决赛圈（供测试断言"真最优没被淘汰"，这是与"抽样噪声"分开的关键性质）
      finalists: finalists.map(function (x) { return x.bid; }),
      // 一个合法加注都没有（叫到顶了）时，一次 rollout 都没跑过 —— 必须如实报 0，
      // 否则界面会说"跑了 6000 遍"却连个可跑的候选都没有。
      sims: finalists.length ? simsFinal : 0,
      coarseSims: (sims > 0 && cands.length) ? coarse : 0,
      method: sims > 0 ? 'rollout' : 'model',
      candidatesConsidered: cands.length,
      legalCount: legalCount,
      totalDice: N * dpp,
      unknownDice: N * dpp - hand.length,
      expectedPerFace: N * dpp * faceProb(2, wild)
    };
  }

  return {
    binomPMF: binomPMF, binomGE: binomGE,
    faceProb: faceProb, myCount: myCount,
    pBidTrue: pBidTrue, legalRaises: legalRaises,
    challengeProb: challengeProb, evRaise: evRaise,
    analyze: analyze, DEFAULTS: DEFAULTS, contFor: contFor,
    // 暴露淘汰参数：测试必须读真实值，写死会让"改了默认值"这类回归察觉不到
    ELIM: { coarse: ELIM_COARSE, bands: ELIM_BANDS },
    minimalRaises: minimalRaises, barMove: barMove, rolloutEV: rolloutEV, dealRound: dealRound,
    setHeroPolicy: setHeroPolicy, candidateRaises: candidateRaises, immediateStats: immediateStats,
    guardHits: guardHits
  };
});
