// HarpoonTree — proof-state tree for the Harpoon lab.
//
// Path: certified derivation, rejected alternatives collapsed to a quiet "+N"
// count. Move space: the same tree with rejected candidates expanded as
// faded ghost branches beside the accepted continuation (detail in rail).
(function (global) {
  'use strict';

  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  function trunc(s, max) {
    s = String(s == null ? '' : s);
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  function shortPattern(box) {
    var m = /(?:\|-|⊢)\s*([\s\S]*?)\]?$/.exec(norm(box));
    return m ? m[1].replace(/\]$/, '').trim() : norm(box);
  }

  function shortGoal(goal) {
    return trunc(shortPattern(goal), 28);
  }

  function binderChip(ctx, meta) {
    var c = (ctx || []).length;
    var m = (meta || []).length;
    if (!c && !m) return '';
    var parts = [];
    if (c) parts.push(c + 'Γ');
    if (m) parts.push(m + 'Δ');
    return parts.join(' · ');
  }

  function moveLabel(step) {
    var meta = step.meta || {};
    switch (step.move) {
      case 'split': return 'case ' + (meta.scrutinee || '?');
      case 'synth': return meta.refutation ? 'refute'
        : 'chain ×' + ((meta.chain || []).length || '');
      case 'recurse': return 'recurse';
      case 'invert': return 'invert';
      case 'lemma': return trunc(meta.callee || 'lemma', 12);
      case 'fill': return 'fill';
      case 'impossible': return 'impossible';
      case 'intro': return 'intro';
      default: return step.move;
    }
  }

  function effectBadge(st) {
    if (!st) return '';
    if (st.move === 'split' && st.meta && st.meta.armPatterns && st.meta.armPatterns.length) {
      return String(st.meta.armPatterns.length);
    }
    return '';
  }

  function altCount(frontier) {
    if (!frontier || !frontier.length) return 0;
    var n = 0;
    for (var i = 0; i < frontier.length; i += 1) {
      if (frontier[i].verdict !== 'accepted') n += 1;
    }
    return n;
  }

  var SIZE = {
    move: { w: 104, h: 32, label: 13 },
    theorem: { w: 112, h: 34, label: 14 },
    branch: { h: 26, label: 16, minW: 88, maxW: 148 },
    stuck: { w: 88, h: 32, label: 10 },
    ghost: { w: 82, h: 25, label: 12 },
  };

  function buildModel(opts) {
    var steps = opts.steps || [];
    var trace = opts.trace || null;
    var stuck = opts.stuck || null;
    var snap = opts.theoremSnapshot || null;
    var nextId = 1;
    function mk(type, label, extra) {
      var n = { id: nextId++, type: type, label: label, children: [] };
      if (extra) for (var k in extra) n[k] = extra[k];
      return n;
    }
    var root = mk('theorem', opts.name || 'theorem', {
      sub: shortGoal(opts.goalType || ''),
      goalType: opts.goalType || '',
      theoremSnapshot: snap,
      premiseCount: snap && snap.premiseCount,
    });

    var tails = { '': root };
    var armByPattern = {};

    var advancedTrace = [];
    var stuckTrace = null;
    if (trace) {
      for (var t = 0; t < trace.length; t += 1) {
        if (trace[t].advanced) advancedTrace.push(trace[t]);
        else stuckTrace = trace[t];
      }
    }

    for (var i = 0; i < steps.length; i += 1) {
      var st = steps[i];
      var key = st.branch ? norm(st.branch) : '';
      var container = key && armByPattern[key] ? key : '';
      var tail = tails[container] || root;
      var entry = advancedTrace[i];
      var holeCtx = st.holeCtx || (entry && entry.holeCtx) || [];
      var holeMeta = st.holeMeta || (entry && entry.holeMeta) || [];
      var frontier = (entry && entry.tried) ? entry.tried.slice() : [];
      var node = mk('move', moveLabel(st), {
        kind: st.move,
        step: st,
        sub: shortGoal(st.goal || ''),
        binderChip: binderChip(holeCtx, holeMeta),
        closed: st.status === 'solved',
        open: st.status === 'open',
        effectBadge: effectBadge(st),
        frontier: frontier,
        altCount: altCount(frontier),
        state: { goal: st.goal || '', ctx: holeCtx, meta: holeMeta },
        focus: st.focus || (entry && entry.focus) || null,
        traceEntry: entry || null,
      });
      node.ghosts = frontier.filter(function (v) { return v.verdict !== 'accepted'; });
      tail.children.push(node);
      tails[container] = node;
      if (st.move === 'split' && st.meta && st.meta.armPatterns && st.meta.armPatterns.length) {
        for (var a = 0; a < st.meta.armPatterns.length; a += 1) {
          var pat = st.meta.armPatterns[a];
          var armNode = mk('arm', shortPattern(pat), { pattern: pat });
          node.children.push(armNode);
          var akey = norm(pat);
          armByPattern[akey] = armNode;
          tails[akey] = armNode;
        }
        tails[container] = node;
      }
    }

    if (stuck && stuck.reason && stuck.reason !== 'cancelled' && stuck.reason !== 'stopped') {
      var skey = stuckTrace && stuckTrace.branch ? norm(stuckTrace.branch) : '';
      var stail = tails[skey && armByPattern[skey] ? skey : ''] || root;
      var stuckCtx = (stuckTrace && stuckTrace.holeCtx) || [];
      var stuckMeta = (stuckTrace && stuckTrace.holeMeta) || [];
      stail.children.push(mk('stuck', 'stuck', {
        kind: 'stuck',
        sub: shortGoal(stuck.goal || ''),
        goal: stuck.goal || '',
        hole: stuck.hole || (stuckTrace && stuckTrace.hole) || null,
        tried: (stuckTrace && stuckTrace.tried) || [],
        frontier: (stuckTrace && stuckTrace.tried) || [],
        state: { goal: stuck.goal || '', ctx: stuckCtx, meta: stuckMeta },
        focus: (stuckTrace && stuckTrace.focus) || null,
      }));
    }
    if (opts.complete) {
      (function markClosed(n) {
        if (!n.children.length && n.type === 'move') n.closed = true;
        for (var c = 0; c < n.children.length; c += 1) markClosed(n.children[c]);
      }(root));
    }
    (function attachParents(n, parent) {
      n.parent = parent;
      for (var ci = 0; ci < n.children.length; ci += 1) attachParents(n.children[ci], n);
    }(root, null));
    return root;
  }

  function breadcrumb(n) {
    var parts = [];
    var cur = n;
    while (cur) {
      if (cur.type === 'theorem') parts.unshift(cur.label || 'theorem');
      else if (cur.type === 'arm') parts.unshift(trunc(cur.pattern || cur.label, 20));
      else if (cur.type === 'move') parts.unshift(cur.label);
      cur = cur.parent;
    }
    return parts;
  }

  function findById(root, id) {
    if (!id) return null;
    var nodes = flatten(root);
    for (var i = 0; i < nodes.length; i += 1) {
      if (nodes[i].id === id) return nodes[i];
    }
    return null;
  }

  function nodeW(n) {
    if (n.type === 'arm') {
      var len = (n.label || '').length;
      return Math.max(SIZE.branch.minW, Math.min(SIZE.branch.maxW, 24 + len * 5.5));
    }
    if (n.type === 'theorem') return SIZE.theorem.w;
    if (n.type === 'stuck') return SIZE.stuck.w;
    if (n.type === 'ghost') return SIZE.ghost.w;
    return SIZE.move.w;
  }

  function nodeH(n) {
    if (n.type === 'arm') return SIZE.branch.h;
    if (n.type === 'theorem') return SIZE.theorem.h;
    if (n.type === 'ghost') return SIZE.ghost.h;
    return SIZE.move.h;
  }

  function measure(n) {
    n.w = nodeW(n);
    n.h = nodeH(n);
    if (!n.children.length) { n.subW = n.w; return n.subW; }
    var sum = 0;
    var GAP = 22;
    for (var i = 0; i < n.children.length; i += 1) {
      sum += measure(n.children[i]);
      if (i) sum += GAP;
    }
    n.subW = Math.max(n.w, sum);
    return n.subW;
  }

  // One uniform row gap for every level. A shorter SPLIT_ROW used to apply
  // between a split move and its arms — since arm chips are shorter (h=26)
  // than move chips (h=32), that shrunk gap made the connector between a
  // split and its arms visibly shorter than every other connector in the
  // tree, reading as squashed.
  var ROW = 60;

  function place(n, cx, y) {
    n.x = cx;
    n.y = y;
    if (!n.children.length) return;
    var gap = ROW;
    if (n.children.length === 1) {
      place(n.children[0], cx, y + gap);
      return;
    }
    var GAP = 22;
    var total = 0;
    for (var i = 0; i < n.children.length; i += 1) {
      total += n.children[i].subW + (i ? GAP : 0);
    }
    var x = cx - total / 2;
    for (var j = 0; j < n.children.length; j += 1) {
      var c = n.children[j];
      place(c, x + c.subW / 2, y + gap);
      x += c.subW + GAP;
    }
  }

  // Move-space mode: turn each move's rejected frontier (node.ghosts, set by
  // buildModel) into real sibling placement-nodes beside the accepted
  // continuation, so measure/place lays them out crossing-free as faded
  // "roads not taken" branches. Mutates a freshly-built root (safe: callers
  // rebuild the model on every draw).
  function expandGhosts(root) {
    (function walk(n) {
      if (n.type === 'move' && n.ghosts && n.ghosts.length) {
        for (var i = 0; i < n.ghosts.length; i += 1) {
          var gh = n.ghosts[i];
          n.children.push({
            id: 'ghost-' + n.id + '-' + i,
            type: 'ghost',
            kind: gh.kind,
            label: trunc(gh.head || gh.kind || 'candidate', 12),
            ghost: gh,
            children: [],
          });
        }
      }
      for (var c = 0; c < n.children.length; c += 1) walk(n.children[c]);
    }(root));
  }

  function flatten(root) {
    var out = [];
    (function walk(n, parent, depth) {
      n.parent = parent;
      n.depth = depth;
      out.push(n);
      for (var i = 0; i < n.children.length; i += 1) walk(n.children[i], n, depth + 1);
    }(root, null, 0));
    return out;
  }

  var SVGNS = 'http://www.w3.org/2000/svg';
  function el(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // Straight orthogonal routing (dep-graph approach, tree-adapted): a shared
  // horizontal bus halfway between parent and child rows. A single child
  // lined up under its parent collapses to one straight vertical segment;
  // siblings sharing a row share the same bus, so a split's arms all bend
  // off one clean horizontal line — never a diagonal, never a curve.
  function edgePath(a, b) {
    var y0 = a.y + a.h / 2;
    var y1 = b.y - b.h / 2;
    if (Math.abs(a.x - b.x) < 0.5) {
      return 'M' + a.x + ',' + y0 + ' L' + b.x + ',' + y1;
    }
    var busY = (y0 + y1) / 2;
    return 'M' + a.x + ',' + y0
      + ' L' + a.x + ',' + busY
      + ' L' + b.x + ',' + busY
      + ' L' + b.x + ',' + y1;
  }

  function labelMax(n) {
    if (n.type === 'arm') return SIZE.branch.label;
    if (n.type === 'theorem') return SIZE.theorem.label;
    if (n.type === 'stuck') return SIZE.stuck.label;
    if (n.type === 'ghost') return SIZE.ghost.label;
    return SIZE.move.label;
  }

  function renderNodeBody(g, n, pw, h, clipId) {
    var isArm = n.type === 'arm';
    var rx = isArm ? 6 : 8;
    g.appendChild(el('rect', {
      x: -pw / 2, y: -h / 2, width: pw, height: h, rx: rx,
      class: isArm ? 'hpt-shape hpt-shape--branch' : 'hpt-shape',
    }));
    var label = trunc(n.label || '', labelMax(n));
    var text = el('text', {
      y: isArm ? 4 : 4,
      class: isArm ? 'hpt-text hpt-text--branch' : 'hpt-text',
      'clip-path': 'url(#' + clipId + ')',
    });
    text.textContent = label;
    g.appendChild(text);

    if (n.closed) {
      g.appendChild(el('circle', {
        cx: pw / 2 - 9, cy: -h / 2 + 9, r: 3, class: 'hpt-status hpt-status--done',
      }));
    } else if (n.open && n.type === 'move') {
      g.appendChild(el('circle', {
        cx: pw / 2 - 9, cy: -h / 2 + 9, r: 3, class: 'hpt-status hpt-status--open',
      }));
    }
    if (n.effectBadge && n.type === 'move') {
      var tag = el('text', {
        x: pw / 2 - 9, y: h / 2 - 6, class: 'hpt-tag', 'text-anchor': 'end',
      });
      tag.textContent = n.effectBadge;
      g.appendChild(tag);
    }
  }

  function render(container, root, opts) {
    opts = opts || {};
    var mode = opts.mode || 'path';
    if (mode === 'space') expandGhosts(root);
    var nodes = flatten(root);
    measure(root);
    place(root, root.subW / 2 + 24, 36);

    var minX = Infinity; var maxX = -Infinity; var maxY = 0;
    nodes.forEach(function (n) {
      minX = Math.min(minX, n.x - n.w / 2 - 8);
      maxX = Math.max(maxX, n.x + n.w / 2 + 8);
      maxY = Math.max(maxY, n.y + n.h / 2 + 8);
    });
    var pad = 28;
    var contentW = Math.max(300, maxX - minX + pad * 2);
    var H = maxY + pad * 2;
    var cssH = Math.min(520, Math.max(200, H * 0.85));

    // A wide move-space fan-out must not be squeezed down to fit one screen —
    // that forced the whole diagram to a height-driven scale so extreme it
    // read as blank (every node shrunk to an illegible sliver at the top).
    // Fit height only; derive the initial viewBox WIDTH from the host's
    // actual pixel width at that same scale. A tree that fits, fits exactly
    // as before; a tree wider than the panel simply overflows sideways,
    // explorable with the existing pan/zoom — never shrunk.
    var scale = H > 0 ? cssH / H : 1;
    var hostW = container.clientWidth || 640;
    var viewW = scale > 0 ? hostW / scale : contentW;
    var defaultW = Math.min(viewW, contentW);
    if (defaultW < 300) defaultW = Math.min(300, contentW);
    // Always center the viewBox window on the content's own midpoint — not
    // just when overflowing. Anchoring at (minX - pad) whenever defaultW had
    // slack (e.g. the 300px floor on a lone root node) dumped all the extra
    // space to the right, so a small tree rendered off-center to the left.
    var defaultX = (minX + maxX) / 2 - defaultW / 2;

    // Once the user has manually panned/zoomed, every subsequent redraw (each
    // new step settling) must keep showing THAT view, not snap back to the
    // auto-fit default — otherwise every proof-progress update yanks the
    // view out from under the user. `opts.initialView` carries the last vb
    // forward across redraws; only the very first render (or an explicit
    // reset) computes the default.
    var vb = opts.initialView
      ? { x: opts.initialView.x, y: opts.initialView.y, w: opts.initialView.w, h: opts.initialView.h }
      : { x: defaultX, y: 0, w: defaultW, h: H };

    var svg = el('svg', {
      class: 'hpt-svg',
      viewBox: vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h,
      preserveAspectRatio: 'xMidYMin meet',
    });
    svg.style.width = '100%';
    svg.style.height = cssH + 'px';

    var defs = el('defs');
    nodes.forEach(function (n) {
      var clipId = 'hpt-clip-' + n.id;
      n._clipId = clipId;
      var pw = n.w;
      var h = n.h;
      var cp = el('clipPath', { id: clipId });
      var inset = n.type === 'arm' ? 6 : 12;
      cp.appendChild(el('rect', {
        x: -pw / 2 + inset, y: -h / 2 + 2, width: pw - inset * 2, height: h - 4, rx: 4,
      }));
      defs.appendChild(cp);
    });
    svg.appendChild(defs);

    var scene = el('g', { class: 'hpt-scene' });
    svg.appendChild(scene);

    nodes.forEach(function (n) {
      if (!n.parent) return;
      scene.appendChild(el('path', {
        d: edgePath(n.parent, n),
        class: 'hpt-edge'
          + (n.type === 'arm' ? ' hpt-edge--branch' : '')
          + (n.type === 'ghost' ? ' hpt-edge--ghost' : ''),
      }));
    });

    var selectedG = null;
    var selectedId = opts.selectedId || null;

    function select(n, g) {
      if (selectedG) selectedG.classList.remove('is-selected');
      selectedG = g;
      if (g) g.classList.add('is-selected');
      if (opts.onSelect) opts.onSelect(n);
    }

    nodes.forEach(function (n, idx) {
      var pw = n.w;
      var h = n.h;
      var g = el('g', {
        class: 'hpt-node hpt-node--' + (n.kind || n.type) + (n.type === 'ghost' ? ' is-ghost' : ''),
        transform: 'translate(' + n.x + ',' + n.y + ')',
        'data-node-id': String(n.id),
        tabindex: '0',
        role: 'button',
      });
      g.style.transitionDelay = Math.min(idx * 20, 600) + 'ms';

      renderNodeBody(g, n, pw, h, n._clipId);

      // Path mode never shows ghost branches — just a quiet, neutral count of
      // the roads not taken (no red, no alarm). Move-space mode shows the
      // ghosts themselves instead, so this chip only appears in path mode.
      if (mode !== 'space' && n.altCount > 0 && n.type === 'move') {
        var bw = 20;
        var bh = 13;
        var bx = pw / 2 - bw * 0.55;
        var by = h / 2 - bh * 0.55;
        var chip = el('g', { class: 'hpt-altcount', transform: 'translate(' + bx + ',' + by + ')' });
        chip.appendChild(el('rect', { x: 0, y: 0, width: bw, height: bh, rx: bh / 2 }));
        var ct = el('text', { x: bw / 2, y: bh - 4, class: 'hpt-altcount-text' });
        ct.textContent = '+' + n.altCount;
        chip.appendChild(ct);
        g.appendChild(chip);
      }

      var title = document.createElementNS(SVGNS, 'title');
      var tip;
      if (n.type === 'ghost' && n.ghost) {
        tip = (n.ghost.head || n.ghost.kind || 'candidate') + '\n' + (n.ghost.reason || 'not taken');
      } else {
        tip = (n.step && n.step.rationale) || n.label;
        if (n.sub) tip += '\n' + n.sub;
        if (n.binderChip) tip += '\n' + n.binderChip;
        if (mode !== 'space' && n.altCount) tip += '\n' + n.altCount + ' other candidate(s)';
      }
      title.textContent = tip;
      g.appendChild(title);

      g.addEventListener('click', function () { select(n, g); });
      g.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(n, g); }
      });
      scene.appendChild(g);
      if (selectedId && n.id === selectedId) select(n, g);
    });

    function applyVB() {
      svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
      if (opts.onViewChange) opts.onViewChange({ x: vb.x, y: vb.y, w: vb.w, h: vb.h });
    }
    svg.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var k = ev.deltaY > 0 ? 1.1 : 0.91;
      var pt = svg.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      var ctm = svg.getScreenCTM();
      if (!ctm) return;
      var p = pt.matrixTransform(ctm.inverse());
      vb.x = p.x - (p.x - vb.x) * k;
      vb.y = p.y - (p.y - vb.y) * k;
      vb.w *= k; vb.h *= k;
      applyVB();
    }, { passive: false });
    var PAN_THRESHOLD = 4;
    var drag = null;
    svg.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      drag = { x: ev.clientX, y: ev.clientY, vx: vb.x, vy: vb.y, id: ev.pointerId, active: false };
    });
    svg.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      var dx = ev.clientX - drag.x;
      var dy = ev.clientY - drag.y;
      if (!drag.active) {
        if (Math.abs(dx) < PAN_THRESHOLD && Math.abs(dy) < PAN_THRESHOLD) return;
        drag.active = true;
        try { svg.setPointerCapture(drag.id); } catch (_) { /* ignore */ }
        svg.classList.add('is-panning');
      }
      var scale = vb.w / svg.clientWidth;
      vb.x = drag.vx - dx * scale;
      vb.y = drag.vy - dy * scale;
      applyVB();
    });
    function endPan() {
      if (drag && drag.active) { try { svg.releasePointerCapture(drag.id); } catch (_) { /* ignore */ } }
      drag = null;
      svg.classList.remove('is-panning');
    }
    svg.addEventListener('pointerup', endPan);
    svg.addEventListener('pointercancel', endPan);

    container.textContent = '';
    container.appendChild(svg);
    if (opts.instant) {
      svg.querySelectorAll('.hpt-node').forEach(function (g2) { g2.style.transitionDelay = '0ms'; });
      var pills = svg.querySelectorAll('.hpt-node');
      if (pills.length) pills[pills.length - 1].style.transitionDelay = '30ms';
      svg.classList.add('is-revealed');
    } else {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { svg.classList.add('is-revealed'); });
      });
    }
    return svg;
  }

  global.HarpoonTree = {
    buildModel: buildModel,
    render: render,
    breadcrumb: breadcrumb,
    findById: findById,
  };
}(typeof window !== 'undefined' ? window : globalThis));
