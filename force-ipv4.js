// wrangler/undici 会优先走 IPv6，本机 IPv6 出口是黑洞 → 猴补 dns.lookup 锁 family:4
const dns=require('dns');const orig=dns.lookup;
dns.lookup=function(h,o,cb){if(typeof o==='function'){cb=o;o={}}else if(typeof o==='number'){o={family:o}}else{o=o||{}}return orig(h,Object.assign({},o,{family:4}),cb)};
