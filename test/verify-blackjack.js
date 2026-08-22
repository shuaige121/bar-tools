const B = require('../src/engine-blackjack.js');
let P=0,F=0; const fails=[];
function ok(n,c,d){ if(c){P++;console.log('  ✅ '+n)} else {F++;fails.push(n);console.log('  ❌ '+n+'  '+(d||''))} }
const D = B.defaults({});
const UP = [1,2,3,4,5,6,7,8,9,10];
const upName = u => u===1?'A':String(u);
const p = [0,1/13,1/13,1/13,1/13,1/13,1/13,1/13,1/13,1/13,4/13];

console.log('\n【1】庄家结果分布自洽');
for (const u of UP) {
  const d = B.dealerDist(u, D);
  const sum = Object.values(d).reduce((a,b)=>a+b,0);
  ok(`明牌 ${upName(u)} 分布和 = 1`, Math.abs(sum-1)<1e-12, `got ${sum}`);
  ok(`明牌 ${upName(u)} 各项非负`, Object.values(d).every(v=>v>=-1e-15));
}
{
  const bust = {}; for (const u of UP) bust[u] = B.dealerDist(u,D).bust;
  const worst = UP.reduce((a,b)=>bust[a]>bust[b]?a:b);
  const best  = UP.reduce((a,b)=>bust[a]<bust[b]?a:b);
  ok(`爆牌率最高的明牌是 5 或 6（实为 ${upName(worst)} ${(bust[worst]*100).toFixed(1)}%）`, worst===5||worst===6);
  ok(`爆牌率最低的明牌是 A（实为 ${upName(best)} ${(bust[best]*100).toFixed(1)}%）`, best===1);
  ok('小牌(2-6)平均爆牌率 > 大牌(7-A)', 
     [2,3,4,5,6].reduce((s,u)=>s+bust[u],0)/5 > [7,8,9,10,1].reduce((s,u)=>s+bust[u],0)/5);
}

console.log('\n【2】结构性不变量');
for (const u of UP) {
  const dd = B.dealerDist(u,D);
  ok(`明牌${upName(u)}: 21点停牌 EV 最高`, 
     [17,18,19,20].every(t=>B.standEV(21,dd) > B.standEV(t,dd)));
  ok(`明牌${upName(u)}: 爆牌 EV = -1`, B.standEV(22,dd)===-1);
  let mono=true, prev=-2;
  for(let t=16;t<=21;t++){ const v=B.standEV(t,dd); if(v<prev-1e-12) mono=false; prev=v; }
  ok(`明牌${upName(u)}: 停牌 EV 随点数单调不减`, mono);
}

console.log('\n【3】算出来的策略 vs 公认的锚点（这些是规则/数学决定的，不是我记的表）');
{
  const best = (cards,up,o) => B.advise(cards,up,o).best;
  ok('硬17~21 对任何明牌都停牌', UP.every(u=>[17,18,19,20,21].every(t=>
     best([10, t-10], u) === 'stand' || t===21)), '');
  ok('硬 5~8 对任何明牌都不停牌', UP.every(u=>[[2,3],[2,4],[3,4],[4,4]].every(c=>best(c,u)!=='stand')));
  ok('A,A 对任何明牌都分牌', UP.every(u=>best([1,1],u)==='split'), 
     UP.filter(u=>best([1,1],u)!=='split').map(upName).join(','));
  ok('8,8 对任何明牌都分牌', UP.every(u=>best([8,8],u)==='split'),
     UP.filter(u=>best([8,8],u)!=='split').map(u=>upName(u)+'→'+best([8,8],u)).join(','));
  ok('10,10 对任何明牌都不分牌', UP.every(u=>best([10,10],u)!=='split'));
  ok('5,5 对任何明牌都不分牌', UP.every(u=>best([5,5],u)!=='split'));
  ok('硬11 对明牌2~10 双倍', [2,3,4,5,6,7,8,9,10].every(u=>best([5,6],u)==='double'),
     [2,3,4,5,6,7,8,9,10].filter(u=>best([5,6],u)!=='double').map(u=>upName(u)+'→'+best([5,6],u)).join(','));
  ok('硬12 对明牌4/5/6 停牌', [4,5,6].every(u=>best([10,2],u)==='stand'),
     [4,5,6].filter(u=>best([10,2],u)!=='stand').map(u=>upName(u)+'→'+best([10,2],u)).join(','));
  ok('硬12 对明牌2/3 要牌', [2,3].every(u=>best([10,2],u)==='hit'));
  ok('硬13~16 对明牌7~A 都不停牌', [7,8,9,10,1].every(u=>[13,14,15,16].every(t=>
     best([10,t-10],u)!=='stand')));
  ok('软18(A,7) 对明牌9/10/A 不停牌', [9,10,1].every(u=>best([1,7],u)!=='stand'),
     [9,10,1].filter(u=>best([1,7],u)==='stand').map(upName).join(','));
  ok('软18(A,7) 对明牌2/7/8 停牌', [2,7,8].every(u=>['stand','double'].includes(best([1,7],u))));
  ok('9,9 对明牌7 停牌（庄家7大概率成17）', best([9,9],7)==='stand', `got ${best([9,9],7)}`);
  ok('9,9 对明牌6 分牌', best([9,9],6)==='split', `got ${best([9,9],6)}`);
}

