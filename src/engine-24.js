/* ============================================================================
 * 24 点求解器。全程精确有理数（分子分母整数 + 交叉相乘判等）。
 *
 * 关于"为什么不用浮点"——实测结论比直觉温和，记在这里免得下次又想当然：
 * 对 4 张 1..13 的牌做过全域探针，(a) 不存在"落在 24±1e-3 内但不等于 24"的
 * 表达式值，(b) 约分后分子/分母最大仅 28561，远在 double 精确整数上限 9e15 之下。
 * 也就是说 `Math.abs(v-24) < 1e-9` 在这个输入域里同样是正确的。
 * 保留精确有理数是防御性的：它让"容差取多少"这个问题根本不存在，
 * 且在牌数或数值范围扩大时不会悄悄失效。它不是这里的救命稻草，别再这么宣传。
 *
 * 真正会出错的是拿 `v === 24` 直接比浮点（8/(3-8/3) = 23.999999999999996）——
 * 交叉相乘判等从结构上排除了这条路。
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine24 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function gcd(a, b) { while (b) { var t = a % b; a = b; b = t; } return a || 1; }
  function rat(n, d) {                       // 约分并把符号统一放到分子
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(Math.abs(n), Math.abs(d));
    return { n: n / g, d: d / g };
  }

  var OPS = ['+', '-', '*', '/'];
  function apply(op, a, b) {                 // a op b，除零返回 null
    switch (op) {
      case '+': return rat(a.n * b.d + b.n * a.d, a.d * b.d);
      case '-': return rat(a.n * b.d - b.n * a.d, a.d * b.d);
      case '*': return rat(a.n * b.n, a.d * b.d);
      case '/': return b.n === 0 ? null : rat(a.n * b.d, a.d * b.n);
    }
  }

  var PREC = { '+': 1, '-': 1, '*': 2, '/': 2 };

  /** 渲染成人读的式子，只在必要处加括号 */
  function render(node) {
    if (node.leaf !== undefined) return String(node.leaf);
    var p = PREC[node.op], L = render(node.l), R = render(node.r);
    if (node.l.op && PREC[node.l.op] < p) L = '(' + L + ')';
    // 右子式：优先级更低，或同级但父运算不满足结合律（减、除）
    if (node.r.op && (PREC[node.r.op] < p || (PREC[node.r.op] === p && (node.op === '-' || node.op === '/'))))
      R = '(' + R + ')';
    return L + ' ' + node.op + ' ' + R;
  }

  /** 规范化键：把 + 和 * 的链拍平并排序，从而把交换律/结合律的同一解归成一条 */
  function key(node) {
    if (node.leaf !== undefined) return 'v' + node.leaf;
    if (node.op === '+' || node.op === '*') {
      var acc = [];
      (function flat(x) { if (x.op === node.op) { flat(x.l); flat(x.r); } else acc.push(key(x)); })(node);
      return '(' + acc.sort().join(node.op) + ')';
    }
    return '(' + key(node.l) + node.op + key(node.r) + ')';
  }

  /**
   * 求解。nums 为整数数组（长度任意，通常 4）。
   * 返回 { solvable, solutions:[式子字符串], count }
   * limit 限制返回条数（0 = 不限）；即使限流，count 仍是去重后的真实总数。
   */
  function solve(nums, target, limit) {
    target = target == null ? 24 : target;
    var tgt = rat(target, 1);
    // 两道去重：
    //   seenKey —— 交换律/结合律重排（1*2*3*4 与 4*3*2*1，渲染不同但是同一个解）
    //   seenStr —— 渲染塌陷（((2*3)*4)/1 与 (2*3)*(4/1) 是两棵树，却渲染成同一行字）
    // 只做前者会在结果里留下肉眼可见的重复行。
    var seenKey = Object.create(null), seenStr = Object.create(null), out = [];

    function search(items) {
      if (items.length === 1) {
        var v = items[0].val;
        if (v.n * tgt.d === tgt.n * v.d) {      // 精确判等，绝不做浮点比较
          var k = key(items[0].node);
          if (seenKey[k]) return;
          seenKey[k] = 1;
          var str = render(items[0].node);
          if (seenStr[str]) return;
          seenStr[str] = 1;
          out.push(str);
        }
        return;
      }
      for (var i = 0; i < items.length; i++) {
        for (var j = i + 1; j < items.length; j++) {
          var rest = [];
          for (var t = 0; t < items.length; t++) if (t !== i && t !== j) rest.push(items[t]);
          var A = items[i], B = items[j];
          for (var o = 0; o < 4; o++) {
            var op = OPS[o];
            // 交换律的算子只做一个方向；减、除两个方向都要试
            var pairs = (op === '+' || op === '*') ? [[A, B]] : [[A, B], [B, A]];
            for (var q = 0; q < pairs.length; q++) {
              var x = pairs[q][0], y = pairs[q][1];
              var v = apply(op, x.val, y.val);
              if (v === null) continue;
              search(rest.concat([{ val: v, node: { op: op, l: x.node, r: y.node } }]));
            }
          }
        }
      }
    }

    search(nums.map(function (n) { return { val: rat(n, 1), node: { leaf: n } }; }));
    out.sort(function (a, b) { return a.length - b.length || (a < b ? -1 : 1); });  // 短式子排前面
    return {
      solvable: out.length > 0,
      count: out.length,
      solutions: (limit && limit > 0) ? out.slice(0, limit) : out
    };
  }

  /** 用于展示：1→A, 11→J, 12→Q, 13→K */
  function cardLabel(n) { return ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[n] || String(n); }

  return { solve: solve, rat: rat, apply: apply, render: render, key: key, cardLabel: cardLabel };
});
