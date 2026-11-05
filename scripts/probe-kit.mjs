// The kit page (dev/kit.html) in real Chrome: every specimen draws, with the
// app's own code and no errors, and one screenshot is written per theme for
// looking at (docs/UI.md §6).
//   npm run probe:kit      →  scripts/.shots/kit-dark.png, kit-light.png
//
// Not part of `npm run probe`: it gates nothing about the product. It is the
// instrument for the component audit (plan v6, phase 02).
import path from 'node:path';
import { openProbe } from './probe-harness.mjs';

const { page, outDir, check, finish, wait } = await openProbe({
  port: 8873, page: 'dev/kit.html', scale: 1, settle: 400, waitFor: () => window.KitReady === true,
});

let crash = null;
try {
  const kit = await page.evaluate(() => ({
    sections: window.Kit.sections(),
    specimens: window.Kit.specimens(),
    rows: document.querySelectorAll('.home-row:not(.home-row--empty)').length,
    marks: [...document.querySelectorAll('.home-row__mark')].map((m) => m.textContent),
    clouds: [...document.querySelectorAll('.kit-cloud .sync-cloud')].map((b) => b.dataset.state + ':' + (b.querySelector('svg') ? 'drawn' : 'empty')),
    headers: document.querySelectorAll('.kit-frame--flush > header').length,
    buttons: document.querySelectorAll('.kit-section .jar-prompt-dialog__btn').length,
    cards: [...document.querySelectorAll('.kit-frame > dialog.jar-dialog:not(.share-window-wrap) .jar-dialog__card')].map((c) => getComputedStyle(c).opacity + ':' + c.querySelectorAll('button[data-action]').length).join(),
    dialogsOpen: document.querySelectorAll('dialog:modal').length,
    homeTiles: [...document.querySelectorAll('.kit-frame--home .home-start')].map((a) => [...a.children].map((b) => Math.round(b.getBoundingClientRect().top)).join('=')).join(),
    homeWays: [...document.querySelectorAll('.kit-frame--home .home-start')].map((a) => [...a.querySelectorAll('.home-tile__label')].map((n) => n.textContent).join('/')).join(),
    homeRow: [...document.querySelectorAll('.kit-frame--home .home-row')].slice(0, 1).map((r) => [...r.querySelector('.home-row__open').children].map((c) => c.className).join(' ')).join(),
    homeEdges: [...document.querySelectorAll('.kit-frame--home .home[data-mode="returning"]')].map((m) => {
      const tiles = m.querySelector('.home-start').getBoundingClientRect();
      const name = m.querySelector('.home-row__name').getBoundingClientRect();
      const when = m.querySelector('.home-row__when').getBoundingClientRect();
      return Math.round(name.left - tiles.left) + ',' + Math.round(tiles.right - when.right);
    }).join(),
    dupIds: [...document.querySelectorAll('[id^="home"]')].map((n) => n.id).filter((id, i, all) => all.indexOf(id) !== i),
    menu: [...document.querySelectorAll('.kit-frame > .menu .menu-item, .kit-frame > .menu .menu-status-title, .kit-frame > .menu .menu-section')].map((n) => n.textContent.trim()),
    menuShown: [...document.querySelectorAll('.kit-frame > .menu')].map((m) => getComputedStyle(m).visibility + '/' + getComputedStyle(m).opacity).join(),
    toasts: [...document.querySelectorAll('.kit-frame > .toast')].map((t) => getComputedStyle(t).opacity).join(),
    floating: document.querySelectorAll('#menu-root .menu, #toast-stack .toast').length,
    styled: [...document.styleSheets].map((s) => (s.href || '').split('/').pop()),
    failed: [...document.querySelectorAll('.kit-failed')].map((n) => n.textContent),
    notifCards: document.querySelectorAll('.kit-frame .notif-panel .notif-item, .kit-frame .notif-panel [class*="notif-card"]').length,
    strips: document.querySelectorAll('.kit-frame > .jar-strip').length,
    windows: document.querySelectorAll('.kit-frame > .floating-window').length,
    paletteRows: document.querySelectorAll('.kit-frame > .jar-palette .jar-palette-item').length,
    share: [...document.querySelectorAll('.kit-frame > dialog.share-window-wrap')].map((d) => {
      const access = d.querySelector('.share-access');
      const slot = d.querySelector('.share-slot, .share-link');
      return {
        state: access ? access.dataset.state : '',
        mark: access ? access.querySelector('.share-access__mark').dataset.glyph : '',
        slot: slot ? (slot.classList.contains('share-link') ? 'link' : 'button') : '',
        height: slot ? Math.round(slot.getBoundingClientRect().height * 10) / 10 : 0,
        versions: d.querySelectorAll('.share-version').length,
        width: Math.round(d.querySelector('.jar-dialog__card').getBoundingClientRect().width),
      };
    }),
    shareLeft: document.querySelectorAll('body > dialog.share-window-wrap').length,
    leftLive: document.querySelectorAll('body > .floating-window, body > #notif-panel').length + (window.CommandPalette && window.CommandPalette.isOpen() ? 1 : 0),
  }));
  console.log('  kit:', JSON.stringify({ sections: kit.sections, specimens: kit.specimens }));
  check(kit.sections.join() === 'Headers,Panel headers,Buttons,The cloud,Menus,Dialogs,Sharing,Home,Toasts,Notifications,The strip,A floating window,Version history,The palette,Not on this page yet', `the kit has its sections (${kit.sections.join(', ')})`);
  check(!kit.failed.length, `every specimen drew, through the app's own module (${kit.failed.join(' | ') || 'all'})`);
  check(kit.notifCards === 4 && kit.strips === 3 && kit.windows === 2 && kit.paletteRows > 0,
    `one card of each kind, the strip in three states, two windows, and the palette with its rows (${JSON.stringify({ cards: kit.notifCards, strips: kit.strips, windows: kit.windows, paletteRows: kit.paletteRows })})`);
  check(kit.leftLive === 0, `and nothing live is left over the page (${kit.leftLive})`);
  check(kit.headers === 4, `both documents' headers, signed out and signed in (${kit.headers})`);
  check(kit.clouds.length === 7 && kit.clouds.every((c) => /:drawn$/.test(c)), `the cloud in every state of the summary (${kit.clouds.join(' ')})`);
  check(kit.rows === 5 && kit.marks.join() === '2 files to review', `home's rows, with the marker only where files wait to be reviewed (${kit.rows} rows; ${kit.marks.join(', ')})`);
  check(kit.homeRow === 'home-row__name home-row__when', `a project's row says its name and when, and nothing else (${kit.homeRow})`);
  check(kit.homeWays.split(',').every((w) => w === 'New project/Import folder/Browse examples'), `each page has the three ways to start (${kit.homeWays})`);
  check(kit.homeEdges === '0,0', `one column: a row's name starts at the tiles' left edge, and its date ends at their right (${kit.homeEdges})`);
  check(kit.cards === '1:2,1:2' && kit.dialogsOpen === 0 && kit.buttons >= 12,
    `two dialogs PromptDialog made, each shown in its frame with its two answers, and none left open over the page (${kit.cards})`);
  {
    const s = kit.share;
    const says = s.map((w) => w.state + '/' + w.mark + '/' + w.slot + '/' + w.versions).join(' ');
    check(says === 'none/lock/button/0 link/globe/link/2 versions/link/button/1 out/lock/button/0',
      `the Share window in each state: a lock and Copy link, the globe and the link with two version links, only version links, signed out (${says})`);
    check(s.every((w) => w.height === s[0].height) && s[0].height > 30,
      `Copy link and the link it becomes are one height, so the one turns into the other (${s.map((w) => w.height).join(', ')})`);
    check(s.every((w) => w.width === 480) && kit.shareLeft === 0,
      `the window is its own width, 30rem, not the prompt's 24 (${s.map((w) => w.width).join(', ')}), and none is left open (${kit.shareLeft})`);
  }
  check(kit.homeTiles.split(',').every((t) => /^(\d+)=\1=\1$/.test(t)), `the three ways to start stand in a row (${kit.homeTiles})`);
  check(kit.dupIds.length === 0, `and none of home's ids is on the page twice, though its frame is drawn three times (${kit.dupIds.slice(0, 4).join(', ')})`);
  check(kit.menu.includes('All changes synced') && kit.menu.includes('Sync now') && kit.menu.includes('Project') && kit.menuShown === 'visible/1',
    `a menu the Menu component made, shown in its frame (${kit.menu.join(' | ')}; ${kit.menuShown})`);
  check(kit.toasts === '1,1,1' && kit.floating === 0, `three toasts the Toasts component made, shown in theirs, and nothing left floating over the page (${kit.toasts})`);
  check(kit.styled.includes('style.css') && kit.styled.includes('home.css') && kit.styled.includes('kit.css') && kit.styled.length === 3,
    `styled by the app's two stylesheets and the kit's own frame, nothing else (${kit.styled.join(', ')})`);

  // Version history live, on the kit's stand-in cloud (Kit.openHistory). Measured
  // in the window as it lays out, not in the specimen's still copy.
  {
    const vh = await page.evaluate(async () => {
      const close = await window.Kit.openHistory();
      const q = (sel) => document.querySelector('body > .floating-window ' + sel);
      const fadeOf = (n) => n.getAttribute('data-scroll-fade') || 'none';
      const list = q('.history__list');
      const view = q('.history__view');
      const out = { listAtRest: fadeOf(list), viewAtRest: fadeOf(view) };
      list.scrollTop = 120;
      list.dispatchEvent(new Event('scroll'));
      out.listScrolled = fadeOf(list);
      const diffs = [...view.querySelectorAll('.review-diff')];
      out.diffs = diffs.length;
      out.squeezed = diffs.filter((d) => d.scrollHeight > d.clientHeight + 1).length;
      const wide = diffs.find((d) => d.scrollWidth > d.clientWidth + 1);
      out.wide = !!wide;
      out.shortRows = wide ? [...wide.children].filter((r) => Math.abs(r.getBoundingClientRect().width - wide.scrollWidth) > 1).length : -1;
      const lineH = q('.review-diff__line').getBoundingClientRect().height;
      out.gaps = [...view.querySelectorAll('.review-diff__gap')].map((g) => (Math.abs(g.getBoundingClientRect().height - lineH) < 0.5 ? 'row' : 'off') + ':' + g.textContent).join(', ');
      const mid = (n) => { const b = n.getBoundingClientRect(); return b.top + b.height / 2; };
      out.stampOff = Math.round(Math.abs(mid(q('.history__stamp')) - mid(q('.history__head button'))) * 10) / 10;
      out.extra = [/Read only/.test(view.textContent) && 'Read only', !!view.querySelector('.review__legend') && 'legend'].filter(Boolean).join();
      const days = [...list.querySelectorAll('.history__day')].map((d) => ({
        name: d.querySelector('.history__day-name').textContent,
        rows: [...d.querySelectorAll('.history__row')].map((r) => ({
          v: Number(r.dataset.version),
          when: r.querySelector('.history__when').textContent,
          tag: (r.querySelector('.history__tag') || {}).textContent || '',
          parts: r.children.length,
          h: Math.round(r.getBoundingClientRect().height),
        })),
      }));
      // A day's heading against its rows: weight, contrast with the ground, and room above.
      // Any CSS colour (oklab, color-mix, …) as the RGBA a canvas paints it.
      const pen = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      const rgb = (c) => { pen.clearRect(0, 0, 1, 1); pen.fillStyle = c; pen.fillRect(0, 0, 1, 1); return [...pen.getImageData(0, 0, 1, 1).data]; };
      const lum = (c) => {
        const [r, g, b] = rgb(c).slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      let ground = list;
      while (ground.parentElement && rgb(getComputedStyle(ground).backgroundColor)[3] < 200) ground = ground.parentElement;
      const bgL = lum(getComputedStyle(ground).backgroundColor);
      const contrast = (n) => { const l = lum(getComputedStyle(n).color); return Math.round(((Math.max(l, bgL) + 0.05) / (Math.min(l, bgL) + 0.05)) * 10) / 10; };
      const head = list.querySelector('.history__day-name');
      const time = list.querySelector('.history__row:not([aria-selected="true"]) .history__when');
      out.head = { weight: Number(getComputedStyle(head).fontWeight), contrast: contrast(head) };
      out.time = { weight: Number(getComputedStyle(time).fontWeight), contrast: contrast(time) };
      const dayNodes = [...list.querySelectorAll('.history__day')];
      out.above = Math.min(...dayNodes.slice(1).map((d, i) => {
        const prev = dayNodes[i].lastElementChild.getBoundingClientRect().bottom;
        return Math.round(d.querySelector('.history__day-name').getBoundingClientRect().top - prev);
      }));
      const r0 = list.querySelectorAll('.history__row');
      out.between = Math.round(r0[1].getBoundingClientRect().top - r0[0].getBoundingClientRect().bottom);
      const rows = days.flatMap((d) => d.rows);
      out.days = days.map((d) => d.name + ':' + d.rows.length).join(' ');
      out.allGrouped = rows.length === list.querySelectorAll('.history__row').length && rows.length === 40;
      out.daysDistinct = days.length >= 4 && days.every((d, i) => i === 0 || d.name !== days[i - 1].name);
      out.timesDistinct = days.every((d) => new Set(d.rows.map((r) => r.when)).size === d.rows.length);
      out.burst = rows.filter((r) => r.v >= 94 && r.v <= 96).map((r) => r.when).join(' | ');
      out.noSeconds = rows.filter((r) => !/:\d\d:\d\d\b/.test(r.when)).map((r) => r.when).join(' | ');
      out.stamp = q('.history__stamp').textContent;
      out.kinds = [...view.querySelectorAll('.review__kind')].map((k) => k.textContent).join();
      out.tags = rows.filter((r) => r.tag).map((r) => r.v + ':' + r.tag).join();
      out.oneLine = rows.every((r) => r.parts <= 2) && new Set(rows.map((r) => r.h)).size === 1 && !list.querySelector('.history__what');
      close();
      return out;
    });
    console.log('  history:', JSON.stringify(vh));
    check(vh.listAtRest === 'bottom' && vh.listScrolled === 'top bottom' && vh.viewAtRest === 'bottom',
      `Version history: the list and the version fade at an edge with more beyond it (list ${vh.listAtRest}, scrolled ${vh.listScrolled}; version ${vh.viewAtRest})`);
    check(vh.diffs === 3 && vh.squeezed === 0,
      `each diff as tall as its rows, never squeezed into a scroll box of its own inside the window's (${vh.squeezed} of ${vh.diffs})`);
    check(vh.wide && vh.shortRows === 0,
      `scrolled sideways, every row of a diff runs the longest line's width, its wash with it (${vh.shortRows} short)`);
    check(vh.gaps === 'row:⋯27 lines, row:⋯21 lines, row:⋯6 lines, row:⋯11 lines, row:⋯9 lines',
      `lines left out are a row a line tall, ⋯ and how many (${vh.gaps})`);
    check(vh.allGrouped && vh.daysDistinct,
      `the versions under their days, each day one heading (${vh.days})`);
    check(vh.timesDistinct && vh.burst.split(' | ').length === 3 && vh.noSeconds === '' && /:\d\d:\d\d\b/.test(vh.stamp),
      `every time to the second, in the list and over the version, so no two rows of a day say the same (${vh.burst}; ${vh.stamp}; without: ${vh.noSeconds || 'none'})`);
    check(vh.kinds === 'edited since,edited since,edited since,deleted since,added since',
      `each file says what became of it after the version (${vh.kinds})`);
    check(vh.oneLine && vh.tags === '100:Current,70:Deleted',
      `a row is one line, its time, all of one height; only the newest says Current and a deletion Deleted (${vh.tags})`);
    check(vh.head.weight >= 600 && vh.time.weight <= 400 && vh.head.contrast > vh.time.contrast + 1 && vh.above >= 3 * Math.max(1, vh.between),
      `a day's heading stands out from its rows: heavier (${vh.head.weight} over ${vh.time.weight}), stronger against the ground (${vh.head.contrast} over ${vh.time.contrast}), and room above it (${vh.above}px, rows ${vh.between}px apart)`);
    check(vh.stampOff <= 1 && vh.extra === '',
      `the version's time centred on its buttons (${vh.stampOff}px off), and nothing under it to say it is read only or which side is which (${vh.extra || 'none'})`);
  }

  for (const theme of ['dark', 'light']) {
    await page.evaluate((t) => { window.Kit.setTheme(t); }, theme);
    await wait(500);
    const light = await page.evaluate(() => document.documentElement.classList.contains('light'));
    check(light === (theme === 'light'), `the ${theme} theme is on`);
    await page.screenshot({ path: path.join(outDir, `kit-${theme}.png`), fullPage: true });
  }
  console.log('  wrote scripts/.shots/kit-dark.png and kit-light.png');
} catch (e) {
  crash = e;
}
await finish(crash);
