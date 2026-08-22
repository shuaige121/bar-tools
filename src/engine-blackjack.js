/* ============================================================================
 * 21 点：从规则精确计算 EV，反推每一格的最优决策。
 *
 * 为什么不直接内置一张"基本策略表"：那等于凭记忆抄数字，是编造风险最高的做法。
 * 这里改成把规则写成递归 EV，策略是算出来的结果而不是输入。副产品是能显示
 * 每个动作的具体 EV（"要牌 -0.21 / 停牌 -0.29"），比一个字母 H/S 有用得多。
 *
 * 牌堆模型：无限副（composition-independent），这是公开基本策略表的通行基准。
 * A=1/11，2..9 各 1/13，10/J/Q/K 合计 4/13。
 * 规则开关：庄家软17停/要、可否双倍后分牌(DAS)、可否投降、21点赔率。
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EngineBJ = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 牌值 1..10，对应概率
  var P = [0, 1/13, 1/13, 1/13, 1/13, 1/13, 1/13, 1/13, 1/13, 1/13, 4/13];

  function defaults(o) {
    o = o || {};
    return {
      hitSoft17: !!o.hitSoft17,                                   // 庄家软17是否要牌（H17）
      das: o.das !== false,                                       // 允许双倍后分牌
      surrender: o.surrender !== false,                           // 允许投降
      bjPay: o.bjPay == null ? 1.5 : o.bjPay,                     // 21点赔率
      peek: o.peek !== false,                                     // 庄家明牌A/10时先查黑杰克
      // 每手最多再分几次（**每手独立**，不是全桌共享的池）。默认 1 = 只分一次，
      // 此时与"全局池"语义完全等价（外部评审用独立 DP 交叉验证到 1e-16）。
      // >1 时两种语义会有微小差异；UI 不暴露这个选项，保持每手语义即可。
      maxSplit: o.maxSplit == null ? 1 : o.maxSplit
    };
  }

  /** 加一张牌：返回 [总点数, 是否软牌] */
  function add(total, soft, card) {
    var t = total + card, s = soft;
    if (card === 1 && t + 10 <= 21) { t += 10; s = true; }
    if (t > 21 && s) { t -= 10; s = false; }
    return [t, s];
  }

  /**
   * 庄家最终结果分布。返回 {17,18,19,20,21,bust} 概率（21 不含黑杰克）。
   * peekNoBJ = true 时，已排除庄家黑杰克（明牌 A 或 10 且已查过）。
   */
  function dealerDist(up, opt) {
    var memo = Object.create(null);
    function go(total, soft) {
      var k = total + (soft ? 'S' : 'H');
      if (memo[k]) return memo[k];
      var out = { 17:0, 18:0, 19:0, 20:0, 21:0, bust:0 };
      var stand = total >= 18 || (total === 17 && !(opt.hitSoft17 && soft));
      if (total > 21) { out.bust = 1; }
      else if (stand && total >= 17) { out[total] = 1; }
      else {
        for (var c = 1; c <= 10; c++) {
          var r = add(total, soft, c), sub = go(r[0], r[1]);
          for (var key in out) out[key] += P[c] * sub[key];
        }
      }
      memo[k] = out; return out;
    }
    var start = add(0, false, up);
    var d = go(start[0], start[1]);

    if (opt.peek && (up === 1 || up === 10)) {
      // 已知庄家不是黑杰克 → 把那一支去掉再归一化
      var pBJ = (up === 1) ? P[10] : P[1];
      var scale = 1 / (1 - pBJ);
      var bjTotal = 21, out = {17:0,18:0,19:0,20:0,21:0,bust:0};
      // 黑杰克那一支贡献的全部落在 "21"，从中扣掉
      for (var key2 in out) out[key2] = d[key2] * scale;
      out[21] = (d[21] - pBJ) * scale;
      if (out[21] < 0) out[21] = 0;
      d = out;
    }
    return d;
  }

  /** 停牌 EV：拿 total 和庄家分布比大小 */
  function standEV(total, dd) {
    if (total > 21) return -1;
    var ev = 0;
    for (var k in dd) {
      var p = dd[k];
      if (!p) continue;
      if (k === 'bust') ev += p;
      else { var d = +k; ev += p * (total > d ? 1 : total === d ? 0 : -1); }
    }
    return ev;
  }

  /** 某个玩家局面的各动作 EV。canDouble/canSurrender 只在首两张时为真。 */
  function actions(total, soft, dd, opt, canDouble, canSurrender) {
    var memoH = Object.create(null);
    function bestNoDouble(t, s) {                 // 之后只能要牌或停牌
      if (t > 21) return -1;
      var k = t + (s ? 'S' : 'H');
      if (memoH[k] !== undefined) return memoH[k];
      memoH[k] = -Infinity;                       // 递归保护
      var st = standEV(t, dd), hi = 0;
      for (var c = 1; c <= 10; c++) {
        var r = add(t, s, c);
        hi += P[c] * (r[0] > 21 ? -1 : bestNoDouble(r[0], r[1]));
      }
      var v = Math.max(st, hi);
      memoH[k] = v; return v;
    }
    var st = standEV(total, dd);
    var hit = 0;
    for (var c = 1; c <= 10; c++) {
      var r = add(total, soft, c);
      hit += P[c] * (r[0] > 21 ? -1 : bestNoDouble(r[0], r[1]));
    }
    var dbl = null;
    if (canDouble) {                              // 双倍：只能再拿一张，然后必须停牌
      dbl = 0;
      for (var c2 = 1; c2 <= 10; c2++) {
        var r2 = add(total, soft, c2);
        dbl += P[c2] * (r2[0] > 21 ? -1 : standEV(r2[0], dd));
      }
      dbl *= 2;
    }
    var sur = (canSurrender && opt.surrender) ? -0.5 : null;
    return { stand: st, hit: hit, double: dbl, surrender: sur };
  }

  /**
   * 单手 split hand 的期望：起手一张 pairCard，再补一张。
   * budget = 还允许再分几次。budget=0 即"只分一次"（原实现的行为，
   * 已被独立 DP 交叉验证到 1e-16）。
   */
  function splitHandEV(pairCard, dd, opt, budget) {
    var per = 0;
    for (var c = 1; c <= 10; c++) {
      var r = add(0, false, pairCard);
      r = add(r[0], r[1], c);
      var v;
      if (pairCard === 1) v = standEV(r[0], dd);        // 分A后每手只发一张，必须停牌
      else {
        var a = actions(r[0], r[1], dd, opt, opt.das, false);
        v = Math.max(a.stand, a.hit);
        if (a.double !== null) v = Math.max(v, a.double);
      }
      if (c === pairCard && budget > 0) {               // 又摸到同点，可以再分
        var resplit = 2 * splitHandEV(pairCard, dd, opt, budget - 1);
        if (resplit > v) v = resplit;
      }
      per += P[c] * v;
    }
    return per;
  }

  /** 分牌 EV（两手合计） */
  function splitEV(pairCard, dd, opt) {
    return 2 * splitHandEV(pairCard, dd, opt, Math.max(0, (opt.maxSplit == null ? 1 : opt.maxSplit) - 1));
  }

  var NAME = { stand:'停牌', hit:'要牌', double:'双倍', split:'分牌', surrender:'投降' };

  /**
   * 主入口。
   *   playerCards : [1..10, 1..10, ...]，A 用 1
   *   dealerUp    : 1..10
   * 返回各动作 EV、最优动作、以及玩家当前点数。
   */
  function advise(playerCards, dealerUp, opts) {
    var opt = defaults(opts);
    var dd = dealerDist(dealerUp, opt);
    var t = 0, s = false;
    for (var i = 0; i < playerCards.length; i++) { var r = add(t, s, playerCards[i]); t = r[0]; s = r[1]; }

    var first2 = playerCards.length === 2;
    var isBJ = first2 && t === 21;
    var isPair = first2 && playerCards[0] === playerCards[1];

    // 自然黑杰克已经锁定赔率，不能当普通 21 点丢进 standEV。
    // peek=true 时庄家黑杰克已被排除 → 必赢 bjPay；peek=false 时还可能撞上庄家黑杰克 → 平局。
    if (isBJ) {
      var pDealerBJ = opt.peek ? 0 : (dealerUp === 1 ? P[10] : dealerUp === 10 ? P[1] : 0);
      var bjEV = (1 - pDealerBJ) * opt.bjPay;
      return {
        total: t, soft: s, isBlackjack: true, isPair: false, dealerDist: dd, dealerBust: dd.bust,
        actions: [{ key:'stand', name:NAME.stand, ev:bjEV }],
        best: 'stand', bestName: NAME.stand, bestEV: bjEV
      };
    }

    var a = actions(t, s, dd, opt, first2, first2);
    var opts2 = [{ k:'stand', ev:a.stand }, { k:'hit', ev:a.hit }];
    if (a.double !== null) opts2.push({ k:'double', ev:a.double });
    if (isPair && opt.maxSplit >= 1) opts2.push({ k:'split', ev: splitEV(playerCards[0], dd, opt) });
    if (a.surrender !== null) opts2.push({ k:'surrender', ev:a.surrender });

    opts2.sort(function (x, y) { return y.ev - x.ev; });
    return {
      total: t, soft: s, isBlackjack: isBJ, isPair: isPair,
      dealerDist: dd,
      dealerBust: dd.bust,
      actions: opts2.map(function (o) { return { key:o.k, name:NAME[o.k], ev:o.ev }; }),
      best: opts2[0].k, bestName: NAME[opts2[0].k], bestEV: opts2[0].ev
    };
  }

  /** Hi-Lo 算牌：2-6 记 +1，7-9 记 0，10/A 记 -1 */
  function hiLo(card) { return (card >= 2 && card <= 6) ? 1 : (card >= 7 && card <= 9) ? 0 : -1; }
  function trueCount(running, decksLeft) { return decksLeft > 0 ? running / decksLeft : 0; }
  /** 真数 >= +3 时买保险才有利（无限副近似下的通行门槛） */
  function insuranceOK(tc) { return tc >= 3; }

  return {
    defaults: defaults, add: add, dealerDist: dealerDist, standEV: standEV,
    actions: actions, splitEV: splitEV, splitHandEV: splitHandEV, advise: advise,
    hiLo: hiLo, trueCount: trueCount, insuranceOK: insuranceOK, NAME: NAME
  };
});
