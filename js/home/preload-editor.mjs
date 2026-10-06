/**
 * The editor arrives fast (plan v6 h13; the numbers are in docs/PERSIST.md §5.11).
 *
 * Its start costs about 200 ms of this machine's time once its scripts are in
 * hand, and three megabytes of network when they are not. So home, once idle,
 * asks the browser to fetch them ahead (`rel="prefetch"`: low priority, kept
 * for the next navigation). Nothing is run and nothing is written: a script
 * that is only fetched has no side effects. ⛔ That is why this is a preload and
 * not a prerender: a prerendered editor would start workers, take the sync
 * lock and write, for a page nobody may ever look at.
 *
 * ⛔ One owner of what the editor loads: its own document. Home reads the
 * script addresses out of edit.html, version queries and all, so a list kept
 * here cannot fall behind it. The Beluga runtime (24 MB, from R2) is not among
 * them: the service worker keeps that one.
 */
import { Routes } from '../frame/routes.mjs';

const g = typeof window !== 'undefined' ? window : globalThis;

/** The scripts a document loads, in order, as it writes them (`src` attributes, unresolved). */
export function scriptsOf(html) {
  return [...String(html || '').replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
}

/** Whether to fetch ahead at all: not when the person has asked the browser to save data. */
export function mayPreload(nav) {
  const c = nav && nav.connection;
  return !(c && c.saveData);
}

/**
 * Fetch the editor's document, and ask for each of its scripts ahead of time.
 * Resolves to the addresses asked for (empty when it did nothing).
 */
export async function preloadEditor(env) {
  const doc = (env && env.document) || g.document;
  const fetchFn = (env && env.fetch) || g.fetch;
  const nav = (env && env.navigator) || g.navigator;
  const base = (env && env.base) || (g.location && g.location.href);
  if (!doc || typeof fetchFn !== 'function' || !base || !mayPreload(nav)) return [];
  let html;
  let at;
  try {
    at = new URL(Routes.editUrl(), base);
    const res = await fetchFn(at.href, { credentials: 'same-origin' });
    if (!res || !res.ok) return [];
    html = await res.text();
  } catch (_) {
    return [];
  }
  const asked = [];
  for (const src of scriptsOf(html)) {
    let url;
    try { url = new URL(src, at); } catch (_) { continue; }
    if (url.origin !== at.origin) continue;
    const link = doc.createElement('link');
    link.rel = 'prefetch';
    link.as = 'script';
    link.href = url.href;
    doc.head.appendChild(link);
    asked.push(url.href);
  }
  return asked;
}

/** Once the page is idle: what a person does next is open a project. */
export function preloadEditorWhenIdle() {
  const run = () => { preloadEditor(); };
  if (typeof g.requestIdleCallback === 'function') g.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1200);
}