console.log('\n【4】用基本策略打完整局的整体期望（公开的庄家优势约 0.5%）');
function overallEV(opts) {
  const opt = B.defaults(opts);
  let ev = 0;
  for (let up=1; up<=10; up++) {
    const pUp = p[up];
    const pDealerBJ = opt.peek ? (up===1 ? p[10] : up===10 ? p[1] : 0) : 0;
    for (let c1=1;c1<=10;c1++) for (let c2=1;c2<=10;c2++) {
      const w = pUp*p[c1]*p[c2];
      const playerBJ = (c1===1&&c2===10)||(c1===10&&c2===1);
      let v;
      if (playerBJ) v = pDealerBJ*0 + (1-pDealerBJ)*opt.bjPay;         // 双方黑杰克平局
      else {
        const a = B.advise([c1,c2], up, opts);
        v = pDealerBJ*(-1) + (1-pDealerBJ)*a.bestEV;                   // 庄家黑杰克直接输
      }
      ev += w*v;
    }
  }
  return ev;
}
for (const [name, o, lo, hi] of [
  ['S17 + DAS + 投降', {hitSoft17:false, das:true,  surrender:true},  -0.008, 0.001],
  ['S17 + DAS 无投降', {hitSoft17:false, das:true,  surrender:false}, -0.010, 0.000],
  ['H17 + DAS 无投降', {hitSoft17:true,  das:true,  surrender:false}, -0.012, -0.001],
  ['21点只赔 6:5',     {hitSoft17:false, das:true,  surrender:false, bjPay:1.2}, -0.025, -0.010],
]) {
  const ev = overallEV(o);
  ok(`${name}: 期望 ${(ev*100).toFixed(3)}%（应在 ${(lo*100).toFixed(1)}%~${(hi*100).toFixed(1)}%）`,
     ev>=lo && ev<=hi, `got ${(ev*100).toFixed(3)}%`);
}
{
  const a = overallEV({hitSoft17:false,das:true,surrender:false});
  const b = overallEV({hitSoft17:true, das:true,surrender:false});
  ok('H17 对玩家更不利（庄家软17要牌）', b < a, `S17=${(a*100).toFixed(3)}% H17=${(b*100).toFixed(3)}%`);
  const c = overallEV({hitSoft17:false,das:false,surrender:false});
  ok('禁 DAS 对玩家更不利', c < a, `DAS=${(a*100).toFixed(3)}% noDAS=${(c*100).toFixed(3)}%`);
  const d = overallEV({hitSoft17:false,das:true,surrender:false,bjPay:1.2});
  ok('6:5 赔率显著更差（差 >1 个百分点）', a-d > 0.010, `差 ${((a-d)*100).toFixed(2)}pp`);
}

