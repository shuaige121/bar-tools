/* ============================================================================
 * 德州扑克：牌型评估 + 胜率(equity)计算
 *
 * 两个评估器，互为对照：
 *   eval5  —— 五张牌，写法笨但显然正确。用它做 C(52,5)=2,598,960 全域普查，
 *             各牌型数量必须精确等于公开的组合数学结果（同花顺40/四条624/…）。
 *   eval7  —— 七张牌直接算，快，供蒙特卡洛用。它的正确性由"对任意七张牌，
 *             eval7 == max(21 个五张子集的 eval5)"来钉死。
 * 快的那个出错时，慢的那个会当场揭穿它。
 *
 * 牌编码：0..51，rank = (c>>2)+2 ∈ [2,14]（14=A），suit = c&3。
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EngineHoldem = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RANKS = '23456789TJQKA', SUITS = 'shdc';
  var CAT = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];

  function rankOf(c) { return (c >> 2) + 2; }
  function suitOf(c) { return c & 3; }
  function cardStr(c) { return RANKS[rankOf(c) - 2] + SUITS[suitOf(c)]; }
  function parseCard(s) {                    // 'As' / 'Th' / '9d'
    var r = RANKS.indexOf(s[0].toUpperCase()), u = SUITS.indexOf(s[1].toLowerCase());
    return (r < 0 || u < 0) ? -1 : (r * 4 + u);
  }

  // 打分：cat*15^5 + 五个用于比大小的 rank，从高到低
  function pack(cat, a, b, c, d, e) {
    return ((((cat * 15 + (a || 0)) * 15 + (b || 0)) * 15 + (c || 0)) * 15 + (d || 0)) * 15 + (e || 0);
  }

  /** 五张牌评估。写法直白，作为"显然正确"的基准。 */
  function eval5(cs) {
    var i, r, rs = [], sameSuit = true, s0 = suitOf(cs[0]);
    for (i = 0; i < 5; i++) { rs.push(rankOf(cs[i])); if (suitOf(cs[i]) !== s0) sameSuit = false; }
    rs.sort(function (a, b) { return b - a; });

    var cnt = {}, k;
    for (i = 0; i < 5; i++) cnt[rs[i]] = (cnt[rs[i]] || 0) + 1;
    var groups = [];
    for (k in cnt) groups.push([cnt[k], +k]);
    groups.sort(function (a, b) { return b[0] - a[0] || b[1] - a[1]; });  // 先按张数，再按点数

    // 顺子（含 A2345 轮子，此时以 5 为最高张）
    var uniq = [], seen = {};
    for (i = 0; i < 5; i++) if (!seen[rs[i]]) { seen[rs[i]] = 1; uniq.push(rs[i]); }
    var straightHigh = 0;
    if (uniq.length === 5) {
      if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
      else if (uniq[0] === 14 && uniq[1] === 5) straightHigh = 5;
    }

    if (sameSuit && straightHigh) return pack(8, straightHigh);
    if (groups[0][0] === 4) return pack(7, groups[0][1], groups[1][1]);
    if (groups[0][0] === 3 && groups[1][0] === 2) return pack(6, groups[0][1], groups[1][1]);
    if (sameSuit) return pack(5, rs[0], rs[1], rs[2], rs[3], rs[4]);
    if (straightHigh) return pack(4, straightHigh);
    if (groups[0][0] === 3) return pack(3, groups[0][1], groups[1][1], groups[2][1]);
    if (groups[0][0] === 2 && groups[1][0] === 2) return pack(2, groups[0][1], groups[1][1], groups[2][1]);
    if (groups[0][0] === 2) return pack(1, groups[0][1], groups[1][1], groups[2][1], groups[3][1]);
    return pack(0, rs[0], rs[1], rs[2], rs[3], rs[4]);
  }

  /** 七张牌直接评估。快路径，正确性靠与 eval5 的 21 子集最大值对照。 */
  function eval7(cs) {
    var rc = new Array(15).fill(0), sc = [0, 0, 0, 0], bySuit = [[], [], [], []], i, r, s;
    for (i = 0; i < cs.length; i++) {
      r = rankOf(cs[i]); s = suitOf(cs[i]);
      rc[r]++; sc[s]++; bySuit[s].push(r);
    }
    // 同花 / 同花顺
    for (s = 0; s < 4; s++) if (sc[s] >= 5) {
      var fr = bySuit[s].slice().sort(function (a, b) { return b - a; });
      var fset = {}, j;
      for (j = 0; j < fr.length; j++) fset[fr[j]] = 1;
      for (r = 14; r >= 5; r--)                                   // 同花顺
        if (fset[r] && fset[r - 1] && fset[r - 2] && fset[r - 3] && fset[r - 4]) return pack(8, r);
      if (fset[5] && fset[4] && fset[3] && fset[2] && fset[14]) return pack(8, 5);   // 轮子同花顺
      return pack(5, fr[0], fr[1], fr[2], fr[3], fr[4]);
    }
    // 按张数分组
    var quad = 0, trips = [], pairs = [], singles = [];
    for (r = 14; r >= 2; r--) {
      if (rc[r] === 4) quad = r;
      else if (rc[r] === 3) trips.push(r);
      else if (rc[r] === 2) pairs.push(r);
      else if (rc[r] === 1) singles.push(r);
    }
    if (quad) {
      var kick = 0;
      for (r = 14; r >= 2; r--) if (r !== quad && rc[r] > 0) { kick = r; break; }
      return pack(7, quad, kick);
    }
    if (trips.length >= 2) return pack(6, trips[0], trips[1]);                    // 两组三条 → 葫芦
    if (trips.length === 1 && pairs.length >= 1) return pack(6, trips[0], pairs[0]);
    // 顺子
    var run = 0;
    for (r = 14; r >= 2; r--) {
      run = rc[r] ? run + 1 : 0;
      if (run >= 5) return pack(4, r + 4);
    }
    if (rc[14] && rc[5] && rc[4] && rc[3] && rc[2]) return pack(4, 5);            // 轮子
    if (trips.length === 1) return pack(3, trips[0], singles[0], singles[1]);
    if (pairs.length >= 2) {
      var k3 = 0;
      for (r = 14; r >= 2; r--) if (r !== pairs[0] && r !== pairs[1] && rc[r] > 0) { k3 = r; break; }
      return pack(2, pairs[0], pairs[1], k3);
    }
    if (pairs.length === 1) return pack(1, pairs[0], singles[0], singles[1], singles[2]);
    return pack(0, singles[0], singles[1], singles[2], singles[3], singles[4]);
  }

  function categoryOf(score) { return Math.floor(score / (15 * 15 * 15 * 15 * 15)); }
  function categoryName(score) { return CAT[categoryOf(score)]; }

  // ---------- 胜率 ----------
  var _seed = 123456789;
  function setSeed(s) { _seed = s | 0 || 1; }
  function rnd() { _seed ^= _seed << 13; _seed ^= _seed >>> 17; _seed ^= _seed << 5; _seed |= 0; return (_seed >>> 0) / 4294967296; }

  /**
   * 计算 hero 的胜率。
   *   hero      : [c1,c2]
   *   board     : [] / 3 / 4 / 5 张
   *   opponents : 数字 = 若干个未知手牌的对手；或数组 [[c,c],[c,c]] = 已知的对手手牌
   *   iters     : 蒙特卡洛次数
   * 返回 { win, tie, lose, equity }，equity = win + tie/份数（平分底池按份计）
   */
  function equity(hero, board, opponents, iters) {
    iters = iters || 60000;
    var known = hero.concat(board), i, j;
    var oppKnown = Array.isArray(opponents) ? opponents : null;
    var nOpp = oppKnown ? oppKnown.length : opponents;
    if (oppKnown) for (i = 0; i < oppKnown.length; i++) known = known.concat(oppKnown[i]);

    var used = new Array(52).fill(false);
    for (i = 0; i < known.length; i++) {
      if (known[i] < 0 || known[i] > 51 || used[known[i]]) return null;   // 非法或重复
      used[known[i]] = true;
    }
    var deck = [];
    for (i = 0; i < 52; i++) if (!used[i]) deck.push(i);

    var needBoard = 5 - board.length;
    var needOpp = oppKnown ? 0 : nOpp * 2;
    if (needBoard + needOpp > deck.length) return null;

    var win = 0, tie = 0, lose = 0, tieShare = 0;
    var d = deck.slice();
    for (var it = 0; it < iters; it++) {
      // 洗前 needBoard+needOpp 张就够（部分 Fisher-Yates）
      for (i = 0; i < needBoard + needOpp; i++) {
        j = i + Math.floor(rnd() * (d.length - i));
        var t = d[i]; d[i] = d[j]; d[j] = t;
      }
      var fullBoard = board.concat(d.slice(0, needBoard));
      var heroScore = eval7(hero.concat(fullBoard));
      var best = heroScore, ties = 1, beaten = false;
      for (i = 0; i < nOpp; i++) {
        var oh = oppKnown ? oppKnown[i] : [d[needBoard + i * 2], d[needBoard + i * 2 + 1]];
        var os = eval7(oh.concat(fullBoard));
        if (os > best) { best = os; beaten = true; ties = 1; }
        else if (os === best && os === heroScore) ties++;
      }
      if (beaten) lose++;
      else if (ties > 1) { tie++; tieShare += 1 / ties; }
      else win++;
    }
    return {
      win: win / iters, tie: tie / iters, lose: lose / iters,
      equity: (win + tieShare) / iters, iters: iters
    };
  }

  return {
    RANKS: RANKS, SUITS: SUITS, CAT: CAT,
    rankOf: rankOf, suitOf: suitOf, cardStr: cardStr, parseCard: parseCard,
    eval5: eval5, eval7: eval7, categoryOf: categoryOf, categoryName: categoryName,
    equity: equity, setSeed: setSeed
  };
});
