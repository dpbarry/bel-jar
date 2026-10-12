// Preview insert and copy must follow the row they sit on. A shared loop
// variable used to send every button the last file in the folder.
function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function El(tag) {
  this.tag = tag;
  this.className = '';
  this.children = [];
  this.attrs = {};
  this.listeners = {};
  this.dataset = {};
  this.style = { setProperty() {} };
  this.hidden = false;
  this.parent = null;
  this._text = '';
  const el = this;
  this.classList = {
    add(...cs) {
      const have = new Set(el.className.split(/\s+/).filter(Boolean));
      for (const c of cs) have.add(c);
      el.className = [...have].join(' ');
    },
    remove(...cs) {
      const drop = new Set(cs);
      el.className = el.className.split(/\s+/).filter((c) => c && !drop.has(c)).join(' ');
    },
    toggle(c, on) {
      const has = el.className.split(/\s+/).includes(c);
      const next = on === undefined ? !has : !!on;
      if (next) this.add(c);
      else this.remove(c);
    },
    contains(c) {
      return el.className.split(/\s+/).includes(c);
    },
  };
}

El.prototype.appendChild = function (child) {
  child.parent = this;
  this.children.push(child);
  return child;
};

El.prototype.setAttribute = function (name, value) {
  this.attrs[name] = String(value);
};

El.prototype.addEventListener = function (type, fn) {
  (this.listeners[type] || (this.listeners[type] = [])).push(fn);
};

El.prototype.focus = function () {};
El.prototype.scrollIntoView = function () {};
El.prototype.contains = function (node) {
  let n = node;
  while (n) {
    if (n === this) return true;
    n = n.parent;
  }
  return false;
};

Object.defineProperty(El.prototype, 'textContent', {
  get() { return this._text; },
  set(v) { this._text = v == null ? '' : String(v); },
});

Object.defineProperty(El.prototype, 'innerHTML', {
  set(html) {
    this.children = [];
    const src = String(html || '');
    const re = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>/g;
    let m;
    while ((m = re.exec(src))) {
      const child = new El(m[1]);
      const cls = /class="([^"]*)"/.exec(m[2]);
      if (cls) child.className = cls[1];
      if (!m[3].includes('<')) child.textContent = m[3];
      this.appendChild(child);
    }
  },
});

function matches(node, sel) {
  if (sel.startsWith('.')) {
    const have = node.className.split(/\s+/);
    return sel.slice(1).split('.').every((c) => have.includes(c));
  }
  const attr = /^\[data-file-id="([^"]*)"\]$/.exec(sel);
  return !!(attr && node.dataset.fileId === attr[1]);
}

El.prototype.querySelectorAll = function (sel) {
  const out = [];
  const walk = (node) => {
    if (node !== this && matches(node, sel)) out.push(node);
    for (const child of node.children) walk(child);
  };
  walk(this);
  return out;
};

El.prototype.querySelector = function (sel) {
  return this.querySelectorAll(sel)[0] || null;
};

El.prototype.closest = function (sel) {
  let node = this;
  while (node) {
    if (matches(node, sel)) return node;
    node = node.parent;
  }
  return null;
};

function click(node) {
  const ev = {
    target: node,
    stopPropagation() {},
    preventDefault() {},
  };
  ev.target.closest = (sel) => node.closest(sel);
  for (const fn of node.listeners.click || []) fn(ev);
}

const document = {
  activeElement: null,
  createElement: (tag) => new El(tag),
  querySelector: () => null,
};
globalThis.document = document;
globalThis.requestAnimationFrame = (fn) => fn();
globalThis.Dialog = {
  createDialog(opts) {
    document._shell = opts.content;
    return { addEventListener() {}, open: true };
  },
  openDialog() {},
  requestDialogClose() {},
};

await import('../js/library/library-preview.mjs');

function file(label) {
  return { type: 'file', id: label, label, ext: 'bel', path: 'nd/' + label };
}

const labels = ['nd-first-order.bel', 'nd-propositional.bel', 'nd-predicate.bel'];
const inserted = [];
const copied = [];

globalThis.LibraryPreview.open({
  scopeFolder: {
    type: 'folder',
    id: 'nd',
    name: 'Natural Deduction',
    children: labels.map(file),
  },
  scopeLabel: 'Natural Deduction',
  fetchContent: (path) => Promise.resolve('contents of ' + path),
  onInsertFile(_btn, item) { inserted.push(item.label); },
  onCopyFile(item) { copied.push(item.label); },
});

await new Promise((resolve) => setTimeout(resolve, 0));

const rows = document._shell.querySelectorAll('.library-preview-tree-file');
expect(rows.length === labels.length, `preview lists ${labels.length} files, got ${rows.length}`);

const rowLabels = rows.map((row) => row.attrs['aria-label']);
expect(rowLabels.join('|') === labels.join('|'), `row order ${rowLabels.join('|')}`);

for (const row of rows) {
  const buttons = [];
  const walk = (node) => {
    if (node.tag === 'button') buttons.push(node);
    for (const child of node.children) walk(child);
  };
  walk(row);
  const insert = buttons.find((b) => b.attrs['aria-label'] === 'Insert');
  const copy = buttons.find((b) => b.attrs['aria-label'] === 'Copy to clipboard');
  expect(insert && copy, `row ${row.attrs['aria-label']} has insert and copy`);
  click(insert);
  click(copy);
}

expect(inserted.join('|') === labels.join('|'),
  `each insert uses its own file, got ${inserted.join('|')}`);
expect(copied.join('|') === labels.join('|'),
  `each copy uses its own file, got ${copied.join('|')}`);

console.log('OK library preview insert follows the row');
