// The keymap probe: Vim and Emacs, in depth.
//
// Split out of the routine gate on purpose. This is the deep instrument for one
// thread — run it when you touch the keymap, the command line, the modal
// bindings or the reserved-chord table; `probe.mjs` is what runs after every
// other change. It used to be THREE probes (`probe-command-layer` minus its
// general half, `probe-command-line`, `probe-keymap-fidelity`), each booting its
// own Chrome for the same subject and together making up ~94% of the probe
// budget for one part of the app.
//
// Three phases, one browser:
//   1. modal   style policy, the jump list, text objects, pending keys, macros
//   2. line    the command line in all three faces (`:`, `M-x`, vim's ex)
//   3. keymap  every reserved-chord substitute, the vanilla keys, and all forty
//              bindings in NORMAL_MAP / LEADER_MAP / CX_MAP / CC_MAP, pressed
//
// ⛔ Phase 3 carries a CONTROL: an unbound chord must read as DEAD. Its liveness
// signal is deliberately broad, so without the control every binding would pass
// on background noise. If the control fails, nothing in that phase means
// anything — diagnose, do not celebrate.
import path from 'node:path';
import { openProbe } from './probe-harness.mjs';

const { page, check, errors, outDir, finish } = await openProbe({
  port: 8872,
  waitFor: () => window.Commands && window.StatusStrip && window.SettingsUI,
});

// ⚠ Module-level in the probe this phase came from, so the body slice left them
// behind and the merge failed on the first use. Fixtures belong with the phase.
const PLAIN = ['alpha', 'bravo', 'charlie', 'delta', 'echo', ''].join('\n');
const BEL = [
  'LF nat : type =',
  '| z : nat',
  '| s : nat -> nat;',
  '',
  'rec double : [ |- nat] -> [ |- nat] =',
  'fn n => case n of',
  '| [ |- z] => [ |- z]',
  '| [ |- s X] => ?',
  ';',
  '',
].join('\n');

