// The boot every probe was carrying its own copy of.
//
// Six probes each opened a static server, launched Chrome, waited for the app,
// and defined the same `check()` — about forty identical lines apiece, and three
// separate Chrome boots for what is really one subject. This is that, once.
//
// ⛔ Nothing app-specific belongs here. A helper that knows about the status
// strip or the vim maps goes in the probe that uses it; this file knows only how
// to get a BelJar page in front of you and how to report a result.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.wasm': 'application/wasm',
};

/**
 * Serve the repo, boot Chrome, open BelJar, and hand back the page plus the
 * helpers every probe needs.
 *
 * `waitFor` is a page function that must go true before the probe starts —
 * each probe names the globals it actually depends on, so a probe for the
 * command layer does not silently wait on Harpoon.
 */
export async function openProbe(opts = {}) {
  const root = process.cwd();
  const port = Number(process.env.PROBE_PORT || opts.port || 8871);
  const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const outDir = path.join(root, 'scripts', '.shots');
  fs.mkdirSync(outDir, { recursive: true });

  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    fs.readFile(path.join(root, p), (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      // The editor's worker needs cross-origin isolation, same as production.
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise((r) => server.listen(port, r));

  const puppeteer = (await import('../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default;
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    protocolTimeout: 120000,
    args: ['--window-size=1200,900'],
    defaultViewport: { width: 1200, height: 900, deviceScaleFactor: opts.scale || 2 },
  });

  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    opts.waitFor || (() => window.Commands && window.StatusStrip),
    { timeout: 60000 },
  );
  await new Promise((r) => setTimeout(r, opts.settle == null ? 2500 : opts.settle));

  const fails = [];
  let ran = 0;
  const check = (ok, msg, extra) => {
    ran += 1;
    if (ok) { console.log('  ok   ' + msg); return true; }
    fails.push(msg);
    console.log('  FAIL ' + msg + (extra ? '\n       ' + extra : ''));
    return false;
  };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const type = async (text, ms) => { await page.keyboard.type(text, { delay: 14 }); await wait(ms || 160); };
  const key = async (k, ms) => { await page.keyboard.press(k); await wait(ms || 120); };
  /** `press(k, { shift: true })` is not a thing — the modifier has to be held. */
  const chord = async (mods, code, ms) => {
    for (const m of mods) await page.keyboard.down(m);
    await page.keyboard.press(code);
    for (const m of mods.slice().reverse()) await page.keyboard.up(m);
    await wait(ms || 140);
  };
  const esc = async () => key('Escape');
  const shot = (name) => page.screenshot({ path: path.join(outDir, name + '.png') });

  /**
   * Switch keymap style. ⚠ The most expensive thing a probe does — the editor
   * tears down and rebuilds its keymap — so batch everything one style needs
   * together rather than flipping per check.
   */
  const setStyle = async (style) => {
    await page.evaluate((v) => {
      Persist.writeStoredKeymapStyle(v);
      Persist.applyStoredEditorChrome?.();
      BelEditor.applyEditorPrefs?.();
    }, style);
    await wait(1300);
    await page.click('.cm-content');
  };

  /** Replace the document and put the caret somewhere known. */
  const load = async (src, at) => page.evaluate((s, pos) => {
    const v = CurrentEditor.getView();
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: s }, selection: { anchor: pos || 0 } });
    v.focus();
  }, src, at || 0);

  const caret = () => page.evaluate(() => {
    const v = CurrentEditor.getView();
    const s = v.state.selection.main;
    const line = v.state.doc.lineAt(s.head);
    return {
      doc: v.state.doc.toString(),
      head: s.head,
      line: line.number,
      col: s.head - line.from,
      sel: s.to - s.from,
    };
  });

  /**
   * ⛔ `err` is not optional politeness. The first version reported "ALL OK"
   * for a probe that had thrown halfway through — `finish` ran from `finally`,
   * saw an empty `fails`, and declared success over a corpse. A probe that
   * cannot fail loudly is worse than no probe.
   */
  const finish = async (label, err) => {
    check(!err, 'the probe ran to completion', err ? String(err && err.stack || err) : '');
    check(errors.length === 0, 'no page errors throughout', errors.slice(0, 3).join(' | '));
    await browser.close();
    server.close();
    if (fails.length) {
      console.log(`\nFAILED (${fails.length}):`);
      for (const f of fails) console.log(' - ' + f);
      process.exit(1);
    }
    console.log(`\n${label}: ALL OK  (${ran} checks)`);
  };

  return { page, check, fails, errors, wait, type, key, chord, esc, shot, setStyle, load, caret, finish, outDir, browser, server };
}
