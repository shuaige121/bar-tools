/* 稳健性：拿"跟 rollout 内部假设结构不同"的对手来考。
   打赢自己想象的对手不算数——这一条专门回答 Codex 提的过拟合怀疑。 */
const W = require('./winrate-lib.js');
const ROUNDS = +(process.argv[2] || 1500);
const SIMS   = +(process.argv[3] || 400);
const KINDS = [
  ['bar',     '典型酒桌(rollout 假设的就是这种)'],
  ['mixed',   '混合桌(四种性格随机坐)'],
  ['counter', '计数派(只看个数占比，不算概率)'],
  ['aggro',   '激进派(几乎不开，一加跳两三个)'],
  ['nit',     '保守派(主观<0.55 就开)'],
  ['noob',    '新手(随机)'],
  ['mirror',  '镜像(对手也用本工具)'],
];
const tool = W.makeTool({ sims: SIMS });
console.log(`\n稳健性测试  ${ROUNDS} 轮/格 · 工具内部 rollout ${SIMS} 局\n`);
console.log('  对手类型'.padEnd(34) + [2,3,4,6].map(n=>`${n}人(基准${(100/n).toFixed(0)}%)`.padStart(16)).join(''));
const rows = [];
for (const [kind, label] of KINDS) {
  let line = '  ' + label.padEnd(32);
  const row = { kind, label, vals: {} };
  for (const N of [2,3,4,6]) {
    const me = W.drinkRate(N, tool, ROUNDS, kind);
    const base = 1/N;
    row.vals[N] = { me, base, gain: (base-me)/base };
    const mark = me < base - 1.96*Math.sqrt(base*(1-base)/ROUNDS) ? '✓'
               : me > base + 1.96*Math.sqrt(base*(1-base)/ROUNDS) ? '✗' : '·';
    line += `${(me*100).toFixed(1)}% ${mark}${((base-me)/base*100).toFixed(0).padStart(4)}%`.padStart(16);
  }
  console.log(line); rows.push(row);
}
console.log('\n  格式：落酒率 / 显著性 / 相对基准少喝。✓=显著优于基准 ✗=显著劣于基准 ·=无显著差异');
// 只看点估计会误报：落酒率比基准高一点但落在置信区间内，不构成"劣于基准"。
// 判据必须是统计显著（单侧 95%），跟表里的 ✗ 用同一个口径。
const bad = rows.filter(r => r.kind!=='mirror' && Object.values(r.vals).some(v =>
  v.me > v.base + 1.96*Math.sqrt(v.base*(1-v.base)/ROUNDS)));
console.log(bad.length
  ? `\n  ⚠️  以下对手下【显著】劣于基准: ${bad.map(r=>r.label).join(', ')}`
  : '\n  没有任何一种对手下显著劣于基准。');
const flat = rows.filter(r => r.kind!=='mirror' && Object.values(r.vals).some(v =>
  Math.abs(v.gain) < 0.05));
if (flat.length) console.log('  （下列组合没有显著优势，但也不劣：' +
  flat.map(r=>r.label.split('(')[0]).join('、') + '）');