console.log('\n【5】蒙特卡洛：照算出来的策略实打，模拟收益必须逼近解析 EV');
{
  // 第一版这段写坏了（用 [10, t-10] 硬凑后续手牌，软牌/点数全错），跑出 -7.65%。
  // 教训：模拟器本身也是被验对象，数值大幅偏离时先怀疑检查器。
  const RULES = {hitSoft17:false, das:true, surrender:false};
  const opt = B.defaults(RULES);

  // 解析值：只统计非对子起手，好跟跳过分牌的模拟直接对账
  function analyticNonPair() {
    let ev=0, w=0;
    for (let up=1; up<=10; up++) {
      const pDealerBJ = up===1 ? p[10] : up===10 ? p[1] : 0;
      for (let c1=1;c1<=10;c1++) for (let c2=1;c2<=10;c2++) {
        if (c1===c2) continue;                                  // 跳过对子
        const ww = p[up]*p[c1]*p[c2]; w += ww;
        const playerBJ = (c1===1&&c2===10)||(c1===10&&c2===1);
        ev += ww * (playerBJ
          ? (1-pDealerBJ)*opt.bjPay
          : pDealerBJ*(-1) + (1-pDealerBJ)*B.advise([c1,c2],up,RULES).bestEV);
      }
    }
    return ev/w;
  }

  let sd=555; const rnd=()=>{sd^=sd<<13;sd^=sd>>>17;sd^=sd<<5;sd|=0;return (sd>>>0)/4294967296};
  const draw=()=>{const r=rnd()*13|0; return r<9 ? r+1 : 10;};    // 1..9 各 1/13，10 占 4/13
  const isBJ = (a,b) => (a===1&&b===10)||(a===10&&b===1);
  const dcache = {}; const DD = u => dcache[u] || (dcache[u]=B.dealerDist(u,opt));

  // 正常跑 40 万；故障注入时由 runner 传 BJ_MC 缩小（19 条注入 × 12 秒太慢）。
  // 缩小后必须仍能抓到全部 19 条 —— 这一点单独验过，见 README 的说明。
  const N=+(process.env.BJ_MC || 400000); let total=0, played=0;
  for (let i=0;i<N;i++){
    const up=draw(), hole=draw(), pc=[draw(),draw()];
    if (pc[0]===pc[1]) continue;                                  // 分牌局面不计（解析值也剔除）
    played++;
    const dealerBJ = isBJ(up,hole), playerBJ = isBJ(pc[0],pc[1]);
    if (playerBJ || dealerBJ) { total += (playerBJ&&dealerBJ) ? 0 : playerBJ ? opt.bjPay : -1; continue; }

    let t=0, s=false, r;
    for (const c of pc){ r=B.add(t,s,c); t=r[0]; s=r[1]; }
    let bet=1, act=B.advise(pc,up,RULES).best;
    if (act==='double'){ bet=2; r=B.add(t,s,draw()); t=r[0]; s=r[1]; }
    else {
      while (act==='hit'){
        r=B.add(t,s,draw()); t=r[0]; s=r[1];
        if (t>21) break;
        const av=B.actions(t,s,DD(up),opt,false,false);
        act = av.hit > av.stand ? 'hit' : 'stand';
      }
    }
    if (t>21){ total += -bet; continue; }

    let dt=0, ds=false;
    for (const c of [up,hole]){ r=B.add(dt,ds,c); dt=r[0]; ds=r[1]; }
    while (dt<17 || (dt===17 && ds && opt.hitSoft17)){ r=B.add(dt,ds,draw()); dt=r[0]; ds=r[1]; }
    total += (dt>21 || t>dt) ? bet : (t===dt ? 0 : -bet);
  }
  const sim=total/played, ana=analyticNonPair();
  const se = 1.15/Math.sqrt(played);                              // 单手方差约 1.32（样本变小时容差自动放宽）
  ok(`模拟 ${played} 手 ${(sim*100).toFixed(2)}% vs 解析 ${(ana*100).toFixed(2)}%（3σ≈${(se*300).toFixed(2)}pp）`,
     Math.abs(sim-ana) <= 3*se + 0.001, `差 ${((sim-ana)*100).toFixed(2)}pp`);
  // 剔除对子会把 (10,10) 这手 20 点（占全部起手 9.5%、EV≈+0.65）一起剔掉，
  // 所以非对子期望本来就该在 -7% 附近 —— 我最初按 -1.5%~0% 设区间是错的。
  // 换成恒等式：对子加权 + 非对子加权 必须复原出整体期望。两条路互相钉死。
  {
    let evPair=0, wPair=0;
    for (let up=1; up<=10; up++) {
      const pDealerBJ = up===1 ? p[10] : up===10 ? p[1] : 0;
      for (let c=1;c<=10;c++) {
        const ww = p[up]*p[c]*p[c]; wPair += ww;
        evPair += ww * (pDealerBJ*(-1) + (1-pDealerBJ)*B.advise([c,c],up,RULES).bestEV);
      }
    }
    evPair /= wPair;
    const recon = wPair*evPair + (1-wPair)*ana;
    const whole = overallEV(RULES);
    ok(`恒等式复原：对子${(wPair*100).toFixed(1)}%×${(evPair*100).toFixed(1)}% + 非对子×${(ana*100).toFixed(2)}% = ${(recon*100).toFixed(3)}%（整体 ${(whole*100).toFixed(3)}%）`,
       Math.abs(recon-whole)<1e-9, `差 ${((recon-whole)*100).toFixed(6)}pp`);
    ok('对子起手权重 = Σp(c)² = 25/169 ≈ 14.8%', Math.abs(wPair-25/169)<1e-12, `got ${wPair}`);
    ok('对子起手整体是赚的（被 10,10 的 20 点带动）', evPair>0.2, `got ${(evPair*100).toFixed(1)}%`);
  }
}

