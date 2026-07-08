import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { cpStrStepPrelude, strStepDecl } from './cp-str-step-prelude.mjs';

const root = process.cwd();
const port = Number(process.env.PROVER_PROBE_PORT || 8816);
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

execFileSync(process.execPath, ['scripts/build-editor.mjs'], { cwd: root, stdio: 'inherit' });

const types = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(root, p), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

await new Promise((resolve) => server.listen(port, resolve));

const puppeteer = (await import('../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default;
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  protocolTimeout: 590000,
  args: ['--window-size=1200,800'],
  defaultViewport: { width: 1200, height: 800 },
});

const probes = [
  {
    name: 'dual_sym',
    maxSteps: 80,
    prelude: [
      'tp : type.',
      '① : tp.',
      '⊥ : tp.',
      '⊗ : tp -> tp -> tp.',
      '⅋ : tp -> tp -> tp.',
      '& : tp -> tp -> tp.',
      '⊕ : tp -> tp -> tp.',
      'dual : tp -> tp -> type.',
      'D1 : dual ① ⊥.',
      'D⊥ : dual ⊥ ①.',
      'D⊗ : dual A A\' -> dual B B\' -> dual (⊗ A B) (⅋ A\' B\').',
      'D⅋ : dual A A\' -> dual B B\' -> dual (⅋ A B) (⊗ A\' B\').',
      'D& : dual A A\' -> dual B B\' -> dual (& A B) (⊕ A\' B\').',
      'D⊕ : dual A A\' -> dual B B\' -> dual (⊕ A B) (& A\' B\').',
    ].join('\n'),
    decl: [
      "rec dual_sym : [ |- dual A A' ] -> [ |- dual A' A] =",
      '/ total 1 /',
      '?',
      ';',
    ].join('\n'),
  },
  {
    name: 'dl_uniq',
    maxSteps: 60,
    prelude: [
      'tp : type.',
      'base : tp.',
      'arr : tp -> tp -> tp.',
      'dl : tp -> tp -> type.',
      'd_base : dl base base.',
      "d_arr  : dl A A' -> dl B B' -> dl (arr A B) (arr A' B').",
      'eq : tp -> tp -> type.',
      'refl : eq A A.',
    ].join('\n'),
    decl: [
      "rec dl_uniq : [ |- dl A A' ] -> [ |- dl A A'' ] -> [ |- eq A' A'' ] =",
      '/ total 1 /',
      '?',
      ';',
    ].join('\n'),
  },
  {
    // Exercises the whole context-schema move set: t_app (invert + multi-arg IH),
    // t_lam (block-schema IH under a binder — the schema-conformant context
    // extension `[g, b:block (…) |- D[.., b.1, b.2]]`), and the parameter branch
    // (parameter inversion `let [g |- #q.u[..]] = f in`). A HARD gate.
    name: 'tp_uniq',
    maxSteps: 90,
    prelude: [
      'tp : type.',
      'base : tp.',
      'arr : tp -> tp -> tp.',
      'tm : type.',
      'app : tm -> tm -> tm.',
      'lam : tp -> (tm -> tm) -> tm.',
      'oft : tm -> tp -> type.',
      't_app : oft M (arr A B) -> oft N A -> oft (app M N) B.',
      't_lam : ({x:tm} oft x A -> oft (R x) B) -> oft (lam A R) (arr A B).',
      'eq : tp -> tp -> type.',
      'refl : eq A A.',
      'schema tctx = some [A:tp] block (x:tm, u:oft x _);',
    ].join('\n'),
    decl: [
      "rec tp_uniq : (g:tctx)[g |- oft M T[]] -> [g |- oft M T'[]] -> [ |- eq T T'] =",
      '/ total d (tp_uniq g m t t\' d) /',
      '?',
      ';',
    ].join('\n'),
  },
  {
    // HELD-OUT generality validation (the anti-overfit bar): a library-corpus
    // lemma the engine was never developed against — eq-proof.bel's transitivity.
    // Exercises: param branch closed by the SECOND premise, inversion + two-arg
    // recursion, block repackaging shared across both args, and the tuple-
    // substitution re-lambda `eq_lam (\x. \u. E[.., <x;u>])`.
    // HELD-OUT: eq-proof.bel's reflexivity — a Pi-PREMISE theorem (`mlam g =>
    // mlam U => case [g |- U] of …` with the IH instantiating the Pi binders:
    // `eq_ref [g, b:block (…)] [g, b |- L[.., b.1]]`).
    name: 'eq_ref',
    maxSteps: 80,
    prelude: [
      'exp: type.',
      'app: exp -> exp -> exp.',
      'lam: (exp -> exp) -> exp.',
      'eq: exp -> exp -> type.',
      'eq_app : eq E1 F1 -> eq E2 F2 -> eq (app E1 E2) (app F1 F2).',
      'eq_lam :  ({x : exp} eq x x -> eq (E x) (F x)) -> eq (lam (\\x. E x)) (lam (\\x. F x)).',
      'schema eqCtx = block x:exp, _t:eq x x;',
    ].join('\n'),
    decl: [
      'rec eq_ref : {g:eqCtx} {U:[g |- exp]} [g |- eq U U] =',
      '/ total u (eq_ref g u) /',
      '?',
      ';',
    ].join('\n'),
  },
  {
    name: 'eq_trans',
    maxSteps: 80,
    prelude: [
      'exp: type.',
      'app: exp -> exp -> exp.',
      'lam: (exp -> exp) -> exp.',
      'eq: exp -> exp -> type.',
      'eq_app : eq E1 F1 -> eq E2 F2 -> eq (app E1 E2) (app F1 F2).',
      'eq_lam :  ({x : exp} eq x x -> eq (E x) (F x)) -> eq (lam (\\x. E x)) (lam (\\x. F x)).',
      'schema eqCtx = block x:exp, _t:eq x x;',
    ].join('\n'),
    decl: [
      'rec eq_trans: (g:eqCtx) [g |- eq TT RR] -> [g |- eq RR SS] -> [g |- eq TT SS] =',
      '/ total e1 (eq_trans g t r s e1) /',
      '?',
      ';',
    ].join('\n'),
  },
  {
    name: 'str_hyp',
    maxSteps: 40,
    prelude: [
      'name : type.',
      'tp : type.',
      'hyp : name -> tp -> type.',
      'schema ctx = some [A:tp] block x : name, h : hyp x A;',
    ].join('\n'),
    decl: [
      'rec str_hyp : (g:ctx) [g, z:name, hz:hyp z C[] |- hyp X[..] A[]] -> [g |- hyp X A[]] =',
      '?',
      ';',
    ].join('\n'),
  },
  {
    name: 'lin_name_must_appear',
    maxSteps: 150,
    prelude: [
      'name : type.',
      'schema nctx = name;',
      'imposs : type.',
      'tp : type.',
      'proc : type.',
      'fwd : name -> name -> proc.',
      'close : name -> proc.',
      'wait : name -> proc -> proc.',
      'out : name -> (name -> proc) -> (name -> proc) -> proc.',
      'inp : name -> (name -> name -> proc) -> proc.',
      'inl : name -> (name -> proc) -> proc.',
      'inr : name -> (name -> proc) -> proc.',
      'choice : name -> (name -> proc) -> (name -> proc) -> proc.',
      'pcomp : tp -> (name -> proc) -> (name -> proc) -> proc.',
      'linear: (name -> proc) -> type.',
      'l_fwd   : linear (\\x. fwd x Y).',
      'l_fwd2  : linear (\\x. fwd Y x).',
      'l_close : linear (\\x. close x).',
      'l_wait  : linear (\\x. wait x P).',
      'l_out   : linear Q -> linear (\\x. out x P Q).',
      'l_inp   : ({y:name} linear (\\x. P x y)) ->  linear (\\x. inp x P).',
      'l_inl   : linear P -> linear (\\x. inl x P).',
      'l_inr   : linear P -> linear (\\x. inr x P).',
      'l_choice: linear P -> linear Q -> linear (\\x. choice x P Q).',
      'l_pcomp1: ({x:name}linear  (\\z. P x z)) -> linear  (\\z. pcomp A (\\x. P x z)  Q).',
      'l_pcomp2: ({x:name}linear  (\\z. Q x z)) -> linear  (\\z. pcomp A P (\\x. Q x z)).',
      'l_wait2: linear P -> linear (\\z. wait X (P z)).',
      'l_out2 : ({y:name} linear (\\z. P z y)) -> linear (\\z. out X (P z) Q).',
      'l_out3 : ({x\':name}linear (\\z. Q z x\')) -> linear (\\z. out X P (Q z)).',
      'l_inp2 : ({x:name}{y:name} linear (\\z. P z x y)) -> linear (\\z. inp X (P z)).',
      'l_inl2   : ({x\':name}linear (\\z. P z x\')) -> linear (\\z. inl X (P z)).',
      'l_inr2   : ({x\':name}linear (\\z. P z x\')) -> linear (\\z. inr X (P z)).',
      'l_choice2: ({x\':name}linear (\\z. P z x\')) -> ({x\':name}linear (\\z. Q z x\')) -> linear (\\z. choice X (P z) (Q z)).',
    ].join('\n'),
    decl: [
      'rec lin_name_must_appear : (g : nctx) [g |- linear (\\x. P[..])] -> [ |- imposs] =',
      '/ total 1 /',
      '?',
      ';',
    ].join('\n'),
  },
  {
    // The full 20-constructor context-strengthening lemma: nullary fills + 14
    // strengthening recursions (`let [g, y:name |- R] = str_lin [g, y:name, x:name
    // |- X] in [g |- l_* (\y. R)]`). Exercises the under-binder call form + the
    // instantiated result context. A HARD gate.
    name: 'str_lin',
    maxSteps: 250,
    prelude: [
      'name : type.',
      'schema nctx = name;',
      'tp : type.',
      'proc : type.',
      'fwd : name -> name -> proc.',
      'close : name -> proc.',
      'wait : name -> proc -> proc.',
      'out : name -> (name -> proc) -> (name -> proc) -> proc.',
      'inp : name -> (name -> name -> proc) -> proc.',
      'inl : name -> (name -> proc) -> proc.',
      'inr : name -> (name -> proc) -> proc.',
      'choice : name -> (name -> proc) -> (name -> proc) -> proc.',
      'pcomp : tp -> (name -> proc) -> (name -> proc) -> proc.',
      'linear: (name -> proc) -> type.',
      'l_fwd   : linear (\\x. fwd x Y).',
      'l_fwd2  : linear (\\x. fwd Y x).',
      'l_close : linear (\\x. close x).',
      'l_wait  : linear (\\x. wait x P).',
      'l_out   : linear Q -> linear (\\x. out x P Q).',
      'l_inp   : ({y:name} linear (\\x. P x y)) ->  linear (\\x. inp x P).',
      'l_inl   : linear P -> linear (\\x. inl x P).',
      'l_inr   : linear P -> linear (\\x. inr x P).',
      'l_choice: linear P -> linear Q -> linear (\\x. choice x P Q).',
      'l_pcomp1: ({x:name}linear  (\\z. P x z)) -> linear  (\\z. pcomp A (\\x. P x z)  Q).',
      'l_pcomp2: ({x:name}linear  (\\z. Q x z)) -> linear  (\\z. pcomp A P (\\x. Q x z)).',
      'l_wait2: linear P -> linear (\\z. wait X (P z)).',
      'l_out2 : ({y:name} linear (\\z. P z y)) -> linear (\\z. out X (P z) Q).',
      'l_out3 : ({x\':name}linear (\\z. Q z x\')) -> linear (\\z. out X P (Q z)).',
      'l_inp2 : ({x:name}{y:name} linear (\\z. P z x y)) -> linear (\\z. inp X (P z)).',
      'l_inl2   : ({x\':name}linear (\\z. P z x\')) -> linear (\\z. inl X (P z)).',
      'l_inr2   : ({x\':name}linear (\\z. P z x\')) -> linear (\\z. inr X (P z)).',
      'l_choice2: ({x\':name}linear (\\z. P z x\')) -> ({x\':name}linear (\\z. Q z x\')) -> linear (\\z. choice X (P z) (Q z)).',
    ].join('\n'),
    decl: [
      'rec str_lin : (g : nctx) [g, x:name |- linear (\\y. P[.., y])] -> [g |- linear (\\y. P)] =',
      '/ total 1 /',
      '?',
      ';',
    ].join('\n'),
  },
  {
    // The deepest strengthening lemma: dependency-annotated split patterns
    // (`wtp_fwd D[] …`, `linP1[.., z]`), block+strengthening combined IH calls
    // with projected results, interleaved str_hyp/str_lin support-lemma calls,
    // and pair-channel reassembly fills. A HARD gate.
    name: 'str_wtp',
    maxSteps: 80,
    prelude: [
      'name : type.',
      'tp : type.',
      '① : tp.',
      '⊥ : tp.',
      'one : tp.',
      'bot : tp.',
      '⊗ : tp -> tp -> tp.',
      '⅋ : tp -> tp -> tp.',
      '& : tp -> tp -> tp.',
      '⊕ : tp -> tp -> tp.',
      'dual : tp -> tp -> type.',
      'D1 : dual ① ⊥.',
      'proc : type.',
      'fwd : name -> name -> proc.',
      'close : name -> proc.',
      'wait : name -> proc -> proc.',
      'out : name -> (name -> proc) -> (name -> proc) -> proc.',
      'inp : name -> (name -> name -> proc) -> proc.',
      'inl : name -> (name -> proc) -> proc.',
      'inr : name -> (name -> proc) -> proc.',
      'choice : name -> (name -> proc) -> (name -> proc) -> proc.',
      'pcomp : tp -> (name -> proc) -> (name -> proc) -> proc.',
      'hyp : name -> tp -> type.',
      'linear: (name -> proc) -> type.',
      'l_fwd   : linear (\\x. fwd x Y).',
      'l_fwd2  : linear (\\x. fwd Y x).',
      'l_close : linear (\\x. close x).',
      'l_wait  : linear (\\x. wait x P).',
      'l_out   : linear Q -> linear (\\x. out x P Q).',
      'l_inp   : ({y:name} linear (\\x. P x y)) ->  linear (\\x. inp x P).',
      'l_inl   : linear P -> linear (\\x. inl x P).',
      'l_inr   : linear P -> linear (\\x. inr x P).',
      'l_choice: linear P -> linear Q -> linear (\\x. choice x P Q).',
      'l_pcomp1: ({x:name}linear  (\\z. P x z)) -> linear  (\\z. pcomp A (\\x. P x z)  Q).',
      'l_pcomp2: ({x:name}linear  (\\z. Q x z)) -> linear  (\\z. pcomp A P (\\x. Q x z)).',
      'l_wait2: linear P -> linear (\\z. wait X (P z)).',
      'l_out2 : ({y:name} linear (\\z. P z y)) -> linear (\\z. out X (P z) Q).',
      'l_out3 : ({x\':name}linear (\\z. Q z x\')) -> linear (\\z. out X P (Q z)).',
      'l_inp2 : ({x:name}{y:name} linear (\\z. P z x y)) -> linear (\\z. inp X (P z)).',
      'l_inl2   : ({x\':name}linear (\\z. P z x\')) -> linear (\\z. inl X (P z)).',
      'l_inr2   : ({x\':name}linear (\\z. P z x\')) -> linear (\\z. inr X (P z)).',
      'l_choice2: ({x\':name}linear (\\z. P z x\')) -> ({x\':name}linear (\\z. Q z x\')) -> linear (\\z. choice X (P z) (Q z)).',
      'wtp : proc -> type.',
      'wtp_fwd   : dual A A\' -> {X:name}hyp X A -> {Y:name}hyp Y A\' -> wtp (fwd X Y).',
      'wtp_close : {X:name}hyp X one -> wtp (close X).',
      'wtp_wait  : {X:name}hyp X bot -> wtp P -> wtp (wait X P).',
      'wtp_out   : linear P -> {X:name}hyp X (⊗ A B) -> ({y:name}hyp y A -> wtp (P y)) -> ({x:name}hyp x B -> wtp (Q x)) -> wtp (out X P Q).',
      'wtp_inp   : ({x:name}linear (P x)) -> {X:name}hyp X (⅋ A B) -> ({x:name}hyp x B -> {y:name}hyp y A -> wtp (P x y)) -> wtp (inp X P).',
      'wtp_inl   : {X:name}hyp X (⊕ A B) -> ({x:name}hyp x A -> wtp (P x)) -> wtp (inl X P).',
      'wtp_inr   : {X:name}hyp X (⊕ A B) -> ({x:name}hyp x B -> wtp (P x)) -> wtp (inr X P).',
      'wtp_choice: {X:name}hyp X (& A B) -> ({x:name}hyp x A -> wtp (P x)) -> ({x:name}hyp x B -> wtp (Q x)) -> wtp (choice X P Q).',
      'wtp_pcomp : dual A A\' -> ({x:name} hyp x A -> wtp (P x)) -> ({x:name} hyp x A\' -> wtp (Q x)) -> linear P -> linear Q -> wtp (pcomp A P Q).',
      'schema ctx = some [A:tp] block x : name, h : hyp x A;',
      'schema nctx = name;',
      'rec str_hyp : (g:ctx) [g, z:name, hz:hyp z C[] |- hyp X[..] A[]] -> [g |- hyp X A[]] =',
      'fn h => case h of',
      '| [g, z:name, hz:hyp z C[] |- #p.h[..]] => [g |- #p.h[..]]',
      ';',
      'rec str_lin : (g : nctx) [g, x:name |- linear (\\y. P[.., y])] -> [g |- linear (\\y. P)] =',
      'fn linP => case linP of',
      '| [g, x : name |- l_fwd] => [g |- l_fwd]',
      '| [g, x : name |- l_fwd2] => [g |- l_fwd2]',
      '| [g, x : name |- l_close] => [g |- l_close]',
      '| [g, x : name |- l_wait] => [g |- l_wait]',
      '| [g, x : name |- l_out linQ] =>',
      '  let [g |- linQr] = str_lin [g, x : name |- linQ] in',
      '  [g |- l_out linQr]',
      '| [g, x : name |- l_inp (\\y. linQ[..,y,x])] =>',
      '  let [g, y : name |- linQr] = str_lin [g, y : name, x : name |- linQ] in',
      '  [g |- l_inp (\\y. linQr)]',
      '| [g, x : name |- l_inl linQ] =>',
      '  let [g |- linQr] = str_lin [g, x : name |- linQ] in',
      '  [g |- l_inl linQr]',
      '| [g, x : name |- l_inr linQ] =>',
      '  let [g |- linQr] = str_lin [g, x : name |- linQ] in',
      '  [g |- l_inr linQr]',
      '| [g, x : name |- l_choice linQ1 linQ2] =>',
      '  let [g |- linQ1r] = str_lin [g, x : name |- linQ1] in',
      '  let [g |- linQ2r] = str_lin [g, x : name |- linQ2] in',
      '  [g |- l_choice linQ1r linQ2r]',
      '| [g, x : name |- l_wait2 linQ] =>',
      '  let [g |- linQr] = str_lin [g, x : name |- linQ] in',
      '  [g |- l_wait2 linQr]',
      '| [g, x : name |- l_out2 (\\y. linQ[..,y,x])] =>',
      '  let [g, y : name |- linQr] = str_lin [g, y : name, x : name |- linQ] in',
      '  [g |- l_out2 (\\y. linQr)]',
      '| [g, x : name |- l_out3 (\\y. linQ[..,y,x])] =>',
      '  let [g, y : name |- linQr] = str_lin [g, y : name, x : name |- linQ] in',
      '  [g |- l_out3 (\\y. linQr)]',
      '| [g, x : name |- l_inp2 (\\y.\\z. linQ[..,y,z,x])] =>',
      '  let [g, y : name, z : name |- linQr] = str_lin [g, y : name, z : name, x : name |- linQ] in',
      '  [g |- l_inp2 (\\y.\\z. linQr)]',
      '| [g, x : name |- l_pcomp1 (\\y. linQ[..,y,x])] =>',
      '  let [g, y : name |- linQr] = str_lin [g, y : name, x : name |- linQ] in',
      '  [g |- l_pcomp1 (\\y. linQr)]',
      '| [g, x : name |- l_pcomp2 (\\y. linQ[..,y,x])] =>',
      '  let [g, y : name |- linQr] = str_lin [g, y : name, x : name |- linQ] in',
      '  [g |- l_pcomp2 (\\y. linQr)]',
      '| [g, x : name |- l_inl2 (\\y. linQ[..,y,x])] =>',
      '  let [g, y : name |- linQr] = str_lin [g, y : name, x : name |- linQ] in',
      '  [g |- l_inl2 (\\y. linQr)]',
      '| [g, x : name |- l_inr2 (\\y. linQ[..,y,x])] =>',
      '  let [g, y : name |- linQr] = str_lin [g, y : name, x : name |- linQ] in',
      '  [g |- l_inr2 (\\y. linQr)]',
      '| [g, x : name |- l_choice2 (\\y. linQ1[..,y,x]) (\\y. linQ2[..,y,x])] =>',
      '  let [g, y : name |- linQ1r] = str_lin [g, y : name, x : name |- linQ1] in',
      '  let [g, y : name |- linQ2r] = str_lin [g, y : name, x : name |- linQ2] in',
      '  [g |- l_choice2 (\\y. linQ1r) (\\y. linQ2r)]',
      ';',
    ].join('\n'),
    decl: [
      'rec str_wtp : (g : ctx) [g, z:name, h:hyp z C[] |- wtp P[..]] -> [g |- wtp P] =',
      '/ total 1 /',
      '?',
      ';',
    ].join('\n'),
  },
  {
    // The Result-ctype strengthening lemma, all 15 branches: comp-constructor
    // fills with the boxed existential witness (`Res [g ⊢ _] [g, x:name ⊢
    // refl_proc] [g ⊢ β…]`), ctype LET-patterns destructuring recursive results
    // (schema some-var instantiated per nullary-ctor variant — `hyp x ⊥`),
    // block-slot expansion helper calls (`str_step' […, <y;hy>]`), and
    // constructor reassembly from strengthened results. A HARD gate.
    name: 'str_step',
    maxSteps: 200,
    prelude: cpStrStepPrelude(root),
    decl: strStepDecl,
  },
  {
    // HELD-OUT stretch: big-step determinism — the LAST term-former residue:
    // nested second-premise analysis, `impossible [g |- NL]` on a boxed meta,
    // dep-filtered result projections (`E1[.., b.1, b.4]`), tail IH calls, and
    // cross-lemma substitution reasoning (`E1[.., N, E2]` — the known residue).
    // HARD gate since 2026-07-05: closed by the SYNTHESIS engine (bel-synth) —
    // the app1×app1 arm by the backward-chained 5-deep helper chain, the cross
    // arms by refutation closing (destructure + impossible), app2×app2 by the
    // two-IH eq_app composition. 13 steps / 67 checks / ~9s. Pins the synthesis
    // closers + arm annotations + the closure-aware re-split guard.
    name: 'bigstep_det',
    maxSteps: 30,
    prelude: [
      'LF exp : type =',
      '  | app : exp -> exp -> exp',
      '  | lam : (exp -> exp) -> exp',
      ';',
      '--name exp M.',
      'LF eq : exp -> exp -> type =',
      '  | eq_lam : ({x:exp} eq x x -> eq (M x) (N x)) -> eq (lam M) (lam N)',
      "  | eq_app : eq M M' -> eq N N' -> eq (app M N) (app M' N')",
      ';',
      '--name eq D.',
      'LF notLam : exp -> type =',
      "  | notLam' : notLam (app M N)",
      ';',
      'LF eval : exp -> exp -> type =',
      '  | eval_lam : ({x:exp} eval x x -> notLam x -> eval (M x) (N x)) -> eval (lam M) (lam N)',
      "  | eval_app1 : eval M (lam M') -> eval (M' N) R -> eval (app M N) R",
      "  | eval_app2 : eval M M' -> notLam M' -> eval N N' -> eval (app M N) (app M' N')",
      ';',
      '--name eval E.',
      'schema evctx = block x:exp, u:eval x x, t:notLam x, v:eq x x;',
      'rec eq_refl : {g:evctx}{M:[g |- exp]} [g |- eq M M] =',
      '/ total m (eq_refl _ m) /',
      '?;',
      'rec eq_sym : (g:evctx) [g |- eq M N] -> [g |- eq N M] =',
      '/ total e (eq_sym _ _ _ e) /',
      '?;',
      "rec subst_respects_eq : {g:evctx}{M:[g, x:exp |- exp]} [g |- eq N N'] -> [g |- eq M[.., N] M[.., N']] =",
      '/ trust /',
      '?;',
      'rec eval_respects_eq : (g:evctx) [g |- eq M N] -> [g |- eval M R] -> [g |- eval N R] =',
      '/ total f (eval_respects_eq g m n r e f ) /',
      '?;',
    ].join('\n'),
    decl: [
      "rec deterministic : (g:evctx) [g |- eval M R] -> [g |- eval M R'] -> [g |- eq R R'] =",
      "/ total d (deterministic g m r r' d)/",
      '?',
      ';',
    ].join('\n'),
  },
];

