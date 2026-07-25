/**
 * Editor file-tab strip — render only; open/close/switch stay in app.js.
 */

  export function create(opts) {
    var editorTabsEl = opts.editorTabsEl;
    var listOpenFiles = opts.listOpenFiles;
    var getActiveId = opts.getActiveId;
    var fileHasErrors = opts.fileHasErrors;
    var setTip = opts.setTip;
    var onSwitch = opts.onSwitch;
    var onClose = opts.onClose;
    var onNew = opts.onNew;

    function renderTabs() {
      if (!editorTabsEl) return;
      var files = listOpenFiles() || [];
      var activeId = getActiveId();
      editorTabsEl.innerHTML = '';

      files.forEach(function (file) {
        var tab = document.createElement('button');
        tab.type = 'button';
        tab.role = 'tab';
        tab.className = 'editor-tab'
          + (file.id === activeId ? ' is-active' : '')
          + (fileHasErrors(file.id) ? ' has-errors' : '');
        tab.setAttribute('aria-selected', file.id === activeId ? 'true' : 'false');
        tab.setAttribute('data-file-id', file.id);

        var baseName = file.name.split('/').pop();
        tab.setAttribute('aria-label', baseName);

        var nameSpan = document.createElement('span');
        nameSpan.className = 'editor-tab-name';
        nameSpan.textContent = baseName;
        if (typeof Tooltips !== 'undefined') Tooltips.bindOverflow(nameSpan, function () { return baseName; });

        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'editor-tab-close';
        if (setTip) setTip(closeBtn, 'Close');
        closeBtn.setAttribute('tabindex', '-1');
        closeBtn.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
          + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
          + '<path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
        closeBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          onClose(file.id);
        });

        tab.appendChild(nameSpan);
        tab.appendChild(closeBtn);
        tab.addEventListener('click', function () { onSwitch(file.id); });
        editorTabsEl.appendChild(tab);
      });

      var newBtn = document.createElement('button');
      newBtn.type = 'button';
      newBtn.className = 'editor-tab-new';
      if (setTip) setTip(newBtn, 'New file');
      newBtn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
      newBtn.addEventListener('click', function () { onNew(); });
      editorTabsEl.appendChild(newBtn);

      var activeTab = editorTabsEl.querySelector('.editor-tab.is-active');
      if (activeTab) activeTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    return { renderTabs: renderTabs };
  }
