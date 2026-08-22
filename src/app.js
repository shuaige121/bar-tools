(function () {
'use strict';
var $ = function (id) { return document.getElementById(id); };
var view = $('view'), titleEl = $('title'), backEl = $('back'), hbtn = $('hbtn');

// ══════════════════ 共用小工具 ══════════════════
function pct(x) {                       // 非绝对确定时绝不显示 100%/0% —— 赌桌上那是会让人输钱的谎
  if (x >= 1) return '100%'; if (x <= 0) return '0%';
  if (x > 0.995) return '>99%'; if (x < 0.005) return '<1%';
  return Math.round(x * 100) + '%';
}
function pct1(x) {
  if (x >= 1) return '100%'; if (x <= 0) return '0%';
  if (x > 0.9995) return '>99.9%'; if (x < 0.0005) return '<0.1%';
  return (x * 100).toFixed(1) + '%';
}
function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d; }

/**
 * 把 root 里的 .dock 装成固定底栏，返回一个 keep() —— 每次出结果后调它，
 * 把结论卡滚到键盘之上。
 * 为什么要固定底栏：内容顶部对齐时，屏幕越高键盘离拇指越远。实测 iPhone 15 Pro
 * 上 24点 键盘落在 y=253（换手线 256），德州录完手牌后键盘掉到 710px（SE 只有 667）。
 * 为什么用 fixed 不用 sticky：sticky bottom:0 会把元素从自然位置往上提，提上去就盖住
 * 前面的内容（实测把结论卡压掉 7px，文字被拦腰切断）。
 */
function installDock(root) {
  var dock = root.querySelector('.dock');
  if (!dock) return function () {};
  var fit = function () { document.body.style.paddingBottom = (dock.offsetHeight + 18) + 'px'; };
  fit();
  if (window.ResizeObserver) new ResizeObserver(fit).observe(dock);
  window.addEventListener('resize', fit);
  return function keep() {
    var vd = root.querySelector('.verdict');
    if (!vd) return;
    var need = vd.getBoundingClientRect().bottom - dock.getBoundingClientRect().top + 10;
    if (need > 0) document.scrollingElement.scrollTop += need;
  };
}
function save(k, v) { try { localStorage.setItem('bar:' + k, JSON.stringify(v)); } catch (e) {} }
function load(k, d) { try { var v = localStorage.getItem('bar:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }

var PIPS = {1:[[1,1]],2:[[0,0],[2,2]],3:[[0,0],[1,1],[2,2]],
            4:[[0,0],[2,0],[0,2],[2,2]],5:[[0,0],[2,0],[1,1],[0,2],[2,2]],
            6:[[0,0],[2,0],[0,1],[2,1],[0,2],[2,2]]};
function die(v) {
  var C = [24,50,76], p = PIPS[v] || [], s = '', col = (v === 1) ? '#ff6152' : '#20242e';
  for (var i = 0; i < p.length; i++) s += '<circle cx="'+C[p[i][0]]+'" cy="'+C[p[i][1]]+'" r="9.5" fill="'+col+'"/>';
  return '<svg viewBox="0 0 100 100" aria-label="'+v+'点"><rect x="2" y="2" width="96" height="96" rx="20" '+
         'fill="#f2f4f8" stroke="#c9cfda" stroke-width="2"/>'+s+'</svg>';
}

// ══════════════════ 首页 ══════════════════
// 图标用可上色的文字字形，不用 emoji —— emoji 在不同系统上大小/风格差异太大，四个凑一起很杂
var TOOLS = [
  { id:'dice',   ic:'⚄',   nm:'吹牛骰子', ds:'该开还是该往上叫，逐个叫法算胜率' },
  { id:'holdem', ic:'♠♥',  nm:'德州扑克', ds:'手牌+公共牌，算你现在的胜率' },
  { id:'bj',     ic:'21',  nm:'21点',     ds:'要牌/停牌/双倍/分牌，直接告诉你怎么打' },
  { id:'p24',    ic:'24',  nm:'24点',     ds:'四张牌，列出全部解法' }
];
var Home = {
  title: '', sub: '',      // header 标题留空 —— 下面 hero 已经写了名字，重复两遍很难看
  mount: function (root) {
    var h = '<div class="hero"><h2>酒桌工具箱</h2><p>四个算牌小工具 · 全部离线可用 · 加到主屏幕即当 App</p></div><div class="menu">';
    for (var i = 0; i < TOOLS.length; i++) {
      var t = TOOLS[i];
      h += '<button class="tile t-'+t.id+'" data-go="'+t.id+'"><span class="ic">'+t.ic+'</span>'+
           '<span class="nm">'+t.nm+'</span><span class="ds">'+t.ds+'</span></button>';
    }
    h += '</div><p class="note">所有计算都在你手机本地完成，不上传任何东西。'+
         '每个工具的算法说明和验证方式，在各自页面底部。</p>';
    root.innerHTML = h;
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-go]'); if (b) location.hash = '#' + b.dataset.go;
    });
  }
};

// ══════════════════ 一、吹牛骰子 ══════════════════
var Dice = {
  title: '吹牛骰子', headerBtn: true,
  S: { players: load('dice.players', 3), hand: [], face: 0, count: 0, wild: load('dice.wild', true), opening: false },
  mount: function (root) {
    var S = this.S, self = this;
    root.innerHTML =
      '<div class="sec"><div class="lab"><span>几个人玩</span><b id="pnum"></b></div><div class="row" id="players"></div></div>'+
      '<div class="sec"><div class="lab"><span>我的骰子</span><span class="act" id="clr">清空</span></div>'+
        '<div class="tray" id="tray"></div><div class="pad" id="pad"></div></div>'+
      '<div class="sec"><div class="lab"><span id="bidLab">上家叫了</span><span class="act" id="firstBtn">我先叫 →</span></div>'+
        '<div id="bidBox"><div class="row" id="faces" style="margin-bottom:6px"></div><div class="strip" id="counts"></div></div></div>'+
      '<div id="out"></div>'+
      '<details class="note"><summary>规则与算法说明</summary>'+
      '<p><b>默认规则（"飞"）：</b>每人5颗骰，1是万能牌可当任意点；叫1点为"斋"，此时只算真正的1。'+
      '飞叫转斋叫，个数下限=原个数的一半向上取整（6个5→3个1）；斋叫转回飞叫，下限=原个数×2+1（3个1→7个任意）。'+
      '点右上角可切到<b>不飞</b>（1不万能）。</p>'+
      '<p><b>「这注成立」是精确概率</b>：未知骰服从二项分布，直接算尾概率，已用40万次蒙特卡洛逐例校验到小数点后三位。'+
      '注意它是<b>无条件</b>概率——下家往往只在自己没货时才开你，所以"真被开时才成立"的概率会低不少，'+
      '差得多时会单独写在上面的说明句里。</p>'+
      '<p><b>「本轮不喝」怎么来的</b>：<b>3 人及以上</b>——把这一注固定住，让一桌建模的对手'+
      '（开牌门槛、安全线各不相同）把这一轮真打到有人被开为止，跑上千遍数你有没有喝。'+
      '<b>单挑</b>——用两步前瞻模型估。<br>'+
      '这条分界是量出来的不是设计出来的：早先版本全程用一个"把皮球踢出去值多少"的常数，被外部评审证伪'+
      '（三人局能让「该加注」被错排到「该开」之后，模型给 0.554 而实测真值 0.79）；换成全程模拟后三人以上明显更好，'+
      '但单挑反而更差——因为单挑时皮球立刻转回自己，模拟里对"后来的你"估得太弱。'+
      '试过五档更强的参数都救不回来，于是各用各的，并在这里说明白。</p>'+
      '<p><b>会不会只是打赢了自己想象的对手</b>：拿三种机制完全不同的对手（只看个数占比不算概率的、'+
      '几乎不开一加就跳三个的、主观低于0.55就开的）另测过，落酒率比基准低 7%~82%，'+
      '在混合桌上 3~6 人局少喝 34%~61%。唯一没有显著优势的是 3 人局对上会算牌的对手。</p>'+
      '<p><b>只输部分骰子也能算</b>：没输入的当未知处理。</p></details>';

    function T() { return S.players * 5; }
    function buildPlayers() { var h=''; for (var n=2;n<=8;n++) h+='<button class="pill'+(n===S.players?' on':'')+'" data-n="'+n+'">'+n+'</button>'; $('players').innerHTML=h; }
    function renderPad() {
      if (S.hand.length >= 5) { $('pad').innerHTML = '<button id="nextRound" class="wide">下一轮 · 清空重摇</button>'; return; }
      var h=''; for (var v=1;v<=6;v++) h+='<button data-v="'+v+'" aria-label="加一颗'+v+'点">'+die(v)+'</button>';
      $('pad').innerHTML = h;
    }
    function buildFaces() { var h=''; for (var v=1;v<=6;v++) h+='<button class="pill'+(v===S.face?' on':'')+'" data-f="'+v+'" style="padding:5px 0"><span style="display:flex;width:30px;height:30px">'+die(v)+'</span></button>'; $('faces').innerHTML=h; }
    function buildCounts() { var t=T(),h='',hot=Math.round(t*(S.wild?1/3:1/6));
      for (var c=1;c<=t;c++) h+='<button data-c="'+c+'" class="'+(c===S.count?'on':'')+(c===hot?' hot':'')+'">'+c+'</button>';
      $('counts').innerHTML=h; }
    function centerCount() { var e=$('counts'), on=e.querySelector('.on')||e.querySelector('.hot'); if (on&&on.scrollIntoView) on.scrollIntoView({inline:'center',block:'nearest'}); }
    function renderTray() {
      var t=$('tray'); renderPad();     // 必须先于 return，否则清空后键盘回不来（卡死）
      if (!S.hand.length) { t.className='tray empty'; t.textContent='点下面的骰子输入你摇到的点数'; return; }
      t.className='tray'; var h='';
      for (var i=0;i<S.hand.length;i++) h+='<span class="slot" data-i="'+i+'">'+die(S.hand[i])+'</span>';
      h+='<span style="color:#828fa3;font-size:12px;margin-left:4px;line-height:1.3">'+
         (S.hand.length<5?('还差 '+(5-S.hand.length)+' 颗<br>（可不填）'):'点骰子<br>可删除')+'</span>';
      t.innerHTML=h;
    }
    function renderBidMode() {
      // 飞模式下叫 1 就是"斋"：个数下限和概率口径全变了，规则却只写在折叠说明里。
      // 工具算对了，但用户不知道它知道。
      $('bidLab').innerHTML = S.opening ? '我先叫（无人叫过）'
        : ('上家叫了' + (S.wild && S.face===1 ? '<span style="color:var(--gold)">（斋 · 1 不作万能）</span>' : ''));
      $('firstBtn').textContent = S.opening ? '← 有人叫了' : '我先叫 →';
      $('bidBox').style.display = S.opening ? 'none' : '';
    }
    function render() {
      hbtn.textContent = S.wild ? '飞' : '不飞';
      hbtn.className = 'hbtn' + (S.wild ? ' on' : '');
      titleEl.innerHTML = '吹牛骰子<span>'+T()+'颗骰 · 每点期望 '+(T()*(S.wild?1/3:1/6)).toFixed(1)+'个</span>';
      $('pnum').textContent = S.players + ' 人';
      var box = $('out');
      if (!S.opening && (!S.face || !S.count)) {
        box.innerHTML = '<div class="hint">选一下上家叫的「个数 + 点数」<br><span style="color:#828fa3">或点上面的「我先叫」</span></div>'; return;
      }
      var bid = S.opening ? null : { count:S.count, face:S.face };
      var r = DiceEngine.analyze({ hand:S.hand, players:S.players, bid:bid, wild:S.wild, dicePerPlayer:5 });
      var best = r.actions[0], cls = best.kind==='challenge' ? 'open' : 'raise', h='';
      // 推荐斋叫时输出侧也要标 —— 之前只在输入侧标了，照着念的人不知道自己叫的是斋
      var zhai = function (b) { return (S.wild && b.face === 1)
        ? '<span style="color:var(--gold);font-size:.62em;font-weight:600"> 斋</span>' : ''; };
      h += '<div class="verdict '+cls+'"><div class="vact">'+
           (best.kind==='challenge' ? '开 他！'
             : ('叫 '+best.bid.count+'个 <span class="dice">'+die(best.bid.face)+'</span>'+zhai(best.bid)))+'</div>';
      if (best.kind === 'challenge') {
        var mine = DiceEngine.myCount(S.hand, S.face, S.wild);
        h += '<div class="vwhy">上家这注为假的概率 <b>'+pct(r.challenge.ev)+'</b>（他要凑够 '+S.count+' 个，'+
             '你手上占了 '+mine+' 个，剩下 '+r.unknownDice+' 颗未知骰得再出 '+Math.max(0,S.count-mine)+' 个）。</div>';
        var bR = null; for (var i=0;i<r.actions.length;i++) if (r.actions[i].kind==='raise') { bR=r.actions[i]; break; }
        h += '<div class="vstats"><div class="stat"><div class="k">开赢的概率</div><div class="v" style="color:var(--open)">'+pct(r.challenge.ev)+'</div></div>'+
             '<div class="stat"><div class="k">改叫最好也只有</div><div class="v">'+(bR?pct(bR.ev):'—')+'</div></div></div>';
      } else {
        // 原来这里显示的是"被开也能活"，但取的是**无条件**的 P(叫牌为真)。
        // 外部评审(Codex)指出标签和数字不是一回事：下家往往只在自己没货时才开你，
        // 所以"真被开时才成立"的条件概率会低得多——实测有一例页面显示 53.9%、真值 0.6%。
        // 现在：精确的那个叫「这注成立」，条件概率作为洞察写进说明句。
        var adverse = (best.pTrueIfChallenged != null && best.pTrue - best.pTrueIfChallenged > 0.12)
          ? ' 不过下家多半只在自己没货时才开你——<b>真被开的时候，这注成立的概率只剩 '+
            pct(best.pTrueIfChallenged)+'</b>。' : '';
        h += '<div class="vwhy">你手上这个点有 <b>'+best.mine+'</b> 个'+(S.wild&&best.bid.face!==1?'（含万能1）':'')+
             '，剩下 '+r.unknownDice+' 颗未知骰只需再出 <b>'+Math.max(0,best.bid.count-best.mine)+'</b> 个就成立。'+
             adverse+'</div>'+
             // 强调色放在真正的排序依据「本轮不喝」上（原来错放在次要指标上）
             '<div class="vstats"><div class="stat"><div class="k">这注成立</div><div class="v">'+pct(best.pTrue)+'</div></div>'+
             '<div class="stat"><div class="k">下家开你</div><div class="v">'+pct(best.pChallenged)+'</div></div>'+
             '<div class="stat"><div class="k">本轮不喝</div><div class="v" style="color:var(--raise)">'+pct(best.ev)+'</div></div></div>';
      }
      h += '</div>';
      var alts = r.actions.slice(0, 7);   // analyze 已按每点数留最优并排好序
      h += '<div class="alts">';
      for (var m=0;m<alts.length;m++) {
        var b=alts[m], isO=b.kind==='challenge';
        h += '<div class="alt'+(isO?' o':'')+(m===0?' top':'')+'"><span class="nm'+(isO?' open':'')+'">'+
             (isO?'开':(b.bid.count+'个'+die(b.bid.face)+zhai(b.bid)))+'</span><span class="bar"><i style="width:'+
             Math.max(2,Math.round(b.ev*100))+'%"></i></span><span class="pc">'+pct(b.ev)+'</span></div>';
      }
      // 三种情况的文案必须分开，否则会虚报：
      //  · 一个合法加注都没有（叫到顶）→ 一次模拟都没跑过，不能说"跑了 N 遍"
      //  · N>=3 有加注 → 报实际模拟次数和 CI（CI 取第一个加注项，「开」是精确值没有 CI）
      //  · N=2 → 走两步前瞻模型，本来就没有模拟次数
      // 判据必须是"有没有加注可选"，不能挂在 method 上 ——
      // 2 人局走 2-ply 模型(method='model')，叫满时同样一个加注都没有，
      // 挂 method 会让它落进"单挑用两步前瞻模型估的"分支，去解释根本不存在的条形。
      var hasRaise = false, firstCI = null;
      for (var q = 0; q < r.actions.length; q++) {
        if (r.actions[q].kind === 'raise') hasRaise = true;
        if (firstCI == null && r.actions[q].evCI != null) firstCI = r.actions[q].evCI;
      }
      var explain;
      if (!hasRaise)
        // 分清"规则上不能再叫"和"能叫但全是自杀"：飞模式下上家叫 15个6，
        // 规则上还有 8 个合法斋叫，说成"叫到顶"是事实错误。
        explain = r.legalCount === 0
          ? '这注已经叫到顶了，规则上没有更高的叫法，只能开。'
          : ('规则上还能往上叫（还有 ' + r.legalCount + ' 种），但成立概率都低到不值得考虑，只能开。');
      else if (r.method === 'rollout' && firstCI != null)
        explain = '把这一注固定住，用建模的对手把这一轮真打完 ' + r.sims.toLocaleString() +
                  ' 遍数出来的（±' + (firstCI * 100).toFixed(1) + ' 个百分点）。';
      else
        explain = '单挑时用两步前瞻模型估的（实测单挑这样比全程模拟更准）。';
      h += '</div><p class="note">'+
           (hasRaise ? '条形 = <b>本轮不喝的概率</b>：' : '')+
           explain + (S.opening?'':'「开」那一行是精确概率，没有模型成分。')+'</p>';
      box.innerHTML = h;
    }

    $('players').onclick = function (e) { var b=e.target.closest('button[data-n]'); if(!b) return;
      S.players=+b.dataset.n; if (S.count>T()) S.count=0; save('dice.players',S.players);
      buildPlayers(); buildCounts(); centerCount(); render(); };
    $('pad').onclick = function (e) {
      if (e.target.closest('#nextRound')) { S.hand=[]; S.face=0; S.count=0; S.opening=false;
        renderTray(); buildFaces(); buildCounts(); renderBidMode(); render(); centerCount(); return; }
      var b=e.target.closest('button[data-v]'); if(!b) return;
      if (S.hand.length<5) { S.hand.push(+b.dataset.v); renderTray(); render(); } };
    $('tray').onclick = function (e) { var s=e.target.closest('.slot'); if(!s) return;
      S.hand.splice(+s.dataset.i,1); renderTray(); render(); };
    $('clr').onclick = function () { S.hand=[]; renderTray(); render(); };
    $('faces').onclick = function (e) { var b=e.target.closest('button[data-f]'); if(!b) return;
      S.face=+b.dataset.f; buildFaces(); renderBidMode(); render(); };
    $('counts').onclick = function (e) { var b=e.target.closest('button[data-c]'); if(!b) return;
      S.count=+b.dataset.c; buildCounts(); render(); };
    hbtn.onclick = function () { S.wild=!S.wild; save('dice.wild',S.wild); buildCounts(); centerCount(); render(); };
    $('firstBtn').onclick = function () { S.opening=!S.opening; renderBidMode(); render(); };

    buildPlayers(); buildFaces(); buildCounts(); renderTray(); renderBidMode(); render(); centerCount();
  }
};

// ══════════════════ 扑克牌共用 ══════════════════
var SUIT_CH = ['♠','♥','♦','♣'], SUIT_RED = [false,true,true,false], RK = '23456789TJQKA';
function rkLabel(r) { return ({8:'T'})[r] ? '10' : (RK[r] === 'T' ? '10' : RK[r]); }
function cardHTML(c, cls) {
  var r = EngineHoldem.rankOf(c) - 2, s = EngineHoldem.suitOf(c);
  return '<span class="pcard'+(SUIT_RED[s]?' red':'')+(cls?' '+cls:'')+'" data-c="'+c+'">'+
         (RK[r]==='T'?'10':RK[r])+'<span class="s">'+SUIT_CH[s]+'</span></span>';
}
function cardPicker(id, suit) {
  var h = '<div class="suits" id="'+id+'-suits">';
  for (var s = 0; s < 4; s++) h += '<button data-s="'+s+'" class="'+(SUIT_RED[s]?'red':'')+(s===suit?' on':'')+'">'+SUIT_CH[s]+'</button>';
  h += '</div><div class="ranks" id="'+id+'-ranks">';
  for (var r = 12; r >= 0; r--) h += '<button data-r="'+r+'">'+(RK[r]==='T'?'10':RK[r])+'</button>';
  return h + '</div>';
}

// ══════════════════ 二、德州扑克 ══════════════════
var Holdem = {
  title: '德州扑克',
  S: { hole: [], board: [], opps: load('holdem.opps', 1), suit: 0 },
  mount: function (root) {
    var S = this.S, keepVerdictVisible = null;
    root.innerHTML =
      '<div class="sec"><div class="lab"><span>几个对手（手牌未知）</span><b id="on"></b></div><div class="row" id="opps"></div></div>'+
      '<div class="sec"><div class="lab"><span>我的手牌</span><span class="act" id="clr">全部清空</span></div><div class="tray" id="hole"></div></div>'+
      '<div class="sec"><div class="lab"><span>公共牌</span><b id="stage"></b></div><div class="tray" id="board"></div></div>'+
      // 结论放在键盘上方：拇指在下面点牌时，眼睛正好盯着上面的胜率跟着变
      '<div id="out"></div>'+
      '<div id="doc"></div>'+
      // 键盘放最后并吸底 —— 它是这个工具里点得最频繁的东西，必须永远够得着
      '<div class="sec dock"><div class="lab"><span id="pickhint">点花色再点点数</span><span class="act" id="undo">← 退一张</span></div>'+
        cardPicker('hp', S.suit) + '</div>';

    $('doc').innerHTML = '<details class="note"><summary>算法与验证</summary>'+
      '<p><b>胜率用蒙特卡洛算</b>：随机发完剩余的公共牌和对手手牌，跑数万局数胜负。'+
      '样本量按未知牌多少自适应，误差标注在结果里。</p>'+
      '<p><b>评牌器怎么验的</b>：把 C(52,5)=2,598,960 手牌全部枚举一遍，'+
      '同花顺40、四条624、葫芦3744、同花5108、顺子10200、三条54912、两对123552、一对1098240、高牌1302540——'+
      '九个数必须与组合数学结果精确相等。再用"七张牌的快速评估 == 21个五张子集里最好的那个"在20万手随机牌上对照。</p>'+
      '<p><b>胜率对过公开值</b>：按牌型花色平均后，AA vs KK 实测 81.90%（公开引用 81.9%），AKs vs QQ 46.0%。'+
      '注意公开值是花色平均——同样是 AA vs KK，无共花的具体配置只有 81.26%，共一门花的是 81.95%。</p></details>';

    function used() { return S.hole.concat(S.board); }
    function renderOpps() { var h=''; for (var n=1;n<=8;n++) h+='<button class="pill sm'+(n===S.opps?' on':'')+'" data-o="'+n+'">'+n+'</button>';
      $('opps').innerHTML=h; $('on').textContent=S.opps+' 家'; }
    function renderSlots() {
      var t=$('hole'), h='';
      for (var i=0;i<2;i++) h += S.hole[i]!=null ? cardHTML(S.hole[i]) : '<span class="pcard ph">手牌</span>';
      t.className='tray'; t.innerHTML=h;
      var b=$('board'), h2='';
      for (var j=0;j<5;j++) h2 += S.board[j]!=null ? cardHTML(S.board[j]) : '<span class="pcard ph">'+(j<3?'翻牌':j===3?'转牌':'河牌')+'</span>';
      b.className='tray'; b.innerHTML=h2;
      $('stage').textContent = S.board.length===0?'翻牌前':S.board.length===3?'翻牌':S.board.length===4?'转牌':S.board.length===5?'河牌':(S.board.length+' 张');
      // 只禁用"这张已经被用掉了"的点数。牌录满时**不**整片变灰——
      // 一排灰按钮既难看又让人以为坏了（骰子和24点都踩过同一个坑），
      // 改成：满了再点一张 = 开新一手。
      var u=used(), rb=$('hp-ranks').children, full=(S.hole.length>=2 && S.board.length>=5);
      for (var k=0;k<rb.length;k++) {
        var r=+rb[k].dataset.r, c=r*4+S.suit;
        rb[k].disabled = !full && u.indexOf(c)>=0;
      }
      $('pickhint').textContent = full ? '已满 · 再点一张即开新一手' : '点花色再点点数';
    }
    function render() {
      renderSlots();
      var box=$('out');
      if (S.hole.length < 2) { box.innerHTML='<div class="hint">先选你的两张手牌</div>'; return; }
      if (S.board.length===1||S.board.length===2) { box.innerHTML='<div class="hint">公共牌要么不选，要么至少 3 张（翻牌）</div>'; return; }
      var unknown = 5 - S.board.length + S.opps*2;
      var iters = unknown <= 2 ? 120000 : (S.opps<=2 ? 60000 : 30000);
      EngineHoldem.setSeed(20260822);
      var r = EngineHoldem.equity(S.hole, S.board, S.opps, iters);
      if (!r) { box.innerHTML='<div class="hint">牌不够发了，减几个对手</div>'; return; }
      var se = Math.sqrt(Math.max(r.equity*(1-r.equity),1e-6)/iters);
      var made = S.board.length>=3 ? EngineHoldem.categoryName(EngineHoldem.eval7(S.hole.concat(S.board))) : null;
      var strong = r.equity >= 0.5;
      box.innerHTML =
        '<div class="verdict '+(strong?'raise':'open')+'"><div class="vact">'+pct1(r.equity)+'</div>'+
        '<div class="vwhy">对 <b>'+S.opps+'</b> 个未知对手，打到河牌你赢下这个池的概率（平分按一半算，所以和下面的「赢」略有出入）'+
        (made?('。你现在已经成牌：<b>'+made+'</b>'):'')+'。</div>'+
        // 这句原来在结论卡下方的 note 里，被吸底键盘整段遮住 —— 四张截图里一次都没出现。
        // 它不是注脚，是"跟不跟"这个问题的直接答案，必须和大字同框。
        // 倍数 = (1/胜率 - 1)。胜率一高它就趋近 0，toFixed(1) 会给出
        // 「至少要有你跟注额的 0.0 倍」这种胡话（实拍到河牌两对 96.2% 那张）。
        // 分三档：必赢 / 赢面极大（倍数已小到没有意义）/ 正常。
        '<div class="vwhy" style="margin-top:6px;color:var(--fg)">'+(function(){
          if (r.equity > 0.999) return '这手基本必赢，怎么跟都不亏。';
          var mult = 1 / r.equity - 1;
          if (mult < 0.05) return '这手赢面极大，底池里随便有点钱，跟就不亏。';
          return '底池至少要有你跟注额的 <b>' + mult.toFixed(mult < 1 ? 2 : 1) + ' 倍</b>，跟才不亏。';
        })()+'</div>'+
        '<div class="vstats">'+
        '<div class="stat"><div class="k">赢</div><div class="v" style="color:var(--raise)">'+pct1(r.win)+'</div></div>'+
        '<div class="stat"><div class="k">平分</div><div class="v">'+pct1(r.tie)+'</div></div>'+
        '<div class="stat"><div class="k">输</div><div class="v" style="color:var(--open)">'+pct1(r.lose)+'</div></div></div></div>'+
        '<p class="note">'+iters.toLocaleString()+' 次模拟，95% 误差约 ±'+(se*196).toFixed(2)+' 个百分点。</p>';
      if (keepVerdictVisible) keepVerdictVisible();
    }

    $('opps').onclick=function(e){ var b=e.target.closest('button[data-o]'); if(!b) return;
      S.opps=+b.dataset.o; save('holdem.opps',S.opps); renderOpps(); render(); };
    $('hp-suits').onclick=function(e){ var b=e.target.closest('button[data-s]'); if(!b) return;
      S.suit=+b.dataset.s; var ch=$('hp-suits').children;
      for(var i=0;i<ch.length;i++) ch[i].className=(SUIT_RED[i]?'red':'')+(i===S.suit?' on':'');
      renderSlots(); };
    $('hp-ranks').onclick=function(e){ var b=e.target.closest('button[data-r]'); if(!b||b.disabled) return;
      var c=(+b.dataset.r)*4+S.suit;
      if (S.hole.length>=2 && S.board.length>=5) { S.hole=[]; S.board=[]; }   // 满了再点 = 开新一手
      if (S.hole.length<2) S.hole.push(c); else if (S.board.length<5) S.board.push(c);
      render(); };
    root.onclick=function(e){ var pc=e.target.closest('.pcard[data-c]'); if(!pc) return;
      var c=+pc.dataset.c, i=S.hole.indexOf(c);
      if(i>=0) S.hole.splice(i,1); else { var j=S.board.indexOf(c); if(j>=0) S.board.splice(j,1); }
      render(); };
    $('undo').onclick=function(){ if(S.board.length) S.board.pop(); else S.hole.pop(); render(); };
    $('clr').onclick=function(){ S.hole=[]; S.board=[]; render(); };
    renderOpps();
    keepVerdictVisible = installDock(view);
    render();
  }
};

// ══════════════════ 三、21点 ══════════════════
var BJ = {
  title: '21点', headerBtn: true,
  S: { mine: [], up: 0, h17: load('bj.h17', false), run: 0, decks: load('bj.decks', 6), seen: 0, undo: [] },
  mount: function (root) {
    var S = this.S, keepBJ = null;
    var LB = ['A','2','3','4','5','6','7','8','9','10'];
    root.innerHTML =
      '<div class="sec"><div class="lab"><span>我的牌</span>'+
        '<span class="act" id="clr">清空</span></div>'+
        '<div class="tray" id="mine"></div></div>'+
      '<div id="out"></div>'+
      '<div class="sec"><div class="lab"><span>Hi-Lo 算牌<span style="color:#5a6577"> · 庄家暗牌、别家的牌在这里补记</span></span>'+
        '<span class="act" id="undoCount" style="color:var(--gold)">撤一张</span>'+
        '<span class="act" id="reset">归零</span></div>'+
        '<div class="grid7" id="count"></div><div id="cinfo"></div></div>'+
      // 两个键盘都是每手必点，一起吸底放进拇指区。
      // 顶部对齐时「庄家明牌」落在 y=137（换手区），屏幕越高越够不着。
      '<div class="sec dock">'+
        '<div class="lab"><span>庄家明牌</span><span style="color:#5a6577;font-size:11.5px">先点这里</span></div>'+
        '<div class="grid7" id="up"></div>'+
        // 「记完这手」对记牌的人是每手 1 下的高频操作，原来在页面顶部 y≈80（换手区最深处），
        // 且紧邻「清空」容易误触。搬进 dock 我的牌那一行右侧。
        '<div class="lab" style="margin-top:8px"><span>我的牌</span>'+
          '<span class="act" id="tally" style="color:var(--raise)">记完这手 ↑</span></div>'+
        '<div class="grid7" id="pad"></div></div>'+

      '<details class="note"><summary>算法与验证</summary>'+
      '<p><b>不内置策略表</b>——那等于凭记忆抄数字。这里是把规则写成递归期望值直接算：'+
      '庄家补牌到17的完整结果分布 → 停牌期望 → 要牌期望（递归）→ 双倍、分牌。'+
      '显示的动作是算出来的结果，顺带能给出每个动作的具体EV。</p>'+
      '<p><b>怎么验的</b>：14条公认锚点全部命中（AA永远分、88永远分、TT永远不分、硬11对2~10双倍、硬12对4/5/6停…）；'+
      '用基本策略打完整局的整体期望，S17+DAS 算出 -0.570%、H17 算出 -0.789%、21点只赔6:5 算出 -1.923%，'+
      '与公开的庄家优势一致；再用40万手蒙特卡洛照算出的策略实打，收益与解析值在3σ内吻合。</p>'+
      '<p><b>牌堆按无限副建模</b>（公开基本策略表的通行基准）。真实6副牌的少数格子会略有差异。</p>'+
      '<p><b>Hi-Lo</b>：2-6记+1，7-9记0，10/J/Q/K/A记-1。真数=流水÷剩余副数。真数≥+3时买保险才有利。</p></details>';

    function pad(idb, arr, cur) {
      var h=''; for (var i=0;i<arr.length;i++) h+='<button class="pill sm'+(arr[i]===cur?' on':'')+'" data-v="'+arr[i]+'">'+LB[arr[i]===10?9:arr[i]-1]+'</button>';
      $(idb).innerHTML=h;
    }
    function renderMine() {
      var t=$('mine');
      if (!S.mine.length) { t.className='tray empty'; t.textContent='点下面的牌输入你的手牌'; return; }
      t.className='tray'; var h='';
      for (var i=0;i<S.mine.length;i++) h+='<span class="pcard" data-i="'+i+'">'+LB[S.mine[i]===10?9:S.mine[i]-1]+'</span>';
      t.innerHTML=h;
    }
    function renderCount() {
      var h=''; for (var v=1;v<=10;v++) h+='<button class="pill sm" data-cv="'+v+'">'+LB[v===10?9:v-1]+'</button>';
      $('count').innerHTML=h;
      var left = Math.max(0.5, S.decks - S.seen/52);
      var tc = EngineBJ.trueCount(S.run, left);
      var units = tc<=1 ? 1 : Math.min(8, Math.round(tc-1)*2);
      $('cinfo').innerHTML =
        '<div class="vstats" style="margin-top:8px">'+
        '<div class="stat"><div class="k">流水计数</div><div class="v">'+(S.run>0?'+':'')+S.run+'</div></div>'+
        '<div class="stat"><div class="k">剩余副数</div><div class="v">'+left.toFixed(1)+'</div></div>'+
        '<div class="stat"><div class="k">真数</div><div class="v" style="color:'+(tc>=2?'var(--raise)':tc<=-1?'var(--open)':'var(--fg)')+'">'+
          (tc>0?'+':'')+tc.toFixed(1)+'</div></div></div>'+
        '<p class="note">牌越"热"（真数越高）说明剩下的大牌越多，对玩家越有利。'+
        '建议下注 <b>'+units+' 个单位</b>；保险：<b>'+(EngineBJ.insuranceOK(tc)?'可以买（真数≥+3）':'别买')+'</b>。'+
        '共记录 '+S.seen+' 张。</p>';
    }
    // "期望 +0.180（每1个单位赌注）"两个术语连发，对不懂 EV 的人等于没说。
    // 换算成"每押100"，负期望时补一句"已是最少亏的"——否则醉酒的人一定会问
    // "最优解怎么还是亏钱"。
    function evWords(ev, n) {
      var per = Math.round(Math.abs(ev) * 100);
      if (ev >= 0) return '长期平均：每押 100，这么打净赚 <b>' + per + '</b>。';
      return '长期平均：每押 100 平均亏 <b>' + per + '</b> —— 但已是 ' + n + ' 个选项里亏得最少的。';
    }
    function render() {
      hbtn.textContent = S.h17 ? '庄软17要' : '庄软17停';
      hbtn.className = 'hbtn' + (S.h17 ? ' on' : '');
      pad('up', [1,2,3,4,5,6,7,8,9,10], S.up);
      pad('pad', [1,2,3,4,5,6,7,8,9,10], -1);
      renderMine(); renderCount();
      var box=$('out');
      if (!S.up || S.mine.length<2) { box.innerHTML='<div class="hint">选庄家明牌 + 你的至少两张牌</div>'; return; }
      var r = EngineBJ.advise(S.mine, S.up, { hitSoft17:S.h17, das:true, surrender:true });
      // 投降原来用 --dim（暗灰）：硬16对庄10 这种最需要果断执行的答案，反而是整卡最暗的字
      var COLOR = { stand:'var(--open)', hit:'var(--raise)', double:'var(--gold)', split:'var(--purple)', surrender:'var(--blue)' };
      var h = '<div class="verdict info" style="--x:0"><div class="vact" style="color:'+COLOR[r.best]+'">'+r.bestName+'</div>'+
        // "爆牌概率"必须带主语：拿16点的人心里想的是自己要牌爆的概率(8/13≈62%)，
        // 而这里的 23% 是庄家的。少两个字会让人得出完全相反的结论。
        '<div class="vwhy">你 <b>'+
        (r.isPair ? ('一对 '+LB[S.mine[0]===10?9:S.mine[0]-1]) : ((r.soft?'软 ':'')+r.total+' 点'))+
        '</b>'+(r.isBlackjack?'（黑杰克）':'')+
        '，庄家明牌 <b>'+LB[S.up===10?9:S.up-1]+'</b>，<b>庄家</b>爆牌概率 <b>'+pct(r.dealerBust)+'</b>。<br>'+
        evWords(r.bestEV, r.actions.length)+'</div></div>';
      // 两行四舍五入后撞成同一个数、却排了先后，看着像随机。撞了就加一位小数。
      var digits = 3;
      while (digits < 5) {
        var seenEV = {}, clash = false;
        for (var q=0;q<r.actions.length;q++) {
          var key2 = r.actions[q].ev.toFixed(digits);
          if (seenEV[key2]) { clash = true; break; }
          seenEV[key2] = 1;
        }
        if (!clash) break;
        digits++;
      }
      h += '<div class="alts">';
      for (var i=0;i<r.actions.length;i++) {
        var a=r.actions[i], w=Math.max(2,Math.round((a.ev+1)/2*100));
        h += '<div class="alt'+(i===0?' top':'')+'"><span class="nm" style="color:'+(i===0?COLOR[a.key]:'')+'">'+a.name+'</span>'+
             '<span class="bar"><i style="width:'+w+'%;background:'+(a.ev>=0?'var(--raise)':'var(--open)')+'"></i></span>'+
             '<span class="pc">'+(a.ev>=0?'+':'')+a.ev.toFixed(digits)+'</span></div>';
      }
      h += '</div><p class="note">右边数字 = <b>每押 1 的长期盈亏</b>：+0.18 即押 100 赚 18，-0.50 即押 100 亏 50。挑最大的那个。</p>';
      box.innerHTML=h;
      if (keepBJ) keepBJ();
    }
    var keepBJ = installDock(root);
    $('up').onclick=function(e){ var b=e.target.closest('button[data-v]'); if(!b) return; S.up=+b.dataset.v; render(); };
    $('pad').onclick=function(e){ var b=e.target.closest('button[data-v]'); if(!b) return;
      if (S.mine.length<8) S.mine.push(+b.dataset.v); render(); };
    $('mine').onclick=function(e){ var s=e.target.closest('[data-i]'); if(!s) return; S.mine.splice(+s.dataset.i,1); render(); };
    $('clr').onclick=function(){ S.mine=[]; render(); };
    // 一步把这手已输入的牌（我的牌 + 庄家明牌）计入流水并清空，省掉在下面第二个
    // 一模一样的键盘上重录一遍 —— 那是全站唯一真正多余的步骤，且极易点串。
    $('tally').onclick=function(){
      if (!S.mine.length && !S.up) return;
      for (var i=0;i<S.mine.length;i++) { var d=EngineBJ.hiLo(S.mine[i]); S.run+=d; S.seen++; S.undo.push(d); }
      if (S.up) { var du=EngineBJ.hiLo(S.up); S.run+=du; S.seen++; S.undo.push(du); }
      S.mine=[]; S.up=0; render();
      // 记完之后把真数露到 dock 之上。
      // 注意不能用 scrollIntoView({block:'end'}) —— 它对齐的是视口底边，而视口底部被
      // fixed dock 盖着；内容变短时目标滚动量为负会被钳到 0，不但没露出来，还会把
      // 用户手动滚出来的位置拉回去。改成与 keep() 同款：只往下补，永不回拉。
      var ci=$('cinfo'), dk=root.querySelector('.dock');
      if (ci && dk) {
        var need = ci.getBoundingClientRect().bottom - dk.getBoundingClientRect().top + 10;
        if (need > 0) document.scrollingElement.scrollTop += need;
      }
    };
    // 补记点错了原来无征兆也无法恢复。留一条撤销栈（只存 hiLo 增量，够用且省）。
    $('count').onclick=function(e){ var b=e.target.closest('button[data-cv]'); if(!b) return;
      var d = EngineBJ.hiLo(+b.dataset.cv);
      S.run += d; S.seen++; S.undo.push(d); if (S.undo.length > 60) S.undo.shift();
      renderCount(); };
    $('undoCount').onclick=function(){
      if (!S.undo.length) return;
      S.run -= S.undo.pop(); S.seen = Math.max(0, S.seen - 1); renderCount(); };
    // 归零会一下抹掉整靴牌的流水，已看过的牌无法重建，而它就在每手都要点的
    // 算牌键盘正上方。全站唯一"误触后不可恢复"的操作，加两段确认。
    var resetArmed = null, armTime = 0;
    $('reset').onclick=function(){
      var b=$('reset');
      if (!resetArmed) {
        b.textContent='确定归零？'; b.style.color='var(--open)';
        armTime = Date.now();
        resetArmed = setTimeout(function(){
          resetArmed=null; b.textContent='归零'; b.style.color='';
        }, 3000);
        return;
      }
      // 武装时按钮文字变宽会 reflow，把"确定归零？"推到刚才手指的落点下；
      // 连撤多张时一记快拍就能把整靴计数抹掉。刻意的确认不可能快过 400ms。
      if (Date.now() - armTime < 400) return;
      clearTimeout(resetArmed); resetArmed=null;
      b.textContent='归零'; b.style.color='';
      S.run=0; S.seen=0; S.undo=[]; renderCount();
    };
    hbtn.onclick=function(){ S.h17=!S.h17; save('bj.h17',S.h17); render(); };
    render();
  }
};

// ══════════════════ 四、24点 ══════════════════
var P24 = {
  title: '24点',
  S: { nums: [] },
  mount: function (root) {
    var S = this.S;
    root.innerHTML =
      '<div class="sec"><div class="lab"><span>四张牌</span><span class="act" id="clr">清空</span></div>'+
        '<div class="tray" id="slots"></div></div>'+
      '<div id="out"></div>'+
      '<div id="doc24"></div>'+
      '<div class="sec dock"><div class="lab"><span id="padhint">点牌面加入</span>'+
        '<span style="color:#5a6577;font-size:11.5px">A=1 · J=11 · Q=12 · K=13</span></div>'+
        '<div class="ranks" id="pad"></div></div>';


    // 展示层把程序员符号换成人念的符号（引擎输出不动，测试夹具照旧）
    function human(x){ return x.replace(/\*/g,'×').replace(/\//g,'÷').replace(/ - /g,' − '); }
    $('doc24').innerHTML = '<details class="note"><summary>算法与验证</summary>'+
      '<p>穷举全部运算顺序和括号方式，用<b>精确有理数</b>（分子分母整数 + 交叉相乘判等），'+
      '所以 8÷(3−8÷3)=24 这类必须靠分数的解一个都不会漏。A=1，J/Q/K=11/12/13。</p>'+
      '<p><b>怎么验的</b>：1..13 四张牌共 C(16,4)=1820 种组合全部跑一遍，可解的有 <b>1362</b> 组（74.8%），'+
      '与公开常引用的数字一致；每一条解都用独立求值器复核确实等于24；'+
      '并检查解里用到的数字恰好是给定的那四个、且 1820 组里没有一条重复式子。</p>'+
      '<p>补充一个实测结论：在四张 1..13 的范围内，不存在"落在 24±0.001 内却不等于 24"的表达式值，'+
      '所以浮点加容差在这里其实也是对的——精确有理数是防御性的，不是救命的。</p></details>';
    var keep24 = installDock(root);

    function renderSlots() {
      var t=$('slots'), h='';
      for (var i=0;i<4;i++) h += S.nums[i]!=null
        ? '<span class="pcard" data-i="'+i+'">'+Engine24.cardLabel(S.nums[i])+'</span>'
        : '<span class="pcard ph">?</span>';
      t.className='tray'; t.innerHTML=h;
      // 故意不 disable —— 一排灰按钮既难看又让人以为坏了。满四张后再点 = 开新一组。
      $('padhint').textContent = S.nums.length>=4 ? '已满 · 再点一张牌即开新一组' : '点牌面加入';
    }
    function render() {
      renderSlots();
      var box=$('out');
      if (S.nums.length<4) { box.innerHTML='<div class="hint">再选 '+(4-S.nums.length)+' 张牌<br><span style="color:#828fa3">选满四张自动求解</span></div>'; return; }
      var r = Engine24.solve(S.nums, 24, 60);
      if (!r.solvable) {
        box.innerHTML='<div class="verdict open"><div class="vact">无解</div>'+
          '<div class="vwhy">这四张牌用加减乘除和括号凑不出 24。'+
          '（1..13 的 1820 种组合里有 458 组无解，占 25.2%）</div></div>';
        return;
      }
      // 原来大字是解法"数量"（花絮），真正要念的算式却是 13.5px 灰字。主次颠倒。
      var h='<div class="verdict raise"><div class="vact formula">'+human(r.solutions[0])+' = 24</div>'+
        '<div class="vwhy">共 <b>'+r.count+'</b> 种解法'+(r.count>1?'，下面按长度列出':'')+'</div></div><div class="sols">';
      for (var i=0;i<r.solutions.length;i++) h+='<div class="sol">'+human(r.solutions[i])+' <b>= 24</b></div>';
      h+='</div>';
      if (r.count>r.solutions.length) h+='<p class="note">共 '+r.count+' 条，上面列出前 '+r.solutions.length+' 条（按长度排序）。</p>';
      box.innerHTML=h;
      keep24();
    }
    var ph=''; for (var v=1;v<=13;v++) ph+='<button data-v="'+v+'">'+Engine24.cardLabel(v)+'</button>';
    $('pad').innerHTML=ph;
    $('pad').onclick=function(e){ var b=e.target.closest('button[data-v]'); if(!b) return;
      if (S.nums.length>=4) S.nums=[];            // 满了再点 = 开新一组
      S.nums.push(+b.dataset.v); render(); };
    $('slots').onclick=function(e){ var s=e.target.closest('[data-i]'); if(!s) return; S.nums.splice(+s.dataset.i,1); render(); };
    $('clr').onclick=function(){ S.nums=[]; render(); };
    render();
  }
};

// ══════════════════ 路由 ══════════════════
var ROUTES = { '':Home, '#':Home, '#dice':Dice, '#holdem':Holdem, '#bj':BJ, '#p24':P24 };
function route() {
  var v = ROUTES[location.hash] || Home;
  document.body.style.paddingBottom = '';     // 上一个工具若加过吸底留白，这里清掉
  view.innerHTML=''; view.onclick=null;
  hbtn.style.display = v.headerBtn ? '' : 'none';
  hbtn.onclick = null;
  backEl.style.display = (v === Home) ? 'none' : '';
  titleEl.innerHTML = v.title;
  document.scrollingElement.scrollTop = 0;
  v.mount(view);
}
backEl.onclick = function () { if (history.length > 1) history.back(); else location.hash = ''; };
window.addEventListener('hashchange', route);
route();
// zone 级 Browser Cache TTL（4小时）会盖掉 _headers 里的 no-cache，改不了那个设置
// （leonardchow.work 上还挂着十几个别的站）。用两个为此设计的机制绕开：
//   ① URL 带内容版本号 → 内容一变注册 URL 就变，浏览器必然认为是新的 SW
//   ② updateViaCache:'none' → 明确告诉浏览器检查 SW 脚本时不要走 HTTP 缓存
if ('serviceWorker' in navigator)
  navigator.serviceWorker.register('/sw.js?v=__SWVER__', { updateViaCache: 'none' }).catch(function(){});
})();
