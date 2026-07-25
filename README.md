# <img src="assets/logo.svg" alt="BelJar Logo" width="42" height="42" align="top"> BelJar

**BelJar** is a modern in-browser IDE for the [Beluga](https://github.com/Beluga-lang/Beluga) language. It uses `js_of_ocaml` to adapt the Beluga compiler into Javascript, which allows it to run entirely client-side.

It is currently in its beginning stages. In the future, it can be a staging ground for experimental Beluga features.

Live at [dpbarry.github.io/bel-jar/](https://dpbarry.github.io/bel-jar/)



For contributors:
**Map of the codebase:** [`docs/CODEMAP.md`](docs/CODEMAP.md)

```bash
npm test                  # full suite
npm run build             # editor bundle + library
npm run build:shell       # product shell (+ leaf graphs for tests)
```

Product boot (`index.html`): `beluga-client.js` → `harpoon-client.js` → `editor-cm.bundle.js` → `shell.js` (from `js/shell.mjs`).