// ══════════════════════════════════════════════════════════════
// 【5b】外部评审（Codex, 2026-08-22）发现的两条，锁住别退回去。
console.log('\n【5a】分 A 的规则：每手只发一张，不能再要');
{
  // 故障注入发现：把"分A后只发一张"改成"可以继续要牌"，94 条断言一条都不响。
  // 用独立算式钉死：分A的 EV 必须恰等于「每手补一张后立刻停牌」的两倍期望。
  for (const up of [1,2,6,7,10]) {
    const dd = B.dealerDist(up, D);
    let per = 0;
    for (let c = 1; c <= 10; c++) {
      let r = B.add(0, false, 1);          // 一张 A
      r = B.add(r[0], r[1], c);            // 再补一张，然后必须停
      per += p[c] * B.standEV(r[0], dd);
    }
    const expect = 2 * per;
    const got = B.splitEV(1, dd, D);
    ok(`明牌${up===1?'A':up}: 分A的EV = 2×(补一张即停) = ${expect.toFixed(6)}`,
       Math.abs(got - expect) < 1e-12, `引擎给 ${got.toFixed(6)}`);
  }
  // 反面对照：若允许分A后继续要牌，EV 会明显不同 —— 证明上面那条断言真的有鉴别力
  {
    const dd = B.dealerDist(6, D);
    let perHit = 0;
    for (let c = 1; c <= 10; c++) {
      let r = B.add(0, false, 1); r = B.add(r[0], r[1], c);
      const a2 = B.actions(r[0], r[1], dd, D, false, false);
      perHit += p[c] * Math.max(a2.stand, a2.hit);
    }
    ok(`对照：允许分A后要牌会得到不同的值（${(2*perHit).toFixed(4)} vs ${B.splitEV(1,dd,D).toFixed(4)}）`,
       Math.abs(2*perHit - B.splitEV(1, dd, D)) > 0.01);
  }
  // 非 A 的对子不受这条限制：分 8 后应该能继续打
  {
    const dd = B.dealerDist(6, D);
    let perStandOnly = 0;
    for (let c = 1; c <= 10; c++) {
      let r = B.add(0, false, 8); r = B.add(r[0], r[1], c);
      perStandOnly += p[c] * B.standEV(r[0], dd);
    }
    ok('分 8 后可以继续打，EV 高于"补一张即停"', B.splitEV(8, dd, D) > 2*perStandOnly + 0.01,
       `${B.splitEV(8,dd,D).toFixed(4)} vs ${(2*perStandOnly).toFixed(4)}`);
  }
}

