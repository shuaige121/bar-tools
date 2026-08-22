/* winrate.js 的可复用内核，供 calibrate.js 使用 */
const E = require('../src/engine-dice.js');
const _memo = new Map();
function ge(n,r,p){ const k=n+','+r+','+p; let v=_memo.get(k);
  if(v===undefined){ v=E.binomGE(n,r,p); _memo.set(k,v);} return v; }
let _s = 987654321;
const rnd=()=>{_s^=_s<<13;_s^=_s>>>17;_s^=_s<<5;_s|=0;return (_s>>>0)/4294967296;};
const roll=n=>Array.from({length:n},()=>1+Math.floor(rnd()*6));
const cnt=(d,f,w)=>d.filter(x=>x===f||(w&&f!==1&&x===1)).length;
const subjective=(bid,hand,N,wild,dpp)=>
  ge(N*dpp-hand.length, bid.count-E.myCount(hand,bid.face,wild), E.faceProb(bid.face,wild));
function barPlayer(tau,comfort){ return (bid,hand,N,wild,dpp)=>{
  if(bid && subjective(bid,hand,N,wild,dpp)<tau) return {act:'challenge'};
  const rs=E.legalRaises(bid,N,wild,dpp); if(!rs.length) return {act:'challenge'};
  rs.sort((a,b)=>(a.count-b.count)||(E.myCount(hand,b.face,wild)-E.myCount(hand,a.face,wild)));
  for(const r of rs) if(subjective(r,hand,N,wild,dpp)>=comfort) return {act:'raise',bid:r};
  let best=rs[0],bs=-1; for(const r of rs){const s=subjective(r,hand,N,wild,dpp); if(s>bs){bs=s;best=r;}}
  return {act:'raise',bid:best}; }; }
const noob=(bid,hand,N,wild,dpp)=>{
  if(bid && rnd()<0.18) return {act:'challenge'};
  const rs=E.legalRaises(bid,N,wild,dpp); if(!rs.length) return {act:'challenge'};
  rs.sort((a,b)=>a.count-b.count);
  return {act:'raise',bid:rs[Math.floor(rnd()*Math.min(rs.length,8))]}; };
// ───────── 局外对手：结构上跟 rollout 假设的那套不同 ─────────
// 存在理由：rollout 内部假设对手是 barPlayer；拿 barPlayer 当考官等于自己出题自己答。
// 下面三种在"怎么决定开牌"和"怎么选加注"上都换了机制。

/** 计数派：只看叫的个数占全场骰数的比例，不算概率。加注就在自己最多的那个点上 +1。 */
const counter = (thresh) => (bid,hand,N,wild,dpp)=>{
  const T=N*dpp;
  if (bid && bid.count > thresh*T) return {act:'challenge'};
  const rs=E.legalRaises(bid,N,wild,dpp); if(!rs.length) return {act:'challenge'};
  let bestFace=2, bestN=-1;
  for(let f=1;f<=6;f++){ const c=E.myCount(hand,f,wild); if(c>bestN){bestN=c;bestFace=f;} }
  const pick = rs.filter(r=>r.face===bestFace).sort((a,b)=>a.count-b.count)[0]
            || rs.sort((a,b)=>a.count-b.count)[0];
  return {act:'raise', bid:pick};
};

/** 激进派：几乎不开（8%），一加就跳两三个，专挑自己手上有的点。 */
const aggro = (bid,hand,N,wild,dpp)=>{
  if (bid && rnd()<0.08) return {act:'challenge'};
  const rs=E.legalRaises(bid,N,wild,dpp); if(!rs.length) return {act:'challenge'};
  const jump = bid ? bid.count + 2 + (rnd()*2|0) : 2;
  const cand = rs.filter(r=>r.count>=jump && E.myCount(hand,r.face,wild)>=1);
  const pool = cand.length?cand:rs;
  return {act:'raise', bid:pool.sort((a,b)=>a.count-b.count)[0]};
};

/** 保守派(nit)：主观低于 0.55 就开，加注只走最保险的那一注。 */
const nit = (bid,hand,N,wild,dpp)=>{
  if (bid && subjective(bid,hand,N,wild,dpp) < 0.55) return {act:'challenge'};
  const rs=E.legalRaises(bid,N,wild,dpp); if(!rs.length) return {act:'challenge'};
  let best=rs[0], bs=-1;
  for(const r of rs){ const v=subjective(r,hand,N,wild,dpp); if(v>bs){bs=v;best=r;} }
  return {act:'raise', bid:best};
};

const makeTool=(opts={})=>(bid,hand,N,wild,dpp)=>{
  const b=E.analyze(Object.assign({hand,players:N,bid,wild,dicePerPlayer:dpp},opts)).actions[0];
  return b.kind==='challenge'?{act:'challenge'}:{act:'raise',bid:b.bid}; };
function playRound(pol,N,wild,dpp){
  const hands=Array.from({length:N},()=>roll(dpp)), all=hands.flat();
  let bid=null,cur=Math.floor(rnd()*N),g=0;
  while(g++<400){
    const mv=pol[cur](bid,hands[cur],N,wild,dpp);
    if(mv.act==='challenge'){ if(!bid){bid={count:1,face:2};continue;}
      return (cnt(all,bid.face,wild)>=bid.count) ? cur : (cur-1+N)%N; }
    bid=mv.bid; cur=(cur+1)%N; }
  return cur; }
const mkBar=()=>barPlayer(0.28+rnd()*0.24, 0.30+rnd()*0.20);
const OPP = {
  bar:     N => Array.from({length:N-1}, mkBar),
  noob:    N => Array.from({length:N-1}, ()=>noob),
  mirror:  N => Array.from({length:N-1}, ()=>makeTool()),
  counter: N => Array.from({length:N-1}, ()=>counter(0.30+rnd()*0.18)),
  aggro:   N => Array.from({length:N-1}, ()=>aggro),
  nit:     N => Array.from({length:N-1}, ()=>nit),
  mixed:   N => Array.from({length:N-1}, ()=>{      // 一桌人性格各不相同，最接近真实
      const r=rnd();
      return r<0.34 ? mkBar() : r<0.56 ? counter(0.30+rnd()*0.18) : r<0.78 ? aggro : nit; }),
};
function drinkRate(N, me, rounds, oppKind='bar', wild=true, dpp=5){
  let d=0;
  for(let r=0;r<rounds;r++){
    if(playRound([me,...OPP[oppKind](N)],N,wild,dpp)===0) d++; }
  return d/rounds; }
module.exports={makeTool,barPlayer,noob,counter,aggro,nit,mkBar,playRound,drinkRate,subjective,OPP};
