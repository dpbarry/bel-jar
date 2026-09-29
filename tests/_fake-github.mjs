// A stand-in for GitHub's OAuth, in Node: authorize (redirects back with a
// code, or with access_denied when nobody is signed in there), the code
// exchange (single-use codes; checks the client id and secret), and the
// profile. Tests point the Worker at it with the GITHUB_* vars.
import http from 'node:http';
import { freePort } from './_worker-env.mjs';

export const PEOPLE = {
  dean: { id: 101, login: 'Dean-B', name: 'Dean', avatar_url: null },
  renamed: { id: 202, login: 'dean-b', name: 'Someone else', avatar_url: null },
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
        res.writeHead(200, { 'content-type': 'application/json' });
        if (b.client_id !== 'test-client' || b.client_secret !== 'test-secret' || !who) {
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
      res.end(JSON.stringify(who ? PEOPLE[who] : { message: 'Bad credentials' }));
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
