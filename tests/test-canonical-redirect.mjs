// BelJar has one address: beljar.deanbarry.com. index.html carries a small
// inline script that sends the old GitHub Pages address there, same page and
// all. This runs THAT script, extracted from index.html as shipped, against a
// fake location for every host it will ever meet.
//
// The dangerous direction is the one that matters most: if it ever fired on the
// canonical host it would redirect to itself forever and the site would be
// down; if it fired on localhost the probes and local dev would leave for prod.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// The one inline script that names the old host.
const at = html.indexOf("'dpbarry.github.io'");
expect(at > 0, 'index.html carries the GitHub Pages redirect');
const open = html.lastIndexOf('<script>', at);
const close = html.indexOf('</script>', at);
expect(open > 0 && close > at, 'the redirect is a plain inline <script>');
const code = html.slice(open + '<script>'.length, close);

// It must run before anything boots: ahead of every other script on the page.
expect(open < html.indexOf('<script src='), 'the redirect runs before any other script');

function visit(href) {
  const u = new URL(href);
  let went = null;
  const location = {
    hostname: u.hostname,
    pathname: u.pathname,
    search: u.search,
    hash: u.hash,
    replace(url) { went = url; },
  };
  vm.runInNewContext(code, { location });
  return went;
}

const CANON = 'https://beljar.deanbarry.com';

// Where it fires: the old address, keeping the page, the query and the hash.
expect(visit('https://dpbarry.github.io/bel-jar/') === CANON + '/', 'the old root lands on the new root');
expect(visit('https://dpbarry.github.io/bel-jar') === CANON + '/', 'without the trailing slash too');
expect(visit('https://dpbarry.github.io/bel-jar/index.html?p=abc#goal-3') === CANON + '/index.html?p=abc#goal-3',
  'a deep link keeps its page, query and hash');
expect(visit('https://dpbarry.github.io/bel-jar/library/manifest.json') === CANON + '/library/manifest.json',
  'the /bel-jar project prefix is dropped, and only that');

// Where it must never fire.
for (const href of [
  CANON + '/',
  CANON + '/index.html?p=abc#x',
  'http://localhost:8871/index.html',
  'http://127.0.0.1:8871/index.html',
  'https://bel-jar.deanbarry100.workers.dev/',
  'file:///C:/Users/Dean/Documents/Coding/bel-jar/index.html',
]) {
  expect(visit(href) === null, `no redirect on ${href}`);
}

// And wherever it does fire, it can never point back at where it fired.
for (const href of ['https://dpbarry.github.io/bel-jar/', 'https://dpbarry.github.io/bel-jar/x?y#z']) {
  const to = visit(href);
  expect(to && new URL(to).hostname !== new URL(href).hostname, `redirect from ${href} leaves the old host`);
  expect(visit(to) === null, `and the page it lands on (${to}) does not redirect again`);
}

console.log(`OK canonical-redirect (${n} checks: github.io -> ${CANON}, never on the canonical host or locally)`);
