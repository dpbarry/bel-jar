import { openProbe } from './probe-harness.mjs';

const { page, check, errors, load, wait, finish } = await openProbe({
  port: 8877,
  waitFor: () => window.CurrentEditor && window.Menu && window.DownloadZip,
});

let crash = null;
try {
  await load('% A short introduction.\nfun identity : Nat -> Nat = z\n');
  await page.evaluate(() => {
    window.__manuscriptDownload = null;
    window.__manuscriptToasts = [];
    const original = DownloadZip.triggerDownload;
    DownloadZip.triggerDownload = (blob, fileName) => {
      blob.text().then((text) => {
        window.__manuscriptDownload = { fileName, text };
      });
    };
    const toastOrig = window.Toasts?.show?.bind(window.Toasts);
    if (toastOrig) {
      window.Toasts.show = (msg, ...rest) => {
        window.__manuscriptToasts.push(String(msg));
        return toastOrig(msg, ...rest);
      };
    }
    window.__restoreManuscriptDownload = () => {
      DownloadZip.triggerDownload = original;
      if (toastOrig) window.Toasts.show = toastOrig;
    };
  });

  await page.click('#menu-tools');
  const menu = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.menu-item')];
    const row = rows.find((el) => el.textContent.trim() === 'Export manuscript');
    if (row) row.click();
    return {
      found: !!row,
      disabled: !!row?.disabled,
    };
  });
  check(menu.found, 'Tools menu contains Export manuscript');
  check(!menu.disabled, 'Export manuscript is enabled with an open file');
  await wait(120);

  const download = await page.evaluate(() => window.__manuscriptDownload);
  // Look only inside the article: the stylesheet names every class, and the comment's words
  // also appear if it lands in a code panel, so checks on the whole file pass vacuously.
  const text = download?.text || '';
  const article = text.includes('<article') ? text.slice(text.indexOf('<article')) : '';
  check(download?.fileName.endsWith('-manuscript.html'), 'export uses the manuscript filename suffix', download?.fileName);
  check(article.startsWith('<article class="manuscript">'), 'export contains the manuscript article');
  check(article.includes('<p class="manuscript-prose">A short introduction.</p>'), 'a comment becomes a prose paragraph', article.slice(0, 300));
  check(!article.includes('% A short introduction.'), 'prose loses the language\'s comment delimiters');
  check(article.includes('<pre class="manuscript-code">'), 'source becomes a code panel');
  check(/<pre class="manuscript-code"><code>[\s\S]*<span class="jar-hl-[a-z-]+">/.test(article), 'code panels carry the editor\'s highlighting');
  const toasts = await page.evaluate(() => window.__manuscriptToasts || []);
  check(toasts.length === 0, 'successful export does not toast', toasts);
  await page.evaluate(() => window.__restoreManuscriptDownload?.());
} catch (e) {
  crash = e;
} finally {
  await finish('Manuscript probe', crash);
}
