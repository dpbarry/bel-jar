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
    rows: document.querySelectorAll('.home-row').length,
    marks: [...document.querySelectorAll('.home-row__mark')].map((m) => m.textContent),
    clouds: [...document.querySelectorAll('.kit-cloud .sync-cloud')].map((b) => b.dataset.state + ':' + (b.querySelector('svg') ? 'drawn' : 'empty')),
    headers: document.querySelectorAll('.kit-frame--flush > header').length,
    buttons: document.querySelectorAll('.kit-section .jar-prompt-dialog__btn').length,
    cards: [...document.querySelectorAll('.kit-frame > dialog.jar-dialog .jar-dialog__card')].map((c) => getComputedStyle(c).opacity + ':' + c.querySelectorAll('button[data-action]').length).join(),
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
  }));
  console.log('  kit:', JSON.stringify({ sections: kit.sections, specimens: kit.specimens }));
  check(kit.sections.join() === 'Headers,Panel headers,Buttons,The cloud,Menus,Dialogs,Home,Toasts,Not on this page yet', `the kit has its sections (${kit.sections.join(', ')})`);
  check(kit.headers === 4, `both documents' headers, signed out and signed in (${kit.headers})`);
  check(kit.clouds.length === 7 && kit.clouds.every((c) => /:drawn$/.test(c)), `the cloud in every state of the summary (${kit.clouds.join(' ')})`);
  check(kit.rows === 5 && kit.marks.join() === '2 files to review', `home's rows, with the marker only where files wait to be reviewed (${kit.rows} rows; ${kit.marks.join(', ')})`);
  check(kit.homeRow === 'home-row__name home-row__when', `a project's row says its name and when, and nothing else (${kit.homeRow})`);
  check(kit.homeWays.split(',').every((w) => w === 'New project/Import folder/Browse examples'), `each page has the three ways to start (${kit.homeWays})`);
  check(kit.homeEdges === '0,0', `one column: a row's name starts at the tiles' left edge, and its date ends at their right (${kit.homeEdges})`);
  check(kit.cards === '1:2,1:2' && kit.dialogsOpen === 0 && kit.buttons >= 12,
    `two dialogs PromptDialog made, each shown in its frame with its two answers, and none left open over the page (${kit.cards})`);
  check(kit.homeTiles.split(',').every((t) => /^(\d+)=\1=\1$/.test(t)), `the three ways to start stand in a row (${kit.homeTiles})`);
  check(kit.dupIds.length === 0, `and none of home's ids is on the page twice, though its frame is drawn three times (${kit.dupIds.slice(0, 4).join(', ')})`);
  check(kit.menu.includes('All changes synced') && kit.menu.includes('Sync now') && kit.menu.includes('Project') && kit.menuShown === 'visible/1',
    `a menu the Menu component made, shown in its frame (${kit.menu.join(' | ')}; ${kit.menuShown})`);
  check(kit.toasts === '1,1,1' && kit.floating === 0, `three toasts the Toasts component made, shown in theirs, and nothing left floating over the page (${kit.toasts})`);
  check(kit.styled.includes('style.css') && kit.styled.includes('home.css') && kit.styled.includes('kit.css') && kit.styled.length === 3,
    `styled by the app's two stylesheets and the kit's own frame, nothing else (${kit.styled.join(', ')})`);

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
