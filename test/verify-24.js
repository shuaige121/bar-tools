const S = require('../src/engine-24.js');
let P=0,F=0; const fails=[];
function ok(n,c,d){ if(c){P++;console.log('  ✅ '+n)} else {F++;fails.push(n);console.log('  ❌ '+n+'  '+(d||''))} }

// 独立求值器：不复用引擎的 apply，避免自我指涉
function evalExpr(s){ return Function('"use strict";return ('+s.replace(/ /g,'')+')')(); }

console.log('\n【1】必须靠分数才能解的经典题（浮点法会全部漏掉）');
for (const [nums, note] of [
  [[3,3,8,8], '8/(3-8/3)'], [[1,5,5,5], '5*(5-1/5)'], [[1,3,4,6], '6/(1-3/4)'],
  [[1,4,5,6], ''], [[2,7,8,9], ''], [[1,6,6,8], ''], [[3,3,7,7], '7*(3+3/7)'],
  [[1,1,4,6], ''], [[5,7,8,8], ''], [[1,2,7,7], ''],
]) {
  const r = S.solve(nums, 24);
  ok(`[${nums}] 有解${note?' ('+note+')':''}`, r.solvable, JSON.stringify(r));
}

console.log('\n【2】确认无解的题不能编出解来');
// 这些不是我猜的 —— 是从 1820 组全域普查里导出来的真无解集（共 458 组）
for (const nums of [[1,1,1,1],[1,1,1,2],[1,1,1,3],[4,7,7,9],[11,11,13,13],[13,13,13,13]]) {
  const r = S.solve(nums,24);
  ok(`[${nums}] 无解`, !r.solvable, `却给出 ${r.solutions[0]}`);
}

console.log('\n【3】每一条解都必须真的等于 24（用独立求值器复核）');
let bad=null, checked=0;
outer:
for (let a=1;a<=13;a++) for (let b=a;b<=13;b++) for (let c=b;c<=13;c++) for (let d=c;d<=13;d++){
  const r=S.solve([a,b,c,d],24);
  for(const s of r.solutions){
    checked++;
    const v=evalExpr(s);
    if(Math.abs(v-24)>1e-9){ bad=`[${a},${b},${c},${d}] → ${s} = ${v}`; break outer; }
  }
}
ok(`全部 ${checked} 条解经独立求值器复核都 = 24`, !bad, bad||'');

console.log('\n【4】解里用到的数字必须恰好是给的那四个（不多不少）');
let misuse=null;
for (const nums of [[3,3,8,8],[1,5,5,5],[4,4,10,10],[1,3,4,6],[6,6,6,6],[2,3,5,12]]) {
  for (const s of S.solve(nums,24).solutions) {
    const used = (s.match(/\d+/g)||[]).map(Number).sort((x,y)=>x-y);
    const want = [...nums].sort((x,y)=>x-y);
    if (JSON.stringify(used)!==JSON.stringify(want)) { misuse=`[${nums}] → ${s} 用了 [${used}]`; break; }
  }
}
ok('用数一致', !misuse, misuse||'');

console.log('\n【5】去重有效：交换律/结合律的同一解只出现一次');
{
  const r=S.solve([2,3,4,1],24);
  const norm = r.solutions.map(s=>s.replace(/[()\s]/g,''));
  ok('无完全重复的式子', new Set(r.solutions).size===r.solutions.length,
     `${r.solutions.length} 条里只有 ${new Set(r.solutions).size} 条不同`);
  // 全域扫一遍，别只验一组就推广
  let dupSet=null, dupN=0;
  for (let a2=1;a2<=13&&!dupSet;a2++) for (let b2=a2;b2<=13&&!dupSet;b2++)
  for (let c2=b2;c2<=13&&!dupSet;c2++) for (let d2=c2;d2<=13&&!dupSet;d2++){
    const sol=S.solve([a2,b2,c2,d2],24).solutions;
    if(new Set(sol).size!==sol.length){ dupSet=`[${a2},${b2},${c2},${d2}]`; dupN=sol.length-new Set(sol).size; }
  }
  ok('全部 1820 组里都没有重复式子', !dupSet, `${dupSet} 有 ${dupN} 条重复`);
  ok('1*2*3*4 这类只留一条', norm.filter(s=>/^[1234][*][1234][*][1234][*][1234]$/.test(s)).length===1,
     JSON.stringify(norm.filter(s=>/^[1234][*][1234][*][1234][*][1234]$/.test(s))));
}

console.log('\n【6】全域普查：1..13 的四张牌，可解组合有多少');
{
  let total=0, solvable=0;
  for (let a=1;a<=13;a++) for (let b=a;b<=13;b++) for (let c=b;c<=13;c++) for (let d=c;d<=13;d++){
    total++; if (S.solve([a,b,c,d],24,1).solvable) solvable++;
  }
  console.log(`     ${solvable} / ${total} 组可解 (${(solvable/total*100).toFixed(1)}%)`);
  ok('总组合数 = C(16,4) = 1820', total===1820, `got ${total}`);
  ok('可解数落在公开常引用的 1362 附近', Math.abs(solvable-1362)<=2, `got ${solvable}`);
}

console.log('\n'+'='.repeat(64));
console.log(`  通过 ${P} / 失败 ${F}`);
if(F){ console.log('  失败: '+fails.join(' | ')); process.exit(1); }