console.log('\n【5b】回归锁：自然黑杰克赔率 / maxSplit');
{
  // #4：原来把自然黑杰克当普通 21 点丢进 standEV，bjPay 在整个引擎里根本没被读过。
  // 结果 3:2 和 6:5 返回同一个 0.9028。
  for (const bjPay of [1.5, 1.2, 1.0]) {
    const r = B.advise([1,10], 6, { bjPay });
    ok(`黑杰克 A,10 对庄6，赔率 ${bjPay} → EV 恰为 ${bjPay}`,
       Math.abs(r.bestEV - bjPay) < 1e-12, `got ${r.bestEV}`);
  }
  ok('黑杰克的 EV 必须随赔率变（原来不变）',
     B.advise([1,10],6,{bjPay:1.5}).bestEV !== B.advise([1,10],6,{bjPay:1.2}).bestEV);
  ok('peek=false 时黑杰克 EV < bjPay（还可能撞上庄家黑杰克平局）',
     B.advise([1,10],1,{bjPay:1.5,peek:false}).bestEV < 1.5);
  ok('黑杰克局面只给一个动作（已成定局，没得选）',
     B.advise([1,10],6,{}).actions.length === 1);

  // #3：maxSplit 声明了却完全没接线，传 0 仍然推荐分牌。
  const m0 = B.advise([8,8], 10, { maxSplit: 0 });
  ok('maxSplit=0 时不提供分牌这个动作', !m0.actions.some(a => a.key === 'split'),
     JSON.stringify(m0.actions.map(a=>a.key)));
  ok('maxSplit=0 时 8,8 对庄10 应投降（分牌非法，投降 -0.5 最优）', m0.best === 'surrender', m0.best);
  const s1 = B.advise([8,8],10,{maxSplit:1}).actions.find(a=>a.key==='split').ev;
  const s3 = B.advise([8,8],10,{maxSplit:3}).actions.find(a=>a.key==='split').ev;
  ok('maxSplit 增大时分牌 EV 必须变好（原来三个值完全相同）', s3 > s1 + 1e-6,
     `1→${s1.toFixed(6)}  3→${s3.toFixed(6)}`);
  // 默认值不许被这次改动带偏：外部评审用独立 DP 验过 maxSplit=1 的这个数
  ok('maxSplit=1 的 8,8 对庄10 仍为 -0.489488（独立 DP 交叉验证过的值）',
     Math.abs(s1 - (-0.4894876232)) < 1e-8, `got ${s1}`);
}

console.log('\n【6】Hi-Lo 算牌');
{
  ok('2-6 记 +1', [2,3,4,5,6].every(c=>B.hiLo(c)===1));
  ok('7-9 记 0',  [7,8,9].every(c=>B.hiLo(c)===0));
  ok('10/A 记 -1',[10,1].every(c=>B.hiLo(c)===-1));
  let s=0; for(let c=1;c<=10;c++) s += B.hiLo(c)*(c===10?4:1);
  ok('一副牌走完流水计数归零（平衡计数）', s===0, `got ${s}`);
  ok('真数 = 流水 / 剩余副数', Math.abs(B.trueCount(12,4)-3)<1e-12);
  ok('真数 ≥ +3 才建议买保险', !B.insuranceOK(2.9) && B.insuranceOK(3));
}

console.log('\n'+'='.repeat(64));
console.log(`  通过 ${P} / 失败 ${F}`);
if(F){ console.log('  失败: '+fails.join(' | ')); process.exit(1); }
