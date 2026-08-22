/* 排序器分界的证据表。这个分界是量出来的，任何人想合并成一个算法，先跑这个。 */
const E = require('../src/engine-dice.js');
const W = require('./winrate-lib.js');
const R = +(process.argv[2] || 1500);
const KINDS = ['bar','mixed','counter','aggro','nit','noob'];
console.log(`\n排序器对照  ${R} 轮/格   （落酒率，越低越好）\n`);
console.log('  人数 对手'.padEnd(20) + 'rollout   2-ply    基准    胜者');
const tally = {};
for (const N of [2,3,4,6]) {
  for (const k of KINDS) {
    const a = W.drinkRate(N, W.makeTool({sims:400, useRollout:true}),  R, k);
    const b = W.drinkRate(N, W.makeTool({sims:0,   useRollout:false}), R, k);
    const se = 1.96*Math.sqrt(0.25/R);
    const win = Math.abs(a-b) < se ? '持平' : (a < b ? 'rollout' : '2-ply');
    tally[N] = tally[N] || {rollout:0,'2-ply':0,'持平':0}; tally[N][win]++;
    console.log(`  ${N}人 ${k}`.padEnd(20) + `${(a*100).toFixed(1)}%   ${(b*100).toFixed(1)}%   ${(100/N).toFixed(0)}%    ${win}`);
  }
}
console.log('\n  汇总（6 种对手）：');
for (const N of [2,3,4,6])
  console.log(`   ${N}人局  rollout胜 ${tally[N].rollout} / 2-ply胜 ${tally[N]['2-ply']} / 持平 ${tally[N]['持平']}`);
console.log('\n  引擎据此在 N>=3 用 rollout、N=2 用 2-ply。');
