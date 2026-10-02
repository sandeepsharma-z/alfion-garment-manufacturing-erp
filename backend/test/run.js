/**
 * End-to-end harness (P7): fresh in-memory MongoDB → seed → API on a spare port → smoke suites (python, urllib only).
 *   npm run test:e2e            runs every test/smoke_*.py
 *   npm run test:e2e -- p5 p6   runs only the named suites
 *   KEEP=1 npm run test:e2e     keeps the seeded API alive after the suites (browser checks against the test data) — Ctrl-C to stop
 * Needs: python 3 on PATH (no pip packages) and mongodb-memory-server (devDependency; downloads mongod once).
 */
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.TEST_PORT || 5099;
const only = process.argv.slice(2);
const suites = fs.readdirSync(__dirname).filter((f) => /^smoke_.*\.py$/.test(f)).filter((f) => !only.length || only.some((o) => f.includes(o))).sort();
const py = ['python', 'python3', 'py'].find((c) => spawnSync(c, ['--version'], { stdio: 'ignore' }).status === 0);
if (!py) { console.error('python 3 not found on PATH'); process.exit(1); }

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// async spawn — never spawnSync here: it blocks the event loop, so the in-memory mongod's piped log output is not drained and the DB stalls after a few writes
const run = (cmd, args, env) => new Promise((resolve) => spawn(cmd, args, { cwd: ROOT, env, stdio: 'inherit' }).on('exit', (code) => resolve(code)).on('error', () => resolve(1)));
const up = async (url, tries = 60) => { for (let i = 0; i < tries; i += 1) { try { const r = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (r.ok) return true; } catch { /* not yet */ } if (i % 10 === 9) console.log(`waiting for API (${i + 1})`); await wait(500); } return false; };

(async () => {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongo = await MongoMemoryServer.create({ instance: { dbName: 'afion_e2e' } });
  const env = { ...process.env, NODE_ENV: 'test', PORT: String(PORT), MONGODB_URI: `${mongo.getUri()}afion_e2e`, JWT_ACCESS_SECRET: 'e2e-access-secret-not-for-production-0000', JWT_REFRESH_SECRET: 'e2e-refresh-secret-not-for-production-000', CORS_ORIGINS: 'http://localhost:5173', PYTHONIOENCODING: 'utf-8', BASE: `http://localhost:${PORT}/api/v1` };
  console.log(`memdb ${mongo.getUri()} · seeding`);
  if ((await run('node', ['src/seed/seed.js'], env)) !== 0) { await mongo.stop(); process.exit(1); }
  console.log(`API starting on :${PORT} (log: test/server.log)`);
  const serverLog = fs.createWriteStream(path.join(__dirname, 'server.log'));   // API output (request log) goes here, not the console
  const server = spawn('node', ['src/server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.pipe(serverLog); server.stderr.pipe(serverLog);
  server.stderr.on('data', (d) => process.stderr.write(d));
  if (!(await up(`http://localhost:${PORT}/api/v1/health`))) { console.error('API did not come up'); server.kill(); await mongo.stop(); process.exit(1); }
  let failed = 0;
  for (const s of suites) {
    console.log(`\n=== ${s} ===`);
    if ((await run(py, [path.join(__dirname, s)], env)) !== 0) failed += 1;
  }
  console.log(`\n${suites.length - failed}/${suites.length} suites passed`);
  if (process.env.KEEP) { console.log(`KEEP=1 · API stays on :${PORT} with the test data — Ctrl-C to stop`); return; }
  server.kill();
  await mongo.stop();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
