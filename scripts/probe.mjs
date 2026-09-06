// The routine probe: BelJar boots and its general surfaces work.
//
// ⛔ NOTHING KEYMAP-SPECIFIC LIVES HERE. Vim and Emacs depth is `probe-keymap.mjs`,
// run when you touch that thread. This one is what an agent runs after any
// change, so it has to stay broad and fast: one browser, one keymap style, no
// style switches (the most expensive thing a probe can do).
//
// What it covers: the command registry is on the page once and every chorded
// command has behaviour; the palette lists what it should and gates what it
// should; the Keybindings sheet renders, filters and scrolls; the status strip
// says the right things and its dot matches the topbar's; the goal renders as
// real Beluga; the command line runs, previews, remembers and searches; a motion
// command moves; the double-tap gesture; the reserved-chord sheet; full keyboard.
//
// Screenshots land in scripts/.shots/.
import path from 'node:path';
import { openProbe } from './probe-harness.mjs';

const { page, check, errors, type, key, chord, caret, load, outDir, finish } = await openProbe({
  port: 8871,
  waitFor: () => window.Commands && window.SettingsUI && window.CommandPalette && window.StatusStrip,
});

let crash = null;
try {
  // ── registry ────────────────────────────────────────────────────────────────
  const reg = await page.evaluate(() => ({
    total: Commands.list().length,
    palette: Commands.list({ palette: true }).length,
    bindable: Commands.list({ keybindable: true }).length,
    runnable: Commands.list({ palette: true, runnable: true }).length,
    unwired: Commands.list({ palette: true }).filter((c) => typeof c.run !== 'function').map((c) => c.id),
    // A chord with nothing behind it is worse than an unbound one: it looks
    // like a feature and does nothing when pressed.
    chordedUnwired: Commands.list()
      .filter((c) => (c.defaultSpec || c.shortcut) && typeof c.run !== 'function')
      .map((c) => c.id),
    unrunnable: Commands.list().filter((c) => typeof c.run !== 'function').map((c) => c.id),
    // What the command line can actually name. Motions are excluded on purpose.
    onTheLine: Commands.list({ cmdline: true, runnable: true }).length,
    motionsOnTheLine: Commands.list({ cmdline: true, section: 'Motion' }).length,
    sameAsKeybindings: Commands.defaults().length === Keybindings.DEFAULTS.length,
  }));
  console.log('  registry:', JSON.stringify(reg));
  check(reg.total === 149, `registry holds 149 commands (got ${reg.total})`);
  check(reg.unwired.length === 0, 'every palette command has behaviour attached', reg.unwired.join(', '));
  check(reg.chordedUnwired.length === 0,
    'every command that ships a chord has behaviour behind it', reg.chordedUnwired.join(', '));
  check(reg.motionsOnTheLine === 0,
    'the 31 motions stay off the command line', String(reg.motionsOnTheLine));
  check(reg.onTheLine === reg.total - 31,
    `everything else can be named on the line (${reg.onTheLine} of ${reg.total})`);
  check(reg.sameAsKeybindings, 'Keybindings projects the same registry instance');

  // ── palette ─────────────────────────────────────────────────────────────────
  await page.evaluate(() => CommandPalette.open({ mode: 'commands' }));
  await new Promise((r) => setTimeout(r, 350));
  const pal = await page.evaluate(() => ({
    rows: document.querySelectorAll('.bel-palette-item').length,
    sections: [...document.querySelectorAll('.bel-palette-section')].map((e) => e.textContent),
    first: [...document.querySelectorAll('.bel-palette-item-title')].slice(0, 3).map((e) => e.textContent),
    chords: [...document.querySelectorAll('.bel-palette-item-shortcut')].length,
  }));
  console.log('  palette:', JSON.stringify(pal));
  // 112 palette commands minus the 20 that `when()` gates out of an empty
  // workspace: 4 Prover moves (no hole at the caret), 7 Harpoon lab commands
  // (no lab open), run.module / run.project (no suite, single file),
  // tab.next / tab.prev / tab.close-others / tab.close-right (one tab open),
  // suite.add-file / suite.remove-file (no suite owns the directory).
  // `cmdline.repeat` joins them until something has been typed on the line.
  check(pal.rows === 92, `palette shows 92 of 112 with the rest gated (got ${pal.rows})`);
  check(
    pal.sections.join(',') === 'File,Edit,Navigate,Prover,Run,View,Settings,Tools',
    'the Prover header survives on its two ungated reports',
    pal.sections.join(',')
  );
  await page.screenshot({ path: path.join(outDir, 'palette-commands.png') });

  // Prover moves are gated on a hole under the caret — none here, so they hide.
  const gated = await page.evaluate(() => {
    const titles = [...document.querySelectorAll('.bel-palette-item-title')].map((e) => e.textContent);
    const shouldHide = ['Intro at Hole', 'Split at Hole', 'Fill Hole', 'Open Hole in Harpoon',
      'Run Suite', 'Run Project', 'Next Tab', 'Previous Tab',
      'Close Other Tabs', 'Close Tabs to the Right',
      // The Harpoon lab commands: no lab is open, so there is no session to drive.
      'Focus Next Goal', 'Focus Previous Goal', 'Undo Proof Move', 'Redo Proof Move',
      'Run Orca on This Goal', 'Pause or Resume Orca', 'Take Over from Orca'];
    return {
      leaked: shouldHide.filter((t) => titles.indexOf(t) >= 0),
      // Navigation to holes is not gated: it works with the caret anywhere. Nor
      // are the two reports — "how many are left" is asked from anywhere.
      navKept: ['Go to Next Hole', 'Go to Previous Hole', 'Count Holes', 'Show Goal at Cursor']
        .every((t) => titles.indexOf(t) >= 0),
    };
  });
  check(gated.leaked.length === 0, 'when()-gated commands stay out of the palette', gated.leaked.join(', '));
  check(gated.navKept, 'ungated hole navigation and the proof-state reports stay listed');

  await page.evaluate(() => CommandPalette.close());
  await new Promise((r) => setTimeout(r, 250));

  // ── keybindings sheet ───────────────────────────────────────────────────────
  await page.evaluate(() => SettingsUI.open());
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => {
    const item = [...document.querySelectorAll('button, [role="tab"], .bj-settings__rail-item')]
      .find((el) => (el.textContent || '').trim() === 'Keys');
    if (item) item.click();
  });
  await new Promise((r) => setTimeout(r, 400));

  const sheet = await page.evaluate(() => ({
    rows: document.querySelectorAll('.bj-kb__row').length,
    sections: [...document.querySelectorAll('.bj-kb__section')].map((e) => e.textContent),
    hasFilter: !!document.querySelector('.bj-kb__filter-input'),
    count: (document.querySelector('.bj-kb__filter-count') || {}).textContent || '',
    unbound: [...document.querySelectorAll('.bj-kb__chord.is-empty')].length,
  }));
  console.log('  sheet:', JSON.stringify(sheet));
  check(sheet.rows === 139, `sheet renders every bindable command (got ${sheet.rows})`);
  check(
    sheet.sections.join(',') === 'File,Edit,Motion,Navigate,Prover,Run,View,Settings,Tools',
    'sheet section headers appear once each, in SECTION_ORDER',
    sheet.sections.join(',')
  );
  check(sheet.hasFilter, 'sheet has a filter input');
  // ⛔ ONE scrollport per panel. The list used to own its own, so the settings
  // scrolled down into a box that then scrolled separately.
  const scrollports = await page.evaluate(() => {
    const panel = document.querySelector('.bj-settings__panel[data-category="keybindings"]');
    const body = panel.querySelector('.bj-settings__panel-body');
    const inner = [...panel.querySelectorAll('*')].filter((el) => {
      if (el === body) return false;
      const o = getComputedStyle(el).overflowY;
      return (o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 1;
    }).map((el) => el.className);
    return {
      bodyScrolls: body.scrollHeight > body.clientHeight + 1,
      innerScrollports: inner,
      filterSticky: getComputedStyle(panel.querySelector('.bj-kb__filter')).position,
    };
  });
  console.log('  settings scroll:', JSON.stringify(scrollports));
  check(scrollports.bodyScrolls, 'the panel itself scrolls');
  check(scrollports.innerScrollports.length === 0,
    'and nothing inside it scrolls separately', scrollports.innerScrollports.join(' | '));
  check(scrollports.filterSticky === 'sticky',
    'the command filter sticks as you scroll past it', scrollports.filterSticky);
  check(/139 commands · 16 bound/.test(sheet.count), 'filter count reads right', sheet.count);
  check(sheet.unbound === 123, `unbound rows render as empty chords (got ${sheet.unbound})`);
  await page.screenshot({ path: path.join(outDir, 'keybindings-sheet.png') });

  // ── filtering ───────────────────────────────────────────────────────────────
  await page.type('.bj-kb__filter-input', 'hole');
  await new Promise((r) => setTimeout(r, 250));
  const filtered = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.bj-kb__row')];
    const heads = [...document.querySelectorAll('.bj-kb__section')];
    return {
      visible: rows.filter((r) => !r.hidden).map((r) => r.dataset.commandId),
      visibleHeads: heads.filter((h) => !h.hidden).map((h) => h.textContent),
      count: (document.querySelector('.bj-kb__filter-count') || {}).textContent || '',
      noResultsHidden: document.querySelector('.bj-kb__noresults').hidden,
    };
  });
  console.log('  filtered:', JSON.stringify(filtered));
  check(filtered.visible.length > 0 && filtered.visible.length < 10, `"hole" narrows the sheet (${filtered.visible.length} rows)`);
  const filteredTitles = await page.evaluate(() => [...document.querySelectorAll('.bj-kb__row')]
    .filter((r) => !r.hidden).map((r) => r.querySelector('.bj-kb__title').textContent));
  check(
    filteredTitles.every((t) => /hole/i.test(t)),
    'every surviving row mentions "hole" in its title',
    filteredTitles.join(' | ')
  );
  check(filtered.visibleHeads.length < 7, 'empty section headers hide with their rows', filtered.visibleHeads.join(','));
  check(filtered.noResultsHidden, 'no-results message stays hidden when there are matches');
  await page.screenshot({ path: path.join(outDir, 'keybindings-filtered.png') });

  await page.evaluate(() => {
    const el = document.querySelector('.bj-kb__filter-input');
    el.value = 'zzzznope';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 200));
  const empty = await page.evaluate(() => ({
    noResultsHidden: document.querySelector('.bj-kb__noresults').hidden,
    visible: [...document.querySelectorAll('.bj-kb__row')].filter((r) => !r.hidden).length,
  }));
  check(!empty.noResultsHidden && empty.visible === 0, 'no matches shows the empty state', JSON.stringify(empty));

  // ── status strip ─────────────────────────────────────────────────────────────
  // Escape, not a selector: [aria-label="Close"] also matches the file tab's
  // close button, which unmounts the editor and takes the bar's feed with it.
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 350));

  const bar0 = await page.evaluate(() => {
    const bar = document.querySelector('.bj-strip');
    return {
      mode: StatusStrip.storedMode(),
      inDom: !!bar,
      atViewportBottom: bar ? Math.abs(bar.getBoundingClientRect().bottom - window.innerHeight) <= 1 : false,
      fullWidth: bar ? Math.round(bar.getBoundingClientRect().width) === Math.round(document.body.getBoundingClientRect().width) : false,
      height: bar ? Math.round(bar.getBoundingClientRect().height) : 0,
      relicVimPanels: document.querySelectorAll('.cm-vim-panel').length,
    };
  });
  console.log('  strip:', JSON.stringify(bar0));
  check(bar0.mode === 'standard', `the bar is ON by default (got ${bar0.mode})`);
  check(bar0.inDom, 'the bar mounts without being asked');
  check(bar0.atViewportBottom, 'it sits on the bottom edge of the window');
  check(bar0.fullWidth, 'it spans the full window width, not one pane');
  check(bar0.height >= 20 && bar0.height <= 34, `slim band (got ${bar0.height}px)`);
  check(bar0.relicVimPanels === 0, 'the old in-editor vim mode panel is gone');

  await page.click('.cm-content');
  await page.keyboard.type('LF nat : type = | z : nat;');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('rec f : [ |- nat] = ?;');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 3500));

  const live = await page.evaluate(() => {
    const bar = document.querySelector('.bj-strip');
    const segs = [...bar.querySelectorAll('.bj-strip__seg')];
    return {
      keys: segs.map((e) => (e.className.match(/seg--([\w-]+)/) || [])[1]),
      texts: segs.map((e) => e.textContent.trim()),
      hasSpacer: !!bar.querySelector('.bj-strip__spacer'),
    };
  });
  console.log('  live:', JSON.stringify(live));
  check(live.keys.indexOf('position') >= 0, 'position is shown', live.keys.join(','));
  check(live.keys.indexOf('checker') >= 0, 'the checker reports in words', live.texts.join(' | '));
  check(live.hasSpacer, 'the right group is pushed to the right edge');
  check(live.keys.filter(Boolean).length >= 3, `the bar is carrying real content (${live.keys.length} segments)`);
  check(live.keys.indexOf('command') < 0, 'no command-hint segment');
  check(live.keys.indexOf('holes') >= 0 || live.keys.indexOf('goal') >= 0,
    'a file with a ? hole shows the hole state', live.keys.join(',') + ' :: ' + live.texts.join(' | '));

  // ── status-dot parity ───────────────────────────────────────────────────────
  const parity = await page.evaluate(() => {
    const barDot = document.querySelector('.bj-strip .ide-status-dot');
    const topDot = document.getElementById('ide-status-dot');
    const seg = document.querySelector('.bj-strip__seg--checker');
    return {
      barDotIsRealDot: !!barDot,
      barState: barDot ? barDot.getAttribute('data-live-state') : null,
      topState: topDot ? topDot.getAttribute('data-live-state') : null,
      topHidden: topDot ? getComputedStyle(topDot).display === 'none' : null,
      ownsClass: document.documentElement.classList.contains('bj-strip-owns-status'),
      cleanAction: seg ? seg.dataset.action : null,
      barTooltip: barDot ? barDot.getAttribute('aria-label') : null,
    };
  });
  console.log('  parity:', JSON.stringify(parity));
  check(parity.barDotIsRealDot, 'the bar hosts a real .ide-status-dot, not a lookalike');
  check(parity.barState === parity.topState, 'both dots carry the same live state', `${parity.barState} vs ${parity.topState}`);
  check(parity.barState !== null, 'the bar dot is actually driven', String(parity.barState));
  check(parity.ownsClass && parity.topHidden, 'with the bar up, the topbar dot is hidden — exactly one on screen');
  check(parity.cleanAction === 'run-default', 'a clean checker runs like the Run button', String(parity.cleanAction));
  check(!!parity.barTooltip, 'the bar dot carries the status tooltip', String(parity.barTooltip));

  // The dot must survive a repaint: re-creating it would kill the spinner.
  const survives = await page.evaluate(async () => {
    const before = document.querySelector('.bj-strip .ide-status-dot');
    before.setAttribute('data-live-state', 'checking');
    StatusStrip.setEditorState({ line: 999, col: 12 });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const after = document.querySelector('.bj-strip .ide-status-dot');
    return { same: before === after, state: after ? after.getAttribute('data-live-state') : null };
  });
  check(survives.same && survives.state === 'checking',
    'the dot node survives repaints, so the spinner never restarts', JSON.stringify(survives));

  const broken = await page.evaluate(async () => {
    StatusStrip.setDiagnostics({ errors: 2, warnings: 0, checking: false });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const seg = document.querySelector('.bj-strip__seg--checker');
    return { action: seg.dataset.action, text: seg.textContent.trim() };
  });
  check(broken.action === 'next-problem', 'a broken checker jumps to the problem instead', JSON.stringify(broken));
  check(/2 errors/.test(broken.text), 'and says so in words', broken.text);

  const offParity = await page.evaluate(async () => {
    Persist.writeStoredStatusStrip('off');
    StatusStrip.apply();
    await new Promise((r) => requestAnimationFrame(r));
    const topDot = document.getElementById('ide-status-dot');
    return {
      ownsClass: document.documentElement.classList.contains('bj-strip-owns-status'),
      topVisible: topDot ? getComputedStyle(topDot).display !== 'none' : false,
    };
  });
  check(!offParity.ownsClass && offParity.topVisible,
    'with the bar off, the topbar dot comes back', JSON.stringify(offParity));
  await page.evaluate(() => { Persist.writeStoredStatusStrip('standard'); StatusStrip.apply(); });
  await new Promise((r) => setTimeout(r, 250));

  // ── the goal renders as real Beluga, never raw ASCII ────────────────────────
  const goalRender = await page.evaluate(async () => {
    StatusStrip.setEditorState({ goal: "[ |- dual A A'] -> [ |- dual A' A]" });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const seg = document.querySelector('.bj-strip__seg--goal');
    if (!seg) return { missing: true };
    const label = seg.querySelector('.bj-strip__label');
    const cs = getComputedStyle(seg);
    return {
      text: seg.textContent,
      mark: (seg.querySelector('.bj-strip__mark') || {}).textContent,
      spans: label.querySelectorAll('span[class*="bel-hl"]').length,
      colours: [...new Set([...label.querySelectorAll('span')].map((e) => getComputedStyle(e).color))].length,
      wash: cs.backgroundColor,
    };
  });
  console.log('  goal:', JSON.stringify(goalRender));
  check(!goalRender.missing, 'the goal segment appears when a goal is known');
  check(goalRender.text.indexOf('|-') < 0, 'no raw |- reaches the screen', goalRender.text);
  check(goalRender.text.indexOf('->') < 0, 'no raw -> reaches the screen', goalRender.text);
  check(goalRender.text.indexOf('⊢') >= 0 && goalRender.text.indexOf('→') >= 0,
    'real turnstiles and arrows are shown', goalRender.text);
  check(goalRender.mark === '⊢', 'the goal marker is separate from the type');
  check(goalRender.spans > 0, `the type is syntax-highlighted (${goalRender.spans} token spans)`);
  check(goalRender.colours > 1, `and carries more than one token colour (${goalRender.colours})`);
  check(/rgba?\(/.test(goalRender.wash) && goalRender.wash !== 'rgba(0, 0, 0, 0)',
    'it sits in a wash rather than being tinted flat', goalRender.wash);
  // left on screen deliberately: the screenshot below is the goal's look.

  const topbar = await page.evaluate(async () => {
    const read = () => {
      const ctl = document.querySelector('.editor-topbar-controls');
      const btn = document.getElementById('btn-load');
      const c = ctl.getBoundingClientRect();
      const b = btn.getBoundingClientRect();
      return { ctlW: Math.round(c.width), left: Math.round(b.left - c.left), right: Math.round(c.right - b.right) };
    };
    const on = read();
    Persist.writeStoredStatusStrip('off'); StatusStrip.apply();
    await new Promise((r) => requestAnimationFrame(r));
    const off = read();
    Persist.writeStoredStatusStrip('standard'); StatusStrip.apply();
    await new Promise((r) => requestAnimationFrame(r));
    return { on, off };
  });
  console.log('  topbar:', JSON.stringify(topbar));
  check(Math.abs(topbar.on.left - topbar.on.right) <= 2,
    'the Run button is optically centred in its control strip', JSON.stringify(topbar.on));

  const clicks = await page.evaluate(async () => {
    const out = {};
    const view = CurrentEditor.getView();
    view.dispatch({ selection: { anchor: 0, head: 0 } });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const before = view.state.selection.main.head;
    const holeSeg = document.querySelector('.bj-strip__seg--holes');
    out.hasHoleSeg = !!holeSeg;
    if (holeSeg) {
      holeSeg.click();
      await new Promise((r) => setTimeout(r, 250));
      out.movedByHoles = CurrentEditor.getView().state.selection.main.head !== before;
    }
    return out;
  });
  console.log('  clicks:', JSON.stringify(clicks));
  check(!clicks.hasHoleSeg || clicks.movedByHoles, 'clicking the holes segment jumps to a hole', JSON.stringify(clicks));

  // ── the command line ────────────────────────────────────────────────────────
  const line = await page.evaluate(async () => {
    StatusStrip.openCommandLine('');
    await new Promise((r) => requestAnimationFrame(r));
    const el = document.querySelector('.bj-cmdline');
    const input = document.querySelector('.bj-cmdline__input');
    return {
      open: StatusStrip.isCommandLineOpen(),
      visible: el ? !el.hidden : false,
      focused: document.activeElement === input,
      segmentsHidden: getComputedStyle(document.querySelector('.bj-strip__segments')).display === 'none',
      // The facts that were on screen a moment ago must still be on screen.
      keeps: ['keymap', 'position'].filter((k) => document.querySelector('.bj-strip__seg--' + k)),
      inZone: !!document.querySelector('.bj-strip__command .bj-cmdline'),
      listed: document.querySelectorAll('.bj-cmdline__item').length,
      barH: Math.round(document.querySelector('.bj-strip').getBoundingClientRect().height),
    };
  });
  console.log('  cmdline:', JSON.stringify(line));
  check(line.open && line.visible, 'the command line opens inside the bar');
  check(line.focused, 'and takes focus');
  // ⛔ An empty line offers NOTHING. Opening full of every command is noise, and
  // it was the loudest half of "suggestions that will not go away".
  check(line.listed === 0, `an empty line lists nothing (${line.listed})`);
  // ⛔ The bar is the bar. Typing a command is one more thing happening IN it —
  // it used to wipe every segment and leave a bare prompt where the strip had
  // been, so where you were and what the checker thought vanished mid-command.
  check(!line.segmentsHidden, 'the line does not take the bar over');
  check(line.inZone, 'it lives in the command zone, after the left-hand facts');
  check(line.keeps.length === 2, 'and the keymap and position keep speaking beside it',
    JSON.stringify(line.keeps));
  check(line.barH >= 20 && line.barH <= 34, `the bar does not change height (${line.barH}px)`);

  const typed = await page.evaluate(async () => {
    const input = document.querySelector('.bj-cmdline__input');
    input.value = 'fm';
    input.setSelectionRange(2, 2);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(r));
    const list = document.querySelector('.bj-cmdline__list');
    return {
      ghost: document.querySelector('.bj-cmdline__ghost').textContent,
      first: (document.querySelector('.bj-cmdline__item-name') || {}).textContent,
      listRect: list ? { b: Math.round(list.getBoundingClientRect().bottom), h: Math.round(list.getBoundingClientRect().height), hidden: list.hidden } : null,
      barTop: Math.round(document.querySelector('.bj-strip').getBoundingClientRect().top),
      listAbove: list && !list.hidden ? list.getBoundingClientRect().bottom <= document.querySelector('.bj-strip').getBoundingClientRect().top + 1 : false,
    };
  });
  console.log('  typed:', JSON.stringify(typed));
  check(typed.ghost.startsWith('fm') && typed.ghost.length > 2, 'ghost text completes inline', typed.ghost);
  check(typed.first === 'fmt', 'the best candidate leads', String(typed.first));
  check(typed.listAbove, 'candidates rise above the bar, never pushing it');

  const ran = await page.evaluate(async () => {
    const input = document.querySelector('.bj-cmdline__input');
    input.value = '2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    return {
      closed: !StatusStrip.isCommandLineOpen(),
      line: CurrentEditor.getView().state.doc.lineAt(CurrentEditor.getView().state.selection.main.head).number,
    };
  });
  console.log('  ran:', JSON.stringify(ran));
  check(ran.closed, 'submitting closes the line');
  check(ran.line === 2, 'a bare number jumps to that line', String(ran.line));

  const unknown = await page.evaluate(async () => {
    StatusStrip.openCommandLine('');
    const input = document.querySelector('.bj-cmdline__input');
    input.value = 'fmtt';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    const msg = document.querySelector('.bj-strip__message');
    return msg ? msg.textContent : '';
  });
  console.log('  unknown:', JSON.stringify(unknown));
  check(/Unknown command/.test(unknown) && /fmt/.test(unknown),
    'an unknown command answers in the bar with the nearest match', unknown);

  await page.screenshot({ path: path.join(outDir, 'command-line.png') });
  await page.evaluate(() => {
    StatusStrip.closeCommandLine({ restore: false });
    StatusStrip.setMessage('');
  });
  await new Promise((r) => setTimeout(r, 250));

  // ── preview + history ───────────────────────────────────────────────────────
  const preview = await page.evaluate(async () => {
    const view = CurrentEditor.getView();
    // A document tall enough that scrolling is observable.
    const NL = String.fromCharCode(10);
    const filler = Array.from({ length: 200 }, (_, k) => '%% line ' + (k + 4)).join(NL);
    view.dispatch({ changes: { from: view.state.doc.length, insert: NL + filler } });
    view.dispatch({ selection: { anchor: 0, head: 0 }, scrollIntoView: true });
    await new Promise((r) => setTimeout(r, 200));
    const before = view.scrollDOM.scrollTop;
    const beforeCaret = view.state.selection.main.head;

    StatusStrip.openCommandLine('');
    const input = document.querySelector('.bj-cmdline__input');
    input.value = '180';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const during = view.scrollDOM.scrollTop;
    const duringCaret = view.state.selection.main.head;

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    return {
      before, during, after: view.scrollDOM.scrollTop,
      caretMoved: duringCaret !== beforeCaret,
      docLines: view.state.doc.lines,
    };
  });
  console.log('  preview:', JSON.stringify(preview));
  check(preview.during > preview.before, 'typing a line number scrolls it into view', JSON.stringify(preview));
  check(!preview.caretMoved, 'the preview never moves the caret');
  check(Math.abs(preview.after - preview.before) <= 2, 'aborting puts the viewport back', JSON.stringify(preview));

  const hist = await page.evaluate(async () => {
    StatusStrip.openCommandLine('');
    const input = document.querySelector('.bj-cmdline__input');
    input.value = '7';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    const stored = Persist.readStoredCommandLineHistory();
    // Re-open and walk the ring with ArrowUp on an empty line.
    StatusStrip.openCommandLine('');
    const input2 = document.querySelector('.bj-cmdline__input');
    input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await new Promise((r) => setTimeout(r, 150));
    const recalled = input2.value;
    StatusStrip.closeCommandLine({ restore: false });
    return { stored, recalled };
  });
  console.log('  history:', JSON.stringify(hist));
  check(hist.stored.indexOf('7') >= 0, 'the command line persists its history', JSON.stringify(hist.stored));
  check(hist.recalled === '7', 'ArrowUp on an empty line recalls it', hist.recalled);

  // ── incremental search ──────────────────────────────────────────────────────
  const isearch = await page.evaluate(async () => {
    const view = CurrentEditor.getView();
    view.dispatch({ selection: { anchor: 0, head: 0 }, scrollIntoView: true });
    await new Promise((r) => setTimeout(r, 150));
    const startSel = view.state.selection.main.head;
    const startScroll = view.scrollDOM.scrollTop;

    StatusStrip.openSearchLine(true);
    const input = document.querySelector('.bj-cmdline__input');
    const prompt = document.querySelector('.bj-cmdline__prompt').textContent;
    input.value = 'line 150';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    const count = document.querySelector('.bj-cmdline__count').textContent;
    const sel = view.state.selection.main;
    const matched = view.state.doc.sliceString(sel.from, sel.to);

    input.value = 'zzz-no-such-text';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    const missCount = document.querySelector('.bj-cmdline__count').textContent;

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    return {
      prompt, count, matched, missCount,
      restoredSel: view.state.selection.main.head === startSel,
      restoredScroll: Math.abs(view.scrollDOM.scrollTop - startScroll) <= 2,
    };
  });
  console.log('  isearch:', JSON.stringify(isearch));
  check(isearch.prompt === '/', 'search opens with its own prompt');
  check(isearch.matched === 'line 150', 'typing selects the live match', isearch.matched);
  check(/^\d+\/\d+$/.test(isearch.count), 'and counts the matches', isearch.count);
  check(isearch.missCount === 'no match', 'a miss says so', isearch.missCount);
  check(isearch.restoredSel, 'aborting restores the caret');
  check(isearch.restoredScroll, 'aborting restores the viewport');

  const accepted = await page.evaluate(async () => {
    const view = CurrentEditor.getView();
    view.dispatch({ selection: { anchor: 0, head: 0 } });
    StatusStrip.openSearchLine(true);
    const input = document.querySelector('.bj-cmdline__input');
    input.value = 'line 150';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    const sel = view.state.selection.main;
    return { open: StatusStrip.isCommandLineOpen(), text: view.state.doc.sliceString(sel.from, sel.to) };
  });
  check(!accepted.open && accepted.text === 'line 150',
    'Enter accepts the match and keeps it selected', JSON.stringify(accepted));

  // ── transient messages ──────────────────────────────────────────────────────
  // `:set`, which-key and every refusal speak through this one slot. It must
  // never push the segments around, must sit in the gap leftmost of the right
  // group, and must fade rather than snap.
  const msg = await page.evaluate(async () => {
    StatusStrip.setMessage('');
    // The command line hides the segment row, which would make every rect zero
    // and turn the "nothing moved" check into a tautology.
    StatusStrip.closeCommandLine({ restore: false });
    StatusStrip.apply();
    CommandPalette.close();
    await new Promise((r) => setTimeout(r, 350));

    // Geometry before anything speaks — nothing may move when it does.
    const boxOf = (sel) => {
      const el = document.querySelector(sel);
      return el ? Math.round(el.getBoundingClientRect().left) : null;
    };
    const bar = document.querySelector('.bj-strip');
    const before = {
      pos: boxOf('.bj-strip__seg--position'),
      checker: boxOf('.bj-strip__seg--checker'),
      barW: bar ? Math.round(bar.getBoundingClientRect().width) : 0,
      segW: Math.round((document.querySelector('.bj-strip__segments') || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width),
    };

    StatusStrip.setMessage('Word wrap off');
    await new Promise((r) => setTimeout(r, 60));
    const node = document.querySelector('.bj-strip__message');
    const mid = {
      text: node ? node.textContent : '',
      visible: node ? node.classList.contains('is-visible') : false,
      opacity: node ? getComputedStyle(node).opacity : '',
      segmentsStillThere: document.querySelectorAll('.bj-strip__seg').length,
      onRight: node && document.querySelector('.bj-strip__seg--position')
        ? node.getBoundingClientRect().left > document.querySelector('.bj-strip__seg--position').getBoundingClientRect().left
        : false,
      rects: { before, after: { pos: boxOf('.bj-strip__seg--position'), checker: boxOf('.bj-strip__seg--checker') } },
      noShift: before.pos === boxOf('.bj-strip__seg--position')
        && before.checker === boxOf('.bj-strip__seg--checker'),
      afterSpacer: node ? (node.previousElementSibling || {}).className === 'bj-strip__spacer' : false,
    };
    await new Promise((r) => setTimeout(r, 400));
    const faded = {
      visible: node ? node.classList.contains('is-visible') : false,
      opacity: node ? getComputedStyle(node).opacity : '',
    };
    return { mid, faded };
  });
  console.log('  message:', JSON.stringify(msg));
  check(msg.mid.text === 'Word wrap off', 'the message says what it was given', msg.mid.text);
  check(msg.mid.segmentsStillThere > 0, 'a message never replaces the bar content');
  check(msg.mid.onRight, 'it sits to the right of the position segment');
  // Guard against measuring a collapsed bar, which would make "nothing moved"
  // trivially true.
  check(msg.mid.rects.before.segW > 100,
    'the segment row is actually laid out when we measure', JSON.stringify(msg.mid.rects.before));
  check(msg.mid.noShift, 'showing a message moves nothing', JSON.stringify(msg.mid.rects));
  check(msg.mid.afterSpacer, 'it lives in the gap, leftmost of the right group');
  check(msg.mid.visible && Number(msg.faded.opacity) > 0.5, 'it fades in rather than snapping',
    JSON.stringify({ mid: msg.mid.opacity, faded: msg.faded.opacity }));

  const gone = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 3400));
    const node = document.querySelector('.bj-strip__message');
    return { visible: node ? node.classList.contains('is-visible') : false, opacity: node ? getComputedStyle(node).opacity : '' };
  });
  console.log('  faded:', JSON.stringify(gone));
  check(!gone.visible && Number(gone.opacity) < 0.1, 'and fades out on its own before long', JSON.stringify(gone));

  // ── a motion command actually moves ─────────────────────────────────────────
  const motion = await page.evaluate(async () => {
    const view = CurrentEditor.getView();
    view.dispatch({ selection: { anchor: 0, head: 0 } });
    await new Promise((r) => requestAnimationFrame(r));
    const before = view.state.selection.main.head;
    Commands.run('motion.line-down');
    await new Promise((r) => setTimeout(r, 120));
    const afterDown = view.state.selection.main.head;
    Commands.run('select.line-end');
    await new Promise((r) => setTimeout(r, 120));
    const sel = view.state.selection.main;
    return { before, afterDown, selected: sel.to - sel.from };
  });
  console.log('  motion:', JSON.stringify(motion));
  check(motion.afterDown > motion.before, 'motion.line-down moves the caret', JSON.stringify(motion));
  check(motion.selected > 0, 'select.line-end selects rather than moving', JSON.stringify(motion));

  // ── double-tap gesture ──────────────────────────────────────────────────────
  const gesture = await page.evaluate(async () => {
    Persist.writeStoredDoubleTapTrigger('shift');
    CommandPalette.close();
    const tap = () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', bubbles: true }));
    };
    // A capital letter between the taps must NOT fire it.
    tap();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', shiftKey: true, bubbles: true }));
    tap();
    await new Promise((r) => setTimeout(r, 120));
    const afterTyping = CommandPalette.isOpen();

    tap();
    tap();
    await new Promise((r) => setTimeout(r, 200));
    const afterDouble = CommandPalette.isOpen();
    CommandPalette.close();
    Persist.writeStoredDoubleTapTrigger('off');
    return { afterTyping, afterDouble };
  });
  console.log('  gesture:', JSON.stringify(gesture));
  check(!gesture.afterTyping, 'a key between the taps cancels the gesture');
  check(gesture.afterDouble, 'a clean Shift Shift opens the palette');

  // The gesture's TARGET is a setting, not a constant. The picker offers real
  // commands, and choosing one actually changes what the two taps do.
  const gestureTarget = await page.evaluate(async () => {
    SettingsUI.open();
    await new Promise((r) => setTimeout(r, 400));
    const tab = [...document.querySelectorAll('button, [role="tab"], .bj-settings__rail-item')]
      .find((el) => (el.textContent || '').trim() === 'Keys');
    if (tab) tab.click();
    await new Promise((r) => setTimeout(r, 350));
    const panel = document.querySelector('.bj-settings__panel[data-category="keybindings"]');
    const row = [...document.querySelectorAll('.bj-dialog__setting')]
      .find((r) => (r.querySelector('.bj-dialog__setting-label') || {}).textContent === 'Double-tap command');
    // The panel's own group heads. The keybindings sheet reuses the same class
    // for ITS section rows, so those are excluded by their `bj-kb__section`.
    const heads = panel
      ? [...panel.querySelectorAll('.bj-settings__section-head:not(.bj-kb__section)')]
        .map((h) => h.textContent.trim())
      : [];
    return {
      hasRow: !!row,
      heads,
      offered: DoubleTap.targets(),
      // Every row, in order, so the panel can be read rather than guessed at.
      rows: [...panel.querySelectorAll('.bj-dialog__setting')].map((r) => [
        (r.querySelector('.bj-dialog__setting-label') || {}).textContent || '',
        (r.querySelector('.bj-dialog__setting-desc') || {}).textContent || '',
      ]),
      headActions: [...panel.querySelectorAll('.bj-settings__panel-head > *')]
        .map((n) => n.textContent.trim()),
    };
  });
  // ⛔ A modal <dialog> lives in the browser's TOP LAYER, which no z-index can
  // beat, and FloatingWindow tops out at 4000 "below modal dialogs" BY DESIGN.
  // So a button in Settings that opened a floating window opened it UNDERNEATH
  // Settings, and read as a dead button. Opening is not the property to check —
  // being the topmost thing at its own coordinates is.
  const headAction = await page.evaluate(async () => {
    const btn = document.querySelector(
      '.bj-settings__panel[data-category="keybindings"] .bj-settings__head-action'
    );
    if (!btn) return { found: false };
    btn.click();
    await new Promise((r) => setTimeout(r, 700));
    const win = document.querySelector('.floating-window--macros');
    if (!win) return { found: true, opened: false };
    const box = win.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + 20);
    const out = {
      found: true,
      opened: true,
      settingsStillOpen: !!document.querySelector('dialog[open] .bj-settings__panel'),
      topmost: !!(hit && win.contains(hit)),
    };
    FloatingWindow.closeAll();
    return out;
  });
  console.log('  head action:', JSON.stringify(headAction));
  check(headAction.opened, 'the Keys head action opens Available macros');
  check(headAction.topmost,
    'and the window is ON TOP — a floating window behind a modal reads as a dead button',
    JSON.stringify(headAction));
  check(!headAction.settingsStillOpen, 'Settings steps out of the way rather than covering it');

  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 300));
  console.log('  gesture target:', JSON.stringify(gestureTarget));
  check(gestureTarget.hasRow, 'the Keys panel offers a gesture target picker');
  check(gestureTarget.offered.length > 3,
    `it offers ${gestureTarget.offered.length} real commands`);
  // ⛔ The style's options are SUBORDINATE to the Editing style row, not a
  // section beside it — so there is no Vim head and no Emacs head. They existed
  // once, and under Standard they were three dead rows advertising a mode you
  // are not in. Gestures is a real peer section and keeps its head.
  check(gestureTarget.heads.join(',') === 'Gestures',
    'the style options are nested, not a peer section', gestureTarget.heads.join(','));
  // ⛔ "Go and look at this" is a HEAD action beside Reset, never a settings row
  // with a button in the control column: nothing about it is configured.
  check(gestureTarget.headActions.join(' | ') === 'Keys | Available macros | Reset',
    'the Keys head carries its action beside Reset', gestureTarget.headActions.join(' | '));

  const retargeted = await page.evaluate(async () => {
    FloatingWindow.closeAll();
    CommandPalette.close();
    // A `dialog[open]` blocks the gesture by design (a modal owns the keyboard),
    // and the settings dialog above is exactly that — close it for real.
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    await new Promise((r) => setTimeout(r, 150));
    // The block above turned the trigger off again; the gesture only fires
    // while it is on.
    Persist.writeStoredDoubleTapTrigger('shift');
    Persist.writeStoredDoubleTapCommand('keys.macros');
    const tap = () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', bubbles: true }));
    };
    // A real human's two taps are tens of ms apart. Dispatched back to back in
    // the same millisecond the gap is 0, which `shouldFire` rejects on purpose.
    tap();
    await new Promise((r) => setTimeout(r, 40));
    tap();
    await new Promise((r) => setTimeout(r, 350));
    const out = {
      macrosOpen: !!document.querySelector('.floating-window--macros'),
      paletteOpen: CommandPalette.isOpen(),
      modalOpen: !!document.querySelector('dialog[open]'),
    };
    FloatingWindow.closeAll();
    Persist.writeStoredDoubleTapCommand('tools.palette');
    Persist.writeStoredDoubleTapTrigger('off');
    return out;
  });
  console.log('  retargeted:', JSON.stringify(retargeted));
  check(retargeted.macrosOpen, 'retargeted, the gesture runs the command it was pointed at');
  check(!retargeted.paletteOpen, 'and no longer opens the palette');

  // ── taken by the browser, inside Available macros ───────────────────────────
  //
  // ⛔ This was a floating "Reserved chords" sheet of its own, and it was bad: a
  // three-column table in which FIVE of nine rows read `—  —`, under an orange
  // headline, in a box that scrolled at nine rows. It printed a column of dashes
  // in the app whose macro list exists specifically to never do that, and it was
  // reachable only from the palette, so nobody saw it. It is a block of Available
  // macros now and the sheet is gone.
  const chords = await page.evaluate(async () => {
    FloatingWindow.closeAll();
    Commands.run('keys.macros');
    await new Promise((r) => setTimeout(r, 350));
    const win = document.querySelector('.floating-window--macros');
    const list = win.querySelector('.bj-macros__list');
    const head = [...list.querySelectorAll('.bj-macros__group')]
      .find((n) => /Taken by the browser$/.test(n.textContent));
    if (head) head.scrollIntoView({ block: 'start' });
    const facts = BelEditor.reservedChordFacts();
    // Rows in the block: everything between its heading and the next one.
    const rows = [];
    const asides = [];
    const meta = [];
    let inBlock = false;
    for (const n of list.children) {
      if (n.classList.contains('bj-macros__group')) {
        inBlock = /Taken by the browser$/.test(n.textContent);
        continue;
      }
      if (!inBlock) continue;
      if (n.classList.contains('bj-macros__aside')) { asides.push(n.textContent); continue; }
      if (n.classList.contains('bj-macros__row--meta')) { meta.push(n.textContent); continue; }
      rows.push({
        dead: (n.querySelector('.bj-macros__dead') || {}).textContent || '',
        gloss: (n.querySelector('.bj-macros__title') || {}).textContent || '',
        press: (n.querySelector('.bj-macros__keys') || {}).textContent || '',
        deadInKeys: !!n.querySelector('.bj-macros__keys .bj-macros__dead'),
      });
    }
    return {
      found: !!head,
      heading: head ? head.textContent : '',
      // Keys elsewhere in the window that only exist because the browser took
      // the one you would have reached for.
      starred: [...win.querySelectorAll('.bj-macros__star')]
        .map((n) => (n.closest('.bj-macros__row').querySelector('.bj-macros__chord') || {}).textContent),
      rows,
      asides,
      meta,
      isMac: facts.isMac,
      withSub: facts.rows.filter((r) => r.substitute && r.substitute !== '—').length,
      usableHere: facts.rows.filter((r) => r.substitute && r.substitute !== '—'
        && (!r.subStyle || r.subStyle === Persist.readStoredKeymapStyle())).length,
      without: facts.rows.filter((r) => !r.substitute || r.substitute === '—').length,
      // ⛔ THE rule of this window, applied to the block that used to break it.
      dashesAnywhere: [...win.querySelectorAll('.bj-macros__row')]
        .filter((r) => /—/.test(r.textContent)).length,
      sheetGone: !document.querySelector('.floating-window--chords'),
      commandGone: !Commands.get('keys.reserved-chords'),
    };
  });
  console.log('  taken-by-browser:', JSON.stringify(chords));
  check(chords.found, 'Available macros carries the taken-by-the-browser block');
  // ⛔ The heading wears the same mark a substituted key wears in the list above,
  // so you find the key where you look for keys and the explanation where
  // explanations go. Ctrl+M is a working macro; it belongs in the Ctrl block.
  check(/^\*/.test(chords.heading || ''),
    'and its heading carries the mark those keys wear', chords.heading);
  // ⚠ NOT under Standard: the substitutes that wear the mark (Ctrl+M, Alt+T,
  // Ctrl+Q) are Emacs handler bindings and are not offered here at all. The
  // marked keys are checked under Emacs, in `probe:keymap`.
  check(chords.starred.length === 0,
    'and under Standard no key wears it, because no substitute is live here',
    JSON.stringify(chords.starred));
  check(chords.commandGone && chords.sheetGone,
    'and the separate Reserved chords sheet is gone entirely');
  // ⛔ A substitute only counts in the style that BINDS it. This runs under
  // Standard, where `Ctrl+M`, `Alt+T`, `Ctrl+Q` and `Ctrl+U` do nothing at all —
  // they are Emacs handler bindings. Only `Alt+X`, a BelJar global, is live here.
  check(chords.rows.length === chords.usableHere,
    'one row per substitute that works IN THIS STYLE', JSON.stringify({
      rows: chords.rows.length, usableHere: chords.usableHere, withSub: chords.withSub,
    }));
  check(chords.rows.every((r) => !/Ctrl\+Q|Alt\+T|Ctrl\+U/.test(r.press)),
    'and no Emacs-only substitute is offered under Standard',
    JSON.stringify(chords.rows.map((r) => r.press)));
  check(chords.dashesAnywhere === 0,
    'and not one row in the whole window is a dash', String(chords.dashesAnywhere));
  // ⛔ A labelled closing ROW, in the window's own grammar — not a paragraph.
  check(chords.meta.some((m) => /^Also taken/.test(m)),
    'the chords with no substitute are one labelled row, not rows of nothing',
    JSON.stringify(chords.meta));
  check(chords.asides.length === 1 && chords.asides[0].length < 70,
    'and the block opens with ONE short line, not a paragraph',
    JSON.stringify(chords.asides));
  // ⛔ The keys column means "press this". A struck-through chord may never
  // appear in it — the dead chord is the row's SUBJECT and belongs on the left.
  check(chords.rows.every((r) => !r.deadInKeys),
    'the dead chord never sits in the keys column');
  check(chords.rows.every((r) => r.dead && r.press && r.gloss),
    'every row names the chord, what it did, and what to press',
    JSON.stringify(chords.rows));
  // ⚠ NOT `Ctrl+N → Ctrl+M` any more: that substitute is an Emacs binding, and
  // this runs under Standard. The one row here is the one BelJar itself answers.
  if (!chords.isMac) {
    check(chords.rows[0].dead === 'Ctrl+Shift+P' && /Alt\+X/.test(chords.rows[0].press),
      'the one live substitute under Standard is the one BelJar itself binds',
      JSON.stringify(chords.rows[0]));
  }

  // ── full keyboard ───────────────────────────────────────────────────────────
  // ⛔ The LOCK itself cannot be verified here: it needs real fullscreen, which
  // is exactly why S4 sat open. It was measured by hand (Chrome 152 / Win 11):
  // all ten reserved chords arrive AND their browser actions do not fire. What
  // is checkable here is everything around it.
  const fullKb = await page.evaluate(async () => {
    const before = FullKeyboard.isActive();
    // Exiting when it was never entered must be a no-op, not a throw.
    const exitNoop = await FullKeyboard.exit();
    const win = document.querySelector('.floating-window--macros');
    return {
      supported: FullKeyboard.isSupported(),
      // The way out is named where the taken chords are listed.
      offeredInBlock: [...win.querySelectorAll('.bj-macros__row--meta')]
        .some((n) => /[Ff]ull keyboard/.test(n.textContent)),
      activeAtRest: before,
      exitNoop,
      commandGated: Commands.list({ palette: true, available: true })
        .some((c) => c.id === 'keys.full-keyboard'),
    };
  });
  console.log('  full keyboard:', JSON.stringify(fullKb));
  check(fullKb.supported, 'Keyboard Lock is available in this browser');
  check(fullKb.offeredInBlock,
    'the way out is offered where the taken chords are listed');
  check(!fullKb.activeAtRest, 'it is off until asked for');
  check(fullKb.exitNoop === false, 'exiting when it never started is a no-op, not a throw');
  check(fullKb.commandGated, 'the command is offered where the API exists');

  await page.screenshot({ path: path.join(outDir, 'taken-by-browser.png') });
  await page.evaluate(() => FloatingWindow.closeAll());
  await new Promise((r) => setTimeout(r, 200));


} catch (e) {
  // Recorded, not reported here: `finish` runs once, from `finally`, so the
  // browser is closed exactly once and the crash is counted as a failed check.
  crash = e;
} finally {
  await finish('probe', crash);
}
