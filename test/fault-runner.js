/* 故障注入的公共跑法。
 *
 * 三道自检，全是被真事故逼出来的：
 *  ① 注入模式没匹配上要**当失败报**，不能静默跳过
 *     —— 第一版脚本 7 条 sed 全没匹配，差点安静地报"全部抓到"。
 *  ② 开跑前先验一次基线，不干净就直接退出
 *     —— 前台跑超时被杀后引擎停在注入中途，下一次运行把污染状态当成了"原始文件"，
 *        于是模式匹配不上、最后又把污染写了回去。
 *  ③ 落一个 .bak 到磁盘，并挂 SIGINT/SIGTERM/uncaught 处理
 *     —— 进程被杀时也要能还原，不能只靠正常路径的 finally。
 */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

module.exports = function run(engineRel, verifyRel, faults) {
  const F = path.join(__dirname, engineRel);
  const V = path.join(__dirname, verifyRel);
  const BAK = F + '.bak';

  // ② 起始状态必须是干净的
  try { execFileSync('node', [V], { stdio: 'pipe' }); }
  catch (e) {
    console.log(`  ❌ 起始状态就不干净：${path.basename(verifyRel)} 未通过，拒绝开跑。`);
    if (fs.existsSync(BAK)) console.log(`     发现残留备份 ${path.basename(BAK)}，可能是上次被杀了；请先还原。`);
    process.exit(2);
  }

  // ④ 互斥锁：同时跑两份故障注入（或注入跑着时又起了构建）会互相把对方的
  //    污染状态读成"原始文件"。刚刚就这么干过一次，靠 ③ 的磁盘备份才救回来。
  //    规则写在 README 里没用，得让它物理上跑不起来。
  const LOCK = path.join(__dirname, '..', '.fault-injection.lock');
  if (fs.existsSync(LOCK)) {
    let age = 'unknown';
    try { age = Math.round((Date.now() - fs.statSync(LOCK).mtimeMs) / 1000) + 's'; } catch (e) {}
    console.log(`  ❌ 已有故障注入在跑（锁文件 ${path.basename(LOCK)}，${age} 前创建）。`);
    console.log(`     并发注入会互相污染源码。等它跑完，或确认无进程后删掉该文件。`);
    process.exit(3);
  }
  fs.writeFileSync(LOCK, String(process.pid));

  const orig = fs.readFileSync(F, 'utf8');
  fs.writeFileSync(BAK, orig);                       // ③ 备份落盘
  let done = false;
  const restore = () => {
    if (done) return;
    try { fs.writeFileSync(F, orig); fs.unlinkSync(BAK); } catch (e) {}
    try { fs.unlinkSync(LOCK); } catch (e) {}
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'])
    process.on(sig, () => { restore(); process.exit(130); });
  process.on('uncaughtException', (e) => { restore(); console.error(e); process.exit(1); });

  let caught = 0, missed = 0;
  for (const [name, from, to] of faults) {
    const n = orig.split(from).length - 1;
    if (n === 0) {
      console.log(`  ⚠️  注入无效（模式没匹配上）: ${name}`);
      missed++;
      fs.writeFileSync(F, orig);                     // ① 跳过也要还原，别把上一条的注入留着
      continue;
    }
    fs.writeFileSync(F, orig.split(from).join(to));
    let passed = true, first = '';
    try { execFileSync('node', [V], { stdio: 'pipe', env: Object.assign({}, process.env, { BJ_MC: '80000' }) }); }
    catch (e) {
      passed = false;
      const line = (e.stdout || '').toString().split('\n').find(x => x.includes('❌'));
      first = line ? line.trim().slice(0, 76) : '';
    }
    if (passed) { console.log(`  ❌ 漏网: ${name}  ← 注入了 ${n} 处，测试居然全绿`); missed++; }
    else { console.log(`  ✅ 抓到: ${name}`); console.log(`         └─ ${first}`); caught++; }
  }

  fs.writeFileSync(F, orig);
  console.log(`\n  故障注入: 抓到 ${caught} / 漏网 ${missed}`);
  try {
    execFileSync('node', [V], { stdio: 'pipe' });
    console.log('  复原后基线仍全绿 ✅');
    done = true;
    try { fs.unlinkSync(BAK); } catch (e) {}
    try { fs.unlinkSync(LOCK); } catch (e) {}
  } catch {
    console.log(`  ❌ 复原失败，引擎被污染了（备份在 ${path.basename(BAK)}，可直接 cp 回去）`);
    try { fs.unlinkSync(LOCK); } catch (e) {}
    process.exit(1);
  }
  process.exit(missed ? 1 : 0);
};
