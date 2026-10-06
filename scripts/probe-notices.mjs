// Notifications that earn the bell, in real Chrome (plan v6 phase 04, n1):
// a run that finishes after you left its file leaves one notice with its
// verdict, opening the first error; a run you stay and watch leaves none.
//   node scripts/probe-notices.mjs
import { openProbe } from './probe-harness.mjs';

const ready = () => window.Persist && window.CurrentEditor && window.Frame && window.Frame.isMounted() && window.BelugaRun;
const port = 8877;
const { page, check, finish, wait } = await openProbe({ port, page: 'edit.html', scale: 1, settle: 800, waitFor: ready });

async function tab(name) {
  const handle = await page.evaluateHandle((n) => [...document.querySelectorAll('.editor-tab')]
    .find((t) => (t.querySelector('.editor-tab-name') || {}).textContent === n), name);
  await handle.asElement().click();
  await page.waitForFunction((n) => {
    const f = Persist.getFileById(Persist.getActiveFileId());
    return f && f.name === n;
  }, { timeout: 10000 }, name);
}
/** A run, started as the Run command starts it, and how it ended (busy, then not). */
async function runFile() {
  await page.evaluate(() => { window.__runDone = false; BelugaRun.runFile().then(() => { window.__runDone = true; }); });
}
const done = () => page.waitForFunction(() => window.__runDone === true && !BelugaRun.isBelugaBusy(), { timeout: 120000 });

let crash = null;
try {
  // A project with a file that has an error, and one that checks.
  const href = await page.evaluate(() => {
    const made = Persist.createProjectWithFiles('Notices', [
      { name: 'broken.bel', text: 'LF nat : type =\n| z : nat\n| s : nat -> nat;\n\nrec plus : nat -> nat -> nat =\nfn x => fn y => times x y;\n' },
      { name: 'fine.bel', text: 'LF bool : type =\n| tt : bool\n| ff : bool;\n' },
    ]);
    Persist.setOpenFileIds(made.files.map((f) => f.id));
    Persist.setActiveFileId(made.files[0].id);
    return new URL(Routes.editUrl(made.projectId), location.href).href;
  });
  await page.goto(href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(ready, { timeout: 60000 });
  await wait(1500);
  await page.evaluate(() => Notifications.clear());

  // Run broken.bel, and go to fine.bel while it runs.
  await tab('broken.bel');
  await runFile();
  await page.waitForFunction(() => BelugaRun.isBelugaBusy(), { timeout: 10000 }).catch(() => {});
  await tab('fine.bel');
  await done();
  await wait(400);
  const left = await page.evaluate(() => Notifications.list().filter((r) => r.source === 'run.finished'));
  check(left.length === 1 && left[0].title === 'Errors in broken.bel' && left[0].kind === 'error',
    `a run that finished after you left its file leaves one notice, with its verdict (${JSON.stringify(left.map((r) => r.title))})`);
  check(left[0] && left[0].links && left[0].links.line >= 1, `and it opens the first error (${JSON.stringify(left[0] && left[0].links)})`);
  const count = await page.evaluate(() => Notifications.count());
  check(count === 1, `the bell counts one (${count})`);

  // Run broken.bel again, and stay on it.
  await page.evaluate(() => Notifications.clear());
  await tab('broken.bel');
  await runFile();
  await done();
  await wait(400);
  const stayed = await page.evaluate(() => Notifications.count());
  check(stayed === 0, `a run you stayed to watch leaves nothing: the REPL said it (${stayed})`);

  // A suite changes colour (n2): an edit to lemmas.bel that breaks main.bel, which is not open.
  // The suite's other files are checked again when a file opens, not while you type, so the
  // edit is followed by going to extra.bel, as a person moving on would.
  const LEMMAS = 'LF nat : type =\n| z : nat\n| s : nat -> nat;\n';
  const suiteHref = await page.evaluate((lemmas) => {
    const made = Persist.createProjectWithFiles('Suite', [
      { name: 'nat.cfg', text: 'lemmas.bel\nmain.bel\nextra.bel\n' },
      { name: 'lemmas.bel', text: lemmas },
      { name: 'main.bel', text: 'rec two : [ |- nat] = [ |- s (s z)];\n' },
      { name: 'extra.bel', text: 'LF bool : type =\n| tt : bool\n| ff : bool;\n' },
    ]);
    const named = (n) => made.files.find((f) => f.name === n).id;
    Persist.setOpenFileIds([named('lemmas.bel'), named('extra.bel')]);
    Persist.setActiveFileId(named('lemmas.bel'));
    return new URL(Routes.editUrl(made.projectId), location.href).href;
  }, LEMMAS);
  await page.goto(suiteHref, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(ready, { timeout: 60000 });
  await wait(4000);
  await page.evaluate(() => Notifications.clear());
  const edit = (text) => page.evaluate((t) => {
    const v = CurrentEditor.getView();
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t } });
  }, text);
  const suiteNotice = (title) => page.waitForFunction((t) => Notifications.list().some((r) => r.source === 'suite.colour' && r.title === t),
    { timeout: 60000 }, title).then(() => true, () => false);
  await edit(LEMMAS.replace(/nat/g, 'num'));
  await tab('extra.bel');
  const turned = await suiteNotice('Suite nat has errors');
  const red = await page.evaluate(() => Notifications.list().filter((r) => r.source === 'suite.colour'));
  check(turned && red.length === 1 && /main\.bel/.test(red[0].body) && red[0].links && red[0].links.line >= 1,
    `an edit that breaks another file in the suite leaves one notice, naming it and opening its error (${JSON.stringify(red)})`);
  await tab('lemmas.bel');
  await edit(LEMMAS);
  await tab('extra.bel');
  const back = await suiteNotice('Suite nat checks again');
  const cards = await page.evaluate(() => Notifications.list().filter((r) => r.source === 'suite.colour').length);
  check(back && cards === 1, `fixing it turns the same card green (${cards} card)`);
} catch (e) {
  crash = e;
}
await finish('probe-notices', crash);
