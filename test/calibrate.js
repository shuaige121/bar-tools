/* 逐人数标定截断值 cont。输出一张表，直接进引擎。
   注意这是"对着我建模的酒桌玩家"标定的，所以必须再拿另外两类对手做稳健性检验。 */
const E = require('../src/engine-dice.js');
const W = require('./winrate-lib.js');
const R = +(process.argv[2] || 4000);
const CONTS = [0.30,0.35,0.40,0.45,0.50,0.55,0.60,0.65,0.70,0.75];
const NS = [2,3,4,5,6,7,8];
const out = {};
console.log(`\n逐人数标定 cont   ${R} 轮/格   （落酒率%，越低越好）\n`);
console.log('  N  基准  ' + CONTS.map(c=>c.toFixed(2).padStart(7)).join('') + '   → 选定');
for (const N of NS) {
  const row = [];
  for (const c of CONTS) row.push(W.drinkRate(N, W.makeTool({cont:c}), R, 'bar'));
  // 选：在最优值 1 个标准误内的候选里取中位数，避免拟合噪声
  const se = Math.sqrt(0.25/R);
  const best = Math.min(...row);
  const okIdx = row.map((v,i)=>[v,i]).filter(([v])=>v <= best + se).map(([,i])=>i);
  const pick = CONTS[okIdx[Math.floor(okIdx.length/2)]];
  out[N] = pick;
  console.log(`  ${N}  ${(100/N).toFixed(0).padStart(3)}%  ` +
    row.map((v,i)=>`${(v*100).toFixed(1)}`.padStart(7) + (CONTS[i]===pick?'*':' ')).join('').replace(/ $/,'') +
    `  → ${pick}`);
}
console.log('\n标定表:', JSON.stringify(out));
