const H = require('../src/engine-holdem.js');
let P=0,F=0; const fails=[];
function ok(n,c,d){ if(c){P++;console.log('  ✅ '+n)} else {F++;fails.push(n);console.log('  ❌ '+n+'  '+(d||''))} }
const p = s => H.parseCard(s);
const hand = a => a.map(p);

console.log('\n【1】牌型识别（含边界：轮子、A高同花、七张里挑五张）');
for (const [cards, want] of [
  [['As','Ks','Qs','Js','Ts'],'同花顺'], [['5s','4s','3s','2s','As'],'同花顺'],
  [['9h','9d','9c','9s','2h'],'四条'],   [['8h','8d','8c','3s','3h'],'葫芦'],
  [['Ah','9h','7h','4h','2h'],'同花'],   [['As','2h','3d','4c','5s'],'顺子'],
  [['Th','9d','8c','7s','6h'],'顺子'],   [['Qh','Qd','Qc','5s','2h'],'三条'],
  [['Jh','Jd','4c','4s','9h'],'两对'],   [['7h','7d','Kc','5s','2h'],'一对'],
  [['Ah','Kd','9c','5s','3h'],'高牌'],
]) ok(`${cards.join(' ')} = ${want}`, H.categoryName(H.eval5(hand(cards)))===want,
      `判成 ${H.categoryName(H.eval5(hand(cards)))}`);

console.log('\n【2】C(52,5) 全域普查：各牌型数量必须精确等于组合数学结果');
{
  // 这九个数是可查证的数学事实，不是我记的
  const EXPECT = {'同花顺':40,'四条':624,'葫芦':3744,'同花':5108,'顺子':10200,
                  '三条':54912,'两对':123552,'一对':1098240,'高牌':1302540};
  const got = {}; let total=0;
  for(let a=0;a<52;a++)for(let b=a+1;b<52;b++)for(let c=b+1;c<52;c++)
  for(let d=c+1;d<52;d++)for(let e=d+1;e<52;e++){
    const n=H.categoryName(H.eval5([a,b,c,d,e])); got[n]=(got[n]||0)+1; total++;
  }
  ok('总手数 = 2,598,960', total===2598960, `got ${total}`);
  for(const k of Object.keys(EXPECT))
    ok(`${k.padEnd(4)} = ${EXPECT[k]}`, got[k]===EXPECT[k], `got ${got[k]}`);
}

console.log('\n【3】eval7（快）必须恒等于 21 个五张子集里 eval5（慢）的最大值');
{
  let s=42424242; const rnd=()=>{s^=s<<13;s^=s>>>17;s^=s<<5;s|=0;return (s>>>0)/4294967296};
  const SUB=[]; for(let i=0;i<7;i++)for(let j=i+1;j<7;j++)for(let k=j+1;k<7;k++)
    for(let l=k+1;l<7;l++)for(let m=l+1;m<7;m++) SUB.push([i,j,k,l,m]);
  ok('五取七的子集数 = 21', SUB.length===21);
  let bad=null, n=0;
  for(let t=0;t<200000 && !bad;t++){
    const d=[]; const used={};
    while(d.length<7){ const c=Math.floor(rnd()*52); if(!used[c]){used[c]=1;d.push(c)} }
    let slow=-1;
    for(const sub of SUB){ const v=H.eval5(sub.map(i=>d[i])); if(v>slow) slow=v; }
    const fast=H.eval7(d); n++;
    if(fast!==slow) bad=`${d.map(H.cardStr).join(' ')}: eval7=${fast} eval5max=${slow} (${H.categoryName(fast)} vs ${H.categoryName(slow)})`;
  }
  ok(`${n} 手随机七张牌上 eval7 == max(eval5)`, !bad, bad||'');
}

