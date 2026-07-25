(() => {
  // js/ui/dialog.mjs
  var DIALOG_ROOT_CLASS = "bj-dialog";
  var dialogs = /* @__PURE__ */ new WeakMap();
  function parseMs(cssValue, fallback) {
    const n = parseFloat(String(cssValue || "").trim());
    return Number.isFinite(n) ? n : fallback;
  }
  function closeDurationMs() {
    return parseMs(getComputedStyle(document.documentElement).getPropertyValue("--dialog-ms-out"), 132);
  }
  function dialogInfo(dialogEl) {
    return dialogs.get(dialogEl);
  }
  function registerDialog(dialogEl, removeOnClose) {
    if (!dialogEl || dialogs.has(dialogEl)) return dialogEl || null;
    const info = {
      removeOnClose: !!removeOnClose,
      isClosing: false,
      timer: null
    };
    dialogEl.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target !== dialogEl) return;
      function cleanup() {
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("pointercancel", cleanup);
      }
      function onPointerUp(upE) {
        if (upE.target === dialogEl) requestDialogClose(dialogEl);
        cleanup();
      }
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("pointercancel", cleanup);
    });
    dialogEl.addEventListener("cancel", (e) => {
      e.preventDefault();
      requestDialogClose(dialogEl);
    });
    dialogEl.addEventListener("close", () => {
      info.isClosing = false;
      if (info.timer) {
        clearTimeout(info.timer);
        info.timer = null;
      }
      dialogEl.classList.remove("is-leaving");
      if (info.removeOnClose) {
        dialogs.delete(dialogEl);
        dialogEl.remove();
      }
    });
    dialogs.set(dialogEl, info);
    return dialogEl;
  }
  function openDialog(dialogEl) {
    if (!dialogEl) return null;
    registerDialog(dialogEl);
    const info = dialogInfo(dialogEl);
    if (!info) return dialogEl;
    info.isClosing = false;
    dialogEl.classList.remove("is-leaving");
    if (info.timer) {
      clearTimeout(info.timer);
      info.timer = null;
    }
    if (!dialogEl.open) dialogEl.showModal();
    return dialogEl;
  }
  function requestDialogClose(dialogEl) {
    if (!dialogEl) return;
    const info = dialogInfo(dialogEl);
    if (!info || !dialogEl.open || info.isClosing) return;
    info.isClosing = true;
    dialogEl.classList.add("is-leaving");
    if (info.timer) {
      clearTimeout(info.timer);
      info.timer = null;
    }
    const ms = closeDurationMs();
    info.timer = setTimeout(() => {
      info.timer = null;
      if (dialogEl.open) dialogEl.close();
    }, ms);
  }
  function createDialog(opts) {
    opts = opts || {};
    const className = opts.className || "";
    const cardClass = opts.cardClass || "";
    const title = opts.title;
    const closeButton = opts.closeButton !== false;
    const closeLabel = opts.closeLabel || "Close dialog";
    const removeOnClose = opts.removeOnClose !== false;
    const dialogEl = document.createElement("dialog");
    dialogEl.className = [DIALOG_ROOT_CLASS, className].filter(Boolean).join(" ");
    const card = document.createElement("div");
    card.className = ["bj-dialog__card", cardClass].filter(Boolean).join(" ");
    if (closeButton) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bj-dialog__close icon-btn";
      btn.setAttribute("aria-label", closeLabel);
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        requestDialogClose(dialogEl);
      });
      card.appendChild(btn);
    }
    if (title) {
      const h = document.createElement("div");
      h.className = "bj-dialog__title";
      h.id = "bj-dialog-title-" + Math.random().toString(36).slice(2);
      h.textContent = title;
      dialogEl.setAttribute("aria-labelledby", h.id);
      card.appendChild(h);
    } else if (opts.ariaLabel) {
      dialogEl.setAttribute("aria-label", opts.ariaLabel);
    }
    const body = document.createElement("div");
    body.className = "bj-dialog__body";
    const c = opts.content;
    if (c instanceof Node) body.appendChild(c);
    else body.innerHTML = c != null ? String(c) : "";
    card.appendChild(body);
    dialogEl.appendChild(card);
    document.body.appendChild(dialogEl);
    registerDialog(dialogEl, removeOnClose);
    return dialogEl;
  }
  function closeAllDialogs() {
    document.querySelectorAll(`dialog.${DIALOG_ROOT_CLASS}[open]`).forEach((dlg) => {
      requestDialogClose(dlg);
    });
  }
  function setDialogFooterError(root, message) {
    if (!root) return;
    const foot = root.querySelector("[data-dialog-foot]") || (root.matches && root.matches("[data-dialog-foot]") ? root : null);
    if (!foot) return;
    const preview = foot.querySelector("[data-dialog-foot-preview]");
    const warn = foot.querySelector("[data-dialog-foot-warning]");
    if (!preview || !warn) return;
    if (message) {
      warn.textContent = message;
      warn.hidden = false;
      preview.hidden = true;
    } else {
      warn.textContent = "";
      warn.hidden = true;
      preview.hidden = false;
    }
  }
  var Dialog = {
    registerDialog,
    openDialog,
    requestDialogClose,
    createDialog,
    closeAllDialogs,
    setDialogFooterError
  };
  var g = typeof window !== "undefined" ? window : globalThis;
  g.Dialog = Dialog;
  g.BelJarDialog = g.Dialog;

  // js/ui/prompt-dialog.mjs
  var CARD_CLASS = "bj-dialog__card bj-prompt-dialog__card";
  var WRAP_CLASS = "bj-prompt-dialog-wrap";
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function markMono(name) {
    const span = el("span", "bj-prompt-dialog__mono");
    span.textContent = name;
    return span;
  }
  function actionButton(label, action, variant, opts) {
    opts = opts || {};
    const btn = el("button", "bj-prompt-dialog__btn" + (variant ? ` is-${variant}` : ""));
    btn.type = "button";
    btn.dataset.action = action;
    if (opts.monoSuffix) {
      if (opts.labelPrefix) {
        btn.appendChild(el("span", "bj-prompt-dialog__btn-prefix", opts.labelPrefix));
      }
      const mono = el("span", "bj-prompt-dialog__btn-mono");
      mono.textContent = opts.monoSuffix;
      btn.appendChild(mono);
    } else {
      btn.textContent = label;
    }
    return btn;
  }
  function buildActions(buttons, layout) {
    const actions = el("div", "bj-prompt-dialog__actions");
    if (layout === "row") actions.classList.add("is-row");
    for (const b of buttons) {
      const btnOpts = {};
      if (b.monoSuffix != null) {
        btnOpts.monoSuffix = b.monoSuffix;
        if (b.labelPrefix) btnOpts.labelPrefix = b.labelPrefix;
      }
      actions.appendChild(actionButton(b.label, b.action, b.variant, btnOpts));
    }
    return actions;
  }
  function buildRowActions(buttons) {
    return buildActions(buttons, "row");
  }
  function appendBody(shell, opts) {
    if (opts.body instanceof Node) {
      shell.appendChild(opts.body);
      return;
    }
    if (opts.step) {
      shell.appendChild(el("p", "bj-prompt-dialog__step", opts.step));
    }
    if (opts.subject) {
      const subject = el("p", "bj-prompt-dialog__subject");
      subject.appendChild(markMono(opts.subject));
      shell.appendChild(subject);
    }
    if (opts.message != null) {
      const intro = el("p", "bj-prompt-dialog__message");
      if (opts.message instanceof Node) intro.appendChild(opts.message);
      else intro.textContent = String(opts.message);
      shell.appendChild(intro);
    }
    if (opts.note) {
      shell.appendChild(el("p", "bj-prompt-dialog__note", opts.note));
    }
  }
  function open(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let settled = false;
      const shell = el("div", "bj-prompt-dialog");
      appendBody(shell, opts);
      const buttons = opts.buttons || [];
      if (buttons.length) {
        shell.appendChild(buildActions(buttons, opts.layout));
      }
      const dialogEl = createDialog({
        ariaLabel: opts.ariaLabel || opts.title || "Prompt",
        title: opts.title,
        content: shell,
        className: opts.className || WRAP_CLASS,
        cardClass: opts.cardClass || CARD_CLASS,
        closeButton: opts.closeButton !== false,
        removeOnClose: true
      });
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
        requestDialogClose(dialogEl);
      }
      shell.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        finish(btn.dataset.action);
      });
      dialogEl.addEventListener("close", () => {
        if (!settled) finish(null);
      });
      openDialog(dialogEl);
      if (typeof opts.onOpen === "function") {
        requestAnimationFrame(() => {
          opts.onOpen(dialogEl, shell);
        });
      }
    });
  }
  var PromptDialog = {
    CARD_CLASS,
    WRAP_CLASS,
    el,
    markMono,
    actionButton,
    buildActions,
    buildRowActions,
    appendBody,
    open
  };
  var g2 = typeof window !== "undefined" ? window : globalThis;
  g2.PromptDialog = PromptDialog;
  g2.BelJarPromptDialog = g2.PromptDialog;

  // js/ui/confirm-dialog.mjs
  function normalizeOpts(messageOrOpts, maybeOpts) {
    if (messageOrOpts != null && typeof messageOrOpts === "object" && !(messageOrOpts instanceof Node)) {
      return messageOrOpts;
    }
    return Object.assign({}, maybeOpts || {}, { message: messageOrOpts });
  }
  function confirm(messageOrOpts, maybeOpts) {
    const opts = normalizeOpts(messageOrOpts, maybeOpts);
    const danger = opts.danger !== false;
    return open({
      ariaLabel: opts.ariaLabel || "Confirm",
      subject: opts.subject,
      message: opts.message,
      note: opts.note,
      className: opts.className || "bj-confirm-dialog-wrap",
      closeButton: opts.closeButton,
      layout: "row",
      buttons: [
        { action: "no", label: opts.cancelLabel || "Cancel", variant: "ghost" },
        {
          action: "yes",
          label: opts.confirmLabel || (danger ? "Delete" : "OK"),
          variant: danger ? "danger" : "primary"
        }
      ]
    }).then((action) => action === "yes");
  }
  var ConfirmDialog = { confirm };
  var g3 = typeof window !== "undefined" ? window : globalThis;
  g3.ConfirmDialog = ConfirmDialog;
  g3.BelJarConfirmDialog = g3.ConfirmDialog;

  // js/ui/name-prompt.mjs
  function defaultNormalize(raw) {
    return String(raw || "").trim();
  }
  function defaultValidate(name) {
    if (!name) return "Name is required.";
    return null;
  }
  function selectionForValue(value, selection) {
    const v = String(value || "");
    if (!selection) return { start: 0, end: v.length };
    let start = selection.start != null ? selection.start : 0;
    let end = selection.end != null ? selection.end : v.length;
    start = Math.max(0, Math.min(start, v.length));
    end = Math.max(start, Math.min(end, v.length));
    return { start, end };
  }
  function normalizeBelFileName(raw) {
    let name = String(raw || "").trim();
    if (!name) return "";
    if (name.indexOf(".") === -1) name += ".bel";
    return name;
  }
  function open2(opts) {
    opts = opts || {};
    const { el: el2, buildRowActions: buildRowActions2, CARD_CLASS: CARD_CLASS2 } = PromptDialog;
    const normalize = typeof opts.normalize === "function" ? opts.normalize : defaultNormalize;
    const validate = typeof opts.validate === "function" ? opts.validate : defaultValidate;
    const initialValue = opts.value != null ? String(opts.value) : "";
    const sel = selectionForValue(initialValue, opts.selection);
    let settled = false;
    return new Promise((resolve) => {
      const wrap = el2("div", "bj-name-prompt");
      const leadEl = opts.message ? el2("p", "bj-name-prompt__message", opts.message) : null;
      const input = el2("input", "bj-name-prompt__input");
      input.type = "text";
      input.value = initialValue;
      input.spellcheck = false;
      input.autocomplete = "off";
      if (opts.mono) input.classList.add("is-mono");
      if (opts.placeholder) input.placeholder = opts.placeholder;
      wrap.appendChild(input);
      const errorEl = el2("p", "bj-name-prompt__error");
      errorEl.hidden = true;
      wrap.appendChild(errorEl);
      if (opts.hint) {
        const hint = el2("p", "bj-name-prompt__hint");
        hint.textContent = opts.hint;
        wrap.appendChild(hint);
      }
      const actions = buildRowActions2([
        { action: "cancel", label: opts.cancelLabel || "Cancel", variant: "ghost" },
        { action: "confirm", label: opts.confirmLabel || "Create", variant: "primary" }
      ]);
      actions.classList.add("bj-name-prompt__actions");
      const cancelBtn = actions.querySelector('[data-action="cancel"]');
      const confirmBtn = actions.querySelector('[data-action="confirm"]');
      wrap.appendChild(actions);
      const dialogEl = createDialog({
        ariaLabel: opts.ariaLabel || "Name",
        content: wrap,
        className: "bj-name-prompt-dialog",
        cardClass: CARD_CLASS2,
        removeOnClose: true
      });
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
        requestDialogClose(dialogEl);
      }
      function showError(msg) {
        if (msg) {
          errorEl.textContent = msg;
          errorEl.hidden = false;
          input.classList.add("is-invalid");
          confirmBtn.disabled = true;
        } else {
          errorEl.textContent = "";
          errorEl.hidden = true;
          input.classList.remove("is-invalid");
          confirmBtn.disabled = false;
        }
      }
      function currentNormalized() {
        return normalize(input.value);
      }
      function tryConfirm() {
        const name = currentNormalized();
        const err = validate(name);
        if (err) {
          showError(err);
          return;
        }
        finish(name);
      }
      input.addEventListener("input", () => {
        showError(validate(currentNormalized()));
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          tryConfirm();
        }
      });
      cancelBtn.addEventListener("click", () => {
        finish(null);
      });
      confirmBtn.addEventListener("click", () => {
        tryConfirm();
      });
      if (leadEl) {
        const card = dialogEl.querySelector(".bj-dialog__card");
        const body = dialogEl.querySelector(".bj-dialog__body");
        if (card && body) card.insertBefore(leadEl, body);
      }
      dialogEl.addEventListener("close", () => {
        if (!settled) finish(null);
      });
      openDialog(dialogEl);
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(sel.start, sel.end);
        showError(validate(currentNormalized()));
      });
    });
  }
  var NamePrompt = {
    open: open2,
    normalizeBelFileName,
    defaultNormalize,
    defaultValidate,
    selectionForValue
  };
  var g4 = typeof window !== "undefined" ? window : globalThis;
  g4.NamePrompt = NamePrompt;
  g4.BelJarNamePrompt = g4.NamePrompt;

  // js/ui/conflict-dialog.mjs
  function suggestedBase(conflict) {
    const path = conflict.suggestedPath;
    const NC = globalThis.NameConflicts;
    if (NC && typeof NC.baseName === "function") {
      return NC.baseName(path);
    }
    const slash = path.lastIndexOf("/");
    return slash === -1 ? path : path.slice(slash + 1);
  }
  function buildConflictBody(conflict, total, index) {
    const { el: el2, markMono: markMono2 } = PromptDialog;
    const wrap = el2("div", "bj-conflict-dialog__panel");
    if (total > 1) {
      wrap.appendChild(el2("p", "bj-prompt-dialog__step", `${index + 1} of ${total}`));
    }
    const subject = el2("p", "bj-prompt-dialog__subject");
    subject.appendChild(markMono2(conflict.label));
    wrap.appendChild(subject);
    const message = el2("p", "bj-prompt-dialog__message");
    message.textContent = conflict.kind === "folder" ? "A folder with this name is already in the project." : "A file with this name is already in the project.";
    wrap.appendChild(message);
    return wrap;
  }
  function buildActions2(conflict, total) {
    const suggested = suggestedBase(conflict);
    return PromptDialog.buildActions([
      {
        action: "rename",
        label: `Keep as ${suggested}`,
        labelPrefix: "Keep as",
        monoSuffix: suggested,
        variant: "primary"
      },
      {
        action: "replace",
        label: conflict.kind === "folder" ? "Replace existing folder" : "Replace existing file",
        variant: "secondary"
      },
      {
        action: total === 1 ? "cancel" : "skip",
        label: total === 1 ? "Cancel" : "Skip",
        variant: "ghost"
      }
    ]);
  }
  function resolveConflicts(conflicts, options) {
    options = options || {};
    if (!conflicts || !conflicts.length) return Promise.resolve([]);
    const { el: el2, WRAP_CLASS: WRAP_CLASS2, CARD_CLASS: CARD_CLASS2 } = PromptDialog;
    return new Promise((resolve) => {
      let index = 0;
      const resolutions = [];
      let settled = false;
      const shell = el2("div", "bj-prompt-dialog");
      const dialogEl = createDialog({
        ariaLabel: "Name conflict",
        content: shell,
        className: WRAP_CLASS2,
        cardClass: CARD_CLASS2,
        removeOnClose: true
      });
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
        requestDialogClose(dialogEl);
      }
      function renderStep() {
        shell.replaceChildren();
        const conflict = conflicts[index];
        shell.appendChild(buildConflictBody(conflict, conflicts.length, index));
        shell.appendChild(buildActions2(conflict, conflicts.length));
      }
      shell.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const action = btn.dataset.action;
        const conflict = conflicts[index];
        if (action === "cancel") {
          finish(null);
          return;
        }
        if (action === "skip") {
          resolutions.push({ action: "skip" });
        } else if (action === "replace") {
          resolutions.push({ action: "replace" });
        } else if (action === "rename") {
          resolutions.push({ action: "rename", newPath: conflict.suggestedPath });
        }
        index += 1;
        if (index >= conflicts.length) finish(resolutions);
        else renderStep();
      });
      dialogEl.addEventListener("close", () => {
        if (!settled) finish(null);
      });
      renderStep();
      openDialog(dialogEl);
    });
  }
  var ConflictDialog = {
    resolveConflicts
  };
  var g5 = typeof window !== "undefined" ? window : globalThis;
  g5.ConflictDialog = ConflictDialog;
  g5.BelJarConflictDialog = g5.ConflictDialog;
})();
