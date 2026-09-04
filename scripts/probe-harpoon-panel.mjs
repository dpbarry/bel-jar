// VISUAL + BEHAVIOURAL probe for the Harpoon holes panel — the project-wide list of open
// goals, one card each.
//
// The card carries three pieces of information in a fixed shape: the DECLARATION the hole
// belongs to (left of the header), WHERE it is (right of the header), and the GOAL TYPE
// beneath. The type is the part that runs long, and it must never wrap: a card is one line of
// type tall whatever the goal, fading off the right edge and sliding to its end on hover.
//
// A screenshot alone is not enough here. The slide distance is measured in JS from real
// layout, so this asserts on the measured geometry too: a card whose type overruns must be
// marked clipped and carry a NEGATIVE `--slide`, and a card whose type fits must carry
// neither. Those are exactly the states a static review cannot tell apart.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const port = Number(process.env.PROBE_PORT || 8863);
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outDir = path.join(root, 'scripts', '.shots');
fs.mkdirSync(outDir, { recursive: true });
execFileSync(process.execPath, ['scripts/build-editor.mjs'], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/build-shell.mjs'], { cwd: root, stdio: 'inherit' });

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
const browser = await puppeteer.launch({
  executablePath: chrome, headless: 'new', protocolTimeout: 590000,
  args: ['--window-size=1100,1000'], defaultViewport: { width: 1100, height: 1000, deviceScaleFactor: 2 },
});

// One short type and one deliberately long one, so both sides of the clip boundary are on
// screen at once. `long_running_theorem_name` also exercises the header ellipsis.
const FILE_A = [
  'LF tp : type =',
  '| base : tp',
  '| arr : tp -> tp -> tp',
  ';',
  '',
  'LF eq : tp -> tp -> type =',
  '| refl : eq A A',
  ';',
  '',
  'rec tp_refl : {A : [ |- tp]} [ |- eq A A] =',
  '? ;',
  '',
  'rec a_long_running_theorem_name_for_ellipsis :',
  '  {A : [ |- tp]} {B : [ |- tp]} {C : [ |- tp]}',
  '  [ |- eq A A] -> [ |- eq B B] -> [ |- eq C C] -> [ |- eq (arr A B) (arr A B)] =',
  '? ;',
  '',
].join('\n');

const FILE_B = [
  'LF nat : type =',
  '| z : nat',
  '| s : nat -> nat',
  ';',
  '',
  'rec other_file_theorem : [ |- nat] -> [ |- nat] =',
  '? ;',
  '',
].join('\n');

const fails = [];
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails.push(msg); };

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => { fails.push('page error: ' + e.message); console.log('  PAGEERROR ' + e.message); });
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => !!(window.BelJarEditor && window.BelugaClient && window.Harpoon && window.HarpoonPanel),
    { timeout: 40000 });

  // The ACTIVE file is seeded through the editor, which is the user's own path and the only
  // one that makes the checker produce live goal types. A SECOND file is seeded into storage
  // only: the panel lists holes across the whole project, and naming their declarations must
  // work from stored text without a live view.
  await page.evaluate((a, b) => {
    const P = window.Persist;
    const id = P.createFile('probe/other.bel');
    P.setFileText(id, b);
    const v = window.CurrentEditor.getView();
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: a } });
  }, FILE_A, FILE_B);
  await page.click('#btn-harpoon');
  await page.waitForSelector('.harpoon-panel-hole', { timeout: 40000 });
  // Goal types arrive from the checker; wait for at least one card to carry a real type.
  await page.waitForFunction(
    () => !!document.querySelector('.harpoon-panel-hole .harpoon-hole-goal .bel-type'),
    { timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1200));
  await page.evaluate(() => window.HarpoonPanel.refresh());
  await new Promise((r) => setTimeout(r, 600));

  const cards = await page.evaluate(() => Array.from(document.querySelectorAll('.harpoon-panel-hole')).map((row) => {
    const win = row.querySelector('.harpoon-hole-goal');
    const maskEl = row.querySelector('.harpoon-hole-goal-mask');
    const track = row.querySelector('.harpoon-hole-goal-track');
    const kw = row.querySelector('.harpoon-hole-decl-kw');
    const nm = row.querySelector('.harpoon-hole-decl-name');
    const head = row.querySelector('.harpoon-panel-hole-head');
    const loc = row.querySelector('.harpoon-hole-loc');
    const cs = maskEl && getComputedStyle(maskEl);
    return {
      kw: kw && kw.textContent,
      name: nm && nm.textContent,
      kwColoured: !!(kw && kw.classList.contains('bel-hl-keyword')),
      headLines: head ? Math.round(head.getBoundingClientRect().height) : 0,
      // The header must sit decl-left / location-right, with no overlap between them.
      declRight: nm ? Math.round(nm.getBoundingClientRect().right) : 0,
      locLeft: loc ? Math.round(loc.getBoundingClientRect().left) : 0,
      clipped: !!(win && win.classList.contains('is-clipped')),
      slide: win ? win.style.getPropertyValue('--slide').trim() : '',
      slideMs: win ? win.style.getPropertyValue('--slide-ms').trim() : '',
      masked: !!(cs && cs.maskImage && cs.maskImage !== 'none'),
      bandMasked: !!(win && getComputedStyle(win).maskImage !== 'none'),
      bandBg: win ? getComputedStyle(win).backgroundImage !== 'none' : false,
      over: maskEl && track ? track.scrollWidth - maskEl.clientWidth : 0,
      winH: win ? Math.round(win.getBoundingClientRect().height) : 0,
      wrapped: !!(win && track && track.getBoundingClientRect().height > win.clientHeight + 2),
    };
  }));

  ok(cards.length >= 3, `the panel lists holes from both files (${cards.length})`);
  ok(cards.some((c) => c.name === 'other_file_theorem'),
    'a hole in a file that was never opened is still named by its declaration');

  // 1 ── the header names the obligation, in Beluga's own colours.
  ok(cards.every((c) => c.kw === 'rec'), 'every card names its declaration keyword');
  ok(cards.every((c) => c.kwColoured), 'the keyword uses the shared bel-hl palette');
  ok(cards.some((c) => c.name === 'tp_refl'), 'the short theorem is named on its card');
  ok(cards.some((c) => (c.name || '').startsWith('a_long_running_theorem')),
    'the long theorem is named on its card');

  // 2 ── the strip is one line tall and the two fields never collide.
  const oneLine = cards.every((c) => c.headLines > 0 && c.headLines < 30);
  ok(oneLine, `the header strip stays one line tall (${cards.map((c) => c.headLines).join(', ')}px)`);
  ok(cards.every((c) => c.declRight <= c.locLeft + 1),
    'the declaration never overlaps the location');

  // 3 ── the type never wraps, whatever its length.
  ok(cards.every((c) => !c.wrapped), 'no card wraps its goal type');
  const heights = cards.map((c) => c.winH);
  ok(new Set(heights).size === 1,
    `every card is the same height regardless of type length (${heights.join(', ')}px)`);

  // 4 ── clipping is measured, not assumed. A card that overruns fades and can slide; a card
  //      that fits does neither, so short types are not gratuitously masked.
  const longC = cards.find((c) => (c.name || '').startsWith('a_long_running_theorem'));
  const shortC = cards.find((c) => c.name === 'tp_refl');
  if (longC) {
    ok(longC.over > 1, `the long type really does overrun its window (${longC.over}px)`);
    ok(longC.clipped, 'the overrunning card is marked clipped');
    ok(longC.masked, 'the overrunning card fades at its edge');
    ok(!longC.bandMasked && longC.bandBg,
      'the fade is on the text layer only: the goal band still reaches the card edge');
    const px = parseFloat(longC.slide);
    ok(px < 0, `its slide runs leftward (${longC.slide})`);
    ok(Math.abs(Math.abs(px) - longC.over) <= 1,
      'the slide travels exactly the overrun, so the far end lands flush');
    const ms = parseFloat(longC.slideMs);
    ok(ms >= 500 && ms <= 2800, `the slide is paced within bounds (${longC.slideMs})`);
  } else {
    ok(false, 'the long-type card was found');
  }
  if (shortC && shortC.over <= 1) {
    ok(!shortC.clipped, 'a type that fits is not marked clipped');
    ok(!shortC.masked, 'a type that fits is not faded');
  }

  // The first-run library hint anchors near the sidebar and would sit over the top card.
  await page.evaluate(() => { if (window.Hint && window.Hint.dismiss) window.Hint.dismiss('library'); });
  await new Promise((r) => setTimeout(r, 400));
  const panel = await page.$('#harpoon-panel');
  await panel.screenshot({ path: path.join(outDir, 'harpoon-panel-cards.png') });
  console.log('  shot → scripts/.shots/harpoon-panel-cards.png');

  // One card on its own, big enough to judge the right-edge fade and the header rhythm.
  const longCard = await page.evaluateHandle(() => Array.from(
    document.querySelectorAll('.harpoon-panel-hole'))
    .find((r) => r.querySelector('.harpoon-hole-goal.is-clipped')));
  if (longCard) {
    await longCard.asElement().screenshot({ path: path.join(outDir, 'harpoon-panel-card.png') });
    console.log('  shot → scripts/.shots/harpoon-panel-card.png');
  }

  // 5 ── hovering slides the track to the end of the type.
  if (longC) {
    const before = await page.evaluate(() => {
      const w = document.querySelector('.harpoon-hole-goal.is-clipped .harpoon-hole-goal-track');
      return w ? getComputedStyle(w).transform : null;
    });
    // The list re-renders as goals certify, and a rebuild under the cursor drops :hover
    // until the pointer moves again. Hover, let it settle, then hover once more so the read
    // below is of a card that is genuinely under the cursor right now.
    await page.hover('.harpoon-panel-hole:has(.harpoon-hole-goal.is-clipped)');
    await new Promise((r) => setTimeout(r, 400));
    await page.hover('.harpoon-panel-hole:has(.harpoon-hole-goal.is-clipped) .harpoon-hole-goal');
    await new Promise((r) => setTimeout(r, Math.max(1600, (parseFloat(longC.slideMs) || 2000) + 500)));
    const after = await page.evaluate(() => {
      const mask = document.querySelector('.harpoon-hole-goal.is-clipped .harpoon-hole-goal-mask');
      const track = mask && mask.firstElementChild;
      if (!mask || !track) return null;
      const mr = mask.getBoundingClientRect();
      const tr = track.getBoundingClientRect();
      return {
        t: getComputedStyle(track).transform,
        mask: getComputedStyle(mask).maskImage,
        edgeAlphaLeft: parseFloat(getComputedStyle(mask).getPropertyValue('--hole-edge-alpha-left')),
        edgeAlphaRight: parseFloat(getComputedStyle(mask).getPropertyValue('--hole-edge-alpha-right')),
        gap: Math.round(mr.right - tr.right),
      };
    });
    const dx = after && after.t && after.t !== 'none' ? parseFloat(after.t.split(',')[4]) : 0;
    ok(before === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(before || ''),
      'the track rests at its start');
    ok(dx < -4, `hovering slides the track leftward to reveal the tail (${Math.round(dx)}px)`);
    ok(Math.abs(dx - parseFloat(longC.slide)) <= 2,
      `the live transform matches the measured slide (${Math.round(dx)} vs ${longC.slide})`);
    ok(after && Math.abs(after.gap) <= 2,
      `the tail lands flush with the viewport (${after && after.gap}px remaining)`);
    ok(after && after.mask && after.mask !== 'none',
      'the mask stays on — both edges dissolve rather than popping off');
    ok(after && after.edgeAlphaLeft <= 0.05,
      `the left fade is fully in by the end (${after && after.edgeAlphaLeft})`);
    ok(after && after.edgeAlphaRight >= 0.95,
      `the right fade has lifted by the end (${after && after.edgeAlphaRight})`);
    await panel.screenshot({ path: path.join(outDir, 'harpoon-panel-hover.png') });
    console.log('  shot → scripts/.shots/harpoon-panel-hover.png');
  }

  // ── The proof surface reached from a card ───────────────────────────────────────
  // Clicking a card opens the lab on that hole. This is the REAL prepare path, the only
  // one that carries `prep.declKey`, so it is the only place the corner label can be
  // checked honestly: a probe that mounts the surface over a synthetic prep shows a bare
  // name whether or not the keyword is wired.
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.harpoon-panel-hole'));
    const target = rows.find((r) => (r.textContent || '').includes('tp_refl')) || rows[0];
    target.click();
  });
  await page.waitForSelector('.harpoon-lab-auto-goal-name', { timeout: 90000 });
  const corner = await page.evaluate(() => {
    const n = document.querySelector('.harpoon-lab-auto-goal-name');
    const kw = n && n.querySelector('.harpoon-lab-goal-decl-kw');
    const nm = n && n.querySelector('.harpoon-lab-goal-decl-name');
    return {
      kw: kw && kw.textContent,
      name: nm && nm.textContent,
      coloured: !!(kw && kw.classList.contains('bel-hl-keyword')),
      mono: n ? /mono|Mono|JetBrains|Consolas/i.test(getComputedStyle(n).fontFamily) : false,
      lines: n ? Math.round(n.getBoundingClientRect().height) : 0,
    };
  });
  ok(corner.kw === 'rec', `the corner label carries the declaration keyword (${corner.kw})`);
  ok(corner.name === 'tp_refl', `the corner label carries the name (${corner.name})`);
  ok(corner.coloured, 'the corner keyword is syntax-coloured, not plain muted text');
  ok(corner.mono, 'the corner label is set in the mono face, so it reads as source');
  ok(corner.lines > 0 && corner.lines < 30, `the corner label stays on one line (${corner.lines}px)`);

  // The surface re-renders as the checker settles, which detaches any handle taken before
  // it finishes. Let it come to rest, then query and shoot in one go.
  await new Promise((r) => setTimeout(r, 2500));
  const hero = await page.$('.harpoon-lab-auto-goal');
  if (hero) {
    await hero.screenshot({ path: path.join(outDir, 'harpoon-goal-hero.png') });
    console.log('  shot → scripts/.shots/harpoon-goal-hero.png');
  }

  // ── The Orca glyph ──────────────────────────────────────────────────────────────
  // Blown up well past its rendered size: at 17px a wrong curve reads as a smudge, and the
  // whole point of the change was that the old two straight rules under the fin made it
  // read as a boat rather than a dorsal fin above water.
  const glyph = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      /orca/i.test(b.className + ' ' + (b.getAttribute('data-tooltip') || '') + ' ' + b.textContent));
    const svg = btn && btn.querySelector('svg');
    if (!svg) return null;
    const box = document.createElement('div');
    box.id = '__glyphbox';
    box.style.cssText = 'position:fixed;left:20px;top:20px;width:200px;height:200px;'
      + 'display:grid;place-items:center;background:#14161a;z-index:99999;border-radius:12px';
    const big = svg.cloneNode(true);
    big.style.cssText = 'width:160px;height:160px;color:#8ab4f8';
    box.appendChild(big);
    // Also at the size it actually ships at. A curve that reads at 160px can still smudge
    // into a blob at 17px, and 17px is the only size a user ever sees.
    const real = svg.cloneNode(true);
    real.style.cssText = 'width:17px;height:17px;color:#8ab4f8;position:absolute;right:10px;bottom:8px';
    box.appendChild(real);
    document.body.appendChild(box);
    return { paths: Array.from(svg.querySelectorAll('path')).map((n) => n.getAttribute('d')) };
  });
  if (glyph) {
    ok(glyph.paths.length === 2, `the glyph is a fin and one wave, nothing more (${glyph.paths.length} paths)`);
    ok(glyph.paths.some((d) => /q|t/i.test(d || '')),
      'the line under the fin is a curve, not a straight rule');
    ok(!glyph.paths.some((d) => /^M[\d.]+ [\d.]+h[\d.]+$/i.test((d || '').trim())),
      'no straight horizontal rule survives under the fin');
    const gbox = await page.$('#__glyphbox');
    await gbox.screenshot({ path: path.join(outDir, 'harpoon-orca-glyph.png') });
    console.log('  shot → scripts/.shots/harpoon-orca-glyph.png');
    await page.evaluate(() => document.getElementById('__glyphbox').remove());
  } else {
    ok(false, 'the Orca button was found on the proof surface');
  }

  // The derivation only exists once the proof has steps, so run Orca on this hole first.
  // This is also the surface state the graph is actually read in: after a search.
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      /orca/i.test(b.className + ' ' + (b.getAttribute('data-tooltip') || '') + ' ' + b.textContent));
    if (btn) btn.click();
  });
  await page.waitForFunction(
    () => !!document.querySelector('.harpoon-deriv'),
    { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1500));

  // ── The derivation node graph ───────────────────────────────────────────────────
  // Reached from the same surface via the List⇄Tree toggle, and again in the pop-out
  // explorer where it gets its detail rail. Both are captured: the compact graph has to
  // survive being small, and the roomy one has to fill without stranding the rail.
  const toTree = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find((b) => (b.textContent || '').trim() === 'Tree');
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (toTree) {
    await page.waitForSelector('.hpt-host', { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1200));
    const compact = await page.$('.harpoon-deriv, .hpt-panel');
    if (compact) {
      await compact.screenshot({ path: path.join(outDir, 'harpoon-graph-compact.png') });
      console.log('  shot → scripts/.shots/harpoon-graph-compact.png');
    }
  } else {
    ok(false, 'the List/Tree toggle was found');
  }

  const popped = await page.evaluate(() => {
    const btn = document.querySelector('.harpoon-deriv-popout');
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (popped) {
    await new Promise((r) => setTimeout(r, 1600));
    const geom = await page.evaluate(() => {
      const panel = document.querySelector('.hpt-panel.is-roomy') || document.querySelector('.hpt-panel');
      const split = document.querySelector('.hpt-split');
      const treePane = document.querySelector('.hpt-split-tree');
      const rail = document.querySelector('.hpt-split-rail');
      const nodes = document.querySelectorAll('.hpt-node');
      const r = (n) => (n ? n.getBoundingClientRect() : null);
      const pr = r(panel); const tr = r(treePane); const rr = r(rail);
      return {
        hasPanel: !!panel, hasSplit: !!split, nodes: nodes.length,
        panelW: pr ? Math.round(pr.width) : 0,
        treeW: tr ? Math.round(tr.width) : 0,
        railW: rr ? Math.round(rr.width) : 0,
        overlap: tr && rr ? Math.round(tr.right - rr.left) : 0,
        offscreen: Array.from(nodes).filter((n) => {
          const b = n.getBoundingClientRect();
          return b.right < 0 || b.bottom < 0 || b.left > innerWidth || b.top > innerHeight;
        }).length,
      };
    });
    console.log('  GEOM ' + JSON.stringify(await page.evaluate(() => { const h=document.querySelector('.hpt-split-tree .hpt-host'); const sv=h&&h.querySelector('svg'); return { hostH: h&&h.clientHeight, hostW: h&&h.clientWidth, vb: sv&&sv.getAttribute('viewBox'), svgH: sv&&sv.clientHeight, par: sv&&sv.getAttribute('preserveAspectRatio') }; })));
    ok(geom.hasPanel, 'the pop-out explorer opens');
    ok(geom.nodes > 0, `the graph draws its nodes (${geom.nodes})`);
    ok(geom.offscreen === 0, `no node is stranded off screen (${geom.offscreen})`);
    if (geom.hasSplit) {
      ok(geom.overlap <= 1, `the tree pane and the detail rail do not overlap (${geom.overlap}px)`);
      ok(geom.railW > 120, `the detail rail has usable width (${geom.railW}px)`);
    }
    await page.screenshot({ path: path.join(outDir, 'harpoon-graph-explorer.png') });
    console.log('  shot → scripts/.shots/harpoon-graph-explorer.png');
  } else {
    ok(false, 'the pop-out button was found');
  }
} finally {
  await browser.close();
  server.close();
}

console.log(fails.length ? `\nprobe-harpoon-panel: ${fails.length} FAILED` : '\nprobe-harpoon-panel: ALL OK');
process.exit(fails.length ? 1 : 0);
