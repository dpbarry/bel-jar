// The whole recovery, rehearsed (plan v6 c5; docs/PERSIST.md §5.7): the newest
// backup brought back into a Worker on this machine, the way it would be brought
// back into the live one, and then used, in real Chrome, the way a person would.
//
//   npm run backup:rehearse-recovery [file]
//
//   1. a fresh local D1 gets the export (`wrangler d1 execute --file`, what an
//      import into an empty live database is), and any migration newer than it;
//   2. a fresh local R2 gets every text the export lists, by `putTexts` with
//      `--local`: the same command `npm run backup:put-texts -- --remote` runs
//      against the live bucket;
//   3. each account in the backup signs in, through a stand-in GitHub that knows
//      it by the identity the backup holds, in a browser that has never seen it;
//   4. its projects come down, every file's text is the one its newest version
//      names, and every version of every project reads back whole.
//
// ⛔ Nothing here touches the live site: the Worker, its D1 and its R2 are local
// and thrown away. A backup that has never been brought back is a hope, not a
// backup: run this after anything that changes what is stored, and before term.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { backups, rowsOf, putTexts, readTexts } from './d1-backup.mjs';
import { startWorker, WRANGLER } from '../tests/_worker-env.mjs';
import { startFakeGitHub } from '../tests/_fake-github.mjs';

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ENV = { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const target = process.argv[2] || backups()[0];
if (!target || !fs.existsSync(target)) {
  console.error('no backup to rehearse with: run npm run backup:export first');
  process.exit(1);
}
const sql = fs.readFileSync(target, 'utf8');

// What the backup holds, read from the export itself.
const users = rowsOf(sql, 'users');
const identities = rowsOf(sql, 'identities').filter((i) => i.provider === 'github');
const projects = rowsOf(sql, 'projects');
const versions = rowsOf(sql, 'versions');
const texts = readTexts(sql);
const people = {};
const accounts = [];
for (const id of identities) {
  const u = users.find((x) => x.id === id.user_id);
  if (!u) continue;
  const key = 'restored-' + accounts.length;
  people[key] = { id: Number(id.subject), login: u.handle, name: u.display_name || u.handle, avatar: 'ok' };
  const own = projects.filter((p) => p.owner === u.id).map((p) => {
    const lines = versions.filter((v) => v.project === p.id).sort((a, b) => a.version - b.version);
    const head = lines.find((v) => v.version === p.head);
    return {
      id: p.id,
      live: !!(head && !head.deleted),
      head: head && !head.deleted ? JSON.parse(head.manifest) : null,
      versions: lines.filter((v) => !v.deleted).map((v) => ({ n: v.version, files: JSON.parse(v.manifest).files })),
    };
  });
  accounts.push({ key, handle: u.handle, projects: own });
}
console.log(`rehearsing ${path.basename(target)}: ${accounts.length} account${accounts.length === 1 ? '' : 's'}, ${projects.length} projects, ${versions.length} versions, ${texts.size} texts`);
if (!accounts.length) {
  console.error('the backup holds no account to sign in as');
  process.exit(1);
}

const fails = [];
let checks = 0;
const check = (ok, msg) => { checks += 1; console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails.push(msg); };

const gh = await startFakeGitHub({ people, signedIn: accounts[0].key });
let dev = null;
let browser = null;
try {
  dev = await startWorker({
    site: true,
    vars: Object.assign({ DEV_ACCOUNT_HEADER: 'no' }, gh.vars),
    // The backup, brought back: the database as an import into an empty one would,
    // then the texts by the recovery's own command, pointed at this R2.
    before: async (persist, config) => {
      const where = ['--local', '--config', config, '--persist-to', persist];
      const r = spawnSync(process.execPath, [WRANGLER, 'd1', 'execute', 'DB', ...where, '--yes', '--file', target], { env: ENV, encoding: 'utf8', timeout: 300000 });
      if (r.status !== 0) throw new Error('the export would not load:\n' + (r.stdout || '') + (r.stderr || ''));
      // Into the bucket this Worker reads (the local config names its own: beljar-texts-dev).
      const bucket = JSON.parse(fs.readFileSync(config, 'utf8')).r2_buckets.find((b) => b.binding === 'TEXTS').bucket_name;
      const n = await putTexts(sql, where, { bucket });
      console.log(`  brought back: the database, and ${n} texts by putTexts --local, into ${bucket}`);
    },
  });

  const puppeteer = (await import('../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default;
  browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', protocolTimeout: 180000 });
  for (const account of accounts) {
    gh.signIn(account.key);
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
    await page.goto(dev.url + '/?home', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.Home && window.Account && document.getElementById('btn-account').dataset.state === 'signed-out', { timeout: 60000 });
    // As a person signs in: the account menu, and GitHub's round trip.
    await page.click('#btn-account');
    await wait(400);
    const item = await page.evaluateHandle(() => [...document.querySelectorAll('#menu-root .menu-item')].find((b) => b.textContent.trim() === 'Sign in with GitHub'));
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), item.asElement().click()]);
    await page.waitForFunction((h) => window.Account && Account.user() && Account.user().handle === h, { timeout: 60000 }, account.handle);
    const synced = await page.waitForFunction(() => Persist.syncSummary().state === 'synced', { timeout: 120000 }).then(() => true, () => false);
    if (!synced) {
      const s = await page.evaluate(() => JSON.stringify(Persist.syncSummary()));
      throw new Error(`@${account.handle} signed in, and sync did not settle: ${s}; page errors: ${errors.slice(0, 3).join(' | ') || 'none'}`);
    }
    check(true, `@${account.handle} signs in to the restored server, as the backup's own identity`);

    const got = await page.evaluate(async (expected) => {
      const hex = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const here = Persist.projects();
      const out = [];
      for (const p of expected) {
        const row = { id: p.id, live: p.live, present: !!here.find((x) => x.id === p.id), badFiles: [], badVersions: [] };
        if (p.live) {
          const files = Persist.projectFiles(p.id);
          row.name = files && files.name;
          for (const f of p.head.files) {
            const local = files && files.files.find((x) => x.path === f.path);
            if (!local || (await hex(local.text)) !== f.hash) row.badFiles.push(f.path);
          }
        }
        for (const v of p.versions) {
          const whole = await Persist.readVersion(p.id, v.n);
          let ok = !!whole && !whole.deleted;
          for (const f of v.files) {
            const back = whole && whole.files.find((x) => x.path === f.path);
            if (!back || (await hex(back.text)) !== f.hash) ok = false;
          }
          if (!ok) row.badVersions.push(v.n);
        }
        out.push(row);
      }
      return out;
    }, account.projects);
    const live = got.filter((p) => p.live);
    const missing = live.filter((p) => !p.present);
    const wrong = live.filter((p) => p.badFiles.length);
    const versionCount = account.projects.reduce((n, p) => n + p.versions.length, 0);
    const unreadable = got.filter((p) => p.badVersions.length);
    check(!missing.length, `its ${live.length} project${live.length === 1 ? '' : 's'} came down to a browser that had never seen them (${missing.map((p) => p.id).join(', ') || 'all'})`);
    check(!wrong.length, `every file's text is the one its newest version names (${wrong.map((p) => p.id + ': ' + p.badFiles.join(', ')).join('; ') || 'all match'})`);
    check(!unreadable.length, `every one of its ${versionCount} versions reads back whole, from the restored texts (${unreadable.map((p) => p.id + ' v' + p.badVersions.join(',')).join('; ') || 'all'})`);
    check(!errors.length, `and the page raised nothing (${errors.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }
} catch (e) {
  fails.push(String(e && e.stack || e));
  console.log('  FAIL the rehearsal ran to completion: ' + String(e && e.message || e));
} finally {
  if (browser) await browser.close();
  if (dev) dev.stop();
  gh.close();
}
if (fails.length) {
  console.log(`\nrecovery rehearsal FAILED (${fails.length})`);
  process.exit(1);
}
console.log(`\nrecovery rehearsed on ${path.basename(target)}: every account back in, every project, file and version whole (${checks} checks)`);
