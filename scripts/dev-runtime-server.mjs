// The Beluga runtime's file server for `npm run dev` (scripts/dev-server.mjs, which
// runs it on 127.0.0.1:8788; the dev Worker passes these paths on to it). The runtime
// is not an asset (.assetsignore), so only this serves it locally.
//
// The JS build, and each Wasm build's loader with the .wasm in the folder beside
// it, served as application/wasm (instantiateStreaming takes nothing else). Read from
// disk on each request, so a rebuild (_rebuild/rebuild.ps1) is picked up without a
// restart; a change to THIS list is not, until `npm run dev` restarts.
// tests/test-dev-runtime.mjs holds both halves: the Worker's and this one.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

export const RUNTIME = new Set(['/beluga_web.bc.js',
  '/beluga_web_wasm.bc.wasm.js', '/beluga_web_wasm_cps.bc.wasm.js']);
const WASM_ASSET = /^\/beluga_web_wasm(?:_cps)?\.bc\.wasm\.assets\/[\w-]+\.wasm$/;

export const isRuntimePath = (p) => RUNTIME.has(p) || WASM_ASSET.test(p);

export function createRuntimeServer(root) {
  return http.createServer((req, res) => {
    const p = new URL(req.url, 'http://127.0.0.1').pathname;
    if (!isRuntimePath(p)) { res.writeHead(404); res.end(); return; }
    fs.readFile(path.join(root, p.slice(1)), (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      const type = p.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8';
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
      res.end(data);
    });
  });
}
