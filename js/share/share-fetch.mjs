/**
 * Asking the server what a link shows (GET /api/share/<id>, docs/PERSIST.md
 * §5.12): the reading page, and home making a copy (Open in BelJar). Small on
 * purpose: home loads it without the reading page's parser.
 */

const g = typeof window !== 'undefined' ? window : globalThis;

/** What the server answered, as the page reads it: { view } | { why }. */
export async function fetchShare(id, doFetch = (...a) => g.fetch(...a)) {
  if (!id) return { why: 'gone' };
  let res;
  try {
    res = await doFetch('/api/share/' + encodeURIComponent(id), { cache: 'no-store', credentials: 'omit' });
  } catch (_) {
    return { why: 'network' };
  }
  if (res.status === 404) return { why: 'gone' };
  if (res.status === 413) return { why: 'too-large' };
  if (res.status !== 200) return { why: 'network' };
  try {
    const view = await res.json();
    if (!view || !Array.isArray(view.files)) return { why: 'network' };
    return { view };
  } catch (_) {
    return { why: 'network' };
  }
}
