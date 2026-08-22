require('./fault-runner.js')('../src/engine-24.js', 'verify-24.js', [
 // 已移除两条：'浮点判等 1e-9' 与 '容差放大到 1e-3'。
 // 不是闸门抓不到，是这两个故障在 4×(1..13) 这个输入域里**不可观测**：
 // 全域探针显示不存在落在 24±1e-3 内却不等于 24 的表达式值。
 // 同理移除 '去掉约分'：约分后分子分母最大 28561，double 完全精确。
 // 与其写一条永远不会响的测试来凑绿，不如把原因记在这里。
 // 忠实复现"有人把这段改写成浮点"的场景：整条算术链走 double。
 // 只把最后一步判等换成浮点是抓不到的 —— 因为前面的算术精确，v.n/v.d 恰好等于 24。
 ['整条算术链改成浮点（8/(3-8/3) 变 23.999999999999996）',
  `  function apply(op, a, b) {                 // a op b，除零返回 null
    switch (op) {
      case '+': return rat(a.n * b.d + b.n * a.d, a.d * b.d);
      case '-': return rat(a.n * b.d - b.n * a.d, a.d * b.d);
      case '*': return rat(a.n * b.n, a.d * b.d);
      case '/': return b.n === 0 ? null : rat(a.n * b.d, a.d * b.n);
    }
  }`,
  `  function apply(op, a, b) {
    var x = a.n / a.d, y = b.n / b.d, r;
    switch (op) {
      case '+': r = x + y; break;
      case '-': r = x - y; break;
      case '*': r = x * y; break;
      case '/': if (y === 0) return null; r = x / y; break;
    }
    return { n: r, d: 1 };
  }`],
 ['减法只试一个方向（漏掉 b-a 的解）',
  "var pairs = (op === '+' || op === '*') ? [[A, B]] : [[A, B], [B, A]];",
  "var pairs = [[A, B]];"],
 ['除零没拦（产生 Infinity/NaN）',
  "case '/': return b.n === 0 ? null : rat(a.n * b.d, a.d * b.n);",
  "case '/': return rat(a.n * b.d, a.d * b.n);"],
 ['渲染去重那道没了（结果里出现重复行）',
  'if (seenStr[str]) return;', 'if (false) return;'],
]);
