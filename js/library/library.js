(() => {
  // js/library/library-suites.mjs
  var global = globalThis;
  function dirOf(path) {
    var i = String(path || "").lastIndexOf("/");
    return i === -1 ? "" : path.slice(0, i);
  }
  function activeCfgsForDir(opts, dirKey) {
    if (typeof opts.getActiveCfgsForDir === "function") {
      return opts.getActiveCfgsForDir(dirKey) || [];
    }
    if (typeof opts.getActiveCfgForDir === "function") {
      var one = opts.getActiveCfgForDir(dirKey);
      return one ? [one] : [];
    }
    return [];
  }
  function listActiveSuites(opts) {
    opts = opts || {};
    var listFiles = opts.listFiles;
    if (typeof listFiles !== "function") return [];
    if (typeof opts.getActiveCfgsForDir !== "function" && typeof opts.getActiveCfgForDir !== "function") return [];
    var files = listFiles();
    var cfgDirs = {};
    for (var i = 0; i < files.length; i++) {
      var name = files[i].name;
      if (!/\.cfg$/i.test(name)) continue;
      var dir = dirOf(name);
      if (!Object.prototype.hasOwnProperty.call(cfgDirs, dir)) cfgDirs[dir] = true;
    }
    var names = /* @__PURE__ */ new Set();
    for (var j = 0; j < files.length; j++) names.add(files[j].name);
    var out = [];
    for (var dirKey in cfgDirs) {
      if (!Object.prototype.hasOwnProperty.call(cfgDirs, dirKey)) continue;
      var cfgs = activeCfgsForDir(opts, dirKey);
      for (var c = 0; c < cfgs.length; c++) {
        var cfgPath = cfgs[c];
        if (!cfgPath || !names.has(cfgPath)) continue;
        var base = cfgPath.slice(cfgPath.lastIndexOf("/") + 1).replace(/\.cfg$/i, "");
        var label = dirKey ? dirKey + " / " + base : base;
        out.push({ dir: dirKey, cfgPath, label });
      }
    }
    out.sort(function(a, b) {
      return a.label.localeCompare(b.label);
    });
    return out;
  }
  global.LibrarySuites = { listActiveSuites };
  global.BelJarLibrarySuites = global.LibrarySuites;

  // js/library/library-search.mjs
  var global2 = globalThis;
  var SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
  function normalizeQuery(q) {
    return String(q || "").trim().toLowerCase();
  }
  function metadataHay(entry) {
    return [
      entry.label,
      entry.description || "",
      entry.path || "",
      entry.pathLabel || "",
      entry.sectionLabel || ""
    ].join(" ").toLowerCase();
  }
  function snippetFromContent(text, query) {
    var q = normalizeQuery(query);
    if (!q || text == null) return null;
    var src = String(text);
    var lower = src.toLowerCase();
    var idx = lower.indexOf(q);
    if (idx === -1) return null;
    var lineStart = src.lastIndexOf("\n", idx - 1) + 1;
    var lineEnd = src.indexOf("\n", idx);
    if (lineEnd === -1) lineEnd = src.length;
    var line = src.slice(lineStart, lineEnd);
    var rel = idx - lineStart;
    var pad = 42;
    var start = Math.max(0, rel - pad);
    var end = Math.min(line.length, rel + q.length + pad);
    var snippet = line.slice(start, end);
    if (start > 0) snippet = "\u2026" + snippet;
    if (end < line.length) snippet = snippet + "\u2026";
    return {
      snippet,
      line: src.slice(0, lineStart).split("\n").length
    };
  }
  function rankHit(hit, q) {
    var label = String(hit.entry.label || "").toLowerCase();
    if (label.indexOf(q) === 0) return 0;
    if (label.indexOf(q) !== -1) return 1;
    if (hit.metaMatch) return 2;
    return 3;
  }
  function searchEntries(entries, query, fetchContent, opts) {
    opts = opts || {};
    var q = normalizeQuery(query);
    if (!q) return Promise.resolve([]);
    var limit = opts.limit;
    if (limit == null) limit = 24;
    var metaHits = [];
    var pending = [];
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var hay = entry.hay || metadataHay(entry);
      if (hay.indexOf(q) !== -1) {
        metaHits.push({ entry, metaMatch: true, snippet: null, line: null });
      } else if (typeof fetchContent === "function" && entry.path) {
        pending.push(entry);
      }
    }
    if (!pending.length) {
      metaHits.sort(function(a, b) {
        var dr = rankHit(a, q) - rankHit(b, q);
        return dr !== 0 ? dr : a.entry.label.localeCompare(b.entry.label);
      });
      return Promise.resolve(limit < 1 ? metaHits : metaHits.slice(0, limit));
    }
    var contentHits = [];
    var left = pending.length;
    return new Promise(function(resolve) {
      function finish() {
        left -= 1;
        if (left > 0) return;
        var out = metaHits.concat(contentHits);
        out.sort(function(a, b) {
          var dr = rankHit(a, q) - rankHit(b, q);
          return dr !== 0 ? dr : a.entry.label.localeCompare(b.entry.label);
        });
        resolve(limit < 1 ? out : out.slice(0, limit));
      }
      for (var j = 0; j < pending.length; j++) {
        (function(entry2) {
          fetchContent(entry2.path).then(function(text) {
            var sn = snippetFromContent(text, q);
            if (sn) {
              contentHits.push({
                entry: entry2,
                metaMatch: false,
                snippet: sn.snippet,
                line: sn.line
              });
            }
            finish();
          }).catch(finish);
        })(pending[j]);
      }
    });
  }
  function renderHit(container, hit, layout, onSelect) {
    var entry = hit.entry;
    var ext = entry.ext || entry.item && entry.item.ext || "bel";
    var label = entry.label || entry.item && entry.item.label || "";
    var pathLabel = entry.pathLabel || "";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "library-find__hit library-find__hit--" + ext + (layout === "stack" ? " library-find__hit--stack" : " library-find__hit--inline");
    btn.setAttribute("role", "option");
    var head = document.createElement("span");
    head.className = "library-find__hit-head";
    var name = document.createElement("span");
    name.className = "library-find__hit-name";
    name.textContent = label;
    head.appendChild(name);
    if (pathLabel && layout === "inline") {
      var path = document.createElement("span");
      path.className = "library-find__hit-path";
      path.textContent = pathLabel;
      head.appendChild(path);
    }
    if (hit.snippet && layout === "inline") {
      var sn = document.createElement("span");
      sn.className = "library-find__snippet library-find__snippet--inline";
      sn.textContent = hit.snippet;
      head.appendChild(sn);
    }
    btn.appendChild(head);
    if (pathLabel && layout === "stack") {
      var path2 = document.createElement("span");
      path2.className = "library-find__hit-path";
      path2.textContent = pathLabel;
      btn.appendChild(path2);
    }
    if (hit.snippet && layout === "stack") {
      if (hit.line) {
        var meta = document.createElement("span");
        meta.className = "library-find__snippet-meta";
        meta.textContent = "Line " + hit.line;
        btn.appendChild(meta);
      }
      var snap = document.createElement("div");
      snap.className = "library-find__snippet library-find__snippet--block";
      snap.textContent = hit.snippet;
      btn.appendChild(snap);
    }
    btn.addEventListener("click", function() {
      if (typeof onSelect === "function") onSelect(hit);
    });
    container.appendChild(btn);
  }
  function renderResults(container, hits, layout, onSelect) {
    container.innerHTML = "";
    for (var i = 0; i < hits.length; i++) {
      renderHit(container, hits[i], layout, onSelect);
    }
  }
  global2.LibrarySearch = {
    SEARCH_ICON,
    normalizeQuery,
    metadataHay,
    snippetFromContent,
    searchEntries,
    renderResults
  };
  global2.BelJarLibrarySearch = global2.LibrarySearch;

  // js/explorer/explorer-search.mjs
  var global3 = globalThis;
  function baseName(name) {
    var i = String(name).lastIndexOf("/");
    return i === -1 ? String(name) : String(name).slice(i + 1);
  }
  function dirName(name) {
    var i = String(name).lastIndexOf("/");
    return i === -1 ? "" : String(name).slice(0, i);
  }
  function extOf(name) {
    var b = baseName(name);
    var d = b.lastIndexOf(".");
    return d === -1 ? "" : b.slice(d + 1).toLowerCase();
  }
  function init(opts) {
    opts = opts || {};
    var wrap = opts.wrap;
    var input = opts.input;
    var ac = opts.ac;
    if (!wrap || !input || !ac) return null;
    var LS = global3.LibrarySearch;
    var HS = global3.HeaderSearch;
    var hits = [];
    var activeIndex = -1;
    var token = 0;
    var timer = null;
    var controller = null;
    function listFiles() {
      return typeof opts.listFiles === "function" ? opts.listFiles() || [] : [];
    }
    function getText(id) {
      try {
        return typeof opts.getFileText === "function" ? String(opts.getFileText(id) == null ? "" : opts.getFileText(id)) : "";
      } catch (_) {
        return "";
      }
    }
    function buildEntries() {
      var files = listFiles();
      var byPath = /* @__PURE__ */ Object.create(null);
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
          ext: extOf(f.name) || "bel"
        };
        entry.hay = LS ? LS.metadataHay(entry) : (entry.label + " " + f.name).toLowerCase();
        entries.push(entry);
      }
      return { entries, byPath };
    }
    function fetchContentFor(byPath) {
      return function(path) {
        var id = byPath[path];
        return Promise.resolve(id != null ? getText(id) : "");
      };
    }
    function clearAc() {
      ac.hidden = true;
      ac.textContent = "";
      hits = [];
      activeIndex = -1;
    }
    function renderHitRow(hit, index) {
      var entry = hit.entry;
      var item = document.createElement("button");
      item.type = "button";
      item.className = "hsearch-ac-item hsearch-ac-item--" + (entry.ext || "bel") + (index === activeIndex ? " is-active" : "");
      item.setAttribute("role", "option");
      var head = document.createElement("span");
      head.className = "hsearch-ac-head";
      var name = document.createElement("span");
      name.className = "hsearch-ac-name";
      name.textContent = entry.label;
      head.appendChild(name);
      if (entry.pathLabel) {
        var path = document.createElement("span");
        path.className = "hsearch-ac-path";
        path.textContent = entry.pathLabel;
        head.appendChild(path);
      }
      item.appendChild(head);
      if (hit.snippet) {
        var snip = document.createElement("span");
        snip.className = "hsearch-ac-snippet";
        snip.textContent = hit.snippet;
        item.appendChild(snip);
      }
      item.addEventListener("mousedown", function(e) {
        e.preventDefault();
      });
      item.addEventListener("click", function(e) {
        pick(hit, e);
      });
      return item;
    }
    function renderAc() {
      ac.textContent = "";
      var q = input.value.trim();
      if (!hits.length) {
        if (!q) {
          clearAc();
          return;
        }
        var empty = document.createElement("div");
        empty.className = "hsearch-ac-empty";
        empty.textContent = "No files match.";
        ac.appendChild(empty);
        ac.hidden = false;
        return;
      }
      for (var i = 0; i < hits.length; i++) ac.appendChild(renderHitRow(hits[i], i));
      ac.hidden = false;
    }
    function setActiveIndex(i) {
      if (!hits.length) return;
      activeIndex = (i % hits.length + hits.length) % hits.length;
      var rows = ac.querySelectorAll(".hsearch-ac-item");
      for (var k = 0; k < rows.length; k++) rows[k].classList.toggle("is-active", k === activeIndex);
      if (rows[activeIndex]) rows[activeIndex].scrollIntoView({ block: "nearest" });
    }
    function pick(hit) {
      if (!hit) return;
      if (typeof opts.onOpenFile === "function") {
        opts.onOpenFile(hit.entry.id, { line: hit.line || null });
      }
      if (controller) controller.close(true);
      clearAc();
    }
    function run() {
      var q = LS ? LS.normalizeQuery(input.value) : String(input.value || "").trim().toLowerCase();
      if (!q) {
        clearAc();
        return;
      }
      var built = buildEntries();
      var myToken = ++token;
      if (!LS) {
        hits = built.entries.filter(function(en) {
          return en.hay.indexOf(q) !== -1;
        }).slice(0, 24).map(function(en) {
          return { entry: en, snippet: null, line: null };
        });
        activeIndex = hits.length ? 0 : -1;
        renderAc();
        return;
      }
      LS.searchEntries(built.entries, q, fetchContentFor(built.byPath), { limit: 24 }).then(function(res) {
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
      input,
      header: opts.header || wrap.closest(".panel-header"),
      keepOpenFor: function(el) {
        return ac.contains(el);
      },
      onInput: schedule,
      onClose: clearAc,
      onKeydown: function(e) {
        if (!hits.length) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActiveIndex(activeIndex + 1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIndex(activeIndex - 1);
        } else if (e.key === "Enter") {
          e.preventDefault();
          pick(activeIndex >= 0 ? hits[activeIndex] : hits[0]);
        }
      }
    }) : null;
    if (!controller) input.addEventListener("input", schedule);
    return {
      open: function() {
        if (controller) controller.open();
      },
      close: function() {
        if (controller) controller.close(true);
        clearAc();
      }
    };
  }
  global3.ExplorerSearch = { init };
  global3.BelJarExplorerSearch = global3.ExplorerSearch;

  // js/library/library-preview.mjs
  var global4 = globalThis;
  var CHEVRON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  var ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var ICON_INSERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
  var activeDialog = null;
  function actionBtn(applyTip, className, label, svg, onClick) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "library-action-btn" + (className ? " " + className : "");
    btn.innerHTML = svg;
    btn.setAttribute("aria-label", label);
    applyTip(btn, label);
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      onClick(btn);
    });
    return btn;
  }
  function firstFileInFolder(folder) {
    if (!folder || !folder.children) return null;
    for (var i = 0; i < folder.children.length; i++) {
      var child = folder.children[i];
      if (child.type === "file") return child;
      if (child.type === "folder") {
        var found = firstFileInFolder(child);
        if (found) return found;
      }
    }
    return null;
  }
  function folderContainsFolder(root, target) {
    if (!root || !target || root === target) return true;
    if (!root.children) return false;
    for (var i = 0; i < root.children.length; i++) {
      var child = root.children[i];
      if (child.type === "folder" && folderContainsFolder(child, target)) return true;
    }
    return false;
  }
  function ancestorFolderIds(scopeFolder, targetFolder) {
    if (!scopeFolder || !targetFolder || scopeFolder === targetFolder) return [];
    function walk(folder, trail) {
      if (!folder || !folder.children) return null;
      for (var i = 0; i < folder.children.length; i++) {
        var child = folder.children[i];
        if (child.type !== "folder") continue;
        var next = trail.concat(child.id);
        if (child === targetFolder) return next;
        var found = walk(child, next);
        if (found) return found;
      }
      return null;
    }
    return walk(scopeFolder, []) || [];
  }
  function renderHighlighted(codeEl, text, ext) {
    codeEl.textContent = "";
    if (ext === "cfg") {
      codeEl.className = "library-preview__code-source library-preview__code-source--plain";
      codeEl.textContent = text;
      return;
    }
    codeEl.className = "library-preview__code-source bel-hl-source" + (ext === "elf" ? " bel-hl-source--elf" : "");
    if (global4.BelEditor && typeof global4.BelEditor.renderSourceInto === "function") {
      global4.BelEditor.renderSourceInto(codeEl, text, ext);
      return;
    }
    codeEl.textContent = text;
  }
  function updateGutter(gutterEl, text) {
    var lines = String(text || "").split("\n");
    gutterEl.textContent = lines.map(function(_, i) {
      return String(i + 1);
    }).join("\n");
  }
  function suiteClassesForMeta(meta) {
    if (!meta) return "";
    if (meta.role === "head" || meta.role === "solo") return " library-preview-tree-file--suite-cfg";
    if (meta.role === "mid" || meta.role === "tail") return " library-preview-tree-file--suite";
    return "";
  }
  function suiteByFileForFolderChildren(children, cfgTextByLabel) {
    var SL = global4.ExplorerSuiteLayout;
    if (!SL || typeof SL.computeDirLayout !== "function") return {};
    var fileChildren = [];
    var activeCfgs = [];
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c.type !== "file") continue;
      fileChildren.push({ id: c.id, name: c.label, baseName: c.label });
      if (String(c.ext || "").toLowerCase() === "cfg") activeCfgs.push(c.label);
    }
    if (!activeCfgs.length) return {};
    activeCfgs.sort(function(a, b) {
      return a.localeCompare(b);
    });
    var textById = /* @__PURE__ */ Object.create(null);
    for (var j = 0; j < fileChildren.length; j++) {
      var fc = fileChildren[j];
      if (String(fc.name).toLowerCase().endsWith(".cfg")) {
        textById[fc.id] = cfgTextByLabel[fc.name] || "";
      }
    }
    var getText = function(id) {
      return textById[id] || "";
    };
    return SL.computeDirLayout(fileChildren, activeCfgs, null, fileChildren, getText).suiteByFile;
  }
  function open(opts) {
    opts = opts || {};
    if (!opts.scopeFolder || typeof global4.Dialog === "undefined") return;
    if (activeDialog && activeDialog.open) {
      global4.Dialog.requestDialogClose(activeDialog);
      activeDialog = null;
    }
    var scopeFolder = opts.scopeFolder;
    var scopeLabel = opts.scopeLabel || scopeFolder.name || "Library";
    var fetchContent = opts.fetchContent;
    var applyTip = typeof opts.applyTip === "function" ? opts.applyTip : function() {
    };
    var onCopyFile = typeof opts.onCopyFile === "function" ? opts.onCopyFile : null;
    var onInsertFile = typeof opts.onInsertFile === "function" ? opts.onInsertFile : null;
    var onInsertFolder = typeof opts.onInsertFolder === "function" ? opts.onInsertFolder : null;
    var expanded = /* @__PURE__ */ new Set();
    var fileIndex = /* @__PURE__ */ Object.create(null);
    var searchFiles = [];
    var searchToken = 0;
    var LS = global4.LibrarySearch;
    var treeRows = [];
    var selectedId = null;
    var loadToken = 0;
    var cfgTextCache = /* @__PURE__ */ Object.create(null);
    if (opts.focusFolder && folderContainsFolder(scopeFolder, opts.focusFolder)) {
      ancestorFolderIds(scopeFolder, opts.focusFolder).forEach(function(id) {
        expanded.add(id);
      });
      if (opts.focusFolder.id) expanded.add(opts.focusFolder.id);
    } else {
      expanded.add(scopeFolder.id);
    }
    function indexFolder(folder, pathLabel) {
      if (!folder || !folder.children) return;
      for (var i = 0; i < folder.children.length; i++) {
        var child = folder.children[i];
        if (child.type === "file") {
          fileIndex[child.id] = { item: child, pathLabel };
        } else if (child.type === "folder") {
          indexFolder(child, pathLabel ? pathLabel + "/" + child.name : child.name);
        }
      }
    }
    indexFolder(scopeFolder, "");
    searchFiles = Object.keys(fileIndex).map(function(id) {
      var ent = fileIndex[id];
      return {
        item: ent.item,
        id: ent.item.id,
        label: ent.item.label,
        path: ent.item.path,
        ext: ent.item.ext || "bel",
        pathLabel: ent.pathLabel,
        hay: LS ? LS.metadataHay({
          label: ent.item.label,
          description: ent.item.description,
          path: ent.item.path,
          pathLabel: ent.pathLabel
        }) : ""
      };
    });
    searchFiles.sort(function(a, b) {
      return a.item.label.localeCompare(b.item.label);
    });
    var initial = opts.initialFile;
    if (!initial && opts.focusFolder) initial = firstFileInFolder(opts.focusFolder);
    if (!initial) initial = firstFileInFolder(scopeFolder);
    if (initial && initial.id) {
      selectedId = initial.id;
      var parts = (fileIndex[initial.id] && fileIndex[initial.id].pathLabel || "").split("/").filter(Boolean);
      var cur = scopeFolder;
      for (var p = 0; p < parts.length; p++) {
        if (cur && cur.id) expanded.add(cur.id);
        if (!cur || !cur.children) break;
        for (var c = 0; c < cur.children.length; c++) {
          if (cur.children[c].type === "folder" && cur.children[c].name === parts[p]) {
            cur = cur.children[c];
            expanded.add(cur.id);
            break;
          }
        }
      }
    }
    var shell = document.createElement("div");
    shell.className = "library-preview";
    var headerMeta = document.createElement("div");
    headerMeta.className = "library-preview__header-meta";
    var headerLeft = document.createElement("div");
    headerLeft.className = "library-preview__header-left";
    headerLeft.innerHTML = '<span class="library-preview__category"></span><span class="library-preview__sep" aria-hidden="true">\xB7</span><span class="library-preview__file"></span>';
    var categoryEl = headerLeft.querySelector(".library-preview__category");
    var fileEl = headerLeft.querySelector(".library-preview__file");
    categoryEl.textContent = scopeLabel;
    var searchWrap = document.createElement("div");
    searchWrap.className = "library-find library-find--preview";
    var searchIcon = document.createElement("span");
    searchIcon.className = "library-find__icon";
    searchIcon.setAttribute("aria-hidden", "true");
    searchIcon.innerHTML = LS ? LS.SEARCH_ICON : "";
    var searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "library-find__input";
    searchInput.placeholder = "Search\u2026";
    searchInput.setAttribute("aria-label", "Search files in preview");
    searchInput.autocomplete = "off";
    searchInput.spellcheck = false;
    var searchResults = document.createElement("div");
    searchResults.className = "library-find__results library-find__results--inline";
    searchResults.hidden = true;
    searchResults.setAttribute("role", "listbox");
    searchWrap.appendChild(searchIcon);
    searchWrap.appendChild(searchInput);
    searchWrap.appendChild(searchResults);
    headerMeta.appendChild(headerLeft);
    headerMeta.appendChild(searchWrap);
    var split = document.createElement("div");
    split.className = "library-preview__split";
    var treePane = document.createElement("div");
    treePane.className = "library-preview__tree";
    treePane.setAttribute("role", "tree");
    treePane.setAttribute("aria-label", scopeLabel + " files");
    var codePane = document.createElement("div");
    codePane.className = "library-preview__code";
    var codeEmpty = document.createElement("div");
    codeEmpty.className = "library-preview__empty";
    codeEmpty.textContent = "Select a file to preview.";
    var codeLoading = document.createElement("div");
    codeLoading.className = "library-preview__loading";
    codeLoading.hidden = true;
    codeLoading.innerHTML = '<span class="library-preview__spinner" aria-hidden="true"></span>';
    var codeWrap = document.createElement("div");
    codeWrap.className = "library-preview__code-wrap";
    codeWrap.hidden = true;
    var gutter = document.createElement("div");
    gutter.className = "library-preview__gutter";
    gutter.setAttribute("aria-hidden", "true");
    var codeScroll = document.createElement("div");
    codeScroll.className = "library-preview__code-scroll";
    var pre = document.createElement("pre");
    pre.className = "library-preview__pre";
    var codeEl = document.createElement("code");
    pre.appendChild(codeEl);
    codeScroll.appendChild(pre);
    codeWrap.appendChild(gutter);
    codeWrap.appendChild(codeScroll);
    codeScroll.addEventListener("scroll", function() {
      gutter.scrollTop = codeScroll.scrollTop;
    });
    codePane.appendChild(codeEmpty);
    codePane.appendChild(codeLoading);
    codePane.appendChild(codeWrap);
    split.appendChild(treePane);
    split.appendChild(codePane);
    shell.appendChild(headerMeta);
    shell.appendChild(split);
    function setHeaderFile(name) {
      if (name) {
        fileEl.textContent = name;
        fileEl.hidden = false;
        headerLeft.querySelector(".library-preview__sep").hidden = false;
      } else {
        fileEl.textContent = "";
        fileEl.hidden = true;
        headerLeft.querySelector(".library-preview__sep").hidden = true;
      }
    }
    function expandToFile(item) {
      var ent = fileIndex[item.id];
      if (!ent) return;
      var parts2 = (ent.pathLabel || "").split("/").filter(Boolean);
      expanded.add(scopeFolder.id);
      var cur2 = scopeFolder;
      for (var p2 = 0; p2 < parts2.length; p2++) {
        if (!cur2 || !cur2.children) break;
        for (var c2 = 0; c2 < cur2.children.length; c2++) {
          if (cur2.children[c2].type === "folder" && cur2.children[c2].name === parts2[p2]) {
            cur2 = cur2.children[c2];
            expanded.add(cur2.id);
            break;
          }
        }
      }
    }
    var previewSearchTimer = null;
    function renderSearchResults() {
      if (!LS) return;
      var q = LS.normalizeQuery(searchInput.value);
      searchResults.innerHTML = "";
      if (!q) {
        searchWrap.classList.remove("is-searching");
        searchResults.hidden = true;
        return;
      }
      var token = ++searchToken;
      var metaHits = [];
      for (var i = 0; i < searchFiles.length; i++) {
        var ent = searchFiles[i];
        if (ent.hay.indexOf(q) !== -1) {
          metaHits.push({ entry: ent, metaMatch: true, snippet: null, line: null });
        }
      }
      if (metaHits.length) {
        LS.renderResults(searchResults, metaHits.slice(0, 20), "inline", onPreviewHit);
        searchResults.hidden = false;
      } else {
        var pending = document.createElement("div");
        pending.className = "library-find__empty";
        pending.textContent = "Searching\u2026";
        searchResults.appendChild(pending);
        searchResults.hidden = false;
        searchWrap.classList.add("is-searching");
      }
      LS.searchEntries(searchFiles, q, fetchContent, { limit: 20 }).then(function(hits) {
        if (token !== searchToken) return;
        searchWrap.classList.remove("is-searching");
        searchResults.innerHTML = "";
        if (!hits.length) {
          var empty = document.createElement("div");
          empty.className = "library-find__empty";
          empty.textContent = "No matches.";
          searchResults.appendChild(empty);
          searchResults.hidden = false;
          return;
        }
        LS.renderResults(searchResults, hits, "inline", onPreviewHit);
        searchResults.hidden = false;
      });
    }
    function onPreviewHit(hit) {
      expandToFile(hit.entry.item);
      selectFile(hit.entry.item);
      searchResults.hidden = true;
      searchInput.blur();
    }
    function setSearchFocused(on) {
      searchWrap.classList.toggle("is-focused", on);
      if (!on) searchResults.hidden = true;
      else if (LS && LS.normalizeQuery(searchInput.value)) renderSearchResults();
    }
    searchInput.addEventListener("focus", function() {
      setSearchFocused(true);
    });
    searchInput.addEventListener("blur", function() {
      setTimeout(function() {
        if (!searchWrap.contains(document.activeElement)) setSearchFocused(false);
      }, 120);
    });
    searchInput.addEventListener("input", function() {
      if (previewSearchTimer) clearTimeout(previewSearchTimer);
      previewSearchTimer = setTimeout(renderSearchResults, 180);
    });
    function setCodeLoading(on) {
      codeLoading.hidden = !on;
      if (on) {
        codeEmpty.hidden = true;
        codeWrap.hidden = true;
      }
    }
    function showCode(text, item) {
      codeLoading.hidden = true;
      codeEmpty.hidden = true;
      codeWrap.hidden = false;
      renderHighlighted(codeEl, text, item.ext || "bel");
      updateGutter(gutter, text);
      setHeaderFile(item.label);
    }
    function showEmpty() {
      codeLoading.hidden = true;
      codeWrap.hidden = true;
      codeEmpty.hidden = false;
      codeEmpty.textContent = "Select a file to preview.";
      setHeaderFile(null);
    }
    function selectFile(item, opts2) {
      opts2 = opts2 || {};
      if (!item || !item.id) return;
      selectedId = item.id;
      renderTree();
      if (!opts2.skipScroll && fileIndex[item.id]) {
        var row = treePane.querySelector('[data-file-id="' + item.id + '"]');
        if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
      }
      if (typeof fetchContent !== "function") {
        showEmpty();
        return;
      }
      var token = ++loadToken;
      setCodeLoading(true);
      fetchContent(item.path).then(function(text) {
        if (token !== loadToken || selectedId !== item.id) return;
        showCode(text, item);
      }).catch(function() {
        if (token !== loadToken) return;
        setCodeLoading(false);
        codeEmpty.hidden = false;
        codeEmpty.textContent = "Could not load file.";
        codeWrap.hidden = true;
        setHeaderFile(item.label);
      });
    }
    function renderTreeFolder(folder, depth, pathLabel) {
      if (!folder || folder.type !== "folder") return;
      var hasNamedRoot = !!scopeFolder.name;
      var displayRoot = folder === scopeFolder && hasNamedRoot;
      if (displayRoot || folder.name && folder !== scopeFolder) {
        var isCollapsed = folder !== scopeFolder && !expanded.has(folder.id);
        var foldRow = document.createElement("div");
        foldRow.className = "library-preview-tree-folder" + (isCollapsed ? " is-collapsed" : "");
        foldRow.setAttribute("role", "treeitem");
        foldRow.setAttribute("aria-label", folder.name);
        foldRow.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
        foldRow.style.setProperty("--library-depth", String(depth));
        foldRow.dataset.folderId = folder.id;
        foldRow.tabIndex = -1;
        var toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.className = "library-preview-tree-toggle";
        toggleBtn.tabIndex = 0;
        var chev = document.createElement("span");
        chev.className = "library-category-chevron";
        chev.innerHTML = CHEVRON_SVG;
        toggleBtn.appendChild(chev);
        var label = document.createElement("span");
        label.className = "library-preview-tree-label";
        label.textContent = folder.name;
        toggleBtn.appendChild(label);
        if (folder.description) applyTip(toggleBtn, folder.description);
        toggleBtn.addEventListener("click", function() {
          if (expanded.has(folder.id)) expanded.delete(folder.id);
          else expanded.add(folder.id);
          renderTree();
        });
        foldRow.appendChild(toggleBtn);
        if (onInsertFolder) {
          var foldActions = document.createElement("div");
          foldActions.className = "library-actions";
          var folderPath = pathLabel || "";
          foldActions.appendChild(actionBtn(applyTip, "", "Insert", ICON_INSERT, function(btn) {
            onInsertFolder(btn, folder, folderPath);
          }));
          foldRow.appendChild(foldActions);
        }
        treePane.appendChild(foldRow);
        treeRows.push(toggleBtn);
        if (isCollapsed) return;
        depth += 1;
      }
      if (!folder.children) return;
      var suiteByFile = suiteByFileForFolderChildren(folder.children, cfgTextCache);
      for (var i = 0; i < folder.children.length; i++) {
        var child = folder.children[i];
        if (child.type === "folder") {
          renderTreeFolder(child, depth, pathLabel ? pathLabel + "/" + child.name : child.name);
        } else {
          var childExt = String(child.ext || "bel").toLowerCase();
          var suiteMeta = suiteByFile[child.label];
          var fileRow = document.createElement("div");
          fileRow.className = "library-preview-tree-file" + (childExt === "cfg" ? " library-preview-tree-file--cfg" : "") + (childExt === "elf" ? " library-preview-tree-file--elf" : "") + suiteClassesForMeta(suiteMeta) + (suiteMeta && suiteMeta.suiteIndex > 0 && suiteMeta.role === "head" ? " library-preview-tree-file--suite-block-sep" : "");
          if (child.id === selectedId) fileRow.classList.add("is-selected");
          fileRow.setAttribute("role", "treeitem");
          fileRow.setAttribute("aria-label", child.label);
          fileRow.style.setProperty("--library-depth", String(depth));
          fileRow.dataset.fileId = child.id;
          fileRow.tabIndex = 0;
          var fileLabel = document.createElement("span");
          fileLabel.className = "library-preview-tree-label";
          fileLabel.textContent = child.label;
          fileRow.appendChild(fileLabel);
          if (onCopyFile || onInsertFile) {
            var fileActions = document.createElement("div");
            fileActions.className = "library-actions";
            if (onCopyFile) {
              fileActions.appendChild(actionBtn(applyTip, "", "Copy to clipboard", ICON_COPY, function() {
                onCopyFile(child);
              }));
            }
            if (onInsertFile) {
              fileActions.appendChild(actionBtn(applyTip, "", "Insert", ICON_INSERT, function(btn) {
                onInsertFile(btn, child);
              }));
            }
            fileRow.appendChild(fileActions);
          }
          if (child.description) applyTip(fileRow, child.description);
          fileRow.addEventListener("click", /* @__PURE__ */ (function(it) {
            return function(e) {
              if (e.target.closest(".library-actions")) return;
              selectFile(it);
            };
          })(child));
          treePane.appendChild(fileRow);
          treeRows.push(fileRow);
        }
      }
    }
    function ensureCfgTextsLoaded() {
      if (typeof fetchContent !== "function") return Promise.resolve();
      var pending = [];
      for (var i = 0; i < searchFiles.length; i++) {
        var entry = searchFiles[i];
        if (entry.ext !== "cfg" || cfgTextCache[entry.label] != null) continue;
        pending.push(fetchContent(entry.path).then(function(label, text) {
          cfgTextCache[label] = text;
        }.bind(null, entry.label)));
      }
      return Promise.all(pending);
    }
    function renderTree() {
      treePane.innerHTML = "";
      treeRows = [];
      renderTreeFolder(scopeFolder, 0, "");
    }
    function focusRowIndex(idx) {
      if (!treeRows.length) return;
      var i = (idx % treeRows.length + treeRows.length) % treeRows.length;
      var row = treeRows[i];
      row.focus();
      if (row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
    }
    function handleTreeKeydown(e) {
      var row = document.activeElement;
      var idx = treeRows.indexOf(row);
      if (idx === -1) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusRowIndex(idx + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusRowIndex(idx - 1);
      } else if (e.key === "Enter" || e.key === " ") {
        if (row.classList.contains("library-preview-tree-toggle")) {
          e.preventDefault();
          row.click();
        } else if (row.classList.contains("library-preview-tree-file")) {
          e.preventDefault();
          var fid = row.dataset.fileId;
          if (fid && fileIndex[fid]) selectFile(fileIndex[fid].item);
        }
      } else if (e.key === "ArrowRight") {
        var folderEl = row.closest(".library-preview-tree-folder");
        if (folderEl && folderEl.classList.contains("is-collapsed")) {
          e.preventDefault();
          var fid2 = folderEl.dataset.folderId;
          if (fid2) {
            expanded.add(fid2);
            renderTree();
          }
        }
      } else if (e.key === "ArrowLeft") {
        var folderEl2 = row.closest(".library-preview-tree-folder");
        if (folderEl2 && !folderEl2.classList.contains("is-collapsed")) {
          e.preventDefault();
          var fid3 = folderEl2.dataset.folderId;
          if (fid3) {
            expanded.delete(fid3);
            renderTree();
          }
        }
      }
    }
    treePane.addEventListener("keydown", handleTreeKeydown);
    var dialogEl = global4.Dialog.createDialog({
      ariaLabel: "Library preview \u2014 " + scopeLabel,
      content: shell,
      className: "bj-library-preview-dialog",
      cardClass: "bj-dialog__card bj-dialog__card--library-preview",
      removeOnClose: true
    });
    activeDialog = dialogEl;
    dialogEl.addEventListener("close", function() {
      if (activeDialog === dialogEl) activeDialog = null;
      var libTree = document.querySelector(".library-tree");
      if (libTree && libTree.contains(document.activeElement)) {
        document.activeElement.blur();
      }
    });
    global4.Dialog.openDialog(dialogEl);
    ensureCfgTextsLoaded().then(function() {
      renderTree();
      if (selectedId && fileIndex[selectedId]) {
        selectFile(fileIndex[selectedId].item, { skipScroll: false });
      } else {
        showEmpty();
      }
      requestAnimationFrame(function() {
        var sel = treePane.querySelector(".library-preview-tree-file.is-selected");
        if (sel) sel.scrollIntoView({ block: "nearest" });
      });
    });
  }
  function close() {
    if (activeDialog && global4.Dialog) {
      global4.Dialog.requestDialogClose(activeDialog);
    }
  }
  global4.LibraryPreview = { open, close };
  global4.BelJarLibraryPreview = global4.LibraryPreview;

  // js/library/library-panel.mjs
  var global5 = globalThis;
  var CHEVRON_SVG2 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  var ICON_COPY2 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var ICON_PREVIEW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';
  var ICON_INSERT2 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
  function stemOf(label) {
    return String(label || "").replace(/\.[^.]+$/, "");
  }
  function dirOf2(path) {
    var i = String(path || "").lastIndexOf("/");
    return i === -1 ? "" : path.slice(0, i);
  }
  function init2(opts) {
    opts = opts || {};
    var container = opts.container;
    var searchEl = opts.searchEl;
    if (!container) return null;
    var manifest = null;
    var expanded = /* @__PURE__ */ new Set();
    var contentCache = /* @__PURE__ */ Object.create(null);
    var filterText = "";
    var searchMatchIds = null;
    var searchSnippets = null;
    var searchPending = false;
    var searchToken = 0;
    var allFileEntries = [];
    var suitesCache = [];
    var searchWrap = document.getElementById("library-search-wrap");
    var LS = global5.LibrarySearch;
    function readExpandDefault() {
      return typeof global5.Persist !== "undefined" && global5.Persist.readStoredLibraryExpandDefault();
    }
    function isCategoryExpanded(foldKey, forceOpen) {
      if (forceOpen) return true;
      var inSet = expanded.has(foldKey);
      return readExpandDefault() ? !inSet : inSet;
    }
    function toggleCategoryExpanded(foldKey) {
      if (expanded.has(foldKey)) expanded.delete(foldKey);
      else expanded.add(foldKey);
    }
    function collapseFolders() {
      expanded = /* @__PURE__ */ new Set();
      if (searchEl) {
        searchEl.value = "";
        filterText = "";
        searchMatchIds = null;
        searchSnippets = null;
        searchPending = false;
        searchToken += 1;
      }
      render();
    }
    function applyTip(el, tip) {
      if (typeof opts.applyTip === "function") opts.applyTip(el, tip);
    }
    function toast(msg, kind) {
      if (typeof opts.showToast === "function") opts.showToast(msg, { kind: kind || "info" });
    }
    function hasEditor() {
      return typeof opts.getEditor === "function" && opts.getEditor() && typeof opts.getActiveFileId === "function" && opts.getActiveFileId();
    }
    function hasActiveFile() {
      return typeof opts.getActiveFileId === "function" && !!opts.getActiveFileId();
    }
    function activeFileDir() {
      if (!hasActiveFile() || typeof opts.listFiles !== "function") return null;
      var id = opts.getActiveFileId();
      var files = opts.listFiles();
      for (var i = 0; i < files.length; i++) {
        if (files[i].id === id) return dirOf2(files[i].name);
      }
      return null;
    }
    function canInsertUnderCurrentFolder() {
      var dir = activeFileDir();
      return !!(dir && dir.length);
    }
    function refreshSuites() {
      if (typeof opts.listActiveSuites === "function") {
        suitesCache = opts.listActiveSuites();
      } else if (global5.LibrarySuites) {
        suitesCache = global5.LibrarySuites.listActiveSuites({
          listFiles: opts.listFiles,
          getActiveCfgForDir: opts.getActiveCfgForDir
        });
      } else {
        suitesCache = [];
      }
      return suitesCache;
    }
    function openLibraryPreview(previewOpts) {
      if (!global5.LibraryPreview || typeof global5.LibraryPreview.open !== "function") return;
      global5.LibraryPreview.open({
        scopeFolder: previewOpts.scopeFolder,
        scopeLabel: previewOpts.scopeLabel,
        initialFile: previewOpts.initialFile || null,
        focusFolder: previewOpts.focusFolder || null,
        fetchContent,
        applyTip,
        onCopyFile: function(item) {
          fetchContent(item.path).then(function(code) {
            return navigator.clipboard.writeText(code);
          }).then(function() {
            toast("Copied to clipboard");
          }).catch(function() {
            toast("Could not copy to clipboard.", { kind: "warn" });
          });
        },
        onInsertFile: function(anchor, item) {
          var row = beginLibraryMenuIntent(anchor);
          fetchContent(item.path).then(function(code) {
            openInsertMenu(anchor, code, item);
          }).catch(function() {
            cancelLibraryMenuIntent(row);
            toast("Could not load library sample.", { kind: "warn" });
          });
        },
        onInsertFolder: function(anchor, folder) {
          openFolderInsertMenu(anchor, folder);
        }
      });
    }
    function fetchContent(path) {
      if (contentCache[path] != null) return Promise.resolve(contentCache[path]);
      return fetch("library/data/" + path).then(function(res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      }).then(function(text) {
        contentCache[path] = text;
        return text;
      });
    }
    function libraryInsertPath(ref) {
      if (typeof ref === "string") return ref;
      if (!ref) return "";
      return ref.path || ref.label || ref.name || "";
    }
    function prepareLibraryInsert(code, ref) {
      var path = libraryInsertPath(ref);
      if (!/\.(bel|elf)$/i.test(path)) return code;
      if (typeof BelEditor !== "undefined" && typeof BelEditor.maybeExpandBelAliases === "function") {
        return BelEditor.maybeExpandBelAliases(code);
      }
      return code;
    }
    function isLibraryProjectFile(item) {
      if (!item || item.type !== "file") return false;
      var label = String(item.label || "").toLowerCase();
      var ext = String(item.ext || "").toLowerCase();
      return ext === "bel" || ext === "elf" || ext === "cfg" || /\.(bel|elf|cfg)$/i.test(label);
    }
    function isSuiteSourceFile(item) {
      if (!item || item.type !== "file") return false;
      var label = String(item.label || "").toLowerCase();
      var ext = String(item.ext || "").toLowerCase();
      return ext === "bel" || ext === "elf" || /\.(bel|elf)$/i.test(label);
    }
    function projectFileName(item) {
      if (item.label && /\.(bel|elf|cfg)$/i.test(item.label)) return item.label;
      var ext = item.ext === "elf" ? "elf" : item.ext === "cfg" ? "cfg" : "bel";
      return stemOf(item.label) + "." + ext;
    }
    function joinProjectPath(base, rel) {
      var parts = [];
      if (base) parts.push(String(base).replace(/^\/+|\/+$/g, ""));
      if (rel) parts.push(String(rel).replace(/^\/+|\/+$/g, ""));
      return parts.join("/");
    }
    function targetPathInDir(item, dir) {
      var name = projectFileName(item);
      return dir ? dir + "/" + name : name;
    }
    function targetPathForSuite(item, suite) {
      var name = projectFileName(item);
      var d = suite.dir;
      return d ? d + "/" + name : name;
    }
    function resolveBulkPlan(incoming, existingFiles) {
      var NC = global5.NameConflicts;
      var CD = global5.ConflictDialog;
      if (!NC) {
        return Promise.resolve({ create: incoming.slice(), replace: [], replaceFolder: [] });
      }
      if (!CD) {
        var names = existingFiles.map(function(f) {
          return f.name;
        });
        var resolved = incoming.map(function(entry) {
          var path = entry.name;
          if (NC.nameConflict(existingFiles, path)) {
            path = NC.suggestNewPath(path, names);
          }
          names.push(path);
          return { name: path, text: entry.text };
        });
        return Promise.resolve(NC.applyResolutions(existingFiles, resolved, [], []));
      }
      var batchRoots = typeof NC.uploadFolderBatchRoots === "function" ? NC.uploadFolderBatchRoots(incoming) : [];
      var conflicts = NC.detectUploadConflicts(existingFiles, incoming, {
        folderBatchRoots: batchRoots
      });
      if (!conflicts.length) {
        return Promise.resolve(NC.applyResolutions(existingFiles, incoming, [], []));
      }
      return CD.resolveConflicts(conflicts, { context: "library" }).then(function(resolutions) {
        if (resolutions === null) return null;
        return NC.applyResolutions(existingFiles, incoming, conflicts, resolutions);
      });
    }
    function resolveMagicPlan(relPath, code, existingFiles) {
      var NC = global5.NameConflicts;
      var CD = global5.ConflictDialog;
      var incoming = [{ name: relPath, text: code }];
      if (!NC) {
        return Promise.resolve({ create: [{ name: relPath, text: code }], replace: [], replaceFolder: [] });
      }
      if (!CD) {
        var names = existingFiles.map(function(f) {
          return f.name;
        });
        var path = relPath;
        if (NC.nameConflict(existingFiles, relPath)) {
          path = NC.suggestNewPath(relPath, names);
        }
        return Promise.resolve(NC.applyResolutions(
          existingFiles,
          [{ name: path, text: code }],
          [],
          []
        ));
      }
      var conflicts = NC.detectUploadConflicts(existingFiles, incoming, { folderBatchRoots: [] });
      if (!conflicts.length) {
        return Promise.resolve(NC.applyResolutions(existingFiles, incoming, [], []));
      }
      return CD.resolveConflicts(conflicts, { context: "library" }).then(function(resolutions) {
        if (resolutions === null) return null;
        return NC.applyResolutions(existingFiles, incoming, conflicts, resolutions);
      });
    }
    function applyFilePlan(plan, suite) {
      var P = global5.Persist;
      if (!plan) return;
      var targetId = null;
      var targetPath = null;
      var created = false;
      if (plan.replace && plan.replace.length === 1) {
        targetId = plan.replace[0].id;
        targetPath = plan.replace[0].name;
        if (typeof opts.applyFileReplacement === "function") {
          opts.applyFileReplacement(targetId, plan.replace[0].text);
        } else {
          P.setFileText(targetId, plan.replace[0].text);
        }
      } else if (plan.create && plan.create.length === 1) {
        targetPath = plan.create[0].name;
        targetId = P.createFile(targetPath);
        P.setFileText(targetId, plan.create[0].text);
        created = true;
      } else {
        return;
      }
      if (suite && typeof P.prependEntryToCfg === "function") {
        if (!P.prependEntryToCfg(suite.cfgPath, targetPath)) {
          if (created) {
            P.deleteFile(targetId);
            toast("Could not add to suite (already listed or invalid path).", { kind: "warn" });
            return;
          }
        }
      }
      if (suite && typeof opts.afterSuiteEdit === "function") opts.afterSuiteEdit(suite.dir);
      if (typeof opts.onProjectChanged === "function") {
        var activeId = typeof opts.getActiveFileId === "function" ? opts.getActiveFileId() : null;
        opts.onProjectChanged({ modifiedActive: targetId === activeId && !created });
      }
      if (suite) {
        var suiteName = suite.cfgPath.slice(suite.cfgPath.lastIndexOf("/") + 1);
        toast("Added " + targetPath.split("/").pop() + " to prelude of " + suiteName);
      } else {
        toast("Created " + targetPath.split("/").pop());
      }
    }
    function syncActiveCfgsAfterBulk() {
      var P = global5.Persist;
      var PS = global5.ProjectSource;
      if (!P || !PS || typeof PS.inferActiveCfgByDir !== "function") return;
      if (typeof P.backfillActiveCfgByDir !== "function") return;
      var files = P.listFiles();
      var byDir = PS.inferActiveCfgByDir(files, function(id) {
        return P.getFileText(id);
      });
      P.backfillActiveCfgByDir(byDir);
    }
    function applyBulkPlan(plan) {
      var P = global5.Persist;
      if (!plan) return;
      if (typeof opts.applyUploadPlan === "function") {
        var count = 0;
        if (plan.replaceFolder) {
          for (var rfi = 0; rfi < plan.replaceFolder.length; rfi++) {
            count += (plan.replaceFolder[rfi].entries || []).length;
          }
        }
        if (plan.replace) count += plan.replace.length;
        if (plan.create) count += plan.create.length;
        opts.applyUploadPlan(plan);
        syncActiveCfgsAfterBulk();
        if (typeof opts.afterSuiteEdit === "function") {
          var dir = activeFileDir();
          opts.afterSuiteEdit(dir != null ? dir : "");
        }
        toast("Inserted " + count + " file" + (count === 1 ? "" : "s"));
        return;
      }
      var count = 0;
      if (plan.replaceFolder) {
        for (var rf = 0; rf < plan.replaceFolder.length; rf++) {
          var folder = plan.replaceFolder[rf];
          var deleteIds = folder.deleteIds || [];
          for (var di = 0; di < deleteIds.length; di++) {
            P.deleteFile(deleteIds[di]);
          }
          var folderEntries = folder.entries || [];
          for (var fe = 0; fe < folderEntries.length; fe++) {
            var newId = P.createFile(folderEntries[fe].name);
            P.setFileText(newId, folderEntries[fe].text);
            count += 1;
          }
        }
      }
      if (plan.replace) {
        for (var i = 0; i < plan.replace.length; i++) {
          if (typeof opts.applyFileReplacement === "function") {
            opts.applyFileReplacement(plan.replace[i].id, plan.replace[i].text);
          } else {
            P.setFileText(plan.replace[i].id, plan.replace[i].text);
          }
          count += 1;
        }
      }
      if (plan.create) {
        for (var j = 0; j < plan.create.length; j++) {
          var id = P.createFile(plan.create[j].name);
          P.setFileText(id, plan.create[j].text);
          count += 1;
        }
      }
      syncActiveCfgsAfterBulk();
      if (typeof opts.afterSuiteEdit === "function") {
        var d = activeFileDir();
        opts.afterSuiteEdit(d != null ? d : "");
      }
      if (typeof opts.onProjectChanged === "function") {
        var activeId = typeof opts.getActiveFileId === "function" ? opts.getActiveFileId() : null;
        var modifiedActive = false;
        if (activeId && plan.replace) {
          for (var k = 0; k < plan.replace.length; k++) {
            if (plan.replace[k].id === activeId) {
              modifiedActive = true;
              break;
            }
          }
        }
        opts.onProjectChanged({ modifiedActive });
      }
      toast("Inserted " + count + " file" + (count === 1 ? "" : "s"));
    }
    function applyMagicPlan(plan, suite) {
      applyFilePlan(plan, suite);
    }
    function findParentFolder(item) {
      if (!manifest || !manifest.sections || !item) return null;
      var found = null;
      function walk(folder) {
        if (!folder || !folder.children) return false;
        for (var i = 0; i < folder.children.length; i++) {
          var child = folder.children[i];
          if (child.type === "file" && child.id === item.id) {
            found = folder;
            return true;
          }
          if (child.type === "folder" && walk(child)) return true;
        }
        return false;
      }
      for (var s = 0; s < manifest.sections.length; s++) {
        var section = manifest.sections[s];
        if (section.tree && walk(section.tree)) break;
      }
      return found;
    }
    function folderExportLabel(folder) {
      if (!folder) return "Untitled";
      if (folder.name) return folder.name;
      return "Untitled";
    }
    function projectRelForLibraryItem(item, folder) {
      if (!item) return null;
      if (folder) {
        var entries = collectFolderFiles(folder, "");
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].item.id === item.id) return entries[i].rel;
        }
      }
      return projectFileName(item);
    }
    function fetchFolderProjectEntries(folder) {
      var entries = collectFolderFiles(folder, "");
      if (!entries.length) return Promise.resolve([]);
      return Promise.all(entries.map(function(entry) {
        return fetchContent(entry.item.path).then(function(code) {
          return { name: entry.rel, text: prepareLibraryInsert(code, entry.rel) };
        });
      }));
    }
    function runExportAsNewProject(folder, activeItem) {
      if (typeof opts.onExportAsNewProject !== "function") return;
      if (!folder) {
        toast("Could not locate library folder.", { kind: "warn" });
        return;
      }
      fetchFolderProjectEntries(folder).then(function(rawEntries) {
        if (!rawEntries.length) {
          toast("No files to export.", { kind: "warn" });
          return;
        }
        opts.onExportAsNewProject({
          defaultName: folderExportLabel(folder),
          entries: rawEntries,
          activeRelPath: activeItem ? projectRelForLibraryItem(activeItem, folder) : null
        });
      }).catch(function() {
        toast("Could not load library samples.", { kind: "warn" });
      });
    }
    function runInsertAtRoot(item) {
      var P = global5.Persist;
      if (!P || typeof P.createFile !== "function" || !isLibraryProjectFile(item)) return;
      fetchContent(item.path).then(function(code) {
        code = prepareLibraryInsert(code, item.path);
        var relPath = targetPathInDir(item, "");
        return resolveMagicPlan(relPath, code, P.listFiles()).then(function(plan) {
          if (!plan) return;
          applyFilePlan(plan, null);
        });
      }).catch(function() {
        toast("Could not load library sample.", { kind: "warn" });
      });
    }
    function runInsertUnderCurrentFolder(item) {
      var P = global5.Persist;
      if (!P || typeof P.createFile !== "function" || !canInsertUnderCurrentFolder() || !isLibraryProjectFile(item)) return;
      var dir = activeFileDir();
      if (!dir) return;
      fetchContent(item.path).then(function(code) {
        code = prepareLibraryInsert(code, item.path);
        var relPath = targetPathInDir(item, dir);
        return resolveMagicPlan(relPath, code, P.listFiles()).then(function(plan) {
          if (!plan) return;
          applyFilePlan(plan, null);
        });
      }).catch(function() {
        toast("Could not load library sample.", { kind: "warn" });
      });
    }
    function collectFolderFiles(folder, relPrefix) {
      var out = [];
      if (!folder || !folder.children) return out;
      for (var i = 0; i < folder.children.length; i++) {
        var child = folder.children[i];
        if (child.type === "file") {
          if (!isLibraryProjectFile(child)) continue;
          var rel = relPrefix ? relPrefix + "/" + child.label : child.label;
          out.push({ item: child, rel });
        } else if (child.type === "folder") {
          var nextPrefix = relPrefix ? child.name ? relPrefix + "/" + child.name : relPrefix : child.name || "";
          out = out.concat(collectFolderFiles(child, nextPrefix));
        }
      }
      return out;
    }
    function runFolderInsert(folder, mode) {
      var P = global5.Persist;
      if (!P || typeof P.createFile !== "function") return;
      var rootPrefix = folder.name || "";
      var entries = collectFolderFiles(folder, rootPrefix);
      if (!entries.length) {
        toast("No files in this folder.", { kind: "warn" });
        return;
      }
      var projectBase = "";
      if (mode === "under") {
        if (!canInsertUnderCurrentFolder()) {
          toast("Open a file inside a folder first.", { kind: "warn" });
          return;
        }
        projectBase = activeFileDir();
      }
      Promise.all(entries.map(function(entry) {
        return fetchContent(entry.item.path).then(function(code) {
          return {
            name: joinProjectPath(projectBase, entry.rel),
            text: prepareLibraryInsert(code, entry.rel)
          };
        });
      })).then(function(incoming) {
        return resolveBulkPlan(incoming, P.listFiles());
      }).then(function(plan) {
        if (!plan) return;
        applyBulkPlan(plan);
      }).catch(function() {
        toast("Could not load library samples.", { kind: "warn" });
      });
    }
    function libraryMenuRow(anchor) {
      if (!anchor || !anchor.closest) return null;
      return anchor.closest(".library-category-item") || anchor.closest(".library-example-item") || anchor.closest(".library-preview-tree-folder") || anchor.closest(".library-preview-tree-file");
    }
    function beginLibraryMenuIntent(anchor) {
      var row = libraryMenuRow(anchor);
      if (row) row.classList.add("is-menu-open");
      return row;
    }
    function cancelLibraryMenuIntent(row) {
      if (row) row.classList.remove("is-menu-open");
    }
    function openLibraryMenu(anchor, menuOpts) {
      if (typeof global5.Menu === "undefined") return;
      var row = libraryMenuRow(anchor);
      if (row) row.classList.add("is-menu-open");
      var userOnClose = menuOpts.onClose;
      global5.Menu.open({
        anchor: menuOpts.anchor != null ? menuOpts.anchor : anchor,
        side: menuOpts.side,
        align: menuOpts.align,
        items: menuOpts.items,
        onReady: menuOpts.onReady,
        onClose: function() {
          if (row) row.classList.remove("is-menu-open");
          if (typeof userOnClose === "function") userOnClose();
        }
      });
    }
    function openFolderInsertMenu(anchor, folder) {
      openLibraryMenu(anchor, {
        side: "right",
        align: "start",
        items: [
          { label: "Insert at root", onSelect: function() {
            runFolderInsert(folder, "root");
          } },
          {
            label: "Insert under current folder",
            disabled: !canInsertUnderCurrentFolder(),
            onSelect: function() {
              runFolderInsert(folder, "under");
            }
          },
          { label: "Export as new project\u2026", onSelect: function() {
            runExportAsNewProject(folder, null);
          } }
        ]
      });
    }
    function openFileInsertMenu(anchor, item, code) {
      if (typeof global5.Menu === "undefined") return;
      refreshSuites();
      var ed = typeof opts.getEditor === "function" ? opts.getEditor() : null;
      var editorReady = !!(ed && hasEditor());
      var items = [
        { type: "section", label: "Create" },
        {
          label: "Insert at root",
          disabled: !isLibraryProjectFile(item),
          onSelect: function() {
            runInsertAtRoot(item);
          }
        },
        {
          label: "Insert under current folder",
          disabled: !canInsertUnderCurrentFolder() || !isLibraryProjectFile(item),
          onSelect: function() {
            runInsertUnderCurrentFolder(item);
          }
        },
        {
          label: "Insert to active suite",
          disabled: !suitesCache.length || !isSuiteSourceFile(item),
          onSelect: function() {
            openSuitePicker(anchor, item);
          }
        },
        {
          label: "Export as new project\u2026",
          disabled: !isLibraryProjectFile(item),
          onSelect: function() {
            var folder = findParentFolder(item);
            runExportAsNewProject(folder, item);
          }
        },
        { type: "separator" },
        { type: "section", label: "Active file" },
        {
          label: "Insert at top",
          disabled: !editorReady,
          onSelect: function() {
            ed.insertTop(code);
            ed.focus && ed.focus();
          }
        },
        {
          label: "Insert at bottom",
          disabled: !editorReady,
          onSelect: function() {
            ed.insertBottom(code);
            ed.focus && ed.focus();
          }
        },
        {
          label: "Insert at cursor",
          disabled: !editorReady,
          onSelect: function() {
            if (typeof ed.insertAtSelection === "function") ed.insertAtSelection(code);
            ed.focus && ed.focus();
          }
        }
      ];
      openLibraryMenu(anchor, {
        side: "right",
        align: "start",
        items
      });
    }
    function openInsertMenu(anchor, code, item) {
      openFileInsertMenu(anchor, item, prepareLibraryInsert(code, item));
    }
    function runMagic(item, suite) {
      if (!suite) return;
      if (!isSuiteSourceFile(item)) return;
      var P = global5.Persist;
      if (!P || typeof P.createFile !== "function") return;
      fetchContent(item.path).then(function(code) {
        code = prepareLibraryInsert(code, item.path);
        var relPath = targetPathForSuite(item, suite);
        return resolveMagicPlan(relPath, code, P.listFiles()).then(function(plan) {
          if (!plan) return;
          applyMagicPlan(plan, suite);
        });
      }).catch(function() {
        toast("Could not load library sample.", { kind: "warn" });
      });
    }
    function openSuitePicker(anchor, item) {
      refreshSuites();
      if (!suitesCache.length) return;
      if (suitesCache.length === 1) {
        runMagic(item, suitesCache[0]);
        return;
      }
      if (typeof global5.Menu === "undefined") return;
      openLibraryMenu(anchor, {
        side: "right",
        align: "start",
        items: suitesCache.map(function(s) {
          return {
            label: s.label,
            onSelect: function() {
              runMagic(item, s);
            }
          };
        })
      });
    }
    function actionBtn2(className, label, svg, disabled, onClick) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "library-action-btn" + (className ? " " + className : "");
      btn.innerHTML = svg;
      btn.setAttribute("aria-label", label);
      applyTip(btn, label);
      if (disabled) btn.disabled = true;
      btn.addEventListener("click", function(e) {
        e.stopPropagation();
        if (!btn.disabled) onClick(btn);
      });
      return btn;
    }
    function nodeMatchesFile(item, ctx) {
      if (!filterText) return true;
      if (searchMatchIds) return searchMatchIds.has(item.id);
      var hay = [
        item.label,
        item.description || "",
        item.path || "",
        ctx.pathLabel,
        ctx.section.label
      ].join(" ").toLowerCase();
      return hay.indexOf(filterText) !== -1;
    }
    function folderMatches(folder, ctx) {
      if (!filterText) return true;
      var hay = [folder.name, folder.description || "", ctx.pathLabel, ctx.section.label].join(" ").toLowerCase();
      if (hay.indexOf(filterText) !== -1) return true;
      return folder.children.some(function(child) {
        if (child.type === "file") return nodeMatchesFile(child, ctx);
        return folderMatches(child, {
          section: ctx.section,
          pathLabel: ctx.pathLabel ? ctx.pathLabel + "/" + child.name : child.name
        });
      });
    }
    function collectAllFiles(folder, section, pathLabel, topCategory, foldKeys) {
      if (!folder || folder.type !== "folder") return;
      var category = topCategory;
      var keys = foldKeys ? foldKeys.slice() : [];
      if (folder.name && !topCategory) {
        category = { folder, label: folder.name };
      }
      if (folder.name) {
        keys.push(section.id + "/" + folder.id);
      }
      if (!folder.children) return;
      for (var i = 0; i < folder.children.length; i++) {
        var child = folder.children[i];
        if (child.type === "folder") {
          collectAllFiles(
            child,
            section,
            pathLabel ? pathLabel + "/" + child.name : child.name,
            category,
            keys
          );
        } else if (child.type === "file") {
          var pl = pathLabel || "";
          allFileEntries.push({
            item: child,
            id: child.id,
            label: child.label,
            path: child.path,
            ext: child.ext || "bel",
            pathLabel: pl,
            sectionLabel: section.label,
            section,
            topCategory: category,
            foldKeys: keys.slice(),
            hay: LS ? LS.metadataHay({
              label: child.label,
              description: child.description,
              path: child.path,
              pathLabel: pl,
              sectionLabel: section.label
            }) : ""
          });
        }
      }
    }
    function rebuildFileIndex() {
      allFileEntries = [];
      if (!manifest || !manifest.sections) return;
      manifest.sections.forEach(function(section) {
        if (section.tree) collectAllFiles(section.tree, section, "", null, []);
      });
    }
    function appendMatchContext(item, depth) {
      if (!filterText || !searchSnippets) return;
      var hit = searchSnippets[item.id];
      if (!hit || !hit.snippet) return;
      var ctxRow = document.createElement("div");
      ctxRow.className = "library-match-context";
      ctxRow.style.setProperty("--library-depth", String(depth));
      ctxRow.setAttribute("aria-hidden", "true");
      if (hit.line) {
        var lineEl = document.createElement("span");
        lineEl.className = "library-match-context__line";
        lineEl.textContent = String(hit.line);
        ctxRow.appendChild(lineEl);
      }
      var sn = document.createElement("code");
      sn.className = "library-match-context__snippet";
      sn.textContent = hit.snippet;
      ctxRow.appendChild(sn);
      container.appendChild(ctxRow);
    }
    function runSearch() {
      if (!searchEl || !LS) return;
      var q = LS.normalizeQuery(searchEl.value);
      filterText = q;
      if (!q) {
        searchMatchIds = null;
        searchSnippets = null;
        searchPending = false;
        if (searchWrap) searchWrap.classList.remove("is-searching");
        render();
        return;
      }
      var token = ++searchToken;
      var syncIds = /* @__PURE__ */ new Set();
      for (var i = 0; i < allFileEntries.length; i++) {
        var e = allFileEntries[i];
        if (e.hay.indexOf(q) !== -1) syncIds.add(e.id);
      }
      searchMatchIds = syncIds;
      searchSnippets = /* @__PURE__ */ Object.create(null);
      searchPending = true;
      if (searchWrap) searchWrap.classList.add("is-searching");
      render();
      LS.searchEntries(allFileEntries, q, fetchContent, { limit: 0 }).then(function(hits) {
        if (token !== searchToken) return;
        searchPending = false;
        if (searchWrap) searchWrap.classList.remove("is-searching");
        searchMatchIds = /* @__PURE__ */ new Set();
        searchSnippets = /* @__PURE__ */ Object.create(null);
        for (var j = 0; j < hits.length; j++) {
          var h = hits[j];
          searchMatchIds.add(h.entry.id);
          if (h.snippet) {
            searchSnippets[h.entry.id] = { snippet: h.snippet, line: h.line };
          }
        }
        render();
      });
    }
    var searchTimer = null;
    function scheduleSearch() {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(runSearch, 180);
    }
    function countVisibleFiles(folder, ctx) {
      var n = 0;
      for (var i = 0; i < folder.children.length; i++) {
        var child = folder.children[i];
        if (child.type === "file") {
          if (nodeMatchesFile(child, ctx)) n += 1;
        } else {
          n += countVisibleFiles(child, {
            section: ctx.section,
            pathLabel: ctx.pathLabel ? ctx.pathLabel + "/" + child.name : child.name
          });
        }
      }
      return n;
    }
    function renderFileItem(item, depth, topCategory) {
      var row = document.createElement("div");
      row.className = "library-example-item library-example-item--" + (item.ext || "bel");
      row.setAttribute("role", "treeitem");
      row.setAttribute("aria-label", item.label);
      row.tabIndex = 0;
      row.style.setProperty("--library-depth", String(depth));
      row.setAttribute("data-library-file-id", item.id);
      var body = document.createElement("div");
      body.className = "library-example-body";
      var nameEl = document.createElement("span");
      nameEl.className = "library-example-label";
      nameEl.textContent = item.label;
      body.appendChild(nameEl);
      row.appendChild(body);
      var actions = document.createElement("div");
      actions.className = "library-actions";
      var copyBtn = actionBtn2("", "Copy to clipboard", ICON_COPY2, false, function() {
        fetchContent(item.path).then(function(code) {
          return navigator.clipboard.writeText(code);
        }).then(function() {
          toast("Copied to clipboard");
          var ed = typeof opts.getEditor === "function" ? opts.getEditor() : null;
          if (ed && ed.focus) ed.focus();
        }).catch(function() {
          toast("Could not copy to clipboard.", { kind: "warn" });
        });
      });
      var insertBtn = actionBtn2("", "Insert", ICON_INSERT2, false, function(btn) {
        var row2 = beginLibraryMenuIntent(btn);
        fetchContent(item.path).then(function(code) {
          openInsertMenu(btn, code, item);
        }).catch(function() {
          cancelLibraryMenuIntent(row2);
          toast("Could not load library sample.", { kind: "warn" });
        });
      });
      actions.appendChild(copyBtn);
      actions.appendChild(insertBtn);
      row.appendChild(actions);
      row.addEventListener("click", function(e) {
        if (e.target.closest(".library-actions")) return;
        if (!topCategory) return;
        openLibraryPreview({
          scopeFolder: topCategory.folder,
          scopeLabel: topCategory.label,
          initialFile: item
        });
        row.blur();
      });
      if (item.description) {
        applyTip(row, item.description);
      } else if (typeof global5.Tooltips !== "undefined" && global5.Tooltips.bindOverflow) {
        global5.Tooltips.bindOverflow(nameEl, function() {
          return item.label;
        });
      }
      container.appendChild(row);
      appendMatchContext(item, depth);
    }
    function renderFolder(folder, section, depth, pathLabel, topCategory) {
      if (!folder || folder.type !== "folder") return false;
      var ctx = { section, pathLabel };
      if (!folderMatches(folder, ctx)) return false;
      var forceOpen = !!filterText;
      var rendered = false;
      var category = topCategory;
      if (folder.name && !topCategory) {
        category = { folder, label: folder.name };
      }
      if (folder.name) {
        var foldKey = section.id + "/" + folder.id;
        var isCollapsed = !isCategoryExpanded(foldKey, forceOpen);
        var visibleCount = countVisibleFiles(folder, ctx);
        var catRow = document.createElement("div");
        catRow.className = "library-category-item" + (isCollapsed ? " is-collapsed" : "");
        catRow.style.setProperty("--library-depth", String(depth));
        var toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.className = "library-category-toggle";
        toggleBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
        var chev = document.createElement("span");
        chev.className = "library-category-chevron";
        chev.innerHTML = CHEVRON_SVG2;
        toggleBtn.appendChild(chev);
        var catLabel = document.createElement("span");
        catLabel.className = "library-category-label";
        catLabel.textContent = folder.name;
        toggleBtn.appendChild(catLabel);
        if (folder.description) applyTip(toggleBtn, folder.description);
        toggleBtn.addEventListener("click", function() {
          toggleCategoryExpanded(foldKey);
          render();
        });
        catRow.appendChild(toggleBtn);
        var previewBtn = actionBtn2("library-category-preview", "Preview", ICON_PREVIEW, false, function() {
          if (!category) return;
          openLibraryPreview({
            scopeFolder: category.folder,
            scopeLabel: category.label,
            focusFolder: folder
          });
        });
        catRow.appendChild(previewBtn);
        var insertBtn = actionBtn2("library-category-insert", "Insert", ICON_INSERT2, false, function(btn) {
          openFolderInsertMenu(btn, folder);
        });
        catRow.appendChild(insertBtn);
        var count = document.createElement("span");
        count.className = "library-category-count";
        count.textContent = String(visibleCount);
        catRow.appendChild(count);
        container.appendChild(catRow);
        rendered = true;
        if (isCollapsed) return rendered;
        depth += 1;
      }
      for (var i = 0; i < folder.children.length; i++) {
        var child = folder.children[i];
        if (child.type === "folder") {
          if (renderFolder(child, section, depth, pathLabel ? pathLabel + "/" + child.name : child.name, category)) {
            rendered = true;
          }
        } else if (nodeMatchesFile(child, {
          section,
          pathLabel
        })) {
          renderFileItem(child, depth, category);
          rendered = true;
        }
      }
      return rendered;
    }
    function render() {
      container.innerHTML = "";
      if (!manifest || !manifest.sections || !manifest.sections.length) {
        var empty = document.createElement("p");
        empty.className = "library-empty";
        empty.textContent = "Library catalog unavailable.";
        container.appendChild(empty);
        return;
      }
      refreshSuites();
      var anyVisible = false;
      manifest.sections.forEach(function(section) {
        if (!section.tree) return;
        var sectionLabel = document.createElement("div");
        sectionLabel.className = "library-section-label";
        sectionLabel.textContent = section.label;
        container.appendChild(sectionLabel);
        if (renderFolder(section.tree, section, 0, "", null)) {
          anyVisible = true;
        } else {
          sectionLabel.remove();
        }
      });
      if (!anyVisible) {
        container.innerHTML = "";
        var noMatch = document.createElement("p");
        noMatch.className = "library-empty";
        if (filterText && searchPending) {
          noMatch.textContent = "Searching\u2026";
        } else if (filterText) {
          noMatch.textContent = "No samples match your search.";
        } else {
          noMatch.textContent = "Library catalog unavailable.";
        }
        container.appendChild(noMatch);
      }
    }
    function loadManifest() {
      return fetch("library/manifest.json").then(function(res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      }).then(function(data) {
        manifest = data;
        rebuildFileIndex();
        render();
      }).catch(function() {
        manifest = null;
        allFileEntries = [];
        render();
      });
    }
    if (searchEl && searchWrap && global5.HeaderSearch) {
      global5.HeaderSearch.init({
        host: searchWrap,
        input: searchEl,
        onInput: scheduleSearch
      });
    } else if (searchEl) {
      searchEl.addEventListener("input", scheduleSearch);
    }
    loadManifest();
    return {
      refresh: function() {
        refreshSuites();
        render();
      },
      collapseFolders,
      reload: loadManifest
    };
  }
  global5.Library = { init: init2 };
  global5.BelJarLibrary = global5.Library;
})();