try {
  for (const probe of probes) {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => !!window.BelJarCurrentEditor && !!window.BelugaClient, { timeout: 30000 });
    await page.waitForFunction(() => !!(window.BelJarEditor && window.BelJarEditor.proveProgram), { timeout: 10000 });
    const code = `${probe.prelude}\n\n${probe.decl}\n`;
    const result = await page.evaluate(async (c, d, maxSteps) => {
      const ed = window.BelJarEditor;
      const cl = window.BelugaClient;
      const thm = ed.theoremUnderProof(d);
      // WARM prover session (the path the real lab uses): one worker, delta checks,
      // no per-call prelude reload. `checks` counts oracle round-trips so the
      // pre-filter's reduction is measurable.
      let checks = 0;
      const t0 = Date.now();
      if (cl.beginProverSession) await cl.beginProverSession();
      const oracle = (x) => { checks += 1; return cl.checkResultForProver ? cl.checkResultForProver(x) : cl.checkResult(x); };
      const r = await ed.proveProgram(c, thm, oracle, { maxSteps });
      if (cl.endProverSession) cl.endProverSession();
      return { complete: r.complete, steps: r.steps.map((s) => s.move), stuck: r.stuck || null, checks, ms: Date.now() - t0 };
    }, code, probe.decl, probe.maxSteps);
    console.log(`${probe.name}: ${result.complete ? 'COMPLETE' : 'STUCK'} [${result.checks} checks, ${(result.ms / 1000).toFixed(1)}s] ${result.steps.join(' -> ')}`);
    if (!result.complete) {
      console.log(JSON.stringify(result.stuck));
      if (!probe.optional) process.exitCode = 1;
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