console.log('\n【4】胜率对照公开基准值（按牌型随机花色 —— 公开值是花色平均，不是某一组特定花色）');
{
  // 踩过的坑记在这：最初拿 AsAh vs KdKc 去对 81.9%，差了 0.77pp 判失败。
  // 穷举 C(48,5) 查明：那个特定花色配置的真值就是 81.26%，而共一门花色的配置是 81.95%。
  // 公开引用的 81.9% 是对全部 36 种花色组合取平均。夹具必须匹配这个语义。
  let sd = 20260822;
  const rnd=()=>{sd^=sd<<13;sd^=sd>>>17;sd^=sd<<5;sd|=0;return (sd>>>0)/4294967296};
  const RI = n => Math.floor(rnd()*n);
  const RK = '23456789TJQKA';

  /** 按牌型（'AA' / 'AKs' / 'AKo'）随机挑一手具体的牌，避开 used 里已用的牌 */
  function dealPattern(pat, used) {
    const r1 = RK.indexOf(pat[0]), r2 = RK.indexOf(pat[1]);
    for (let tries = 0; tries < 500; tries++) {
      let s1, s2;
      if (r1 === r2) { const ss = [0,1,2,3].sort(()=>rnd()-0.5); s1 = ss[0]; s2 = ss[1]; }
      else if (pat[2] === 's') { s1 = s2 = RI(4); }
      else { s1 = RI(4); do { s2 = RI(4); } while (s2 === s1); }
      const c1 = r1*4 + s1, c2 = r2*4 + s2;
      if (c1 !== c2 && !used.has(c1) && !used.has(c2)) return [c1, c2];
    }
    return null;
  }

  function suitAveraged(patA, patB, iters) {
    let w=0, t=0, n=0;
    for (let it=0; it<iters; it++) {
      const used = new Set();
      const a = dealPattern(patA, used); a.forEach(c=>used.add(c));
      const b = dealPattern(patB, used); if (!b) continue; b.forEach(c=>used.add(c));
      const deck=[]; for (let i=0;i<52;i++) if(!used.has(i)) deck.push(i);
      const bd=[];
      for (let i=0;i<5;i++){ const j=i+RI(deck.length-i); const tmp=deck[i]; deck[i]=deck[j]; deck[j]=tmp; bd.push(deck[i]); }
      const x=H.eval7(a.concat(bd)), y=H.eval7(b.concat(bd));
      if (x>y) w++; else if (x===y) t++;
      n++;
    }
    return (w + t/2)/n;
  }

  // ── 4-A：有出处的公开值，用来做外部校验 ──────────────────────
  // 出处：nlh.poker / trybluff / cardfight 等公开对局赔率表（2026-08 查）。
  // 只放我真正查到的三条；其余不查而写的数字一律不许进这里。
  for (const [name, A, B, want, tol, src] of [
    ['AA  vs KK ', 'AA',  'KK',  0.819, 0.006, '81.9%'],
    ['22  vs AKo', '22',  'AKo', 0.525, 0.010, '~52.0~52.5%'],
    ['AKo vs QQ ', 'AKo', 'QQ',  0.437, 0.010, 'QQ 56.3% → AK 43.7%'],
  ]) {
    const got = suitAveraged(A, B, 400000);
    ok(`${name} 公开 ${src} 实测 ${(got*100).toFixed(2)}%`,
       Math.abs(got-want)<=tol, `差 ${((got-want)*100).toFixed(2)} 个百分点`);
  }

  // ── 4-B：回归基线 ────────────────────────────────────────────
  // 这些数字**不是**公开引用值，是本机按牌型花色平均实测出来的，只用于防回归。
  // 我最初凭印象给 JJ vs TT 写 80.8%、AA vs 72o 写 87.7%，都是编的（实测 81.9 / 88.3）。
  // 教训：夹具要么有出处，要么是自己算出来的并标明如此，绝不能是"我记得大概是"。
  for (const [name, A, B, base] of [
    ['AA  vs 72o', 'AA',  '72o', 0.883],
    ['AKs vs QQ ', 'AKs', 'QQ',  0.460],
    ['JJ  vs TT ', 'JJ',  'TT',  0.819],
    ['AKo vs JTs', 'AKo', 'JTs', 0.595],
    ['KK  vs AKo', 'KK',  'AKo', 0.700],
  ]) {
    const got = suitAveraged(A, B, 400000);
    ok(`${name} 回归基线 ${(base*100).toFixed(1)}% 实测 ${(got*100).toFixed(2)}%（本机算，非引用值）`,
       Math.abs(got-base)<=0.008, `差 ${((got-base)*100).toFixed(2)} 个百分点`);
  }
}

