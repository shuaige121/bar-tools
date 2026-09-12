/* 故障注入的公共跑法。
 *
 * 三道自检，全是被真事故逼出来的：
 *  ① 注入模式没匹配上要**当失败报**，不能静默跳过
 *     —— 第一版脚本 7 条 sed 全没匹配，差点安静地报"全部抓到"。
 *  ② 开跑前先验一次基线，不干净就直接退出
 *     —— 前台跑超时被杀后引擎停在注入中途，下一次运行把污染状态当成了"原始文件"，
 *        于是模式匹配不上、最后又把污染写了回去。
 *  ③ 只修改临时副本；工作区源码从不写入测试故障。
 *     —— 进程被杀也不会污染下一次构建。
 */
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

module.exports = function run(engineRel, verifyRel, faults) {
  // Mutate a disposable checkout. Even SIGKILL cannot leave a bad engine in src/.
  const root = path.resolve(__dirname, '..');
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'bar-fault-'));
  for (const dir of ['src', 'test']) fs.cpSync(path.join(root, dir), path.join(sandbox, dir), { recursive: true, filter: file => !file.endsWith('.bak') && !file.endsWith('.pyc') && path.basename(file) !== '__pycache__' });
  const F = path.resolve(sandbox, 'test', engineRel);
  const V = path.resolve(sandbox, 'test', verifyRel);
  const originalPath = path.resolve(__dirname, engineRel);
  const orig = fs.readFileSync(F, 'utf8');
  const cleanup = () => fs.rmSync(sandbox, { recursive: true, force: true });
  process.on('exit', cleanup);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(130));
  try { execFileSync('node', [V], { stdio: 'pipe' }); }
  catch (e) {
    console.log(`  ❌ 起始状态就不干净：${path.basename(verifyRel)} 未通过，拒绝开跑。`);
    console.log((e.stdout || '').toString().split('\n').filter(x => x.includes('❌')).join('\n'));
    process.exit(2);
  }

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
  } catch (e) {
    console.log('  ❌ 临时副本复原后验证失败');
    console.log((e.stdout || '').toString().split('\n').filter(x => x.includes('❌')).join('\n'));
    process.exit(1);
  }
  if (fs.readFileSync(originalPath, 'utf8') !== orig) {
    console.log('  ❌ 工作区源码在验证期间被其他进程改动'); process.exit(1);
  }
  console.log('  工作区源码未改动 ✅');
  process.exit(missed ? 1 : 0);
};
