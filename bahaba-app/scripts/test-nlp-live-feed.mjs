import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { basename, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const app = resolve(import.meta.dirname, '..');
const backend = resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) || resolve(app, '../deploy/cloudflare/output/alwaysdata-api'));
const isolatedMysql = process.argv.includes('--isolated-mysql');
const database = `bahaba_nlp_live_test_${process.pid}_${randomBytes(3).toString('hex')}`;
const directory = resolve(app, 'nlp-live-feed-test.local', database);
const fixtureFile = resolve(import.meta.dirname, 'test-nlp-live-feed-fixtures.php');
const fixtureEnvironment = { ...process.env };
const fixture = action => JSON.parse(execFileSync('php', [fixtureFile, action, database, directory], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: fixtureEnvironment }));
const sqlEpoch = value => Date.parse(value.replace(' ', 'T') + 'Z');
const sqlTime = value => value.toISOString().slice(0, 19).replace('T', ' ');
assert.ok(existsSync(resolve(backend, 'nlp-timestamps.php')), 'Regenerate the backend package before this integration test.');
assert.match(readFileSync(resolve(backend, 'admin-api.php'), 'utf8'), /published_at/, 'Generated receiver must include publication timestamps.');
mkdirSync(directory, { recursive: true });
cpSync(backend, directory, { recursive: true, filter: path => basename(path) !== 'config.php' });
mkdirSync(resolve(directory, 'sessions'), { recursive: true });
// PHP's health check is read only and lets us wait before executing API migrations.
writeFileSync(resolve(directory, 'integration-ready.php'), "<?php header('Content-Type: application/json'); echo json_encode(['ready'=>true]);");
async function freePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}
const port = await freePort();
let server, mysqlServer, mysqlPort, created = false, serverErrors = '';
const base = `http://127.0.0.1:${port}`;
let adminCookie = '', residentCookie = '';
async function request(path, { body, cookie = '', authorization, status = 200 } = {}) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(authorization ? { Authorization: authorization } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) });
  const raw = await response.text();
  assert.equal(response.status, status, `${path}: ${raw.slice(0, 800)}`);
  let payload;
  try { payload = JSON.parse(raw); } catch { throw new Error(`${path} did not return JSON: ${raw.slice(0, 800)}`); }
  return { payload, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
}
const admin = (action, options = {}) => request('/admin-api.php?action=' + action, { cookie: adminCookie, ...options });
const ingest = (post, status = 201) => admin('nlp-ingest', { body: post, authorization: 'Bearer isolated-live-feed-token', status });
const feed = () => admin('nlp-events&location=navotas');
try {
  if (isolatedMysql) {
    const mysqlBin = process.env.BAHABA_NLP_TEST_MYSQL_BIN || 'C:/xampp/mysql/bin';
    assert.ok(existsSync(resolve(mysqlBin, 'mysql_install_db.exe')), 'The optional isolated instance requires MariaDB Windows tools.');
    const dataDirectory = resolve(app, 'nlp-live-feed-test.local', `mysql-${database}`);
    mysqlPort = await freePort();
    execFileSync(resolve(mysqlBin, 'mysql_install_db.exe'), [`--datadir=${dataDirectory}`, `--port=${mysqlPort}`, '--silent'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    mysqlServer = spawn(resolve(mysqlBin, 'mysqld.exe'), ['--no-defaults', `--basedir=${resolve(mysqlBin, '..')}`, `--datadir=${dataDirectory}`, `--port=${mysqlPort}`, '--bind-address=127.0.0.1', '--skip-name-resolve', '--innodb-buffer-pool-size=32M', `--pid-file=${resolve(dataDirectory, 'integration.pid')}`, `--log-error=${resolve(dataDirectory, 'integration.err')}`], { stdio: 'ignore', windowsHide: true });
    fixtureEnvironment.BAHABA_NLP_TEST_MYSQL_PORT = String(mysqlPort);
    for (let i = 0; ; i++) {
      try {
        execFileSync(resolve(mysqlBin, 'mysqladmin.exe'), ['--no-defaults', '-h', '127.0.0.1', '-u', 'root', `--port=${mysqlPort}`, '--connect-timeout=1', 'ping'], { stdio: 'ignore', windowsHide: true });
        break;
      } catch (error) { if (i === 79 || mysqlServer.exitCode !== null) throw error; await delay(100); }
    }
  }
  fixture('setup'); created = true;
  server = spawn('php', ['-d', `session.save_path=${resolve(directory, 'sessions')}`, '-S', `127.0.0.1:${port}`, '-t', directory], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, NLP_SERVICE_URL: '', BAHABA_INGEST_TOKEN: 'isolated-live-feed-token', BAHABA_PUBLIC_ORIGIN: '' }, windowsHide: true });
  server.stderr.on('data', data => { serverErrors = (serverErrors + data.toString()).slice(-6000); });
  for (let i = 0; ; i++) {
    try { await request('/integration-ready.php'); break; } catch (error) { if (i === 49 || server.exitCode !== null) throw error; await delay(100); }
  }
  await admin('nlp-events&location=navotas', { status: 401 });
  fixture('accounts');
  adminCookie = (await admin('login', { body: { email: 'live-feed@example.com', password: 'LiveFeedTest!26' } })).cookie;
  const posted = new Date(Date.now() - 2 * 60_000);
  const post = { source: 'Test', post_id: 'live-fresh', post_text: 'Baha sa San Jose, Navotas. Hanggang baywang na ang tubig.', post_url: 'https://example.com/posts/live-fresh', location_id: 'navotas', city: 'Navotas City', barangay: 'San Jose', classification: 'Flood', severity: 'High', urgency: 'Distress', confidence: 0.98, timestamp: posted.toISOString() };
  const stored = (await ingest(post)).payload;
  assert.equal(stored.success, true);
  assert.equal(stored.pin_threshold.eligible_posts, 1, 'Fresh original must reach the city signal pipeline immediately.');
  let data = (await feed()).payload;
  assert.equal(data.events.length, 1);
  let row = data.events[0];
  assert.equal(row.published_at, sqlTime(posted));
  assert.ok(Math.abs(Date.now() - sqlEpoch(row.received_at)) < 30_000, 'Collected time must be current UTC.');
  assert.ok(Math.abs(Date.now() - sqlEpoch(row.detected_at)) < 30_000, 'Detected time must be current UTC.');
  assert.ok(sqlEpoch(row.detected_at) > sqlEpoch(row.published_at), 'Publication and detection must remain distinct.');
  const originalDetected = row.detected_at;
  residentCookie = (await request('/api/login.php', { body: { email: 'live-resident@example.com', password: 'LiveFeedTest!26' } })).cookie;
  const initialMap = (await request('/api/map-reports.php?location=1380900000', { cookie: residentCookie })).payload;
  assert.ok(initialMap.flood_signals.reports.some(city => city.city_id === '1380900000' && city.post_count === 1), 'The first fresh original must appear to residents before citywide activation.');
  assert.ok(initialMap.flood_signals.pins.some(pin => pin.city_id === '1380900000' && pin.post_count === 1), 'A supported barangay mention must appear provisionally on the resident map.');
  const residentData = (await request('/api/location-data.php?location=1380900000', { cookie: residentCookie })).payload;
  const individualReport = residentData.flood_signals.individual_reports.find(report => report.source === 'Test');
  assert.equal(individualReport?.barangay, 'San Jose', 'Residents must receive one individual NLP report for its matched barangay.');
  assert.equal(individualReport?.severity, 'High', 'Individual reports must retain the NLP severity instead of the barangay majority.');
  assert.equal(individualReport?.source, 'Test');
  assert.ok(!('post_text' in individualReport) && !('post_url' in individualReport), 'Resident report entries must not expose raw social-post content or URL.');
  await ingest({ ...post, post_id: 'unknown-time', timestamp: null });
  data = (await feed()).payload;
  assert.equal(data.events.find(event => event.source_post_id === 'unknown-time').published_at, null, 'Missing source time must remain unknown.');
  for (const [post_id, timestamp] of [['future', new Date(Date.now() + 86_400_000).toISOString()], ['stale', new Date(Date.now() - 25 * 3_600_000).toISOString()], ['relative', 'Nov 9, 7:29 PM'], ['timezone-missing', '2026-10-24T12:00:00']]) {
    assert.ok((await ingest({ ...post, post_id, timestamp }, 422)).payload.error);
  }
  assert.equal(fixture('inspect').length, 2, 'Rejected timestamps must never persist live records.');
  fixture('age-duplicate');
  const firstReceived = fixture('inspect').find(event => event.source_post_id === 'live-fresh').received_at;
  await ingest(post);
  row = fixture('inspect').find(event => event.source_post_id === 'live-fresh');
  assert.equal(row.received_at, firstReceived, 'A delivery retry must not restart the 24-hour clock.');
  assert.equal(row.detected_at, originalDetected, 'A retry must not change first detection.');
  assert.equal(fixture('inspect').length, 2, 'A retry must not duplicate a source post.');
  fixture('pages');
  const seen = [];
  let before, asOf;
  do {
    data = (await admin('nlp-events&location=navotas' + (before ? `&before=${before}&as_of=${asOf}` : ''))).payload;
    assert.equal(Number(data.stats.total), 107);
    seen.push(...data.events);
    before = data.next_before; asOf = data.as_of;
  } while (before);
  assert.equal(seen.length, 107);
  assert.equal(new Set(seen.map(event => event.id)).size, 107, 'Every feed page must be accessible without duplicates.');
  const allReports = (await admin('all-reports')).payload;
  assert.equal(allReports.nlpEvents.length, 107, 'Platform feed must also retain all recent posts.');
  assert.ok(allReports.nlpEvents.every(event => 'published_at' in event));
  const residentMap = (await request('/api/map-reports.php?location=1380900000', { cookie: residentCookie })).payload;
  assert.ok(residentMap.flood_signals.reports.some(city => city.city_id === '1380900000' && city.post_count > 0), 'Fresh originals must also be visible to the resident map.');
  fixture('expire');
  data = (await feed()).payload;
  assert.equal(Number(data.stats.total), 106);
  assert.ok(!data.events.some(event => event.source_post_id === 'live-fresh'));
  assert.equal(fixture('inspect').length, 107, 'Expired feed posts must preserve their source records.');
  const summary = (await admin('collected-summary&location=navotas')).payload;
  assert.equal(summary.monthly.reduce((total, item) => total + Number(item.total), 0), 1, 'A post leaving the live feed must appear in archived totals.');
  console.log('PASS generated backend: real flood ingestion, separate collection/publication time, future/stale rejection, unknown dates, duplicate retention, 107 accessible feed records, resident map signals, and 24-hour archive preservation.');
} catch (error) {
  if (serverErrors) console.error(serverErrors);
  throw error;
} finally {
  if (server) { server.kill(); await new Promise(resolve => server.exitCode !== null ? resolve() : server.once('exit', resolve)); }
  try {
    if (created) { fixture('drop'); console.log('Removed isolated integration database.'); }
  } finally {
    if (mysqlServer && mysqlServer.exitCode === null) {
      const mysqlBin = process.env.BAHABA_NLP_TEST_MYSQL_BIN || 'C:/xampp/mysql/bin';
      try {
        execFileSync(resolve(mysqlBin, 'mysqladmin.exe'), ['--no-defaults', '-h', '127.0.0.1', '-u', 'root', `--port=${mysqlPort}`, 'shutdown'], { stdio: 'ignore', windowsHide: true, timeout: 20_000 });
      } catch { mysqlServer.kill(); }
      await new Promise(resolve => mysqlServer.exitCode !== null ? resolve() : mysqlServer.once('exit', resolve));
      console.log('Stopped temporary isolated MySQL instance.');
    }
  }
}
