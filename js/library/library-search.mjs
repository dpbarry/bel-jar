// Shared library search: metadata + file content, snippet extraction, result rendering.
const global = globalThis;
var SEARCH_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';

  function normalizeQuery(q) {
    return String(q || '').trim().toLowerCase();
  }

  function metadataHay(entry) {
    return [
      entry.label,
      entry.description || '',
      entry.path || '',
      entry.pathLabel || '',
      entry.sectionLabel || '',
    ].join(' ').toLowerCase();
  }

  function snippetFromContent(text, query) {
    var q = normalizeQuery(query);
    if (!q || text == null) return null;
    var src = String(text);
    var lower = src.toLowerCase();
    var idx = lower.indexOf(q);
    if (idx === -1) return null;

    var lineStart = src.lastIndexOf('\n', idx - 1) + 1;
    var lineEnd = src.indexOf('\n', idx);
    if (lineEnd === -1) lineEnd = src.length;
    var line = src.slice(lineStart, lineEnd);

    var rel = idx - lineStart;
    var pad = 42;
    var start = Math.max(0, rel - pad);
    var end = Math.min(line.length, rel + q.length + pad);
    var snippet = line.slice(start, end);
    if (start > 0) snippet = '\u2026' + snippet;
    if (end < line.length) snippet = snippet + '\u2026';

    return {
      snippet: snippet,
      line: src.slice(0, lineStart).split('\n').length,
    };
  }

  function rankHit(hit, q) {
    var label = String(hit.entry.label || '').toLowerCase();
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
        metaHits.push({ entry: entry, metaMatch: true, snippet: null, line: null });
      } else if (typeof fetchContent === 'function' && entry.path) {
        pending.push(entry);
      }
    }

    if (!pending.length) {
      metaHits.sort(function (a, b) {
        var dr = rankHit(a, q) - rankHit(b, q);
        return dr !== 0 ? dr : a.entry.label.localeCompare(b.entry.label);
      });
      return Promise.resolve(limit < 1 ? metaHits : metaHits.slice(0, limit));
    }

    var contentHits = [];
    var left = pending.length;
    return new Promise(function (resolve) {
      function finish() {
        left -= 1;
        if (left > 0) return;
        var out = metaHits.concat(contentHits);
        out.sort(function (a, b) {
          var dr = rankHit(a, q) - rankHit(b, q);
          return dr !== 0 ? dr : a.entry.label.localeCompare(b.entry.label);
        });
        resolve(limit < 1 ? out : out.slice(0, limit));
      }

      for (var j = 0; j < pending.length; j++) {
        (function (entry) {
          fetchContent(entry.path).then(function (text) {
            var sn = snippetFromContent(text, q);
            if (sn) {
              contentHits.push({
                entry: entry,
                metaMatch: false,
                snippet: sn.snippet,
                line: sn.line,
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
    var ext = entry.ext || (entry.item && entry.item.ext) || 'bel';
    var label = entry.label || (entry.item && entry.item.label) || '';
    var pathLabel = entry.pathLabel || '';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'library-find__hit library-find__hit--' + ext
      + (layout === 'stack' ? ' library-find__hit--stack' : ' library-find__hit--inline');
    btn.setAttribute('role', 'option');

    var head = document.createElement('span');
    head.className = 'library-find__hit-head';

    var name = document.createElement('span');
    name.className = 'library-find__hit-name';
    name.textContent = label;
    head.appendChild(name);

    if (pathLabel && layout === 'inline') {
      var path = document.createElement('span');
      path.className = 'library-find__hit-path';
      path.textContent = pathLabel;
      head.appendChild(path);
    }

    if (hit.snippet && layout === 'inline') {
      var sn = document.createElement('span');
      sn.className = 'library-find__snippet library-find__snippet--inline';
      sn.textContent = hit.snippet;
      head.appendChild(sn);
    }

    btn.appendChild(head);

    if (pathLabel && layout === 'stack') {
      var path2 = document.createElement('span');
      path2.className = 'library-find__hit-path';
      path2.textContent = pathLabel;
      btn.appendChild(path2);
    }

    if (hit.snippet && layout === 'stack') {
      if (hit.line) {
        var meta = document.createElement('span');
        meta.className = 'library-find__snippet-meta';
        meta.textContent = 'Line ' + hit.line;
        btn.appendChild(meta);
      }
      var snap = document.createElement('div');
      snap.className = 'library-find__snippet library-find__snippet--block';
      snap.textContent = hit.snippet;
      btn.appendChild(snap);
    }

    btn.addEventListener('click', function () {
      if (typeof onSelect === 'function') onSelect(hit);
    });

    container.appendChild(btn);
  }

  function renderResults(container, hits, layout, onSelect) {
    container.innerHTML = '';
    for (var i = 0; i < hits.length; i++) {
      renderHit(container, hits[i], layout, onSelect);
    }
  }

  global.LibrarySearch = {
    SEARCH_ICON: SEARCH_ICON,
    normalizeQuery: normalizeQuery,
    metadataHay: metadataHay,
    snippetFromContent: snippetFromContent,
    searchEntries: searchEntries,
    renderResults: renderResults,
  };
  global.BelJarLibrarySearch = global.LibrarySearch;
