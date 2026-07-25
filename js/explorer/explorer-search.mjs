// Explorer workspace search: the third member of the unified `.hsearch` family.
// Collapsed it is a glass in the Explorer header; open it searches every
// project file by name + content (via the shared LibrarySearch engine)
// and floats the matches in a dropdown that mirrors the inspector autocomplete.
// Selecting a result opens that file. The tree itself is never touched.
const global = globalThis;
function baseName(name) {
    var i = String(name).lastIndexOf('/');
    return i === -1 ? String(name) : String(name).slice(i + 1);
  }
  function dirName(name) {
    var i = String(name).lastIndexOf('/');
    return i === -1 ? '' : String(name).slice(0, i);
  }
  function extOf(name) {
    var b = baseName(name);
    var d = b.lastIndexOf('.');
    return d === -1 ? '' : b.slice(d + 1).toLowerCase();
  }

  function init(opts) {
    opts = opts || {};
    var wrap = opts.wrap;
    var input = opts.input;
    var ac = opts.ac;
    if (!wrap || !input || !ac) return null;

    var LS = global.LibrarySearch;
    var HS = global.HeaderSearch;
    var hits = [];
    var activeIndex = -1;
    var token = 0;
    var timer = null;
    var controller = null;

    function listFiles() {
      return typeof opts.listFiles === 'function' ? (opts.listFiles() || []) : [];
    }
    function getText(id) {
      try {
        return typeof opts.getFileText === 'function' ? String(opts.getFileText(id) == null ? '' : opts.getFileText(id)) : '';
      } catch (_) {
        return '';
      }
    }

    function buildEntries() {
      var files = listFiles();
      var byPath = Object.create(null);
      var entries = [];
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (!f || !f.name) continue;
        byPath[f.name] = f.id;
        var entry = {
          id: f.id,
          label: baseName(f.name),
          path: f.name,
          pathLabel: dirName(f.name),
          ext: extOf(f.name) || 'bel',
        };
        entry.hay = LS ? LS.metadataHay(entry) : (entry.label + ' ' + f.name).toLowerCase();
        entries.push(entry);
      }
      return { entries: entries, byPath: byPath };
    }

    function fetchContentFor(byPath) {
      return function (path) {
        var id = byPath[path];
        return Promise.resolve(id != null ? getText(id) : '');
      };
    }

    function clearAc() {
      ac.hidden = true;
      ac.textContent = '';
      hits = [];
      activeIndex = -1;
    }

    function renderHitRow(hit, index) {
      var entry = hit.entry;
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'hsearch-ac-item hsearch-ac-item--' + (entry.ext || 'bel')
        + (index === activeIndex ? ' is-active' : '');
      item.setAttribute('role', 'option');

      var head = document.createElement('span');
      head.className = 'hsearch-ac-head';

      var name = document.createElement('span');
      name.className = 'hsearch-ac-name';
      name.textContent = entry.label;
      head.appendChild(name);

      if (entry.pathLabel) {
        var path = document.createElement('span');
        path.className = 'hsearch-ac-path';
        path.textContent = entry.pathLabel;
        head.appendChild(path);
      }
      item.appendChild(head);

      if (hit.snippet) {
        var snip = document.createElement('span');
        snip.className = 'hsearch-ac-snippet';
        snip.textContent = hit.snippet;
        item.appendChild(snip);
      }

      // mousedown preventDefault keeps focus in the input so blur doesn't race.
      item.addEventListener('mousedown', function (e) { e.preventDefault(); });
      item.addEventListener('click', function (e) { pick(hit, e); });
      return item;
    }

    function renderAc() {
      ac.textContent = '';
      var q = input.value.trim();
      if (!hits.length) {
        if (!q) { clearAc(); return; }
        var empty = document.createElement('div');
        empty.className = 'hsearch-ac-empty';
        empty.textContent = 'No files match.';
        ac.appendChild(empty);
        ac.hidden = false;
        return;
      }
      for (var i = 0; i < hits.length; i++) ac.appendChild(renderHitRow(hits[i], i));
      ac.hidden = false;
    }

    function setActiveIndex(i) {
      if (!hits.length) return;
      activeIndex = ((i % hits.length) + hits.length) % hits.length;
      var rows = ac.querySelectorAll('.hsearch-ac-item');
      for (var k = 0; k < rows.length; k++) rows[k].classList.toggle('is-active', k === activeIndex);
      if (rows[activeIndex]) rows[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    function pick(hit) {
      if (!hit) return;
      if (typeof opts.onOpenFile === 'function') {
        opts.onOpenFile(hit.entry.id, { line: hit.line || null });
      }
      if (controller) controller.close(true);
      clearAc();
    }

    function run() {
      var q = LS ? LS.normalizeQuery(input.value) : String(input.value || '').trim().toLowerCase();
      if (!q) { clearAc(); return; }
      var built = buildEntries();
      var myToken = ++token;

      if (!LS) {
        hits = built.entries
          .filter(function (en) { return en.hay.indexOf(q) !== -1; })
          .slice(0, 24)
          .map(function (en) { return { entry: en, snippet: null, line: null }; });
        activeIndex = hits.length ? 0 : -1;
        renderAc();
        return;
      }

      LS.searchEntries(built.entries, q, fetchContentFor(built.byPath), { limit: 24 }).then(function (res) {
        if (myToken !== token) return;
        hits = res;
        activeIndex = hits.length ? 0 : -1;
        renderAc();
      });
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 140);
    }

    controller = HS ? HS.init({
      host: wrap,
      input: input,
      header: opts.header || wrap.closest('.panel-header'),
      keepOpenFor: function (el) { return ac.contains(el); },
      onInput: schedule,
      onClose: clearAc,
      onKeydown: function (e) {
        if (!hits.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(activeIndex + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(activeIndex - 1); }
        else if (e.key === 'Enter') { e.preventDefault(); pick(activeIndex >= 0 ? hits[activeIndex] : hits[0]); }
      },
    }) : null;

    if (!controller) input.addEventListener('input', schedule);

    return {
      open: function () { if (controller) controller.open(); },
      close: function () { if (controller) controller.close(true); clearAc(); },
    };
  }

  global.ExplorerSearch = { init: init };
  global.BelJarExplorerSearch = global.ExplorerSearch
