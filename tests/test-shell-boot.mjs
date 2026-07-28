/**
 * Boot smoke: load generated shell.js in a VM with stubs for clients + editor + DOM.
 * Catches ReferenceError from burned typeofs + wrong shell.mjs import order.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shellSrc = readFileSync(join(root, 'js', 'shell.js'), 'utf8');

class FakeNode {}
class FakeElement extends FakeNode {}
class FakeHTMLElement extends FakeElement {}
class FakeDocumentFragment extends FakeNode {}

function el(tag) {
  const node = Object.assign(Object.create(FakeElement.prototype), {
    tagName: String(tag || 'div').toUpperCase(),
    className: '',
    hidden: false,
    textContent: '',
    value: '',
    disabled: false,
    innerHTML: '',
    style: {
      setProperty() {},
      removeProperty() {},
      getPropertyValue() { return ''; },
    },
    dataset: {},
    children: [],
    parentNode: null,
    isConnected: true,
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
      toggle(c, force) {
        if (force === true) this._set.add(c);
        else if (force === false) this._set.delete(c);
        else if (this._set.has(c)) this._set.delete(c);
        else this._set.add(c);
      },
    },
    addEventListener() {},
    removeEventListener() {},
    appendChild(child) {
      if (child.parentNode && child.parentNode !== this && typeof child.parentNode.removeChild === 'function') {
        child.parentNode.removeChild(child);
      }
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    insertBefore(child, ref) {
      if (child.parentNode && child.parentNode !== this && typeof child.parentNode.removeChild === 'function') {
        child.parentNode.removeChild(child);
      }
      const i = ref ? this.children.indexOf(ref) : -1;
      if (i >= 0) this.children.splice(i, 0, child);
      else this.children.push(child);
      child.parentNode = this;
      return child;
    },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      child.parentNode = null;
      return child;
    },
    append(...nodes) { nodes.forEach((n) => this.appendChild(n)); },
    replaceChildren(...nodes) {
      this.children.slice().forEach((c) => this.removeChild(c));
      nodes.forEach((n) => this.appendChild(n));
    },
    replaceWith() {},
    remove() {
      if (this.parentNode && typeof this.parentNode.removeChild === 'function') {
        this.parentNode.removeChild(this);
      }
    },
    focus() {},
    blur() {},
    click() {},
    setAttribute() {},
    getAttribute() { return null; },
    hasAttribute() { return false; },
    removeAttribute() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    contains(other) {
      if (other === this) return true;
      for (const c of this.children) {
        if (c === other || (c.contains && c.contains(other))) return true;
      }
      return false;
    },
    getBoundingClientRect() {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    },
  });
  Object.defineProperty(node, 'id', {
    configurable: true,
    enumerable: true,
    get() { return this._id || ''; },
    set(v) {
      const next = String(v || '');
      const prev = this._id || '';
      if (prev && byId.get(prev) === this) byId.delete(prev);
      this._id = next;
      if (next) byId.set(next, this);
    },
  });
  Object.defineProperty(node, 'childNodes', {
    configurable: true,
    enumerable: true,
    get() { return this.children; },
  });
  Object.defineProperty(node, 'lastElementChild', {
    configurable: true,
    enumerable: true,
    get() {
      return this.children.length ? this.children[this.children.length - 1] : null;
    },
  });
  Object.defineProperty(node, 'firstElementChild', {
    configurable: true,
    enumerable: true,
    get() {
      return this.children.length ? this.children[0] : null;
    },
  });
  return node;
}

const byId = new Map();
function getEl(id) {
  if (!byId.has(id)) {
    const n = el('div');
    n.id = id;
  }
  return byId.get(id);
}

// Elements app boot attaches listeners to must exist.
// command-input / btn-run are created by ReplStream at shell load.
[
  'editor', 'editor-empty', 'inspector-project-empty', 'output',
  'btn-files', 'btn-inspector', 'btn-library', 'btn-harpoon', 'btn-settings',
  'btn-theme', 'btn-load', 'btn-clear',
  'explorer-panel', 'inspector-panel', 'library-panel', 'harpoon-panel',
  'editor-tabs', 'header-context', 'header-context-name',
  'output-panel-header', 'output-header-progress', 'output-header-status',
  'workspace', 'library-search', 'library-search-wrap',
].forEach(getEl);

const store = Object.create(null);
const localStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem(k, v) { store[k] = String(v); },
  removeItem(k) { delete store[k]; },
};

const documentStub = {
  documentElement: el('html'),
  body: el('body'),
  head: el('head'),
  getElementById: getEl,
  createElement: el,
  createTextNode(text) {
    return { nodeType: 3, textContent: String(text), parentNode: null };
  },
  createDocumentFragment() { return el('fragment'); },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  removeEventListener() {},
};

const BelEditor = {
  mount() {
    return {
      destroy() {},
      focus() {},
      getValue() { return ''; },
      getView() {
        return {
          dom: {
            isConnected: true,
            classList: { contains() { return false; }, add() {}, remove() {}, toggle() {} },
          },
          requestMeasure() {},
        };
      },
      setDarkTheme() {},
      cancelRename() {},
      getCurrentFileId() { return null; },
    };
  },
  applyEditorPrefs() {},
  fileHealthFor() { return { errors: 0, warnings: 0, items: [] }; },
};

const BelugaClient = {
  configure() {},
  warm() { return Promise.resolve(); },
  setProgressHandler() {},
  noteEditorChange() {},
  load() { return Promise.resolve(''); },
  isCancelledError() { return false; },
  fingerprint() { return 'fp'; },
  getCommittedFingerprint() { return null; },
};

const HarpoonEngine = {
  start() { return Promise.resolve(null); },
};

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class FakeMutationObserver {
  constructor() {}
  observe() {}
  disconnect() {}
  takeRecords() { return []; }
}

const ctx = {
  console,
  localStorage,
  sessionStorage: localStorage,
  document: documentStub,
  navigator: { platform: 'Win32', userAgent: 'BelJarBootSmoke' },
  location: { href: 'http://localhost/bel-jar/', pathname: '/bel-jar/' },
  performance: { now: () => Date.now() },
  requestAnimationFrame(cb) { queueMicrotask(() => cb(Date.now())); },
  queueMicrotask,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  TextEncoder,
  TextDecoder,
  Map,
  Set,
  WeakMap,
  Promise,
  ResizeObserver: FakeResizeObserver,
  MutationObserver: FakeMutationObserver,
  Node: FakeNode,
  Element: FakeElement,
  HTMLElement: FakeHTMLElement,
  DocumentFragment: FakeDocumentFragment,
  CustomEvent: class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    }
  },
  Event: class Event {
    constructor(type) { this.type = type; }
  },
  URL,
  Worker: class Worker {
    constructor() {}
    postMessage() {}
    terminate() {}
    addEventListener() {}
  },
  BelEditor,
  BelugaClient,
  HarpoonEngine,
  matchMedia() {
    return { matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
  },
  getComputedStyle() {
    return { getPropertyValue() { return ''; } };
  },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
};

ctx.window = ctx;
ctx.globalThis = ctx;
ctx.self = ctx;

vm.createContext(ctx);
try {
  vm.runInContext(shellSrc, ctx, { filename: 'shell.js' });
} catch (e) {
  console.error('FAIL: shell.js threw', e && e.stack ? e.stack : e);
  process.exit(1);
}

expect(ctx.Persist && typeof ctx.Persist.ensureProject === 'function', 'Persist');
expect(ctx.ProjectSource && typeof ctx.ProjectSource.dirOf === 'function', 'ProjectSource');
expect(ctx.BelugaRun && typeof ctx.BelugaRun.init === 'function', 'BelugaRun');
expect(ctx.Explorer && typeof ctx.Explorer.buildExplorerModel === 'function', 'Explorer');
expect(ctx.Toasts && typeof ctx.Toasts.init === 'function', 'Toasts');

console.log('OK shell-boot (persist/project-source/beluga-run/explorer present)');
