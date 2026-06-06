export function createSemanticSession(belugaClient) {
  let loadedFingerprint = null;
  let loadPromise = null;
  let lastCode = '';

  async function ensureLoaded(code) {
    const requestCode = String(code != null ? code : '');
    const fp = belugaClient.fingerprint(requestCode);

    if (loadedFingerprint === fp) {
      return { ok: true, cached: true, fingerprint: fp };
    }

    if (loadPromise) {
      return loadPromise;
    }

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
      return fallbackElaborate(code, positions);
    }
  }

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
        } catch (_) {}
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

  async function typeAt(code, line, col) {
    await ensureLoaded(code);
    const rawResult = await belugaClient.ideType(lastCode, line, col);

    try {
      return JSON.parse(rawResult);
    } catch (e) {
      return { ok: false, reason: 'parse-error', raw: rawResult };
    }
  }

  async function ideDeclType(code, name) {
    await ensureLoaded(code);
    try {
      return JSON.parse(await belugaClient.ideDeclType(lastCode, name));
    } catch (e) {
      return { ok: false, reason: 'parse-error' };
    }
  }

  function invalidate() {
    loadedFingerprint = null;
    loadPromise = null;
    lastCode = '';
  }

  function getFingerprint() {
    return loadedFingerprint;
  }

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
    ideDeclType,
    invalidate,
    getFingerprint,
  };
}
