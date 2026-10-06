// The post-deploy probe: the REAL site, the real R2 bucket, real work on BOTH
// Beluga consumers. Run it after every deploy:  npm run probe:live
//
// What it proves that no local probe can: the runtime loads cross-origin from
// R2, every worker that needs it is pointed there (the checker's slots AND
// Harpoon's dedicated proof worker), each runtime URL carries the build stamp,
// and the service worker caches it. HarpoonEngine once kept its own copy of
// the runtime URL and its worker 404'd on the deployed site while the checker
// looked fine. Nothing in the product starts that worker today, which is
// exactly why only a probe that starts it could see it.
//
// And the server: sign-in configured (id AND secret), the sync API closed to
// anyone without a session, and no file of the repository served (until
// 2026-09-28 the live site served /.git/).
//
// ⛔ Hits the network, so it is NOT part of `npm run probe`. Point it at another
// deployment with BELJAR_LIVE_URL=https://... npm run probe:live
import { openProbe } from './probe-harness.mjs';

const LIVE = process.env.BELJAR_LIVE_URL || 'https://beljar.deanbarry.com/';
const CDN_HOST = 'beljar-cdn.deanbarry.com';
const NL = String.fromCharCode(10);

// The harness always opens the local app first; nothing here depends on it.
const { page, check, finish } = await openProbe({ port: 8863, waitFor: () => true, settle: 0 });