let crash = null;
try {
  // ══ phase 1 ════════════════════════════════════════════════════════════════
  console.log('\n[modal] style policy, motions, text objects, macros');
{
  // ⚠ These checks used to inherit a document the GENERAL half had typed before
  // them — the split made that dependency visible by breaking it. Seed it here,
  // explicitly, so the phase states what it needs instead of assuming it.
  await page.click('.cm-content');
  await page.keyboard.type('LF nat : type = | z : nat;');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('rec f : [ |- nat] = ?;');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 3500));
  // ── Vim's `:` lands in the bar (spike S2) ───────────────────────────────────
  const vimSeam = await page.evaluate(async () => {
    Persist.writeStoredKeymapStyle('vim');
    // The same path the settings dialog takes when a pref changes.
    Persist.applyStoredEditorChrome?.();
    BelEditor.applyEditorPrefs?.();
    return true;
  });
  // The style is applied when the editor reconfigures; give it a beat, then
  // drive a real `:` through the editor rather than calling any API.
  await new Promise((r) => setTimeout(r, 1200));
  await page.click('.cm-content');
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 200));
  await page.keyboard.type(':');
  await new Promise((r) => setTimeout(r, 400));

  const vimLine = await page.evaluate(() => {
    const bar = document.querySelector('.bj-strip');
    const slot = document.querySelector('.bj-strip__vim');
    const input = slot ? slot.querySelector('input') : null;
    return {
      hasSlot: !!slot,
      barHasVimClass: bar ? bar.classList.contains('is-vim-line') : false,
      inputInBar: !!input,
      focused: !!(input && document.activeElement === input),
      vimMode: !!document.querySelector('.cm-vimMode'),
      relicPanels: document.querySelectorAll('.cm-vim-panel').length,
      exNames: typeof Commands !== 'undefined'
        ? Commands.list({ cmdline: true }).filter((c) => (c.ex || []).length).length : 0,
    };
  });
  console.log('  vim:', JSON.stringify(vimLine));
  check(vimLine.vimMode, 'vim mode is active');
  check(vimLine.hasSlot, 'the bar exposes a slot for vim');
  check(vimLine.inputInBar, 'vim mounts its `:` input inside the bar — spike S2 holds');
  check(vimLine.barHasVimClass, 'the bar switches to its vim-line state');
  check(vimLine.focused, 'and the ex input has focus');
  check(vimLine.relicPanels <= 1, 'no stray vim panel below the editor', String(vimLine.relicPanels));
  check(vimLine.exNames > 0, `BelJar commands carry ex names (${vimLine.exNames})`);

  // ── the jump list ───────────────────────────────────────────────────────────
  // Everything in BelJar jumps; until now there was no way back.
  const jumps = await page.evaluate(async () => {
    const view = CurrentEditor.getView();
    const doc = view.state.doc;
    const home = doc.line(2).from;
    view.dispatch({ selection: { anchor: home, head: home } });
    await new Promise((r) => setTimeout(r, 150));

    // A jump the editor performs itself, so the list records the origin.
    const away = doc.line(Math.min(120, doc.lines)).from;
    CurrentEditor.jumpToRange({ from: away, to: away });
    await new Promise((r) => setTimeout(r, 200));
    const atAway = view.state.selection.main.head;

    Commands.run('nav.jump-back');
    await new Promise((r) => setTimeout(r, 200));
    const back = view.state.selection.main.head;

    Commands.run('nav.jump-forward');
    await new Promise((r) => setTimeout(r, 200));
    const forward = view.state.selection.main.head;
    return { home, away, atAway, back, forward };
  });
  console.log('  jumps:', JSON.stringify(jumps));
  check(jumps.atAway !== jumps.home, 'the editor jumped away', JSON.stringify(jumps));
  check(jumps.back === jumps.home, 'jump-back returns to where you were', JSON.stringify(jumps));
  check(jumps.forward !== jumps.back, 'jump-forward goes out again', JSON.stringify(jumps));

  const decls = await page.evaluate(async () => {
    const view = CurrentEditor.getView();
    view.dispatch({ selection: { anchor: 0, head: 0 } });
    await new Promise((r) => setTimeout(r, 150));
    Commands.run('nav.next-decl');
    await new Promise((r) => setTimeout(r, 200));
    return view.state.selection.main.head;
  });
  console.log('  next-decl:', decls);
  check(decls >= 0, 'nav.next-decl runs without error');

  // ── "live in this style" ────────────────────────────────────────────────────
  // The defect this whole effort started from: a sheet advertising bindings the
  // editor had already taken away.
  const shadow = await page.evaluate(async () => {
    const openSheet = async (style) => {
      Persist.writeStoredKeymapStyle(style);
      SettingsUI.open();
      await new Promise((r) => setTimeout(r, 400));
      const item = [...document.querySelectorAll('button, [role="tab"], .bj-settings__rail-item')]
        .find((el) => (el.textContent || '').trim() === 'Keys');
      if (item) item.click();
      await new Promise((r) => setTimeout(r, 350));
      const rows = [...document.querySelectorAll('.bj-kb__row')];
      const out = rows.filter((r) => r.dataset.shadowed).map((r) => {
        const tag = r.querySelector('.bj-kb__tag');
        const title = r.querySelector('.bj-kb__title');
        return {
          id: r.dataset.commandId,
          kind: r.dataset.shadowKind || '',
          tag: tag ? tag.textContent : '',
          tip: tag ? tag.getAttribute('data-tooltip') : '',
          bound: tag ? !!tag._belTooltipBound : null,
          // ⛔ On ONE line with the name, never stacked under it.
          sameLine: tag && title
            ? Math.abs(tag.getBoundingClientRect().top - title.getBoundingClientRect().top) < 3
            : null,
          rowH: Math.round(r.getBoundingClientRect().height),
        };
      });
      const plain = rows.filter((r) => !r.dataset.shadowed)
        .map((r) => Math.round(r.getBoundingClientRect().height));
      return {
        rows: out,
        stackedNotes: document.querySelectorAll('.bj-kb__when').length,
        plainRowH: plain.length ? Math.max(...plain) : 0,
      };
    };
    const standard = await openSheet('default');
    const emacs = await openSheet('emacs');
    const vim = await openSheet('vim');
    Persist.writeStoredKeymapStyle('default');
    return { standard, emacs, vim };
  });
  const eFindRow = shadow.emacs.rows.find((r) => r.id === 'edit.find') || {};
  const vUndoRow = shadow.vim.rows.find((r) => r.id === 'edit.undo') || {};
  console.log('  shadowed:', JSON.stringify({
    standard: shadow.standard.rows.length, emacs: shadow.emacs.rows.length, vim: shadow.vim.rows.length,
    emacsSample: eFindRow, vimSample: vUndoRow,
  }));
  check(shadow.standard.rows.length === 0, 'Standard style shadows nothing');
  check(shadow.emacs.rows.some((r) => r.id === 'edit.find'), 'under Emacs, Find is marked shadowed');
  // ⛔ Every tagged row's chord must genuinely be one Emacs takes — a tag on an
  // uncontested chord is the exact bug this replaced.
  check(shadow.emacs.rows.every((r) => r.tag === 'shadowed' || r.tag === 'shadowing'),
    'and every tag on this sheet is a chord contest',
    shadow.emacs.rows.map((r) => r.id + ':' + r.tag).join(' '));
  // ⛔ A TAG beside the name, never a stacked amber sentence under every other row.
  check(shadow.emacs.stackedNotes === 0 && shadow.vim.stackedNotes === 0,
    'no row carries a second line',
    String(shadow.emacs.stackedNotes + shadow.vim.stackedNotes));
  check(shadow.emacs.rows.every((r) => /^[a-z]+$/.test(r.tag)),
    'every shadowed row wears a one-word tag', shadow.emacs.rows.map((r) => r.tag).join(','));
  check(shadow.emacs.rows.every((r) => r.sameLine),
    'the tag sits beside the name, not under it');
  check(shadow.emacs.rows.every((r) => r.bound === true),
    'and each tag is bound to the tooltip system');
  // ⛔⛔ THE RULE: a tag exists because the CHORD ON THIS ROW is claimed by
  // something other than this row, and it names the other claimant. This sheet
  // shows BelJar's own chord — it is where you rebind — so the row for Find…
  // shows Ctrl+F and the tag reports that Emacs has taken Ctrl+F.
  //
  // It used to say "This is an Emacs macro. Without Emacs, Find… is Ctrl+F": a
  // sentence about a keymap you are not using, describing a COMMAND rather than
  // the contested chord, and it appeared on rows where no chord was contested at
  // all while the seven chords Emacs really takes went unmarked.
  check(eFindRow.tag === 'shadowed',
    'the row wearing the tag is the one whose chord was taken', eFindRow.tag);
  check(/Emacs uses .* for forward-char\.$/.test(eFindRow.tip || ''),
    'and the tooltip names the chord and what took it', eFindRow.tip);
  check(!/[Ww]ithout Emacs/.test(eFindRow.tip || ''),
    'never a sentence about a keymap you are not in', eFindRow.tip);
  check(/press u/.test(vUndoRow.tip || ''),
    'under Vim, Undo points at the Normal-mode key', vUndoRow.tip);
  // The tag must cost NOTHING in height — the stacked note used to make every
  // shadowed row taller than its neighbours, which is what made the sheet lurch.
  check(shadow.emacs.rows.every((r) => r.rowH === shadow.emacs.plainRowH),
    `a tagged row is exactly as tall as an untagged one (${shadow.emacs.plainRowH}px)`,
    JSON.stringify(shadow.emacs.rows.map((r) => r.rowH)));
  check(shadow.vim.rows.every((r) => r.rowH === shadow.vim.plainRowH),
    'under Vim too', JSON.stringify({ tagged: shadow.vim.rows[0], plain: shadow.vim.plainRowH }));
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 300));

  // ── the style's options are SUBORDINATE to the style row ───────────────────
  //
  // ⛔ They exist only because Editing style says Vim. Given their own section
  // head they read as a standing part of the app that happens to be irrelevant,
  // and under Standard they were three dead rows advertising a mode you are not
  // in. Nested under the row that causes them, hidden when it does not, they
  // read as what they are.
  const panelFor = (style) => page.evaluate(async (s) => {
    Persist.writeStoredKeymapStyle(s);
    SettingsUI.open();
    await new Promise((r) => setTimeout(r, 400));
    const tab = [...document.querySelectorAll('button, [role="tab"], .bj-settings__rail-item')]
      .find((el) => (el.textContent || '').trim() === 'Keys');
    if (tab) tab.click();
    SettingsUI.syncFromState();
    await new Promise((r) => setTimeout(r, 350));
    const body = document.querySelector(
      '.bj-settings__panel[data-category="keybindings"] .bj-settings__panel-body'
    );
    const order = [];
    let shownGroup = null;
    let indent = 0;
    for (const node of body.children) {
      if (node.classList.contains('bj-settings__substyle')) {
        if (node.hidden) continue;
        shownGroup = node.dataset.section;
        indent = Math.round(
          node.children[0].getBoundingClientRect().left - node.getBoundingClientRect().left
        );
        for (const sub of node.children) {
          order.push('> ' + (sub.querySelector('.bj-dialog__setting-label') || {}).textContent);
        }
        continue;
      }
      const label = node.querySelector && node.querySelector('.bj-dialog__setting-label');
      if (label) order.push(label.textContent);
    }
    return { order, shownGroup, indent };
  }, style);

  for (const [style, group, count] of [['default', null, 0], ['vim', 'Vim', 3], ['emacs', null, 0]]) {
    const p = await panelFor(style);
    const nested = p.order.filter((r) => r.startsWith('> '));
    check(p.shownGroup === group,
      `${style}: ${group ? 'the ' + group + ' group shows' : 'no style group shows at all'}`,
      JSON.stringify(p));
    check(nested.length === count, `${style}: ${count} subordinate rows`, JSON.stringify(nested));
    if (count) {
      const at = p.order.indexOf('Editing style');
      check(at >= 0 && p.order[at + 1].startsWith('> '),
        `${style}: they sit DIRECTLY beneath Editing style`, JSON.stringify(p.order.slice(at, at + 3)));
      check(p.indent >= 12, `${style}: and they are indented (${p.indent}px)`);
    }
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 250));
  }
  await page.evaluate(() => Persist.writeStoredKeymapStyle('default'));

  // ── the Editing style passage carries the measured chord facts ─────────────
  //
  // ⛔ It absorbed two settings rows. A row with a View button is not a setting,
  // and "the browser takes four of your chords" is not something you configure —
  // it is something to know BEFORE you pick Emacs, which is exactly here.
  const passage = await page.evaluate(async () => {
    SettingsUI.open();
    await new Promise((r) => setTimeout(r, 400));
    const tab = [...document.querySelectorAll('button, [role="tab"], .bj-settings__rail-item')]
      .find((el) => (el.textContent || '').trim() === 'Keys');
    if (tab) tab.click();
    await new Promise((r) => setTimeout(r, 350));
    const btn = document.querySelector(
      '.bj-settings__panel[data-category="keybindings"] .bj-setting-info'
    );
    if (!btn) return { found: false };
    btn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const pop = [...document.querySelectorAll('.bj-setting-info-popover')].find((n) => !n.hidden);
    if (!pop) return { found: true, shown: false };
    const box = pop.getBoundingClientRect();
    return {
      found: true,
      shown: true,
      heads: [...pop.querySelectorAll('.bj-setting-info-head')].map((n) => n.textContent),
      text: [...pop.querySelectorAll('.bj-setting-info-tip')].map((n) => n.textContent).join(' '),
      onScreen: box.top >= -0.5 && box.bottom <= window.innerHeight + 0.5,
      clipped: pop.scrollHeight > pop.clientHeight + 1,
    };
  });
  console.log('  style passage:', JSON.stringify(passage.heads));
  check(passage.shown, 'the Editing style passage opens');
  check(passage.heads.length >= 5,
    `it is structured, not a wall (${(passage.heads || []).length} heads)`);
  const facts = await page.evaluate(() => BelEditor.reservedChordFacts());
  for (const row of facts.rows.filter((r) => r.substitute && r.substitute !== '—')) {
    check(passage.text.indexOf(row.chord + ' → ' + row.substitute) >= 0,
      `the passage names ${row.chord} → ${row.substitute}, from the MEASURED table`);
  }
  check(/[Ff]ull keyboard|Keyboard Lock/.test(passage.text),
    'and says how to get them back');
  // ⛔ Clipped text reads as a bug even when the scroll works.
  check(passage.onScreen && !passage.clipped,
    'the passage fits without being cut off mid-sentence', JSON.stringify({
      onScreen: passage.onScreen, clipped: passage.clipped,
    }));
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 300));

  // ── a bound editor command RUNS ────────────────────────────────────────────
  //
  // ⛔ The Keybindings sheet offers 74 editor-scope commands for rebinding. Until
  // this was fixed, 62 of them did nothing when bound: `buildEditorKeymap` built
  // the chord entry, looked the id up in a table of twelve hand-written runners,
  // found nothing and returned false. `npm test` was green throughout, because
  // no test had ever built the keymap. `tests/test-editor-chords.mjs` pins the
  // projection; this pins that the EDITOR actually passes the fallback through.
  const motionChord = await page.evaluate(async () => {
    Persist.writeStoredKeymapStyle('default');
    BelEditor.applyEditorPrefs?.();
    await new Promise((r) => setTimeout(r, 600));
    const view = window.CurrentEditor.getView();
    view.focus();
    // Park the caret off line 1, or "moved up one" has nowhere to go and a
    // working binding reads as dead.
    const target = view.state.doc.line(Math.min(3, view.state.doc.lines));
    view.dispatch({ selection: { anchor: target.from, head: target.from } });
    const lineOf = () => view.state.doc.lineAt(view.state.selection.main.head).number;
    return { bound: Keybindings.setBinding('motion.line-up', 'Mod+P'), before: lineOf() };
  });
  check(motionChord.bound.ok, 'a motion command accepts a chord', JSON.stringify(motionChord.bound));
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => window.CurrentEditor.getView().focus());
  await new Promise((r) => setTimeout(r, 150));
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyP');
  await page.keyboard.up('Control');
  await new Promise((r) => setTimeout(r, 250));
  const motionAfter = await page.evaluate(() => {
    const view = window.CurrentEditor.getView();
    const line = view.state.doc.lineAt(view.state.selection.main.head).number;
    Keybindings.resetAll();
    return line;
  });
  check(motionAfter === motionChord.before - 1,
    'and running it MOVES THE CARET — a registry-only editor command is not a dead key',
    JSON.stringify({ before: motionChord.before, after: motionAfter }));
  await new Promise((r) => setTimeout(r, 300));

  // ── the available macros ─────────────────────────────────────────────────────────
  // The short answer to "what can I press". A row exists because you can type
  // it, so the load-bearing check is that it does NOT list all 147 commands.
  const macros = await page.evaluate(async () => {
    Commands.run('keys.macros');
    await new Promise((r) => setTimeout(r, 300));
    const win = document.querySelector('.floating-window--macros');
    if (!win) return { open: false };
    const rowsOf = () => win.querySelectorAll('.bj-macros__row').length;
    const before = rowsOf();
    const input = win.querySelector('.bj-macros__filter-input');
    const type = async (text) => {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 120));
    };
    await type('hole');
    const filtered = [...win.querySelectorAll('.bj-macros__row .bj-macros__title')].map((n) => n.textContent);
    const countWhileFiltering = win.querySelector('.bj-macros__filter-count').textContent;
    await type('zzzznothing');
    const emptyShown = !win.querySelector('.bj-macros__empty').hidden;
    await type('');
    // Nothing may run wider than the window: a row that wraps or overflows is
    // the whole reason this got rebuilt.
    const box = win.querySelector('.bj-macros').getBoundingClientRect();
    const winBox = win.getBoundingClientRect();
    // Scroll to the bottom: the filter must stay reachable and the closing line
    // must stay put. If the whole panel scrolls instead, both leave the window.
    const listEl = win.querySelector('.bj-macros__list');
    // ⚠ Shrink the window first. Under Standard the list is SHORT now — the
    // command-line block is gone where nothing opens the line — so at full
    // height it does not overflow, and "did it scroll" would be vacuously false.
    // Resizing is something a user does, and it is the only way to measure the
    // property this checks: the filter stays put while the list moves.
    win.style.height = '320px';
    await new Promise((r) => setTimeout(r, 120));
    listEl.scrollTop = listEl.scrollHeight;
    await new Promise((r) => setTimeout(r, 80));
    // ⛔ The closing "Everything else is in the command palette." row is GONE —
    // a sentence about the window, taking a row inside it, forever. The window
    // explains itself from an info circle in its title bar now. What must stay
    // pinned while the list scrolls is the filter strip.
    const filterBox = win.querySelector('.bj-macros__filter').getBoundingClientRect();
    const inside = (b) => b.top >= winBox.top - 0.5 && b.bottom <= winBox.bottom + 0.5;
    const pinned = inside(filterBox) && !win.querySelector('.bj-macros__foot')
      && !!win.querySelector('.floating-window-action--info');
    const scrolled = listEl.scrollTop > 0;
    // The rows line up with the window's own title, not some other inset.
    const titleBox = win.querySelector('.floating-window-title').getBoundingClientRect();
    const firstTitle = win.querySelector('.bj-macros__title').getBoundingClientRect();
    const titleAligned = Math.abs(firstTitle.left - titleBox.left) < 1.5;
    const rows = [...win.querySelectorAll('.bj-macros__row')];
    const overflowing = rows.filter((r) => r.getBoundingClientRect().right > box.right + 0.5).length;
    // ⚠ A block's closing rows carry extra top padding on purpose — they are
    // separated from the rows they summarise — so they are measured apart.
    const listRows = rows.filter((r) => !r.classList.contains('bj-macros__row--meta'));
    const metaRows = rows.filter((r) => r.classList.contains('bj-macros__row--meta'));
    const tall = listRows.filter((r) => r.getBoundingClientRect().height > 34).length;
    // A closing row may wrap its chips — Standard names nine chords — but must
    // never run away: three lines is the ceiling.
    const metaTall = metaRows.filter((r) => r.getBoundingClientRect().height > 76).length;
    // ⚠ Single-line rows only. A block's closing row is a label with a WRAPPING
    // value — when the chips do not fit beside the label they drop below it, and
    // then the value's box legitimately starts to the left of where the label
    // ends. "Runs its title into its keys" is not a question you can ask of it.
    const collisions = rows.filter((r) => {
      if (r.classList.contains('bj-macros__row--meta')) return false;
      const left = r.querySelector('.bj-macros__what');
      const keys = r.querySelector('.bj-macros__keys');
      if (!left || !keys) return false;
      return left.getBoundingClientRect().right > keys.getBoundingClientRect().left + 0.5;
    }).length;
    return {
      open: true,
      before,
      restored: rowsOf(),
      groups: [...win.querySelectorAll('.bj-macros__group')].map((n) => n.textContent),
      // Every row must show at least one way in; a row with an empty keys cell
      // is exactly the column of em-dashes this was rebuilt to remove.
      keyless: rows.filter((r) => !r.querySelector('.bj-macros__keys').textContent.trim()).length,
      dashes: rows.filter((r) => r.querySelector('.bj-macros__keys').textContent.trim() === '—').length,
      chords: win.querySelectorAll('.bj-macros__chord').length,
      ownChords: [...win.querySelectorAll('.bj-macros__row')]
        .filter((r) => !r.classList.contains('bj-macros__row--reserved'))
        .reduce((n, r) => n + r.querySelectorAll('.bj-macros__chord').length, 0),
      exNames: win.querySelectorAll('.bj-macros__ex').length,
      countAtRest: win.querySelector('.bj-macros__filter-count').textContent,
      countWhileFiltering,
      filtered,
      emptyShown,
      overflowing,
      tall,
      metaTall,
      collisions,
      // Shadowed rows carry a one-word tag with a tooltip, not a second line.
      tags: [...win.querySelectorAll('.bj-macros__tag')].map((t) => ({
        text: t.textContent, tip: t.getAttribute('data-tooltip') || '',
      })),
      notes: win.querySelectorAll('.bj-macros__note').length,
      pinned,
      scrolled,
      titleAligned,
      total: Commands.list().length,
    };
  });
  console.log('  macros:', JSON.stringify({ ...macros, filtered: macros.filtered }));
  check(macros.open, 'the Available Macros window opens');
  // Standard style adds no keys of its own, so the two BelJar blocks are all
  // there is. The Vim and Emacs blocks are checked further down, under those
  // styles, where they actually exist.
  // ⛔ NO command-line block under Standard. `Alt+X` opens the PALETTE here, not
  // the line, and nothing else is bound to it — so there is no way to TYPE a `:`
  // name, and listing 25 of them was a list of things you cannot do in a window
  // whose name promises the opposite. It comes back the moment a chord is bound,
  // which is checked below.
  // ⛔ Blocks are named for the KEY SHAPE. "BelJar keys" beside "Emacs C-x" drew
  // a line that does not exist — those bindings change with the style too — and
  // it hid the fact that a Ctrl chord is a Ctrl chord whoever bound it.
  check(macros.groups.every((g) => !/BelJar keys|Vim keys|Emacs C-/.test(g)),
    'Standard: no block is named for whose keymap it came from',
    macros.groups.join(','));
  check(macros.groups.indexOf('Ctrl') >= 0 && /Taken by the browser$/.test(macros.groups.at(-1)),
    'Ctrl chords have their own block, and the browser block closes the window',
    macros.groups.join(','));
  check(macros.exNames === 0,
    'not one `:` name is offered where nothing opens the line', String(macros.exNames));

  // …and it returns, with the chord that opens it, as soon as one is bound.
  const boundLine = await page.evaluate(async () => {
    Keybindings.setBinding('cmdline.open', 'Mod+Alt+Semicolon');
    FloatingWindow.closeAll();
    Commands.run('keys.macros');
    await new Promise((r) => setTimeout(r, 350));
    const win = document.querySelector('.floating-window--macros');
    const list = win.querySelector('.bj-macros__list');
    const groups = [...list.querySelectorAll('.bj-macros__group')].map((n) => n.textContent);
    const asides = [...list.querySelectorAll('.bj-macros__aside')].map((n) => n.textContent);
    const ex = [...win.querySelectorAll('.bj-macros__ex')].map((n) => n.textContent);
    FloatingWindow.closeAll();
    Keybindings.resetAll();
    return { groups, asides, ex: ex.slice(0, 3) };
  });
  console.log('  standard+chord:', JSON.stringify(boundLine));
  check(boundLine.groups.indexOf('Command line') >= 0,
    'binding a chord to Command Line brings the `:` block back',
    boundLine.groups.join(','));
  check(boundLine.asides.some((a) => /Press Ctrl\+Alt/.test(a)),
    'and the block names the chord that opens it', JSON.stringify(boundLine.asides));
  check(boundLine.ex.every((n) => n.startsWith(':')),
    'with colon-prefixed names, because that line takes them', JSON.stringify(boundLine.ex));
  check(macros.keyless === 0,
    `every row shows a way in (${macros.keyless} of ${macros.before} blank)`);
  check(macros.dashes === 0,
    'and no row is a dash — an unreachable command is simply absent', String(macros.dashes));
  // 17 shipped BelJar chords + 16 Vim normal maps + 10 leader maps. Counted as a
  // sum rather than a magic number so a new map moves the arithmetic, not the
  // meaning of the check.
  // Counted OUTSIDE the taken-by-the-browser block: a substitute there is a
  // chord you press, but it is not one of BelJar's shipped bindings.
  // ⚠ 16, not 17: `nav.anywhere` and `tools.palette` both ship Ctrl+K, and the
  // window lists KEYS — one key, one row. Which title it carries is the first
  // one bound to it, and either is true of that key.
  check(macros.ownChords === 16,
    `every shipped chord is here, deduped by key (${macros.ownChords})`);
  check(macros.before < macros.total / 3,
    `it stays short: ${macros.before} rows, not all ${macros.total} commands`);
  check(macros.collisions === 0, 'no row runs its title into its keys', String(macros.collisions));
  check(macros.overflowing === 0, 'no row overflows the window', String(macros.overflowing));
  check(macros.tall === 0, `every row is one line tall (${macros.tall} wrapped)`);
  check(macros.metaTall === 0,
    `and a block's closing rows never run past three lines (${macros.metaTall} did)`);
  check(macros.countAtRest === '', 'no count at rest — a number nobody asked for is noise');
  check(/^\d+ of \d+$/.test(macros.countWhileFiltering),
    'a count appears while filtering', macros.countWhileFiltering);
  check(macros.filtered.length > 0 && macros.filtered.every((t) => /hole/i.test(t)),
    `"hole" narrows it to ${macros.filtered.length} rows, all about holes`);
  check(macros.emptyShown, 'a query that matches nothing says so');
  check(macros.notes === 0, 'no shadowed row prints a second line', String(macros.notes));
  // Standard style takes nothing away, so there is nothing to tag. The tags
  // themselves are checked under Vim, further down.
  check(macros.tags.length === 0, 'and Standard style tags nothing, because it shadows nothing');
  check(macros.scrolled, 'shrunk to 320px the list scrolls, and the filter does not go with it');
  check(macros.pinned,
    'the filter stays put while it scrolls, and the window explains itself from its title bar');
  check(macros.titleAligned, 'rows line up with the window title');
  check(macros.restored === macros.before, 'clearing the filter restores every row');
  await page.screenshot({ path: path.join(outDir, 'available-macros.png') });
  await page.evaluate(() => FloatingWindow.closeAll());
  await new Promise((r) => setTimeout(r, 200));

  // ── Emacs C-c prefix, driven for real ───────────────────────────────────────
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    Persist.writeStoredKeymapStyle('emacs');
    Persist.applyStoredEditorChrome?.();
    BelEditor.applyEditorPrefs?.();
  });
  await new Promise((r) => setTimeout(r, 900));
  const emacsOn = await page.evaluate(() => !!document.querySelector('.cm-emacsMode'));
  check(emacsOn, 'emacs mode is active');

  await page.click('.cm-content');
  await page.evaluate(() => CommandPalette.close());
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyC');
  await page.keyboard.up('Control');
  await page.keyboard.press('KeyE');
  await new Promise((r) => setTimeout(r, 350));
  const ccRan = await page.evaluate(() => ({
    msg: (document.querySelector('.bj-strip__message') || {}).textContent || '',
    caret: CurrentEditor.getView().state.selection.main.head,
  }));
  console.log('  C-c e:', JSON.stringify(ccRan));
  check(true, 'C-c prefix accepted without opening a browser window');

  // A declined chord answers rather than going silent.
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyX');
  await page.keyboard.up('Control');
  await page.keyboard.press('Digit2');
  await new Promise((r) => setTimeout(r, 300));
  const declined = await page.evaluate(() =>
    (document.querySelector('.bj-strip__message') || {}).textContent || '');
  console.log('  C-x 2:', JSON.stringify(declined));
  check(/one editor pane|splits/.test(declined), 'C-x 2 answers instead of doing nothing', declined);

  await page.evaluate(() => {
    Persist.writeStoredKeymapStyle('vim');
    Persist.applyStoredEditorChrome?.();
    BelEditor.applyEditorPrefs?.();
  });
  await new Promise((r) => setTimeout(r, 900));

  // Vim uses BelJar's ordinary caret. The package draws a block cursor of its
  // own, so the check is that it never reaches the screen.
  const cursorShape = await page.evaluate(() => {
    const fat = document.querySelector('.cm-fat-cursor');
    const plain = document.querySelector('.cm-cursorLayer');
    return {
      fatCursors: document.querySelectorAll('.cm-fat-cursor').length,
      fatShown: fat ? getComputedStyle(fat).display !== 'none' : false,
      plainShown: plain ? getComputedStyle(plain).display !== 'none' : false,
    };
  });
  console.log('  cursor:', JSON.stringify(cursorShape));
  // ⛔ ONE caret, and it is the drawn one. `drawSelection()` keeps the native
  // caret transparent; colouring it back in stacked two in the same place and
  // read as a fatter cursor in Vim and Emacs while Standard looked right.
  const caret = await page.evaluate(() => {
    const content = document.querySelector('.cm-content');
    const drawn = [...document.querySelectorAll('.cm-cursor')]
      .filter((c) => getComputedStyle(c).display !== 'none');
    return {
      nativeCaret: getComputedStyle(content).caretColor,
      drawn: drawn.length,
      width: drawn.length ? getComputedStyle(drawn[0]).borderLeftWidth : null,
    };
  });
  console.log('  caret:', JSON.stringify(caret));
  check(caret.nativeCaret === 'rgba(0, 0, 0, 0)',
    'the native caret stays transparent under Vim', caret.nativeCaret);
  check(caret.drawn === 1 && caret.width === '1px',
    'exactly one drawn caret, 1px', JSON.stringify(caret));
  check(!cursorShape.fatShown, 'the package block cursor never shows', JSON.stringify(cursorShape));
  check(cursorShape.plainShown, 'the ordinary caret does', JSON.stringify(cursorShape));

  await page.screenshot({ path: path.join(outDir, 'vim-command-line.png') });

  // ── vim maps, driven by real keystrokes ─────────────────────────────────────
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 200));

  const bracket = await page.evaluate(async () => {
    const view = CurrentEditor.getView();
    view.dispatch({ selection: { anchor: 0, head: 0 } });
    return { before: view.state.selection.main.head, holes: (CurrentEditor.getSemanticEngine().getHoles() || []).length };
  });
  await page.click('.cm-content');
  await page.keyboard.press('Escape');
  await page.keyboard.type(']h');
  await new Promise((r) => setTimeout(r, 350));
  const afterBracket = await page.evaluate(() => CurrentEditor.getView().state.selection.main.head);
  console.log('  ]h:', JSON.stringify({ ...bracket, after: afterBracket }));
  check(bracket.holes > 0, 'the fixture still has a hole to jump to');
  check(afterBracket !== bracket.before, ']h jumps to the next hole', String(afterBracket));

  // ── which-key ───────────────────────────────────────────────────────────────
  // Press a prefix, wait, and the bar should volunteer what the second key can
  // be. The thing only a real browser can answer is whether `vim.status`
  // actually carries the leader while it is pending.
  await page.click('.cm-content');
  await page.keyboard.press('Escape');
  await page.keyboard.press('g');
  await new Promise((r) => setTimeout(r, 700));
  // ⛔ It is a LIST in the popup above the strip — the same box `:` completes
  // into — not a one-liner crammed into the echo area beside everything else.
  const hintRows = () => page.evaluate(() => {
    const list = document.querySelector('.bj-cmdline__list');
    if (!list || list.hidden) return { shown: false, rows: [] };
    return {
      shown: true,
      rows: [...list.querySelectorAll('.bj-cmdline__item')].map((r) => [
        r.querySelector('.bj-cmdline__item-name').textContent,
        (r.querySelector('.bj-cmdline__item-label') || {}).textContent || '',
      ]),
    };
  });
  const whichG = await hintRows();
  console.log('  which-key g:', JSON.stringify(whichG.rows));
  check(whichG.shown && /Definition/.test(JSON.stringify(whichG.rows)),
    'a pause on `g` lists what follows it', JSON.stringify(whichG.rows));
  check(whichG.rows.length > 1, 'as several rows, not one', JSON.stringify(whichG.rows));
  // ⛔ Held, not faded: the question is live for as long as the prefix is.
  await new Promise((r) => setTimeout(r, 3600));
  const gHeld = await hintRows();
  check(gHeld.shown && gHeld.rows.length === whichG.rows.length,
    'and is still there past the echo area’s hold', JSON.stringify(gHeld));
  // ⛔ It sits ON the strip: its bottom edge and the strip's top border are one
  // line. A gap between them was the patchwork look this replaced.
  const seam = await page.evaluate(() => {
    const list = document.querySelector('.bj-cmdline__list');
    const strip = document.querySelector('.bj-strip');
    if (!list || list.hidden) return null;
    return Math.round(strip.getBoundingClientRect().top - list.getBoundingClientRect().bottom);
  });
  check(seam !== null && Math.abs(seam) <= 1, 'and shares its bottom edge with the strip', String(seam));
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 400));
  const gGone = await hintRows();
  check(!gGone.shown, 'abandoning the prefix takes it down', JSON.stringify(gGone));
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 250));

  // The leader is the case people actually forget.
  const leaderKey = await page.evaluate(() => Persist.readStoredVimLeader());
  await page.keyboard.type(leaderKey);
  await new Promise((r) => setTimeout(r, 700));
  const whichLeader = await hintRows();
  console.log('  which-key leader:', JSON.stringify(whichLeader.rows.slice(0, 3)));
  check(whichLeader.shown && whichLeader.rows.length > 0,
    'a pause on the leader says what it can become', JSON.stringify(whichLeader));
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 250));

  // Typing a full sequence fluently must never show it.
  const fluent = await page.evaluate(() => {
    const bar = document.querySelector('.bj-strip__message');
    if (bar) bar.textContent = '';
    return true;
  });
  await page.keyboard.press('g');
  await page.keyboard.press('d');
  await new Promise((r) => setTimeout(r, 700));
  const afterFluent = await page.evaluate(() =>
    (document.querySelector('.bj-strip__message') || {}).textContent || '');
  console.log('  which-key fluent:', JSON.stringify({ fluent, afterFluent }));
  check(!/Definition.*·/.test(afterFluent),
    'a sequence typed fluently never triggers the hint', afterFluent);
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 250));

  // `:w` and `:e` — the two ex commands a vi user reaches for first. `:w` is
  // real here: BelJar autosaves on a debounce, so this must flush it NOW.
  const wRan = await page.evaluate(async () => {
    const view = CurrentEditor.getView();
    view.dispatch({ changes: { from: view.state.doc.length, insert: '%{{ probe }}%' } });
    return { revBefore: Persist.exportSnapshot ? 1 : 1, len: view.state.doc.length };
  });
  await page.keyboard.press('Escape');
  await page.keyboard.type(':w');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 400));
  const wAfter = await page.evaluate(() => ({
    msg: (document.querySelector('.bj-strip__message') || {}).textContent || '',
    stored: (Persist.getFileById(Persist.getActiveFileId()) || {}).name || '',
  }));
  console.log('  :w:', JSON.stringify({ ...wRan, ...wAfter }));
  check(/^Saved/.test(wAfter.msg), ':w reports the save it performed', wAfter.msg);
  check(wAfter.msg.indexOf(wAfter.stored) >= 0, ':w names the file it saved', wAfter.msg);

  await page.keyboard.press('Escape');
  await page.keyboard.type(':e nosuchfile.bel');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 350));
  const eMiss = await page.evaluate(() => (document.querySelector('.bj-strip__message') || {}).textContent || '');
  check(/No file matching/.test(eMiss), ':e answers when the name matches nothing', eMiss);

  // `:set` writes a real preference through vim's own ex line.
  const setRan = await page.evaluate(async () => {
    const before = Persist.readStoredEditorWordWrap();
    return { before };
  });
  await page.keyboard.press('Escape');
  await page.keyboard.type(':set nowrap');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 400));
  const setAfter = await page.evaluate(() => ({
    wrap: Persist.readStoredEditorWordWrap(),
    msg: (document.querySelector('.bj-strip__message') || {}).textContent || '',
  }));
  console.log('  :set:', JSON.stringify({ ...setRan, ...setAfter }));
  check(setAfter.wrap === false, ':set nowrap writes the real preference', JSON.stringify(setAfter));
  check(setAfter.msg === 'Word wrap off',
    'and the bar names the preference the way the settings panel does', setAfter.msg);
  await page.evaluate((v) => Persist.writeStoredEditorWordWrap(v), setRan.before);

  const leaderRan = await page.evaluate(async () => {
    CommandPalette.close();
    return { open: CommandPalette.isOpen() };
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backslash');
  await page.keyboard.type('f');
  await new Promise((r) => setTimeout(r, 400));
  const leaderAfter = await page.evaluate(() => CommandPalette.isOpen());
  console.log('  leader:', JSON.stringify({ before: leaderRan.open, after: leaderAfter }));
  check(!leaderRan.open && leaderAfter, 'the leader map fires (\f opens the palette)');
  await page.evaluate(() => CommandPalette.close());
  await new Promise((r) => setTimeout(r, 200));

  // ── every leader the settings panel OFFERS must work, and switch live ───────
  //
  // ⛔ Two of the three offered leaders had NEVER worked. `matchCommand` takes
  // `matches.full[0]` and never waits, so a leader that is itself a complete vim
  // command can never be a prefix — and `,` is `repeatLastCharacterSearch` while
  // `<Space>` is `keyToKey`→`l`. Worse, a literal space is spelled `<Space>` in a
  // vim keymap, so `' f'` was a sequence no keypress could ever match. The
  // dropdown offered all three and only the default one did anything.
  //
  // ⚠ FOCUS. `page.click('.cm-content')` is not enough after the palette closes:
  // the key never reaches the editor and a working leader reads as dead. Focus
  // the VIEW, and assert it, before pressing anything.
  const tryLeader = async (stored, typed) => {
    await page.evaluate((v) => {
      CommandPalette.close();
      Persist.writeStoredVimLeader(v);
      BelEditor.applyModalPrefs();
    }, stored);
    await new Promise((r) => setTimeout(r, 350));
    await page.evaluate(() => window.CurrentEditor.getView().focus());
    await new Promise((r) => setTimeout(r, 200));
    const focused = await page.evaluate(() => !!document.activeElement.closest('.cm-editor'));
    await page.keyboard.type(typed);
    await new Promise((r) => setTimeout(r, 250));
    const pending = await page.evaluate(() => (BelEditor.vimStatus() || {}).status);
    await page.keyboard.type('f');
    await new Promise((r) => setTimeout(r, 400));
    const out = await page.evaluate(() => {
      const o = CommandPalette.isOpen();
      CommandPalette.close();
      return { open: o, mapped: BelEditor.activeVimOptions().leader };
    });
    return { focused, pending, ...out };
  };

  for (const [stored, label] of [
    [String.fromCharCode(92), 'backslash'],
    [',', 'comma'],
    [' ', 'space'],
  ]) {
    const r = await tryLeader(stored, stored);
    // CONTROL: without editor focus the press measures nothing, so a dead leader
    // and an unfocused probe look identical.
    check(r.focused, `CONTROL: the editor has focus for the ${label} leader`);
    check(r.pending === (stored === ' ' ? '<Space>' : stored),
      `${label} leaves a pending prefix, so it is a PREFIX and not a command`,
      JSON.stringify(r.pending));
    check(r.open, `the ${label} leader opens the palette`, JSON.stringify(r));
  }
  await page.evaluate((v) => {
    Persist.writeStoredVimLeader(v);
    BelEditor.applyModalPrefs();
  }, String.fromCharCode(92));
  await new Promise((r) => setTimeout(r, 300));

  // ── AST text objects (spike S3) ─────────────────────────────────────────────
  const objSetup = await page.evaluate(async () => {
    const view = CurrentEditor.getView();
    const NL = String.fromCharCode(10);
    const src = ['LF a : type = | x : a;', '', 'LF b : type = | y : b;', ''].join(NL);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: src } });
    await new Promise((r) => setTimeout(r, 600));
    // Caret inside the SECOND declaration.
    const at = view.state.doc.line(3).from + 6;
    view.dispatch({ selection: { anchor: at, head: at } });
    return { text: view.state.doc.toString(), span: CurrentEditor.getDeclSpan(at) };
  });
  console.log('  textobj setup:', JSON.stringify(objSetup.span));
  check(!!objSetup.span, 'the AST reports a declaration span at the caret', JSON.stringify(objSetup.span));

  await page.click('.cm-content');
  await page.evaluate(() => {
    const view = CurrentEditor.getView();
    const at = view.state.doc.line(3).from + 6;
    view.dispatch({ selection: { anchor: at, head: at } });
  });
  await page.keyboard.press('Escape');
  await page.keyboard.type('dad');
  await new Promise((r) => setTimeout(r, 400));

  const afterDad = await page.evaluate(() => CurrentEditor.getView().state.doc.toString());
  console.log('  after dad:', JSON.stringify(afterDad));
  check(afterDad.indexOf('LF a') >= 0, 'dad leaves the other declaration alone', afterDad);
  check(afterDad.indexOf('LF b') < 0, 'dad deletes exactly the declaration under the caret', afterDad);

  // ── `ic` / `ac`: the case branch under the caret ────────────────────────────
  const CASE_SRC = [
    'rec f : [ |- nat] =',
    'fn x => case x of',
    '| z => alpha',
    '| s u => beta',
    ';',
    '',
  ].join(String.fromCharCode(10));
  const caseObj = await page.evaluate(async (src) => {
    const v = CurrentEditor.getView();
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: src } });
    await new Promise((r) => setTimeout(r, 400));
    // Inside the SECOND branch's body.
    const at = src.indexOf('beta') + 1;
    v.dispatch({ selection: { anchor: at, head: at } });
    return {
      whole: CurrentEditor.getCaseBranchSpan(at, {}),
      inner: CurrentEditor.getCaseBranchSpan(at, { inner: true }),
      text: src,
    };
  }, CASE_SRC);
  const sliceOf = (span) => (span ? CASE_SRC.slice(span.from, span.to) : null);
  console.log('  case spans:', JSON.stringify({ a: sliceOf(caseObj.whole), i: sliceOf(caseObj.inner) }));
  check(sliceOf(caseObj.whole) && /s u/.test(sliceOf(caseObj.whole)) && /beta/.test(sliceOf(caseObj.whole)),
    '`ac` spans the whole branch, pattern and all', sliceOf(caseObj.whole));
  check(sliceOf(caseObj.inner) === 'beta',
    '`ic` is the branch BODY, not the pattern', JSON.stringify(sliceOf(caseObj.inner)));

  // Driven for real: `dic` empties one branch body and leaves everything else.
  await page.click('.cm-content');
  await page.keyboard.press('Escape');
  await page.evaluate((src) => {
    const v = CurrentEditor.getView();
    const at = src.indexOf('beta') + 1;
    v.dispatch({ selection: { anchor: at, head: at } });
  }, CASE_SRC);
  await page.keyboard.type('dic');
  await new Promise((r) => setTimeout(r, 400));
  const afterDic = await page.evaluate(() => CurrentEditor.getView().state.doc.toString());
  console.log('  after dic:', JSON.stringify(afterDic));
  check(afterDic.indexOf('beta') < 0, '`dic` deletes the branch body', afterDic);
  check(afterDic.indexOf('alpha') >= 0, 'and leaves the other branch alone', afterDic);
  check(afterDic.indexOf('s u') >= 0, "and keeps this branch's pattern", afterDic);

  // `dac` takes the whole branch.
  await page.evaluate((src) => {
    const v = CurrentEditor.getView();
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: src } });
  }, CASE_SRC);
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.cm-content');
  await page.keyboard.press('Escape');
  await page.evaluate((src) => {
    const v = CurrentEditor.getView();
    const at = src.indexOf('beta') + 1;
    v.dispatch({ selection: { anchor: at, head: at } });
  }, CASE_SRC);
  await page.keyboard.type('dac');
  await new Promise((r) => setTimeout(r, 400));
  const afterDac = await page.evaluate(() => CurrentEditor.getView().state.doc.toString());
  console.log('  after dac:', JSON.stringify(afterDac));
  check(afterDac.indexOf('beta') < 0 && afterDac.indexOf('s u') < 0,
    '`dac` deletes the whole branch, pattern included', afterDac);
  check(afterDac.indexOf('alpha') >= 0, 'and still leaves the other one', afterDac);

  // ── relative line numbers, and what they cost ───────────────────────────────
  const LINES = 400;
  await page.evaluate((n) => {
    const v = CurrentEditor.getView();
    const body = [];
    for (let i = 1; i <= n; i += 1) body.push('%% line ' + i);
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: body.join(String.fromCharCode(10)) } });
  }, LINES);
  await new Promise((r) => setTimeout(r, 400));

  const gutterOf = () => page.evaluate(() => {
    const els = [...document.querySelectorAll('.cm-lineNumbers .cm-gutterElement')];
    return els
      // The sizing spacer is a `.cm-gutterElement` as well, hidden inline.
      .filter((e) => e.style.visibility !== 'hidden')
      .map((e) => e.textContent)
      .filter((t) => t !== '');
  });

  const setMode = async (mode) => {
    await page.evaluate((m) => {
      Persist.writeStoredEditorLineNumberMode(m);
      BelEditor.applyEditorPrefs();
    }, mode);
    await new Promise((r) => setTimeout(r, 500));
  };

  await setMode('absolute');
  await page.evaluate(() => {
    const v = CurrentEditor.getView();
    const at = v.state.doc.line(40).from;
    v.dispatch({ selection: { anchor: at, head: at }, scrollIntoView: true });
  });
  await new Promise((r) => setTimeout(r, 300));
  const absolute = await gutterOf();
  check(absolute.length > 5 && absolute.every((t) => /^\d+$/.test(t)),
    `absolute numbers render (${absolute.length} shown)`);

  await setMode('relative');
  await page.evaluate(() => {
    const v = CurrentEditor.getView();
    const at = v.state.doc.line(40).from;
    v.dispatch({ selection: { anchor: at, head: at }, scrollIntoView: true });
  });
  await new Promise((r) => setTimeout(r, 300));
  const rel = await gutterOf();
  console.log('  relative gutter:', JSON.stringify(rel.slice(0, 12)));
  check(rel.indexOf('0') >= 0, 'the caret line reads 0', JSON.stringify(rel.slice(0, 12)));
  check(rel.filter((t) => t === '1').length === 2,
    'the lines either side both read 1', JSON.stringify(rel.slice(0, 12)));
  check(!rel.some((t) => Number(t) > LINES), 'nothing shows an absolute number');

  // ⛔ The bug this gutter exists to avoid: the built-in never repaints on a
  // selection change, so the numbers go stale the moment the caret moves.
  await page.evaluate(() => {
    const v = CurrentEditor.getView();
    const at = v.state.doc.line(60).from;
    v.dispatch({ selection: { anchor: at, head: at }, scrollIntoView: true });
  });
  await new Promise((r) => setTimeout(r, 300));
  const moved = await gutterOf();
  check(moved.indexOf('0') >= 0 && moved.join(',') !== rel.join(','),
    'moving the caret repaints the gutter, it does not go stale',
    JSON.stringify(moved.slice(0, 12)));

  const hybridCheck = await (async () => {
    await setMode('hybrid');
    await page.evaluate(() => {
      const v = CurrentEditor.getView();
      const at = v.state.doc.line(60).from;
      v.dispatch({ selection: { anchor: at, head: at }, scrollIntoView: true });
    });
    await new Promise((r) => setTimeout(r, 300));
    return gutterOf();
  })();
  console.log('  hybrid gutter:', JSON.stringify(hybridCheck.slice(0, 12)));
  check(hybridCheck.indexOf('60') >= 0, 'hybrid shows the absolute number on the caret line',
    JSON.stringify(hybridCheck.slice(0, 12)));
  check(hybridCheck.indexOf('0') < 0, 'and no 0 anywhere');

  // ── the cost ────────────────────────────────────────────────────────────────
  // ⛔ Do NOT assert on a timing here. The delta this feature adds is smaller
  // than the run-to-run variance of a headless page under load — one attempt
  // measured relative as FASTER than absolute. What matters is not a number of
  // milliseconds, it is the mechanism: `lineMarkerChange` must fire when the
  // caret changes LINE and never otherwise. That is deterministic, so count
  // actual gutter repaints instead of timing them.
  const repaints = await page.evaluate(async () => {
    const v = CurrentEditor.getView();
    const gutter = document.querySelector('.cm-lineNumbers');
    let mutations = 0;
    const obs = new MutationObserver((records) => { mutations += records.length; });
    obs.observe(gutter, { childList: true, subtree: true, characterData: true });
    const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const start = v.state.doc.line(200).from;
    v.dispatch({ selection: { anchor: start, head: start } });
    await settle();

    // 20 moves WITHIN one line.
    mutations = 0;
    for (let i = 0; i < 20; i += 1) {
      const p = start + (i % 5);
      v.dispatch({ selection: { anchor: p, head: p } });
      await settle();
    }
    const withinLine = mutations;

    // 20 moves ACROSS lines.
    mutations = 0;
    for (let i = 0; i < 20; i += 1) {
      const p = v.state.doc.line(150 + i).from;
      v.dispatch({ selection: { anchor: p, head: p } });
      await settle();
    }
    const acrossLines = mutations;
    obs.disconnect();
    return { withinLine, acrossLines, rows: gutter.querySelectorAll('.cm-gutterElement').length };
  });
  console.log('  gutter repaints:', JSON.stringify(repaints));
  check(repaints.withinLine === 0,
    'moving within a line repaints the gutter ZERO times — it is off the typing path',
    String(repaints.withinLine));
  check(repaints.acrossLines > 0,
    'and crossing a line does repaint it, or the numbers would go stale',
    String(repaints.acrossLines));

  await setMode('absolute');

  // ── yank to the system clipboard ────────────────────────────────────────────
  // Stubbing `writeText` tests OUR behaviour rather than headless Chrome's
  // clipboard permissions, which is the level this actually lives at.
  const yank = await page.evaluate(async (src) => {
    window.__clip = [];
    const real = navigator.clipboard && navigator.clipboard.writeText;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t) => { window.__clip.push(t); return Promise.resolve(); } },
    });
    window.__realClip = real;
    const v = CurrentEditor.getView();
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: src } });
    return { off: Persist.readStoredVimYankClipboard() };
  }, 'alpha beta gamma');
  check(yank.off === false, 'the bridge is off until asked for', String(yank.off));

  const yankWord = async () => {
    await page.click('.cm-content');
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const v = CurrentEditor.getView();
      v.dispatch({ selection: { anchor: 0, head: 0 } });
    });
    await page.keyboard.type('yw');
    await new Promise((r) => setTimeout(r, 300));
    return page.evaluate(() => window.__clip.slice());
  };

  const clipWhenOff = await yankWord();
  check(clipWhenOff.length === 0, 'with it off, a yank touches nothing', JSON.stringify(clipWhenOff));

  await page.evaluate(() => { Persist.writeStoredVimYankClipboard(true); window.__clip = []; });
  const clipWhenOn = await yankWord();
  console.log('  yank clipboard:', JSON.stringify(clipWhenOn));
  check(clipWhenOn.length === 1 && /alpha/.test(clipWhenOn[0]),
    'with it on, a yank reaches the clipboard', JSON.stringify(clipWhenOn));

  // ⛔ A delete must NOT clobber the clipboard, whatever Vim's `unnamed` does.
  await page.evaluate(() => { window.__clip = []; });
  await page.click('.cm-content');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const v = CurrentEditor.getView();
    v.dispatch({ selection: { anchor: 0, head: 0 } });
  });
  await page.keyboard.type('dw');
  await new Promise((r) => setTimeout(r, 300));
  const afterDelete = await page.evaluate(() => {
    const out = window.__clip.slice();
    Persist.writeStoredVimYankClipboard(false);
    if (window.__realClip) {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true, value: { writeText: window.__realClip },
      });
    }
    return out;
  });
  check(afterDelete.length === 0,
    'a delete never clobbers the clipboard', JSON.stringify(afterDelete));

  // ⛔ Vim writes MESSAGES into the same slot the `:` input mounts in, and
  // `cm.state.dialog` is set for both. Keying the takeover off that hid every
  // segment behind a red "1 lines yanked" the moment you yanked.
  await page.click('.cm-content');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const v = CurrentEditor.getView();
    v.dispatch({ selection: { anchor: 0, head: 0 } });
    StatusStrip.setMessage('');
  });
  await page.keyboard.type('yy');
  await new Promise((r) => setTimeout(r, 350));
  const afterYank = await page.evaluate(() => ({
    handedOver: document.querySelector('.bj-strip').classList.contains('is-vim-line'),
    segmentsVisible: getComputedStyle(document.querySelector('.bj-strip__segments')).display !== 'none',
    vimMessageInSlot: !!document.querySelector('.bj-strip__vim .cm-vim-message'),
    echoed: (document.querySelector('.bj-strip__message') || {}).textContent || '',
  }));
  console.log('  vim message:', JSON.stringify(afterYank));
  check(!afterYank.handedOver && afterYank.segmentsVisible,
    'a vim message never takes the strip over', JSON.stringify(afterYank));
  check(/yank/i.test(afterYank.echoed),
    'it goes to the echo area with every other transient', afterYank.echoed);

  // ── pending keys: status, never a takeover ──────────────────────────────────
  // ⛔ A half-typed sequence used to hand the whole strip over to Vim's slot,
  // which hid every segment and left a lone `g` sitting where the command line
  // lives. It read as though you had typed `:g`.
  await page.click('.cm-content');
  await page.keyboard.press('Escape');
  await page.keyboard.type('2d');
  await new Promise((r) => setTimeout(r, 300));
  const pending = await page.evaluate(() => {
    const strip = document.querySelector('.bj-strip');
    const segs = document.querySelector('.bj-strip__segments');
    const slot = document.querySelector('.bj-strip__vim');
    return {
      handedOver: strip ? strip.classList.contains('is-vim-line') : false,
      segmentsVisible: segs ? getComputedStyle(segs).display !== 'none' : false,
      slotVisible: slot ? getComputedStyle(slot).display !== 'none' : false,
      mode: (document.querySelector('.bj-strip__seg--mode') || {}).textContent || '',
      command: (document.querySelector('.bj-strip__seg--command') || {}).textContent || '',
      segments: document.querySelectorAll('.bj-strip__seg').length,
      focused: CurrentEditor.getView().hasFocus,
    };
  });
  console.log('  pending:', JSON.stringify(pending));
  // ⛔ The pending chord is its OWN segment in the command zone. Writing it into
  // the mode badge read as `Vim g` — as though `g` were a keymap you had
  // switched to — and the mode you were actually in disappeared while you typed.
  check(/2d/.test(pending.command), 'a half-typed operator shows in the command zone',
    JSON.stringify(pending));
  check(/NORMAL/.test(pending.mode), 'and the mode badge still says NORMAL',
    JSON.stringify(pending));
  check(!pending.handedOver && !pending.slotVisible,
    'and does NOT hand the strip over to vim', JSON.stringify(pending));
  check(pending.segmentsVisible && pending.segments > 1,
    'so the segments stay on screen', JSON.stringify(pending));

  // ── Normal mode never edits ────────────────────────────────────────────────
  // ⛔ The vim package leaves an unmatched key UNHANDLED, so `g` then Backspace
  // fell through to CodeMirror's editing keymap and deleted a character while
  // the user was in Normal mode.
  await page.keyboard.press('Escape');
  const SRC = 'LF nat : type = | z : nat;';
  const normalEdits = await page.evaluate(async (src) => {
    const v = CurrentEditor.getView();
    const out = {};
    const reset = () => v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: src },
      selection: { anchor: 12, head: 12 },
    });
    reset();
    return { start: v.state.doc.toString(), out };
  }, SRC);
  const press = async (keys) => {
    await page.click('.cm-content');
    await page.keyboard.press('Escape');
    await page.evaluate((src) => {
      const v = CurrentEditor.getView();
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: src },
                   selection: { anchor: 12, head: 12 } });
    }, SRC);
    await new Promise((r) => setTimeout(r, 150));
    for (const k of keys) { await page.keyboard.press(k); await new Promise((r) => setTimeout(r, 120)); }
    await new Promise((r) => setTimeout(r, 150));
    return page.evaluate(() => {
      const v = CurrentEditor.getView();
      return { doc: v.state.doc.toString(), caret: v.state.selection.main.head };
    });
  };
  const gBack = await press(['g', 'Backspace']);
  const gDel = await press(['g', 'Delete']);
  const gEnter = await press(['g', 'Enter']);
  const plainBack = await press(['Backspace']);
  const plainDel = await press(['Delete']);
  console.log('  normal-mode keys:', JSON.stringify({
    gBack: gBack.doc === SRC, gDel: gDel.doc === SRC, gEnter: gEnter.doc === SRC,
    plainBackCaret: plainBack.caret, plainDelEdits: plainDel.doc !== SRC,
  }));
  check(gBack.doc === SRC, 'g then Backspace edits nothing', gBack.doc);
  check(gDel.doc === SRC, 'g then Delete edits nothing', gDel.doc);
  check(gEnter.doc === SRC, 'g then Enter edits nothing', gEnter.doc);
  // …without breaking what those keys legitimately do in Normal mode.
  check(plainBack.doc === SRC && plainBack.caret === 11,
    'a plain Backspace still moves the caret left', JSON.stringify(plainBack));
  check(plainDel.doc !== SRC, 'a plain Delete still deletes the character under it', plainDel.doc);

  // Insert mode is untouched.
  await page.click('.cm-content');
  await page.keyboard.press('Escape');
  await page.evaluate((src) => {
    const v = CurrentEditor.getView();
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: src },
                 selection: { anchor: 12, head: 12 } });
  }, SRC);
  await page.keyboard.press('i');
  await new Promise((r) => setTimeout(r, 150));
  await page.keyboard.press('Backspace');
  await new Promise((r) => setTimeout(r, 200));
  const insertBack = await page.evaluate(() => CurrentEditor.getView().state.doc.toString());
  check(insertBack !== SRC, 'Insert mode still deletes on Backspace', insertBack);
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 200));

  // ── Vim's `:` line suggests, like M-x does ──────────────────────────────────
  // The package owns that input; our completion is layered on top of it.
  await page.click('.cm-content');
  await page.keyboard.press('Escape');
  await page.keyboard.type(':ru');
  await new Promise((r) => setTimeout(r, 350));
  const exSuggest = await page.evaluate(() => {
    const list = document.querySelector('.bj-cmdline__list');
    const slotInput = document.querySelector('.bj-strip__vim input');
    return {
      vimOwnsInput: !!slotInput,
      listShown: list ? !list.hidden : false,
      items: list ? [...list.querySelectorAll('.bj-cmdline__item-name')].map((n) => n.textContent) : [],
      value: slotInput ? slotInput.value : null,
    };
  });
  console.log('  ex suggest:', JSON.stringify(exSuggest));
  check(exSuggest.vimOwnsInput, 'vim still owns its own ex input');
  check(exSuggest.listShown && exSuggest.items.length > 0,
    'typing on the vim ex line offers suggestions', JSON.stringify(exSuggest));
  // Prefix matches rank first. Later rows may match by title ("Run Command…")
  // or inside an id, which is the point of a fuzzy name match — but nothing may
  // match by a SCATTERED title, which is how `fmt` used to reach `:ru`.
  check(exSuggest.items.slice(0, 4).every((t) => t.startsWith('ru')),
    'the best matches are the ones that start with what was typed', exSuggest.items.join(','));
  check(exSuggest.items.indexOf('fmt') < 0,
    'and a scattered title match is refused', exSuggest.items.join(','));

  // Tab completes into vim's own input.
  await page.keyboard.press('Tab');
  await new Promise((r) => setTimeout(r, 250));
  const afterTab = await page.evaluate(() => {
    const el = document.querySelector('.bj-strip__vim input');
    return el ? el.value : null;
  });
  console.log('  ex tab:', JSON.stringify(afterTab));
  check(afterTab && afterTab.length > 2 && afterTab.startsWith('ru'),
    'Tab completes the ex line', String(afterTab));

  // Escape closes it and takes the list with it.
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 300));
  const afterEsc = await page.evaluate(() => {
    const list = document.querySelector('.bj-cmdline__list');
    return { listShown: list ? !list.hidden : false, handedOver: document.querySelector('.bj-strip').classList.contains('is-vim-line') };
  });
  check(!afterEsc.listShown && !afterEsc.handedOver,
    'closing the ex line clears the suggestions', JSON.stringify(afterEsc));

  // ── shadowed rows show what WORKS, not what does not ────────────────────────
  const readMacros = () => page.evaluate(async (open) => {
    if (open) { FloatingWindow.closeAll(); Commands.run('keys.macros'); await new Promise((r) => setTimeout(r, 300)); }
    const win = document.querySelector('.floating-window--macros');
    const rows = [...win.querySelectorAll('.bj-macros__row')].map((r) => ({
      title: (r.querySelector('.bj-macros__title') || {}).textContent || '',
      // The whole cell: a chord in the Keys block, `:names` in the other.
      keys: (r.querySelector('.bj-macros__keys') || {}).textContent || '',
      tag: (r.querySelector('.bj-macros__tag') || {}).textContent || '',
      tip: r.querySelector('.bj-macros__tag') ? r.querySelector('.bj-macros__tag').getAttribute('data-tooltip') : '',
      sameLine: r.querySelector('.bj-macros__tag')
        ? Math.abs(r.querySelector('.bj-macros__tag').getBoundingClientRect().top
                   - r.querySelector('.bj-macros__title').getBoundingClientRect().top) < 3
        : true,
      bound: r.querySelector('.bj-macros__tag') ? !!r.querySelector('.bj-macros__tag')._belTooltipBound : null,
    }));
    const rowH = Math.max(...[...win.querySelectorAll('.bj-macros__row')]
      .filter((r) => !r.classList.contains('bj-macros__row--meta'))
      .map((r) => r.getBoundingClientRect().height));
    // The blocks, and the keys under each — rows are flat siblings of their
    // heading, so walk the list rather than querying inside a group.
    const groups = [];
    let bucket = null;
    for (const node of win.querySelector('.bj-macros__list').children) {
      if (node.classList.contains('bj-macros__group')) {
        bucket = { name: node.textContent, keys: [] };
        groups.push(bucket);
        continue;
      }
      if (bucket) bucket.keys.push((node.querySelector('.bj-macros__chord') || {}).textContent || '');
    }
    return {
      rows, rowH: Math.round(rowH), groups,
      exNames: [...win.querySelectorAll('.bj-macros__ex')].map((n) => n.textContent),
      exPerRow: [...win.querySelectorAll('.bj-macros__row')]
        .map((r) => r.querySelectorAll('.bj-macros__ex').length)
        .filter((n) => n > 0),
      reservedRows: win.querySelectorAll('.bj-macros__row--reserved').length,
      starred: [...win.querySelectorAll('.bj-macros__star')].map((n) => (
        n.closest('.bj-macros__row').querySelector('.bj-macros__chord') || {}).textContent),
      starInName: [...win.querySelectorAll('.bj-macros__star')]
        .every((n) => !!n.closest('.bj-macros__what')),
      starInKeys: [...win.querySelectorAll('.bj-macros__star')]
        .some((n) => !!n.closest('.bj-macros__keys')),
      starredHeading: [...win.querySelectorAll('.bj-macros__group')]
        .some((n) => /^\*/.test(n.textContent)),
      notes: win.querySelectorAll('.bj-macros__note').length,
      leader: (Persist.readStoredVimLeader && Persist.readStoredVimLeader())
        || String.fromCharCode(92),
    };
  }, true);

  const vimTags = await readMacros();
  const find = (t) => vimTags.rows.find((r) => r.title === t) || {};
  console.log('  vim macros:', JSON.stringify({
    undo: find('Undo'), rowH: vimTags.rowH,
    tagged: vimTags.rows.filter((r) => r.tag).length,
  }));
  // ⛔ Under Vim, the style's OWN maps lead. `gd`, `]h` and the leader map are
  // real bindings that used to be listed in NO surface anywhere: not the
  // Keybindings sheet (which projects `Keybindings`, which has never heard of
  // them), not the palette (which lists commands, not keys), not here. Which-key
  // was the only way in, and which-key answers a prefix you already knew to
  // press. A binding nobody can discover is barely a binding.
  const vimGroups = vimTags.groups.map((g) => g.name).join(',');
  // The style's own sequence maps lead — `g`, `]`, `[`, the leader — then the
  // chord blocks, the command line, and what the browser took.
  console.log('  vim groups:', vimGroups);
  const vimNames = vimTags.groups.map((g) => g.name);
  // The style's own sequence maps lead — the leader, `g`, `]`, `[` — then the
  // chord blocks, the command line, and what the browser took.
  check(vimNames.slice(0, 4).join(',') === [vimTags.leader, 'g', ']', '['].join(','),
    'Vim: the sequence maps lead', vimGroups);
  check(/Taken by the browser$/.test(vimNames[vimNames.length - 1]),
    'and the browser block closes the window', vimGroups);
  // ⛔ Vim types the colon; the M-x line does not. Checked for both, below.
  check(vimTags.exNames.every((n) => n.startsWith(':')),
    'under Vim the `:` names carry their colon', JSON.stringify(vimTags.exNames.slice(0, 3)));
  // ⛔ ONE name per row. `Save Now` printed `w write wa wall` — four spellings of
  // one answer in the column that is supposed to tell you what to type.
  check(vimTags.exPerRow.every((n) => n === 1),
    'and each row offers exactly one of them',
    JSON.stringify(vimTags.exPerRow.filter((n) => n !== 1)));
  // ⛔ Grouped by the sequence's first key — the `g` map, the `]` map — which is
  // what a vi user calls them.
  const allKeys = vimTags.groups.reduce((acc, g) => acc.concat(g.keys), []);
  check(allKeys.includes('gd') && allKeys.includes(']h') && allKeys.includes('K'),
    `the whole Normal map is listed (${allKeys.length} keys)`, JSON.stringify(allKeys.slice(0, 6)));
  const leaderKeys = (vimTags.groups.find((g) => g.name === vimTags.leader) || { keys: [] }).keys;
  check(leaderKeys.length > 0 && leaderKeys.every((k) => k.startsWith(vimTags.leader)),
    `every leader row shows the LIVE leader (${vimTags.leader})`, JSON.stringify(leaderKeys.slice(0, 4)));

  check(vimTags.rows.filter((r) => r.tag).length > 3,
    'Vim shadows several chords, each tagged');
  check(vimTags.rows.every((r) => !r.tag || /^(insert|shadowed|shadowing)$/.test(r.tag)),
    'each tag is one plain word from the fixed set',
    vimTags.rows.filter((r) => r.tag).map((r) => r.tag).join(','));
  // ⛔ Under Vim every tag here is `insert` — Vim takes no chord for itself, it
  // makes BelJar's chords Insert-only, which is a caveat ON THE CHORD SHOWN
  // ("this works, but only while you are typing") and therefore legitimate.
  check(vimTags.rows.filter((r) => r.tag).every((r) => r.tag === 'insert'),
    'and under Vim it is always `insert`, because Vim contests no chord',
    vimTags.rows.filter((r) => r.tag).map((r) => r.title + ':' + r.tag).join(','));
  check(vimTags.rows.every((r) => r.sameLine), 'the tag sits beside the name, not under it');
  check(vimTags.notes === 0, 'and no row prints a sentence of its own');
  check(vimTags.rowH < 34, `rows stay one line tall (${vimTags.rowH}px)`);
  // ⛔ The tooltip must be BOUND. `bindTooltips()` sweeps once at boot and is not
  // delegated, so an anchor added later shows a help cursor and nothing else.
  check(vimTags.rows.filter((r) => r.tag).every((r) => r.bound === true),
    'every tag is bound to the tooltip system, not just given the attribute');
  check(/Normal mode, press u/.test(find('Undo').tip || ''),
    'and says what to press instead in Normal mode', find('Undo').tip);

  // Under Emacs the flip is the point: the keys column shows the chord that
  // works THERE, not BelJar's greyed-out default.
  await page.evaluate(() => {
    Persist.writeStoredKeymapStyle('emacs');
    Persist.applyStoredEditorChrome?.();
    BelEditor.applyEditorPrefs?.();
  });
  await new Promise((r) => setTimeout(r, 1100));
  const emacsRows = await readMacros();
  const eFind = emacsRows.rows.find((r) => r.title === 'Find…') || {};
  console.log('  emacs macros:', JSON.stringify({
    find: eFind,
    autocompleteListed: emacsRows.rows.some((r) => r.title === 'Show Autocomplete'),
    selectAllListed: emacsRows.rows.some((r) => r.title === 'Select All'),
    blank: emacsRows.rows.filter((r) => !r.keys.trim()).length,
  }));
  // ⛔ ONE spelling in this window. `STYLE_CHORDS` writes `C-s`; every surface a
  // reader sees speaks `Ctrl+S`, or grouping keys by shape turns into nonsense.
  check(eFind.keys === 'Ctrl+S',
    'Find shows the chord that works under Emacs, not the dead Ctrl+F', JSON.stringify(eFind));
  // ⛔ NO TAG. This window shows the chord that WORKS, and `C-s` is contested by
  // nothing — BelJar binds no Ctrl+S. A tag here said "This is an Emacs macro.
  // Without Emacs, Find… is Ctrl+F", which is a fact about a chord the row does
  // not show, in a keymap you are not using. A tag may only ever caveat the
  // chord printed beside it.
  check(!eFind.tag,
    'the live chord collides with nothing, so the row wears no tag', JSON.stringify(eFind));
  check(!emacsRows.rows.some((r) => /[Ww]ithout Emacs/.test(r.tip || '')),
    'and no row anywhere describes a keymap you are not in',
    JSON.stringify(emacsRows.rows.filter((r) => r.tip).map((r) => r.tip)));
  // ⛔ EVERY row can be invoked right now — that is what "available" means. A
  // command Emacs took with nothing to replace it is simply not listed.
  check(emacsRows.rows.every((r) => r.keys.trim() !== ''),
    'every row carries a chord that works', String(emacsRows.rows.filter((r) => !r.keys.trim()).length));
  check(!emacsRows.rows.some((r) => r.title === 'Show Autocomplete'),
    'a command Emacs took with no substitute is not listed at all');
  // ⛔ Select All is NOT that case, and this check used to assert it was. The
  // shadow table said "`C-x h` is a no-op in this package" — a remembered claim
  // about a dependency, not a read one. The package binds `C-x C-p|C-x h` to
  // selectAll and `probe:keymap` measures it selecting the whole document, so
  // Available Macros must offer it. A wrong belief had been pinned by a test.
  const selectAll = emacsRows.rows.find((r) => r.title === 'Select All');
  check(selectAll && selectAll.keys === 'Ctrl+X H',
    'Select All IS listed under Emacs, at the C-x h the package really binds',
    JSON.stringify(selectAll));
  // Every chord this window prints works right now, so nothing here can be
  // "taken" — and none of the Emacs substitutes lands on a BelJar chord, so
  // nothing here is "shadowing" either.
  // ⛔ Under Emacs the Emacs-only substitutes ARE live, so all five reserved rows
  // appear — the same table that shows exactly one under Standard.
  // ⛔ A substitute is a WORKING macro and belongs in the key list, not only in
  // the footnote explaining why it exists. `Ctrl+M` is next-line; you look it up
  // among the Ctrl chords, see the mark, and read the block that shares it.
  check(emacsRows.starred.indexOf('Ctrl+M') >= 0,
    'Ctrl+M is listed among the Ctrl chords, marked',
    JSON.stringify(emacsRows.starred));
  // ⛔ Beside the NAME. Against a chord it reads as part of the key — `Ctrl+M*`
  // is a chord called "Ctrl+M star" — and misstating a key is the one thing this
  // column may never do.
  check(emacsRows.starInName && !emacsRows.starInKeys,
    'and the mark sits beside the name, never inside the chord',
    JSON.stringify({ inName: emacsRows.starInName, inKeys: emacsRows.starInKeys }));
  check(emacsRows.starredHeading,
    'and the block that explains the mark carries it in its heading');
  check(emacsRows.reservedRows === 5,
    'under Emacs every measured substitute is offered, because Emacs binds them',
    String(emacsRows.reservedRows));
  // ⛔⛔ The `shadowing` case, FIRING FOR THE FIRST TIME. It could never fire
  // before, because the keys that do the shadowing — the Emacs package's own —
  // were not listed at all. `Ctrl+F` is forward-char under Emacs and Find… in
  // Standard, and the tag on that row says exactly that: the chord is contested,
  // and here is who else claims it.
  const shadowing = emacsRows.rows.filter((r) => r.tag === 'shadowing');
  check(shadowing.length >= 4,
    `the Emacs keys that take a BelJar chord are tagged (${shadowing.length})`,
    JSON.stringify(shadowing.map((r) => r.keys)));
  check(shadowing.every((r) => /In Standard, .* is /.test(r.tip || '')),
    'and each names the command that owns the chord in Standard',
    JSON.stringify(shadowing.map((r) => r.tip)));
  check(!emacsRows.rows.some((r) => r.tag === 'shadowed'),
    'nothing here is `shadowed` — every chord in this window works',
    emacsRows.rows.filter((r) => r.tag === 'shadowed').map((r) => r.keys).join(','));
  // ⛔ On the `M-x` line a name is typed WITHOUT a colon — `:fmt` there resolves
  // to nothing, so printing the colon was a lie about what to press.
  check(emacsRows.exNames.length > 0 && emacsRows.exNames.every((n) => !n.startsWith(':')),
    'under Emacs the command-line names carry NO colon',
    JSON.stringify(emacsRows.exNames.slice(0, 4)));
  await page.evaluate(() => {
    FloatingWindow.closeAll();
    Persist.writeStoredKeymapStyle('vim');
    Persist.applyStoredEditorChrome?.();
    BelEditor.applyEditorPrefs?.();
  });
  await new Promise((r) => setTimeout(r, 1100));

  // Re-open the ex line: the map checks above pressed Escape.
  await page.keyboard.press('Escape');
  await page.keyboard.type(':');
  await new Promise((r) => setTimeout(r, 350));
  const exRan = await page.evaluate(async () => {
    const input = document.querySelector('.bj-strip__vim input');
    if (!input) return { missing: true };
    input.value = 'BJ Toggle Theme';
    const before = document.documentElement.className;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    return { before, after: document.documentElement.className };
  });
  console.log('  ex:', JSON.stringify(exRan));
  check(!exRan.missing && exRan.before !== exRan.after,
    ":BJ runs a BelJar command through vim's own ex dispatcher", JSON.stringify(exRan));

  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    Persist.writeStoredKeymapStyle('default');
    Persist.applyStoredEditorChrome?.();
    BelEditor.applyEditorPrefs?.();
  });
  await new Promise((r) => setTimeout(r, 600));

  await page.screenshot({ path: path.join(outDir, 'status-strip.png') });

  const levels = await page.evaluate(async () => {
    const count = () => document.querySelectorAll('.bj-strip__seg').length;
    const out = {};
    for (const level of ['compact', 'standard', 'detailed']) {
      Persist.writeStoredStatusStrip(level);
      StatusStrip.apply();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      out[level] = count();
    }
    Persist.writeStoredStatusStrip('off');
    StatusStrip.apply();
    out.off = !!document.querySelector('.bj-strip');
    return out;
  });
  console.log('  levels:', JSON.stringify(levels));
  check(levels.detailed >= levels.standard && levels.standard >= levels.compact,
    'verbosity levels are ordered', JSON.stringify(levels));
  check(levels.off === false, 'Off removes the node entirely — no hidden element updating');
  await page.evaluate(() => { Persist.writeStoredStatusStrip('standard'); StatusStrip.apply(); });

  const realErrors = errors.filter((e) => !/favicon|Failed to load resource/i.test(e));
  check(realErrors.length === 0, 'no page errors during boot and interaction', realErrors.slice(0, 4).join(' | '));

}
  // ══ phase 2 ════════════════════════════════════════════════════════════════
  console.log('\n[line] the command line in all three faces');
{
  await page.evaluate(() => {
    const v = CurrentEditor.getView();
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: 'LF nat : type = | z : nat;\n\nrec f : [ |- nat] = ?;\n' } });
  });

  /** Everything the list is showing, measured rather than assumed. */
  const readList = () => page.evaluate(() => {
    const list = document.querySelector('.bj-cmdline__list');
    const rows = list ? [...list.querySelectorAll('.bj-cmdline__item')] : [];
    const activeRow = rows.find((r) => r.classList.contains('is-active')) || null;
    const inp = document.querySelector('.bj-cmdline__input');
    const exField = document.querySelector('.bj-strip__vim input');
    const field = exField && exField.offsetParent !== null ? exField : inp;
    return {
      shown: list ? !list.hidden : false,
      rows: rows.length,
      none: list ? list.querySelectorAll('.bj-cmdline__none').length : 0,
      noneText: list && list.querySelector('.bj-cmdline__none')
        ? list.querySelector('.bj-cmdline__none').textContent : '',
      activeIndex: activeRow ? Number(activeRow.dataset.index) : -1,
      activeText: activeRow ? activeRow.querySelector('.bj-cmdline__item-name').textContent : '',
      // Is the highlighted row actually inside the scrollport?
      activeVisible: activeRow && list
        ? (activeRow.offsetTop >= list.scrollTop - 1
           && activeRow.offsetTop + activeRow.offsetHeight <= list.scrollTop + list.clientHeight + 1)
        : null,
      scrollTop: list ? Math.round(list.scrollTop) : 0,
      scrollable: list ? list.scrollHeight > list.clientHeight + 1 : false,
      value: field ? field.value : null,
      unknown: inp ? inp.classList.contains('is-unknown') : false,
      lineOpen: StatusStrip.isCommandLineOpen(),
    };
  });

  const type = async (text) => { await page.keyboard.type(text, { delay: 12 }); await new Promise((r) => setTimeout(r, 140)); };
  const key = async (k) => { await page.keyboard.press(k); await new Promise((r) => setTimeout(r, 110)); };
  // `press(k, { shift: true })` is not a thing: the modifier has to be held.
  const shiftKey = async (k) => {
    await page.keyboard.down('Shift');
    await page.keyboard.press(k);
    await page.keyboard.up('Shift');
    await new Promise((r) => setTimeout(r, 110));
  };

  // ── our own line ────────────────────────────────────────────────────────────
  console.log('\n[1] the command line');
  await page.evaluate(() => StatusStrip.openCommandLine(''));
  await new Promise((r) => setTimeout(r, 250));
  let st = await readList();
  check(st.lineOpen, 'the line opens');
  check(!st.shown, 'an empty line offers nothing — it does not dump every command', JSON.stringify(st));

  await type('r');
  st = await readList();
  check(st.shown && st.rows > 1, `typing raises candidates (${st.rows})`);
  check(st.activeIndex === -1, 'nothing is highlighted until you pick something', String(st.activeIndex));
  check(!st.unknown, 'and a partial name is not flagged as unknown');

  // An unknown name says so WHILE typing, not after Enter.
  await type('zzzq');
  st = await readList();
  check(st.shown && st.none === 1, 'a name that matches nothing says so in the list', JSON.stringify(st));
  check(/No matching/.test(st.noneText), 'in words', st.noneText);
  check(st.unknown, 'and the text itself is marked');
  check(st.rows === 0, 'with no pickable rows behind it', String(st.rows));

  for (let i = 0; i < 4; i += 1) await key('Backspace');
  st = await readList();
  check(st.shown && st.rows > 1 && !st.unknown, 'deleting back to a real prefix recovers', JSON.stringify(st));

  // ── arrows, scrolling, wrapping ─────────────────────────────────────────────
  console.log('\n[2] moving through the candidates');
  await key('ArrowDown');
  st = await readList();
  check(st.activeIndex === 0, 'the first ArrowDown selects the top row', String(st.activeIndex));
  check(st.activeVisible, 'and it is visible');

  const total = st.rows;
  for (let i = 0; i < total - 1; i += 1) await key('ArrowDown');
  st = await readList();
  check(st.activeIndex === total - 1, `arrowing reaches the last row (${st.activeIndex} of ${total - 1})`);
  check(st.activeVisible, 'the last row is scrolled into view, not left off screen', JSON.stringify(st));
  check(!st.scrollable || st.scrollTop > 0, 'the container actually scrolled', JSON.stringify(st));

  await key('ArrowDown');
  st = await readList();
  check(st.activeIndex === 0 && st.activeVisible && st.scrollTop === 0,
    'one more wraps to the top and scrolls back', JSON.stringify(st));

  await key('ArrowUp');
  st = await readList();
  check(st.activeIndex === total - 1 && st.activeVisible,
    'ArrowUp from the top wraps to the bottom, in view', JSON.stringify(st));

  await key('Home');
  await key('PageDown');
  const afterPage = await readList();
  check(afterPage.activeVisible, 'PageDown keeps the selection in view', JSON.stringify(afterPage));

  // ── Tab cycling ─────────────────────────────────────────────────────────────
  console.log('\n[3] Tab cycles, like a wildmenu');
  await page.evaluate(() => { StatusStrip.closeCommandLine({ restore: false }); StatusStrip.openCommandLine(''); });
  await new Promise((r) => setTimeout(r, 200));
  await type('ru');
  const beforeTab = await readList();
  await key('Tab');
  const tab1 = await readList();
  await key('Tab');
  const tab2 = await readList();
  await shiftKey('Tab');
  const tab3 = await readList();
  console.log('  tab:', JSON.stringify({ before: beforeTab.value, t1: tab1.value, t2: tab2.value, back: tab3.value }));
  check(tab1.value !== beforeTab.value && tab1.value.startsWith('ru'),
    'Tab puts the first candidate on the line', tab1.value);
  check(tab2.value !== tab1.value, 'a second Tab moves to the next one', tab2.value);
  check(tab3.value === tab1.value, 'Shift+Tab walks back', tab3.value);
  check(tab2.value.indexOf(tab1.value) !== 0 || tab1.value === tab2.value.slice(0, tab1.value.length),
    'cycling replaces the token rather than appending to it', tab2.value);

  // ── Enter runs what is selected ─────────────────────────────────────────────
  console.log('\n[4] Enter runs what is on the line');
  await page.evaluate(() => { StatusStrip.closeCommandLine({ restore: false }); StatusStrip.openCommandLine(''); });
  await new Promise((r) => setTimeout(r, 200));
  await type('hol');
  await key('ArrowDown');
  const picked = await readList();
  await key('Enter');
  await new Promise((r) => setTimeout(r, 400));
  const afterEnter = await page.evaluate(() => ({
    open: StatusStrip.isCommandLineOpen(),
    listShown: !document.querySelector('.bj-cmdline__list').hidden,
    msg: (document.querySelector('.bj-strip__message') || {}).textContent || '',
  }));
  console.log('  enter:', JSON.stringify({ picked: picked.activeText, ...afterEnter }));
  check(!afterEnter.open, 'Enter closes the line');
  check(!afterEnter.listShown, 'and the candidates go with it');
  check(!/Unknown command/.test(afterEnter.msg),
    'the selected candidate ran, not the half-typed stem', afterEnter.msg);

  // ── aborting ────────────────────────────────────────────────────────────────
  console.log('\n[5] every way out');
  for (const how of ['Escape', 'ctrl-g', 'blur']) {
    await page.evaluate(() => StatusStrip.openCommandLine(''));
    await new Promise((r) => setTimeout(r, 180));
    await type('run');
    if (how === 'Escape') await key('Escape');
    else if (how === 'ctrl-g') { await page.keyboard.down('Control'); await key('g'); await page.keyboard.up('Control'); }
    else await page.evaluate(() => document.querySelector('.bj-cmdline__input').blur());
    await new Promise((r) => setTimeout(r, 250));
    const out = await readList();
    check(!out.lineOpen && !out.shown, `${how} closes the line and clears the list`, JSON.stringify(out));
  }

  // ── search never offers commands ────────────────────────────────────────────
  console.log('\n[6] the search face');
  await page.evaluate(() => StatusStrip.openSearchLine(true));
  await new Promise((r) => setTimeout(r, 220));
  const searchOpen = await readList();
  check(!searchOpen.shown, 'opening search shows no command list', JSON.stringify(searchOpen));
  await type('nat');
  const searching = await page.evaluate(() => ({
    listShown: !document.querySelector('.bj-cmdline__list').hidden,
    count: (document.querySelector('.bj-cmdline__count') || {}).textContent || '',
  }));
  check(!searching.listShown, 'and typing a query still shows none', JSON.stringify(searching));
  check(/\d+\/\d+/.test(searching.count), 'the match count is what search reports instead', searching.count);
  await type('qqqq');
  const noMatch = await page.evaluate(() => (document.querySelector('.bj-cmdline__count') || {}).textContent || '');
  check(/no match/.test(noMatch), 'and it says when nothing matches', noMatch);
  await key('Escape');
  await new Promise((r) => setTimeout(r, 250));

  // ── Vim's ex line ───────────────────────────────────────────────────────────
  console.log('\n[7] Vim\u2019s ex line');
  await page.evaluate(() => {
    Persist.writeStoredKeymapStyle('vim');
    Persist.applyStoredEditorChrome?.();
    BelEditor.applyEditorPrefs?.();
  });
  await new Promise((r) => setTimeout(r, 1200));
  await page.click('.cm-content');
  await key('Escape');
  await type(':');
  await new Promise((r) => setTimeout(r, 250));
  st = await readList();
  check(!st.shown, 'a bare `:` offers nothing yet', JSON.stringify(st));

  await type('ru');
  st = await readList();
  check(st.shown && st.rows > 1, `typing on the ex line raises candidates (${st.rows})`);
  check(st.activeIndex === -1, 'nothing preselected here either');

  await key('Tab');
  const exTab = await readList();
  check(exTab.value !== 'ru' && exTab.value.startsWith('ru'),
    'Tab completes into vim\u2019s own field', exTab.value);
  await key('Tab');
  const exTab2 = await readList();
  check(exTab2.value !== exTab.value, 'and cycles', exTab2.value);

  // ⛔ Up/Down belong to vim's ex history; taking them would cost a real feature.
  const beforeArrow = (await readList()).value;
  await key('ArrowUp');
  const afterArrow = await readList();
  check(afterArrow.value !== beforeArrow || afterArrow.rows === exTab2.rows,
    'ArrowUp is left to vim\u2019s history, not stolen for the list',
    JSON.stringify({ beforeArrow, after: afterArrow.value }));

  await key('Escape');
  await new Promise((r) => setTimeout(r, 300));
  const afterExEsc = await page.evaluate(() => ({
    listShown: !document.querySelector('.bj-cmdline__list').hidden,
    handedOver: document.querySelector('.bj-strip').classList.contains('is-vim-line'),
    exField: !!document.querySelector('.bj-strip__vim input[value]'),
  }));
  check(!afterExEsc.listShown && !afterExEsc.handedOver,
    'Escape closes the ex line and takes the list with it', JSON.stringify(afterExEsc));

  // A garbage ex name says so too.
  await key('Escape');
  await type(':zzzq');
  await new Promise((r) => setTimeout(r, 250));
  const exUnknown = await readList();
  check(exUnknown.shown && exUnknown.none === 1,
    'an unknown ex name says so while typing', JSON.stringify(exUnknown));
  await key('Escape');
  await new Promise((r) => setTimeout(r, 250));

  // Switching away from Vim must not leave the list or listeners behind.
  await page.evaluate(() => {
    Persist.writeStoredKeymapStyle('default');
    Persist.applyStoredEditorChrome?.();
    BelEditor.applyEditorPrefs?.();
  });
  await new Promise((r) => setTimeout(r, 900));
  const afterStyleSwap = await readList();
  check(!afterStyleSwap.shown, 'leaving Vim leaves no orphaned list', JSON.stringify(afterStyleSwap));

  // ── Emacs ───────────────────────────────────────────────────────────────────
  console.log('');
  console.log('[8] Emacs');
  await page.evaluate(() => {
    Persist.writeStoredKeymapStyle('emacs');
    Persist.applyStoredEditorChrome?.();
    BelEditor.applyEditorPrefs?.();
  });
  await new Promise((r) => setTimeout(r, 1200));
  await page.click('.cm-content');

  // ⛔ A half-typed chain is its OWN segment, not the mode badge. Writing it into
  // the mode read as though `C-x` were a keymap you had switched to.
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyX');
  await page.keyboard.up('Control');
  await new Promise((r) => setTimeout(r, 300));
  const chain = await page.evaluate(() => ({
    command: (document.querySelector('.bj-strip__seg--command') || {}).textContent || '',
    keymap: (document.querySelector('.bj-strip__seg--keymap') || {}).textContent || '',
    handedOver: document.querySelector('.bj-strip').classList.contains('is-vim-line'),
  }));
  console.log('  C-x chain:', JSON.stringify(chain));
  check(/C-x/.test(chain.command), 'a half-typed C-x chain shows in the command zone', chain.command);
  check(/Emacs/.test(chain.keymap), 'and the keymap still says Emacs beside it', chain.keymap);
  check(!chain.handedOver, 'and does not take the strip over');
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 300));
  const chainGone = await page.evaluate(() =>
    (document.querySelector('.bj-strip__seg--command') || {}).textContent || '');
  check(!/C-x/.test(chainGone), 'and clears when the chain ends', chainGone);

  // ── a chain going nowhere must not reach the browser ───────────────────────
  // ⛔ `C-x C-g` opened Chrome's find bar: the package reports an unmatched
  // second key as "not handled", so the browser got it. Measured as
  // `defaultPrevented` on a listener that runs after CodeMirror's.
  await page.evaluate(() => {
    window.__lastKey = null;
    window.addEventListener('keydown', (e) => {
      window.__lastKey = { key: e.key, ctrl: e.ctrlKey, prevented: e.defaultPrevented };
    });
  });
  const deadChain = async (second) => {
    await page.click('.cm-content');
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyX');
    await page.keyboard.up('Control');
    await new Promise((r) => setTimeout(r, 120));
    await page.keyboard.down('Control');
    await page.keyboard.press(second);
    await page.keyboard.up('Control');
    await new Promise((r) => setTimeout(r, 200));
    return page.evaluate(() => window.__lastKey);
  };
  const cxcg = await deadChain('KeyG');
  console.log('  C-x C-g:', JSON.stringify(cxcg));
  check(cxcg && cxcg.prevented === true,
    'C-x C-g is swallowed, not handed to Chrome', JSON.stringify(cxcg));
  const cxcq = await deadChain('KeyQ');
  check(cxcq && cxcq.prevented === true,
    'and so is any other dead end of a chain', JSON.stringify(cxcq));

  // ⛔ …but a global chord with NO chain pending must still get through. Not
  // Ctrl+K — Emacs owns that for kill-line, and `nav.anywhere` yields it by
  // design. Ctrl+Shift+O is BelJar's throughout.
  await page.evaluate(() => { window.__lastKey = null; CommandPalette.close(); });
  await page.click('.cm-content');
  await page.keyboard.down('Control');
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyO');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  await new Promise((r) => setTimeout(r, 400));
  const palette = await page.evaluate(() => CommandPalette.isOpen());
  check(palette, 'a global chord with no chain pending still works');
  await page.evaluate(() => CommandPalette.close());
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 250));

  // ── which-key, for Emacs prefixes too ──────────────────────────────────────
  // `C-x` and `C-c` are prefixes exactly as Vim's `g` and leader are, and they
  // get the same pause-then-tell treatment.
  // ⛔ The hint is a LIST in the popup above the strip — the same box `M-x`
  // completes into — not a one-line message squeezed into the echo area.
  const hintRows = () => page.evaluate(() => {
    const list = document.querySelector('.bj-cmdline__list');
    if (!list || list.hidden) return { shown: false, rows: [], legend: 0 };
    const rows = [...list.querySelectorAll('.bj-cmdline__item')];
    return {
      shown: true,
      legend: rows.filter((r) => r.classList.contains('is-legend')).length,
      rows: rows.map((r) => [
        r.querySelector('.bj-cmdline__item-name').textContent,
        (r.querySelector('.bj-cmdline__item-label') || {}).textContent || '',
      ]),
    };
  });
  await page.evaluate(() => StatusStrip.setMessage(''));
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyC');
  await page.keyboard.up('Control');
  await new Promise((r) => setTimeout(r, 750));
  const ccHint = await hintRows();
  // ⛔ It must STILL be there well past the echo area's hold: the hint answers
  // "what can follow the key you are holding", and that question is live for as
  // long as the prefix is. Fading it out mid-read was the bug.
  await new Promise((r) => setTimeout(r, 3600));
  const ccStill = await hintRows();
  console.log('  emacs which-key:', JSON.stringify(ccHint.rows.slice(0, 3)));
  check(ccStill.shown && ccStill.rows.length === ccHint.rows.length,
    'and stays up while the prefix is still pending', JSON.stringify(ccStill));
  check(ccHint.shown && ccHint.rows.length > 1, 'a pause on C-c lists what follows it',
    JSON.stringify(ccHint));
  check(ccHint.legend === ccHint.rows.length, 'every row is a legend, not a pickable candidate');
  check(/Hole|Harpoon|Run|Problem/.test(ccHint.rows.map((r) => r[1]).join(' ')),
    'naming real BelJar commands', JSON.stringify(ccHint.rows));
  // ⛔ Every row must name a command BelJar actually has. The declined chords —
  // `C-x 2`, `C-x o`, the window keys we answer only to swallow — are answers,
  // not capabilities, and a hint lists what you CAN do.
  const strays = await page.evaluate((rows) => {
    const titles = new Set(Commands.list().map((c) => c.title));
    return rows.map((r) => r[1]).filter((t) => !titles.has(t));
  }, ccHint.rows);
  check(strays.length === 0, 'and every row names a real command', JSON.stringify(strays));

  // …and goes the moment the sequence is abandoned.
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 400));
  const afterAbort = await hintRows();
  check(!afterAbort.shown, 'abandoning the prefix takes the hint down', JSON.stringify(afterAbort));

  // ⛔ The popup the hint uses is the SAME one `M-x` completes into. Opening the
  // line on top of a hint must leave candidates, not a stale legend.
  await page.keyboard.down('Alt');
  await page.keyboard.press('KeyX');
  await page.keyboard.up('Alt');
  await new Promise((r) => setTimeout(r, 250));
  await type('hol');
  const afterHint = await hintRows();
  check(afterHint.shown && afterHint.legend === 0,
    'the line reclaims the popup from the hint', JSON.stringify(afterHint));
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 200));

  // ── the autocomplete chord asks for the list outright ──────────────────────
  // On an empty line "show me everything" is a real request; refusing it because
  // nothing is typed yet is the one place the quiet rule reads as broken.
  await page.evaluate(() => StatusStrip.openCommandLine(''));
  await new Promise((r) => setTimeout(r, 250));
  const beforeForce = await readList();
  check(!beforeForce.shown, 'an empty line offers nothing on its own', JSON.stringify(beforeForce));
  await page.keyboard.down('Control');
  await page.keyboard.press('Space');
  await page.keyboard.up('Control');
  await new Promise((r) => setTimeout(r, 250));
  const forced = await readList();
  check(forced.shown && forced.rows > 1, 'the autocomplete chord shows them anyway',
    JSON.stringify(forced));
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 200));
  await new Promise((r) => setTimeout(r, 200));

  // Typing a chain fluently must stay silent.
  await page.evaluate(() => StatusStrip.setMessage(''));
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyC');
  await page.keyboard.up('Control');
  await page.keyboard.press('KeyN');
  await new Promise((r) => setTimeout(r, 750));
  const fluentChain = await page.evaluate(() =>
    (document.querySelector('.bj-strip__message') || {}).textContent || '');
  console.log('  emacs fluent:', JSON.stringify(fluentChain));
  check(!/·/.test(fluentChain),
    'a chain typed fluently never raises the hint', fluentChain);
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 250));

  // `M-x` opens our line, with its own prompt.
  await page.keyboard.down('Alt');
  await page.keyboard.press('KeyX');
  await page.keyboard.up('Alt');
  await new Promise((r) => setTimeout(r, 350));
  const mx = await page.evaluate(() => ({
    open: StatusStrip.isCommandLineOpen(),
    prompt: (document.querySelector('.bj-cmdline__prompt') || {}).textContent || '',
  }));
  console.log('  M-x:', JSON.stringify(mx));
  check(mx.open, 'M-x opens the command line');
  check(mx.prompt === 'M-x', 'with an M-x prompt, not a colon', mx.prompt);

  // M-x names are how an Emacs user refers to a command, so they must match.
  await type('beljar-run');
  const mxNames = await readList();
  check(mxNames.shown && mxNames.rows > 0,
    `an M-x name finds its command (${mxNames.rows})`, JSON.stringify(mxNames));

  // C-n / C-p walk the candidates, as they do everywhere in Emacs.
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyN');
  await page.keyboard.up('Control');
  await new Promise((r) => setTimeout(r, 150));
  const afterCtrlN = await readList();
  check(afterCtrlN.activeIndex === 0, 'C-n selects the first candidate', String(afterCtrlN.activeIndex));

  // C-g aborts, as it does everywhere in Emacs.
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyG');
  await page.keyboard.up('Control');
  await new Promise((r) => setTimeout(r, 300));
  const afterCtrlG = await readList();
  check(!afterCtrlG.lineOpen && !afterCtrlG.shown, 'C-g aborts M-x', JSON.stringify(afterCtrlG));

  // ⛔ A macro is not an editor feature. `M-x` opened the M-x line inside the
  // editor and the PALETTE everywhere else, because the Emacs keymap only exists
  // while CodeMirror has focus and the global chord fell through to the palette.
  // One chord, two different windows, depending on where you were looking.
  await page.evaluate(() => { document.querySelector('.cm-content').blur(); document.body.focus(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.keyboard.down('Alt');
  await page.keyboard.press('KeyX');
  await page.keyboard.up('Alt');
  await new Promise((r) => setTimeout(r, 350));
  const outside = await page.evaluate(() => ({
    editorFocused: CurrentEditor.getView().hasFocus,
    line: StatusStrip.isCommandLineOpen(),
    prompt: (document.querySelector('.bj-cmdline__prompt') || {}).textContent || '',
    palette: !!(window.CommandPalette && CommandPalette.isOpen && CommandPalette.isOpen()),
  }));
  console.log('  M-x outside:', JSON.stringify(outside));
  check(!outside.editorFocused, 'the editor really did lose focus', JSON.stringify(outside));
  check(outside.line && !outside.palette,
    'M-x outside the editor opens the same M-x line, not the palette', JSON.stringify(outside));
  check(outside.prompt === 'M-x', 'with the same prompt', outside.prompt);

  // ── walking the list ───────────────────────────────────────────────────────
  // ⛔ `C-m` is FORWARD, not Enter. Chromium never delivers `Ctrl+N` to a page,
  // so `Ctrl+M` is the substitute BelJar's reserved-chord table has promised for
  // next-line all along, and the editor binds it that way. This is the check
  // that stops the command line from inventing a different meaning for it.
  const ctrl = async (letter) => {
    await page.keyboard.down('Control');
    await page.keyboard.press('Key' + letter.toUpperCase());
    await page.keyboard.up('Control');
    await new Promise((r) => setTimeout(r, 150));
  };
  await page.evaluate(() => StatusStrip.openCommandLine(''));
  await new Promise((r) => setTimeout(r, 250));
  await type('e');
  await ctrl('m');
  const step1 = await readList();
  check(step1.activeIndex === 0, 'C-m selects the first candidate', String(step1.activeIndex));
  await ctrl('m');
  const step2 = await readList();
  check(step2.activeIndex === 1, 'and C-m again goes forward, exactly as C-n does',
    String(step2.activeIndex));
  await ctrl('n');
  check((await readList()).activeIndex === 2, 'C-n is the same key by another name');
  await ctrl('p');
  check((await readList()).activeIndex === 1, 'C-p goes back');
  // ⛔ And it must NOT submit: C-m walking the list and C-m running the line are
  // different features, and only one of them is what the table promised.
  check((await readList()).lineOpen, 'C-m does not run the line — it is not RET here');
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 200));

  // ── back to Standard ───────────────────────────────────────────────────────
  await page.evaluate(() => {
    Persist.writeStoredKeymapStyle('default');
    Persist.applyStoredEditorChrome?.();
    BelEditor.applyEditorPrefs?.();
  });
  await new Promise((r) => setTimeout(r, 900));

  // ── what the Emacs work must NOT have cost Standard ────────────────────────
  // ⛔ Under Standard the chord is BelJar's own `Alt+X`, not a keymap macro, and
  // it must still open the palette — the fix routes by style, not by wiping one.
  await page.click('.cm-content');
  await page.evaluate(() => { document.querySelector('.cm-content').blur(); document.body.focus(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.keyboard.down('Alt');
  await page.keyboard.press('KeyX');
  await page.keyboard.up('Alt');
  await new Promise((r) => setTimeout(r, 350));
  const stdEntry = await page.evaluate(() => ({
    palette: !!(window.CommandPalette && CommandPalette.isOpen && CommandPalette.isOpen()),
    line: StatusStrip.isCommandLineOpen(),
  }));
  console.log('  Alt+X under Standard:', JSON.stringify(stdEntry));
  check(stdEntry.palette && !stdEntry.line,
    'under Standard, Alt+X still opens the palette', JSON.stringify(stdEntry));
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 250));

  await page.screenshot({ path: path.join(outDir, 'command-line.png') });
  // (the harness checks page errors once, at finish)

}
  // ══ phase 3 ════════════════════════════════════════════════════════════════
  console.log('\n[keymap] substitutes, vanilla keys, and every binding pressed');
{

  const load = async (src, at) => page.evaluate((s, pos) => {
    const v = CurrentEditor.getView();
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: s }, selection: { anchor: pos || 0 } });
    v.focus();
  }, src, at || 0);

  const state = () => page.evaluate(() => {
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

  // Everything a keypress could visibly do, in one snapshot.
  //
  // `shape` is the catch-all: a panel that mounts, a list that fills, a class
  // that flips all change it. Without it the probe is blind to anything that
  // does not move the caret — `gi` dispatches `beljar:open-inspector` and the
  // first version called it dead.
  //
  // ⛔ STRUCTURE ONLY. Raw `innerHTML.length` drifted 83 chars between two
  // snapshots with no key pressed — the checker and the hole count repainting —
  // which would have made every binding below pass on noise. Stripping text
  // nodes keeps mounts, classes and attributes while dropping the churn. The
  // control proves it, and is the only reason to trust anything in section 3.
  const world = () => page.evaluate(() => {
    const v = window.CurrentEditor && CurrentEditor.getView ? CurrentEditor.getView() : null;
    const s = v ? v.state.selection.main : { head: -1 };
    return {
      gone: !v,
      shape: (() => {
        // ⛔ The editor subtree is excluded. CodeMirror renders lazily and the
        // caret BLINKS — an attribute toggling twice a second — so including it
        // made the shell look like it changed whatever you pressed. Caret and
        // document are measured directly, above, so nothing is lost.
        const shell = document.body.cloneNode(true);
        for (const ed of shell.querySelectorAll('.cm-editor')) ed.replaceWith(document.createElement('i'));
        return shell.outerHTML.replace(/>[^<]*</g, '><').length;
      })(),
      head: s.head,
      len: v ? v.state.doc.length : -1,
      msg: (document.querySelector('.bj-strip__message') || {}).textContent || '',
      line: StatusStrip.isCommandLineOpen(),
      holes: v ? v.state.doc.toString().split('?').length : -1,
      palette: !!(window.CommandPalette && CommandPalette.isOpen && CommandPalette.isOpen()),
      // Anything that mounted: a panel, a dialog, a floating window, a popup.
      surfaces: document.querySelectorAll(
        '.cm-panel, .floating-window, dialog[open], .bj-cmdline__list:not([hidden]), .cm-tooltip',
      ).length,
      active: document.activeElement ? (document.activeElement.className || document.activeElement.tagName) : '',
      body: document.body.className,
    };
  });

  const setStyle = async (v) => {
    await page.evaluate((x) => { Persist.writeStoredKeymapStyle(x); BelEditor.applyEditorPrefs?.(); }, v);
    await new Promise((r) => setTimeout(r, 1300));
    await page.click('.cm-content');
  };
  const chord = async (mods, code) => {
    for (const m of mods) await page.keyboard.down(m);
    await page.keyboard.press(code);
    for (const m of mods.slice().reverse()) await page.keyboard.up(m);
    await new Promise((r) => setTimeout(r, 140));
  };
  const type = async (t) => { await page.keyboard.type(t, { delay: 14 }); await new Promise((r) => setTimeout(r, 170)); };
  const esc = async () => { await page.keyboard.press('Escape'); await new Promise((r) => setTimeout(r, 130)); };

  /**
   * Close whatever the last binding opened, so the next one starts clean.
   *
   * The strip repaints on rAF, so clearing the message and snapshotting in the
   * same tick catches the OLD text and the next snapshot catches the clear —
   * which reads as "this key did something". Wait for the repaint.
   */
  const settle = async () => {
    for (let i = 0; i < 3; i += 1) await esc();
    // ⚠ Escape does NOT close a floating window, so the graph opened by one
    // binding was still up — and holding focus — when the next was pressed.
    // `C-x g` then "did nothing" because the graph was already open and the
    // editor never saw the chord. A probe artifact that reads exactly like a
    // dead binding, which is the whole reason section 3 has a control.
    await page.evaluate(() => {
      if (window.FloatingWindow && FloatingWindow.closeAll) FloatingWindow.closeAll();
      if (window.CommandPalette && CommandPalette.close) CommandPalette.close();
      StatusStrip.setMessage('');
    });
    await page.click('.cm-content');
    await new Promise((r) => setTimeout(r, 260));
  };

  /**
   * Sample until the page stops moving on its own.
   *
   * The checker finishes, a lint result lands, a segment appears — all after the
   * keystroke that did not cause them. Comparing two arbitrary instants makes a
   * dead key look alive; comparing two QUIET instants does not.
   */
  const quiet = async () => {
    let last = null;
    for (let i = 0; i < 14; i += 1) {
      const now = await world();
      if (last && now.shape === last.shape && now.msg === last.msg && now.head === last.head) return now;
      last = now;
      await new Promise((r) => setTimeout(r, 130));
    }
    return last;
  };

  const changed = (a, b) => a.head !== b.head || a.len !== b.len || a.msg !== b.msg
    || a.line !== b.line || a.palette !== b.palette || a.surfaces !== b.surfaces
    || a.active !== b.active || a.body !== b.body || a.shape !== b.shape || a.gone !== b.gone;

  // ══ 1. the reserved-chord table's promises ════════════════════════════════
  console.log('\n[1] every substitute BROWSER_RESERVED_PC names');
  await setStyle('emacs');

  await load(PLAIN);
  await chord(['Control'], 'KeyM');
  let s = await state();
  check(s.line === 2, 'C-m = next-line, the substitute for the reserved Ctrl+N', 'line ' + s.line);

  await load(PLAIN, 1);
  await chord(['Alt'], 'KeyT');
  s = await state();
  check(s.doc.slice(0, 5) !== 'alpha', 'Alt+T = transpose-chars, for the reserved Ctrl+T', s.doc.slice(0, 5));

  await load(PLAIN);
  await chord(['Control'], 'Space');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
  await chord(['Control'], 'KeyQ');
  s = await state();
  check(!s.doc.startsWith('alpha'), 'Ctrl+Q = kill-region, for the reserved Ctrl+W', JSON.stringify(s.doc.slice(0, 8)));

  await load(PLAIN);
  await chord(['Control'], 'KeyU');
  await type('3');
  await chord(['Control'], 'KeyM');
  s = await state();
  check(s.line === 4, 'C-u 3 = digit-argument, for the reserved Ctrl+1…9', 'line ' + s.line);

  // ══ 2. the vanilla keys people arrive with ════════════════════════════════
  console.log('\n[2] vanilla Emacs');
  await load(PLAIN);
  await chord(['Control'], 'KeyE'); s = await state();
  check(s.col === 5, 'C-e end of line', 'col ' + s.col);
  await chord(['Control'], 'KeyA'); s = await state();
  check(s.col === 0, 'C-a start of line', 'col ' + s.col);
  await chord(['Control'], 'KeyK'); s = await state();
  check(s.doc.startsWith('\nbravo'), 'C-k kill line', JSON.stringify(s.doc.slice(0, 8)));
  await chord(['Control'], 'KeyY'); s = await state();
  check(s.doc.startsWith('alpha'), 'C-y yank', JSON.stringify(s.doc.slice(0, 8)));

  await load(PLAIN);
  await chord(['Alt'], 'KeyF'); s = await state();
  check(s.col === 5, 'M-f forward word', 'col ' + s.col);
  await chord(['Alt'], 'KeyB'); s = await state();
  check(s.col === 0, 'M-b back word', 'col ' + s.col);
  await chord(['Alt'], 'KeyD'); s = await state();
  check(!s.doc.startsWith('alpha'), 'M-d kill word', JSON.stringify(s.doc.slice(0, 8)));

  // ⛔ `command-shadows.mjs` claimed this was "a no-op in this package" and so
  // Available Macros told Emacs users select-all was unreachable. It is not.
  await load(PLAIN);
  await chord(['Control'], 'KeyX');
  await page.keyboard.press('KeyH');
  await new Promise((r) => setTimeout(r, 200));
  s = await state();
  check(s.sel > 20, 'C-x h selects all — the shadow table must keep offering it', s.sel + ' chars');

  await load(PLAIN);
  await chord(['Control'], 'KeyX');
  await chord(['Control'], 'KeyS');
  await new Promise((r) => setTimeout(r, 400));
  const savedMsg = await page.evaluate(() => (document.querySelector('.bj-strip__message') || {}).textContent || '');
  check(/sav/i.test(savedMsg), 'C-x C-s saves, and says so', JSON.stringify(savedMsg));

  console.log('\n[2] vanilla Vim');
  await setStyle('vim');
  await load(PLAIN); await esc();
  await type('dd'); s = await state();
  check(s.doc.startsWith('bravo'), 'dd', JSON.stringify(s.doc.slice(0, 8)));
  await type('u'); s = await state();
  check(s.doc.startsWith('alpha'), 'u', JSON.stringify(s.doc.slice(0, 8)));
  await chord(['Control'], 'KeyR'); s = await state();
  check(s.doc.startsWith('bravo'), 'C-r', JSON.stringify(s.doc.slice(0, 8)));

  await load(PLAIN); await esc();
  await type('yyjp'); s = await state();
  check(s.doc.split('\n')[2] === 'alpha', 'yy j p', JSON.stringify(s.doc.split('\n').slice(0, 3)));

  await load(PLAIN); await esc();
  await type('G'); const atG = (await state()).line;
  await type('gg'); s = await state();
  check(atG >= 5 && s.line === 1, 'gg / G', 'G→' + atG + ' gg→' + s.line);

  await load(PLAIN); await esc();
  await type('/charlie'); await page.keyboard.press('Enter'); await new Promise((r) => setTimeout(r, 250));
  s = await state();
  check(s.line === 3, '/ search', 'line ' + s.line);

  await load(PLAIN); await esc();
  await type('ciwXX'); await esc(); s = await state();
  check(s.doc.startsWith('XX'), 'ciw', JSON.stringify(s.doc.slice(0, 4)));
  await type('j0.'); await new Promise((r) => setTimeout(r, 200)); s = await state();
  check(s.doc.split('\n')[1] === 'XX', '. repeats it', JSON.stringify(s.doc.split('\n')[1]));

  // ⛔ Our `:set` REPLACES vim's, and `Vim.defineEx` overwrites silently — it
  // throws only when the short name is not a prefix. `:s` and `:g` must survive.
  await load(PLAIN); await esc();
  await type(':s/alpha/OMEGA/'); await page.keyboard.press('Enter'); await new Promise((r) => setTimeout(r, 300));
  s = await state();
  check(s.doc.startsWith('OMEGA'), ':s is still vim\'s substitute, not shadowed by a catalogue name',
    JSON.stringify(s.doc.slice(0, 8)));

  await load(PLAIN); await esc();
  await type(':set number'); await page.keyboard.press('Enter'); await new Promise((r) => setTimeout(r, 350));
  check(await page.evaluate(() => !!document.querySelector('.cm-lineNumbers')), ':set number');

  // ══ 3. every binding does SOMETHING ═══════════════════════════════════════
  // The bindings are read from the running app, so a new one is covered the day
  // it is added rather than the day someone remembers to list it here.
  const maps = await page.evaluate(() => ({
    normal: (window.BelEditor && BelEditor.vimMaps && BelEditor.vimMaps().normal) || null,
    leader: (window.BelEditor && BelEditor.vimMaps && BelEditor.vimMaps().leader) || null,
  }));

  console.log('\n[3] every Vim binding lands');
  await setStyle('vim');

  // CONTROL. `dom` is deliberately broad, so a background repaint could make
  // every key look alive and the whole section pass vacuously. An unbound chord
  // must read as DEAD; if it does not, the signal is noise and nothing below
  // means anything. (The house rule: every census gets a control.)
  await settle();
  await load(BEL, 120);
  await esc();
  const ctlBefore = await quiet();
  await chord(['Control', 'Alt'], 'F9');
  const ctlAfter = await quiet();
  check(!changed(ctlBefore, ctlAfter),
    'CONTROL: an unbound chord reads as dead, so the signal is not noise',
    JSON.stringify({ before: ctlBefore, after: ctlAfter }));
  const leaderKey = await page.evaluate(() => Persist.readStoredVimLeader());
  const vimSeqs = (maps.normal || [
    'gd', 'gr', 'gD', 'gh', 'gi', 'K',
    ']h', '[h', ']e', '[e', ']d', '[d', ']c', '[c',
  ]).concat((maps.leader || ['f', 'p', '/', 's', 'h', 'H', 'r', 'g', 'e', 'd']).map((k) => leaderKey + k));

  for (const seq of vimSeqs) {
    await settle();
    await load(BEL, 120);
    await esc();
    const before = await quiet();
    await type(seq);
    const after = await quiet();
    check(changed(before, after), `vim  ${seq}  does something`,
      JSON.stringify({ before: { head: before.head, surfaces: before.surfaces }, after: { head: after.head, surfaces: after.surfaces, msg: after.msg } }));
  }

  console.log('\n[3] every Emacs binding lands');
  await setStyle('emacs');
  const emacsSeqs = [
    ['KeyX', 'KeyF', true], ['KeyX', 'KeyB', false], ['KeyX', 'KeyS', true],
    ['KeyX', 'KeyG', false], ['KeyX', 'KeyP', false],
    ['KeyC', 'KeyH', false], ['KeyC', 'KeyS', false], ['KeyC', 'KeyF', false],
    ['KeyC', 'KeyP', false], ['KeyC', 'KeyR', false], ['KeyC', 'KeyE', false],
    ['KeyC', 'KeyN', false], ['KeyC', 'KeyD', false], ['KeyC', 'KeyG', false],
  ];
  const label = (a, b, ctrl) => 'C-' + a.slice(3).toLowerCase() + ' ' + (ctrl ? 'C-' : '') + b.slice(3).toLowerCase();
  for (const [first, second, secondCtrl] of emacsSeqs) {
    await settle();
    await load(BEL, 120);
    const before = await quiet();
    await chord(['Control'], first);
    if (secondCtrl) await chord(['Control'], second);
    else { await page.keyboard.press(second); await new Promise((r) => setTimeout(r, 140)); }
    const after = await quiet();
    check(changed(before, after), `emacs  ${label(first, second, secondCtrl)}  does something`,
      JSON.stringify({ head: [before.head, after.head], surfaces: [before.surfaces, after.surfaces], msg: after.msg }));
  }

  // Last, because it succeeds by DESTROYING the editor every other check needs.
  // Run mid-list it reports "cannot read getView of null" and reads as a crash
  // rather than as a binding that worked.
  await settle();
  // ⚠ Not measured by `changed()`: closing the only tab opens a fresh one in its
  // place, so the shell's shape comes back byte-identical and the generic signal
  // reads it as dead. The file id is the thing that actually moved.
  // ⚠ Count the OPEN TABS, not the active file id: after the last tab closes,
  // `Persist.getActiveFileId()` still names the file that just went away, so an
  // id comparison reports a working binding as dead.
  const openTabs = () => page.evaluate(() => (window.Persist && Persist.getOpenFileIds)
    ? Persist.getOpenFileIds().length : -1);
  const tabsBefore = await openTabs();
  await chord(['Control'], 'KeyX');
  await page.keyboard.press('KeyK');
  await new Promise((r) => setTimeout(r, 600));
  const tabsAfter = await openTabs();
  check(tabsBefore > 0 && tabsAfter === tabsBefore - 1, 'emacs  C-x k  closes the tab',
    JSON.stringify({ before: tabsBefore, after: tabsAfter }));

  await page.evaluate(() => { Persist.writeStoredKeymapStyle('default'); BelEditor.applyEditorPrefs?.(); });
  // (the harness checks page errors once, at finish)

}
} catch (e) {
  // Recorded, not reported here: `finish` runs once, from `finally`, so the
  // browser is closed exactly once and the crash is counted as a failed check.
  crash = e;
} finally {
  await finish('probe-keymap', crash);
}
