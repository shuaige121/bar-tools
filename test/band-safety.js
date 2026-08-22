/* 带宽安全性全域扫描：真最优会不会被首轮淘汰砍掉。
 *
 * 这是当前唯一没有全域保证的点 —— 带宽 [4.5,3.5,3.0] 只在一个局面上扫过 5000 个种子。
 * 用法: node test/band-safety.js [局面数] [每局面种子数] [分片索引] [分片总数]
 *
 * 注意：进程启动时 require 一次引擎，之后文件被改也不影响本进程，
 * 所以可以和别人的故障注入并行跑。
 */
const E = require('../src/engine-dice.js');
const STATES = +(process.argv[2] || 40);
const SEEDS  = +(process.argv[3] || 25);
const SHARD  = +(process.argv[4] || 0);
const NSHARD = +(process.argv[5] || 1);

let sd = 987654321 + SHARD * 7919;
const rnd = () => { sd^=sd<<13; sd^=sd>>>17; sd^=sd<<5; sd|=0; return (sd>>>0)/4294967296; };

const coarse = E.ELIM.coarse, band = E.ELIM.bands[0], se = Math.sqrt(0.25/coarse);
let checked = 0, cut = 0, worst = null;

for (let t = 0; t < STATES; t++) {
  const N = 2 + (rnd()*7|0);                       // 2..8 人
  const wild = rnd() < 0.85;
  const hand = Array.from({length: 1 + (rnd()*5|0)}, () => 1 + (rnd()*6|0));  // 含部分手牌
  const T = N*5;
  const bid = rnd() < 0.15 ? null
            : { count: 1 + (rnd()*Math.max(1, Math.floor(T*0.55))|0), face: 1 + (rnd()*6|0) };
  const cands = E.candidateRaises(bid, hand, N, wild, 5);
  if (cands.length < 3) continue;

  // 按点数分组，每档用较高样本定真最优
  const byFace = {};
  for (const c of cands) (byFace[c.face] = byFace[c.face] || []).push(c);

  for (const f in byFace) {
    const lst = byFace[f];
    if (lst.length < 2) continue;
    let truth = null, tv = -1;
    for (const b of lst) {
      const v = E.rolloutEV(b, hand, N, wild, 5, 4000, 424242);
      if (v > tv) { tv = v; truth = b; }
    }
    for (let s = 1; s <= SEEDS; s++) {
      const seed = SHARD * 1000003 + s * 7919 + t;
      let top = -1, ts = 0;
      for (const b of lst) {
        const v = E.rolloutEV(b, hand, N, wild, 5, coarse, seed);
        if (v > top) top = v;
        if (b.count === truth.count) ts = v;
      }
      checked++;
      const gap = (top - band*se) - ts;
      if (gap > 0) {
        cut++;
        if (!worst || gap > worst.gap)
          worst = { gap, N, wild, hand: hand.slice(), bid, face: +f, truth, seed, tv };
      }
    }
  }
}
console.log(JSON.stringify({ shard: SHARD, checked, cut, worst }));
