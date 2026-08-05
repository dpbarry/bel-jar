(() => {
  // js/harpoon/harpoon-icon.mjs
  var global = globalThis;
  var MARKUP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="5" r="1.6"/><path d="M6.2 6.2 16.5 16.5"/><path d="M20.5 20.5 19.5 12 16.5 16.5 12 19.5Z"/></svg>';
  function appendGlyph(parent, className) {
    var span = document.createElement("span");
    if (className) span.className = className;
    span.innerHTML = MARKUP;
    parent.appendChild(span);
    return span;
  }
  global.HarpoonIcon = { markup: MARKUP, appendGlyph };
  global.BelJarHarpoonIcon = global.HarpoonIcon;

  // js/harpoon/harpoon-glyphs.mjs
  var global2 = globalThis;
  function fallbackNormalize(text) {
    return String(text == null ? "" : text).replace(/\|-#/g, "\u22A2#").replace(/\|-/g, "\u22A2").replace(/=>/g, "\u21D2").replace(/->/g, "\u2192").replace(/([[({])[ \t]+/g, "$1").replace(/[ \t]+([\])}])/g, "$1");
  }
  function displayBeluga(text) {
    var ed = global2.BelEditor || null;
    if (ed && typeof ed.normalizeType === "function") return ed.normalizeType(text);
    return fallbackNormalize(text);
  }
  function compactTypeLabel(box) {
    var s = String(box == null ? "" : box).replace(/\s+/g, " ").trim();
    var m = /(?:\|-|⊢)\s*([\s\S]*?)\]?$/.exec(s);
    if (m) return displayBeluga("|- " + m[1].replace(/\]$/, "").trim());
    return displayBeluga(s);
  }
  function looksLikeBeluga(s) {
    return /(\|-|⊢|\[|=>|->)/.test(String(s || ""));
  }
  global2.HarpoonGlyphs = {
    displayBeluga,
    compactTypeLabel,
    looksLikeBeluga,
    fallbackNormalize
  };

  // js/harpoon/harpoon-lab-tree.mjs
  var global3 = globalThis;
  function norm(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  }
  function glyphs() {
    return global3.HarpoonGlyphs || null;
  }
  function displayBeluga2(text) {
    var g = glyphs();
    return g ? g.displayBeluga(text) : String(text == null ? "" : text);
  }
  function compactTypeLabel2(box) {
    var g = glyphs();
    return g ? g.compactTypeLabel(box) : norm(box);
  }
  function trunc(s, max) {
    s = String(s == null ? "" : s);
    return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
  }
  function shortPattern(box) {
    return compactTypeLabel2(box);
  }
  function shortGoal(goal) {
    return trunc(compactTypeLabel2(goal), 28);
  }
  function binderChip(ctx, meta) {
    var c = (ctx || []).length;
    var m = (meta || []).length;
    if (!c && !m) return "";
    var parts = [];
    if (c) parts.push(c + "\u0393");
    if (m) parts.push(m + "\u0394");
    return parts.join(" \xB7 ");
  }
  function moveLabel(step) {
    var meta = step.meta || {};
    switch (step.move) {
      case "split":
        return "case " + (meta.scrutinee || "?");
      case "synth":
        return meta.refutation ? "refute" : "chain \xD7" + ((meta.chain || []).length || "");
      case "recurse":
        return "recurse";
      case "invert":
        return "invert";
      case "lemma":
        return trunc(meta.callee || "lemma", 12);
      case "fill":
        return "fill";
      case "impossible":
        return "impossible";
      case "intro":
        return "intro";
      default:
        return step.move;
    }
  }
  function altCount(frontier) {
    if (!frontier || !frontier.length) return 0;
    var n = 0;
    for (var i = 0; i < frontier.length; i += 1) {
      if (frontier[i].verdict !== "accepted") n += 1;
    }
    return n;
  }
  var SIZE = {
    move: { w: 104, h: 32, label: 13 },
    theorem: { w: 112, h: 34, label: 14 },
    branch: { h: 26, label: 16, minW: 88, maxW: 148 },
    stuck: { w: 88, h: 32, label: 10 },
    ghost: { w: 82, h: 25, label: 12 }
  };
  function buildModel(opts) {
    var steps = opts.steps || [];
    var trace = opts.trace || null;
    var stuck = opts.stuck || null;
    var snap = opts.theoremSnapshot || null;
    var nextId = 1;
    function mk(type, label, extra) {
      var n = { id: nextId++, type, label, children: [] };
      if (extra) for (var k in extra) n[k] = extra[k];
      return n;
    }
    var root = mk("theorem", opts.name || "theorem", {
      sub: shortGoal(opts.goalType || ""),
      goalType: opts.goalType || "",
      theoremSnapshot: snap,
      premiseCount: snap && snap.premiseCount
    });
    var tails = { "": root };
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
      var key = st.branch ? norm(st.branch) : "";
      var container = key && armByPattern[key] ? key : "";
      var tail = tails[container] || root;
      var entry = advancedTrace[i];
      var holeCtx = st.holeCtx || entry && entry.holeCtx || [];
      var holeMeta = st.holeMeta || entry && entry.holeMeta || [];
      var frontier = entry && entry.tried ? entry.tried.slice() : [];
      var node = mk("move", moveLabel(st), {
        kind: st.move,
        step: st,
        sub: shortGoal(st.goal || ""),
        binderChip: binderChip(holeCtx, holeMeta),
        closed: st.status === "solved",
        open: st.status === "open",
        frontier,
        altCount: altCount(frontier),
        state: { goal: st.goal || "", ctx: holeCtx, meta: holeMeta },
        focus: st.focus || entry && entry.focus || null,
        traceEntry: entry || null
      });
      node.ghosts = frontier.filter(function(v) {
        return v.verdict !== "accepted";
      });
      tail.children.push(node);
      tails[container] = node;
      if (st.move === "split" && st.meta && st.meta.armPatterns && st.meta.armPatterns.length) {
        for (var a = 0; a < st.meta.armPatterns.length; a += 1) {
          var pat = st.meta.armPatterns[a];
          var armNode = mk("arm", shortPattern(pat), { pattern: pat });
          node.children.push(armNode);
          var akey = norm(pat);
          armByPattern[akey] = armNode;
          tails[akey] = armNode;
        }
        tails[container] = node;
      }
    }
    if (stuck && stuck.reason && stuck.reason !== "cancelled" && stuck.reason !== "stopped") {
      var skey = stuckTrace && stuckTrace.branch ? norm(stuckTrace.branch) : "";
      var stail = tails[skey && armByPattern[skey] ? skey : ""] || root;
      var stuckCtx = stuckTrace && stuckTrace.holeCtx || [];
      var stuckMeta = stuckTrace && stuckTrace.holeMeta || [];
      stail.children.push(mk("stuck", "stuck", {
        kind: "stuck",
        sub: shortGoal(stuck.goal || ""),
        goal: stuck.goal || "",
        hole: stuck.hole || stuckTrace && stuckTrace.hole || null,
        tried: stuckTrace && stuckTrace.tried || [],
        frontier: stuckTrace && stuckTrace.tried || [],
        state: { goal: stuck.goal || "", ctx: stuckCtx, meta: stuckMeta },
        focus: stuckTrace && stuckTrace.focus || null
      }));
    }
    if (opts.complete) {
      (function markClosed(n) {
        if (!n.children.length && n.type === "move") n.closed = true;
        for (var c = 0; c < n.children.length; c += 1) markClosed(n.children[c]);
      })(root);
    }
    (function attachParents(n, parent) {
      n.parent = parent;
      for (var ci = 0; ci < n.children.length; ci += 1) attachParents(n.children[ci], n);
    })(root, null);
    return root;
  }
  function breadcrumb(n) {
    var parts = [];
    var cur = n;
    while (cur) {
      if (cur.type === "theorem") parts.unshift(cur.label || "theorem");
      else if (cur.type === "arm") parts.unshift(trunc(displayBeluga2(cur.pattern || cur.label), 20));
      else if (cur.type === "move") parts.unshift(cur.label);
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
    if (n.type === "arm") {
      var len = (n.label || "").length;
      return Math.max(SIZE.branch.minW, Math.min(SIZE.branch.maxW, 24 + len * 5.5));
    }
    if (n.type === "theorem") return SIZE.theorem.w;
    if (n.type === "stuck") return SIZE.stuck.w;
    if (n.type === "ghost") return SIZE.ghost.w;
    return SIZE.move.w;
  }
  function nodeH(n) {
    if (n.type === "arm") return SIZE.branch.h;
    if (n.type === "theorem") return SIZE.theorem.h;
    if (n.type === "ghost") return SIZE.ghost.h;
    return SIZE.move.h;
  }
  function measure(n) {
    n.w = nodeW(n);
    n.h = nodeH(n);
    if (!n.children.length) {
      n.subW = n.w;
      return n.subW;
    }
    var sum = 0;
    var GAP = 22;
    for (var i = 0; i < n.children.length; i += 1) {
      sum += measure(n.children[i]);
      if (i) sum += GAP;
    }
    n.subW = Math.max(n.w, sum);
    return n.subW;
  }
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
  function expandGhosts(root) {
    (function walk(n) {
      if (n.type === "move" && n.ghosts && n.ghosts.length) {
        for (var i = 0; i < n.ghosts.length; i += 1) {
          var gh = n.ghosts[i];
          n.children.push({
            id: "ghost-" + n.id + "-" + i,
            type: "ghost",
            kind: gh.kind,
            label: trunc(displayBeluga2(gh.head || gh.kind || "candidate"), 12),
            ghost: gh,
            children: []
          });
        }
      }
      for (var c = 0; c < n.children.length; c += 1) walk(n.children[c]);
    })(root);
  }
  function flatten(root) {
    var out = [];
    (function walk(n, parent, depth) {
      n.parent = parent;
      n.depth = depth;
      out.push(n);
      for (var i = 0; i < n.children.length; i += 1) walk(n.children[i], n, depth + 1);
    })(root, null, 0);
    return out;
  }
  var SVGNS = "http://www.w3.org/2000/svg";
  function el(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function edgePath(a, b) {
    var y0 = a.y + a.h / 2;
    var y1 = b.y - b.h / 2;
    if (Math.abs(a.x - b.x) < 0.5) {
      return "M" + a.x + "," + y0 + " L" + b.x + "," + y1;
    }
    var busY = (y0 + y1) / 2;
    return "M" + a.x + "," + y0 + " L" + a.x + "," + busY + " L" + b.x + "," + busY + " L" + b.x + "," + y1;
  }
  function labelMax(n) {
    if (n.type === "arm") return SIZE.branch.label;
    if (n.type === "theorem") return SIZE.theorem.label;
    if (n.type === "stuck") return SIZE.stuck.label;
    if (n.type === "ghost") return SIZE.ghost.label;
    return SIZE.move.label;
  }
  function renderNodeBody(g, n, pw, h, clipId) {
    var isArm = n.type === "arm";
    var rx = isArm ? 6 : 8;
    g.appendChild(el("rect", {
      x: -pw / 2,
      y: -h / 2,
      width: pw,
      height: h,
      rx,
      class: isArm ? "hpt-shape hpt-shape--branch" : "hpt-shape"
    }));
    var label = trunc(displayBeluga2(n.label || ""), labelMax(n));
    var text = el("text", {
      y: isArm ? 4 : 4,
      class: isArm ? "hpt-text hpt-text--branch" : "hpt-text",
      "clip-path": "url(#" + clipId + ")"
    });
    text.textContent = label;
    g.appendChild(text);
    if (n.closed) {
      g.appendChild(el("circle", {
        cx: pw / 2 - 9,
        cy: -h / 2 + 9,
        r: 3,
        class: "hpt-status hpt-status--done"
      }));
    } else if (n.open && n.type === "move") {
      g.appendChild(el("circle", {
        cx: pw / 2 - 9,
        cy: -h / 2 + 9,
        r: 3,
        class: "hpt-status hpt-status--open"
      }));
    }
  }
  function looksLikeType(s) {
    var g = glyphs();
    if (g && typeof g.looksLikeBeluga === "function") return g.looksLikeBeluga(s);
    return /(\|-|⊢|\[)/.test(String(s || ""));
  }
  function highlightInto(host, text, kind) {
    var ed = global3.BelEditor || null;
    var shown = displayBeluga2(String(text == null ? "" : text).trim());
    if (!shown) return false;
    try {
      if (kind === "type" && ed && typeof ed.renderTypeInto === "function") {
        ed.renderTypeInto(host, shown, "comp");
        return true;
      }
      if (ed && typeof ed.highlightSourceFragment === "function") {
        host.appendChild(ed.highlightSourceFragment(shown));
        return true;
      }
    } catch (_) {
    }
    host.textContent = shown;
    return true;
  }
  function buildNodeTipFragment(n, mode) {
    var frag = document.createDocumentFragment();
    var head = document.createElement("div");
    head.className = "hpt-tip-head";
    if (n.type === "ghost" && n.ghost) {
      var gk = document.createElement("span");
      gk.className = "hpt-tip-kind hpt-tip-kind--ghost";
      gk.textContent = n.ghost.kind || "candidate";
      head.appendChild(gk);
      var gl = document.createElement("span");
      gl.className = "hpt-tip-title";
      gl.textContent = displayBeluga2(n.ghost.head || n.ghost.kind || "candidate");
      head.appendChild(gl);
      frag.appendChild(head);
      if (n.ghost.text && n.ghost.text !== n.ghost.head) {
        var gcode = document.createElement("div");
        gcode.className = "hpt-tip-code";
        highlightInto(gcode, n.ghost.text, looksLikeType(n.ghost.text) ? "type" : "source");
        frag.appendChild(gcode);
      }
      var gr = document.createElement("div");
      gr.className = "hpt-tip-note";
      gr.textContent = (n.ghost.verdict === "guard" ? "skipped \u2014 " : "not taken \u2014 ") + (n.ghost.reason || "did not certify");
      frag.appendChild(gr);
      return frag;
    }
    var kind = n.kind || (n.type === "arm" ? "arm" : n.type);
    if (kind) {
      var k = document.createElement("span");
      k.className = "hpt-tip-kind";
      k.textContent = kind;
      head.appendChild(k);
    }
    var title = document.createElement("span");
    title.className = "hpt-tip-title";
    title.textContent = displayBeluga2(n.label || kind || "move");
    head.appendChild(title);
    frag.appendChild(head);
    var st = n.step;
    var rationale = st && st.rationale || "";
    if (rationale && rationale !== n.label) {
      var r = document.createElement("div");
      r.className = "hpt-tip-note";
      r.textContent = rationale;
      frag.appendChild(r);
    }
    var goalText = st && st.goal || n.sub || (n.type === "arm" ? n.pattern : "") || "";
    if (goalText) {
      var goal = document.createElement("div");
      goal.className = "hpt-tip-code";
      highlightInto(goal, goalText, "type");
      frag.appendChild(goal);
    }
    var body = st && st.text;
    if (body && body !== goalText) {
      var code = document.createElement("div");
      code.className = "hpt-tip-code";
      highlightInto(code, body, looksLikeType(body) ? "type" : "source");
      frag.appendChild(code);
    }
    if (mode !== "space" && n.altCount) {
      var alt = document.createElement("div");
      alt.className = "hpt-tip-note hpt-tip-note--dim";
      alt.textContent = n.altCount + " other candidate" + (n.altCount === 1 ? "" : "s") + " considered";
      frag.appendChild(alt);
    }
    return frag;
  }
  function render(container, root, opts) {
    opts = opts || {};
    var mode = opts.mode || "path";
    if (mode === "space") expandGhosts(root);
    var nodes = flatten(root);
    measure(root);
    place(root, root.subW / 2 + 24, 36);
    var minX = Infinity;
    var maxX = -Infinity;
    var maxY = 0;
    nodes.forEach(function(n) {
      minX = Math.min(minX, n.x - n.w / 2 - 8);
      maxX = Math.max(maxX, n.x + n.w / 2 + 8);
      maxY = Math.max(maxY, n.y + n.h / 2 + 8);
    });
    var pad = 28;
    var contentW = Math.max(300, maxX - minX + pad * 2);
    var H = maxY + pad * 2;
    var cssH = Math.min(520, Math.max(200, H * 0.85));
    var scale = H > 0 ? cssH / H : 1;
    var hostW = container.clientWidth || 640;
    var viewW = scale > 0 ? hostW / scale : contentW;
    var defaultW = Math.min(viewW, contentW);
    if (defaultW < 300) defaultW = Math.min(300, contentW);
    var defaultX = (minX + maxX) / 2 - defaultW / 2;
    var vb = opts.initialView ? { x: opts.initialView.x, y: opts.initialView.y, w: opts.initialView.w, h: opts.initialView.h } : { x: defaultX, y: 0, w: defaultW, h: H };
    var svg = el("svg", {
      class: "hpt-svg",
      viewBox: vb.x + " " + vb.y + " " + vb.w + " " + vb.h,
      preserveAspectRatio: "xMidYMin meet"
    });
    svg.style.width = "100%";
    svg.style.height = cssH + "px";
    var defs = el("defs");
    nodes.forEach(function(n) {
      var clipId = "hpt-clip-" + n.id;
      n._clipId = clipId;
      var pw = n.w;
      var h = n.h;
      var cp = el("clipPath", { id: clipId });
      var inset = n.type === "arm" ? 6 : 12;
      cp.appendChild(el("rect", {
        x: -pw / 2 + inset,
        y: -h / 2 + 2,
        width: pw - inset * 2,
        height: h - 4,
        rx: 4
      }));
      defs.appendChild(cp);
    });
    svg.appendChild(defs);
    var scene = el("g", { class: "hpt-scene" });
    svg.appendChild(scene);
    nodes.forEach(function(n) {
      if (!n.parent) return;
      scene.appendChild(el("path", {
        d: edgePath(n.parent, n),
        class: "hpt-edge" + (n.type === "arm" ? " hpt-edge--branch" : "") + (n.type === "ghost" ? " hpt-edge--ghost" : "")
      }));
    });
    var selectedG = null;
    var selectedId = opts.selectedId || null;
    function select(n, g) {
      if (selectedG) selectedG.classList.remove("is-selected");
      selectedG = g;
      if (g) g.classList.add("is-selected");
      if (opts.onSelect) opts.onSelect(n);
    }
    nodes.forEach(function(n, idx) {
      var pw = n.w;
      var h = n.h;
      var g = el("g", {
        class: "hpt-node hpt-node--" + (n.kind || n.type) + (n.type === "ghost" ? " is-ghost" : ""),
        transform: "translate(" + n.x + "," + n.y + ")",
        "data-node-id": String(n.id),
        tabindex: "0",
        role: "button"
      });
      g.style.transitionDelay = Math.min(idx * 20, 600) + "ms";
      renderNodeBody(g, n, pw, h, n._clipId);
      if (mode !== "space" && n.altCount > 0 && n.type === "move") {
        var bw = 20;
        var bh = 13;
        var bx = pw / 2 - bw * 0.55;
        var by = h / 2 - bh * 0.55;
        var chip = el("g", { class: "hpt-altcount", transform: "translate(" + bx + "," + by + ")" });
        chip.appendChild(el("rect", { x: 0, y: 0, width: bw, height: bh, rx: bh / 2 }));
        var ct = el("text", { x: bw / 2, y: bh - 4, class: "hpt-altcount-text" });
        ct.textContent = "+" + n.altCount;
        chip.appendChild(ct);
        g.appendChild(chip);
      }
      var ariaTip;
      if (n.type === "ghost" && n.ghost) {
        ariaTip = displayBeluga2(n.ghost.head || n.ghost.kind || "candidate") + " \u2014 " + (n.ghost.reason || "not taken");
      } else {
        ariaTip = n.step && n.step.rationale || n.label || "";
      }
      if (global3.Tooltips && typeof global3.Tooltips.setRich === "function") {
        (function(node) {
          global3.Tooltips.setRich(g, function() {
            return buildNodeTipFragment(node, mode);
          }, ariaTip);
        })(n);
      } else {
        var title = document.createElementNS(SVGNS, "title");
        title.textContent = ariaTip;
        g.appendChild(title);
      }
      g.addEventListener("click", function() {
        select(n, g);
      });
      g.addEventListener("keydown", function(ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          select(n, g);
        }
      });
      scene.appendChild(g);
      if (selectedId && n.id === selectedId) select(n, g);
    });
    function applyVB() {
      svg.setAttribute("viewBox", vb.x + " " + vb.y + " " + vb.w + " " + vb.h);
      if (opts.onViewChange) opts.onViewChange({ x: vb.x, y: vb.y, w: vb.w, h: vb.h });
    }
    svg.addEventListener("wheel", function(ev) {
      ev.preventDefault();
      var k = ev.deltaY > 0 ? 1.1 : 0.91;
      var pt = svg.createSVGPoint();
      pt.x = ev.clientX;
      pt.y = ev.clientY;
      var ctm = svg.getScreenCTM();
      if (!ctm) return;
      var p = pt.matrixTransform(ctm.inverse());
      vb.x = p.x - (p.x - vb.x) * k;
      vb.y = p.y - (p.y - vb.y) * k;
      vb.w *= k;
      vb.h *= k;
      applyVB();
    }, { passive: false });
    var PAN_THRESHOLD = 4;
    var drag = null;
    svg.addEventListener("pointerdown", function(ev) {
      if (ev.button !== 0) return;
      drag = { x: ev.clientX, y: ev.clientY, vx: vb.x, vy: vb.y, id: ev.pointerId, active: false };
    });
    svg.addEventListener("pointermove", function(ev) {
      if (!drag) return;
      var dx = ev.clientX - drag.x;
      var dy = ev.clientY - drag.y;
      if (!drag.active) {
        if (Math.abs(dx) < PAN_THRESHOLD && Math.abs(dy) < PAN_THRESHOLD) return;
        drag.active = true;
        try {
          svg.setPointerCapture(drag.id);
        } catch (_) {
        }
        svg.classList.add("is-panning");
      }
      var scale2 = vb.w / svg.clientWidth;
      vb.x = drag.vx - dx * scale2;
      vb.y = drag.vy - dy * scale2;
      applyVB();
    });
    function endPan() {
      if (drag && drag.active) {
        try {
          svg.releasePointerCapture(drag.id);
        } catch (_) {
        }
      }
      drag = null;
      svg.classList.remove("is-panning");
    }
    svg.addEventListener("pointerup", endPan);
    svg.addEventListener("pointercancel", endPan);
    container.textContent = "";
    container.appendChild(svg);
    if (opts.instant) {
      svg.querySelectorAll(".hpt-node").forEach(function(g2) {
        g2.style.transitionDelay = "0ms";
      });
      var pills = svg.querySelectorAll(".hpt-node");
      if (pills.length) pills[pills.length - 1].style.transitionDelay = "30ms";
      svg.classList.add("is-revealed");
    } else {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          svg.classList.add("is-revealed");
        });
      });
    }
    return svg;
  }
  global3.HarpoonTree = {
    buildModel,
    render,
    breadcrumb,
    findById
  };

  // js/harpoon/harpoon-lab-display.mjs
  var global4 = globalThis;
  function createDisplay(deps) {
    var el4 = deps.el;
    var E3 = deps.E;
    var setTip2 = deps.setTip;
    var liveEditorFileId2 = deps.liveEditorFileId;
    var bindChipTip2 = deps.bindChipTip;
    var renderSynthChain2 = deps.renderSynthChain;
    var ICON_CHECK2 = deps.ICON_CHECK;
    var ICON_ARROW_RIGHT2 = deps.ICON_ARROW_RIGHT;
    var ICON_ALERT2 = deps.ICON_ALERT;
    function normalizeGlyphs2(text) {
      var g = global4.HarpoonGlyphs;
      if (g) return g.fallbackNormalize(text);
      return String(text == null ? "" : text).replace(/\|-#/g, "\u22A2#").replace(/\|-/g, "\u22A2").replace(/=>/g, "\u21D2").replace(/->/g, "\u2192");
    }
    function displayType3(typeStr) {
      var g = global4.HarpoonGlyphs;
      if (g) return g.displayBeluga(typeStr);
      var ed = E3();
      if (ed && typeof ed.normalizeType === "function") return ed.normalizeType(typeStr);
      return normalizeGlyphs2(typeStr);
    }
    function displaySource(text) {
      var ed = E3();
      var s = String(text || "");
      if (ed && typeof ed.expandBelAliases === "function") s = ed.expandBelAliases(s);
      return displayType3(s);
    }
    function renderType3(host, typeStr, kind) {
      var norm2 = displayType3(typeStr);
      host.textContent = "";
      if (!norm2) return;
      var ed = E3();
      if (ed && typeof ed.renderTypeInto === "function") {
        try {
          ed.renderTypeInto(host, norm2, kind || "comp");
          if (host.textContent.indexOf("|-") !== -1) host.textContent = norm2;
          return;
        } catch (e) {
        }
      }
      host.textContent = norm2;
    }
    function renderSource2(host, text) {
      var shown = displaySource(text);
      host.textContent = "";
      if (!shown) return;
      var ed = E3();
      if (ed && typeof ed.renderSourceInto === "function") {
        try {
          ed.renderSourceInto(host, shown, "bel");
          if (host.textContent.indexOf("|-") !== -1) host.textContent = shown;
          return;
        } catch (e) {
        }
      }
      host.textContent = shown;
    }
    function peelDisplayGoal2(goalType, goalState) {
      if (!goalType || goalState === "live") return goalType;
      var ed = E3();
      if (!ed || typeof ed.peelLeadingBinders !== "function") return goalType;
      try {
        var peeled = ed.peelLeadingBinders(goalType);
        if (peeled.binders.length && peeled.rest) return peeled.rest;
      } catch (e) {
      }
      return goalType;
    }
    function resolveNativeAutoGoalDisplay(session, na) {
      if (!na || !na.goalType) return { goalType: null, goalState: "live" };
      if (na.complete || na.phase === "solved") {
        return { goalType: na.goalType, goalState: "live" };
      }
      var ed = E3();
      var prep = session.prep;
      if (!ed || !prep || typeof ed.resolveHoleGoalForHit !== "function") {
        return { goalType: na.goalType, goalState: na.goalState || "live" };
      }
      var api = global4.CurrentEditor;
      var eng = api && typeof api.getSemanticEngine === "function" ? api.getSemanticEngine() : null;
      var hit = ed.resolveHoleGoalForHit(session.view, eng, prep.hit);
      if (!hit || !hit.goal) {
        return { goalType: na.goalType, goalState: na.goalState || "live" };
      }
      var st = hit.state || "live";
      if (st === "pending" || st === "approximate" || st === "rechecking") {
        return { goalType: peelDisplayGoal2(hit.goal, st), goalState: st };
      }
      return { goalType: hit.goal, goalState: "live" };
    }
    function fullDeclSignature(session, sourceType) {
      var name = session && session.prep && session.prep.name;
      var cached = session && name && session._fullDeclSig && session._fullDeclSig.name === name ? session._fullDeclSig.type : null;
      var view = session && session.view;
      var from = session ? session.declFrom : null;
      if (!view || !name || from == null) return cached || sourceType;
      if (session.fileId && liveEditorFileId2() !== session.fileId) return cached || sourceType;
      var api = global4.CurrentEditor;
      var eng = api && typeof api.getSemanticEngine === "function" ? api.getSemanticEngine() : null;
      if (!eng || typeof eng.intelSyncAt !== "function") return cached || sourceType;
      var to = session.declTo != null ? session.declTo : Math.min(from + 400, view.state.doc.length);
      var idx = view.state.doc.sliceString(from, to).indexOf(name);
      if (idx < 0) return cached || sourceType;
      try {
        var intel = eng.intelSyncAt(from + idx);
        if (intel && intel.type && intel.definition && intel.definition.isGlobal && (intel.definition.name === name || intel.name === name)) {
          session._fullDeclSig = { name, type: intel.type };
          return intel.type;
        }
      } catch (e) {
      }
      return cached || sourceType;
    }
    function priorGoalBinders2(session, sourceType, goalType) {
      var ed = E3();
      if (!ed || typeof ed.priorDeclBinders !== "function") return [];
      var sig = fullDeclSignature(session, sourceType);
      if (!sig) return [];
      try {
        return ed.priorDeclBinders(sig, goalType || "");
      } catch (e) {
        return [];
      }
    }
    function mountGoalPriors2(wrap, binders) {
      if (!wrap) return;
      var body = wrap.querySelector(".harpoon-lab-auto-goal-body");
      if (!body) return;
      var old = wrap.querySelector(".harpoon-lab-auto-goal-priors");
      if (old) old.remove();
      if (!binders || !binders.length) return;
      var row = el4("div", "harpoon-lab-auto-goal-priors");
      var text = el4("span", "harpoon-lab-auto-goal-priors-text");
      renderType3(text, binders.map(function(b) {
        return b.text;
      }).join(" "), "binder");
      row.appendChild(text);
      body.insertAdjacentElement("afterend", row);
    }
    function appendAutoGoalHero(parent, goalType, declName, goalState, priorBinders) {
      var wrap = el4("div", "harpoon-lab-auto-goal harpoon-lab-strip tone-goal");
      var glabel = el4("div", "harpoon-lab-goal-label");
      glabel.appendChild(el4("span", "harpoon-lab-goal-label-text harpoon-lab-section-label is-goal", "Goal"));
      if (declName) glabel.appendChild(el4("span", "harpoon-lab-auto-goal-name", declName));
      wrap.appendChild(glabel);
      var body = el4("div", "harpoon-lab-auto-goal-body");
      var goal = el4("div", "harpoon-hole-goal");
      var ed = E3();
      if (ed && typeof ed.mountHoleGoalTier === "function") {
        ed.mountHoleGoalTier(goal, { surface: "lab", goalState: goalState || "live", goal: goalType });
      } else {
        renderType3(goal, goalType);
      }
      body.appendChild(goal);
      wrap.appendChild(body);
      mountGoalPriors2(wrap, priorBinders);
      parent.appendChild(wrap);
      return wrap;
    }
    function formatSolutionBody(body) {
      var ed = E3();
      if (ed && typeof ed.formatProofBody === "function") {
        try {
          return ed.formatProofBody(body);
        } catch (e) {
        }
      }
      return body;
    }
    function appendAutoSolution(parent, body) {
      var wrap = el4("div", "harpoon-lab-auto-solution harpoon-lab-auto-panel");
      wrap.appendChild(el4("span", "harpoon-lab-auto-solution-label harpoon-lab-section-label is-solution", "Solution"));
      var bodyEl2 = el4("div", "harpoon-lab-auto-solution-body");
      renderSource2(bodyEl2, formatSolutionBody(body));
      wrap.appendChild(bodyEl2);
      parent.appendChild(wrap);
      return wrap;
    }
    function autoVerdictTone(na) {
      if (na.complete) return "success";
      if (na.stuck && na.stuck.reason === "file-errors") return "error";
      return "warn";
    }
    function stageNode2(node, index) {
      if (!node || !node.style || index == null) return node;
      node.classList.add("harpoon-lab-stage");
      node.style.setProperty("--stage-index", String(index));
      return node;
    }
    function buildBannerShell2(opts) {
      opts = opts || {};
      var tag = opts.tag || "div";
      var className = opts.className || "";
      if (opts.tone) className += " tone-" + opts.tone;
      var root = el4(tag, className);
      if (tag === "button") root.type = "button";
      if (opts.disabled) root.disabled = true;
      var badge = el4("span", "harpoon-lab-banner-badge" + (opts.badgeClass ? " " + opts.badgeClass : ""));
      if (opts.icon) badge.innerHTML = opts.icon;
      root.appendChild(badge);
      var copy = el4("span", "harpoon-lab-banner-copy" + (opts.copyClass ? " " + opts.copyClass : ""));
      if (opts.title != null) {
        copy.appendChild(el4("span", "harpoon-lab-banner-title" + (opts.titleClass ? " " + opts.titleClass : ""), opts.title));
      }
      if (opts.sub) {
        copy.appendChild(el4("span", "harpoon-lab-banner-sub" + (opts.subClass ? " " + opts.subClass : ""), opts.sub));
      }
      root.appendChild(copy);
      if (typeof opts.onClick === "function") {
        root.addEventListener("click", function(e) {
          e.preventDefault();
          if (root.disabled || root.classList.contains("is-committing")) return;
          opts.onClick();
        });
      }
      return root;
    }
    function buildPlaceStrip2(self, opts) {
      opts = opts || {};
      var blocked = !!opts.blocked;
      var title = opts.title || "Place the proof";
      var sub = opts.sub || (blocked ? "The hole changed \u2014 restart to insert" : "Insert into the file");
      var extraCls = opts.extraCls || "";
      return buildBannerShell2({
        tag: "button",
        className: "harpoon-lab-place harpoon-lab-strip harpoon-lab-banner" + extraCls + (blocked ? " is-blocked" : ""),
        disabled: blocked,
        tone: blocked ? "error" : "action",
        icon: ICON_ARROW_RIGHT2,
        badgeClass: "harpoon-lab-place-arrow",
        copyClass: "harpoon-lab-place-copy",
        titleClass: "harpoon-lab-place-title beljar-tip-shimmer-target",
        subClass: "harpoon-lab-place-sub",
        title,
        sub,
        onClick: opts.onClick
      });
    }
    function renderCommitOutcome2(parent, commit, declName, onRetry) {
      if (!commit || commit.status === "idle" || commit.status === "checking") return null;
      var placed = commit.status === "placed";
      if (placed && commit.dismissed) return null;
      var banner = buildBannerShell2({
        className: "harpoon-lab-auto-commit harpoon-lab-strip harpoon-lab-banner is-" + (placed ? "placed" : "fail"),
        tone: placed ? "success" : "error",
        icon: placed ? ICON_CHECK2 : ICON_ALERT2,
        badgeClass: "harpoon-lab-commit-badge",
        titleClass: "harpoon-lab-commit-text",
        subClass: "harpoon-lab-commit-sub",
        title: placed ? "Placed in file" : "Could not place",
        sub: placed ? declName || "" : commit.detail || "The proof did not re-check."
      });
      if (!placed && commit.detailRaw) {
        var copy = banner.querySelector(".harpoon-lab-banner-copy");
        if (copy) copy.appendChild(el4("span", "harpoon-lab-commit-tech", commit.detailRaw));
      }
      if (!placed && typeof onRetry === "function") {
        var actions = el4("div", "harpoon-lab-commit-actions");
        var retryBtn = el4("button", "harpoon-lab-commit-retry");
        retryBtn.type = "button";
        retryBtn.textContent = "Try again";
        retryBtn.addEventListener("click", function(e) {
          e.preventDefault();
          onRetry();
        });
        actions.appendChild(retryBtn);
        banner.appendChild(actions);
      }
      parent.appendChild(banner);
      return banner;
    }
    function renderManualSolvedSummary2(parent) {
      var banner = buildBannerShell2({
        className: "harpoon-lab-manual-head harpoon-lab-strip harpoon-lab-banner",
        tone: "success",
        icon: ICON_CHECK2,
        badgeClass: "harpoon-lab-auto-badge is-solved",
        copyClass: "harpoon-lab-auto-head-copy",
        titleClass: "harpoon-lab-auto-title",
        subClass: "harpoon-lab-auto-sub",
        title: "Proof complete",
        sub: "Ready to place in the file"
      });
      parent.appendChild(banner);
      return banner;
    }
    var MOVE_GLOSS = {
      intro: "opened the goal's binders",
      split: "case on the scrutinee",
      recurse: "induction hypothesis",
      invert: "inverted a hypothesis",
      fill: "closed the goal",
      lemma: "applied a lemma",
      synth: "synthesized the goal",
      impossible: "refuted a hypothesis"
    };
    function goalHeadFromGoal(goal) {
      if (!goal) return null;
      var g = String(goal).trim();
      if (g[0] === "[" && g[g.length - 1] === "]" || g[0] === "(" && g[g.length - 1] === ")") {
        g = g.slice(1, -1).trim();
      }
      var m = g.match(/(?:\|-|⊢|\|)\s*([\s\S]*)$/);
      var concl = (m ? m[1] : g).trim();
      var head = concl.split(/\s+/)[0];
      return head || null;
    }
    function introducedFromText(text) {
      var names = [];
      var re = /\b(?:fn|mlam)\s+([A-Za-z_][A-Za-z0-9_']*)/g;
      var m;
      while (m = re.exec(String(text || ""))) names.push(m[1]);
      return names;
    }
    function deriveMoveLead(step) {
      if (!step) return "";
      var meta = step.meta || {};
      var move = step.move;
      var goalHead = meta.goalHead || goalHeadFromGoal(step.goal) || "the goal";
      switch (move) {
        case "synth": {
          var links = (meta.chain || []).filter(function(c) {
            return c !== "impossible";
          });
          var n = links.length || (meta.chain || []).length;
          if (!n) return "";
          return meta.refutation ? "refutation closing " + goalHead : n + "-step chain closing " + goalHead;
        }
        case "split":
          return "case on " + (meta.scrutinee || "the scrutinee");
        case "recurse":
          return "induction hypothesis";
        case "invert":
          return "inverted " + (meta.uses && meta.uses[0] || "a hypothesis");
        case "lemma":
          return "applied " + (meta.callee || "lemma");
        case "impossible":
          return "refuted " + (meta.refuted || "the hypothesis");
        case "fill":
          return "closed " + goalHead;
        case "intro":
          return "opened the goal's binders";
        default:
          return "";
      }
    }
    function moveLead(s) {
      if (s && s.lead) return s.lead;
      var ed = global4.BelEditor;
      if (ed && typeof ed.stepLead === "function" && s && s.meta) {
        var fromEd = ed.stepLead({ kind: s.move }, s.meta, { goal: s.goal });
        if (fromEd) return fromEd;
      }
      var derived = deriveMoveLead(s);
      if (derived) return derived;
      return s && MOVE_GLOSS[s.move] || "made a move";
    }
    function facetChip(text, extraClass, tip, richKind) {
      var chip = el4("span", "hpt-move-facet-chip" + (extraClass ? " " + extraClass : ""));
      var code = el4("code", "hpt-move-facet-code");
      renderSource2(code, text);
      chip.appendChild(code);
      if (tip) bindChipTip2(chip, tip, richKind ? text : null, richKind);
      return chip;
    }
    function renderMoveFacet(step, variant) {
      var meta = step.meta || {};
      var move = step.move;
      if (move === "synth") {
        return renderSynthChain2(meta, variant === "detail" ? "full" : "inline");
      }
      var wrap = el4("div", "hpt-move-facet" + (variant === "inline" ? " is-inline" : "") + (move ? " is-move-" + move : ""));
      var has = false;
      if (move === "intro") {
        var introNames = meta.introduced && meta.introduced.length ? meta.introduced : introducedFromText(step.text);
        introNames.forEach(function(n) {
          wrap.appendChild(facetChip(n, "", "Binder introduced for the assumed input"));
          has = true;
        });
      } else if (move === "split") {
        if (meta.arms) {
          var armTip = meta.arms === 1 ? "Opened one branch with a single hole" : "Opened " + meta.arms + " branches, each with its own hole";
          wrap.appendChild(facetChip(meta.arms + " arm" + (meta.arms === 1 ? "" : "s"), "", armTip));
          has = true;
        }
        if (meta.annotated) {
          wrap.appendChild(facetChip("typed", "is-muted", "Arms carry explicit type annotations"));
          has = true;
        }
      } else if (move === "fill") {
        var filler = meta.filler || step.text && String(step.text).split("\n")[0].replace(/\s+/g, " ").trim();
        if (filler) {
          wrap.appendChild(facetChip(filler, "", "Proof term written in place of the hole", "type"));
          has = true;
        }
      } else if (move === "recurse" || move === "lemma") {
        (meta.uses || []).forEach(function(u) {
          wrap.appendChild(facetChip(u, "", "Used from the local context"));
          has = true;
        });
        (meta.binds || []).forEach(function(b) {
          wrap.appendChild(facetChip(b, "is-binds", "New witness bound by this move"));
          has = true;
        });
      } else if (move === "invert") {
        if (meta.uses && meta.uses[0]) {
          var arrow = el4("span", "hpt-move-facet-arrow");
          arrow.textContent = meta.uses[0] + " \u2192 " + ((meta.binds || []).join(", ") || "\u2026");
          bindChipTip2(arrow, "Hypothesis inverted into pattern variables");
          wrap.appendChild(arrow);
          has = true;
        }
      } else if (move === "impossible" && meta.refuted) {
        wrap.appendChild(facetChip(meta.refuted, "", "Shown to be contradictory"));
        has = true;
      }
      return has ? wrap : null;
    }
    function appendMoveFacet(host, step) {
      var facet = renderMoveFacet(step, "inline");
      if (facet) host.appendChild(facet);
    }
    function autoVerdictTitle(na) {
      if (na.complete) {
        var n = (na.steps || []).length;
        return "Proven in " + n + (n === 1 ? " step" : " steps");
      }
      return "Search stopped";
    }
    function nowMs() {
      return typeof performance !== "undefined" ? performance.now() : Date.now();
    }
    function setNativeSearchLabel2(na, label, opts) {
      if (!na || label == null) return;
      var tryKey = opts && Object.prototype.hasOwnProperty.call(opts, "tryKey") ? opts.tryKey : void 0;
      var isTrying = /^Trying /.test(label);
      if (isTrying && tryKey !== void 0) {
        if (na.searchLabel === label && na.tryKey === tryKey) return;
        na.searchLabel = label;
        na.tryKey = tryKey;
        na.labelAt = nowMs();
        return;
      }
      if (na.searchLabel === label && !isTrying) {
        na.tryKey = null;
        return;
      }
      na.searchLabel = label;
      na.tryKey = isTrying ? tryKey != null ? tryKey : null : null;
      na.labelAt = nowMs();
    }
    function autoSubtext(na) {
      if (na.complete) return "";
      if (na.stuck && na.stuck.reason === "stopped") return "Stopped";
      if (na.stuck && na.stuck.reason === "cancelled") return "Cancelled";
      if (na.stuck && na.stuck.reason === "file-errors") return "The file has errors";
      if (na.stuck && na.stuck.goal) return "No tactic for this goal";
      if (na.stuck && na.stuck.reason === "step-bound") return "Step limit reached";
      return "No tactic available";
    }
    function nativeAutoSearchLabel(na) {
      if (na.paused) return "Paused";
      var label = na.searchLabel || (na.steps && na.steps.length ? "Step " + na.steps.length : "Searching\u2026");
      if (na.phase === "searching" && !na.paused && na.labelAt != null) {
        var secs = Math.floor((nowMs() - na.labelAt) / 1e3);
        if (secs >= 5) {
          label = String(label).replace(/[….]+$/, "") + " \xB7 " + secs + "s\u2026";
        }
      }
      return label;
    }
    function solvedBodyOf2(code, name) {
      var src = String(code || "");
      var re = new RegExp("\\b(?:rec|proof)\\s+" + String(name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:");
      var m = re.exec(src);
      if (!m) return "";
      var eq = src.indexOf("=", m.index);
      if (eq < 0) return "";
      var semi = src.indexOf(";", eq);
      if (semi < 0) return "";
      return src.slice(eq + 1, semi).trim();
    }
    return {
      normalizeGlyphs: normalizeGlyphs2,
      displayType: displayType3,
      displaySource,
      renderType: renderType3,
      renderSource: renderSource2,
      peelDisplayGoal: peelDisplayGoal2,
      resolveNativeAutoGoalDisplay,
      fullDeclSignature,
      priorGoalBinders: priorGoalBinders2,
      mountGoalPriors: mountGoalPriors2,
      appendAutoGoalHero,
      appendAutoSolution,
      formatSolutionBody,
      autoVerdictTone,
      renderManualSolvedSummary: renderManualSolvedSummary2,
      stageNode: stageNode2,
      buildBannerShell: buildBannerShell2,
      buildPlaceStrip: buildPlaceStrip2,
      renderCommitOutcome: renderCommitOutcome2,
      deriveMoveLead,
      moveLead,
      renderMoveFacet,
      appendMoveFacet,
      autoVerdictTitle,
      setNativeSearchLabel: setNativeSearchLabel2,
      nativeAutoSearchLabel,
      autoSubtext,
      solvedBodyOf: solvedBodyOf2
    };
  }

  // js/harpoon/harpoon-lab-commit.mjs
  var global5 = globalThis;
  function createCommit(deps) {
    var E3 = deps.E;
    var toast2 = deps.toast;
    var liveEditorFileId2 = deps.liveEditorFileId;
    var prepareForHole2 = deps.prepareForHole;
    function defaultCommitState2() {
      return {
        status: "idle",
        phase: null,
        detail: "",
        detailRaw: "",
        usedFullCheck: false,
        canRetry: false,
        dismissed: false
      };
    }
    function commitFailureUserMessage2() {
      return "The proof no longer fits this file. Symbols or context may have changed since it was solved.";
    }
    function firstCheckerErrorLine(output) {
      var s = String(output || "");
      var m = /File[^\n]*line\s+\d+[^\n]*:\s*([^\n]+)/i.exec(s);
      if (m) return m[1].trim();
      var lines = s.split("\n");
      for (var i = 0; i < lines.length; i += 1) {
        var t = lines[i].trim();
        if (t && /error/i.test(t)) return t;
      }
      for (var j = 0; j < lines.length; j += 1) {
        var u = lines[j].trim();
        if (u) return u.length > 120 ? u.slice(0, 117) + "\u2026" : u;
      }
      return "The proof did not re-check.";
    }
    function totalityPrefixFromDecl(declText) {
      var m = /=\s*(\/\s*total[^/]*\/\s*)/.exec(String(declText || ""));
      return m ? m[1].trim() : "";
    }
    var COMMIT_CHECK_TIMEOUT_MS = 45e3;
    var COMMIT_NAV_TIMEOUT_MS = 8e3;
    function withCommitTimeout(promise, ms, message) {
      return new Promise(function(resolve, reject) {
        var timer = global5.setTimeout(function() {
          reject(new Error(message || "Timed out."));
        }, ms);
        Promise.resolve(promise).then(function(v) {
          global5.clearTimeout(timer);
          resolve(v);
        }).catch(function(e) {
          global5.clearTimeout(timer);
          reject(e);
        });
      });
    }
    function pendingCommitAfterNav(source) {
      var self = this;
      var fileId = this.fileId || this.anchor && this.anchor.fileId;
      this.clearPendingCommitNav();
      var view = this.resolveView();
      var api = global5.CurrentEditor;
      var eng = api && typeof api.getSemanticEngine === "function" ? api.getSemanticEngine() : null;
      var hit = this.findLiveHit(view, eng) || this.compromise && this.compromise.liveHit;
      if (!fileId || !hit) {
        toast2("Open the file to place the proof.", "error");
        this.resetCommitForRetry();
        return Promise.resolve(false);
      }
      if (liveEditorFileId2() === fileId) {
        return this.verifyAndCommit(source, { skipBeginUi: true });
      }
      this.pendingCommitSource = source;
      var onActive = function() {
        if (!self.pendingCommitSource) return;
        var src = self.pendingCommitSource;
        self.clearPendingCommitNav();
        self.verifyAndCommit(src, { skipBeginUi: true });
      };
      self._pendingCommitNavListener = onActive;
      global5.addEventListener("beljar:active-editor-view", onActive);
      global5.dispatchEvent(new CustomEvent("beljar:open-file-at", {
        detail: {
          fileId,
          from: hit.from,
          to: hit.to,
          line: hit.hole && hit.hole.line,
          col: hit.hole && hit.hole.col
        }
      }));
      if (liveEditorFileId2() === fileId && self.pendingCommitSource) {
        onActive();
        return Promise.resolve(false);
      }
      self._pendingCommitNavTimer = global5.setTimeout(function() {
        if (!self.pendingCommitSource) return;
        self.clearPendingCommitNav();
        self.resetCommitForRetry();
        toast2("Could not open the file to place the proof.", "error");
      }, COMMIT_NAV_TIMEOUT_MS);
      return Promise.resolve(false);
    }
    function verifyAndCommit(source, opts) {
      opts = opts || {};
      var ed = E3();
      var self = this;
      var client = global5.BelugaClient;
      if (!ed) return Promise.resolve(false);
      if (!opts.skipBeginUi) this.beginCommitUi("verify");
      this.probeAnchor();
      if (this.compromise && this.compromise.level === "block") {
        this.finishCommitFailure(this.compromise.detail || "The hole changed \u2014 restart to continue.", false);
        return Promise.resolve(false);
      }
      var fileId = this.fileId || this.anchor && this.anchor.fileId;
      var liveId = liveEditorFileId2();
      if (fileId && liveId && liveId !== fileId) {
        return this.pendingCommitAfterNav(source);
      }
      var view = this.resolveView();
      if (!view) {
        this.finishCommitFailure("Open the file to place the proof.", false);
        return Promise.resolve(false);
      }
      var api = global5.CurrentEditor;
      var eng = api && typeof api.getSemanticEngine === "function" ? api.getSemanticEngine() : null;
      var hit = this.findLiveHit(view, eng);
      if (!hit) {
        this.finishCommitFailure("The proof hole is no longer there.", false);
        return Promise.resolve(false);
      }
      var prep = prepareForHole2(view, hit);
      if (!prep) {
        this.resetCommitForRetry();
        return Promise.resolve(false);
      }
      this.prep = prep;
      this.declFrom = prep.span.from;
      this.declTo = prep.span.to;
      var range = ed.declRangeWithSemicolon ? ed.declRangeWithSemicolon(view.state.doc, prep.span.from, prep.span.to) : { from: prep.span.from, to: prep.span.to };
      var declFrom = range.from;
      var declTo = range.to;
      var docText = view.state.doc.toString();
      var declSlice = view.state.doc.sliceString(declFrom, declTo);
      var decl = ed.parseDecl(declSlice);
      if (!decl) {
        this.finishCommitFailure("Lost the declaration to commit into.", false);
        return Promise.resolve(false);
      }
      var body = String(source).replace(/;\s*$/, "").trimEnd();
      var tot = totalityPrefixFromDecl(declSlice);
      if (tot && !/\/\s*total\b/.test(body)) body = tot + "\n" + body;
      var newDecl = "rec " + decl.name + " : " + decl.type + " =\n" + body + "\n;";
      var codes = ed.buildCommitCheckCodes ? ed.buildCommitCheckCodes(prep.assembledCode, prep, newDecl) : {
        patched: prep.assembledCode != null ? prep.assembledCode.slice(0, prep.assembledDeclFrom) + newDecl + prep.assembledCode.slice(prep.assembledDeclTo) : docText.slice(0, declFrom) + newDecl + docText.slice(declTo),
        orchestration: prep.assembledCode != null ? prep.assembledCode.slice(0, prep.assembledDeclFrom) + newDecl + prep.assembledCode.slice(prep.assembledDeclTo) : docText.slice(0, declFrom) + newDecl + docText.slice(declTo)
      };
      var needsOrchestration = ed.countSiblingHoledDecls ? ed.countSiblingHoledDecls(docText, decl.name) > 0 : ed.needsFullCommitCheck ? ed.needsFullCommitCheck({ docText, declName: decl.name }) : false;
      function endProver() {
        if (client && client.endProverSession) client.endProverSession();
      }
      function commitNow() {
        ed.commitProof(view, declFrom, declTo, source);
        self.finishCommitSuccess();
        return true;
      }
      function runOrchestrationCheck() {
        var chain = client && client.beginProverSession ? client.beginProverSession() : Promise.resolve();
        return chain.then(function() {
          if (client.loadProverChecker && codes.orchestration) {
            return client.loadProverChecker(codes.orchestration);
          }
        }).then(function() {
          if (client.checkResultForProver) {
            return client.checkResultForProver(codes.orchestration);
          }
          return client.checkResult(codes.orchestration);
        }).then(function(res) {
          return {
            ok: !!(res && res.ok),
            output: res && res.output,
            stage: "orchestration"
          };
        });
      }
      if (!needsOrchestration) {
        return Promise.resolve(commitNow());
      }
      if (!client || typeof client.checkResult !== "function" && typeof client.checkResultForProver !== "function") {
        return Promise.resolve(commitNow());
      }
      return withCommitTimeout(
        runOrchestrationCheck(),
        COMMIT_CHECK_TIMEOUT_MS,
        "Proof verification timed out."
      ).then(function(result) {
        endProver();
        if (result && result.ok) return commitNow();
        self.finishCommitFailure(firstCheckerErrorLine(result && result.output), true, { kind: "checker" });
        return false;
      }).catch(function(err) {
        endProver();
        if (client.isCancelledError && client.isCancelledError(err)) {
          self.resetCommitForRetry();
          return false;
        }
        self.finishCommitFailure(err && err.message ? err.message : "Checker error.", true, { kind: "checker" });
        return false;
      });
    }
    return {
      defaultCommitState: defaultCommitState2,
      commitFailureUserMessage: commitFailureUserMessage2,
      firstCheckerErrorLine,
      totalityPrefixFromDecl,
      withCommitTimeout,
      COMMIT_CHECK_TIMEOUT_MS,
      COMMIT_NAV_TIMEOUT_MS,
      pendingCommitAfterNav,
      verifyAndCommit
    };
  }

  // js/harpoon/harpoon-lab-reel.mjs
  var global6 = globalThis;
  function createReel(deps) {
    var el4 = deps.el;
    var setTip2 = deps.setTip;
    var bindStepGoalTip2 = deps.bindStepGoalTip;
    var bindChipTip2 = deps.bindChipTip;
    var moveLead = deps.moveLead;
    var appendMoveFacet = deps.appendMoveFacet;
    var renderType3 = deps.renderType;
    var renderSource2 = deps.renderSource;
    var nativeAutoSearchLabel = deps.nativeAutoSearchLabel;
    var resolveNativeAutoGoalDisplay = deps.resolveNativeAutoGoalDisplay;
    var priorGoalBinders2 = deps.priorGoalBinders;
    var mountGoalPriors2 = deps.mountGoalPriors;
    var E3 = deps.E;
    var ICON_PLAY2 = deps.ICON_PLAY;
    var ICON_PAUSE2 = deps.ICON_PAUSE;
    function appendAutoStepRow(trail, s, i) {
      var item = el4("li", "harpoon-lab-auto-step");
      item.style.setProperty("--i", String(i));
      item.appendChild(el4("span", "harpoon-lab-auto-node"));
      var body = el4("div", "harpoon-lab-auto-step-body");
      var rowCopy = el4("div", "harpoon-lab-auto-step-copy");
      var verb = el4("span", "harpoon-lab-auto-move move-" + (s.move || "move"));
      verb.textContent = s.move || "move";
      rowCopy.appendChild(verb);
      rowCopy.appendChild(el4("span", "harpoon-lab-auto-why", moveLead(s)));
      body.appendChild(rowCopy);
      appendMoveFacet(body, s);
      item.appendChild(body);
      bindStepGoalTip2(verb, s.goal);
      trail.appendChild(item);
      return item;
    }
    function reelStatText(na) {
      var checks = na && na.checks ? na.checks : 0;
      var secs = 0;
      if (na && na.startedAt != null) {
        var now = typeof performance !== "undefined" ? performance.now() : Date.now();
        secs = Math.max(0, (now - na.startedAt) / 1e3);
      }
      var t = secs < 10 ? secs.toFixed(1) : Math.round(secs);
      return checks + (checks === 1 ? " check \xB7 " : " checks \xB7 ") + t + "s";
    }
    function syncReelStatTips(session, na) {
      if (!na) return;
      var tip = reelStatText(na);
      var targets = [session._autoSearchText, session._autoSearchSpinner];
      for (var i = 0; i < targets.length; i++) {
        var node = targets[i];
        if (!node) continue;
        if (node.getAttribute("data-tooltip") === tip) continue;
        if (global6.Tooltips && global6.Tooltips.set) {
          global6.Tooltips.set(node, tip, { ariaLabel: false });
        } else if (tip) {
          node.setAttribute("data-tooltip", tip);
        }
      }
    }
    var REEL_TICK_MS = 320;
    var REEL_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
    var REEL_CLICK_EASE = "cubic-bezier(0.34, 1.22, 0.64, 1)";
    var REEL_OUT_MS = 150;
    var COMMIT_IN_MS = 280;
    function buildStepCopy(step) {
      var rowCopy = el4("div", "harpoon-lab-auto-step-copy");
      var verb = el4("span", "harpoon-lab-auto-move move-" + (step.move || "move"));
      verb.textContent = step.move || "move";
      rowCopy.appendChild(verb);
      rowCopy.appendChild(el4("span", "harpoon-lab-auto-why", moveLead(step)));
      return rowCopy;
    }
    function installCommittedRow(row, step, animate) {
      row.classList.remove("is-working", "is-committing", "is-selected", "is-settling", "is-fresh");
      var conveyor = row.querySelector(".harpoon-conveyor");
      if (conveyor) conveyor.parentNode.removeChild(conveyor);
      var spine = row.querySelector(".harpoon-lab-auto-node");
      if (spine) spine.classList.remove("is-live");
      else row.insertBefore(el4("span", "harpoon-lab-auto-node"), row.firstChild);
      var priorBody = row.querySelector(".harpoon-lab-auto-step-body");
      if (priorBody) priorBody.parentNode.removeChild(priorBody);
      var priorCopy = row.querySelector(":scope > .harpoon-lab-auto-step-copy");
      if (priorCopy) priorCopy.parentNode.removeChild(priorCopy);
      var priorFacet = row.querySelector(":scope > .hpt-move-facet, :scope > .hpt-chain");
      if (priorFacet) priorFacet.parentNode.removeChild(priorFacet);
      var body = el4("div", "harpoon-lab-auto-step-body");
      var copy = buildStepCopy(step);
      if (animate) copy.classList.add("is-reveal");
      body.appendChild(copy);
      appendMoveFacet(body, step);
      row.appendChild(body);
      bindStepGoalTip2(copy.querySelector(".harpoon-lab-auto-move"), step.goal);
    }
    function reelMotionOk() {
      if (typeof Persist !== "undefined" && typeof Persist.prefersReducedMotion === "function") {
        return !Persist.prefersReducedMotion();
      }
      return !(global6.matchMedia && global6.matchMedia("(prefers-reduced-motion: reduce)").matches);
    }
    function reelClearMotion(el5) {
      if (!el5) return;
      el5.style.transition = "";
      el5.style.transform = "";
    }
    function reelAnimateTick(conveyor, newChip, existingEls, oldRects) {
      if (!reelMotionOk() || !newChip) return;
      var dur = REEL_TICK_MS;
      var conveyorRect = conveyor.getBoundingClientRect();
      var chipRect = newChip.getBoundingClientRect();
      var spawnX = conveyorRect.right - chipRect.left + 8;
      newChip.style.transform = "translateX(" + spawnX + "px)";
      var i, el5, neu, dx;
      for (i = 0; i < existingEls.length; i += 1) {
        el5 = existingEls[i];
        if (el5.classList.contains("is-rejected")) continue;
        neu = el5.getBoundingClientRect();
        dx = oldRects[i].left - neu.left;
        if (Math.abs(dx) > 0.5) {
          el5.style.transition = "none";
          el5.style.transform = "translateX(" + dx + "px)";
        }
      }
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          var trailTrans = "transform " + dur + "ms " + REEL_EASE;
          for (i = 0; i < existingEls.length; i += 1) {
            el5 = existingEls[i];
            if (el5.classList.contains("is-rejected")) continue;
            el5.style.transition = trailTrans;
            el5.style.transform = "";
          }
          newChip.style.transition = "transform " + dur + "ms " + REEL_CLICK_EASE;
          newChip.style.transform = "";
          var finished = false;
          function done() {
            if (finished) return;
            finished = true;
            for (i = 0; i < existingEls.length; i += 1) {
              if (!existingEls[i].classList.contains("is-rejected")) reelClearMotion(existingEls[i]);
            }
            reelClearMotion(newChip);
            newChip.classList.add("is-landing");
            newChip.addEventListener("animationend", function() {
              newChip.classList.remove("is-landing");
            }, { once: true });
          }
          newChip.addEventListener("transitionend", function(e) {
            if (e.propertyName === "transform") done();
          });
          setTimeout(done, dur + 48);
        });
      });
    }
    function makeBranchGroup(branch, i) {
      var group = el4("li", "harpoon-lab-auto-branch");
      if (i != null) group.style.setProperty("--i", String(i));
      var caseRow = el4("div", "harpoon-lab-auto-case");
      caseRow.appendChild(el4("span", "harpoon-lab-auto-case-node"));
      var head = el4("div", "harpoon-lab-auto-branch-head");
      var label = el4("span", "harpoon-lab-auto-branch-label", "case");
      head.appendChild(label);
      var pat = el4("code", "harpoon-lab-auto-branch-pat");
      renderType3(pat, branch);
      head.appendChild(pat);
      bindChipTip2(label, "Case pattern; nested steps solve this branch", branch, "type", "below");
      caseRow.appendChild(head);
      group.appendChild(caseRow);
      var host = el4("ol", "harpoon-lab-auto-branch-steps");
      group.appendChild(host);
      return { group, host };
    }
    function appendCommittedStepRow(record, s, i) {
      var b = s.branch || null;
      var host = record._branchHost || record;
      if (b !== record._lastBranch) {
        record._lastBranch = b;
        if (b) {
          var made = makeBranchGroup(b, i);
          record.appendChild(made.group);
          host = made.host;
          record._branchHost = host;
        } else {
          host = record;
          record._branchHost = null;
        }
      }
      return appendAutoStepRow(host, s, i);
    }
    function appendAutoTree(trail, steps) {
      var lastBranch = null;
      var host = trail;
      steps.forEach(function(s, i) {
        var b = s.branch || null;
        if (b !== lastBranch) {
          lastBranch = b;
          if (b) {
            var made = makeBranchGroup(b, i);
            trail.appendChild(made.group);
            host = made.host;
          } else {
            host = trail;
          }
        }
        appendAutoStepRow(host, s, i);
      });
    }
    function refreshNativeAutoGoalDisplay() {
      var na = this.nativeAuto;
      if (!na || !na.goalType || !this._autoGoalWrap) return;
      if (na.phase === "solved" || na.complete) return;
      var hero = resolveNativeAutoGoalDisplay(this, na);
      na.goalType = hero.goalType;
      na.goalState = hero.goalState;
      na.priorBinders = priorGoalBinders2(this, na.sourceGoalType, hero.goalType);
      var goalHost = this._autoGoalWrap.querySelector(".harpoon-hole-goal");
      var ed = E3();
      if (goalHost && ed && typeof ed.mountHoleGoalTier === "function") {
        ed.mountHoleGoalTier(goalHost, {
          surface: "lab",
          goalState: hero.goalState,
          goal: hero.goalType
        });
      }
      mountGoalPriors2(this._autoGoalWrap, na.priorBinders);
    }
    ;
    function clearNativeAutoShell() {
      if (this.stopReelClock) this.stopReelClock();
      if (this._settleTimer) {
        clearTimeout(this._settleTimer);
        this._settleTimer = null;
      }
      if (this._settleFlush) {
        this._settleFlush = null;
      }
      this._autoSearchBox = null;
      this._autoSearchText = null;
      this._autoTrail = null;
      this._autoLiveTree = null;
      this._autoLiveCount = 0;
      this._autoPauseBtn = null;
      this._autoGoalWrap = null;
      this._compromiseBanner = null;
      this._reelRecord = null;
      this._reelRecordCount = 0;
      this._autoSearchSpinner = null;
      this._workingRow = null;
      this._workingStrip = null;
      this._workingChips = null;
      this._settleTimer = null;
      this._settleFlush = null;
    }
    ;
    function syncAutoPauseBtn() {
      var na = this.nativeAuto;
      var btn = this._autoPauseBtn;
      if (!na || !btn) return;
      var paused = !!na.paused;
      if (btn._belPauseState !== paused) {
        btn._belPauseState = paused;
        btn.innerHTML = paused ? ICON_PLAY2 : ICON_PAUSE2;
        btn.setAttribute("aria-label", paused ? "Resume search" : "Pause search");
        if (global6.Tooltips && global6.Tooltips.set) {
          global6.Tooltips.set(btn, paused ? "Resume" : "Pause");
        }
      }
      if (this._autoSearchBox) {
        this._autoSearchBox.classList.toggle("is-paused", paused);
      }
    }
    ;
    function updateNativeAutoSearch() {
      var na = this.nativeAuto;
      if (!na || na.phase !== "searching") return;
      if (this._reelRecord && this._reelRecord.querySelector(".harpoon-lab-auto-step.is-committing")) {
        this.syncReelStatus();
        this.syncAutoPauseBtn();
        return;
      }
      if (this._reelRecord && this._reelRecordCount < (na.steps || []).length) {
        for (var i = this._reelRecordCount; i < na.steps.length; i += 1) {
          appendCommittedStepRow(this._reelRecord, na.steps[i], i);
        }
        this._reelRecordCount = na.steps.length;
      }
      this.syncReelStatus();
      this.syncAutoPauseBtn();
    }
    ;
    function syncReelStatus() {
      var na = this.nativeAuto;
      if (!na) return;
      if (this._autoSearchText) this._autoSearchText.textContent = nativeAutoSearchLabel(na);
      syncReelStatTips(this, na);
      this.syncAutoPauseBtn();
    }
    ;
    function ensureWorkingRow() {
      if (!this._reelRecord) return null;
      if (this._workingRow && this._workingRow.isConnected && !this._workingRow.classList.contains("is-committing")) {
        return this._workingRow;
      }
      var i = this._reelRecordCount || 0;
      var item = el4("li", "harpoon-lab-auto-step is-working");
      item.style.setProperty("--i", String(i));
      item.appendChild(el4("span", "harpoon-lab-auto-node is-live"));
      var lane = el4("div", "harpoon-conveyor");
      var strip = el4("div", "harpoon-conveyor-strip");
      lane.appendChild(strip);
      item.appendChild(lane);
      var host = this._reelRecord._branchHost || this._reelRecord;
      host.appendChild(item);
      this._workingRow = item;
      this._workingStrip = strip;
      this._workingChips = [];
      return item;
    }
    ;
    function feedConveyor(wave) {
      var strip = this.ensureWorkingRow() && this._workingStrip;
      if (!strip) return;
      var conveyor = strip.parentElement;
      var motionOk = reelMotionOk();
      for (var i = 0; i < wave.length; i += 1) {
        var c = wave[i];
        var prev = this._workingChips[this._workingChips.length - 1];
        if (prev && prev.el) {
          prev.el.classList.remove("is-focus");
          prev.el.classList.add("is-trail");
        }
        var existingEls = motionOk ? Array.prototype.slice.call(strip.children) : [];
        var oldRects = motionOk ? existingEls.map(function(node) {
          return node.getBoundingClientRect();
        }) : [];
        var chip = el4("div", "harpoon-conveyor-chip is-trying is-focus move-" + (c.kind || "move"));
        chip.appendChild(el4("span", "harpoon-conveyor-kind", c.kind || "move"));
        var term = el4("code", "harpoon-conveyor-term");
        renderSource2(term, c.head || "");
        chip.appendChild(term);
        strip.appendChild(chip);
        this._workingChips.push({ kind: c.kind, head: c.head, status: "trying", el: chip });
        if (motionOk) reelAnimateTick(conveyor, chip, existingEls, oldRects);
      }
      this.trimConveyor();
    }
    ;
    function markConveyor(v) {
      var na = this.nativeAuto;
      var chips = this._workingChips || [];
      var entry = null;
      for (var i = chips.length - 1; i >= 0; i -= 1) {
        if (chips[i].status === "trying" && chips[i].kind === v.kind && chips[i].head === v.head) {
          entry = chips[i];
          break;
        }
      }
      if (!entry) {
        this.feedConveyor([{ kind: v.kind, head: v.head }]);
        entry = this._workingChips[this._workingChips.length - 1];
      }
      if (!entry && v.verdict === "accepted") {
        for (var j = chips.length - 1; j >= 0; j -= 1) {
          var trail = chips[j];
          if (trail.status === "trying" && trail.kind === v.kind && trail.el && trail.el.classList.contains("is-focus")) {
            entry = trail;
            break;
          }
        }
      }
      if (!entry || !entry.el) return;
      entry.status = v.verdict === "accepted" ? "won" : "rejected";
      entry.reason = v.reason || null;
      entry.el.classList.remove("is-trying", "is-focus", "is-trail");
      entry.el.classList.toggle("is-won", entry.status === "won");
      entry.el.classList.toggle("is-rejected", entry.status === "rejected");
      if (entry.status === "rejected") {
        if (entry.reason) setTip2(entry.el, entry.reason, { ariaLabel: false });
        if (na) na.checks = (na.checks || 0) + 1;
      }
    }
    ;
    function trimConveyor() {
      var MAX = 6;
      var chips = this._workingChips || [];
      var motionOk = reelMotionOk();
      while (chips.length > MAX) {
        var old = chips.shift();
        if (!old || !old.el || !old.el.parentNode) continue;
        var node = old.el;
        if (motionOk) {
          node.style.transition = "transform 220ms " + REEL_EASE + ", opacity 220ms ease";
          node.style.transform = "translateX(-1.4rem)";
          node.style.opacity = "0";
          setTimeout(function(n) {
            if (n.parentNode) n.parentNode.removeChild(n);
            reelClearMotion(n);
          }, 230, node);
        } else {
          node.parentNode.removeChild(node);
        }
      }
    }
    ;
    function settleWorkingRow(step, i) {
      var row = this._workingRow;
      if (!row || !row.isConnected) {
        appendCommittedStepRow(this._reelRecord, step, i);
        this._reelRecordCount = Math.max(this._reelRecordCount, i + 1);
        return;
      }
      var self = this;
      if (this._settleTimer) {
        clearTimeout(this._settleTimer);
        this._settleTimer = null;
        if (this._settleFlush) {
          this._settleFlush();
          this._settleFlush = null;
        }
      }
      var motionOk = reelMotionOk();
      this._reelRecordCount = Math.max(this._reelRecordCount, i + 1);
      this._workingRow = null;
      this._workingStrip = null;
      this._workingChips = [];
      function finish() {
        self._settleTimer = null;
        self._settleFlush = null;
        if (!row.isConnected) return;
        installCommittedRow(row, step, motionOk);
        var b = step.branch || null;
        if (b !== self._reelRecord._lastBranch) {
          self._reelRecord._lastBranch = b;
          self._reelRecord._branchHost = b ? self._makeBranchGroup(b, i) : null;
        }
        self.refreshTreeExplorer();
      }
      this._settleFlush = finish;
      if (motionOk) {
        var spine = row.querySelector(".harpoon-lab-auto-node");
        if (spine) spine.classList.remove("is-live");
        row.classList.add("is-committing");
        this._settleTimer = setTimeout(finish, REEL_OUT_MS);
      } else {
        finish();
      }
    }
    ;
    function _makeBranchGroup(branch, i) {
      var made = makeBranchGroup(branch, i);
      this._reelRecord.appendChild(made.group);
      return made.host;
    }
    ;
    function startReelClock() {
      var self = this;
      this.stopReelClock();
      this._reelClock = setInterval(function() {
        var na = self.nativeAuto;
        if (!na || na.phase !== "searching") {
          self.stopReelClock();
          return;
        }
        if (self._autoSearchText) self._autoSearchText.textContent = nativeAutoSearchLabel(na);
        syncReelStatTips(self, na);
      }, 200);
    }
    ;
    function stopReelClock() {
      if (this._reelClock) {
        clearInterval(this._reelClock);
        this._reelClock = null;
      }
    }
    ;
    return {
      appendAutoStepRow,
      reelStatText,
      syncReelStatTips,
      buildStepCopy,
      installCommittedRow,
      reelMotionOk,
      reelClearMotion,
      reelAnimateTick,
      makeBranchGroup,
      appendCommittedStepRow,
      appendAutoTree,
      refreshNativeAutoGoalDisplay,
      clearNativeAutoShell,
      syncAutoPauseBtn,
      updateNativeAutoSearch,
      syncReelStatus,
      ensureWorkingRow,
      feedConveyor,
      markConveyor,
      trimConveyor,
      settleWorkingRow,
      _makeBranchGroup,
      startReelClock,
      stopReelClock
    };
  }

  // js/harpoon/harpoon-lab-auto.mjs
  function createAuto(deps) {
    var el4 = deps.el;
    var iconBtn2 = deps.iconBtn;
    var setTip2 = deps.setTip;
    var renderType3 = deps.renderType;
    var renderSource2 = deps.renderSource;
    var nativeAutoSearchLabel = deps.nativeAutoSearchLabel;
    var autoSubtext = deps.autoSubtext;
    var autoVerdictTitle = deps.autoVerdictTitle;
    var autoVerdictTone = deps.autoVerdictTone;
    var appendAutoGoalHero = deps.appendAutoGoalHero;
    var resolveNativeAutoGoalDisplay = deps.resolveNativeAutoGoalDisplay;
    var priorGoalBinders2 = deps.priorGoalBinders;
    var setNativeSearchLabel2 = deps.setNativeSearchLabel;
    var appendCommittedStepRow = deps.appendCommittedStepRow;
    var solvedBodyOf2 = deps.solvedBodyOf;
    var buildBannerShell2 = deps.buildBannerShell;
    var stageNode2 = deps.stageNode;
    var appendAutoSolution = deps.appendAutoSolution;
    var buildPlaceStrip2 = deps.buildPlaceStrip;
    var renderCommitOutcome2 = deps.renderCommitOutcome;
    var ICON_PLAY2 = deps.ICON_PLAY;
    var ICON_PAUSE2 = deps.ICON_PAUSE;
    var ICON_POPOUT2 = deps.ICON_POPOUT;
    var ICON_CHECK2 = deps.ICON_CHECK;
    var ICON_STOP2 = deps.ICON_STOP;
    function renderNativeAuto(parent) {
      var na = this.nativeAuto;
      if (!na) return;
      var self = this;
      var box = el4("div", "harpoon-lab-auto is-" + na.phase + (na.paused ? " is-paused" : "") + (self.isFrozenRetrospective() ? " is-frozen" : ""));
      var stage = 0;
      if (!self.isFrozenRetrospective()) this.renderCompromiseBanner(box);
      if (na.goalType) {
        var hero = resolveNativeAutoGoalDisplay(self, na);
        var heroPriors = hero.goalType === na.goalType ? na.priorBinders : priorGoalBinders2(self, na.sourceGoalType, hero.goalType);
        this._autoGoalWrap = appendAutoGoalHero(
          box,
          hero.goalType,
          na.declName,
          hero.goalState,
          heroPriors
        );
      }
      if (na.phase === "searching") {
        var controls = el4("div", "harpoon-lab-auto-controls");
        var searching = el4("div", "harpoon-lab-auto-searching");
        var spinnerEl = el4("span", "inspector-spinner harpoon-lab-auto-searching-spinner");
        spinnerEl.setAttribute("aria-hidden", "true");
        var searchTextEl = el4(
          "span",
          "harpoon-lab-auto-searching-text beljar-tip-shimmer",
          nativeAutoSearchLabel(na)
        );
        searchTextEl.style.setProperty("--shimmer-accent", "var(--repl-holes-accent)");
        searching.appendChild(spinnerEl);
        searching.appendChild(searchTextEl);
        controls.appendChild(searching);
        var pauseBtn = iconBtn2(
          "icon-btn harpoon-lab-auto-pause",
          na.paused ? ICON_PLAY2 : ICON_PAUSE2,
          na.paused ? "Resume search" : "Pause search",
          na.paused ? "Resume" : "Pause",
          function() {
            if (!self.nativeAuto || self.nativeAuto.phase !== "searching") return;
            self.nativeAuto.paused = !self.nativeAuto.paused;
            if (self.nativeAuto.paused) {
              setNativeSearchLabel2(self.nativeAuto, "Paused");
            } else {
              setNativeSearchLabel2(self.nativeAuto, "Resuming\u2026");
            }
            self.updateNativeAutoSearch();
          }
        );
        controls.appendChild(pauseBtn);
        var livePop = iconBtn2(
          "icon-btn harpoon-lab-auto-popout",
          ICON_POPOUT2,
          "Open the proof tree explorer (grows live)",
          "Pop out tree",
          function() {
            self.openTreeExplorer();
          }
        );
        controls.appendChild(livePop);
        box.appendChild(controls);
        var live = el4("div", "harpoon-reel");
        var record = el4("ol", "harpoon-lab-auto-trail harpoon-reel-record is-live");
        live.appendChild(record);
        box.appendChild(live);
        this._autoSearchBox = box;
        this._autoSearchText = searchTextEl;
        this._autoSearchSpinner = spinnerEl;
        this._autoTrail = null;
        this._autoLiveTree = null;
        this._autoLiveCount = 0;
        this._autoPauseBtn = pauseBtn;
        this._reelRecord = record;
        this._reelRecordCount = 0;
        this._workingRow = null;
        this._workingStrip = null;
        this._workingChips = [];
        record._lastBranch = null;
        record._branchHost = null;
        pauseBtn._belPauseState = !!na.paused;
        parent.appendChild(box);
        for (var si = 0; si < (na.steps || []).length; si += 1) {
          appendCommittedStepRow(record, na.steps[si], si);
        }
        this._reelRecordCount = (na.steps || []).length;
        this.syncReelStatus();
        this.startReelClock();
        return;
      }
      if (na.complete) {
        var solutionBody = solvedBodyOf2(na.code, na.declName || this.prep && this.prep.name);
      }
      var sub = autoSubtext(na);
      var head = buildBannerShell2({
        className: "harpoon-lab-auto-head harpoon-lab-strip harpoon-lab-banner " + (na.complete ? "is-solved" : "is-stuck") + (self._verdictPopPlayed ? " is-verdict-seen" : ""),
        tone: autoVerdictTone(na),
        icon: na.complete ? ICON_CHECK2 : ICON_STOP2,
        badgeClass: "harpoon-lab-auto-badge" + (na.complete ? " is-solved" : " is-stuck"),
        copyClass: "harpoon-lab-auto-head-copy",
        titleClass: "harpoon-lab-auto-title",
        subClass: "harpoon-lab-auto-sub",
        title: autoVerdictTitle(na),
        sub
      });
      stageNode2(head, stage);
      stage += 1;
      box.appendChild(head);
      if (na.complete) self._verdictPopPlayed = true;
      if (!na.complete && na.stuck && na.stuck.goal) {
        var stuckCard = this.renderStuckCard(na);
        stageNode2(stuckCard, stage);
        stage += 1;
        box.appendChild(stuckCard);
      }
      if (!na.complete && na.stuck && na.stuck.reason === "file-errors" && na.stuck.error) {
        var errWrap = el4("div", "harpoon-lab-auto-stuck harpoon-lab-auto-panel tone-error");
        errWrap.appendChild(el4("span", "harpoon-lab-auto-stuck-label", "Checker error"));
        errWrap.appendChild(el4("div", "harpoon-lab-auto-stuck-goal", na.stuck.error));
        stageNode2(errWrap, stage);
        stage += 1;
        box.appendChild(errWrap);
      }
      if (na.complete) {
        var commit = self.getCommitState();
        if (commit.status === "failed" || commit.status === "placed" && !commit.dismissed) {
          stageNode2(
            renderCommitOutcome2(
              box,
              commit,
              na.declName || self.prep && self.prep.name,
              commit.canRetry ? function() {
                self.resetCommitForRetry();
              } : null
            ),
            stage
          );
          stage += 1;
        } else if (commit.status !== "placed") {
          var blocked = self.compromise && self.compromise.level === "block";
          var place2 = buildPlaceStrip2(self, {
            blocked,
            extraCls: " harpoon-lab-auto-place is-instant",
            title: "Place the proof",
            onClick: function() {
              self.commitNativeAuto();
            }
          });
          stageNode2(place2, stage);
          stage += 1;
          box.appendChild(place2);
          if (commit.status === "checking") self.updateCommitPlace();
        }
        if (solutionBody) {
          stageNode2(appendAutoSolution(box, solutionBody), stage);
          stage += 1;
        }
      }
      var steps = na.steps || [];
      if (steps.length) {
        var derivSection = this.renderDerivationSection(box, na);
        stageNode2(derivSection, stage);
        box.appendChild(derivSection);
        stage += 1;
      }
      parent.appendChild(box);
    }
    ;
    function stuckWhere(stuck) {
      if (!stuck) return "";
      var h = stuck.hole || null;
      if (h && h.name) return h.name;
      if (h && typeof h.line === "number") return "line " + (h.line + 1) + (typeof h.col === "number" ? ":" + (h.col + 1) : "");
      return "";
    }
    function stuckReason(reason) {
      if (!reason) return "";
      return String(reason).replace(/^File\s+"[^"]*",\s*line\s+\d+,\s*column\s+\d+\s*/i, "").replace(/^Error:\s*/i, "").trim();
    }
    var STUCK_REASON = {
      "no-move": "no move certified",
      "step-bound": "step limit",
      "search-bound": "search bound hit",
      "file-errors": "file errors",
      "coinductive-out-of-fragment": "coinductive goal \u2014 out of fragment",
      "no-totality-measure": "no totality measure \u2014 recursion unavailable",
      stopped: "stopped",
      cancelled: "cancelled"
    };
    function renderStuckCard(na) {
      var stuck = na.stuck;
      var card = el4("div", "harpoon-lab-auto-stuck harpoon-lab-auto-panel tone-warn harpoon-stuck");
      var head = el4("div", "harpoon-stuck-head");
      head.appendChild(el4("span", "harpoon-lab-auto-stuck-label", STUCK_REASON[stuck.reason] || stuck.reason || "stuck"));
      var where = stuckWhere(stuck);
      if (where) head.appendChild(el4("code", "harpoon-stuck-where", where));
      card.appendChild(head);
      if (stuck.goal) {
        var goal = el4("div", "harpoon-hole-goal harpoon-lab-auto-stuck-goal");
        renderType3(goal, stuck.goal);
        card.appendChild(goal);
      }
      var stuckTrace = null;
      var trace = na.trace || null;
      if (trace) {
        for (var t = 0; t < trace.length; t += 1) {
          if (!trace[t].advanced) stuckTrace = trace[t];
        }
      }
      var tried = stuckTrace && stuckTrace.tried || [];
      var rejected = tried.filter(function(v) {
        return v.verdict === "rejected";
      });
      var guarded = tried.filter(function(v) {
        return v.verdict === "guard";
      });
      if (rejected.length || guarded.length) {
        card.appendChild(el4(
          "div",
          "harpoon-stuck-sub",
          rejected.length + " rejected by the checker" + (guarded.length ? " \xB7 " + guarded.length + " skipped" : "")
        ));
        var list = el4("ul", "harpoon-stuck-tried");
        var addRow = function(v) {
          var li = el4("li", "harpoon-stuck-tried-row is-" + v.verdict);
          li.appendChild(el4("span", "hpt-card-kind hpt-kind--" + v.kind, v.kind));
          var hd = el4("code", "harpoon-stuck-tried-head");
          renderSource2(hd, v.head);
          li.appendChild(hd);
          var reason = stuckReason(v.reason);
          if (reason) {
            var rn = el4("span", "harpoon-stuck-tried-reason", reason);
            setTip2(rn, v.reason, { ariaLabel: false });
            li.appendChild(rn);
          }
          list.appendChild(li);
        };
        rejected.forEach(addRow);
        guarded.forEach(addRow);
        card.appendChild(list);
      } else if (stuck.reason === "no-move") {
        card.appendChild(el4("div", "harpoon-stuck-sub", "no candidate reached this goal"));
      }
      return card;
    }
    ;
    return {
      renderNativeAuto,
      stuckWhere,
      stuckReason,
      renderStuckCard
    };
  }

  // js/harpoon/harpoon-lab-tree-ui.mjs
  var global7 = globalThis;
  function createTreeUi(deps) {
    var el4 = deps.el;
    var iconBtn2 = deps.iconBtn;
    var setTip2 = deps.setTip;
    var bindChipTip2 = deps.bindChipTip;
    var renderType3 = deps.renderType;
    var renderSource2 = deps.renderSource;
    var appendAutoTree = deps.appendAutoTree;
    var nativeAutoSearchLabel = deps.nativeAutoSearchLabel;
    var reelStatText = deps.reelStatText;
    var autoSubtext = deps.autoSubtext;
    var autoVerdictTitle = deps.autoVerdictTitle;
    var deriveMoveLead = deps.deriveMoveLead;
    var liveFileText2 = deps.liveFileText;
    var lineColToOffset2 = deps.lineColToOffset;
    var labTitle2 = deps.labTitle;
    var FW2 = deps.FW;
    var E3 = deps.E;
    var ICON_POPOUT2 = deps.ICON_POPOUT;
    var ICON_CHEVRON_LEFT2 = deps.ICON_CHEVRON_LEFT;
    var ICON_CHEVRON_RIGHT2 = deps.ICON_CHEVRON_RIGHT;
    function renderDerivationSection(box, na) {
      var self = this;
      var section = el4("div", "harpoon-deriv");
      var header = el4("div", "harpoon-deriv-header");
      header.appendChild(el4("span", "harpoon-lab-section-label is-steps", "Derivation"));
      var toggle = el4("div", "harpoon-deriv-toggle");
      var views = [["list", "List"], ["tree", "Tree"]];
      var view = "list";
      var listHost = el4("ol", "harpoon-lab-auto-trail is-instant");
      appendAutoTree(listHost, na.steps || []);
      var treeHost = el4("div", "harpoon-deriv-treehost");
      var treeDrawn = false;
      function showView(v) {
        view = v;
        listHost.hidden = v !== "list";
        treeHost.hidden = v !== "tree";
        toggle.querySelectorAll(".harpoon-deriv-tab").forEach(function(t) {
          t.classList.toggle("is-active", t.dataset.view === v);
        });
        if (v === "tree" && !treeDrawn) {
          treeDrawn = true;
          var mounted = self.mountTreePanel(treeHost, na, { compact: true, live: true });
          self._compactTreeRedraw = mounted.redraw;
        }
      }
      views.forEach(function(vv) {
        var t = el4("button", "harpoon-deriv-tab" + (vv[0] === view ? " is-active" : ""), vv[1]);
        t.type = "button";
        t.dataset.view = vv[0];
        t.addEventListener("click", function() {
          if (view !== vv[0]) showView(vv[0]);
        });
        toggle.appendChild(t);
      });
      header.appendChild(toggle);
      var popBtn = iconBtn2(
        "icon-btn harpoon-deriv-popout",
        ICON_POPOUT2,
        "Open the proof tree explorer",
        "Pop out tree",
        function() {
          self.openTreeExplorer();
        }
      );
      header.appendChild(popBtn);
      section.appendChild(header);
      treeHost.hidden = true;
      section.appendChild(listHost);
      section.appendChild(treeHost);
      return section;
    }
    ;
    function mountTreePanel(host, na, opts) {
      var self = this;
      opts = opts || {};
      host.textContent = "";
      var wrap = el4("div", "hpt-panel" + (opts.compact ? " is-compact" : " is-roomy"));
      var mode = "path";
      var selectedNodeId = null;
      var treeHost = el4("div", "hpt-host");
      var card = el4("div", "hpt-card");
      card.hidden = true;
      var userView = null;
      function cur() {
        return opts.live ? self.nativeAuto || na : na;
      }
      function draw() {
        if (!global7.HarpoonTree) return;
        var n = cur();
        var root = global7.HarpoonTree.buildModel({
          steps: n.steps || [],
          trace: n.trace || null,
          complete: !!n.complete,
          stuck: n.complete ? null : n.stuck,
          name: self.prep && self.prep.name || n.declName || "theorem",
          goalType: n.goalType || "",
          theoremSnapshot: n.theoremSnapshot || null
        });
        global7.HarpoonTree.render(treeHost, root, {
          mode,
          instant: !!opts.live,
          selectedId: selectedNodeId,
          initialView: userView,
          onViewChange: function(vb) {
            userView = vb;
          },
          onSelect: function(nn) {
            selectedNodeId = nn && nn.id != null ? nn.id : null;
            card._hptEverSelected = true;
            self.renderTreeDetail(card, nn, detailCtx(mode));
          }
        });
        if (opts.compact === false && !card._hptEverSelected) {
          self.renderTreeDetail(card, null, detailCtx(mode));
        }
      }
      function resetView() {
        userView = null;
        draw();
      }
      function detailCtx(treeMode) {
        var n = cur();
        return {
          na: n,
          declName: self.prep && self.prep.name || n.declName || "theorem",
          treeMode: treeMode || mode
        };
      }
      if (global7.Menu && global7.Menu.bindContextMenu) {
        global7.Menu.bindContextMenu(treeHost, function() {
          var hasTrace = !!(cur().trace && cur().trace.length);
          return [
            {
              label: mode === "space" ? "Hide rejected moves" : "Show full move space",
              disabled: !hasTrace,
              onSelect: function() {
                mode = mode === "space" ? "path" : "space";
                draw();
              }
            },
            { type: "separator" },
            { label: "Fit to view", onSelect: resetView }
          ];
        }, { side: "bottom", align: "start" });
      }
      if (opts.compact) {
        wrap.appendChild(treeHost);
        wrap.appendChild(card);
      } else {
        let applyCollapsed = function() {
          split.classList.toggle("is-rail-collapsed", collapsed);
          rail.classList.toggle("is-collapsed", collapsed);
          toggle.innerHTML = collapsed ? ICON_CHEVRON_LEFT2 : ICON_CHEVRON_RIGHT2;
          var tip = collapsed ? "Show details panel" : "Hide details panel";
          setTip2(toggle, tip);
          toggle.setAttribute("aria-label", tip);
          toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        };
        var split = el4("div", "hpt-split");
        var left = el4("div", "hpt-split-tree");
        left.appendChild(treeHost);
        var rail = el4("div", "hpt-split-rail");
        card.hidden = false;
        card.classList.add("is-rail");
        card._hptEverSelected = false;
        self.renderTreeDetail(card, null, detailCtx(mode));
        var persist = global7.Persist;
        var collapsed = !!(persist && persist.readStoredHarpoonDetailsCollapsed && persist.readStoredHarpoonDetailsCollapsed());
        var railHead = el4("div", "hpt-rail-head");
        var railTitle = el4("span", "hpt-rail-title", "Details");
        var toggle = el4("button", "icon-btn hpt-rail-toggle");
        toggle.type = "button";
        railHead.appendChild(railTitle);
        railHead.appendChild(toggle);
        toggle.addEventListener("click", function() {
          collapsed = !collapsed;
          if (persist && persist.writeStoredHarpoonDetailsCollapsed) {
            persist.writeStoredHarpoonDetailsCollapsed(collapsed);
          }
          applyCollapsed();
        });
        rail.appendChild(railHead);
        rail.appendChild(card);
        applyCollapsed();
        split.appendChild(left);
        split.appendChild(rail);
        wrap.appendChild(split);
      }
      host.appendChild(wrap);
      draw();
      return { wrap, redraw: draw };
    }
    ;
    function openTreeExplorer() {
      var self = this;
      var fw = FW2();
      var na = this.nativeAuto;
      if (!fw || !na) return;
      if (this._treeWin) {
        this._treeWin.raise && this._treeWin.raise();
        return;
      }
      var live = na.phase === "searching";
      var content = el4("div", "harpoon-tree-explorer" + (live ? " is-live" : ""));
      var mounted = this.mountTreePanel(content, na, { compact: false, live });
      this._treeRedraw = mounted.redraw;
      var name = this.prep && this.prep.name || na.declName || "theorem";
      this._treeWin = fw.open({
        title: labTitle2(name + " \xB7 proof tree"),
        className: "harpoon-tree-window",
        content,
        width: 760,
        height: 560,
        minWidth: 420,
        minHeight: 320,
        onClose: function() {
          self._treeWin = null;
          self._treeRedraw = null;
        }
      });
    }
    ;
    function refreshTreeExplorer() {
      var self = this;
      if (!this._treeRedraw || this._treeRedrawPending) return;
      this._treeRedrawPending = true;
      requestAnimationFrame(function() {
        self._treeRedrawPending = false;
        if (self._treeRedraw) self._treeRedraw();
        if (self._compactTreeRedraw) self._compactTreeRedraw();
      });
    }
    ;
    function renderSynthChain2(meta, variant) {
      var chain = meta && meta.chain || [];
      if (!chain.length) return null;
      var refutation = !!(meta && meta.refutation);
      var links = chain.filter(function(c) {
        return c !== "impossible";
      });
      var wrap = el4("div", "hpt-chain" + (variant === "inline" ? " is-inline" : "") + (variant === "rail" ? " is-rail" : "") + (refutation ? " is-refutation" : ""));
      if (variant === "full") {
        wrap.appendChild(el4(
          "div",
          "hpt-chain-label",
          refutation ? "Refutation \u2014 derived to a contradiction" : "Synthesis \u2014 backward-chained " + links.length + " step" + (links.length === 1 ? "" : "s")
        ));
      }
      var seq = el4("div", "hpt-chain-seq");
      var linkTotal = links.length;
      links.forEach(function(name, i) {
        if (i > 0) seq.appendChild(el4("span", "hpt-chain-arrow", "\u2192"));
        var stepNum = i + 1;
        var isClose = i === links.length - 1 && !refutation;
        var stepTip = isClose ? "Calls " + name + " and closes this subgoal (" + stepNum + " of " + linkTotal + ")" : "Calls " + name + " (" + stepNum + " of " + linkTotal + ")";
        if (variant === "rail") {
          var railNm = el4("code", "hpt-chain-name");
          railNm.textContent = name;
          bindChipTip2(railNm, stepTip);
          seq.appendChild(railNm);
          return;
        }
        var link = el4("span", "hpt-chain-link" + (isClose ? " is-close" : ""));
        link.appendChild(el4("span", "hpt-chain-idx", String(stepNum)));
        var nm = el4("code", "hpt-chain-name");
        nm.textContent = name;
        link.appendChild(nm);
        bindChipTip2(link, stepTip);
        seq.appendChild(link);
      });
      if (refutation) {
        seq.appendChild(el4("span", "hpt-chain-arrow", "\u2192"));
        if (variant === "rail") {
          var railImp = el4("code", "hpt-chain-name is-impossible", "impossible");
          bindChipTip2(railImp, "This branch is impossible (contradiction)");
          seq.appendChild(railImp);
        } else {
          var impLink = el4("span", "hpt-chain-link is-impossible", "impossible");
          bindChipTip2(impLink, "This branch is impossible (contradiction)");
          seq.appendChild(impLink);
        }
      }
      wrap.appendChild(seq);
      if (variant === "full") {
        var refuted = meta.uses && meta.uses.length ? meta.uses[meta.uses.length - 1] : null;
        var note = el4("div", "hpt-chain-note");
        if (!refutation) {
          note.textContent = "the final rule closes the goal";
        } else if (refuted) {
          note.appendChild(document.createTextNode("these rules refute "));
          var rc = el4("code", "hpt-chain-refuted");
          rc.textContent = refuted;
          note.appendChild(rc);
        } else {
          note.textContent = "these rules refute a hypothesis";
        }
        wrap.appendChild(note);
      }
      return wrap;
    }
    function detailSection(label, bodyEl2) {
      var sec = el4("div", "hpt-detail-section");
      if (label) sec.appendChild(el4("span", "harpoon-lab-section-label", label));
      var body = el4("div", "hpt-detail-section-body");
      body.appendChild(bodyEl2);
      sec.appendChild(body);
      return sec;
    }
    function renderDetailMeta(meta, checks) {
      var parts = [];
      (meta.uses || []).forEach(function(u) {
        parts.push(u);
      });
      (meta.binds || []).forEach(function(b) {
        parts.push("\u2295 " + b);
      });
      if (typeof checks === "number" && checks > 0) {
        parts.push(checks + " check" + (checks === 1 ? "" : "s"));
      }
      if (!parts.length) return null;
      var foot = el4("div", "hpt-detail-foot");
      parts.forEach(function(p, i) {
        if (i > 0) foot.appendChild(el4("span", "hpt-detail-sep", "\xB7"));
        foot.appendChild(el4("span", "hpt-detail-meta-item", p));
      });
      return foot;
    }
    function renderDetailBanner(moveKind, name, lead) {
      var banner = el4("div", "hpt-detail-banner");
      if (moveKind) {
        banner.appendChild(el4("span", "harpoon-lab-auto-move move-" + moveKind, moveKind));
      }
      banner.appendChild(el4("div", "hpt-detail-name", name));
      if (lead) banner.appendChild(el4("p", "hpt-detail-lead", lead));
      return banner;
    }
    function renderTreeRailOverview(mount, ctx) {
      var na = ctx.na || {};
      var name = ctx.declName || "theorem";
      mount.appendChild(el4("span", "harpoon-lab-section-label is-steps", "Overview"));
      var banner = el4("div", "hpt-detail-banner is-overview");
      banner.appendChild(el4("div", "hpt-detail-name", name));
      mount.appendChild(banner);
      if (na.goalType) {
        var g = el4("div", "hpt-detail-goal");
        renderType3(g, na.goalType);
        mount.appendChild(detailSection("Theorem", g));
      }
      var snap = na.theoremSnapshot;
      if (snap && (snap.premiseCount || snap.totality)) {
        var meta = el4("div", "hpt-detail-theorem-meta");
        if (snap.premiseCount) {
          meta.appendChild(el4("span", "hpt-detail-meta-item", snap.premiseCount + " premise" + (snap.premiseCount === 1 ? "" : "s")));
        }
        if (snap.totality && snap.totality.kind) {
          meta.appendChild(el4("span", "hpt-detail-meta-item", "total " + snap.totality.kind + (snap.totality.name ? " " + snap.totality.name : "")));
        }
        mount.appendChild(detailSection("Structure", meta));
      }
      var status = el4("div", "hpt-detail-status");
      if (na.phase === "searching") {
        status.appendChild(el4("div", "hpt-detail-status-main", nativeAutoSearchLabel(na)));
        status.appendChild(el4("div", "hpt-detail-status-sub", reelStatText(na)));
      } else if (na.complete) {
        status.appendChild(el4("div", "hpt-detail-status-main", autoVerdictTitle(na)));
        var sc = (na.steps || []).length;
        var line = sc ? sc + (sc === 1 ? " step" : " steps") : "";
        if (na.checks) line += (line ? " \xB7 " : "") + na.checks + (na.checks === 1 ? " check" : " checks");
        if (line) status.appendChild(el4("div", "hpt-detail-status-sub", line));
      } else {
        status.appendChild(el4("div", "hpt-detail-status-main", autoVerdictTitle(na)));
        var sub = autoSubtext(na);
        if (sub) status.appendChild(el4("div", "hpt-detail-status-sub", sub));
        var sc2 = (na.steps || []).length;
        if (sc2) {
          status.appendChild(el4(
            "div",
            "hpt-detail-status-sub",
            sc2 + (sc2 === 1 ? " step" : " steps") + " recorded"
          ));
        }
      }
      mount.appendChild(detailSection("Status", status));
      mount.appendChild(el4("p", "hpt-detail-hint", "Click a node in the tree to inspect a move."));
    }
    function renderTreeBreadcrumb(n) {
      if (!n || !global7.HarpoonTree || typeof global7.HarpoonTree.breadcrumb !== "function") return null;
      var parts = global7.HarpoonTree.breadcrumb(n);
      if (!parts.length) return null;
      function truncPart(s) {
        s = String(s || "");
        return s.length > 22 ? s.slice(0, 21) + "\u2026" : s;
      }
      var row = el4("div", "hpt-breadcrumb");
      parts.forEach(function(p, i) {
        if (i > 0) row.appendChild(el4("span", "hpt-breadcrumb-sep", "/"));
        row.appendChild(el4("span", "hpt-breadcrumb-part", truncPart(p)));
      });
      return row;
    }
    function renderFocusLine(focus) {
      if (!focus) return null;
      var bits = [];
      if (focus.siblingCount > 1) bits.push(focus.siblingCount + " open holes");
      if (focus.armLine) bits.push("deepest case arm (line " + focus.armLine + ")");
      if (typeof focus.score === "number") bits.push("priority score " + focus.score);
      if (!bits.length) return null;
      return el4("p", "hpt-detail-focus", bits.join(" \xB7 "));
    }
    function renderAltRow(v, rail) {
      var li = el4("li", "hpt-tried is-" + v.verdict);
      li.appendChild(el4("span", (rail ? "harpoon-lab-auto-move" : "hpt-card-kind") + " move-" + v.kind, v.kind));
      var head = el4("code", "hpt-tried-head");
      renderSource2(head, v.head || v.kind);
      li.appendChild(head);
      if (v.rationale) {
        var rat = el4("span", "hpt-tried-rationale");
        rat.textContent = v.rationale;
        li.appendChild(rat);
      }
      if (v.text && v.text !== v.head) {
        var full = el4("pre", "hpt-tried-text");
        renderSource2(full, v.text);
        li.appendChild(full);
      }
      if (v.reason) {
        var reason = el4("span", "hpt-tried-reason");
        reason.textContent = (v.verdict === "guard" ? "Skipped: " : "Rejected: ") + v.reason;
        li.appendChild(reason);
      }
      return li;
    }
    function renderAlternativesTray(tried, opts) {
      opts = opts || {};
      if (!tried || !tried.length) return null;
      var groups = [
        {
          key: "guard",
          label: "Skipped (guard)",
          tip: "Ruled out by BelJar\u2019s own soundness guards before ever calling Beluga \u2014 no checker time spent."
        },
        {
          key: "rejected",
          label: "Rejected (checker)",
          tip: "Tried against Beluga, which reported a type error, so it was discarded."
        },
        {
          key: "accepted",
          label: "Accepted",
          tip: "Certified clean by Beluga and spliced into the proof."
        }
      ];
      var wrap = el4("div", "hpt-alt-tray");
      groups.forEach(function(g) {
        var rows = tried.filter(function(v) {
          return v.verdict === g.key;
        });
        if (!rows.length) return;
        var sec = el4("div", "hpt-alt-group is-" + g.key);
        var groupLabel = el4("div", "hpt-alt-group-label", g.label + " (" + rows.length + ")");
        if (g.tip) setTip2(groupLabel, g.tip);
        sec.appendChild(groupLabel);
        var list = el4("ul", "hpt-detail-tried");
        rows.forEach(function(v) {
          list.appendChild(renderAltRow(v, opts.rail));
        });
        sec.appendChild(list);
        wrap.appendChild(sec);
      });
      return wrap.childNodes.length ? wrap : null;
    }
    function jumpToTreeHole(hole) {
      var fileId = this.fileId;
      if (!hole || !hole.line || !fileId) return;
      var text = liveFileText2(fileId);
      if (!text) return;
      var from = lineColToOffset2(text, hole.line, hole.col);
      if (typeof global7.openFileAt === "function") {
        global7.openFileAt(fileId, from, from + 1, { line: hole.line, col: hole.col, name: hole.name });
      }
    }
    ;
    function renderWhereSection(self, n, st) {
      var where = el4("div", "hpt-detail-where");
      var crumb = renderTreeBreadcrumb(n);
      if (crumb) where.appendChild(crumb);
      var hole = st && st.hole || n.hole;
      if (hole && hole.line) {
        var loc = el4("button", "hpt-hole-loc");
        loc.type = "button";
        loc.textContent = "line " + hole.line + (hole.col ? ":" + hole.col : "") + (hole.name ? " (" + hole.name + ")" : "");
        loc.addEventListener("click", function() {
          self.jumpToTreeHole(hole);
        });
        where.appendChild(loc);
      }
      if (st && st.branch) {
        where.appendChild(el4("div", "hpt-detail-branch", "in branch: " + st.branch));
      }
      if (st && typeof st.checks === "number" && st.checks > 0) {
        var showStats = typeof Persist === "undefined" || Persist.readStoredAutosolveShowStats();
        if (showStats) {
          var checksEl = el4("div", "hpt-detail-checks", st.checks + " checker call" + (st.checks === 1 ? "" : "s"));
          setTip2(checksEl, "Times BelJar asked Beluga to certify a candidate move at this hole before one type-checked clean.");
          where.appendChild(checksEl);
        }
      }
      return where.childNodes.length ? where : null;
    }
    function renderStateContext(self, mount, state, goalState) {
      if (!state) return;
      var ed = E3();
      if (state.goal) {
        var goalHost = el4("div", "hpt-detail-goal");
        if (ed && typeof ed.mountHoleGoalTier === "function") {
          ed.mountHoleGoalTier(goalHost, {
            surface: "lab",
            goalState: goalState || "live",
            goal: state.goal
          });
        } else {
          renderType3(goalHost, state.goal);
        }
        mount.appendChild(detailSection("Goal", goalHost));
      }
      if (state.meta && state.meta.length) {
        var metaWrap = el4("div", "hpt-detail-ctx");
        self.renderCtx(metaWrap, "meta", state.meta);
        mount.appendChild(detailSection("Meta context", metaWrap));
      }
      if (state.ctx && state.ctx.length) {
        var ctxWrap = el4("div", "hpt-detail-ctx");
        self.renderCtx(ctxWrap, "ctx", state.ctx);
        mount.appendChild(detailSection("Context", ctxWrap));
      }
    }
    function renderTreeDetail(card, n, ctx) {
      card.textContent = "";
      card.hidden = false;
      var rail = card.classList.contains("is-rail");
      if (!n) {
        if (rail && ctx) {
          var idle = el4("div", "hpt-detail");
          card.appendChild(idle);
          renderTreeRailOverview(idle, ctx);
        } else if (!rail) {
          card.hidden = true;
        }
        return;
      }
      var mount = rail ? el4("div", "hpt-detail") : card;
      if (rail) card.appendChild(mount);
      var self = this;
      var treeMode = ctx && ctx.treeMode || "path";
      var goalState = ctx && ctx.na && ctx.na.goalState || "live";
      var showAlts = treeMode === "space";
      if (n.type === "ghost") {
        var gh = n.ghost;
        var gBanner = renderDetailBanner(gh.kind, gh.head || gh.kind, "candidate not taken");
        if (rail) mount.appendChild(gBanner);
        else card.appendChild(gBanner);
        if (gh.text && gh.text !== gh.head) {
          var gcode = rail ? el4("div", "hpt-detail-code") : el4("div", "hpt-card-code");
          renderSource2(gcode, gh.text);
          if (rail) mount.appendChild(detailSection("Fragment", gcode));
          else card.appendChild(gcode);
        }
        var gverdict = el4(
          "div",
          "hpt-detail-verdict is-" + gh.verdict,
          (gh.verdict === "guard" ? "skipped \u2014 " : "rejected \u2014 ") + (gh.reason || "did not certify")
        );
        if (gh.rationale) gverdict.textContent += "\n" + gh.rationale;
        if (rail) mount.appendChild(gverdict);
        else card.appendChild(gverdict);
        return;
      }
      if (n.type === "stuck") {
        mount.appendChild(renderDetailBanner("stuck", "stuck", "no certified move closes this goal"));
        var whereStuck = renderWhereSection(self, n, null);
        if (whereStuck) mount.appendChild(detailSection("Where", whereStuck));
        var focusStuck = renderFocusLine(n.focus);
        if (focusStuck) mount.appendChild(detailSection("Focus", focusStuck));
        renderStateContext(self, mount, n.state || { goal: n.goal }, goalState);
        var altStuck = renderAlternativesTray(n.tried || n.frontier || [], { rail });
        if (altStuck) mount.appendChild(detailSection("Alternatives", altStuck));
        if (!rail) {
        }
        return;
      }
      var st = n.step;
      if (!st) {
        var idleKind = n.type === "theorem" ? null : n.kind || n.type;
        var idleLead = n.sub || (n.type === "arm" ? "case branch" : "");
        mount.appendChild(renderDetailBanner(idleKind, n.label || "", idleLead));
        if (n.type === "theorem" && ctx && ctx.na) {
          renderStateContext(self, mount, { goal: ctx.na.goalType }, ctx.na.goalState);
          var snap = ctx.na.theoremSnapshot;
          if (snap && snap.premiseCount) {
            mount.appendChild(detailSection(
              "Structure",
              el4("div", "hpt-detail-theorem-meta", snap.premiseCount + " premise(s)")
            ));
          }
        } else if (n.type === "arm" && n.pattern) {
          var pg = el4("div", "hpt-detail-goal");
          renderType3(pg, n.pattern);
          mount.appendChild(detailSection("Branch pattern", pg));
        }
        return;
      }
      var meta = st.meta || {};
      var lead = st.lead || deriveMoveLead(st) || st.rationale || n.sub || "";
      mount.appendChild(renderDetailBanner(st.move, n.label || st.move || "move", lead));
      var where = renderWhereSection(self, n, st);
      if (where) mount.appendChild(detailSection("Where", where));
      var focus = renderFocusLine(st.focus || n.focus);
      if (focus) mount.appendChild(detailSection("Focus", focus));
      renderStateContext(self, mount, n.state || {
        goal: st.goal,
        ctx: st.holeCtx,
        meta: st.holeMeta
      }, goalState);
      var codeEl = el4("div", rail ? "hpt-detail-code" : "hpt-card-code");
      renderSource2(codeEl, st.text || "");
      mount.appendChild(detailSection("Fragment", codeEl));
      if (st.move === "synth") {
        var chainEl = renderSynthChain2(meta, rail ? "rail" : "full");
        if (chainEl) mount.appendChild(detailSection("Chain", chainEl));
      }
      if (st.move === "split" && meta.armPatterns && meta.armPatterns.length) {
        if (meta.scrutinee) {
          var scrut = el4("div", "hpt-detail-goal");
          renderType3(scrut, meta.scrutinee);
          mount.appendChild(detailSection("Scrutinee", scrut));
        }
        var armCount = meta.armPatterns.length;
        var arms = el4("ul", "hpt-detail-arms");
        meta.armPatterns.forEach(function(pat) {
          var li = el4("li", "hpt-detail-arm");
          renderType3(li, pat);
          arms.appendChild(li);
        });
        var armsSection = detailSection("Arms (" + armCount + ")", arms);
        if (armCount === 1) {
          var note = el4(
            "p",
            "hpt-detail-note",
            "One arm \u2014 this case only binds the scrutinee\u2019s components (it acts as a let)."
          );
          armsSection.querySelector(".hpt-detail-section-body").appendChild(note);
        }
        mount.appendChild(armsSection);
      }
      var foot = renderDetailMeta(meta, st.checks);
      if (foot) mount.appendChild(foot);
      if (showAlts) {
        var alts = renderAlternativesTray(n.frontier || n.traceEntry && n.traceEntry.tried || [], { rail });
        if (alts) mount.appendChild(detailSection("Alternatives", alts));
      }
    }
    ;
    return {
      renderDerivationSection,
      mountTreePanel,
      openTreeExplorer,
      refreshTreeExplorer,
      renderSynthChain: renderSynthChain2,
      jumpToTreeHole,
      renderTreeDetail
    };
  }

  // js/harpoon/harpoon-lab.mjs
  var global8 = globalThis;
  function E() {
    return global8.BelEditor || null;
  }
  function P() {
    return global8.HarpoonEngine || null;
  }
  function FW() {
    return global8.FloatingWindow || null;
  }
  function toast(msg, kind) {
    var T = global8.Toasts;
    if (!T) return;
    if (kind === "error" && T.error) T.error(msg);
    else if (kind === "success" && T.success) T.success(msg);
    else if (T.info) T.info(msg);
  }
  var el2 = function(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  var ICON_UNDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
  var ICON_REDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  var ICON_ARROW_RIGHT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';
  var ICON_ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5h.01"/></svg>';
  function compromiseBannerIcon(c) {
    if (c && c.level === "warn") {
      return '<span class="harpoon-lab-banner-warn-glyph" aria-hidden="true">!</span>';
    }
    return ICON_ALERT;
  }
  var ICON_CHEVRON_RIGHT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  var ICON_CHEVRON_LEFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  var ICON_STOP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  var ICON_POPOUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>';
  var ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l10.2-6.2a1 1 0 0 0 0-1.7L9.6 4.9A1 1 0 0 0 8 5.8Z"/></svg>';
  var ICON_SPARK = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5c.3 3.1 1.4 4.2 4.5 4.5-3.1.3-4.2 1.4-4.5 4.5-.3-3.1-1.4-4.2-4.5-4.5 3.1-.3 4.2-1.4 4.5-4.5Z"/><path d="M18.5 12.5c.2 2 .9 2.7 2.9 2.9-2 .2-2.7.9-2.9 2.9-.2-2-.9-2.7-2.9-2.9 2-.2 2.7-.9 2.9-2.9Z"/></svg>';
  function setTip(el4, text, opts) {
    if (!el4) return;
    if (global8.Tooltips && global8.Tooltips.set) {
      global8.Tooltips.set(el4, text, opts);
    } else {
      el4.removeAttribute("title");
      var tip = text != null ? String(text).trim() : "";
      if (tip) el4.setAttribute("data-tooltip", tip);
      else el4.removeAttribute("data-tooltip");
    }
  }
  function buildLabeledCodeTip(label, code, kind) {
    var frag = document.createDocumentFragment();
    if (label) {
      var lab = el2("div", "hpt-tip-note");
      lab.textContent = label;
      frag.appendChild(lab);
    }
    var host = el2("div", "hpt-tip-code");
    if (kind === "source") renderSource(host, code);
    else renderType(host, code);
    frag.appendChild(host);
    return frag;
  }
  function bindStepGoalTip(host, goal) {
    if (!host) return;
    var shown = goal ? displayType(goal) : "";
    if (!shown) {
      if (global8.Tooltips && global8.Tooltips.setRich) global8.Tooltips.setRich(host, null);
      setTip(host, "", { ariaLabel: false });
      host.removeAttribute("data-tooltip-placement");
      return;
    }
    host.setAttribute("data-tooltip-placement", "below");
    if (global8.Tooltips && typeof global8.Tooltips.setRich === "function") {
      global8.Tooltips.setRich(host, function() {
        return buildLabeledCodeTip("Goal at this step", goal, "type");
      }, "Goal at this step: " + shown);
    } else {
      setTip(host, "Goal at this step: " + shown, { ariaLabel: false });
    }
  }
  function bindChipTip(el4, tip, richCode, richKind, placement) {
    if (!el4 || !tip) return;
    el4.setAttribute("data-tooltip-placement", placement || "below");
    el4.setAttribute("data-tooltip-no-track", "");
    if (richCode && global8.Tooltips && typeof global8.Tooltips.setRich === "function") {
      global8.Tooltips.setRich(el4, function() {
        return buildLabeledCodeTip(tip, richCode, richKind || "type");
      }, tip);
    } else {
      setTip(el4, tip, { ariaLabel: false });
    }
  }
  function iconBtn(className, svg, label, tip, onClick, disabled) {
    var b = el2("button", className);
    b.type = "button";
    b.setAttribute("aria-label", label);
    if (tip) setTip(b, tip);
    if (disabled) b.disabled = true;
    b.innerHTML = svg;
    b.addEventListener("click", function(e) {
      e.preventDefault();
      if (!b.disabled) onClick();
    });
    return b;
  }
  var probeSessions = [];
  var probeTimer = null;
  function scheduleAnchorProbeAll() {
    if (probeTimer) clearTimeout(probeTimer);
    probeTimer = setTimeout(function() {
      probeTimer = null;
      for (var i = 0; i < probeSessions.length; i += 1) {
        var s = probeSessions[i];
        if (s && typeof s.probeAnchor === "function") s.probeAnchor();
      }
    }, 300);
  }
  if (typeof global8.addEventListener === "function") {
    global8.addEventListener("beljar:doc-changed", scheduleAnchorProbeAll);
    global8.addEventListener("beljar:file-lint", scheduleAnchorProbeAll);
    global8.addEventListener("beljar:development-checked", scheduleAnchorProbeAll);
    global8.addEventListener("beljar:active-editor-view", scheduleAnchorProbeAll);
  }
  function liveEditorFileId() {
    var api = global8.CurrentEditor;
    if (api && typeof api.getDocumentId === "function") {
      var docId = api.getDocumentId();
      if (docId) return docId;
    }
    if (api && typeof api.getActiveFileId === "function") {
      var edId = api.getActiveFileId();
      if (edId) return edId;
    }
    var P2 = global8.Persist;
    return P2 && P2.getActiveFileId ? P2.getActiveFileId() : null;
  }
  function liveFileText(fileId) {
    var P2 = global8.Persist;
    if (!P2 || !fileId) return "";
    var api = global8.CurrentEditor;
    if (fileId === liveEditorFileId() && api && typeof api.getValue === "function") {
      return api.getValue();
    }
    return typeof P2.getFileText === "function" ? P2.getFileText(fileId) || "" : "";
  }
  function lineColToOffset(text, line, col) {
    var lines = text.split("\n");
    var offset = 0;
    for (var i = 0; i < line - 1 && i < lines.length; i += 1) {
      offset += lines[i].length + 1;
    }
    var lineText = lines[line - 1] || "";
    var c = Math.max(0, (col || 1) - 1);
    return offset + Math.min(c, lineText.length);
  }
  function findHoleHitInText(docText, anchor, ed) {
    if (!anchor || !docText || !ed || typeof ed.parseDecl !== "function") return null;
    var re = new RegExp(
      "\\b(rec|proof)\\s+" + String(anchor.declName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:"
    );
    var m = re.exec(docText);
    if (!m) return null;
    var from = m.index;
    var semi = docText.indexOf(";", from);
    var to = semi < 0 ? docText.length : semi + 1;
    var lines = docText.slice(0, from).split("\n");
    var declStartLine = lines.length;
    var declSlice = docText.slice(from, to);
    var decl = ed.parseDecl(declSlice);
    if (!decl || anchor.declKey && decl.kw + ":" + decl.name !== anchor.declKey) return null;
    var bodyStart = from + (decl.bodyStart != null ? decl.bodyStart : declSlice.indexOf("=") + 1);
    var body = docText.slice(bodyStart, to);
    var qIdx = body.indexOf("?");
    if (qIdx < 0) return null;
    var before = docText.slice(0, bodyStart + qIdx);
    var line = before.split("\n").length;
    var lastNl = before.lastIndexOf("\n");
    var col = before.length - (lastNl < 0 ? 0 : lastNl + 1) + 1;
    if (anchor.holeKey) {
      var want = anchor.holeKey;
      var got = line + ":" + col + ":";
      if (want.indexOf(got) !== 0 && got !== want.split(":").slice(0, 2).join(":") + ":") {
      }
    }
    var off = bodyStart + qIdx;
    return { hole: { line, col, name: null }, from: off, to: off + 1 };
  }
  var displayApi = null;
  var commitApi = null;
  function displayType() {
    return displayApi.displayType.apply(null, arguments);
  }
  function renderType() {
    return displayApi.renderType.apply(null, arguments);
  }
  function renderSource() {
    return displayApi.renderSource.apply(null, arguments);
  }
  function peelDisplayGoal() {
    return displayApi.peelDisplayGoal.apply(null, arguments);
  }
  function priorGoalBinders() {
    return displayApi.priorGoalBinders.apply(null, arguments);
  }
  function mountGoalPriors() {
    return displayApi.mountGoalPriors.apply(null, arguments);
  }
  function renderManualSolvedSummary() {
    return displayApi.renderManualSolvedSummary.apply(null, arguments);
  }
  function stageNode() {
    return displayApi.stageNode.apply(null, arguments);
  }
  function buildBannerShell() {
    return displayApi.buildBannerShell.apply(null, arguments);
  }
  function buildPlaceStrip() {
    return displayApi.buildPlaceStrip.apply(null, arguments);
  }
  function renderCommitOutcome() {
    return displayApi.renderCommitOutcome.apply(null, arguments);
  }
  function setNativeSearchLabel() {
    return displayApi.setNativeSearchLabel.apply(null, arguments);
  }
  function solvedBodyOf() {
    return displayApi.solvedBodyOf.apply(null, arguments);
  }
  function defaultCommitState() {
    return commitApi.defaultCommitState();
  }
  function commitFailureUserMessage() {
    return commitApi.commitFailureUserMessage();
  }
  function Session(view, declFrom, declTo, host) {
    this.view = view;
    this.declFrom = declFrom;
    this.declTo = declTo;
    this.host = host || { kind: "float" };
    this.win = null;
    this.bodyEl = null;
    this.barEl = null;
    this.model = null;
    this.focusedId = null;
    this.fileId = null;
    this.anchor = null;
    this.compromise = { level: "none", reason: "", detail: "" };
    this.userCancelled = false;
    this.pendingCommitSource = null;
    this._compromiseBanner = null;
    this.commitState = defaultCommitState();
    this._verdictPopPlayed = false;
  }
  Session.prototype.getCommitState = function() {
    if (this.nativeAuto) {
      if (!this.nativeAuto.commit) this.nativeAuto.commit = defaultCommitState();
      return this.nativeAuto.commit;
    }
    if (!this.commitState) this.commitState = defaultCommitState();
    return this.commitState;
  };
  Session.prototype.beginCommitUi = function(phase) {
    var st = this.getCommitState();
    st.status = "checking";
    st.phase = phase || "verify";
    st.detail = "";
    st.dismissed = false;
    if (phase !== "verify" || !st.usedFullCheck) st.usedFullCheck = false;
    this.updateCommitPlace();
  };
  Session.prototype.updateCommitPlace = function() {
    var place2 = this.bodyEl && this.bodyEl.querySelector(".harpoon-lab-place");
    if (!place2) return;
    var st = this.getCommitState();
    if (st.status !== "checking") {
      place2.classList.remove("is-committing");
      var oldTrack = place2.querySelector(".harpoon-lab-place-track");
      if (oldTrack) oldTrack.remove();
      var titleIdle = place2.querySelector(".harpoon-lab-place-title");
      if (titleIdle) titleIdle.classList.remove("beljar-tip-shimmer");
      return;
    }
    place2.disabled = true;
    place2.classList.add("is-committing");
    var title = place2.querySelector(".harpoon-lab-place-title");
    var sub = place2.querySelector(".harpoon-lab-place-sub");
    if (st.phase === "translate") {
      if (title) title.textContent = "Translating\u2026";
      if (sub) sub.textContent = "Preparing proof for insert";
    } else if (st.usedFullCheck) {
      if (title) title.textContent = "Checking\u2026";
      if (sub) sub.textContent = "Full development check";
    } else {
      if (title) title.textContent = "Checking\u2026";
      if (sub) sub.textContent = "Verifying before insert";
    }
    if (title) title.classList.add("beljar-tip-shimmer");
    if (!place2.querySelector(".harpoon-lab-place-track")) {
      var track = el2("div", "harpoon-lab-place-track");
      track.appendChild(el2("div", "harpoon-loadbar"));
      place2.insertBefore(track, place2.firstChild);
    }
  };
  Session.prototype.isFrozenRetrospective = function() {
    return this.getCommitState().status === "placed";
  };
  Session.prototype.finishCommitSuccess = function() {
    var st = this.getCommitState();
    st.status = "placed";
    st.phase = null;
    st.detail = "";
    st.dismissed = true;
    this.unbindProbe();
    this.compromise = { level: "none", reason: "", detail: "" };
    var body = this.bodyEl;
    if (body) {
      var box = body.querySelector(".harpoon-lab-auto");
      if (box) box.classList.add("is-frozen");
      var place2 = body.querySelector(".harpoon-lab-place");
      if (place2) place2.remove();
      if (this._compromiseBanner) this._compromiseBanner.hidden = true;
      this.updateCompromiseBanner();
    }
    try {
      var focusNext = typeof Persist === "undefined" || Persist.readStoredAutosolveFocusNext();
      if (focusNext && global8.CurrentEditor && typeof global8.CurrentEditor.cycleHole === "function") {
        global8.CurrentEditor.cycleHole(1);
      }
    } catch (_) {
    }
  };
  Session.prototype.finishCommitFailure = function(detail, canRetry, opts) {
    opts = opts || {};
    var st = this.getCommitState();
    var raw = String(detail || "The proof did not re-check.");
    var checkerReject = opts.kind === "checker";
    st.status = "failed";
    st.phase = null;
    if (checkerReject) {
      st.detail = commitFailureUserMessage();
      st.detailRaw = raw;
      toast(st.detail, "error");
    } else {
      st.detail = raw;
      st.detailRaw = "";
    }
    st.canRetry = !!canRetry;
    st.dismissed = false;
    this.render();
  };
  Session.prototype.resetCommitForRetry = function() {
    var st = this.getCommitState();
    st.status = "idle";
    st.phase = null;
    st.detail = "";
    st.detailRaw = "";
    st.usedFullCheck = false;
    st.canRetry = false;
    st.dismissed = false;
    this.render();
  };
  Session.prototype.abortCommitChecking = function(detail, canRetry) {
    if (canRetry) this.resetCommitForRetry();
    else this.finishCommitFailure(detail, false);
  };
  Session.prototype.clearPendingCommitNav = function() {
    if (this._pendingCommitNavTimer != null) {
      global8.clearTimeout(this._pendingCommitNavTimer);
      this._pendingCommitNavTimer = null;
    }
    if (this._pendingCommitNavListener) {
      global8.removeEventListener("beljar:active-editor-view", this._pendingCommitNavListener);
      this._pendingCommitNavListener = null;
    }
    this.pendingCommitSource = null;
  };
  Session.prototype.bindProbe = function() {
    if (probeSessions.indexOf(this) === -1) probeSessions.push(this);
  };
  Session.prototype.unbindProbe = function() {
    var idx = probeSessions.indexOf(this);
    if (idx !== -1) probeSessions.splice(idx, 1);
  };
  Session.prototype.resolveView = function() {
    var api = global8.CurrentEditor;
    if (!api || !this.fileId) return this.view;
    if (liveEditorFileId() === this.fileId && typeof api.getView === "function") {
      var v = api.getView();
      if (v) this.view = v;
    }
    return this.view;
  };
  Session.prototype.captureAnchor = function(view, prep) {
    var ed = E();
    if (!ed || typeof ed.captureHarpoonAnchor !== "function" || !prep) return;
    var api = global8.CurrentEditor;
    var P2 = global8.Persist;
    var fileId = this.fileId || (P2 && P2.getActiveFileId ? P2.getActiveFileId() : null);
    var fileText = view ? view.state.doc.toString() : prep.fileText != null ? prep.fileText : liveFileText(fileId);
    var declSlice = prep.span ? view ? view.state.doc.sliceString(prep.span.from, prep.span.to) : fileText.slice(prep.span.from, prep.span.to) : "";
    this.anchor = ed.captureHarpoonAnchor(prep, {
      fileId,
      fileText,
      declSlice,
      memberFingerprints: api && api.harpoonSuiteFingerprints ? api.harpoonSuiteFingerprints(fileId) : {}
    });
  };
  Session.prototype.findLiveHit = function(view, engine) {
    if (!this.anchor) return null;
    var anchor = { declKey: this.anchor.declKey, holeKey: this.anchor.holeKey };
    if (view && engine) {
      var hit = findHoleHit(view, engine, anchor);
      if (hit) return hit;
    }
    var ed = E();
    var fileId = this.fileId || this.anchor.fileId;
    var text = view && this.resolveView() === view ? view.state.doc.toString() : liveFileText(fileId);
    return findHoleHitInText(text, this.anchor, ed);
  };
  Session.prototype.probeAnchor = function() {
    if (this.isFrozenRetrospective()) return;
    var ed = E();
    if (!ed || typeof ed.assessHarpoonAnchor !== "function" || !this.anchor || !this.nativeAuto) return;
    var fileId = this.fileId || this.anchor.fileId;
    if (!fileId) return;
    var api = global8.CurrentEditor;
    var active = liveEditorFileId() === fileId;
    this.resolveView();
    var view = active ? this.view : null;
    var fileText = liveFileText(fileId);
    var eng = api && typeof api.getSemanticEngine === "function" ? api.getSemanticEngine() : null;
    var liveHit = this.findLiveHit(view, eng);
    var memberFp = api && typeof api.harpoonSuiteFingerprints === "function" ? api.harpoonSuiteFingerprints(fileId) : {};
    var next = ed.assessHarpoonAnchor(this.anchor, {
      fileAvailable: fileText != null,
      fileText,
      fileTextFingerprint: ed.textFingerprint(fileText),
      memberFingerprints: memberFp,
      liveHit,
      parseDecl: ed.parseDecl
    });
    if (next.level === "warn" && next.reason === "suite-changed" && this.anchor.fileTextFingerprint === ed.textFingerprint(fileText) && liveHit) {
      this.anchor.memberFingerprints = memberFp;
      next = { level: "none", reason: "", detail: "", liveHit };
    }
    var prev = this.compromise;
    this.compromise = next;
    if (!prev || prev.level !== next.level || prev.reason !== next.reason) {
      this.updateCompromiseBanner();
      if (this.nativeAuto && this.nativeAuto.phase !== "searching") this.render();
    } else if (this._compromiseBanner) {
      this.updateCompromiseBanner();
    }
  };
  Session.prototype.stopNativeAuto = function() {
    this.userCancelled = true;
    if (this.nativeAuto && this.nativeAuto.phase === "searching") {
      setNativeSearchLabel(this.nativeAuto, "Stopping\u2026");
      this.updateNativeAutoSearch();
    }
  };
  Session.prototype.restartNativeAuto = function() {
    var self = this;
    if (this.nativeAuto && this.nativeAuto.phase === "searching") {
      this.userCancelled = true;
      var waitDone = function() {
        if (self.nativeAuto && self.nativeAuto.phase === "searching") {
          setTimeout(waitDone, 40);
          return;
        }
        self.userCancelled = false;
        self.restartNativeAuto();
      };
      waitDone();
      return;
    }
    this.userCancelled = false;
    var view = this.resolveView();
    var api = global8.CurrentEditor;
    var eng = api && typeof api.getSemanticEngine === "function" ? api.getSemanticEngine() : null;
    var hit = this.findLiveHit(view, eng);
    if (!hit) {
      toast("The proof hole is no longer there.", "error");
      return;
    }
    var prep = view ? prepareForHole(view, hit) : prepareForHoleInFile(this.fileId || this.anchor && this.anchor.fileId, hit);
    if (!prep) return;
    this.prep = prep;
    this.declFrom = prep.span.from;
    this.declTo = prep.span.to;
    this.captureAnchor(view, prep);
    this.compromise = { level: "none", reason: "", detail: "" };
    this.nativeAuto = null;
    this.clearNativeAutoShell();
    this.runNativeAuto();
  };
  Session.prototype.updateCompromiseBanner = function() {
    var banner = this._compromiseBanner;
    if (!banner || !banner.parentNode) return;
    if (this.isFrozenRetrospective()) {
      banner.hidden = true;
      return;
    }
    var na = this.nativeAuto;
    var c = this.compromise || { level: "none" };
    var tone = c.level === "block" ? " tone-error" : c.level === "warn" ? " tone-warn" : "";
    banner.className = "harpoon-lab-auto-compromise harpoon-lab-strip harpoon-lab-banner is-" + c.level + tone + (na && na.phase === "searching" ? " is-searching" : "");
    if (c.level === "none") {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    var badge = banner.querySelector(".harpoon-lab-compromise-badge");
    if (badge) badge.innerHTML = compromiseBannerIcon(c);
    var titleEl = banner.querySelector(".harpoon-lab-compromise-title");
    if (titleEl) titleEl.textContent = compromiseBannerTitle(c);
    var subEl = banner.querySelector(".harpoon-lab-compromise-sub");
    if (subEl) subEl.textContent = compromiseBannerSub(c);
    var place2 = this.bodyEl && this.bodyEl.querySelector(".harpoon-lab-auto-place");
    if (place2) {
      var commit = this.getCommitState();
      if (commit.status === "placed" || commit.status === "failed") return;
      var blocked = c.level === "block";
      place2.disabled = blocked;
      place2.classList.toggle("is-blocked", blocked);
      var sub = place2.querySelector(".harpoon-lab-place-sub");
      if (sub && na && na.complete && commit.status !== "checking") {
        sub.textContent = blocked ? "The hole changed \u2014 restart to insert" : "Insert into the file";
      }
    }
  };
  Session.prototype.renderCompromiseBanner = function(parent) {
    if (this.isFrozenRetrospective()) return;
    var self = this;
    var c = this.compromise || { level: "none" };
    var na = this.nativeAuto;
    var banner = buildBannerShell({
      tag: "button",
      className: "harpoon-lab-auto-compromise harpoon-lab-strip harpoon-lab-banner is-" + c.level + (na && na.phase === "searching" ? " is-searching" : ""),
      tone: c.level === "block" ? "error" : "warn",
      icon: compromiseBannerIcon(c),
      badgeClass: "harpoon-lab-compromise-badge",
      copyClass: "harpoon-lab-compromise-copy",
      titleClass: "harpoon-lab-compromise-title",
      subClass: "harpoon-lab-compromise-sub",
      title: compromiseBannerTitle(c),
      sub: compromiseBannerSub(c),
      onClick: function() {
        self.restartNativeAuto();
      }
    });
    if (c.level === "none") banner.hidden = true;
    parent.insertBefore(banner, parent.firstChild);
    this._compromiseBanner = banner;
    this.updateCompromiseBanner();
  };
  Session.prototype.normalize = function(raw) {
    var ed = E();
    if (ed && typeof ed.normalizeProofModel === "function") return ed.normalizeProofModel(raw);
    return raw || { ok: false, subgoals: [] };
  };
  Session.prototype.applyResult = function(raw) {
    var m = this.normalize(raw);
    if (!m.ok) {
      if (m.error && m.error !== "incomplete") toast("Harpoon: " + m.error, "error");
      if (!this.model) this.model = m;
    } else {
      this.model = m;
      if (m.subgoals.length && !this.findSubgoal(this.focusedId)) {
        this.focusedId = m.subgoals[0].id;
      }
    }
    this.render();
    return m;
  };
  Session.prototype.findSubgoal = function(id) {
    if (!this.model || !this.model.subgoals) return null;
    for (var i = 0; i < this.model.subgoals.length; i++) {
      if (this.model.subgoals[i].id === id) return this.model.subgoals[i];
    }
    return null;
  };
  Session.prototype.runTactic = function(tactic) {
    var self = this;
    if (tactic && tactic.kind === "auto") return this.runNativeAuto();
    return P().tactic(this.focusedId, tactic).then(function(r) {
      return self.applyResult(r);
    });
  };
  Session.prototype.upgradeNativeAutoGoal = function(output, prep) {
    var ed = E();
    if (!ed || !output || !prep || !prep.hit || !this.nativeAuto) return;
    var holes = typeof ed.parseHoles === "function" ? ed.parseHoles(output) : [];
    var line = prep.hit.hole.line;
    var col = prep.hit.hole.col || 1;
    var match = null;
    if (typeof ed.mapProveHolesToDocHits === "function") {
      var mapped = ed.mapProveHolesToDocHits(
        holes,
        prep.proveCode || prep.assembledCode,
        prep.name,
        [prep.hit]
      );
      for (var m = 0; m < mapped.length; m++) {
        var mh = mapped[m];
        if (mh.line === line && (mh.col || 1) === col && mh.goal) {
          match = mh;
          break;
        }
      }
    }
    for (var i = 0; !match && i < holes.length; i++) {
      var h = holes[i];
      if (h.line === line && (h.col || 1) === col && h.goal) {
        match = h;
        break;
      }
    }
    if (!match || !match.goal) return;
    this.nativeAuto.goalType = match.goal;
    this.nativeAuto.goalState = "live";
    this.nativeAuto.priorBinders = priorGoalBinders(
      this,
      this.nativeAuto.sourceGoalType,
      match.goal
    );
    if (this._autoGoalWrap) {
      var goalHost = this._autoGoalWrap.querySelector(".harpoon-hole-goal");
      var ed = typeof global8.BelEditor !== "undefined" ? global8.BelEditor : null;
      if (goalHost && ed && typeof ed.mountHoleGoalTier === "function") {
        ed.mountHoleGoalTier(goalHost, { surface: "lab", goalState: "live", goal: match.goal });
      } else if (goalHost) {
        renderType(goalHost, match.goal);
      }
      mountGoalPriors(this._autoGoalWrap, this.nativeAuto.priorBinders);
    }
  };
  Session.prototype.resolveFullDeclSignature = function(proveCode, sourceType) {
    var self = this;
    var ed = E();
    var client = global8.BelugaClient;
    var name = this.prep && this.prep.name;
    if (!ed || !client || typeof client.ideDeclTypeForProver !== "function" || !name || !proveCode) return;
    if (this._fullDeclSigRequested === name) return;
    this._fullDeclSigRequested = name;
    client.ideDeclTypeForProver(proveCode, name).then(function(raw) {
      var r = null;
      try {
        r = JSON.parse(raw);
      } catch (e) {
        r = null;
      }
      if (!r || !r.ok || r.type == null) return;
      var merged = typeof ed.mergeDeclSignatures === "function" ? ed.mergeDeclSignatures(sourceType, String(r.type)) || String(r.type) : String(r.type);
      self._fullDeclSig = { name, type: merged };
      var na = self.nativeAuto;
      if (!na) return;
      na.priorBinders = priorGoalBinders(self, na.sourceGoalType, na.goalType);
      if (self._autoGoalWrap) mountGoalPriors(self._autoGoalWrap, na.priorBinders);
    }).catch(function() {
      self._fullDeclSigRequested = null;
    });
  };
  Session.prototype.runNativeAuto = function() {
    var ed = E();
    var client = global8.BelugaClient;
    var prep = this.prep;
    var self = this;
    if (!ed || !client || !prep || typeof ed.proveProgram !== "function" || typeof ed.theoremUnderProof !== "function") {
      toast("BelJar auto-solve is unavailable.", "error");
      return Promise.resolve(false);
    }
    var declText = prep.assembledCode.slice(prep.assembledDeclFrom, prep.assembledDeclTo);
    var thm = ed.theoremUnderProof(declText);
    if (!thm) {
      toast("BelJar auto-solve could not read this theorem.", "error");
      return Promise.resolve(false);
    }
    var proveCode = prep.proveCode || prep.assembledCode;
    var api = global8.CurrentEditor;
    var eng = api && typeof api.getSemanticEngine === "function" ? api.getSemanticEngine() : null;
    var goalHit = typeof ed.resolveHoleGoalForHit === "function" ? ed.resolveHoleGoalForHit(this.view, eng, prep.hit) : { goal: thm.compType && thm.compType.raw ? thm.compType.raw : "", state: "approximate", loadingLive: true };
    if ((!goalHit || !goalHit.goal) && prep.hit && prep.hit.hole && prep.hit.hole.goal) {
      goalHit = { goal: prep.hit.hole.goal, state: prep.hit.hole.goalState || "approximate" };
    }
    this.userCancelled = false;
    this._verdictPopPlayed = false;
    this.captureAnchor(this.view, prep);
    this.bindProbe();
    this.clearNativeAutoShell();
    var sourceGoalType = thm.compType && thm.compType.raw ? thm.compType.raw : "";
    var initialGoalState = goalHit.state || "approximate";
    var initialGoalType = peelDisplayGoal(goalHit.goal || sourceGoalType, initialGoalState);
    this.nativeAuto = {
      phase: "searching",
      steps: [],
      trace: [],
      stuck: null,
      complete: false,
      paused: false,
      goalType: initialGoalType,
      goalState: initialGoalState,
      sourceGoalType,
      priorBinders: priorGoalBinders(this, sourceGoalType, initialGoalType),
      declName: thm.name || this.prep && this.prep.name || "",
      theoremSnapshot: {
        premiseCount: thm.compType && thm.compType.premises && thm.compType.premises.length || 0,
        totality: thm.totality || null,
        conclusion: thm.compType && thm.compType.conclusion || ""
      },
      searchLabel: "Starting Beluga\u2026",
      labelAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
      // The live "solve reel": candidate moves currently being tried. Each entry is
      // { kind, head, status: 'trying'|'rejected'|'won' }. The reel renderer streams
      // these; on accept, onStep promotes the move into the committed record above.
      reel: [],
      checks: 0,
      startedAt: typeof performance !== "undefined" ? performance.now() : Date.now()
    };
    this.render();
    if (!this._goalTierListener) {
      this._goalTierListener = function() {
        if (self.nativeAuto && self.nativeAuto.phase === "searching") {
          self.refreshNativeAutoGoalDisplay();
        }
      };
      window.addEventListener("beljar:hole-goals-updated", this._goalTierListener);
      window.addEventListener("beljar:development-checked", this._goalTierListener);
    }
    function pulseLabel(label) {
      if (!self.nativeAuto || self.nativeAuto.paused) return;
      setNativeSearchLabel(self.nativeAuto, label);
      self.syncReelStatus();
    }
    pulseLabel("Starting Beluga\u2026");
    var proverReady = client.beginProverSession ? client.beginProverSession() : Promise.resolve();
    var warm = client.loadProverChecker && proveCode ? client.loadProverChecker(proveCode) : Promise.resolve();
    return proverReady.then(function() {
      pulseLabel("Loading the program\u2026");
      return warm;
    }).then(function() {
      self.resolveFullDeclSignature(proveCode, sourceGoalType);
      if (client.checkResultForProver) {
        pulseLabel("Reading the goal\u2026");
        return client.checkResultForProver(proveCode).then(function(base) {
          if (base && base.output) self.upgradeNativeAutoGoal(base.output, prep);
        });
      }
    }).then(function() {
      pulseLabel("Starting search\u2026");
      return ed.proveProgram(proveCode, thm, function(code) {
        return client.checkResultForProver ? client.checkResultForProver(code) : client.checkResult(code);
      }, {
        maxSteps: 120,
        collectTrace: true,
        shouldPause: function() {
          return !!(self.nativeAuto && self.nativeAuto.paused);
        },
        shouldCancel: function() {
          return !!self.userCancelled;
        },
        onPulse: function(pulse) {
          if (!self.nativeAuto || self.nativeAuto.paused) return;
          var na = self.nativeAuto;
          if (pulse.goal) na.searchGoal = pulse.goal;
          if (pulse.branch !== void 0) na.searchBranch = pulse.branch;
          if (pulse.wave && pulse.wave.length) {
            var tryKey = pulse.wave.map(function(c) {
              return String(c.kind || "") + "\0" + String(c.head || "");
            }).join("|");
            setNativeSearchLabel(na, "Trying " + (pulse.trying || pulse.wave[0].kind) + "\u2026", {
              tryKey
            });
            self.feedConveyor(pulse.wave);
          } else if (pulse.verdict) {
            var v = pulse.verdict;
            if (v.verdict === "accepted") setNativeSearchLabel(na, "Found " + v.kind);
            self.markConveyor(v);
          } else if (pulse.trying) {
            setNativeSearchLabel(na, "Trying " + pulse.trying + "\u2026", {
              tryKey: "kind:" + pulse.trying
            });
          } else if (pulse.label) {
            setNativeSearchLabel(na, pulse.label);
          }
          self.syncReelStatus();
        },
        onTraceEntry: function(entry) {
          if (!self.nativeAuto) return;
          if (!self.nativeAuto.trace) self.nativeAuto.trace = [];
          self.nativeAuto.trace.push(entry);
          self.refreshTreeExplorer();
        },
        onStep: function(info) {
          if (!self.nativeAuto) return;
          var na = self.nativeAuto;
          var prevLen = (na.steps || []).length;
          na.steps = info.steps || [];
          na.checks = na.steps.reduce(function(t, s) {
            return t + (s.checks || 0);
          }, 0);
          if (!na.paused) {
            setNativeSearchLabel(na, "Step " + na.steps.length + (info.last && info.last.move ? " \xB7 " + info.last.move : ""));
          }
          if (na.steps.length > prevLen) {
            for (var k = prevLen; k < na.steps.length; k += 1) {
              self.settleWorkingRow(na.steps[k], k);
            }
          }
          self.syncReelStatus();
        }
      });
    }).then(function(r) {
      self.probeAnchor();
      var stuck = r && r.stuck || null;
      if (stuck && stuck.reason === "cancelled" && self.userCancelled) {
        stuck = { reason: "stopped" };
      }
      var priorCommit = self.nativeAuto && self.nativeAuto.commit;
      self.nativeAuto = {
        phase: r && r.complete ? "solved" : "stuck",
        steps: r && r.steps || [],
        trace: r && r.trace || null,
        stuck,
        complete: !!(r && r.complete),
        code: r && r.code,
        goalType: self.nativeAuto && self.nativeAuto.goalType,
        goalState: r && r.complete ? "live" : self.nativeAuto && self.nativeAuto.goalState,
        sourceGoalType: self.nativeAuto && self.nativeAuto.sourceGoalType,
        priorBinders: self.nativeAuto && self.nativeAuto.priorBinders,
        declName: self.nativeAuto && self.nativeAuto.declName,
        theoremSnapshot: self.nativeAuto && self.nativeAuto.theoremSnapshot,
        hadLiveTrail: !!(self.nativeAuto && self.nativeAuto.steps && self.nativeAuto.steps.length),
        commit: priorCommit || defaultCommitState()
      };
      self.render();
      self.refreshTreeExplorer();
      return !!(r && r.complete);
    }).catch(function(err) {
      var cancelled = client.isCancelledError && client.isCancelledError(err);
      if (cancelled && self.nativeAuto && self.nativeAuto.paused) return false;
      self.nativeAuto = {
        phase: "stuck",
        steps: self.nativeAuto && self.nativeAuto.steps || [],
        complete: false,
        goalType: self.nativeAuto && self.nativeAuto.goalType,
        goalState: self.nativeAuto && self.nativeAuto.goalState,
        sourceGoalType: self.nativeAuto && self.nativeAuto.sourceGoalType,
        priorBinders: self.nativeAuto && self.nativeAuto.priorBinders,
        declName: self.nativeAuto && self.nativeAuto.declName,
        stuck: cancelled && self.userCancelled ? { reason: "stopped" } : cancelled ? { reason: "cancelled" } : { reason: err && err.message ? err.message : String(err) }
      };
      self.render();
      self.refreshTreeExplorer();
      return false;
    }).finally(function() {
      if (self._goalTierListener) {
        window.removeEventListener("beljar:hole-goals-updated", self._goalTierListener);
        window.removeEventListener("beljar:development-checked", self._goalTierListener);
        self._goalTierListener = null;
      }
    });
  };
  Session.prototype.commitNativeAuto = function() {
    var na = this.nativeAuto;
    var st = this.getCommitState();
    if (!na || !na.complete || !na.code || st.status === "checking" || st.status === "placed") {
      return Promise.resolve(false);
    }
    var body = solvedBodyOf(na.code, this.prep && this.prep.name);
    if (!body) {
      toast("BelJar auto-solve lost the solution.", "error");
      return Promise.resolve(false);
    }
    this.beginCommitUi("verify");
    return this.verifyAndCommit(body, { skipBeginUi: true });
  };
  Session.prototype.undo = function() {
    var self = this;
    return P().undo().then(function(r) {
      return self.applyResult(r);
    });
  };
  Session.prototype.redo = function() {
    var self = this;
    return P().redo().then(function(r) {
      return self.applyResult(r);
    });
  };
  Session.prototype.commit = function() {
    var self = this;
    var st = this.getCommitState();
    if (st.status === "checking" || st.status === "placed") return Promise.resolve(false);
    this.beginCommitUi("translate");
    return P().translate().then(function(tr) {
      if (!tr || !tr.ok) {
        self.finishCommitFailure(tr && tr.error === "incomplete" ? "The proof still has open subgoals." : "Could not translate the proof.", true);
        return false;
      }
      self.getCommitState().phase = "verify";
      self.updateCommitPlace();
      return self.verifyAndCommit(tr.source, { skipBeginUi: true });
    }).catch(function(err) {
      self.finishCommitFailure(err && err.message ? err.message : "Translate failed.", true);
      return false;
    });
  };
  function compromiseBannerTitle(c) {
    if (c && c.level === "warn") return "Restart proof";
    if (c && c.detail) return c.detail;
    if (c && c.level === "block") return "This hole changed \u2014 the result can\u2019t be inserted safely.";
    return "A related file in this development changed.";
  }
  function compromiseBannerSub(c) {
    if (c && c.level === "warn") return "Code related to this goal has changed";
    return "Restart from the current file state";
  }
  Session.prototype.disposeSession = function() {
    this.clearPendingCommitNav();
    this.unbindProbe();
    if (this.stopReelClock) this.stopReelClock();
    this.pendingCommitSource = null;
    var client = global8.BelugaClient;
    if (client && client.endProverSession) client.endProverSession();
    if (this._treeWin && this._treeWin.close) this._treeWin.close();
    this._treeWin = null;
    this._treeRedraw = null;
    if (this.win && this.win.close) this.win.close();
    this.win = null;
    var proof = P();
    if (proof && proof.dispose) proof.dispose();
    if (this.host && this.host.kind === "panel" && typeof this.host.onDone === "function") {
      this.host.onDone();
    }
  };
  Session.prototype.close = function() {
    this.disposeSession();
  };
  Session.prototype.renderBar = function(m) {
    var self = this;
    var body = this.bodyEl;
    if (!body) return;
    var open = m.subgoals && m.subgoals.length || 0;
    var bar = el2("div", "harpoon-lab-bar");
    var status = el2("div", "harpoon-lab-status");
    var dot = el2("span", "harpoon-lab-status-dot" + (m.complete ? " is-done" : ""));
    dot.setAttribute("data-tooltip", m.complete ? "Proven" : "Unproven");
    dot.setAttribute("aria-label", m.complete ? "Proven" : "Unproven");
    if (global8.Tooltips && global8.Tooltips.bind) global8.Tooltips.bind(dot);
    status.appendChild(dot);
    var label = el2("span", "harpoon-lab-status-text");
    if (m.complete) {
      label.textContent = "Proven";
    } else if (open === 1) {
      label.textContent = "1 goal";
    } else {
      label.textContent = open + " goals";
    }
    status.appendChild(label);
    bar.appendChild(status);
    var actions = el2("div", "harpoon-lab-bar-actions");
    actions.appendChild(iconBtn("icon-btn", ICON_UNDO, "Undo", "Undo", function() {
      self.undo();
    }));
    actions.appendChild(iconBtn("icon-btn", ICON_REDO, "Redo", "Redo", function() {
      self.redo();
    }));
    bar.appendChild(actions);
    body.insertBefore(bar, body.firstChild);
  };
  Session.prototype.renderCtx = function(parent, label, binders) {
    if (!binders || !binders.length) return;
    var sec = el2("div", "harpoon-lab-ctx");
    sec.appendChild(el2("span", "harpoon-lab-ctx-label", label));
    var rows = el2("div", "harpoon-lab-binders");
    binders.forEach(function(b) {
      var row = el2("div", "harpoon-lab-binder");
      row.appendChild(el2("span", "harpoon-lab-binder-name", b.name));
      row.appendChild(el2("span", "harpoon-lab-binder-sep", ":"));
      var t = el2("span", "harpoon-lab-binder-type");
      renderType(t, b.type);
      row.appendChild(t);
      rows.appendChild(row);
    });
    sec.appendChild(rows);
    parent.appendChild(sec);
  };
  Session.prototype.renderTactics = function(parent, sg) {
    var self = this;
    var ed = E();
    var applicable = ed && ed.applicableTactics ? ed.applicableTactics : null;
    var tac = applicable ? applicable(sg) : { intros: true, split: [], solve: [], auto: true };
    var moves = [];
    if (tac.intros) moves.push({ label: "intros", tip: "Introduce binders", t: { kind: "intros" } });
    (tac.split || []).forEach(function(v) {
      var name = v && v.name != null ? v.name : v;
      var where = v && v.where ? v.where : "meta";
      moves.push({
        label: "split",
        arg: name,
        tip: "Case-split on " + name,
        t: { kind: "split", var: name, where }
      });
    });
    (tac.solve || []).forEach(function(v) {
      var name = v && v.name != null ? v.name : v;
      moves.push({
        label: "solve",
        arg: name,
        tip: "Solve with " + name,
        t: { kind: "solve", var: name }
      });
    });
    if (!moves.length && !tac.auto) return;
    var wrap = el2("div", "harpoon-lab-moves");
    if (tac.auto) {
      var autoBtn = el2("button", "harpoon-lab-auto-btn");
      autoBtn.type = "button";
      var spark = el2("span", "harpoon-lab-auto-btn-glyph");
      spark.innerHTML = ICON_SPARK;
      autoBtn.appendChild(spark);
      autoBtn.appendChild(el2("span", "harpoon-lab-auto-btn-label", "Auto-solve"));
      autoBtn.setAttribute("data-tooltip", "Let BelJar search for the whole proof");
      if (global8.Tooltips && global8.Tooltips.bind) global8.Tooltips.bind(autoBtn);
      autoBtn.addEventListener("click", function(e) {
        e.preventDefault();
        self.runTactic({ kind: "auto" });
      });
      wrap.appendChild(autoBtn);
    }
    if (moves.length) {
      var row = el2("div", "harpoon-lab-tacs");
      moves.forEach(function(mv, i) {
        var primary = i === 0;
        var b = el2("button", "harpoon-lab-tac" + (primary ? " is-primary" : ""));
        b.type = "button";
        b.appendChild(el2("span", "harpoon-lab-tac-verb", mv.label));
        if (mv.arg) b.appendChild(el2("span", "harpoon-lab-tac-arg", mv.arg));
        if (mv.tip) {
          b.setAttribute("data-tooltip", mv.tip);
          if (global8.Tooltips && global8.Tooltips.bind) global8.Tooltips.bind(b);
        }
        b.addEventListener("click", function(e) {
          e.preventDefault();
          self.runTactic(mv.t);
        });
        row.appendChild(b);
      });
      wrap.appendChild(row);
    }
    parent.appendChild(wrap);
  };
  Session.prototype.renderGoalCard = function(sg, idx, total) {
    var card = el2("article", "harpoon-lab-goal-card");
    var goalWrap = el2("div", "harpoon-lab-goal harpoon-lab-strip tone-goal");
    var glabel = el2("div", "harpoon-lab-goal-label");
    glabel.appendChild(el2("span", "harpoon-lab-goal-label-text harpoon-lab-section-label is-goal", "Goal"));
    if (total > 1) {
      glabel.appendChild(el2("span", "harpoon-lab-goal-idx", idx + 1 + " / " + total));
    }
    goalWrap.appendChild(glabel);
    var goal = el2("div", "harpoon-hole-goal harpoon-lab-goal-type");
    renderType(goal, sg.goal);
    goalWrap.appendChild(goal);
    card.appendChild(goalWrap);
    var hasCtx = sg.meta && sg.meta.length || sg.ctx && sg.ctx.length;
    if (hasCtx) {
      var ctxWrap = el2("div", "harpoon-lab-context");
      this.renderCtx(ctxWrap, "meta", sg.meta);
      this.renderCtx(ctxWrap, "ctx", sg.ctx);
      card.appendChild(ctxWrap);
    }
    this.renderTactics(card, sg);
    return card;
  };
  var reelApi = null;
  var autoApi = null;
  var treeUiApi = null;
  function renderSynthChain(meta, variant) {
    return treeUiApi.renderSynthChain(meta, variant);
  }
  function __initHarpoonLabPeels() {
    displayApi = createDisplay({
      el: function() {
        return el2.apply(null, arguments);
      },
      E,
      setTip: function() {
        return setTip.apply(null, arguments);
      },
      liveEditorFileId: function() {
        return liveEditorFileId.apply(null, arguments);
      },
      bindChipTip: function() {
        return bindChipTip.apply(null, arguments);
      },
      renderSynthChain: function() {
        return renderSynthChain.apply(null, arguments);
      },
      ICON_CHECK,
      ICON_ARROW_RIGHT,
      ICON_ALERT
    });
    commitApi = createCommit({
      E,
      toast: function() {
        return toast.apply(null, arguments);
      },
      liveEditorFileId: function() {
        return liveEditorFileId.apply(null, arguments);
      },
      prepareForHole: function() {
        return prepareForHole.apply(null, arguments);
      }
    });
    reelApi = createReel({
      el: function() {
        return el2.apply(null, arguments);
      },
      setTip: function() {
        return setTip.apply(null, arguments);
      },
      bindStepGoalTip: function() {
        return bindStepGoalTip.apply(null, arguments);
      },
      bindChipTip: function() {
        return bindChipTip.apply(null, arguments);
      },
      moveLead: displayApi.moveLead,
      appendMoveFacet: displayApi.appendMoveFacet,
      renderType: displayApi.renderType,
      renderSource: displayApi.renderSource,
      nativeAutoSearchLabel: displayApi.nativeAutoSearchLabel,
      resolveNativeAutoGoalDisplay: displayApi.resolveNativeAutoGoalDisplay,
      priorGoalBinders: displayApi.priorGoalBinders,
      mountGoalPriors: displayApi.mountGoalPriors,
      E,
      ICON_PLAY,
      ICON_PAUSE
    });
    treeUiApi = createTreeUi({
      el: function() {
        return el2.apply(null, arguments);
      },
      iconBtn: function() {
        return iconBtn.apply(null, arguments);
      },
      setTip: function() {
        return setTip.apply(null, arguments);
      },
      bindChipTip: function() {
        return bindChipTip.apply(null, arguments);
      },
      renderType: displayApi.renderType,
      renderSource: displayApi.renderSource,
      appendAutoTree: function() {
        return reelApi.appendAutoTree.apply(reelApi, arguments);
      },
      nativeAutoSearchLabel: displayApi.nativeAutoSearchLabel,
      reelStatText: function() {
        return reelApi.reelStatText.apply(reelApi, arguments);
      },
      autoSubtext: displayApi.autoSubtext,
      autoVerdictTitle: displayApi.autoVerdictTitle,
      deriveMoveLead: displayApi.deriveMoveLead,
      liveFileText: function() {
        return liveFileText.apply(null, arguments);
      },
      lineColToOffset: function() {
        return lineColToOffset.apply(null, arguments);
      },
      labTitle: function() {
        return labTitle.apply(null, arguments);
      },
      FW,
      E,
      ICON_POPOUT,
      ICON_CHEVRON_LEFT,
      ICON_CHEVRON_RIGHT
    });
    autoApi = createAuto({
      el: function() {
        return el2.apply(null, arguments);
      },
      iconBtn: function() {
        return iconBtn.apply(null, arguments);
      },
      setTip: function() {
        return setTip.apply(null, arguments);
      },
      renderType: displayApi.renderType,
      renderSource: displayApi.renderSource,
      nativeAutoSearchLabel: displayApi.nativeAutoSearchLabel,
      autoSubtext: displayApi.autoSubtext,
      autoVerdictTitle: displayApi.autoVerdictTitle,
      autoVerdictTone: displayApi.autoVerdictTone,
      appendAutoGoalHero: displayApi.appendAutoGoalHero,
      resolveNativeAutoGoalDisplay: displayApi.resolveNativeAutoGoalDisplay,
      priorGoalBinders: displayApi.priorGoalBinders,
      setNativeSearchLabel: displayApi.setNativeSearchLabel,
      appendCommittedStepRow: function() {
        return reelApi.appendCommittedStepRow.apply(reelApi, arguments);
      },
      solvedBodyOf: displayApi.solvedBodyOf,
      buildBannerShell: displayApi.buildBannerShell,
      stageNode: displayApi.stageNode,
      appendAutoSolution: displayApi.appendAutoSolution,
      buildPlaceStrip: displayApi.buildPlaceStrip,
      renderCommitOutcome: displayApi.renderCommitOutcome,
      ICON_PLAY,
      ICON_PAUSE,
      ICON_POPOUT,
      ICON_CHECK,
      ICON_STOP
    });
    Session.prototype.refreshNativeAutoGoalDisplay = reelApi.refreshNativeAutoGoalDisplay;
    Session.prototype.clearNativeAutoShell = reelApi.clearNativeAutoShell;
    Session.prototype.syncAutoPauseBtn = reelApi.syncAutoPauseBtn;
    Session.prototype.updateNativeAutoSearch = reelApi.updateNativeAutoSearch;
    Session.prototype.syncReelStatus = reelApi.syncReelStatus;
    Session.prototype.ensureWorkingRow = reelApi.ensureWorkingRow;
    Session.prototype.feedConveyor = reelApi.feedConveyor;
    Session.prototype.markConveyor = reelApi.markConveyor;
    Session.prototype.trimConveyor = reelApi.trimConveyor;
    Session.prototype.settleWorkingRow = reelApi.settleWorkingRow;
    Session.prototype._makeBranchGroup = reelApi._makeBranchGroup;
    Session.prototype.startReelClock = reelApi.startReelClock;
    Session.prototype.stopReelClock = reelApi.stopReelClock;
    Session.prototype.renderNativeAuto = autoApi.renderNativeAuto;
    Session.prototype.renderStuckCard = autoApi.renderStuckCard;
    Session.prototype.renderDerivationSection = treeUiApi.renderDerivationSection;
    Session.prototype.mountTreePanel = treeUiApi.mountTreePanel;
    Session.prototype.openTreeExplorer = treeUiApi.openTreeExplorer;
    Session.prototype.refreshTreeExplorer = treeUiApi.refreshTreeExplorer;
    Session.prototype.jumpToTreeHole = treeUiApi.jumpToTreeHole;
    Session.prototype.renderTreeDetail = treeUiApi.renderTreeDetail;
    Session.prototype.pendingCommitAfterNav = commitApi.pendingCommitAfterNav;
    Session.prototype.verifyAndCommit = commitApi.verifyAndCommit;
  }
  __initHarpoonLabPeels();
  Session.prototype.render = function() {
    if (!this.bodyEl) return;
    var self = this;
    var body = this.bodyEl;
    if (this.nativeAuto && this.nativeAuto.phase === "searching" && this._autoSearchBox && this._autoSearchBox.parentNode === body) {
      this.updateNativeAutoSearch();
      return;
    }
    this.clearNativeAutoShell();
    body.textContent = "";
    body.classList.remove("is-starting");
    var m = this.model;
    if (this.nativeAuto) {
      this.renderNativeAuto(body);
      return;
    }
    if (!m || !m.ok && (!m.subgoals || !m.subgoals.length)) {
      body.appendChild(el2("div", "harpoon-lab-empty", m && m.error ? "Could not start: " + m.error : "No proof."));
      return;
    }
    this.renderBar(m);
    this.renderNativeAuto(body);
    var autoOwns = this.nativeAuto && (this.nativeAuto.phase === "solved" || this.nativeAuto.phase === "searching");
    if (m.complete && !autoOwns) {
      stageNode(renderManualSolvedSummary(body), 0);
      var commit = self.getCommitState();
      if (commit.status === "failed" || commit.status === "placed" && !commit.dismissed) {
        stageNode(
          renderCommitOutcome(
            body,
            commit,
            self.prep && self.prep.name,
            commit.canRetry ? function() {
              self.resetCommitForRetry();
            } : null
          ),
          1
        );
      } else if (commit.status !== "placed") {
        var place2 = buildPlaceStrip(self, {
          title: "Place the proof",
          sub: "Insert into the file",
          onClick: function() {
            self.commit();
          }
        });
        stageNode(place2, 1);
        body.appendChild(place2);
        if (commit.status === "checking") self.updateCommitPlace();
      }
      return;
    }
    var work = el2("div", "harpoon-lab-work");
    var focused = this.findSubgoal(this.focusedId) || m.subgoals[0];
    var focusedIdx = 0;
    for (var fi = 0; fi < m.subgoals.length; fi++) {
      if (m.subgoals[fi].id === focused.id) {
        focusedIdx = fi;
        break;
      }
    }
    if (m.subgoals.length > 1) {
      var picker = el2("div", "harpoon-lab-picker");
      picker.setAttribute("role", "tablist");
      picker.setAttribute("aria-label", "Subgoals");
      m.subgoals.forEach(function(sg, idx) {
        var tab = el2("button", "harpoon-lab-picker-tab" + (sg.id === focused.id ? " is-active" : ""));
        tab.type = "button";
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", sg.id === focused.id ? "true" : "false");
        tab.appendChild(el2("span", "harpoon-lab-picker-num", String(idx + 1)));
        tab.addEventListener("click", function() {
          self.focusedId = sg.id;
          self.render();
        });
        picker.appendChild(tab);
      });
      work.appendChild(picker);
    }
    work.appendChild(this.renderGoalCard(focused, focusedIdx, m.subgoals.length));
    body.appendChild(work);
  };
  function finishPrepare(ed, ctx, span, decl, hit) {
    var assembled = String(ctx.code);
    var re = new RegExp("(^|\\n)\\s*(rec|proof)\\s+" + decl.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:");
    var match = re.exec(assembled);
    if (!match) {
      toast("Harpoon: declaration not found in the checkable program.", "error");
      return null;
    }
    var declStart = match.index + match[1].length;
    var semi = assembled.indexOf(";", declStart);
    var declEnd = semi === -1 ? assembled.length : semi + 1;
    var built = ed.buildProofProgram(assembled, declStart, declEnd);
    if (!built) {
      toast("Harpoon: couldn\u2019t build the proof program.", "error");
      return null;
    }
    var proveCode = ed.proveOrchestrationCode ? ed.proveOrchestrationCode(assembled, decl.name, declStart, declEnd, ctx.fileStart) : assembled;
    return {
      built,
      span,
      name: decl.name,
      declKey: decl.kw + ":" + decl.name,
      hit,
      assembledCode: assembled,
      assembledDeclFrom: declStart,
      assembledDeclTo: declEnd,
      proveCode,
      offsetLines: ctx.offsetLines || 0,
      fileStart: ctx.fileStart != null ? ctx.fileStart : 0
    };
  }
  function prepareForHole(view, hit) {
    var ed = E();
    var api = global8.CurrentEditor;
    var ctx = api && typeof api.getHoleActionContext === "function" ? api.getHoleActionContext() : null;
    if (!ctx || !ctx.code) {
      toast("Harpoon: no checkable program.", "error");
      return null;
    }
    var span = api.getDeclSpan ? api.getDeclSpan(hit.from) : null;
    if (!span) {
      toast("Harpoon: couldn\u2019t find the enclosing declaration.", "error");
      return null;
    }
    var decl = ed.parseDecl(view.state.doc.sliceString(span.from, span.to));
    if (!decl) {
      toast("Harpoon: only rec/proof declarations are supported.", "error");
      return null;
    }
    return finishPrepare(ed, ctx, span, decl, hit);
  }
  function prepareForHoleInFile(fileId, hit) {
    var ed = E();
    if (!ed || typeof ed.holeActionContextForFile !== "function" || typeof ed.declSpanInText !== "function") return null;
    var ctx = ed.holeActionContextForFile(fileId);
    if (!ctx || !ctx.code) {
      toast("Harpoon: no checkable program.", "error");
      return null;
    }
    var span = ed.declSpanInText(ctx.fileText, hit.from);
    if (!span) {
      toast("Harpoon: couldn\u2019t find the enclosing declaration.", "error");
      return null;
    }
    var decl = ed.parseDecl(String(ctx.fileText).slice(span.from, span.to));
    if (!decl) {
      toast("Harpoon: only rec/proof declarations are supported.", "error");
      return null;
    }
    var prep = finishPrepare(ed, ctx, span, decl, hit);
    if (prep) prep.fileText = String(ctx.fileText);
    return prep;
  }
  var floatSessions = [];
  function holeKeyFromHit(hit) {
    if (!hit || !hit.hole) return "";
    return hit.hole.line + ":" + (hit.hole.col || 1) + ":" + (hit.hole.name || "");
  }
  function removeFloatSession(session) {
    var idx = floatSessions.indexOf(session);
    if (idx !== -1) floatSessions.splice(idx, 1);
    if (global8.WorkspaceState && global8.WorkspaceState.scheduleSave) {
      global8.WorkspaceState.scheduleSave();
    }
  }
  function listHoleHits(view, engine) {
    if (!view || !engine || typeof engine.getHoles !== "function") return [];
    var doc = view.state.doc;
    var out = [];
    var holes = engine.getHoles() || [];
    for (var i = 0; i < holes.length; i++) {
      var h = holes[i];
      if (!h || h.line < 1 || h.line > doc.lines) continue;
      var off = doc.line(h.line).from + Math.max(0, (h.col || 1) - 1);
      if (off >= doc.length || doc.sliceString(off, off + 1) !== "?") continue;
      out.push({ hole: h, from: off, to: off + 1 });
    }
    return out;
  }
  function findHoleHit(view, engine, anchor) {
    if (!anchor) return null;
    var hits = listHoleHits(view, engine);
    if (anchor.holeKey) {
      for (var i = 0; i < hits.length; i++) {
        if (holeKeyFromHit(hits[i]) === anchor.holeKey) return hits[i];
      }
    }
    if (!anchor.declKey) return null;
    var ed = E();
    for (var j = 0; j < hits.length; j++) {
      var hit = hits[j];
      var span = ed && ed.getDeclSpan ? ed.getDeclSpan(hit.from) : null;
      if (!span) continue;
      var decl = ed.parseDecl(view.state.doc.sliceString(span.from, span.to));
      if (decl && decl.kw + ":" + decl.name === anchor.declKey) return hit;
    }
    return null;
  }
  function runSession(view, prep, host) {
    var session = new Session(view, prep.span.from, prep.span.to, host);
    session.prep = prep;
    var persist = global8.Persist;
    session.fileId = host.fileId || (persist && persist.getActiveFileId ? persist.getActiveFileId() : null);
    session.captureAnchor(view, prep);
    session.bindProbe();
    var content = el2("div", "harpoon-lab" + (host.kind === "panel" ? " harpoon-lab--panel" : ""));
    session.bodyEl = content;
    host.mount(content, session);
    if (host.onSessionStart) host.onSessionStart(prep.name);
    session.runNativeAuto();
    return session;
  }
  function openFromHole(view, engine, hit, opts) {
    opts = opts || {};
    var ed = E();
    var fw = FW();
    if (!ed || !fw) {
      toast("Harpoon unavailable.", "error");
      return;
    }
    var prep = prepareForHole(view, hit);
    if (!prep) return;
    var persist = global8.Persist;
    var fileId = persist && persist.getActiveFileId ? persist.getActiveFileId() : null;
    var session = runSession(view, prep, {
      kind: "float",
      mount: function(content, s) {
        var geom = opts.geom || {};
        s.fileId = fileId;
        s.declKey = prep.declKey;
        s.holeKey = holeKeyFromHit(prep.hit || hit);
        s.win = fw.open({
          title: labTitle(prep.name),
          className: "harpoon-lab-window",
          content,
          width: geom.w || 440,
          height: geom.h || 520,
          x: geom.x,
          y: geom.y,
          onGeometryChange: function() {
            if (global8.WorkspaceState && global8.WorkspaceState.scheduleSave) {
              global8.WorkspaceState.scheduleSave();
            }
          },
          onClose: function() {
            s.userCancelled = true;
            removeFloatSession(s);
            s.unbindProbe();
            var proof = P();
            if (proof && proof.dispose) proof.dispose();
          }
        });
        floatSessions.push(s);
        if (global8.WorkspaceState && global8.WorkspaceState.scheduleSave) {
          global8.WorkspaceState.scheduleSave();
        }
      }
    });
    return session;
  }
  function labTitle(name) {
    var wrap = document.createElement("span");
    wrap.className = "harpoon-lab-title";
    if (global8.HarpoonIcon) global8.HarpoonIcon.appendGlyph(wrap, "harpoon-lab-title-glyph");
    wrap.appendChild(el2("span", "harpoon-lab-title-text", name ? "Harpoon \xB7 " + name : "Harpoon"));
    return wrap;
  }
  function proveInPanel(view, engine, hit, container, opts) {
    var ed = E();
    if (!ed) {
      toast("Harpoon unavailable.", "error");
      return;
    }
    opts = opts || {};
    var prep = prepareForHole(view, hit);
    if (!prep) {
      if (opts.onSessionEnd) opts.onSessionEnd();
      return;
    }
    return runSession(view, prep, {
      kind: "panel",
      onSessionStart: opts.onSessionStart,
      onSessionEnd: opts.onSessionEnd,
      onDone: opts.onDone,
      onBack: opts.onBack,
      mount: function(content) {
        container.textContent = "";
        container.appendChild(content);
      }
    });
  }
  function proveInPanelForFile(fileId, hit, container, opts) {
    var ed = E();
    if (!ed) {
      toast("Harpoon unavailable.", "error");
      return;
    }
    opts = opts || {};
    var prep = prepareForHoleInFile(fileId, hit);
    if (!prep) {
      if (opts.onSessionEnd) opts.onSessionEnd();
      return;
    }
    return runSession(null, prep, {
      kind: "panel",
      fileId,
      onSessionStart: opts.onSessionStart,
      onSessionEnd: opts.onSessionEnd,
      onDone: opts.onDone,
      onBack: opts.onBack,
      mount: function(content) {
        container.textContent = "";
        container.appendChild(content);
      }
    });
  }
  function collectFloatingHarpoonWindows(_fileId, out) {
    if (!out.floating) out.floating = [];
    for (var i = 0; i < floatSessions.length; i++) {
      var s = floatSessions[i];
      if (!s.win || !s.win.getGeometry || !s.fileId) continue;
      out.floating.push({
        id: "harpoon:" + s.fileId + ":" + (s.declKey || i),
        kind: "harpoon",
        geom: s.win.getGeometry(),
        fileId: s.fileId,
        anchor: { declKey: s.declKey, holeKey: s.holeKey },
        followEditor: false,
        zOrder: Number(s.win.el && s.win.el.style ? s.win.el.style.zIndex : 0) || 0
      });
    }
  }
  function restoreFloatingHarpoonWindow(entry, view, engine) {
    if (!entry || entry.kind !== "harpoon" || !view || !engine) return false;
    var hit = findHoleHit(view, engine, entry.anchor);
    if (!hit) return false;
    openFromHole(view, engine, hit, { geom: entry.geom });
    return true;
  }
  global8.Harpoon = {
    openFromHole,
    proveInPanel,
    proveInPanelForFile,
    collectFloatingHarpoonWindows,
    restoreFloatingHarpoonWindow
  };
  global8.BelJarHarpoon = global8.Harpoon;

  // js/harpoon/harpoon-goal-sections.mjs
  var global9 = globalThis;
  function dirOf(name) {
    var PS = global9.ProjectSource;
    if (PS && typeof PS.dirOf === "function") return PS.dirOf(name);
    var i = String(name || "").lastIndexOf("/");
    return i === -1 ? "" : name.slice(0, i);
  }
  function baseName(name) {
    var s = String(name || "");
    var i = s.lastIndexOf("/");
    return i === -1 ? s : s.slice(i + 1);
  }
  function cfgBaseLabel(cfgPath) {
    var base = baseName(cfgPath);
    var dot = base.lastIndexOf(".");
    return dot === -1 ? base : base.slice(0, dot);
  }
  function holeHostFile(name) {
    var PS = global9.ProjectSource;
    if (PS && typeof PS.isSignaturePath === "function") return PS.isSignaturePath(name);
    var low = String(name || "").toLowerCase();
    if (low.endsWith(".cfg") || low.endsWith(".elf")) return false;
    if (low.endsWith(".bel")) return true;
    var base = String(name || "").slice(String(name || "").lastIndexOf("/") + 1);
    return base.indexOf(".") === -1;
  }
  function scanFileHoles(text) {
    var ed = global9.BelEditor;
    if (ed && typeof ed.scanFileHoles === "function") return ed.scanFileHoles(text);
    return [];
  }
  function mergeRichHoles(syntacticHits, richHoles) {
    if (!richHoles || !richHoles.length || !syntacticHits.length) return syntacticHits;
    var byPos = {};
    for (var i = 0; i < richHoles.length; i++) {
      var rh = richHoles[i];
      byPos[rh.line + ":" + rh.col] = rh;
    }
    return syntacticHits.map(function(hit) {
      var key = hit.hole.line + ":" + hit.hole.col;
      var rich = byPos[key];
      if (!rich) return hit;
      var settlementGoal = hit.hole.goal || null;
      var goal = settlementGoal || rich.goal || null;
      return {
        hole: {
          line: hit.hole.line,
          col: hit.hole.col,
          from: hit.hole.from,
          to: hit.hole.to,
          index: hit.hole.index,
          name: rich.name || hit.hole.name,
          goal,
          ctx: settlementGoal ? hit.hole.ctx || [] : rich.ctx || [],
          meta: settlementGoal ? hit.hole.meta || [] : rich.meta || []
        },
        from: hit.from,
        to: hit.to
      };
    });
  }
  function hitsForFile(file, getText, activeHits, memberHoles) {
    var base = activeHits && activeHits.length ? activeHits : scanFileHoles(getText(file.id)).map(function(h) {
      return { hole: h, from: h.from, to: h.to };
    });
    var rich = memberHoles && memberHoles[file.name];
    return rich ? mergeRichHoles(base, rich) : base;
  }
  function normalizeFile(file) {
    return {
      id: file.id,
      name: file.name,
      baseName: file.baseName || baseName(file.name)
    };
  }
  function buildSections(opts) {
    opts = opts || {};
    var files = (opts.files || []).map(normalizeFile);
    var getText = opts.getText || function() {
      return "";
    };
    var getActiveCfgsForDir = opts.getActiveCfgsForDir || function() {
      return [];
    };
    var computeDirLayout = opts.computeDirLayout;
    var activeFileId2 = opts.activeFileId || null;
    var activeHits = opts.activeHits || null;
    var memberHoles = opts.memberHoles || {};
    var developmentPaths = opts.developmentPaths || null;
    var SL = global9.ExplorerSuiteLayout;
    var PS = global9.ProjectSource;
    var resolveMembers = opts.resolveMembers || (PS && typeof PS.orderedPathsForCfg === "function" ? function(all, cfgPath2, gt) {
      return PS.orderedPathsForCfg(all, cfgPath2, gt);
    } : null);
    var fileByName = {};
    for (var i = 0; i < files.length; i++) fileByName[files[i].name] = files[i];
    var byDir = {};
    for (var j = 0; j < files.length; j++) {
      var d = dirOf(files[j].name);
      if (!byDir[d]) byDir[d] = [];
      byDir[d].push(files[j]);
    }
    var dirKeys = Object.keys(byDir).sort();
    var activeDir = opts.activeFileDir;
    if (activeDir == null && activeFileId2) {
      for (var ai = 0; ai < files.length; ai++) {
        if (files[ai].id === activeFileId2) {
          activeDir = dirOf(files[ai].name);
          break;
        }
      }
    }
    if (activeDir != null) {
      dirKeys.sort(function(a, b) {
        if (a === activeDir) return -1;
        if (b === activeDir) return 1;
        return a.localeCompare(b);
      });
    }
    var sections = [];
    var totalCount = 0;
    for (var di = 0; di < dirKeys.length; di++) {
      var dir = dirKeys[di];
      var filesInDir = byDir[dir];
      var layout = { orderedFiles: filesInDir, suiteByFile: {} };
      if (typeof computeDirLayout === "function") {
        layout = computeDirLayout(dir, filesInDir);
      } else if (SL && typeof SL.computeDirLayout === "function") {
        var activeCfgs = getActiveCfgsForDir(dir);
        layout = SL.computeDirLayout(filesInDir, activeCfgs, resolveMembers, files, getText);
      }
      var suiteByFile = layout.suiteByFile || {};
      var activeCfgs = getActiveCfgsForDir(dir);
      var placed = {};
      var dirEntries = [];
      for (var si = 0; si < activeCfgs.length; si++) {
        var cfgPath = activeCfgs[si];
        var cfgFile = fileByName[cfgPath];
        if (!cfgFile) continue;
        var memberPaths = resolveMembers ? resolveMembers(files, cfgPath, getText) : [];
        var blockNames = [cfgPath];
        for (var mi = 0; mi < memberPaths.length; mi++) blockNames.push(memberPaths[mi]);
        var meta = suiteByFile[cfgPath] || {};
        var suiteLabel = cfgBaseLabel(cfgPath);
        var suiteHue = meta.hue != null ? meta.hue : null;
        for (var bi = 0; bi < blockNames.length; bi++) {
          var path = blockNames[bi];
          placed[path] = true;
          var f = fileByName[path];
          if (!f || !holeHostFile(f.name)) continue;
          var hits = hitsForFile(f, getText, f.id === activeFileId2 ? activeHits : null, memberHoles);
          for (var hi = 0; hi < hits.length; hi++) {
            dirEntries.push({
              fileId: f.id,
              filePath: f.name,
              fileBaseName: f.baseName || baseName(f.name),
              inDevelopment: !developmentPaths || developmentPaths.indexOf(f.name) !== -1,
              suiteLabel,
              suiteHue,
              hit: hits[hi]
            });
          }
        }
      }
      for (var fi = 0; fi < filesInDir.length; fi++) {
        var file = filesInDir[fi];
        if (!holeHostFile(file.name) || placed[file.name]) continue;
        var fileHits = hitsForFile(file, getText, file.id === activeFileId2 ? activeHits : null, memberHoles);
        for (var oi = 0; oi < fileHits.length; oi++) {
          dirEntries.push({
            fileId: file.id,
            filePath: file.name,
            fileBaseName: file.baseName || baseName(file.name),
            inDevelopment: !developmentPaths || developmentPaths.indexOf(file.name) !== -1,
            suiteLabel: null,
            suiteHue: null,
            hit: fileHits[oi]
          });
        }
      }
      if (!dirEntries.length) continue;
      totalCount += dirEntries.length;
      sections.push({
        id: "dir:" + dir,
        label: dir || "/",
        suiteHue: null,
        entries: dirEntries
      });
    }
    return { sections, totalCount };
  }
  global9.HarpoonGoalSections = {
    buildSections
  };
  global9.BelJarHarpoonGoalSections = global9.HarpoonGoalSections;

  // js/harpoon/harpoon-panel.mjs
  var global10 = globalThis;
  function E2() {
    return global10.BelEditor || null;
  }
  var el3 = function(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  function curView() {
    var api = global10.CurrentEditor;
    return api && typeof api.getView === "function" ? api.getView() : null;
  }
  function activeSyntacticHits(view) {
    var ed = E2();
    if (!view || !ed || typeof ed.scanFileHoles !== "function") return [];
    return ed.scanFileHoles(view.state.doc.toString()).map(function(h) {
      return { hole: h, from: h.from, to: h.to };
    });
  }
  function normalizeGlyphs(text) {
    var g = global10.HarpoonGlyphs;
    if (g) return g.fallbackNormalize(text);
    return String(text == null ? "" : text).replace(/\|-#/g, "\u22A2#").replace(/\|-/g, "\u22A2").replace(/=>/g, "\u21D2").replace(/->/g, "\u2192");
  }
  function displayType2(typeStr) {
    var g = global10.HarpoonGlyphs;
    if (g) return g.displayBeluga(typeStr);
    var ed = E2();
    if (ed && typeof ed.normalizeType === "function") return ed.normalizeType(typeStr);
    return normalizeGlyphs(typeStr);
  }
  function renderType2(host, typeStr) {
    var norm2 = displayType2(typeStr);
    host.textContent = "";
    if (!norm2) return;
    var ed = E2();
    if (ed && typeof ed.renderTypeInto === "function") {
      try {
        ed.renderTypeInto(host, norm2, "comp");
        if (host.textContent.indexOf("|-") !== -1) host.textContent = norm2;
        return;
      } catch (e) {
      }
    }
    host.textContent = norm2;
  }
  var bodyEl = null;
  var panelEl = null;
  var backBtn = null;
  var proving = false;
  var backHandler = null;
  var provingDecl = null;
  var panelSession = null;
  var lastListRenderKey = "";
  function goalRenderToken(goal, goalState, loadingLive) {
    var st = goalState || "";
    if (loadingLive && (st === "approximate" || st === "rechecking" || st === "pending")) {
      st = "loading";
    } else if (st === "pending") {
      st = "loading";
    }
    var g = goal || "";
    if (g) g = displayType2(g).replace(/\s+/g, "");
    return st + ":" + g;
  }
  function modelRenderKey(model) {
    if (!model || !model.totalCount) return "";
    var parts = [String(model.totalCount)];
    for (var si = 0; si < model.sections.length; si++) {
      var sec = model.sections[si];
      for (var ei = 0; ei < sec.entries.length; ei++) {
        var entry = sec.entries[ei];
        var hit = entry.hit;
        var h = hit.hole;
        var key = entryKey(entry);
        parts.push([
          key,
          entry.inDevelopment === false ? "0" : "1",
          goalRenderToken(h.goal, h.goalState, h.loadingLive)
        ].join(":"));
      }
    }
    return parts.join("|");
  }
  function jumpToEntry(entry) {
    var hit = entry.hit;
    var from = hit.from != null ? hit.from : hit.hole.from;
    if (from == null) return;
    var to = hit.to != null ? hit.to : hit.hole.to != null ? hit.hole.to : from + 1;
    window.dispatchEvent(new CustomEvent("beljar:open-file-at", {
      detail: {
        fileId: entry.fileId,
        from,
        to,
        line: hit.hole.line,
        col: hit.hole.col
      }
    }));
  }
  function enterProofMode() {
    proving = true;
    if (backBtn) backBtn.hidden = false;
  }
  function exitProofMode() {
    proving = false;
    backHandler = null;
    if (backBtn) backBtn.hidden = true;
  }
  function declKeyForHit(view, hit) {
    var ed = E2();
    if (!ed || !hit) return null;
    var span = ed.getDeclSpan ? ed.getDeclSpan(hit.from) : null;
    if (!span) return null;
    var decl = ed.parseDecl(view.state.doc.sliceString(span.from, span.to));
    if (!decl) return null;
    return decl.kw + ":" + decl.name;
  }
  function activeFileId() {
    var p = typeof global10.Persist !== "undefined" ? global10.Persist : null;
    if (!p) return null;
    return typeof p.getActiveFileId === "function" ? p.getActiveFileId() : null;
  }
  function activeFilePath() {
    var p = typeof global10.Persist !== "undefined" ? global10.Persist : null;
    if (!p) return "";
    var id = typeof p.getActiveFileId === "function" ? p.getActiveFileId() : typeof p.getCurrentFileId === "function" ? p.getCurrentFileId() : null;
    if (!id || typeof p.getFileById !== "function") return "";
    var f = p.getFileById(id);
    return f && f.name ? f.name : "";
  }
  function holeKey(hit) {
    return hit.hole.line + ":" + (hit.hole.col || 1) + ":" + (hit.hole.name || "");
  }
  function entryKey(entry) {
    return entry.fileId + ":" + holeKey(entry.hit);
  }
  function mountTieredGoal(goalEl, goalState, goalType) {
    var ed = E2();
    if (ed && typeof ed.mountHoleGoalTier === "function") {
      ed.mountHoleGoalTier(goalEl, {
        surface: "harpoon-card",
        goalState,
        goal: goalType
      });
      return;
    }
    goalEl.appendChild(el3("span", "harpoon-hole-recalc beljar-tip-shimmer", "Recalculating\u2026"));
  }
  function applyGoalStateToModel(model, view) {
    var ed = E2();
    var api = global10.CurrentEditor;
    var eng = api && typeof api.getSemanticEngine === "function" ? api.getSemanticEngine() : null;
    var P2 = typeof global10.Persist !== "undefined" ? global10.Persist : null;
    if (!ed || typeof ed.enrichHoleHitsWithGoalState !== "function" || !view) return model;
    var activeId = activeFileId();
    var getText = P2 && typeof P2.getFileText === "function" ? function(id) {
      return P2.getFileText(id);
    } : function() {
      return "";
    };
    for (var si = 0; si < model.sections.length; si++) {
      var sec = model.sections[si];
      for (var ei = 0; ei < sec.entries.length; ei++) {
        var entry = sec.entries[ei];
        var enriched = ed.enrichHoleHitsWithGoalState(view, [entry.hit], entry.filePath, eng, {
          fileId: entry.fileId,
          isActiveFile: entry.fileId === activeId,
          inDevelopment: entry.inDevelopment !== false,
          fileText: String(getText(entry.fileId) ?? "")
        });
        entry.hit = enriched[0];
      }
    }
    return model;
  }
  function maybeCertifyVisibleGoals(model, view) {
    var ed = E2();
    if (!ed || typeof ed.scheduleCertifyHoleGoalsScoped !== "function" || !view) return;
    var activeId = activeFileId();
    var hits = [];
    for (var si = 0; si < model.sections.length; si++) {
      var sec = model.sections[si];
      for (var ei = 0; ei < sec.entries.length; ei++) {
        var entry = sec.entries[ei];
        if (entry.fileId !== activeId || entry.inDevelopment === false) continue;
        hits.push(entry.hit);
      }
    }
    if (hits.length) ed.scheduleCertifyHoleGoalsScoped(view, hits);
  }
  function mergeHitGoal(hit, richHoles) {
    if (!richHoles || !richHoles.length || !hit) return hit;
    var byPos = {};
    for (var i = 0; i < richHoles.length; i++) {
      byPos[richHoles[i].line + ":" + richHoles[i].col] = richHoles[i];
    }
    var rh = byPos[hit.hole.line + ":" + hit.hole.col];
    if (!rh || !rh.goal) return hit;
    return {
      hole: Object.assign({}, hit.hole, {
        goal: rh.goal,
        ctx: rh.ctx || [],
        meta: rh.meta || []
      }),
      from: hit.from,
      to: hit.to
    };
  }
  function collectInScopeHoleGoals() {
    var ed = E2();
    var view = curView();
    if (ed && typeof ed.freshHoleGoalsForDevelopment === "function" && view) {
      return ed.freshHoleGoalsForDevelopment(view) || {};
    }
    return {};
  }
  function enrichOutOfScopeEntry(entry, view) {
    if (entry.inDevelopment !== false || entry.hit.hole.goal) return entry;
    var ed = E2();
    if (!ed || typeof ed.freshHoleGoalsForFile !== "function" || !view) return entry;
    var extra = ed.freshHoleGoalsForFile(view, entry.fileId) || {};
    var rich = extra[entry.filePath];
    if (!rich) return entry;
    return Object.assign({}, entry, { hit: mergeHitGoal(entry.hit, rich) });
  }
  function collectProjectSections() {
    var P2 = typeof global10.Persist !== "undefined" ? global10.Persist : null;
    var PG = typeof global10.HarpoonGoalSections !== "undefined" ? global10.HarpoonGoalSections : null;
    var holeGoals = collectInScopeHoleGoals();
    var view = curView();
    var ed = E2();
    var devPaths = ed && typeof ed.developmentMemberPaths === "function" && view ? ed.developmentMemberPaths(view) : null;
    if (!P2 || !PG || typeof PG.buildSections !== "function") {
      var fp = activeFilePath();
      var hits = activeSyntacticHits(view);
      if (holeGoals[fp]) {
        hits = hits.map(function(hit) {
          return mergeHitGoal(hit, holeGoals[fp]);
        });
      }
      if (!hits.length) return { sections: [], totalCount: 0 };
      return {
        sections: [{
          id: "active",
          label: "",
          suiteHue: null,
          entries: hits.map(function(hit) {
            return {
              fileId: activeFileId(),
              filePath: fp,
              fileBaseName: fp,
              inDevelopment: true,
              hit
            };
          })
        }],
        totalCount: hits.length
      };
    }
    var files = typeof P2.listFiles === "function" ? P2.listFiles() : [];
    var getText = typeof P2.getFileText === "function" ? function(id) {
      return P2.getFileText(id);
    } : function() {
      return "";
    };
    var PS = typeof global10.ProjectSource !== "undefined" ? global10.ProjectSource : null;
    var SL = typeof global10.ExplorerSuiteLayout !== "undefined" ? global10.ExplorerSuiteLayout : null;
    var model = PG.buildSections({
      files,
      getText,
      activeFileId: activeFileId(),
      activeHits: activeSyntacticHits(view),
      memberHoles: holeGoals,
      developmentPaths: devPaths,
      getActiveCfgsForDir: typeof P2.getActiveCfgsForDir === "function" ? function(dir) {
        return P2.getActiveCfgsForDir(dir);
      } : function() {
        return [];
      },
      computeDirLayout: SL && typeof SL.computeDirLayout === "function" && PS ? function(dir, filesInDir) {
        var active = P2.getActiveCfgsForDir(dir);
        var resolver = typeof PS.orderedPathsForCfg === "function" ? function(all, cfgPath, gt) {
          return PS.orderedPathsForCfg(all, cfgPath, gt);
        } : null;
        return SL.computeDirLayout(filesInDir, active, resolver, files, getText);
      } : null
    });
    for (var si = 0; si < model.sections.length; si++) {
      var sec = model.sections[si];
      for (var ei = 0; ei < sec.entries.length; ei++) {
        sec.entries[ei] = enrichOutOfScopeEntry(sec.entries[ei], view);
      }
    }
    return model;
  }
  function buildRow(entry) {
    var hit = entry.hit;
    var key = entryKey(entry);
    var goalType = hit.hole.goal || null;
    var goalState = hit.hole.goalState || (goalType ? "live" : "pending");
    var loadingLive = !!hit.hole.loadingLive;
    var outOfScope = entry.inDevelopment === false;
    var tiered = !outOfScope && loadingLive && (goalState === "pending" || goalState === "approximate" || goalState === "rechecking");
    var showType = !!(goalType && (goalState === "live" || goalState === "cached" || outOfScope && goalState === "approximate"));
    var row = el3("div", "harpoon-panel-hole");
    row.setAttribute("role", "button");
    row.tabIndex = 0;
    row.dataset.entryKey = key;
    if (outOfScope && !goalType) row.classList.add("is-indeterminate");
    var head = el3("div", "harpoon-panel-hole-head");
    head.appendChild(el3("span", "harpoon-hole-mark", "?"));
    var loc = el3("span", "harpoon-hole-loc");
    var pathLabel = entry.fileBaseName || entry.filePath;
    if (pathLabel) loc.appendChild(el3("span", "harpoon-hole-path", pathLabel));
    loc.appendChild(el3("span", "harpoon-hole-ln", String(hit.hole.line)));
    head.appendChild(loc);
    if (entry.suiteLabel) {
      var headEnd = el3("div", "harpoon-panel-hole-head-end");
      var suiteEl = el3("span", "harpoon-hole-suite");
      if (entry.suiteHue != null) suiteEl.style.setProperty("--suite-hue", String(entry.suiteHue));
      suiteEl.textContent = entry.suiteLabel;
      headEnd.appendChild(suiteEl);
      head.appendChild(headEnd);
    }
    row.appendChild(head);
    row.appendChild(el3("div", "harpoon-panel-hole-rule"));
    var goal = el3("div", "harpoon-hole-goal");
    if (showType) {
      row.dataset.goalState = outOfScope ? goalState === "approximate" ? "approximate" : "cached" : "ready";
      var edLive = E2();
      if (edLive && typeof edLive.mountHoleGoalTier === "function") {
        edLive.mountHoleGoalTier(goal, {
          surface: "harpoon-card",
          goalState: "live",
          goal: goalType
        });
      } else {
        renderType2(goal, goalType);
      }
    } else if (tiered) {
      row.classList.add("is-pending");
      row.dataset.goalState = goalState;
      mountTieredGoal(goal, goalState, goalType);
    } else if (outOfScope) {
      row.classList.add("is-unfocused");
      row.dataset.goalState = "inactive";
      goal.appendChild(el3("span", "harpoon-hole-unfocused", "Not computable outside scope"));
    } else {
      row.classList.add("is-pending");
      row.dataset.goalState = "pending";
      mountTieredGoal(goal, "pending", null);
    }
    row.appendChild(goal);
    row.addEventListener("click", function(ev) {
      if (ev.ctrlKey || ev.metaKey) {
        ev.preventDefault();
        jumpToEntry(entry);
        return;
      }
      proveEntry(entry);
    });
    row.addEventListener("keydown", function(ev) {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      proveEntry(entry);
    });
    return row;
  }
  function renderList(opts) {
    if (!bodyEl) return;
    exitProofMode();
    var view = curView();
    var model = collectProjectSections();
    applyGoalStateToModel(model, view);
    if (opts && opts.certify) maybeCertifyVisibleGoals(model, view);
    var renderKey = modelRenderKey(model);
    if (model.totalCount && renderKey === lastListRenderKey && bodyEl.querySelector(".harpoon-panel-list")) return;
    lastListRenderKey = renderKey;
    if (!model.totalCount) {
      bodyEl.textContent = "";
      var empty = el3("div", "panel-empty");
      empty.appendChild(el3("p", "panel-empty__note", "No open goals in this project."));
      bodyEl.appendChild(empty);
      return;
    }
    bodyEl.textContent = "";
    var root = el3("div", "harpoon-panel-list");
    for (var si = 0; si < model.sections.length; si++) {
      var sec = model.sections[si];
      var block = el3("div", "harpoon-panel-suite");
      if (sec.label) {
        var lbl = el3("div", "harpoon-panel-suite-label");
        var isDev = sec.entries.some(function(e) {
          return e.inDevelopment !== false;
        });
        if (isDev) lbl.classList.add("is-active-dev");
        lbl.textContent = sec.label;
        block.appendChild(lbl);
      }
      var secList = el3("div", "harpoon-panel-section");
      for (var ei = 0; ei < sec.entries.length; ei++) {
        secList.appendChild(buildRow(sec.entries[ei]));
      }
      block.appendChild(secList);
      root.appendChild(block);
    }
    bodyEl.appendChild(root);
  }
  function beginPanelSession(fileId, declKey, start) {
    enterProofMode();
    if (declKey && fileId) provingDecl = { fileId, declKey };
    if (global10.WorkspaceState && global10.WorkspaceState.scheduleSave) {
      global10.WorkspaceState.scheduleSave();
    }
    bodyEl.textContent = "";
    var host = el3("div", "harpoon-panel-session");
    bodyEl.appendChild(host);
    backHandler = function() {
      if (panelSession && typeof panelSession.disposeSession === "function") {
        panelSession.disposeSession();
        panelSession = null;
        return;
      }
      var proof = global10.HarpoonEngine;
      if (proof && proof.dispose) proof.dispose();
      provingDecl = null;
      renderList();
    };
    panelSession = start(host, {
      onSessionStart: function() {
        enterProofMode();
      },
      onSessionEnd: function() {
        panelSession = null;
        provingDecl = null;
        renderList();
      },
      onBack: backHandler,
      onDone: function() {
        panelSession = null;
        provingDecl = null;
        renderList();
      }
    });
  }
  function proveHit(view, eng, hit, fileId) {
    var lab = global10.Harpoon;
    if (!lab || typeof lab.proveInPanel !== "function") return;
    var fid = fileId || activeFileId();
    beginPanelSession(fid, declKeyForHit(view, hit), function(host, opts) {
      return lab.proveInPanel(view, eng, hit, host, opts);
    });
  }
  function declKeyInFileText(fileId, from) {
    var ed = E2();
    var P2 = global10.Persist;
    if (!ed || !P2 || typeof ed.declSpanInText !== "function") return null;
    var text = String(P2.getFileText(fileId) || "");
    var span = ed.declSpanInText(text, from);
    var decl = span ? ed.parseDecl(text.slice(span.from, span.to)) : null;
    return decl ? decl.kw + ":" + decl.name : null;
  }
  function proveEntry(entry) {
    var fid = entry.fileId;
    var lab = global10.Harpoon;
    if (fid !== activeFileId()) {
      if (!lab || typeof lab.proveInPanelForFile !== "function") return;
      beginPanelSession(fid, declKeyInFileText(fid, entry.hit.from), function(host, opts) {
        return lab.proveInPanelForFile(fid, entry.hit, host, opts);
      });
      return;
    }
    var view = curView();
    var api = global10.CurrentEditor;
    var eng = api && typeof api.getSemanticEngine === "function" ? api.getSemanticEngine() : null;
    if (view && eng) proveHit(view, eng, entry.hit, fid);
  }
  function init(container, opts) {
    bodyEl = container;
    panelEl = opts && opts.panelEl || container.closest(".harpoon-panel");
    if (panelEl) {
      backBtn = panelEl.querySelector(".harpoon-panel-back");
      if (backBtn) {
        backBtn.addEventListener("click", function(e) {
          e.preventDefault();
          if (backHandler) backHandler();
          else renderList();
        });
      }
    }
    renderList({ certify: true });
  }
  function refresh() {
    if (bodyEl && !proving) renderList({ certify: true });
  }
  function collectWorkspaceHarpoon(out) {
    if (!out.sidebar) return;
    out.sidebar.harpoon = { provingDecl: proving && provingDecl ? provingDecl : null };
  }
  function restoreWorkspaceHarpoon(sidebar, deps) {
    if (!sidebar || !sidebar.harpoon || !sidebar.harpoon.provingDecl) return;
    var decl = sidebar.harpoon.provingDecl;
    var view = deps && deps.view;
    var eng = deps && deps.engine;
    if (!view || !eng) return;
    if (decl.fileId && decl.fileId !== activeFileId()) return;
    var lab = global10.Harpoon;
    if (!lab) return;
    var hit = null;
    if (typeof lab.restoreFloatingHarpoonWindow === "function") {
      var doc = view.state.doc;
      var holes = eng.getHoles ? eng.getHoles() : [];
      for (var i = 0; i < holes.length; i++) {
        var h = holes[i];
        if (!h || h.line < 1 || h.line > doc.lines) continue;
        var off = doc.line(h.line).from + Math.max(0, (h.col || 1) - 1);
        if (off >= doc.length || doc.sliceString(off, off + 1) !== "?") continue;
        var candidate = { hole: h, from: off, to: off + 1 };
        if (declKeyForHit(view, candidate) === decl.declKey) {
          hit = candidate;
          break;
        }
      }
    }
    if (hit) proveHit(view, eng, hit, decl.fileId);
  }
  global10.HarpoonPanel = {
    init,
    refresh,
    collectWorkspaceHarpoon,
    restoreWorkspaceHarpoon
  };
  global10.BelJarHarpoonPanel = global10.HarpoonPanel;
})();
