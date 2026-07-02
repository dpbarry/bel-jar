// Visual probe: load the real app, mount a Harpoon-lab Session, feed it fabricated
// auto-solve states (solved + stuck), render, and screenshot each. Verifies the new
// auto-solve UX layout/colours in the real theme. Not a proof run — a render check.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const port = Number(process.env.SHOT_PORT || 8819);
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outDir = process.env.SHOT_OUT || path.join(root, 'scripts', '.shots');
fs.mkdirSync(outDir, { recursive: true });
execFileSync(process.execPath, ['scripts/build-editor.mjs'], { cwd: root, stdio: 'inherit' });

const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(root, p), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(port, r));

const puppeteer = (await import('../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default;
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', protocolTimeout: 120000, args: ['--window-size=900,900'], defaultViewport: { width: 900, height: 900, deviceScaleFactor: 2 } });

// A fabricated solved result mirroring dual_sym's real trace.
const solved = {
  complete: true,
  code: 'rec dual_sym : [ |- dual A A\'] -> [ |- dual A\' A] = fn f => ? ;',
  steps: [
    { move: 'intro', rationale: 'introduce the premises' },
    { move: 'split', rationale: 'case-split f into its 6 constructors' },
    { move: 'fill', rationale: 'D⊥ closes the D1 case' },
    { move: 'fill', rationale: 'D1 closes the D⊥ case' },
    { move: 'recurse', rationale: 'apply dual_sym to both sub-derivations' },
    { move: 'fill', rationale: 'D⅋ reassembles the swapped dual' },
    { move: 'recurse', rationale: 'apply dual_sym to both sub-derivations' },
    { move: 'fill', rationale: 'D⊗ reassembles the swapped dual' },
  ],
};
const stuck = {
  complete: false,
  steps: [
    { move: 'intro', rationale: 'introduce the premises' },
    { move: 'split', rationale: 'case-split on the typing derivation' },
    { move: 'invert', rationale: 'invert the second typing hypothesis' },
    { move: 'recurse', rationale: 'apply the induction hypothesis on the function' },
  ],
  stuck: { reason: 'no-move', goal: "[ |- eq (arr A1 B1) T']" },
};

try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => !!(window.FloatingWindow && window.BelJarEditor), { timeout: 30000 });

  const shoot = async (state, name) => {
    await page.evaluate((st) => {
      document.querySelectorAll('.__shot').forEach((n) => n.remove());
      // Minimal Session shim: we only exercise renderNativeAuto + render's routing.
      const wrap = document.createElement('div');
      wrap.className = '__shot harpoon-lab-window';
      wrap.style.cssText = 'position:fixed;left:30px;top:30px;width:440px;background:var(--panel-bg,#1b1b22);border:1px solid var(--chrome-divider,#333);border-radius:10px;overflow:hidden;z-index:99999;';
      const body = document.createElement('div');
      body.className = 'harpoon-lab';
      wrap.appendChild(body);
      document.body.appendChild(wrap);
      // Reach the Session prototype via the module's closure is not exposed; instead
      // replicate the render by calling the same DOM builders through a tiny stub that
      // borrows the real methods off a constructed instance is not possible → we call
      // the exported open path is heavy. Simplest: hand-render using the same classes
      // the code emits, so the SCREENSHOT reflects the real CSS. (Structure copied 1:1
      // from renderNativeAuto.)
      const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
      const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
      const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';
      const STOP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>';
      const box = el('div', 'harpoon-lab-auto is-' + (st.complete ? 'solved' : 'stuck'));
      const head = el('div', 'harpoon-lab-auto-head');
      const badge = el('span', 'harpoon-lab-auto-badge ' + (st.complete ? 'is-solved' : 'is-stuck'));
      badge.innerHTML = st.complete ? CHECK : STOP;
      head.appendChild(badge);
      const hc = el('div', 'harpoon-lab-auto-head-copy');
      hc.appendChild(el('span', 'harpoon-lab-auto-title', st.complete ? 'Proof found' : 'Search stopped'));
      hc.appendChild(el('span', 'harpoon-lab-auto-sub', st.complete ? (st.steps.length + ' steps') : 'No tactic available'));
      head.appendChild(hc);
      box.appendChild(head);
      const trail = el('ol', 'harpoon-lab-auto-trail');
      st.steps.forEach((s, i) => {
        const li = el('li', 'harpoon-lab-auto-step'); li.style.setProperty('--i', String(i));
        li.appendChild(el('span', 'harpoon-lab-auto-node'));
        const cp = el('div', 'harpoon-lab-auto-step-copy');
        cp.appendChild(el('span', 'harpoon-lab-auto-move move-' + s.move, s.move));
        cp.appendChild(el('span', 'harpoon-lab-auto-why', s.rationale));
        li.appendChild(cp); trail.appendChild(li);
      });
      box.appendChild(trail);
      if (!st.complete && st.stuck) {
        const sw = el('div', 'harpoon-lab-auto-stuck');
        sw.appendChild(el('span', 'harpoon-lab-auto-stuck-label', 'Open goal'));
        sw.appendChild(el('div', 'harpoon-hole-goal harpoon-lab-auto-stuck-goal', st.stuck.goal));
        box.appendChild(sw);
      }
      if (st.complete) {
        const place = el('button', 'harpoon-lab-place harpoon-lab-auto-place');
        place.style.setProperty('--i', String(st.steps.length));
        const ck = el('span', 'harpoon-lab-place-arrow'); ck.innerHTML = ARROW; place.appendChild(ck);
        const co = el('span', 'harpoon-lab-place-copy');
        co.appendChild(el('span', 'harpoon-lab-place-title', 'Place the proof'));
        co.appendChild(el('span', 'harpoon-lab-place-sub', 'Swaps the hole for the proven term · re-checks clean'));
        place.appendChild(co); box.appendChild(place);
      }
      body.appendChild(box);
    }, state);
    await new Promise((r) => setTimeout(r, 900)); // let the cascade settle
    const clip = await page.evaluate(() => { const n = document.querySelector('.__shot'); const r = n.getBoundingClientRect(); return { x: r.x - 12, y: r.y - 12, width: r.width + 24, height: r.height + 24 }; });
    await page.screenshot({ path: path.join(outDir, name), clip });
    console.log('wrote', name);
  };

  await shoot(solved, 'auto-solved.png');
  await shoot(stuck, 'auto-stuck.png');
} finally {
  await browser.close();
  server.close();
}
