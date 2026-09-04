// END-TO-END probe for Manual Harpoon: drives the REAL Beluga checker in the real
// app, exercises the reducer (manualState → movesAt → applyMove → undo), then
// mounts the real manual SURFACE over that state and drives it — skeleton state,
// the background verification sweep, expand/collapse, and apply. Screenshots
// verify layout; the clicks and the geometry assertions verify it is alive and
// that nothing overlaps (a screenshot review once passed a click-dead panel).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const port = Number(process.env.PROBE_PORT || 8862);
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
  args: ['--window-size=900,1000'], defaultViewport: { width: 900, height: 1000, deviceScaleFactor: 2 },
});

const PRELUDE = [
  'LF tp : type =', '| base : tp', '| arr : tp -> tp -> tp', ';',
  'LF eq : tp -> tp -> type =', '| refl : eq A A', ';',
].join('\n');
const DECL = ['rec tp_refl : {A : [ |- tp]} [ |- eq A A] =', '/ total 1 /', '?', ';'].join('\n');
const CODE = `${PRELUDE}\n\n${DECL}\n`;

const fails = [];
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails.push(msg); };

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => { fails.push('page error: ' + e.message); console.log('  PAGEERROR ' + e.message); });
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => !!(window.BelJarEditor && window.BelugaClient && window.Harpoon),
    { timeout: 40000 });


  // The panel is TWO segments and their order is a rule, not an accident:
  //   [goal + banners]  — what is true right now
  //   [bar + state + work + derivation] — the bar HEADS this, never floats
  //     between banners.
  const segmentOrder = () => page.evaluate(() => {
    const box = document.querySelector('.__probe .harpoon-lab-manual');
    if (!box) return null;
    const kind = (n) => {
      if (n.classList.contains('harpoon-lab-auto-goal')) return 'goal';
      if (n.classList.contains('harpoon-lab-bar')) return 'bar';
      if (n.classList.contains('harpoon-lab-banner')) return 'banner';
      if (n.classList.contains('harpoon-lab-moves')) return 'tactics';
      if (n.classList.contains('harpoon-deriv') || n.classList.contains('harpoon-reel')) return 'derivation';
      if (n.classList.contains('harpoon-lab-orca-band')) return 'orca';
      return null;
    };
    return [...box.children].map(kind).filter(Boolean);
  });
  const orderOk = (seq) => {
    if (!seq || !seq.length) return false;
    if (seq[0] !== 'goal') return false;
    const bar = seq.indexOf('bar');
    if (bar === -1) return true;                     // no bar in this phase
    const lastBanner = seq.lastIndexOf('banner');
    if (lastBanner > bar) return false;              // a banner below the bar
    // and nothing from the working segment may precede the bar
    return !seq.slice(0, bar).some((k) => k === 'tactics' || k === 'derivation' || k === 'orca');
  };

  // ── Part 1: the reducer against the REAL checker ───────────────────────────
  console.log('\n[1] reducer vs. real Beluga');
  const r1 = await page.evaluate(async (code, decl) => {
    const ed = window.BelJarEditor;
    const cl = window.BelugaClient;
    const oracle = (c) => (cl.checkResultForProver ? cl.checkResultForProver(c) : cl.checkResult(c));
    const thm = ed.theoremUnderProof(decl);
    await cl.beginProverSession();
    await cl.loadProverChecker(code);
    const base = await oracle(code);
    if (!base || !base.ok) return { err: 'baseline check failed: ' + (base && base.output || '').slice(0, 400) };
    const s0 = ed.manualState(code, thm, base.output);
    const moves = ed.movesAt(s0, thm);
    if (!moves.length) return { err: 'no moves offered at the initial hole' };
    const applied = await ed.applyMove(s0, moves[0], oracle, thm);
    const out = {
      holes0: s0.holes.length,
      goal0: (ed.focusHole(s0) || {}).goal,
      moveKinds: [...new Set(moves.map((m) => m.kind))],
      moveCount: moves.length,
      firstKind: moves[0].kind,
      applied: applied.ok,
      err: applied.ok ? null : applied.error,
    };
    if (applied.ok) {
      out.codeGrew = applied.state.code.length !== s0.code.length;
      out.steps = applied.state.steps.length;
      out.stepMove = applied.state.steps[0].move;
      out.stepLead = applied.state.steps[0].lead;
      out.canUndo = ed.manualCanUndo(applied.state);
      const back = ed.manualUndo(applied.state);
      out.undoRestores = back.code === s0.code && back.steps.length === 0;
      try {
        const model = window.HarpoonTree.buildModel({
          steps: applied.state.steps, complete: false, name: thm.name, goalType: out.goal0,
        });
        out.treeOk = !!(model && model.children);
      } catch (e) { out.treeErr = e.message; }
    }
    return out;
  }, CODE, DECL);

  if (r1.err && r1.holes0 === undefined) { ok(false, 'reducer probe: ' + r1.err); }
  else {
    ok(r1.holes0 === 1, `one hole at the start (got ${r1.holes0})`);
    ok(!!r1.goal0, `the focus hole has a real goal: ${r1.goal0}`);
    ok(r1.moveCount > 0, `the engine offers ${r1.moveCount} moves [${r1.moveKinds.join(', ')}]`);
    ok(r1.applied === true, `the top-ranked move (${r1.firstKind}) certified and applied`);
    ok(r1.codeGrew === true, 'the working program changed');
    ok(r1.steps === 1, `one step recorded (${r1.stepMove}: ${r1.stepLead})`);
    ok(r1.undoRestores === true, 'undo restores the prior program exactly');
    ok(r1.treeOk === true, 'HarpoonTree.buildModel accepts a manual step');
  }

  // ── Part 2a: the LOADING skeleton — full chrome, nothing pops in ───────────
  console.log('\n[2] the manual surface');
  const mount = await page.evaluate(async (code, decl) => {
    const ed = window.BelJarEditor;
    const cl = window.BelugaClient;
    const oracle = (c) => (cl.checkResultForProver ? cl.checkResultForProver(c) : cl.checkResult(c));
    const thm = ed.theoremUnderProof(decl);
    const base = await oracle(code);
    let st = ed.manualState(code, thm, base.output);
    // Advance one step so the list carries a realistic spread of tactic kinds.
    const first = ed.movesAt(st, thm);
    const adv = await ed.applyMove(st, first[0], oracle, thm);
    if (adv.ok) st = adv.state;

    document.querySelectorAll('.__probe').forEach((n) => n.remove());
    const host = document.createElement('div');
    host.className = '__probe harpoon-lab-window';
    host.style.cssText = 'position:fixed;left:24px;top:24px;width:440px;max-height:940px;overflow:auto;'
      + 'background:var(--chrome-bg-panel,#1b1b22);border:1px solid var(--chrome-divider,#333);'
      + 'border-radius:10px;z-index:99999;';
    const body = document.createElement('div');
    body.className = 'harpoon-lab harpoon-lab--panel';
    host.appendChild(body);
    document.body.appendChild(host);

    const S = window.Harpoon._Session;
    const sess = new S(null, 0, 0, { kind: 'panel' });
    sess.bodyEl = body;
    sess.thm = thm;
    sess.prep = { name: thm.name };
    sess.manual = {
      phase: 'loading', state: null, declName: thm.name,
      sourceGoalType: (thm.compType && thm.compType.raw) || '',
      priorBinders: [], busy: false,
    };
    window.__probeSession = sess;
    window.__probeReady = st;
    sess.render();
    return {
      skels: body.querySelectorAll('.harpoon-skel').length,
      skelRows: body.querySelectorAll('.harpoon-lab-move.is-skeleton').length,
      orcaInSkeleton: !!body.querySelector('.harpoon-lab-orca'),
      goalBands: body.querySelectorAll('.harpoon-lab-auto-goal').length,
      height: body.getBoundingClientRect().height,
    };
  }, CODE, DECL);
  ok(mount.skels > 0, `loading renders ${mount.skels} skeleton fills`);
  ok(mount.skelRows === 3, `three skeleton tactic rows hold the list geometry (${mount.skelRows})`);
  ok(mount.orcaInSkeleton, 'Orca is present during loading — chrome does not pop in');
  ok(mount.goalBands === 1,
    `exactly one goal band during loading — the known type shows for real (${mount.goalBands})`);
  await page.screenshot({ path: path.join(outDir, 'manual-harpoon-loading.png') });
  console.log('  shot → scripts/.shots/manual-harpoon-loading.png');

  // ── Part 2b: the real state, with the REAL verification sweep ──────────────
  const surf = await page.evaluate(async () => {
    const s = window.__probeSession;
    s.manual.phase = 'ready';
    s.manual.state = window.__probeReady;
    s.render();
    s.sweepCandidates();
    const body = s.bodyEl;
    for (let i = 0; i < 400; i += 1) {
      if (!body.querySelector('.harpoon-lab-move.is-checking')
          && body.querySelectorAll('.harpoon-lab-move.is-verified, .harpoon-lab-move.is-rejected').length) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const rows = [...body.querySelectorAll('.harpoon-lab-move')];
    // The header must never reach into the footer strip, and the term preview
    // must never run under the verdict pip. These are the two collisions the
    // previous layout actually produced.
    // A rejected row collapses to a single INLINE line (header beside footer), so
    // separation is horizontal there and vertical everywhere else. Check the axis
    // the row actually uses — both must be genuinely disjoint boxes.
    const overlaps = rows.filter((r) => {
      const head = r.querySelector('.harpoon-lab-move-head');
      const foot = r.querySelector('.harpoon-lab-move-foot');
      if (!head || !foot) return false;
      const h = head.getBoundingClientRect();
      const f = foot.getBoundingClientRect();
      return r.classList.contains('is-rejected')
        ? h.right > f.left + 0.5
        : h.bottom > f.top + 0.5;
    }).length;
    const pipCollisions = rows.filter((r) => {
      const t = r.querySelector('.harpoon-lab-move-termhead');
      const p = r.querySelector('.harpoon-lab-move-pip');
      if (!t || !p || !p.offsetParent) return false;
      return t.getBoundingClientRect().right > p.getBoundingClientRect().left + 0.5;
    }).length;
    const pipEl = body.querySelector('.harpoon-lab-move.is-verified .harpoon-lab-move-pip')
      || body.querySelector('.harpoon-lab-move.is-rejected .harpoon-lab-move-pip');
    return {
      rows: rows.length,
      verbs: [...body.querySelectorAll('.harpoon-lab-move-verb')].map((n) => n.textContent),
      verified: body.querySelectorAll('.harpoon-lab-move.is-verified').length,
      rejected: body.querySelectorAll('.harpoon-lab-move.is-rejected').length,
      chevrons: body.querySelectorAll('.harpoon-lab-move-chevron').length,
      orcaBadge: !!body.querySelector('.harpoon-lab-orca-badge svg'),
      overlaps,
      pipCollisions,
      pipTip: pipEl ? (pipEl.getAttribute('data-tooltip') || pipEl.getAttribute('aria-label') || '') : '',
      // A refused tactic must be genuinely un-runnable, not merely faded.
      rejectedDisabled: [...body.querySelectorAll('.harpoon-lab-move.is-rejected')]
        .every((r) => r.querySelector('.harpoon-lab-move-main').disabled),
      // …and must stop wearing its kind's colour.
      rejectedNeutral: [...body.querySelectorAll('.harpoon-lab-move.is-rejected')]
        .every((r) => getComputedStyle(r).getPropertyValue('--move-accent').trim()
          === getComputedStyle(document.documentElement).getPropertyValue('--muted-mid').trim()),
      noErrorBanner: !body.querySelector('.harpoon-lab-move-error'),
      // The checking ring must match the glyphs it alternates with.
      ringMatchesGlyph: (() => {
        const r = body.querySelector('.harpoon-lab-move');
        if (!r) return true;
        r.classList.add('is-checking');
        const pip = r.querySelector('.harpoon-lab-move-pip');
        const w = pip.getBoundingClientRect().width;
        r.classList.remove('is-checking');
        return Math.abs(w - 0.72 * 16) < 2.5;
      })(),
    };
  });
  ok(surf.rows > 1, `${surf.rows} tactic rows [${surf.verbs.join(', ')}]`);
  ok(surf.chevrons === surf.rows, `every row has an expand chevron (${surf.chevrons}/${surf.rows})`);
  ok(surf.orcaBadge, 'Orca carries its gladius glyph');
  ok(surf.overlaps === 0, `no header text reaches the footer strip (${surf.overlaps} overlaps)`);
  ok(surf.pipCollisions === 0, `the verdict pip never overlaps the term preview (${surf.pipCollisions})`);
  ok(surf.verified + surf.rejected > 0,
    `the sweep marked ${surf.verified} verified / ${surf.rejected} rejected`);
  ok(/accepts|rejects/.test(surf.pipTip), `the pip carries its own tooltip: "${surf.pipTip}"`);
  ok(surf.rejectedDisabled, 'every refused tactic is disabled, not just faded');
  ok(surf.rejectedNeutral, 'a refused tactic drops its kind colour for neutral');
  ok(surf.noErrorBanner, 'no rejection BANNER is rendered (rejections are toasts)');
  ok(surf.ringMatchesGlyph, 'the checking ring is sized to the ✓/✕ glyphs beside it');
  await page.screenshot({ path: path.join(outDir, 'manual-harpoon.png') });
  console.log('  shot → scripts/.shots/manual-harpoon.png');

  // Orca close-up, at rest and hovered — the sheen and the glyph are too small
  // to judge in a full-panel shot.
  const orcaEl = await page.$('.__probe .harpoon-lab-orca');
  if (orcaEl) {
    await orcaEl.screenshot({ path: path.join(outDir, 'orca-rest.png') });
    await orcaEl.hover();
    await new Promise((r) => setTimeout(r, 600));   // let the eased transition settle
    await orcaEl.screenshot({ path: path.join(outDir, 'orca-hover.png') });
    await page.mouse.move(0, 0);
    const glyph = await page.evaluate(() => {
      const svg = document.querySelector('.__probe .harpoon-lab-orca-badge svg');
      if (!svg) return null;
      const r = svg.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), shapes: svg.children.length };
    });
    ok(glyph && glyph.w >= 14 && glyph.w === glyph.h,
      `the Orca glyph is square and legibly sized (${glyph && glyph.w}×${glyph && glyph.h}px, ${glyph && glyph.shapes} shapes)`);
    console.log('  shot → scripts/.shots/orca-rest.png · orca-hover.png');

    // Pointer-following glow: it must LEAN toward the cursor, not track it, and
    // never drag the sheen box's edge into view.
    const box = await page.evaluate(() => {
      const b = document.querySelector('.__probe .harpoon-lab-orca');
      const r = b.getBoundingClientRect();
      return { left: r.left, top: r.top, w: r.width, h: r.height };
    });
    const readGlow = () => page.evaluate(() => {
      const b = document.querySelector('.__probe .harpoon-lab-orca');
      return {
        dx: parseFloat(b.style.getPropertyValue('--glow-dx')) || 0,
        dy: parseFloat(b.style.getPropertyValue('--glow-dy')) || 0,
      };
    });
    // Far right of the button.
    await page.mouse.move(box.left + box.w * 0.9, box.top + box.h * 0.5);
    await new Promise((r) => setTimeout(r, 120));
    const gRight = await readGlow();
    // Far left.
    await page.mouse.move(box.left + box.w * 0.05, box.top + box.h * 0.5);
    await new Promise((r) => setTimeout(r, 120));
    const gLeft = await readGlow();
    await page.mouse.move(box.left + box.w * 0.92, box.top + box.h * 0.5);
    await new Promise((r) => setTimeout(r, 700));
    await orcaEl.screenshot({ path: path.join(outDir, 'orca-glow-right.png') });
    await page.mouse.move(0, 0);
    await new Promise((r) => setTimeout(r, 700));
    const gAway = await readGlow();

    ok(gRight.dx > gLeft.dx, `the glow leans toward the cursor (right ${gRight.dx}px vs left ${gLeft.dx}px)`);
    const pullFraction = gRight.dx / (box.w * 0.9 - box.w * 0.18);
    ok(pullFraction > 0.2 && pullFraction < 0.8,
      `it travels a meaningful but partial distance (${(pullFraction * 100).toFixed(0)}%)`);
    // Rest is ~18% across; with the cursor at the far right the light should
    // reach about mid-face rather than staying pinned to the left edge.
    const restAt = box.w * 0.18;
    ok(restAt + gRight.dx > box.w * 0.4,
      `at the far right the glow reaches mid-face (${Math.round(restAt + gRight.dx)}px of ${Math.round(box.w)}px)`);
    // Clamped to 30% of the button; the sheen box overhangs 40% each side, so
    // there is still a 10% margin before its edge could ever enter frame.
    ok(Math.abs(gRight.dx) <= box.w * 0.3 + 0.5 && Math.abs(gLeft.dx) <= box.w * 0.3 + 0.5,
      `the pull stays clamped inside the sheen box’s overhang (${Math.round(gRight.dx)}px ≤ ${Math.round(box.w * 0.3)}px)`);
    ok(gAway.dx === 0 && gAway.dy === 0, 'leaving the button releases it back to rest');
    console.log('  shot → scripts/.shots/orca-glow-right.png');
    // LIGHT MODE — where stacked edge treatments show up as a thick, uneven
    // border (the dark ground hides them).
    await page.evaluate(() => document.documentElement.classList.add('light'));
    await new Promise((r) => setTimeout(r, 300));
    await orcaEl.screenshot({ path: path.join(outDir, 'orca-light.png') });
    await orcaEl.hover();
    await new Promise((r) => setTimeout(r, 600));
    await orcaEl.screenshot({ path: path.join(outDir, 'orca-light-hover.png') });
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.documentElement.classList.remove('light'));
    await new Promise((r) => setTimeout(r, 250));
    console.log('  shot → scripts/.shots/orca-light.png · orca-light-hover.png');
    // The glyph blown up, so its silhouette can actually be judged.
    await page.evaluate(() => {
      document.querySelectorAll('.__glyph').forEach((n) => n.remove());
      const svg = document.querySelector('.__probe .harpoon-lab-orca-badge svg');
      const box = document.createElement('div');
      box.className = '__glyph';
      box.style.cssText = 'position:fixed;left:24px;top:24px;width:132px;height:132px;'
        + 'display:flex;align-items:center;justify-content:center;background:#17171d;'
        + 'border-radius:14px;z-index:999999;color:#e88ac8;';
      const big = svg.cloneNode(true);
      big.style.cssText = 'width:104px;height:104px;';
      box.appendChild(big);
      document.body.appendChild(box);
    });
    const glyphBox = await page.$('.__glyph');
    if (glyphBox) {
      await glyphBox.screenshot({ path: path.join(outDir, 'orca-glyph.png') });
      await page.evaluate(() => document.querySelectorAll('.__glyph').forEach((n) => n.remove()));
      console.log('  shot → scripts/.shots/orca-glyph.png');
    }
  }

  // The applying pulse, caught mid-flight — a still of the moving part, so the
  // colour and containment are reviewable and not just asserted.
  const pulseShot = await page.evaluate(() => {
    const s = window.__probeSession;
    const row = document.querySelector('.__probe .harpoon-lab-move');
    if (!row) return false;
    row.classList.add('is-applying');
    if (!row.querySelector('.harpoon-lab-move-track')) {
      const t = document.createElement('div');
      t.className = 'harpoon-lab-move-track';
      row.insertBefore(t, row.firstChild);
    }
    if (s && s._movesEl) s._movesEl.classList.add('is-busy');
    return true;
  });
  if (pulseShot) {
    const rowEl = await page.$('.__probe .harpoon-lab-move.is-applying');
    if (rowEl) {
      await new Promise((r) => setTimeout(r, 620));   // catch the band mid-track
      await rowEl.screenshot({ path: path.join(outDir, 'tactic-applying.png') });
      console.log('  shot → scripts/.shots/tactic-applying.png');
    }
  }
  // ── Part 2c: expand/collapse, then apply ───────────────────────────────────
  const acted = await page.evaluate(async () => {
    const s = window.__probeSession;
    const row = document.querySelector('.__probe .harpoon-lab-move');
    row.querySelector('.harpoon-lab-move-foot').click();
    const expanded = row.classList.contains('is-expanded')
      && !!row.querySelector('.harpoon-lab-move-term');
    row.querySelector('.harpoon-lab-move-foot').click();
    const collapsed = !row.classList.contains('is-expanded');
    const before = s.manual.state.code;
    // Count real checker traffic across the click, and watch the row's geometry:
    // the applying pulse must not push anything, and a tactic the sweep already
    // certified must not be checked a second time.
    const cl = window.BelugaClient;
    const realCheck = cl.checkResultForProver.bind(cl);
    let checks = 0;
    cl.checkResultForProver = (c) => { checks += 1; return realCheck(c); };
    const wasVerified = row.classList.contains('is-verified');
    const listBefore = document.querySelector('.__probe .harpoon-lab-move-list')
      .getBoundingClientRect().height;
    const rowTopBefore = row.getBoundingClientRect().top;
    row.querySelector('.harpoon-lab-move-main').click();
    const rowTopAfter = row.getBoundingClientRect().top;
    const listAfter = document.querySelector('.__probe .harpoon-lab-move-list')
      .getBoundingClientRect().height;
    const noShift = Math.abs(rowTopAfter - rowTopBefore) < 0.5
      && Math.abs(listAfter - listBefore) < 0.5;
    const applyingRow = document.querySelector('.__probe .harpoon-lab-move.is-applying');
    const sawApplying = applyingRow !== null;
    // The applying pulse must live INSIDE its 2px track. It previously escaped
    // its host and painted a full-height slab across the whole card.
    let trackOk = false;
    let trackTinted = false;
    if (applyingRow) {
      const track = applyingRow.querySelector('.harpoon-lab-move-track');
      if (track) {
        const tr = track.getBoundingClientRect();
        const rr = applyingRow.getBoundingClientRect();
        trackOk = tr.height <= 4 && tr.height > 0 && rr.height > tr.height * 4;
        // …and wear the tactic's colour, not the global magenta.
        const accent = getComputedStyle(applyingRow).getPropertyValue('--move-accent').trim();
        const pulse = getComputedStyle(track, '::after').backgroundImage || '';
        trackTinted = !!accent && pulse.length > 0;
        window.__trackShot = track;
      }
    }
    for (let i = 0; i < 300 && s.manual.state.code === before; i += 1) {
      await new Promise((r) => setTimeout(r, 100));
    }
    cl.checkResultForProver = realCheck;
    return {
      expanded, collapsed, sawApplying, trackOk, trackTinted, noShift, checks, wasVerified,
      advanced: s.manual.state.code !== before,
      steps: s.manual.state.steps.length,
      trail: document.querySelectorAll('.__probe .harpoon-lab-auto-step').length,
    };
  });
  ok(acted.expanded, 'the footer chevron expands the full term');
  ok(acted.collapsed, 'and collapses it again');
  ok(acted.sawApplying, 'the chosen row shows an applying state while siblings recede');
  ok(acted.trackOk, 'the applying pulse stays inside its 2px track (no full-card slab)');
  ok(acted.trackTinted, 'the pulse is drawn in the tactic’s own accent');
  ok(acted.noShift, 'the applying pulse appears with NO layout shift');
  ok(!acted.wasVerified || acted.checks === 0,
    `a pre-verified tactic applies with zero extra checker calls (${acted.checks})`);
  ok(acted.advanced, 'clicking the header applies the tactic');
  ok(acted.steps === 2, `the step landed on the trail (${acted.steps} steps)`);
  ok(acted.trail > 0, `the trail rendered ${acted.trail} step row(s)`);
  await page.screenshot({ path: path.join(outDir, 'manual-harpoon-after.png') });
  console.log('  shot → scripts/.shots/manual-harpoon-after.png');

  // ── Part 3: the finished proof, and the Orca↔manual seam ────────────────
  console.log('\n[3] completion + the Orca seam');
  const done = await page.evaluate(async (code, decl) => {
    const ed = window.BelJarEditor;
    const cl = window.BelugaClient;
    const oracle = (c) => (cl.checkResultForProver ? cl.checkResultForProver(c) : cl.checkResult(c));
    const thm = ed.theoremUnderProof(decl);
    const base = await oracle(code);
    let st = ed.manualState(code, thm, base.output);
    // Drive to a COMPLETE proof by hand.
    for (let i = 0; i < 6 && !ed.manualIsComplete(st); i += 1) {
      const ms = ed.movesAt(st, thm);
      if (!ms.length) break;
      let moved = false;
      for (const mv of ms) {
        const r = await ed.applyMove(st, mv, oracle, thm);
        if (r.ok) { st = r.state; moved = true; break; }
      }
      if (!moved) break;
    }
    const s = window.__probeSession;
    s.manual.state = st;
    s.manual.phase = 'ready';
    s.render();
    const body = s.bodyEl;
    const solvedManual = {
      complete: ed.manualIsComplete(st),
      steps: st.steps.length,
      hasSolution: !!body.querySelector('.harpoon-lab-auto-solution'),
      hasDerivation: !!body.querySelector('.harpoon-deriv'),
      hasTreeToggle: body.querySelectorAll('.harpoon-deriv-tab').length,
      hasPlace: !!body.querySelector('.harpoon-lab-place'),
      derivationNaOk: !!(s.derivationNa() && s.derivationNa().steps.length),
    };

    // The finished proof's banners must share the panel's rhythm.
    const left = (sel) => {
      const b = body.querySelector(sel + ' .harpoon-lab-banner-badge');
      return b ? b.offsetLeft : null;
    };
    const banners = {
      proven: left('.harpoon-lab-manual-head'),
      place: left('.harpoon-lab-place'),
      provenPresent: !!body.querySelector('.harpoon-lab-manual-head'),
    };
    return { solvedManual, banners, pauseWired: typeof s.toggleOrcaPause === 'function' };
  }, CODE, DECL);

  const d = done.solvedManual;
  ok(d.complete, `the proof completes by hand in ${d.steps} steps`);
  ok(d.hasPlace, 'a finished manual proof offers "Place the proof"');
  ok(d.hasSolution, 'a finished manual proof SHOWS ITS SOLUTION (the reported bug)');
  ok(d.hasDerivation, 'a finished manual proof shows its derivation (the reported bug)');
  ok(d.hasTreeToggle === 2, `manual gets the same List ⇄ Tree toggle as Orca (${d.hasTreeToggle} tabs)`);
  ok(d.derivationNaOk, 'the pop-out tree explorer can read a manual proof');

  const b = done.banners;
  ok(b.provenPresent, 'a finished proof states its verdict, however it was built');
  ok(b.proven != null && b.proven === b.place,
    `the verdict and place banners share one left edge (${b.proven} / ${b.place})`);
  ok(done.pauseWired, 'pause/resume is wired onto the session');
  const seqDone = await segmentOrder();
  ok(orderOk(seqDone), `segments in order when proven [${(seqDone || []).join(' → ')}]`);
  ok((seqDone || []).indexOf('bar') > (seqDone || []).lastIndexOf('banner'),
    'the bar heads the working segment — it is never isolated between banners');
  await page.screenshot({ path: path.join(outDir, 'manual-harpoon-complete.png') });
  console.log('  shot → scripts/.shots/manual-harpoon-complete.png');
  // ── Part 4: ONE SURFACE — Orca runs inside the manual panel ─────────────
  console.log('');
  console.log('[4] the unified surface');
  const uni = await page.evaluate(async (code, decl) => {
    const ed = window.BelJarEditor;
    const cl = window.BelugaClient;
    const oracle = (c) => (cl.checkResultForProver ? cl.checkResultForProver(c) : cl.checkResult(c));
    const thm = ed.theoremUnderProof(decl);
    const base = await oracle(code);
    const s = window.__probeSession;
    s.nativeAuto = null;
    s.manual = {
      phase: 'ready', state: ed.manualState(code, thm, base.output), declName: thm.name,
      sourceGoalType: (thm.compType && thm.compType.raw) || '', priorBinders: [], busy: false,
    };
    s.prep = { name: thm.name, proveCode: code, assembledCode: code,
      assembledDeclFrom: code.indexOf('rec '), assembledDeclTo: code.length, hit: null };
    s.render();
    const body = s.bodyEl;
    const before = {
      hasButton: !!body.querySelector('.harpoon-lab-orca-band:not(.is-running)'),
      tacticsLive: !body.querySelector('.harpoon-lab-moves.is-locked'),
      title: (body.querySelector('.harpoon-lab-orca-title') || {}).textContent || '',
    };

    // Put the session into the RUNNING state the way runNativeAuto does, then
    // exercise the real render / lock / pause / apply-guard paths. (Driving the
    // actual search needs a live editor view, which this synthetic session has
    // no business faking.)
    s.manualBefore = s.manual.state;
    s.nativeAuto = {
      phase: 'searching', paused: false, trace: [], reel: [], checks: 0,
      // Non-empty, so the live reel actually REPLAYS rows (an empty one hid a
      // missing dependency that would have crashed on the first real step).
      steps: [{ move: 'intro', lead: 'opened the goal’s binders', rationale: 'opened',
        meta: { kind: 'intro', introduced: ['A'] }, checks: 1, status: 'open', text: 'mlam A =>' }],
      declName: thm.name, goalType: s.manual.sourceGoalType, goalState: 'approximate',
      sourceGoalType: s.manual.sourceGoalType, priorBinders: [],
      searchLabel: 'Trying split…', labelAt: performance.now(), startedAt: performance.now(),
    };
    s.render();
    const during = {
      stillOneSurface: !!body.querySelector('.harpoon-lab-manual'),
      goalStillThere: !!body.querySelector('.harpoon-lab-auto-goal'),
      bandRunning: !!body.querySelector('.harpoon-lab-orca-band.is-running'),
      tacticsLocked: !!body.querySelector('.harpoon-lab-moves.is-locked'),
      lockHint: (body.querySelector('.harpoon-lab-moves-lock') || {}).textContent || '',
      lockIsPlainText: (() => {
        const n = body.querySelector('.harpoon-lab-moves-lock');
        if (!n) return false;
        const cs = getComputedStyle(n);
        return cs.borderTopWidth === '0px' && cs.borderLeftWidth === '0px';
      })(),
      // The checks/time tooltip belongs to the glyph only.
      statTipOnBadge: !!(body.querySelector('.harpoon-lab-orca-badge')
        || {}).getAttribute?.('data-tooltip'),
      statTipOnSub: !!(body.querySelector('.harpoon-lab-orca-sub')
        || {}).getAttribute?.('data-tooltip'),
      spinnerInBadge: !!body.querySelector('.harpoon-lab-orca-badge .inspector-spinner'),
      daggerWorking: !!body.querySelector('.harpoon-lab-orca-badge.is-working svg'),
      tacticsStillListed: body.querySelectorAll('.harpoon-lab-move').length,
      liveReel: !!body.querySelector('.harpoon-reel-record.is-live'),
      reelReplayed: body.querySelectorAll('.harpoon-reel-record.is-live .harpoon-lab-auto-step').length,
      applyBlocked: false,
    };
    // Prove the gladius is actually swinging (two samples, different angles).
    const badgeSvg = body.querySelector('.harpoon-lab-orca-badge.is-working svg');
    const t0 = badgeSvg ? getComputedStyle(badgeSvg).transform : '';
    await new Promise((r) => setTimeout(r, 420));
    const t1 = badgeSvg ? getComputedStyle(badgeSvg).transform : '';
    during.swinging = !!t0 && t0 !== 'none' && t0 !== t1;

    const firstRow = body.querySelector('.harpoon-lab-move');
    if (firstRow) {
      const codeNow = s.manual.state.code;
      await s.manualApply(firstRow._mv, firstRow);
      during.applyBlocked = s.manual.state.code === codeNow;
    }

    // PAUSE SAFETY: Orca has advanced past the goal the tactic list was built
    // for, so the instant after pausing the panel must NOT show those stale
    // moves — they cannot apply, and if the resync fails they are all the user
    // is left with (a dead end at a provable hole).
    s.nativeAuto.steps = [{ move: 'intro', lead: 'opened the goal’s binders',
      meta: { kind: 'intro', introduced: ['A'] }, checks: 1, status: 'open', text: 'mlam A =>' }];
    s.nativeAuto.liveCode = window.__probeReady.code;   // where the search has got to
    s.toggleOrcaPause();
    const instant = {
      showsStale: !!document.querySelector(
        '.__probe .harpoon-lab-move:not(.is-skeleton) .harpoon-lab-move-verb'),
      skeletons: document.querySelectorAll('.__probe .harpoon-lab-move.is-skeleton').length,
    };
    // Wait for the resync to land — the list is skeletoned until it knows, which
    // is exactly the safety property asserted above.
    for (let i = 0; i < 200; i += 1) {
      if (!s.manual.syncing) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 300));
    const paused = {
      syncing: !!s.manual.syncing,
      syncFailed: !!s.manual.syncFailed,
      skeletonsLeft: body.querySelectorAll('.harpoon-lab-move.is-skeleton').length,
      syncedCode: s.manual.state.code === window.__probeReady.code,
      bandPaused: !!body.querySelector('.harpoon-lab-orca-band.is-paused'),
      tacticsLive: !body.querySelector('.harpoon-lab-moves.is-locked'),
      tacticRows: body.querySelectorAll('.harpoon-lab-move').length,
      stillSearching: !!(s.nativeAuto && s.nativeAuto.phase === 'searching'),
      resumeLabel: (body.querySelector('.harpoon-lab-orca-title') || {}).textContent || '',
      lockHint: (body.querySelector('.harpoon-lab-moves-lock') || {}).textContent || '',
      anyApplicable: [...body.querySelectorAll('.harpoon-lab-move')]
        .some((r) => !r.classList.contains('is-rejected')),
    };
    // No literal "undefined" anywhere — an icon dep that never reached the
    // module renders as innerHTML = undefined, i.e. the WORD, in the chrome.
    const undef = (body.textContent || '').includes('undefined');
    const emptyIcons = [...body.querySelectorAll('.icon-btn')]
      .filter((b) => !b.querySelector('svg')).length;

    // Applying a tactic while paused must RETIRE the run.
    // Pick an APPLICABLE row: the sweep may have marked the top-ranked one
    // rejected, and clicking a rejected row correctly does nothing.
    const pausedRow = [...body.querySelectorAll('.harpoon-lab-move')]
      .find((r) => r._mv && !r.classList.contains('is-rejected'));
    const codeBeforeManual = s.manual.state.code;
    if (pausedRow) await s.manualApply(pausedRow._mv, pausedRow);
    await new Promise((r) => setTimeout(r, 400));
    const afterManual = {
      orcaRetired: !s.nativeAuto,
      advanced: s.manual.state.code !== codeBeforeManual,
      // Either Orca is offered again (goals remain) or the proof is done —
      // what must NOT happen is the running cockpit surviving the retirement.
      buttonBack: !!body.querySelector('.harpoon-lab-orca-band:not(.is-running)')
        || !!body.querySelector('.harpoon-lab-manual-head'),
      noRunningBand: !body.querySelector('.harpoon-lab-orca-band.is-running'),
    };
    // Orca FINISHING must update the surface, not leave the pre-search state.
    const preSearchCode = s.manual.state.code;
    const solvedCode = preSearchCode.replace('?', '[ |- refl]');
    s.manualBefore = s.manual.state;
    await s.absorbOrcaResult({
      complete: true, code: solvedCode,
      steps: [{ move: 'fill', lead: 'closed eq', meta: { kind: 'fill' }, checks: 3, status: 'solved' }],
    });
    const finished = {
      complete: ed.manualIsComplete(s.manual.state),
      proven: !!body.querySelector('.harpoon-lab-manual-head'),
      place: !!body.querySelector('.harpoon-lab-place'),
      solution: !!body.querySelector('.harpoon-lab-auto-solution'),
      stillOneSurface: !!body.querySelector('.harpoon-lab-manual'),
      noStaleButton: !body.querySelector('.harpoon-lab-orca-band'),
    };

    return { before, during, paused, afterManual, undef, emptyIcons, finished, instant };
  }, CODE, DECL);

  ok(uni.before.hasButton, 'idle: the Orca button is offered');
  ok(uni.before.title === 'Orca', `idle: the button is just "Orca" (${uni.before.title})`);
  ok(uni.before.tacticsLive, 'idle: tactics are live');
  ok(uni.during.stillOneSurface, 'running: the SAME panel is still mounted (no screen swap)');
  ok(uni.during.goalStillThere, 'running: the goal band is still in place');
  ok(uni.during.bandRunning, 'running: the Orca band became the cockpit');
  ok(uni.during.tacticsLocked, 'running: tactics are locked');
  ok(uni.during.lockHint === 'Pause Orca to use tactics',
    `running: the lock hint is a fluent instruction ("${uni.during.lockHint}")`);
  ok(uni.during.lockIsPlainText, 'running: the lock hint is plain text, not a pill');
  ok(uni.during.tacticsStillListed > 0,
    `running: tactics stay VISIBLE (${uni.during.tacticsStillListed}), just inert`);
  ok(!uni.during.spinnerInBadge, 'running: no spinner replaces the gladius');
  ok(uni.during.daggerWorking, 'running: the gladius itself is the working indicator');
  ok(uni.during.statTipOnBadge, 'running: the checks·time tooltip sits on the gladius');
  ok(!uni.during.statTipOnSub, 'running: …and NOT on the status text beside it');
  ok(uni.during.swinging, 'running: the gladius is genuinely swinging, not a static tilt');
  ok(uni.during.liveReel, 'running: the derivation streams live below');
  ok(uni.during.reelReplayed > 0,
    `running: steps already found are replayed into the reel (${uni.during.reelReplayed})`);
  ok(uni.during.applyBlocked, 'running: clicking a tactic does nothing');
  ok(uni.paused.bandPaused, 'paused: the band flips to its paused face');
  ok(uni.paused.tacticsLive, 'paused: the tactics are handed straight back');
  ok(uni.paused.tacticRows > 0, `paused: tactics are offered for the CURRENT goal (${uni.paused.tacticRows})`);
  ok(uni.paused.stillSearching, 'paused: the run is held, not thrown away');
  ok(/paused/i.test(uni.paused.resumeLabel), `paused: the band says so ("${uni.paused.resumeLabel}")`);
  ok(!uni.instant.showsStale,
    'pause is SAFE instantly: no stale tactics for the goal Orca already left');
  ok(uni.instant.skeletons > 0, `pause skeletons the list until it knows (${uni.instant.skeletons})`);
  ok(!uni.paused.syncing && !uni.paused.syncFailed, 'paused: the resync completed cleanly');
  ok(uni.paused.skeletonsLeft === 0, 'paused: skeletons give way to the real tactics');
  ok(uni.paused.syncedCode, 'paused: the state resynced to where Orca actually got to');
  ok(uni.paused.anyApplicable, 'paused: at least one offered tactic can actually be applied');
  ok(uni.afterManual.advanced, `paused → a tactic applies and the proof advances`);
  ok(uni.afterManual.orcaRetired, 'paused → applying a tactic retires the held run');
  ok(uni.afterManual.buttonBack,
    'paused → the surface moves on (Orca offered again, or the proof is proven)');
  ok(uni.afterManual.noRunningBand, 'paused → the running cockpit does not survive the retirement');
  ok(!uni.undef, 'no literal "undefined" leaks into the chrome');
  ok(uni.emptyIcons === 0, `every icon button actually has its glyph (${uni.emptyIcons} empty)`);
  ok(uni.finished.complete, 'finished: the result is folded into the working program');
  ok(uni.finished.proven, 'finished: the Proven verdict shows');
  ok(uni.finished.place, 'finished: "Place the proof" is offered');
  ok(uni.finished.solution, 'finished: the solution is shown');
  ok(uni.finished.noStaleButton, 'finished: no stale "Run Orca again" over a solved proof');
  ok(uni.finished.stillOneSurface, 'finished: still the same surface');
  // ── the command layer reaches the live lab ────────────────────────────────
  // The `harpoon.*` commands are wired shell-side against `Harpoon.activeSession()`.
  // Without this they could be catalogued, listed and bound while driving nothing.
  console.log('');
  console.log('[6] commands drive the live session');
  const cmd = await page.evaluate(async () => {
    const C = window.Commands;
    const s = window.__probeSession;
    // The probe mounts its Session directly; tracking happens in the constructor,
    // so this is the same session the command layer would find.
    const found = window.Harpoon.activeSession() === s;
    const st = s.manual && s.manual.state;
    const holes = st ? st.holes.length : 0;
    const focus0 = st ? st.focusIdx : -1;
    // `available: true` is the real gate — a plain `palette: true` listing
    // ignores `when()` and would pass whether or not a lab were open.
    const offered = () => C.list({ palette: true, available: true }).map((c) => c.id);
    const before = offered();
    C.run('harpoon.next-goal');
    const focus1 = s.manual.state.focusIdx;
    const steps0 = (s.manual.state.steps || []).length;
    const undoRan = C.run('harpoon.undo-move');
    const steps1 = (s.manual.state.steps || []).length;
    return {
      found, holes, focus0, focus1, undoRan, steps0, steps1,
      undoOffered: before.indexOf('harpoon.undo-move') >= 0,
      nextGoalOffered: before.indexOf('harpoon.next-goal') >= 0,
    };
  });
  ok(cmd.found, 'Harpoon.activeSession() finds the mounted lab');
  ok(cmd.undoOffered, 'with a lab open and a step taken, Undo Proof Move is offered');
  // Focus stepping earns its palette row only when there is somewhere to step.
  ok(cmd.nextGoalOffered === (cmd.holes > 1),
    `Focus Next Goal is offered exactly when there are goals to move between `
    + `(${cmd.holes} open, offered: ${cmd.nextGoalOffered})`);
  if (cmd.holes > 1) {
    ok(cmd.focus1 !== cmd.focus0,
      `harpoon.next-goal moves the focus (${cmd.focus0} → ${cmd.focus1})`);
  } else {
    ok(cmd.focus1 === cmd.focus0, 'with nowhere to step, the focus holds');
  }
  ok(cmd.undoRan === true, 'harpoon.undo-move runs against the live state');
  ok(cmd.steps1 < cmd.steps0, `and takes a step back (${cmd.steps0} → ${cmd.steps1})`);

  const seqPaused = await segmentOrder();
  ok(orderOk(seqPaused), `segments in order while working [${(seqPaused || []).join(' → ')}]`);
  await page.screenshot({ path: path.join(outDir, 'orca-paused.png') });
  console.log('  shot → scripts/.shots/orca-paused.png');
} finally {
  await browser.close();
  server.close();
}

console.log(fails.length ? `\nFAILED (${fails.length}):\n - ${fails.join('\n - ')}` : '\nprobe-manual-harpoon: ALL OK');
process.exit(fails.length ? 1 : 0);
