(() => {
  // js/boot/error-hook.mjs
  function formatJsErrorLine(msg, line) {
    return `${msg} (line ${line})`;
  }
  function reportJsError(msg, line, env = globalThis) {
    const lineMsg = formatJsErrorLine(msg, line);
    const prefix = `[JS ERROR] ${lineMsg}`;
    if (env.Toasts && typeof env.Toasts.error === "function") {
      env.Toasts.error(prefix, { duration: 0, closable: true });
      return;
    }
    if (env.Repl && typeof env.Repl.appendBuffered === "function") {
      env.Repl.appendBuffered(prefix, "error");
      return;
    }
    const doc = env.document;
    if (doc && typeof doc.getElementById === "function") {
      const o = doc.getElementById("output");
      if (o) {
        o.textContent = (o.textContent ? `${o.textContent}
` : "") + prefix;
      }
    }
  }
  function installGlobalErrorHook(env = globalThis) {
    env.onerror = function onerror(msg, _url, line) {
      reportJsError(msg, line, env);
    };
  }
  installGlobalErrorHook();
})();
