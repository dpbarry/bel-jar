/**
 * Placing a certified proof into the file — commit/place verify path.
 */
const global = globalThis;
function createCommit(deps) {
  var E = deps.E;
  var toast = deps.toast;
  var liveEditorFileId = deps.liveEditorFileId;
  var prepareForHole = deps.prepareForHole;

  function defaultCommitState() {
    return {
      status: 'idle', phase: null, detail: '', detailRaw: '',
      usedFullCheck: false, canRetry: false, dismissed: false,
    };
  }

  function commitFailureUserMessage() {
    return 'The proof no longer fits this file. Symbols or context may have changed since it was solved.';
  }

  function firstCheckerErrorLine(output) {
    var s = String(output || '');
    var m = /File[^\n]*line\s+\d+[^\n]*:\s*([^\n]+)/i.exec(s);
    if (m) return m[1].trim();
    var lines = s.split('\n');
    for (var i = 0; i < lines.length; i += 1) {
      var t = lines[i].trim();
      if (t && /error/i.test(t)) return t;
    }
    for (var j = 0; j < lines.length; j += 1) {
      var u = lines[j].trim();
      if (u) return u.length > 120 ? u.slice(0, 117) + '…' : u;
    }
    return 'The proof did not re-check.';
  }

  function totalityPrefixFromDecl(declText) {
    var m = /=\s*(\/\s*total[^/]*\/\s*)/.exec(String(declText || ''));
    return m ? m[1].trim() : '';
  }

  var COMMIT_CHECK_TIMEOUT_MS = 45000;
  var COMMIT_NAV_TIMEOUT_MS = 8000;

  function withCommitTimeout(promise, ms, message) {
    return new Promise(function (resolve, reject) {
      var timer = global.setTimeout(function () {
        reject(new Error(message || 'Timed out.'));
      }, ms);
      Promise.resolve(promise).then(function (v) {
        global.clearTimeout(timer);
        resolve(v);
      }).catch(function (e) {
        global.clearTimeout(timer);
        reject(e);
      });
    });
  }

  function pendingCommitAfterNav(source) {
    var self = this;
    var fileId = this.fileId || (this.anchor && this.anchor.fileId);
    this.clearPendingCommitNav();

    var view = this.resolveView();
    var api = global.CurrentEditor;
    var eng = api && typeof api.getSemanticEngine === 'function' ? api.getSemanticEngine() : null;
    var hit = this.findLiveHit(view, eng) || (this.compromise && this.compromise.liveHit);

    if (!fileId || !hit) {
      toast('Open the file to place the proof.', 'error');
      this.resetCommitForRetry();
      return Promise.resolve(false);
    }

    // File already mounted — skip the nav wait (openFileAt notifies synchronously
    // before a late listener would see it).
    if (liveEditorFileId() === fileId) {
      return this.verifyAndCommit(source, { skipBeginUi: true });
    }

    this.pendingCommitSource = source;
    var onActive = function () {
      if (!self.pendingCommitSource) return;
      var src = self.pendingCommitSource;
      self.clearPendingCommitNav();
      self.verifyAndCommit(src, { skipBeginUi: true });
    };
    self._pendingCommitNavListener = onActive;
    global.addEventListener('beljar:active-editor-view', onActive);

    global.dispatchEvent(new CustomEvent('beljar:open-file-at', {
      detail: {
        fileId: fileId,
        from: hit.from,
        to: hit.to,
        line: hit.hole && hit.hole.line,
        col: hit.hole && hit.hole.col,
      },
    }));

    if (liveEditorFileId() === fileId && self.pendingCommitSource) {
      onActive();
      return Promise.resolve(false);
    }

    self._pendingCommitNavTimer = global.setTimeout(function () {
      if (!self.pendingCommitSource) return;
      self.clearPendingCommitNav();
      self.resetCommitForRetry();
      toast('Could not open the file to place the proof.', 'error');
    }, COMMIT_NAV_TIMEOUT_MS);

    return Promise.resolve(false);
  }

  function verifyAndCommit(source, opts) {
    opts = opts || {};
    var ed = E();
    var self = this;
    var client = global.BelugaClient;
    if (!ed) return Promise.resolve(false);
    if (!opts.skipBeginUi) this.beginCommitUi('verify');

    this.probeAnchor();
    if (this.compromise && this.compromise.level === 'block') {
      this.finishCommitFailure(this.compromise.detail || 'The hole changed — restart to continue.', false);
      return Promise.resolve(false);
    }

    var fileId = this.fileId || (this.anchor && this.anchor.fileId);
    var liveId = liveEditorFileId();
    if (fileId && liveId && liveId !== fileId) {
      return this.pendingCommitAfterNav(source);
    }

    var view = this.resolveView();
    if (!view) {
      this.finishCommitFailure('Open the file to place the proof.', false);
      return Promise.resolve(false);
    }

    var api = global.CurrentEditor;
    var eng = api && typeof api.getSemanticEngine === 'function' ? api.getSemanticEngine() : null;
    var hit = this.findLiveHit(view, eng);
    if (!hit) {
      this.finishCommitFailure('The proof hole is no longer there.', false);
      return Promise.resolve(false);
    }

    var prep = prepareForHole(view, hit);
    if (!prep) {
      this.resetCommitForRetry();
      return Promise.resolve(false);
    }
    this.prep = prep;
    this.declFrom = prep.span.from;
    this.declTo = prep.span.to;

    var range = ed.declRangeWithSemicolon
      ? ed.declRangeWithSemicolon(view.state.doc, prep.span.from, prep.span.to)
      : { from: prep.span.from, to: prep.span.to };
    var declFrom = range.from;
    var declTo = range.to;
    var docText = view.state.doc.toString();
    var declSlice = view.state.doc.sliceString(declFrom, declTo);
    var decl = ed.parseDecl(declSlice);
    if (!decl) {
      this.finishCommitFailure('Lost the declaration to commit into.', false);
      return Promise.resolve(false);
    }
    var body = String(source).replace(/;\s*$/, '').trimEnd();
    var tot = totalityPrefixFromDecl(declSlice);
    if (tot && !/\/\s*total\b/.test(body)) body = tot + '\n' + body;
    var hadSemi = /;\s*$/.test(declSlice);
    var newDecl = ed.committedMemberText
      ? ed.committedMemberText(decl, body, hadSemi)
      : 'rec ' + decl.name + ' : ' + decl.type + ' =\n' + body + (hadSemi ? '\n;' : '');

    var codes = ed.buildCommitCheckCodes
      ? ed.buildCommitCheckCodes(prep.assembledCode, prep, newDecl)
      : {
        patched: prep.assembledCode != null
          ? prep.assembledCode.slice(0, prep.assembledDeclFrom) + newDecl + prep.assembledCode.slice(prep.assembledDeclTo)
          : docText.slice(0, declFrom) + newDecl + docText.slice(declTo),
        orchestration: prep.assembledCode != null
          ? prep.assembledCode.slice(0, prep.assembledDeclFrom) + newDecl + prep.assembledCode.slice(prep.assembledDeclTo)
          : docText.slice(0, declFrom) + newDecl + docText.slice(declTo),
      };
    var needsOrchestration = ed.countSiblingHoledDecls
      ? ed.countSiblingHoledDecls(docText, decl.name) > 0
      : (ed.needsFullCommitCheck
        ? ed.needsFullCommitCheck({ docText: docText, declName: decl.name })
        : false);

    function endProver() {
      if (client && client.endProverSession) client.endProverSession();
    }

    function commitNow() {
      ed.commitProof(view, declFrom, declTo, source);
      self.finishCommitSuccess();
      return true;
    }

    function runOrchestrationCheck() {
      var chain = client && client.beginProverSession
        ? client.beginProverSession()
        : Promise.resolve();
      return chain.then(function () {
        if (client.loadProverChecker && codes.orchestration) {
          return client.loadProverChecker(codes.orchestration);
        }
      }).then(function () {
        if (client.checkResultForProver) {
          return client.checkResultForProver(codes.orchestration);
        }
        return client.checkResult(codes.orchestration);
      }).then(function (res) {
        return {
          ok: !!(res && res.ok),
          output: res && res.output,
          stage: 'orchestration',
        };
      });
    }

    if (!needsOrchestration) {
      return Promise.resolve(commitNow());
    }

    if (!client || (typeof client.checkResult !== 'function' && typeof client.checkResultForProver !== 'function')) {
      return Promise.resolve(commitNow());
    }

    return withCommitTimeout(
      runOrchestrationCheck(),
      COMMIT_CHECK_TIMEOUT_MS,
      'Proof verification timed out.'
    ).then(function (result) {
      endProver();
      if (result && result.ok) return commitNow();
      self.finishCommitFailure(firstCheckerErrorLine(result && result.output), true, { kind: 'checker' });
      return false;
    }).catch(function (err) {
      endProver();
      if (client.isCancelledError && client.isCancelledError(err)) {
        self.resetCommitForRetry();
        return false;
      }
      self.finishCommitFailure(err && err.message ? err.message : 'Checker error.', true, { kind: 'checker' });
      return false;
    });
  }

  return {
    defaultCommitState: defaultCommitState,
    commitFailureUserMessage: commitFailureUserMessage,
    firstCheckerErrorLine: firstCheckerErrorLine,
    totalityPrefixFromDecl: totalityPrefixFromDecl,
    withCommitTimeout: withCommitTimeout,
    COMMIT_CHECK_TIMEOUT_MS: COMMIT_CHECK_TIMEOUT_MS,
    COMMIT_NAV_TIMEOUT_MS: COMMIT_NAV_TIMEOUT_MS,
    pendingCommitAfterNav: pendingCommitAfterNav,
    verifyAndCommit: verifyAndCommit,
  };
}

export { createCommit as create };
