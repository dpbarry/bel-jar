// A stand-in for GitHub's OAuth, in Node: authorize (redirects back with a
// code, or with access_denied when nobody is signed in there), the code
// exchange (single-use codes; checks the client id and secret), and the
// profile. Tests point the Worker at it with the GITHUB_* vars.
import http from 'node:http';
import zlib from 'node:zlib';
import { freePort } from './_worker-env.mjs';

// `avatar`: this stand-in serves a real picture for 'ok', a GitHub identicon for
// 'identicon' and none for 'missing' (a 404, as a blocked or deleted image would
// be), from its own origin: cross-origin to the site, as GitHub's avatars are,
// and readable across it as theirs are. The profile carries its URL.
export const PEOPLE = {
  dean: { id: 101, login: 'Dean-B', name: 'Dean', avatar: 'ok' },
  renamed: { id: 202, login: 'dean-b', name: 'Someone else', avatar: 'missing' },
  // An account with nothing in the cloud yet: signing in starts from scratch.
  // No picture of its own, so GitHub draws it an identicon.
  newcomer: { id: 303, login: 'new-person', name: 'New Person', avatar: 'identicon' },
};

/** A square PNG of one colour, encoded here so it is certainly valid (zlib's own deflate and CRC). */
function solidPng(size, [r, g, b]) {
  return png(size, () => [r, g, b]);
}

// GitHub's identicon: 420px, a 5x5 mirrored pattern of 70px blocks on #f0f0f0,
// a 35px margin (a twelfth) all round.
function identiconPng() {
  const rows = ['10101', '01110', '11011', '01010', '10001'];
  return png(420, (x, y) => {
    const bx = Math.floor((x - 35) / 70);
    const by = Math.floor((y - 35) / 70);
    const on = x >= 35 && y >= 35 && bx < 5 && by < 5 && rows[by][bx] === '1';
    return on ? [204, 84, 150] : [240, 240, 240];
  });
}

function png(size, colourAt) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    for (let x = 0; x < size; x++) raw.set(colourAt(x, y), row + 1 + x * 3);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const AVATAR_PNG = solidPng(16, [214, 92, 150]);
const IDENTICON_PNG = identiconPng();
// As GitHub's avatar host answers: readable cross-origin (the page reads an
// identicon's pixels to inset it, js/account/avatar.mjs).
const AVATAR_HEADERS = {
  'content-type': 'image/png',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'cross-origin-resource-policy': 'cross-origin',
};

export async function startFakeGitHub() {
  let signedIn = 'dean';
  const codes = new Map();
  const tokens = new Map();
  const seen = { exchanges: [], profiles: 0 };
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, url);
    if (u.pathname === '/login/oauth/authorize') {
      if (u.searchParams.get('client_id') !== 'test-client') { res.writeHead(400); res.end(); return; }
      const back = new URL(u.searchParams.get('redirect_uri'));
      if (signedIn === null) {
        back.searchParams.set('error', 'access_denied');
      } else {
        const code = 'code-' + Math.random().toString(36).slice(2);
        codes.set(code, signedIn);
        back.searchParams.set('code', code);
      }
      back.searchParams.set('state', u.searchParams.get('state'));
      res.writeHead(302, { location: back.toString() });
      res.end();
    } else if (u.pathname === '/login/oauth/access_token' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        const b = JSON.parse(body || '{}');
        seen.exchanges.push(b);
        const who = codes.get(b.code);
        codes.delete(b.code);
        // As GitHub answers (checked against it 2026-09-28): 200 with { error }, the
        // credentials checked before the code.
        res.writeHead(200, { 'content-type': 'application/json' });
        if (b.client_id !== 'test-client' || b.client_secret !== 'test-secret') {
          res.end(JSON.stringify({ error: 'incorrect_client_credentials' }));
          return;
        }
        if (!who) {
          res.end(JSON.stringify({ error: 'bad_verification_code' }));
          return;
        }
        const token = 'gho_' + Math.random().toString(36).slice(2);
        tokens.set(token, who);
        res.end(JSON.stringify({ access_token: token, token_type: 'bearer', scope: '' }));
      });
    } else if (u.pathname === '/user') {
      const who = tokens.get(String(req.headers.authorization || '').replace(/^Bearer /, ''));
      seen.profiles += 1;
      res.writeHead(who ? 200 : 401, { 'content-type': 'application/json' });
      if (!who) {
        res.end(JSON.stringify({ message: 'Bad credentials' }));
        return;
      }
      const { avatar, ...person } = PEOPLE[who];
      res.end(JSON.stringify(Object.assign(person, { avatar_url: avatar ? url + '/avatars/' + who + '-' + avatar + '.png' : null })));
    } else if (u.pathname.startsWith('/avatars/') && u.pathname.endsWith('-ok.png')) {
      res.writeHead(200, AVATAR_HEADERS);
      res.end(AVATAR_PNG);
    } else if (u.pathname.startsWith('/avatars/') && u.pathname.endsWith('-identicon.png')) {
      res.writeHead(200, AVATAR_HEADERS);
      res.end(IDENTICON_PNG);
    } else if (u.pathname.startsWith('/avatars/')) {
      // A deleted picture: a 404 the page may read, as the avatar host's are.
      res.writeHead(404, { 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' });
      res.end();
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return {
    url,
    seen,
    /** Who is signed in at GitHub: a key of PEOPLE, or null (declines). */
    signIn(who) { signedIn = who; },
    /** The Worker's --var settings that point it here. */
    vars: {
      GITHUB_AUTHORIZE_URL: url + '/login/oauth/authorize',
      GITHUB_TOKEN_URL: url + '/login/oauth/access_token',
      GITHUB_API_URL: url,
    },
    close: () => server.close(),
  };
}