let crash = null;
const consoleErrs = [];
const failed = [];
try {
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  page.on('requestfailed', (r) => failed.push(r.url() + ' :: ' + (r.failure() && r.failure().errorText)));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });

  const t0 = Date.now();
  console.log('  live:', LIVE);
  // 0. Two pages (docs/PERSIST.md §5.11). The site opens on home: the projects
  //    and the way in, with nothing of the editor or of Beluga loaded.
  await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.Persist && window.Home && window.Frame && window.Frame.isMounted(), { timeout: 60000 });
  const account = await page.waitForFunction(() => { const b = document.getElementById('btn-account'); return b && !b.hidden; }, { timeout: 15000 })
    .then(() => true, () => false);
  check(account, 'home found the server: its header shows the account button');
  // The editor's scripts may be FETCHED ahead once home is idle (a prefetch link:
  // js/home/preload-editor.mjs). None is run here, and the Beluga runtime is not touched.
  const ahead = await page.waitForFunction(() => document.querySelectorAll('link[rel="prefetch"]').length > 0, { timeout: 15000 })
    .then(() => true, () => false);
  const home = await page.evaluate(async () => {
    const editHtml = await (await fetch(window.Routes.editUrl())).text();
    const scripts = [...editHtml.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => new URL(m[1], location.origin + '/').pathname);
    return {
      editor: !!(window.BelugaClient || window.CurrentEditor || window.HarpoonEngine),
      run: performance.getEntriesByType('resource').filter((r) => /editor-cm\.bundle|shell\.js$|beluga-client/.test(new URL(r.name).pathname) && r.initiatorType !== 'link')
        .map((r) => new URL(r.name).pathname),
      beluga: performance.getEntriesByType('resource').map((r) => new URL(r.name).pathname).filter((p) => /beluga_web|beluga-worker/.test(p)),
      edit: window.Routes.editUrl(),
      signin: !!document.getElementById('home-signin') && !document.getElementById('home-signin').hidden,
      prefetched: [...document.querySelectorAll('link[rel="prefetch"]')].map((l) => new URL(l.href).pathname),
      scripts,
      optIn: /<style>\s*@view-transition\s*\{\s*navigation:\s*auto;\s*\}\s*<\/style>/.test(document.head.innerHTML) && /@view-transition/.test(editHtml),
      commands: window.Commands.list({ palette: true, runnable: true, available: true }).map((c) => c.id),
    };
  });
  console.log('  home:', JSON.stringify(home));
  check(!home.editor && home.run.length === 0 && home.beluga.length === 0, `home runs no editor and touches no Beluga (${home.run.concat(home.beluga).join(', ')})`);
  check(home.edit === '/edit' && home.signin, 'it links to the editor at /edit, and offers to sign in');
  check(ahead && home.scripts.length >= 5 && home.prefetched.join() === home.scripts.join(),
    `idle, it fetches the editor's scripts ahead: exactly the ones the editor's document loads (${home.prefetched.length} of ${home.scripts.length})`);
  check(home.optIn, 'both documents opt in to the transition between them, in their own heads');
  check(home.commands.includes('project.new') && home.commands.includes('account.sign-in') && home.commands.includes('set.sync-reconnect')
    && !home.commands.some((id) => /^(edit|run|nav|tab)\./.test(id)),
    `the palette on home offers home's commands, the sync preferences among them, and nothing that needs an editor (${home.commands.length})`);

  // The editor, with no project named: the last one opened, and the address says which.
  await page.goto(new URL('edit', LIVE).href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.BelugaClient && window.HarpoonEngine && window.App, { timeout: 60000 });
  const named = await page.waitForFunction(() => window.Routes && window.Persist && window.Routes.projectOf(location) === window.Persist.getActiveProjectId(),
    { timeout: 15000 }).then(() => true, () => false);
  check(named, 'the editor is served at /edit, and its address names its project');

  const cfg = await page.evaluate(() => ({ base: window.BELJAR_RUNTIME_BASE || null, host: location.hostname }));
  console.log('  config:', JSON.stringify(cfg));
  check(cfg.base === `https://${CDN_HOST}/`, 'the deployed host routes the runtime to R2');

  // 1. The checker: a small signature through the live BelugaClient.
  const sig = ['LF nat : type =', '| z : nat', '| s : nat -> nat;', '',
    'LF le : nat -> nat -> type =', '| le_z : le z N', '| le_s : le N M -> le (s N) (s M);', ''].join(NL);
  const run = await page.evaluate(async (src) => {
    const t = performance.now();
    try {
      await window.BelugaClient.warm();
      const warmMs = Math.round(performance.now() - t);
      const t2 = performance.now();
      const out = await window.BelugaClient.load(src, { pinned: true });
      return { ok: true, warmMs, checkMs: Math.round(performance.now() - t2), out: String(out).slice(0, 160) };
    } catch (e) {
      return { ok: false, why: String((e && e.message) || e).slice(0, 300) };
    }
  }, sig);
  console.log('  checker:', JSON.stringify(run));
  check(run.ok, `the checker boots from R2 and type-checks (${run.why || 'ok'})`);

  // 2. Harpoon's dedicated proof worker (HarpoonEngine). The question is only
  //    whether the runtime LOADED in that worker: its ideProof* shim was never
  //    built into the runtime, so even a healthy worker answers start() with
  //    "ideProofStart is not a function". Only the worker's own runtime-load
  //    failure ("Could not load Beluga ...") counts as not booting.
  const proof = ['LF nat : type =', '| z : nat', '| s : nat -> nat;', '',
    'rec id : [|- nat] -> [|- nat] =', 'fn n => ?;', ''].join(NL);
  const harpoon = await page.evaluate(async (src) => {
    const scripts = () => performance.getEntriesByType('resource')
      .filter((r) => /\/beluga-worker\.js$/.test(new URL(r.name).pathname))
      .map((r) => new URL(r.name).searchParams.get('script'));
    const before = scripts().length;
    try {
      const out = await Promise.race([
        window.HarpoonEngine.start(src, 6, 9),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after 30s')), 30000)),
      ]);
      return { booted: true, ok: !!(out && out.ok), keys: Object.keys(out || {}).slice(0, 6), script: scripts().slice(before)[0] || null };
    } catch (e) {
      return { booted: false, why: String((e && e.message) || e).slice(0, 200), script: scripts().slice(before)[0] || null };
    }
  }, proof);
  console.log('  harpoon:', JSON.stringify(harpoon));
  const harpoonLoaded = harpoon.booted || !/Could not load Beluga/.test(harpoon.why || '');
  check(harpoonLoaded, `the runtime loads in Harpoon's worker on the live site (${harpoon.why || 'ok'})`);
  check(!!harpoon.script && new URL(harpoon.script).host === CDN_HOST,
    `Harpoon's worker was handed the R2 runtime (got ${harpoon.script})`);

  // 3. Where every runtime byte came from, and the URL each worker was given.
  //    Matched by path: the worker shim's query string carries the encoded
  //    runtime URL, so a full-URL match would count the shim as a runtime fetch.
  const net = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource');
    return {
      runtime: res.map((r) => r.name).filter((n) => /^\/beluga_web\.bc(\.dt)?\.js$/.test(new URL(n).pathname)),
      workers: res.filter((r) => /\/beluga-worker\.js$/.test(new URL(r.name).pathname))
        .map((r) => new URL(r.name).searchParams.get('script')),
    };
  });
  console.log('  network:', JSON.stringify(net));
  check(net.runtime.length > 0 && net.runtime.every((u) => new URL(u).host === CDN_HOST),
    'every runtime fetch came from R2');
  check(net.workers.length > 0 && net.workers.every((s) => s && new URL(s).host === CDN_HOST),
    `every worker was handed the R2 runtime (${net.workers.length} workers)`);
  check(net.workers.length > 0 && net.workers.every((s) => s && new URL(s).searchParams.get('v')),
    'every runtime URL carries the build stamp, so a rebuild is a URL no cache has seen');

  const cors = consoleErrs.filter((e) => /CORS|Access-Control|importScripts|NetworkError/i.test(e));
  check(cors.length === 0, `no CORS or importScripts errors (${cors.join(' | ')})`);

  // 4. Second visit: the service worker should own the runtime now.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.BelugaClient, { timeout: 60000 });
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    let cached = [];
    for (const k of await caches.keys()) {
      const c = await caches.open(k);
      cached = cached.concat((await c.keys()).map((r) => r.url));
    }
    return { registered: !!reg, controlled: !!navigator.serviceWorker.controller, cached };
  });
  console.log('  service worker:', JSON.stringify(sw));
  check(sw.registered, 'the service worker registered on the live origin');
  check(sw.cached.some((u) => new URL(u).host === CDN_HOST && new URL(u).pathname === '/beluga_web.bc.js'),
    'and it cached the R2 runtime, so repeat visits skip the 24 MB');

  // 5. The server (server/, docs/PERSIST.md §5.7): sign-in configured with BOTH its id and its
  //    secret (start answers 503 without either), the sync API closed to anyone without a
  //    session, and none of the repository served as a file.
  const site = new URL(LIVE).origin;
  const hit = (p, init) => fetch(site + p, Object.assign({ redirect: 'manual' }, init));
  const me = await hit('/api/auth/me');
  const meBody = await me.json().catch(() => null);
  check(me.status === 200 && meBody && meBody.user === null, `the server answers: /api/auth/me says nobody is signed in (${me.status})`);
  const start = await hit('/api/auth/github/start');
  const to = start.headers.get('location') ? new URL(start.headers.get('location')) : null;
  check(start.status === 302 && to && to.origin + to.pathname === 'https://github.com/login/oauth/authorize',
    `sign-in sends the browser to GitHub, so its id and secret are both set (${start.status})`);
  check(to && /^Ov23/.test(to.searchParams.get('client_id') || '') && to.searchParams.get('redirect_uri') === site + '/api/auth/github/callback'
    && !to.searchParams.get('scope'), `with the live app, our callback and no scopes (${to && to.search.slice(0, 120)})`);
  const stateCookie = (start.headers.getSetCookie ? start.headers.getSetCookie() : []).find((c) => c.startsWith('__Host-bj_state='));
  check(!!stateCookie && /HttpOnly/.test(stateCookie) && /Secure/.test(stateCookie) && /SameSite=Lax/.test(stateCookie),
    'the one-time state rides in a __Host-, HttpOnly, Secure cookie');
  // The stored secret, without signing anyone in: GitHub checks the app's credentials before
  // the code, so a made-up code is refused as bad_verification_code only if the secret is right
  // (incorrect_client_credentials if not; the Worker passes GitHub's word back as the detail).
  const probeState = to ? to.searchParams.get('state') : '';
  const back = await hit('/api/auth/github/callback?code=probe-not-a-code&state=' + encodeURIComponent(probeState || ''),
    { headers: { cookie: stateCookie ? stateCookie.split(';')[0] : '' } });
  const landed = back.headers.get('location') || '';
  check(landed === '/?signin=failed&why=exchange&detail=bad_verification_code',
    `GitHub accepts the server's secret: a made-up code is refused as a bad code, not bad credentials (${landed})`);
  const heads = await hit('/api/sync/heads', { method: 'POST', headers: { 'content-type': 'application/json', origin: site }, body: '{"args":[]}' });
  check(heads.status === 401, `the sync API refuses a request without a session (${heads.status})`);
  const forged = await hit('/api/sync/heads', { method: 'POST', headers: { 'content-type': 'application/json', origin: site, 'x-beljar-account': 'u_anyone' }, body: '{"args":[]}' });
  check(forged.status === 401, `and the dev account header means nothing here (${forged.status})`);
  const cross = await hit('/api/auth/signout', { method: 'POST', headers: { origin: 'https://elsewhere.example' } });
  check(cross.status === 403, `another site cannot sign anyone out (${cross.status})`);
  // Devices and Delete account (plan v6 c3): deployed, and closed to nobody signed in and to other sites.
  const listed = await hit('/api/auth/sessions');
  const del = await hit('/api/auth/delete', { method: 'POST', headers: { 'content-type': 'application/json', origin: site }, body: '{}' });
  const delCross = await hit('/api/auth/delete', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://elsewhere.example' }, body: '{}' });
  check(listed.status === 401 && del.status === 401 && delCross.status === 403,
    `the devices list and Delete account are there, for the signed in only, never from another site (${listed.status}, ${del.status}, ${delCross.status})`);
  // What BelJar keeps (plan v6 c4): live at its short address.
  const privacy = await hit('/privacy');
  const privacyText = privacy.status === 200 ? await privacy.text() : '';
  check(/<title>What BelJar keeps<\/title>/.test(privacyText), `the page on what BelJar keeps is live at /privacy (${privacy.status})`);
  for (const p of ['/.git/config', '/.git/HEAD', '/wrangler.jsonc', '/server/worker.mjs', '/server/.dev.vars', '/package.json', '/AGENTS.md']) {
    const r = await hit(p);
    check(r.status === 404, `${p} is not served (${r.status})`);
  }
  // Signing in comes back to the page it started from, and to nowhere else.
  const cookieOf = (res, name) => (res.headers.getSetCookie ? res.headers.getSetCookie() : []).find((c) => c.startsWith(name + '='));
  const from = '/edit?p=p_01m3xq1ph808nx8xjd4jj1rhcx';
  const kept = cookieOf(await hit('/api/auth/github/start?return=' + encodeURIComponent(from)), '__Host-bj_return');
  check(!!kept && decodeURIComponent(kept.split(';')[0].split('=').slice(1).join('=')) === from && /HttpOnly/.test(kept) && /Secure/.test(kept),
    `sign-in remembers the page it was started from (${kept ? kept.split(';')[0] : 'no cookie'})`);
  const away = cookieOf(await hit('/api/auth/github/start?return=' + encodeURIComponent('https://elsewhere.example/')), '__Host-bj_return');
  check(!away || /Max-Age=0/.test(away), `and never an address on another site (${away ? away.split(';')[0] : 'no cookie'})`);
  // Signed out, the editor has no account button: signing in is home's, and the palette's.
  const quiet = await page.waitForFunction(() => window.Account && window.Account.available() && document.getElementById('btn-account').hidden, { timeout: 15000 })
    .then(() => true, () => false);
  check(quiet, 'the editor found the server too, and signed out shows no account button');

  console.log('  total wall:', Date.now() - t0, 'ms');
  if (consoleErrs.length) console.log('  console errors:', JSON.stringify(consoleErrs));
  if (failed.length) console.log('  failed requests:', JSON.stringify(failed));
} catch (e) {
  crash = e;
}
await finish(crash);
