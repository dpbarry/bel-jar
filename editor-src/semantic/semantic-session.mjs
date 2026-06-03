/**
 * Singular Beluga IDE Session Manager
 * 
 * Manages ONE warm Beluga session across all IDE queries, eliminating the
 * fingerprint thrashing that caused constant full-file reloads. Loads once
 * per document fingerprint and reuses the session for all subsequent hover,
 * diagnostics, and elaboration queries.
 */

export function createSemanticSession(belugaClient) {
  let loadedFingerprint = null;
  let loadPromise = null;
  let lastCode = '';

  /**
   * Ensure the session has the current code loaded. Returns immediately if
   * already loaded (fingerprint match); otherwise dispatches loadChecker and
   * commits the new fingerprint on success.
   */
  async function ensureLoaded(code) {
    const requestCode = String(code != null ? code : '');
    const fp = belugaClient.fingerprint(requestCode);
    
    // Already loaded — no round-trip
    if (loadedFingerprint === fp) {
      return { ok: true, cached: true, fingerprint: fp };
    }

    // Load in progress — await it
    if (loadPromise) {
      return loadPromise;
    }

    // Dispatch fresh load
    lastCode = requestCode;
    loadPromise = belugaClient.loadChecker(requestCode)
      .then((output) => {
        loadedFingerprint = fp;
        loadPromise = null;
        return {
          ok: true,
          cached: false,
          fingerprint: fp,
          output,
          diagnostics: parseDiagnostics(output),
        };
      })
      .catch((error) => {
        loadPromise = null;
        loadedFingerprint = null;
        throw error;
      });

    return loadPromise;
  }

  /**
   * Batch elaborate a declaration range. Falls back to per-position ideTypeAtJson
   * if ideElaborateDecl is not implemented in the OCaml shim.
   */
  function positionsSpec(positions) {
    if (!positions || !positions.length) return '';
    return positions
      .map((p) => `${p.name}|${p.line}|${p.col}`)
      .join(';');
  }

  async function elaborateDecl(code, startLine, endLine, positions = []) {
    await ensureLoaded(code);

    try {
      const spec = positionsSpec(positions);
      const rawResult = await belugaClient.ideElaborate(lastCode, startLine, endLine, spec);
      const result = JSON.parse(rawResult);

      // OCaml stub returns ok:false with fallback hint
      if (result.ok === false && result.fallback === 'use-ideTypeAtJson') {
        return fallbackElaborate(code, positions);
      }

      if (result.ok === false) {
        return {
          ok: false,
          reason: result.reason || 'elaboration-failed',
          implicits: [],
          metavars: [],
          diagnostics: [],
        };
      }

      return {
        ok: true,
        implicits: result.implicits || [],
        metavars: result.metavars || [],
        diagnostics: result.diagnostics || [],
      };
    } catch (error) {
      // Parse error or network error — fall back
      return fallbackElaborate(code, positions);
    }
  }

  /**
   * Fallback: use existing ideTypeAtJson for each position. Still faster than
   * the old pattern because the session is already warm (no reload thrashing).
   */
  async function elaboratePositions(code, positions) {
    await ensureLoaded(code);

    const implicits = (await Promise.all(
      (positions || []).map(async (pos) => {
        try {
          const rawType = await belugaClient.ideType(lastCode, pos.line, pos.col);
          const typeResult = JSON.parse(rawType);
          if (typeResult.ok && typeResult.type) {
            return {
              name: pos.name,
              line: pos.line,
              col: pos.col,
              position: pos.position,
              type: typeResult.type,
            };
          }
        } catch (_) { /* skip failed site */ }
        return null;
      }),
    )).filter(Boolean);

    return {
      ok: implicits.length > 0,
      implicits,
      metavars: [],
      diagnostics: [],
      fallback: true,
    };
  }

  async function fallbackElaborate(code, positions) {
    return elaboratePositions(code, positions);
  }

  /**
   * Point query at a specific position. Ensures the session is loaded first.
   */
  async function typeAt(code, line, col) {
    await ensureLoaded(code);
    const rawResult = await belugaClient.ideType(lastCode, line, col);
    
    try {
      return JSON.parse(rawResult);
    } catch (e) {
      return { ok: false, reason: 'parse-error', raw: rawResult };
    }
  }

  /**
   * Invalidate the current session. Next query will trigger a fresh load.
   */
  function invalidate() {
    loadedFingerprint = null;
    loadPromise = null;
    lastCode = '';
  }

  /**
   * Get the currently loaded fingerprint (or null if no session loaded).
   */
  function getFingerprint() {
    return loadedFingerprint;
  }

  /**
   * Parse Beluga diagnostics from raw output text. Extracts error/warning lines.
   */
  function parseDiagnostics(output) {
    if (!output || typeof output !== 'string') return [];
    
    const lines = output.split('\n');
    const diagnostics = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Error:') || trimmed.startsWith('Warning:')) {
        diagnostics.push({
          severity: trimmed.startsWith('Error:') ? 'error' : 'warning',
          message: trimmed,
        });
      }
    }
    
    return diagnostics;
  }

  return {
    ensureLoaded,
    elaborateDecl,
    elaboratePositions,
    typeAt,
    invalidate,
    getFingerprint,
  };
}