console.log('\n【4b】equity() 的抽样机制 vs 穷举真值（钉死采样层，不是评牌层）');
{
  function exact(a, b) {
    const dead=new Set([...a,...b]), deck=[];
    for(let i=0;i<52;i++) if(!dead.has(i)) deck.push(i);
    let w=0,t=0,n=0, L=deck.length;
    for(let i=0;i<L;i++)for(let j=i+1;j<L;j++)for(let k=j+1;k<L;k++)
    for(let m=k+1;m<L;m++)for(let q=m+1;q<L;q++){
      const bd=[deck[i],deck[j],deck[k],deck[m],deck[q]];
      const x=H.eval7(a.concat(bd)), y=H.eval7(b.concat(bd));
      if(x>y)w++; else if(x===y)t++; n++;
    }
    return (w+t/2)/n;
  }
  for (const [name, A, B] of [
    ['AsAh vs KdKc', ['As','Ah'], ['Kd','Kc']],
    ['AsKs vs QdQc', ['As','Ks'], ['Qd','Qc']],
    ['7h2d vs AsKh', ['7h','2d'], ['As','Kh']],
  ]) {
    const ex = exact(hand(A), hand(B));
    H.setSeed(31415);
    const mc = H.equity(hand(A), [], [hand(B)], 400000).equity;
    ok(`${name} 穷举 ${(ex*100).toFixed(2)}% vs 蒙特卡洛 ${(mc*100).toFixed(2)}%`,
       Math.abs(ex-mc) <= 0.004, `差 ${((mc-ex)*100).toFixed(2)}pp（400k 样本 3σ ≈ 0.2pp）`);
  }
}

console.log('\n【5】不变量');
{
  H.setSeed(7);
  const r = H.equity(hand(['As','Ks']), hand(['Qs','Js','Ts']), [hand(['2h','2d'])], 20000);
  ok('已成同花顺时胜率 = 100%', Math.abs(r.equity-1)<1e-9, `got ${r.equity}`);
  H.setSeed(7);
  const r2 = H.equity(hand(['2h','3d']), hand(['As','Ks','Qs','Js','Ts']), [hand(['2c','3s'])], 5000);
  ok('公共牌已是皇家同花顺 → 必平分', Math.abs(r2.equity-0.5)<1e-9, `got ${r2.equity}`);
  ok('重复牌返回 null', H.equity(hand(['As','As']), [], 1, 100)===null);
  ok('非法牌面返回 null', H.equity([H.parseCard('Xz'),5], [], 1, 100)===null);
  H.setSeed(1); const m2=H.equity(hand(['As','Ah']),[],1,60000).equity;
  H.setSeed(1); const m8=H.equity(hand(['As','Ah']),[],8,60000).equity;
  ok(`AA 对手越多胜率越低 (1家 ${(m2*100).toFixed(1)}% > 8家 ${(m8*100).toFixed(1)}%)`, m2>m8);
  ok('AA 单挑胜率在 84~86%（公开值 ~85.2%）', m2>0.84&&m2<0.86, `got ${(m2*100).toFixed(2)}%`);
  H.setSeed(3); const s1=H.equity(hand(['7h','2d']),[],1,60000).equity;
  ok(`72o 单挑胜率在 30~36%（最差起手牌）`, s1>0.30&&s1<0.36, `got ${(s1*100).toFixed(2)}%`);
}

console.log('\n'+'='.repeat(64));
console.log(`  通过 ${P} / 失败 ${F}`);
if(F){ console.log('  失败: '+fails.join(' | ')); process.exit(1); }
