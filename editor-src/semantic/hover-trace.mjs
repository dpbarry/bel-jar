export function createHoverTrace(enabled) {
  if (!enabled) return null;
  const events = [];
  return {
    events,
    record(phase, fields) {
      events.push({ t: Date.now(), phase, ...fields });
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[semantic-hover]', phase, fields);
      }
    },
  };
}

export function hoverTraceEnabled(options = {}) {
  if (options.trace === true) return true;
  if (options.trace === false) return false;
  const g = typeof globalThis !== 'undefined' ? globalThis : null;
  return !!(g && g.BelJarSemanticTrace);
}
