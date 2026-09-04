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
    move: { w: 104, minW: 74, h: 32, label: 13 },
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
      var entry = st.traceEntry || advancedTrace[i];
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
    if (n.type === "move") {
      var mlen = Math.min((n.label || "").length, SIZE.move.label);
      var dot = n.closed || n.open ? 14 : 0;
      return Math.max(SIZE.move.minW, Math.min(SIZE.move.w, 26 + mlen * 6.3 + dot));
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
    if (opts.fill && container.clientHeight > 0) cssH = container.clientHeight;
    var scale = H > 0 ? cssH / H : 1;
    if (opts.fill) scale = Math.min(scale, 1.25);
    var hostW = container.clientWidth || 640;
    var viewW = scale > 0 ? hostW / scale : contentW;
    var defaultW = Math.min(viewW, contentW);
    if (defaultW < 300) defaultW = Math.min(300, contentW);
    var defaultX = (minX + maxX) / 2 - defaultW / 2;
    var viewH = scale > 0 ? cssH / scale : H;
    var defaultY = H / 2 - viewH / 2;
    var vb = opts.initialView ? { x: opts.initialView.x, y: opts.initialView.y, w: opts.initialView.w, h: opts.initialView.h } : { x: defaultX, y: defaultY, w: defaultW, h: viewH };
    var svg = el("svg", {
      class: "hpt-svg",
      viewBox: vb.x + " " + vb.y + " " + vb.w + " " + vb.h,
      // Top-anchored by default, which is what a scrolling compact strip wants. When the
      // graph is filling a pane, any slack belongs on both sides of it, not all below.
      preserveAspectRatio: opts.fill ? "xMidYMid meet" : "xMidYMin meet"
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
      var scale2 = Math.max(vb.w / svg.clientWidth, vb.h / svg.clientHeight);
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
    function appendDeclLabel(glabel, declName, declKw) {
      if (!declName) return;
      var name = el4("span", "harpoon-lab-auto-goal-name");
      if (declKw) name.appendChild(el4("span", "harpoon-lab-goal-decl-kw bel-hl-keyword", declKw));
      name.appendChild(el4("span", "harpoon-lab-goal-decl-name bel-hl-var-def", declName));
      glabel.appendChild(name);
    }
    function appendAutoGoalHero(parent, goalType, declName, goalState, priorBinders, declKw) {
      var wrap = el4("div", "harpoon-lab-auto-goal harpoon-lab-strip tone-goal");
      var glabel = el4("div", "harpoon-lab-goal-label");
      glabel.appendChild(el4("span", "harpoon-lab-goal-label-text harpoon-lab-section-label is-goal", "Goal"));
      appendDeclLabel(glabel, declName, declKw);
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
      appendDeclLabel,
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
      var hadSemi = /;\s*$/.test(declSlice);
      var newDecl = ed.committedMemberText ? ed.committedMemberText(decl, body, hadSemi) : "rec " + decl.name + " : " + decl.type + " =\n" + body + (hadSemi ? "\n;" : "");
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
    var tacticVerb2 = deps.tacticVerb || function(k) {
      return k || "move";
    };
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
      verb.textContent = tacticVerb2(s.move);
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
      var node = session._statTipEl || session._autoSearchSpinner;
      if (!node) return;
      if (node.getAttribute("data-tooltip") === tip) return;
      if (global6.Tooltips && global6.Tooltips.set) {
        global6.Tooltips.set(node, tip, { ariaLabel: false });
      } else if (tip) {
        node.setAttribute("data-tooltip", tip);
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
      verb.textContent = tacticVerb2(step.move);
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
      this.syncLiveContext();
      this.syncReelStatus();
      this.syncAutoPauseBtn();
    }
    ;
    function syncLiveContext() {
      var na = this.nativeAuto;
      if (!na) return;
      var hole = na.liveHoles && na.liveHoles.length ? na.liveHoles[0] : null;
      var meta = hole && hole.meta || [];
      var ctx = hole && hole.ctx || [];
      var key = JSON.stringify([meta, ctx]);
      if (key === this._ctxKey) return;
      var wrap = this._ctxWrap;
      if (!meta.length && !ctx.length) {
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
        this._ctxWrap = null;
        this._ctxKey = key;
        return;
      }
      if (!wrap || !wrap.parentNode) {
        var anchor = this._autoSearchBox;
        if (!anchor || !anchor.parentNode) return;
        wrap = el4("div", "harpoon-lab-context");
        anchor.parentNode.insertBefore(wrap, anchor);
        this._ctxWrap = wrap;
      }
      wrap.textContent = "";
      this.renderCtx(wrap, "meta", meta);
      this.renderCtx(wrap, "ctx", ctx);
      this._ctxKey = key;
    }
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
      syncLiveContext,
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
    var ICON_CHEVRON_LEFT2 = deps.ICON_CHEVRON_LEFT;
    function renderNativeAuto(parent) {
      var na = this.nativeAuto;
      if (!na) return;
      var self = this;
      var box = el4("div", "harpoon-lab-auto is-" + na.phase + (na.paused ? " is-paused" : "") + (self.isFrozenRetrospective() ? " is-frozen" : ""));
      var stage = 0;
      if (na.goalType) {
        var hero = resolveNativeAutoGoalDisplay(self, na);
        var heroPriors = hero.goalType === na.goalType ? na.priorBinders : priorGoalBinders2(self, na.sourceGoalType, hero.goalType);
        this._autoGoalWrap = appendAutoGoalHero(
          box,
          hero.goalType,
          na.declName,
          hero.goalState,
          heroPriors,
          na.declKw
        );
      }
      if (!self.isFrozenRetrospective()) this.renderCompromiseBanner(box);
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
      if (this.manual && !self.isFrozenRetrospective()) {
        var backStrip = buildBannerShell2({
          tag: "button",
          className: "harpoon-lab-resume harpoon-lab-strip harpoon-lab-banner",
          tone: na.complete ? "goal" : "action",
          icon: ICON_CHEVRON_LEFT2,
          badgeClass: "harpoon-lab-resume-badge",
          titleClass: "harpoon-lab-resume-title",
          subClass: "harpoon-lab-resume-sub",
          title: na.complete ? "Take it back by hand" : "Continue by hand",
          sub: na.complete ? "Review the steps, or undo before placing" : na.steps && na.steps.length ? "Keep the " + na.steps.length + " step" + (na.steps.length === 1 ? "" : "s") + " Orca found and carry on" : "Pick the next move yourself",
          onClick: function() {
            self.backToManual();
          }
        });
        stageNode2(backStrip, stage);
        stage += 1;
        box.appendChild(backStrip);
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
    function belugaText(s) {
      var g = globalThis.HarpoonGlyphs;
      return g ? g.displayBeluga(s) : String(s == null ? "" : s);
    }
    var STUCK_REASON = {
      "no-move": "no move certified",
      "step-bound": "step limit",
      "search-bound": "search bound hit",
      "file-errors": "file errors",
      "coinductive-out-of-fragment": "coinductive goal, out of fragment",
      "no-totality-measure": "no totality measure, recursion unavailable",
      stopped: "stopped",
      cancelled: "cancelled"
    };
    var STUCK_HINT = {
      "no-totality-measure": "Every candidate below is non-recursive. Add a / total / measure to use the induction hypothesis.",
      "step-bound": "The budget ran out with the goal still open. It was not refuted.",
      "search-bound": "The search hit its bound, not the end of the space.",
      "file-errors": "The program does not check before this goal. Fix those errors first.",
      "coinductive-out-of-fragment": "Coinductive goals are outside the fragment Orca searches."
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
      var hint = STUCK_HINT[stuck.reason];
      if (hint) card.appendChild(el4("p", "harpoon-stuck-hint", hint));
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
        var groupRows = function(items) {
          var order = [];
          var byKey = {};
          items.forEach(function(v) {
            var reason = stuckReason(v.reason);
            var key = v.kind + " :: " + reason;
            if (!byKey[key]) {
              byKey[key] = { kind: v.kind, verdict: v.verdict, reason, heads: [] };
              order.push(key);
            }
            byKey[key].heads.push(v.head);
          });
          return order.map(function(k) {
            return byKey[k];
          });
        };
        var addGroup = function(g) {
          var li = el4("li", "harpoon-stuck-tried-row is-" + g.verdict);
          li.appendChild(el4("span", "hpt-card-kind hpt-kind--" + g.kind, g.kind));
          var hd = el4("code", "harpoon-stuck-tried-head");
          renderSource2(hd, g.heads[0]);
          li.appendChild(hd);
          if (g.heads.length > 1) {
            var more = el4("span", "harpoon-stuck-tried-more", "+" + (g.heads.length - 1));
            setTip2(more, g.heads.map(belugaText).join("\n"), { ariaLabel: false });
            more.setAttribute(
              "aria-label",
              g.heads.length + " candidates rejected with this objection"
            );
            li.appendChild(more);
          }
          if (g.reason) {
            var rn = el4("span", "harpoon-stuck-tried-reason", g.reason);
            setTip2(rn, g.reason, { ariaLabel: false });
            li.appendChild(rn);
          }
          list.appendChild(li);
        };
        groupRows(rejected).forEach(addGroup);
        groupRows(guarded).forEach(addGroup);
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
      this._compactTreeRedraw = null;
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
        return opts.live ? self.derivationNa() || na : na;
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
          // The roomy explorer gives the graph a whole pane; the compact one gives it a
          // fixed strip inside the panel, where filling would mean growing the panel.
          fill: opts.compact === false,
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
      if (opts.compact === false) requestAnimationFrame(draw);
      return { wrap, redraw: draw };
    }
    ;
    function openTreeExplorer() {
      var self = this;
      var fw = FW2();
      var na = this.derivationNa();
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

  // js/harpoon/harpoon-lab-manual.mjs
  function createManual(deps) {
    var el4 = deps.el;
    var iconBtn2 = deps.iconBtn;
    var setTip2 = deps.setTip;
    var E3 = deps.E;
    var toast2 = deps.toast;
    var renderSource2 = deps.renderSource;
    var appendAutoGoalHero = deps.appendAutoGoalHero;
    var appendDeclLabel = deps.appendDeclLabel;
    var priorGoalBinders2 = deps.priorGoalBinders;
    var buildPlaceStrip2 = deps.buildPlaceStrip;
    var renderCommitOutcome2 = deps.renderCommitOutcome;
    var stageNode2 = deps.stageNode;
    var solvedBodyOf2 = deps.solvedBodyOf;
    var appendCommittedStepRow = deps.appendCommittedStepRow;
    var appendAutoSolution = deps.appendAutoSolution;
    var renderManualSolvedSummary2 = deps.renderManualSolvedSummary;
    var tacticVerb2 = deps.tacticVerb;
    var setNativeSearchLabel2 = deps.setNativeSearchLabel;
    var nativeAutoSearchLabel = deps.nativeAutoSearchLabel;
    var ICON_UNDO2 = deps.ICON_UNDO;
    var ICON_REDO2 = deps.ICON_REDO;
    var ICON_ORCA2 = deps.ICON_ORCA;
    var ICON_CHEVRON_DOWN2 = deps.ICON_CHEVRON_DOWN;
    var ICON_DECLINE2 = deps.ICON_DECLINE;
    var ICON_CHECK2 = deps.ICON_CHECK;
    var ICON_PLAY2 = deps.ICON_PLAY;
    var ICON_PAUSE2 = deps.ICON_PAUSE;
    var ICON_POPOUT2 = deps.ICON_POPOUT;
    var manualRenderSig2 = deps.manualRenderSig;
    var TACTIC_TIP = {
      intro: "Introduce the goal\u2019s binders",
      split: "Case-analyse a hypothesis",
      invert: "Invert a hypothesis with a single applicable case",
      impossible: "Refute a hypothesis that cannot be inhabited",
      fill: "Close the goal with an inhabiting term",
      recurse: "Apply the induction hypothesis",
      lemma: "Apply a lemma",
      synth: "Synthesised chain closing the goal"
    };
    function tacticOf(mv, hole) {
      var base = { verb: tacticVerb2(mv.kind), tip: TACTIC_TIP[mv.kind] || mv.rationale || "" };
      var arg = null;
      var ed = E3();
      var meta = null;
      if (ed && typeof ed.stepMeta === "function") {
        try {
          meta = ed.stepMeta(mv, mv.text, hole);
        } catch (e) {
          meta = null;
        }
      }
      if (mv.kind === "split") arg = mv.scrutinee || meta && meta.scrutinee || null;
      else if (mv.kind === "impossible") arg = meta && meta.refuted;
      else if (mv.kind === "recurse" || mv.kind === "lemma" || mv.kind === "invert") {
        arg = meta && meta.callee || meta && meta.uses && meta.uses[0] || null;
      } else if (mv.kind === "fill") arg = meta && meta.filler;
      return { verb: base.verb, arg, tip: base.tip, meta };
    }
    function displayGoal(s) {
      var g = globalThis.HarpoonGlyphs;
      return g ? g.displayBeluga(s) : String(s == null ? "" : s);
    }
    function moveHeadText(text) {
      return String(text || "").split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 90);
    }
    function buildMoveRow(session, mv, hole, index) {
      var tac = tacticOf(mv, hole);
      var row = el4("div", "harpoon-lab-move move-" + mv.kind + (index === 0 ? " is-primary" : ""));
      row.style.setProperty("--i", String(index));
      row._mv = mv;
      var btn = el4("button", "harpoon-lab-move-main");
      btn.type = "button";
      var head = el4("span", "harpoon-lab-move-head");
      var verb = el4("span", "harpoon-lab-move-verb", tac.verb);
      setTip2(verb, tac.tip);
      head.appendChild(verb);
      if (tac.arg) {
        var argEl = el4("span", "harpoon-lab-move-arg", tac.arg);
        setTip2(argEl, argTip(mv.kind, tac.arg));
        head.appendChild(argEl);
      }
      btn.appendChild(head);
      if (mv.rationale) btn.appendChild(el4("span", "harpoon-lab-move-why", mv.rationale));
      btn.setAttribute("aria-label", "Apply " + tac.verb + (tac.arg ? " " + tac.arg : ""));
      btn.addEventListener("click", function(e) {
        e.preventDefault();
        session.manualApply(mv, row);
      });
      row.appendChild(btn);
      var foot = el4("button", "harpoon-lab-move-foot");
      foot.type = "button";
      foot.setAttribute("aria-expanded", "false");
      foot.appendChild(el4("span", "harpoon-lab-move-termhead", moveHeadText(mv.text)));
      var pip = el4("span", "harpoon-lab-move-pip");
      pip.setAttribute("aria-hidden", "true");
      foot.appendChild(pip);
      row._pip = pip;
      var chev = el4("span", "harpoon-lab-move-chevron");
      chev.innerHTML = ICON_CHEVRON_DOWN2;
      foot.appendChild(chev);
      setTip2(foot, "Show the full term");
      foot.addEventListener("click", function(e) {
        e.preventDefault();
        e.stopPropagation();
        var open = row.classList.toggle("is-expanded");
        foot.setAttribute("aria-expanded", open ? "true" : "false");
        setTip2(foot, open ? "Hide the full term" : "Show the full term");
        var full = row.querySelector(".harpoon-lab-move-term");
        if (open && !full) {
          var term = el4("div", "harpoon-lab-move-term");
          renderSource2(term, mv.text);
          row.appendChild(term);
        }
      });
      row.appendChild(foot);
      markPip(row, null);
      return row;
    }
    function argTip(kind, arg) {
      if (kind === "split") return "Case-analyse " + arg;
      if (kind === "impossible") return "Refute " + arg;
      if (kind === "recurse") return "The induction hypothesis " + arg;
      if (kind === "lemma") return "The lemma " + arg;
      if (kind === "invert") return "Invert " + arg;
      return arg;
    }
    var PIP_TIP = {
      checking: "Checking this move with Beluga\u2026",
      verified: "Beluga accepts this move",
      rejected: "Beluga rejects this move"
    };
    function markPip(row, state, detail) {
      if (!row || !row._pip) return;
      row.classList.remove("is-checking", "is-verified", "is-rejected");
      if (state) row.classList.add("is-" + state);
      if (state === "verified") row._pip.innerHTML = ICON_CHECK2;
      else if (state === "rejected") row._pip.innerHTML = ICON_DECLINE2;
      else row._pip.innerHTML = "";
      var main = row.querySelector(".harpoon-lab-move-main");
      if (main) {
        main.disabled = state === "rejected";
        main.setAttribute("aria-disabled", state === "rejected" ? "true" : "false");
      }
      var tip = PIP_TIP[state] || "";
      if (state === "rejected" && detail) tip += ": " + String(detail).slice(0, 180);
      setTip2(row._pip, tip);
      row._pip.setAttribute("aria-hidden", tip ? "false" : "true");
      if (tip) row._pip.setAttribute("aria-label", tip);
    }
    function skel(cls, w) {
      var n = el4("span", "harpoon-skel" + (cls ? " " + cls : ""));
      if (w) n.style.width = w;
      return n;
    }
    function sectionLabel(text) {
      var n = el4("div", "harpoon-lab-section-label is-steps harpoon-lab-moves-label");
      n.textContent = text;
      return n;
    }
    function declKwOf2(prep) {
      var key = prep && prep.declKey || "";
      var i = key.indexOf(":");
      return i > 0 ? key.slice(0, i) : "";
    }
    function skelGoalHero(declName, declKw) {
      var wrap = el4("div", "harpoon-lab-auto-goal harpoon-lab-strip tone-goal");
      var glabel = el4("div", "harpoon-lab-goal-label");
      glabel.appendChild(el4("span", "harpoon-lab-goal-label-text harpoon-lab-section-label is-goal", "Goal"));
      appendDeclLabel(glabel, declName, declKw);
      wrap.appendChild(glabel);
      var body = el4("div", "harpoon-lab-auto-goal-body");
      body.appendChild(skel("harpoon-skel--goal", "72%"));
      wrap.appendChild(body);
      return wrap;
    }
    function skelBar() {
      var bar = el4("div", "harpoon-lab-bar");
      var status = el4("div", "harpoon-lab-status");
      status.appendChild(el4("span", "harpoon-lab-status-dot"));
      status.appendChild(skel("harpoon-skel--text", "3.6rem"));
      bar.appendChild(status);
      return bar;
    }
    function skelCtx() {
      var wrap = el4("div", "harpoon-lab-context");
      var sec = el4("div", "harpoon-lab-ctx");
      sec.appendChild(el4("span", "harpoon-lab-ctx-label", "meta"));
      var rows = el4("div", "harpoon-lab-binders");
      ["58%", "41%"].forEach(function(w, i) {
        var row = el4("div", "harpoon-lab-binder");
        row.appendChild(skel("harpoon-skel--text" + (i ? " harpoon-skel--d1" : ""), w));
        rows.appendChild(row);
      });
      sec.appendChild(rows);
      wrap.appendChild(sec);
      return wrap;
    }
    function skelMoveRow(i) {
      var row = el4("div", "harpoon-lab-move is-skeleton");
      row.style.setProperty("--i", String(i));
      var main = el4("div", "harpoon-lab-move-main");
      var head = el4("span", "harpoon-lab-move-head");
      head.appendChild(skel("harpoon-skel--verb", ["2.8rem", "2.2rem", "3.4rem"][i % 3]));
      main.appendChild(head);
      main.appendChild(skel("harpoon-skel--text harpoon-skel--d1", ["52%", "38%", "45%"][i % 3]));
      row.appendChild(main);
      return row;
    }
    var GLOW_PULL_X = 0.46;
    var GLOW_PULL_Y = 0.36;
    var GLOW_CLAMP_X = 0.3;
    var GLOW_CLAMP_Y = 0.35;
    function bindOrcaGlow(btn) {
      var reduce = globalThis.matchMedia && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return;
      var rect = null;
      var raf = 0;
      var pending = null;
      function flush() {
        raf = 0;
        if (!pending) return;
        btn.style.setProperty("--glow-dx", pending.x.toFixed(1) + "px");
        btn.style.setProperty("--glow-dy", pending.y.toFixed(1) + "px");
        pending = null;
      }
      function clamp(v, lim) {
        return v < -lim ? -lim : v > lim ? lim : v;
      }
      btn.addEventListener("pointerenter", function() {
        rect = btn.getBoundingClientRect();
      });
      btn.addEventListener("pointermove", function(e) {
        if (!rect || !rect.width) rect = btn.getBoundingClientRect();
        if (!rect.width) return;
        var restX = rect.left + rect.width * 0.18;
        pending = {
          x: clamp((e.clientX - restX) * GLOW_PULL_X, rect.width * GLOW_CLAMP_X),
          y: clamp(
            (e.clientY - (rect.top + rect.height / 2)) * GLOW_PULL_Y,
            rect.height * GLOW_CLAMP_Y
          )
        };
        if (!raf) raf = globalThis.requestAnimationFrame(flush);
      });
      btn.addEventListener("pointerleave", function() {
        if (raf) {
          globalThis.cancelAnimationFrame(raf);
          raf = 0;
        }
        pending = null;
        rect = null;
        btn.style.removeProperty("--glow-dx");
        btn.style.removeProperty("--glow-dy");
      });
    }
    function buildOrcaRunning(session, na) {
      var band = el4("div", "harpoon-lab-orca-band is-running" + (na.paused ? " is-paused" : ""));
      var shell = el4("div", "harpoon-lab-orca harpoon-lab-orca--live");
      var badge = el4("span", "harpoon-lab-orca-badge" + (na.paused ? "" : " is-working"));
      badge.innerHTML = ICON_ORCA2;
      shell.appendChild(badge);
      session._autoSearchSpinner = badge;
      session._statTipEl = badge;
      var copy = el4("span", "harpoon-lab-orca-copy");
      copy.appendChild(el4("span", "harpoon-lab-orca-title", na.paused ? "Orca paused" : "Orca"));
      var sub = el4("span", "harpoon-lab-orca-sub" + (na.paused ? "" : " beljar-tip-shimmer"));
      sub.textContent = na.paused ? "Take a step by hand, or resume" : nativeAutoSearchLabel(na);
      if (!na.paused) sub.style.setProperty("--shimmer-accent", "var(--repl-holes-accent)");
      copy.appendChild(sub);
      shell.appendChild(copy);
      session._autoSearchText = sub;
      var actions = el4("div", "harpoon-lab-orca-actions");
      var pauseBtn = iconBtn2(
        "icon-btn harpoon-lab-auto-pause",
        na.paused ? ICON_PLAY2 : ICON_PAUSE2,
        na.paused ? "Resume the search" : "Pause and get the tactics back",
        na.paused ? "Resume" : "Pause",
        function() {
          session.toggleOrcaPause();
        }
      );
      pauseBtn._belPauseState = !!na.paused;
      session._autoPauseBtn = pauseBtn;
      actions.appendChild(pauseBtn);
      actions.appendChild(iconBtn2(
        "icon-btn harpoon-lab-auto-popout",
        ICON_POPOUT2,
        "Open the proof tree explorer (grows live)",
        "Pop out tree",
        function() {
          session.openTreeExplorer();
        }
      ));
      shell.appendChild(actions);
      band.appendChild(shell);
      session._autoSearchBox = band;
      return band;
    }
    function buildOrca(session, state, disabled) {
      var band = el4("div", "harpoon-lab-orca-band");
      var btn = el4("button", "harpoon-lab-orca");
      btn.type = "button";
      if (disabled) btn.disabled = true;
      var badge = el4("span", "harpoon-lab-orca-badge");
      badge.innerHTML = ICON_ORCA2;
      btn.appendChild(badge);
      var copy = el4("span", "harpoon-lab-orca-copy");
      copy.appendChild(el4("span", "harpoon-lab-orca-title", "Orca"));
      copy.appendChild(el4(
        "span",
        "harpoon-lab-orca-sub",
        state && state.steps.length ? "Search for the rest of the proof" : "Search for the whole proof"
      ));
      btn.appendChild(copy);
      if (!disabled) {
        btn.addEventListener("click", function(e) {
          e.preventDefault();
          session.runOrca();
        });
        bindOrcaGlow(btn);
      }
      band.appendChild(btn);
      return band;
    }
    function manualNa(session, m, st, complete) {
      return {
        phase: complete ? "solved" : "building",
        steps: st && st.steps || [],
        trace: null,
        stuck: null,
        complete: !!complete,
        code: st && st.code,
        goalType: session.manualGoalType(),
        goalState: complete ? "live" : "approximate",
        sourceGoalType: m.sourceGoalType,
        priorBinders: m.priorBinders,
        declName: m.declName,
        declKw: m.declKw || "",
        theoremSnapshot: m.theoremSnapshot || null,
        manual: true
      };
    }
    function startManual(code, seed) {
      var ed = E3();
      var client = globalThis.BelugaClient;
      var prep = this.prep;
      var self = this;
      if (!ed || !client || !prep || typeof ed.manualState !== "function") {
        toast2("Manual Harpoon is unavailable.", "error");
        return Promise.resolve(false);
      }
      var declText = prep.assembledCode.slice(prep.assembledDeclFrom, prep.assembledDeclTo);
      var thm = ed.theoremUnderProof(declText);
      if (!thm) {
        toast2("Harpoon could not read this theorem.", "error");
        return Promise.resolve(false);
      }
      this.thm = thm;
      this.nativeAuto = null;
      var proveCode = code || prep.proveCode || prep.assembledCode;
      var sourceGoalType = thm.compType && thm.compType.raw || "";
      this.manual = {
        phase: "loading",
        state: null,
        declName: thm.name || prep.name || "",
        declKw: declKwOf2(prep),
        sourceGoalType,
        priorBinders: [],
        busy: false,
        error: null,
        commit: this.commitState || null
      };
      this.captureAnchor(this.view, prep);
      this.bindProbe();
      this.render();
      var ready = client.beginProverSession ? client.beginProverSession() : Promise.resolve();
      return ready.then(function() {
        return client.loadProverChecker ? client.loadProverChecker(proveCode) : null;
      }).then(function() {
        return client.checkResultForProver ? client.checkResultForProver(proveCode) : client.checkResult(proveCode);
      }).then(function(res) {
        if (!self.manual) return false;
        if (!res || !res.ok) {
          self.manual.phase = "error";
          self.manual.error = "The file has errors. Fix them before proving.";
          self.render();
          return false;
        }
        self.manual.state = ed.manualState(proveCode, thm, res.output || "");
        if (seed) {
          self.manual.state.steps = (seed.steps || []).concat(self.manual.state.steps);
          self.manual.state.stack = seed.stack || [];
        }
        self.manual.phase = "ready";
        self.manual.priorBinders = priorGoalBinders2(self, sourceGoalType, self.manualGoalType());
        self.render();
        self.sweepCandidates();
        return true;
      }).catch(function(err) {
        if (!self.manual) return false;
        self.manual.phase = "error";
        self.manual.error = err && err.message || String(err);
        self.render();
        return false;
      });
    }
    function manualGoalType() {
      var ed = E3();
      var st = this.manual && this.manual.state;
      if (!st || !ed) return this.manual ? this.manual.sourceGoalType : "";
      var hole = ed.focusHole(st);
      return hole && hole.goal || this.manual.sourceGoalType || "";
    }
    var CHECK_TIMEOUT_MS = 45e3;
    function manualOracle() {
      var client = globalThis.BelugaClient;
      return function(code) {
        var p = client.checkResultForProver ? client.checkResultForProver(code) : client.checkResult(code);
        return new Promise(function(resolve, reject) {
          var done = false;
          var timer = setTimeout(function() {
            if (done) return;
            done = true;
            reject(new Error("The checker did not answer within " + Math.round(CHECK_TIMEOUT_MS / 1e3) + "s."));
          }, CHECK_TIMEOUT_MS);
          Promise.resolve(p).then(function(v) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(v);
          }, function(e) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            reject(e);
          });
        });
      };
    }
    function setTacticStatus(session, text, stalled) {
      var host = session && session._tacticStatusEl;
      if (!host) return;
      host.textContent = text || "\u200B";
      host.classList.toggle("is-on", !!text);
      if (stalled) host.setAttribute("data-stalled", "");
      else host.removeAttribute("data-stalled");
    }
    function manualApply(mv, row) {
      var ed = E3();
      var self = this;
      var m = this.manual;
      if (!m || !m.state || m.busy || m.syncing) return Promise.resolve(false);
      if (row && row.classList.contains("is-rejected")) return Promise.resolve(false);
      var na = this.nativeAuto;
      if (na && na.phase === "searching") {
        if (!na.paused) return Promise.resolve(false);
        this._retireOrca = true;
        this.nativeAuto = null;
        this.userCancelled = true;
        if (this.stopReelClock) this.stopReelClock();
      }
      m.busy = true;
      this.cancelSweep();
      markPip(row, "checking");
      if (row) {
        row.classList.add("is-applying");
        if (!row.querySelector(".harpoon-lab-move-track")) {
          row.insertBefore(el4("div", "harpoon-lab-move-track"), row.firstChild);
        }
      }
      if (this._movesEl) this._movesEl.classList.add("is-busy");
      var applyVerb = tacticVerb2(mv.kind) || "move";
      setTacticStatus(self, "checking " + applyVerb);
      var since = Date.now();
      var tick = setInterval(function() {
        var secs = Math.round((Date.now() - since) / 1e3);
        if (secs >= 3) setTacticStatus(self, "checking " + applyVerb + " " + secs + "s");
      }, 1e3);
      var clearApplying = function() {
        clearInterval(tick);
        if (self._movesEl) self._movesEl.classList.remove("is-busy");
        if (!row) return;
        row.classList.remove("is-applying");
        var t = row.querySelector(".harpoon-lab-move-track");
        if (t) t.remove();
      };
      return ed.applyMove(m.state, mv, manualOracle(), this.thm, row && row._verified).then(function(r) {
        m.busy = false;
        if (!r.ok) {
          clearApplying();
          setTacticStatus(self, "not accepted", true);
          markPip(row, "rejected", r.error || "The checker did not accept this move.");
          toast2(firstLineOf(r.error) || "That move did not type-check.", "error");
          return false;
        }
        m.state = r.state;
        setTacticStatus(self, "");
        m.priorBinders = priorGoalBinders2(self, m.sourceGoalType, self.manualGoalType());
        self.render();
        self.sweepCandidates();
        return true;
      }).catch(function(err) {
        m.busy = false;
        clearApplying();
        setTacticStatus(self, "no answer on " + applyVerb, true);
        markPip(row, "rejected", err && err.message || String(err));
        toast2(firstLineOf(err && err.message) || "That move could not be checked.", "error");
        return false;
      });
    }
    function firstLineOf(detail) {
      var t = String(detail || "").replace(/^File\s+"[^"]*",\s*line\s*\d+,\s*column\s*\d+:?\s*/i, "");
      t = t.replace(/^Error:\s*/i, "").split("\n")[0].trim();
      return t.length > 160 ? t.slice(0, 157) + "\u2026" : t;
    }
    function sweepCandidates() {
      var ed = E3();
      var self = this;
      var m = this.manual;
      var token = {};
      this._sweepToken = token;
      if (!m || !m.state || !this._moveRows || !this._moveRows.length) return;
      var persist = globalThis.Persist;
      var on = !persist || typeof persist.readStoredHarpoonVerifyMoves !== "function" ? true : persist.readStoredHarpoonVerifyMoves();
      if (!on) return;
      var rows = this._moveRows.slice(0, 8);
      var i = 0;
      var oracle = manualOracle();
      function sinkRefused() {
        if (self._sweepToken !== token || !self._moveRows) return;
        var list = self._moveRows[0] && self._moveRows[0].parentNode;
        if (!list) return;
        self._moveRows.forEach(function(row) {
          if (row && row.classList && row.classList.contains("is-rejected")) list.appendChild(row);
        });
      }
      function next() {
        if (self._sweepToken !== token) return;
        if (i >= rows.length) {
          sinkRefused();
          setTacticStatus(self, "");
          return;
        }
        if (!m.busy) setTacticStatus(self, "checking " + (i + 1) + "/" + rows.length);
        var row = rows[i];
        i += 1;
        if (!row || !row._mv) {
          next();
          return;
        }
        markPip(row, "checking");
        ed.attemptMove(m.state, row._mv, oracle, self.thm).then(function(r) {
          if (self._sweepToken !== token) return;
          row._verified = r.ok ? r : null;
          markPip(
            row,
            r.ok ? "verified" : "rejected",
            r.ok ? "The checker accepts this move" : r.error || "did not certify"
          );
          next();
        }).catch(function() {
          if (self._sweepToken !== token) return;
          markPip(row, null);
          next();
        });
      }
      next();
    }
    function cancelSweep() {
      this._sweepToken = null;
    }
    function manualStepBack() {
      var ed = E3();
      var m = this.manual;
      if (!m || !m.state || !ed.manualCanUndo(m.state)) return;
      this.cancelSweep();
      m.state = ed.manualUndo(m.state);
      m.lastError = null;
      this.render();
      this.sweepCandidates();
    }
    function manualStepForward() {
      var ed = E3();
      var m = this.manual;
      if (!m || !m.state || !ed.manualCanRedo(m.state)) return;
      this.cancelSweep();
      m.state = ed.manualRedo(m.state);
      this.render();
      this.sweepCandidates();
    }
    function manualFocus(idx) {
      var ed = E3();
      var m = this.manual;
      if (!m || !m.state) return;
      this.cancelSweep();
      m.state = ed.focusOn(m.state, idx);
      this.render();
      this.sweepCandidates();
    }
    function orcaStack(self, before) {
      var prior = before && before.stack || [];
      if (!before || self._orcaAnchored) return prior;
      self._orcaAnchored = true;
      return prior.concat([{
        code: before.code,
        holes: before.holes,
        focusIdx: before.focusIdx,
        steps: before.steps
      }]);
    }
    function runOrca() {
      var m = this.manual;
      var self = this;
      if (!m || !m.state) return;
      this.cancelSweep();
      this.manualBefore = m.state;
      this._orcaAnchored = false;
      this.runNativeAuto(m.state.code);
      this.scrollToDerivation();
    }
    function scrollToDerivation() {
      var self = this;
      globalThis.requestAnimationFrame(function() {
        globalThis.requestAnimationFrame(function() {
          var target = self._derivEl;
          if (!target || !target.scrollIntoView) return;
          var reduce = globalThis.matchMedia && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
          try {
            target.scrollIntoView({
              behavior: reduce ? "auto" : "smooth",
              block: "start",
              inline: "nearest"
            });
          } catch (e) {
            target.scrollIntoView(false);
          }
        });
      });
    }
    function toggleOrcaPause() {
      var na = this.nativeAuto;
      var m = this.manual;
      if (!m) return;
      if (!na || na.phase !== "searching") {
        if (m.state) this.runOrca();
        return;
      }
      var self = this;
      na.paused = !na.paused;
      if (na.paused) {
        setNativeSearchLabel2(na, "Paused");
        m.syncing = true;
        m.syncFailed = false;
        this.render();
        this.syncManualToOrca().then(function(ok) {
          m.syncing = false;
          m.syncFailed = !ok;
          if (!self.manual || !self.nativeAuto || !self.nativeAuto.paused) return;
          self.render();
          if (ok) self.sweepCandidates();
        });
      } else {
        m.syncing = false;
        m.syncFailed = false;
        setNativeSearchLabel2(na, "Resuming\u2026");
        this.render();
      }
    }
    function absorbOrcaResult(r) {
      var ed = E3();
      var self = this;
      var m = this.manual;
      if (!m || !ed) return Promise.resolve(false);
      var before = this.manualBefore || m.state;
      var na = this.nativeAuto;
      if (this.stopReelClock) this.stopReelClock();
      if (r && r.complete && r.code) {
        m.state = ed.absorbAuto(
          before,
          { complete: true, code: r.code, steps: r.steps || [], trace: r.trace || null },
          this.thm
        );
        this.manualBefore = null;
        m.priorBinders = priorGoalBinders2(this, m.sourceGoalType, this.manualGoalType());
        this.render();
        return Promise.resolve(true);
      }
      var code = r && r.code || na && na.liveCode || before && before.code;
      if (!code || before && code === before.code) {
        this.manualBefore = null;
        this.render();
        return Promise.resolve(false);
      }
      return manualOracle()(code).then(function(res) {
        if (!self.manual) return false;
        if (res && res.ok) {
          var next = ed.manualState(code, self.thm, res.output || "");
          next.steps = (before && before.steps || []).concat(r && r.steps || []);
          next.stack = orcaStack(self, before);
          self.manual.state = next;
          self.manual.priorBinders = priorGoalBinders2(
            self,
            self.manual.sourceGoalType,
            self.manualGoalType()
          );
        }
        self.manualBefore = null;
        self.render();
        self.sweepCandidates();
        return true;
      }).catch(function() {
        self.manualBefore = null;
        self.render();
        return false;
      });
    }
    function syncManualToOrca() {
      var self = this;
      var ed = E3();
      var na = this.nativeAuto;
      var m = this.manual;
      if (!na || !m || !m.state) return Promise.resolve(false);
      var code = na.liveCode || na.code;
      if (!code || code === m.state.code) return Promise.resolve(true);
      return manualOracle()(code).then(function(res) {
        if (!res || !res.ok || !self.manual) return false;
        var next = ed.manualState(code, self.thm, res.output || "");
        var before = self.manualBefore;
        next.steps = (before && before.steps || []).concat(ed.pairTrace ? ed.pairTrace(na.steps || [], na.trace) : na.steps || []);
        next.stack = orcaStack(self, before);
        self.manual.state = next;
        self.manual.priorBinders = priorGoalBinders2(
          self,
          m.sourceGoalType,
          self.manualGoalType()
        );
        return true;
      }).catch(function() {
        return false;
      });
    }
    function backToManual() {
      var ed = E3();
      var na = this.nativeAuto;
      var before = this.manualBefore || null;
      var priorSteps = before && before.steps || [];
      var priorStack = before && before.stack || [];
      this.manualBefore = null;
      this.nativeAuto = null;
      if (na && na.complete && na.code && before && ed && typeof ed.absorbAuto === "function") {
        this.manual.state = ed.absorbAuto(before, {
          complete: true,
          code: na.code,
          steps: na.steps || [],
          trace: na.trace || null
        }, this.thm);
        this.render();
        return;
      }
      var resumeCode = na && (na.code || na.liveCode) || before && before.code || null;
      var seedSteps = priorSteps.concat(na && na.steps || []);
      this.startManual(resumeCode, {
        steps: seedSteps,
        stack: orcaStack(this, before)
      });
    }
    function commitManual() {
      var ed = E3();
      var m = this.manual;
      var st = this.getCommitState();
      if (!m || !m.state || st.status === "checking" || st.status === "placed") {
        return Promise.resolve(false);
      }
      var body = solvedBodyOf2(m.state.code, m.declName);
      if (!body) {
        toast2("Harpoon lost the proof body.", "error");
        return Promise.resolve(false);
      }
      this.beginCommitUi("verify");
      return this.verifyAndCommit(body, { skipBeginUi: true });
    }
    function renderManual(parent) {
      var ed = E3();
      var self = this;
      var m = this.manual;
      if (!m) return;
      var st = m.state;
      var complete = st && ed.manualIsComplete(st);
      this._renderSig = manualRenderSig2(this);
      var box = el4("div", "harpoon-lab-manual is-" + m.phase + (complete ? " is-complete" : "") + (this.isFrozenRetrospective() ? " is-frozen" : ""));
      var stage = 0;
      var goalType = this.manualGoalType();
      if (goalType) {
        this._autoGoalWrap = appendAutoGoalHero(
          box,
          goalType,
          m.declName,
          complete ? "live" : "approximate",
          m.priorBinders,
          m.declKw
        );
      }
      if (!this.isFrozenRetrospective()) this.renderCompromiseBanner(box);
      if (m.phase === "loading") {
        if (!goalType) box.appendChild(skelGoalHero(m.declName, m.declKw));
        box.appendChild(skelBar());
        box.appendChild(buildOrca(this, null, true));
        var skelMoves = el4("div", "harpoon-lab-moves");
        skelMoves.appendChild(sectionLabel("Tactics"));
        var skelList = el4("div", "harpoon-lab-move-list");
        for (var k = 0; k < 3; k += 1) skelList.appendChild(skelMoveRow(k));
        skelMoves.appendChild(skelList);
        box.appendChild(skelMoves);
        parent.appendChild(box);
        return;
      }
      if (m.phase === "error") {
        var err = el4("div", "harpoon-lab-auto-stuck harpoon-lab-auto-panel tone-error");
        err.appendChild(el4("span", "harpoon-lab-auto-stuck-label", "Cannot prove"));
        err.appendChild(el4("div", "harpoon-lab-auto-stuck-goal", m.error || ""));
        box.appendChild(err);
        parent.appendChild(box);
        return;
      }
      this._manualNa = manualNa(this, m, st, complete);
      if (complete) {
        var proven = renderManualSolvedSummary2(box);
        if (proven) {
          proven.querySelector(".harpoon-lab-auto-sub").textContent = (st.steps.length === 1 ? "1 step" : st.steps.length + " steps") + " \xB7 ready to place in the file";
          stageNode2(proven, stage);
          stage += 1;
        }
        var commit = this.getCommitState();
        if (commit.status === "failed" || commit.status === "placed" && !commit.dismissed) {
          stageNode2(renderCommitOutcome2(
            box,
            commit,
            m.declName,
            commit.canRetry ? function() {
              self.resetCommitForRetry();
            } : null
          ), stage);
          stage += 1;
        } else if (commit.status !== "placed") {
          var blocked = this.compromise && this.compromise.level === "block";
          var place2 = buildPlaceStrip2(this, {
            blocked,
            extraCls: " harpoon-lab-auto-place is-instant",
            title: "Place the proof",
            onClick: function() {
              self.commitManual();
            }
          });
          stageNode2(place2, stage);
          stage += 1;
          box.appendChild(place2);
          if (commit.status === "checking") this.updateCommitPlace();
        }
        var open = st ? st.holes.length : 0;
        var bar = el4("div", "harpoon-lab-bar");
        var status = el4("div", "harpoon-lab-status");
        var dot = el4("span", "harpoon-lab-status-dot" + (complete ? " is-done" : ""));
        setTip2(dot, complete ? "Proven" : "Unproven");
        dot.setAttribute("aria-label", complete ? "Proven" : "Unproven");
        status.appendChild(dot);
        status.appendChild(el4(
          "span",
          "harpoon-lab-status-text",
          complete ? "Proven" : open === 1 ? "1 goal" : open + " goals"
        ));
        bar.appendChild(status);
        var actions = el4("div", "harpoon-lab-bar-actions");
        var undoBtn = iconBtn2(
          "icon-btn",
          ICON_UNDO2,
          "Undo the last move",
          "Undo",
          function() {
            self.manualStepBack();
          }
        );
        undoBtn.disabled = !(st && ed.manualCanUndo(st));
        var redoBtn = iconBtn2(
          "icon-btn",
          ICON_REDO2,
          "Redo",
          "Redo",
          function() {
            self.manualStepForward();
          }
        );
        redoBtn.disabled = !(st && ed.manualCanRedo(st));
        actions.appendChild(undoBtn);
        actions.appendChild(redoBtn);
        bar.appendChild(actions);
        box.appendChild(bar);
        if (st && st.holes.length > 1) {
          var pickBand = el4("div", "harpoon-lab-picker-band");
          var picker = el4("div", "harpoon-lab-picker");
          picker.setAttribute("role", "tablist");
          picker.setAttribute("aria-label", "Subgoals");
          st.holes.forEach(function(h, i) {
            var tab = el4("button", "harpoon-lab-picker-tab" + (i === st.focusIdx ? " is-active" : ""));
            tab.type = "button";
            tab.setAttribute("role", "tab");
            tab.setAttribute("aria-selected", i === st.focusIdx ? "true" : "false");
            tab.textContent = String(i + 1);
            setTip2(tab, "Subgoal " + (i + 1) + (h.goal ? " \xB7 " + displayGoal(h.goal) : ""));
            tab.addEventListener("click", function(e) {
              e.preventDefault();
              self.manualFocus(i);
            });
            picker.appendChild(tab);
          });
          pickBand.appendChild(picker);
          box.appendChild(pickBand);
        }
        var naRun = this.nativeAuto;
        var liveHole = naRun && naRun.phase === "searching" && naRun.liveHoles && naRun.liveHoles.length ? naRun.liveHoles[0] : null;
        var hole = liveHole || (st ? ed.focusHole(st) : null);
        if (hole && (hole.meta && hole.meta.length || hole.ctx && hole.ctx.length)) {
          var ctxWrap = el4("div", "harpoon-lab-context");
          this.renderCtx(ctxWrap, "meta", hole.meta);
          this.renderCtx(ctxWrap, "ctx", hole.ctx);
          box.appendChild(ctxWrap);
          this._ctxWrap = ctxWrap;
          this._ctxKey = JSON.stringify([hole.meta || [], hole.ctx || []]);
        }
        var solved = solvedBodyOf2(st.code, m.declName);
        if (solved) {
          stageNode2(appendAutoSolution(box, solved), stage);
          stage += 1;
        }
      } else {
        var open = st ? st.holes.length : 0;
        var bar = el4("div", "harpoon-lab-bar");
        var status = el4("div", "harpoon-lab-status");
        var dot = el4("span", "harpoon-lab-status-dot" + (complete ? " is-done" : ""));
        setTip2(dot, complete ? "Proven" : "Unproven");
        dot.setAttribute("aria-label", complete ? "Proven" : "Unproven");
        status.appendChild(dot);
        status.appendChild(el4(
          "span",
          "harpoon-lab-status-text",
          complete ? "Proven" : open === 1 ? "1 goal" : open + " goals"
        ));
        bar.appendChild(status);
        var actions = el4("div", "harpoon-lab-bar-actions");
        var undoBtn = iconBtn2(
          "icon-btn",
          ICON_UNDO2,
          "Undo the last move",
          "Undo",
          function() {
            self.manualStepBack();
          }
        );
        undoBtn.disabled = !(st && ed.manualCanUndo(st));
        var redoBtn = iconBtn2(
          "icon-btn",
          ICON_REDO2,
          "Redo",
          "Redo",
          function() {
            self.manualStepForward();
          }
        );
        redoBtn.disabled = !(st && ed.manualCanRedo(st));
        actions.appendChild(undoBtn);
        actions.appendChild(redoBtn);
        bar.appendChild(actions);
        box.appendChild(bar);
        if (st && st.holes.length > 1) {
          var pickBand = el4("div", "harpoon-lab-picker-band");
          var picker = el4("div", "harpoon-lab-picker");
          picker.setAttribute("role", "tablist");
          picker.setAttribute("aria-label", "Subgoals");
          st.holes.forEach(function(h, i) {
            var tab = el4("button", "harpoon-lab-picker-tab" + (i === st.focusIdx ? " is-active" : ""));
            tab.type = "button";
            tab.setAttribute("role", "tab");
            tab.setAttribute("aria-selected", i === st.focusIdx ? "true" : "false");
            tab.textContent = String(i + 1);
            setTip2(tab, "Subgoal " + (i + 1) + (h.goal ? " \xB7 " + displayGoal(h.goal) : ""));
            tab.addEventListener("click", function(e) {
              e.preventDefault();
              self.manualFocus(i);
            });
            picker.appendChild(tab);
          });
          pickBand.appendChild(picker);
          box.appendChild(pickBand);
        }
        var naRun = this.nativeAuto;
        var liveHole = naRun && naRun.phase === "searching" && naRun.liveHoles && naRun.liveHoles.length ? naRun.liveHoles[0] : null;
        var hole = liveHole || (st ? ed.focusHole(st) : null);
        if (hole && (hole.meta && hole.meta.length || hole.ctx && hole.ctx.length)) {
          var ctxWrap = el4("div", "harpoon-lab-context");
          this.renderCtx(ctxWrap, "meta", hole.meta);
          this.renderCtx(ctxWrap, "ctx", hole.ctx);
          box.appendChild(ctxWrap);
          this._ctxWrap = ctxWrap;
          this._ctxKey = JSON.stringify([hole.meta || [], hole.ctx || []]);
        }
        var na = this.nativeAuto;
        var running = !!(na && na.phase === "searching");
        var searching = running && !na.paused;
        if (running) box.appendChild(buildOrcaRunning(this, na));
        else box.appendChild(buildOrca(this, st, false));
        if (na && na.phase === "stuck" && na.stuck && na.stuck.goal) {
          var stuckCard = this.renderStuckCard(na);
          stageNode2(stuckCard, stage);
          stage += 1;
          box.appendChild(stuckCard);
        }
        var movesWrap = el4("div", "harpoon-lab-moves" + (searching ? " is-locked" : ""));
        this._movesEl = movesWrap;
        this._moveRows = [];
        var tacticsLabel = sectionLabel("Tactics");
        if (searching) {
          tacticsLabel.appendChild(
            el4("span", "harpoon-lab-moves-lock", "Pause Orca to use tactics")
          );
        }
        var tacStatus = el4("span", "harpoon-lab-moves-status");
        tacticsLabel.appendChild(tacStatus);
        this._tacticStatusEl = tacStatus;
        movesWrap.appendChild(tacticsLabel);
        var moves = [];
        try {
          moves = ed.movesAt(st, this.thm) || [];
        } catch (e) {
          moves = [];
        }
        var list = el4("div", "harpoon-lab-move-list");
        if (m.busy || m.syncing) {
          for (var sk = 0; sk < Math.min(3, Math.max(1, moves.length)); sk += 1) {
            list.appendChild(skelMoveRow(sk));
          }
          movesWrap.appendChild(list);
        } else if (m.syncFailed) {
          var lost = el4("div", "harpoon-lab-moves-empty");
          lost.appendChild(el4(
            "span",
            "harpoon-lab-moves-empty-title",
            "Could not read the paused proof"
          ));
          lost.appendChild(el4(
            "span",
            "harpoon-lab-moves-empty-sub",
            "Resume Orca, or undo the last step and try again."
          ));
          movesWrap.appendChild(lost);
        } else if (!moves.length) {
          var none = el4("div", "harpoon-lab-moves-empty");
          none.appendChild(el4("span", "harpoon-lab-moves-empty-title", "Nothing applies here"));
          none.appendChild(el4(
            "span",
            "harpoon-lab-moves-empty-sub",
            "BelJar has no move for this goal. Undo the last step, pick another subgoal, or let Orca search."
          ));
          movesWrap.appendChild(none);
        } else {
          moves.forEach(function(mv, i) {
            var row = buildMoveRow(self, mv, hole, i);
            self._moveRows.push(row);
            list.appendChild(row);
          });
          movesWrap.appendChild(list);
        }
        stageNode2(movesWrap, stage);
        stage += 1;
        box.appendChild(movesWrap);
      }
      var naNow = this.nativeAuto;
      if (naNow && naNow.phase === "searching") {
        var live = el4("div", "harpoon-reel harpoon-lab-manual-trail");
        var liveHead = el4("div", "harpoon-deriv-header");
        liveHead.appendChild(el4("span", "harpoon-lab-section-label is-steps", "Derivation"));
        liveHead.appendChild(iconBtn2(
          "icon-btn harpoon-deriv-popout",
          ICON_POPOUT2,
          "Open the proof tree explorer (grows live)",
          "Pop out tree",
          function() {
            self.openTreeExplorer();
          }
        ));
        live.appendChild(liveHead);
        var record = el4("ol", "harpoon-lab-auto-trail harpoon-reel-record is-live");
        record._lastBranch = null;
        record._branchHost = null;
        live.appendChild(record);
        box.appendChild(live);
        this._reelRecord = record;
        this._reelRecordCount = 0;
        this._workingRow = null;
        this._workingStrip = null;
        this._workingChips = [];
        this._derivEl = live;
        var prior = this.manualBefore && this.manualBefore.steps || [];
        for (var pi = 0; pi < prior.length; pi += 1) {
          appendCommittedStepRow(record, prior[pi], pi);
        }
        var already = naNow.steps || [];
        for (var si = 0; si < already.length; si += 1) {
          appendCommittedStepRow(record, already[si], prior.length + si);
        }
        this._reelRecordCount = already.length;
        this.syncReelStatus();
        this.startReelClock();
      } else if (st && st.steps.length) {
        var deriv = this.renderDerivationSection(box, this._manualNa);
        stageNode2(deriv, stage);
        stage += 1;
        box.appendChild(deriv);
        this._derivEl = deriv;
      }
      parent.appendChild(box);
    }
    return {
      startManual,
      renderManual,
      manualGoalType,
      manualApply,
      manualStepBack,
      manualStepForward,
      manualFocus,
      sweepCandidates,
      cancelSweep,
      runOrca,
      toggleOrcaPause,
      absorbOrcaResult,
      syncManualToOrca,
      scrollToDerivation,
      backToManual,
      commitManual
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
  var ICON_ORCA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.4 15.4Q9.4 8.2 16.2 4.4Q13.6 10.4 14.2 15.4Z" fill="currentColor" stroke="none"/><path d="M3 18.8q2.9-3 5.8 0t5.8 0t5.8 0"/></svg>';
  var ICON_CHEVRON_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  var ICON_DECLINE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7 17 17"/><path d="M17 7 7 17"/></svg>';
  var ICON_TAKEOVER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3.4 18.6 10.6 12.3 12.3 9.6 18.6Z"/></svg>';
  var TACTIC_VERB = {
    intro: "intros",
    split: "split",
    invert: "invert",
    impossible: "impossible",
    fill: "solve",
    recurse: "by",
    lemma: "by",
    synth: "chain"
  };
  function tacticVerb(kind) {
    return TACTIC_VERB[kind] || kind || "move";
  }
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
    var loc = ed.locateMember ? ed.locateMember(docText, anchor.declName) : null;
    var from;
    var to;
    if (loc) {
      from = loc.from;
      to = loc.to;
    } else {
      var re = new RegExp(
        "(^|[\\n\\r])[ \\t]*(?:and\\s+(?:rec\\s+)?|(?:rec|proof)\\s+)" + String(anchor.declName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:"
      );
      var m = re.exec(docText);
      if (!m) return null;
      from = m.index + m[1].length;
      var semi = docText.indexOf(";", from);
      to = semi < 0 ? docText.length : semi + 1;
    }
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
  function declKwOf(prep) {
    var key = prep && prep.declKey || "";
    var i = key.indexOf(":");
    return i > 0 ? key.slice(0, i) : "";
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
  var liveSessions = [];
  function activeSession() {
    var active = global8.document ? global8.document.activeElement : null;
    var newest = null;
    for (var i = liveSessions.length - 1; i >= 0; i -= 1) {
      var s = liveSessions[i];
      if (!s || !s.bodyEl) continue;
      if (active && s.bodyEl.contains(active)) return s;
      if (!newest) newest = s;
    }
    return newest;
  }
  function trackSession(session) {
    if (liveSessions.indexOf(session) < 0) liveSessions.push(session);
  }
  function untrackSession(session) {
    var at = liveSessions.indexOf(session);
    if (at !== -1) liveSessions.splice(at, 1);
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
    trackSession(this);
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
      var N = global8.Notifications;
      if (N && typeof N.emit === "function") {
        N.emit({
          kind: "error",
          category: "ops",
          title: st.detail,
          detail: raw,
          source: "harpoon.commit",
          dedupeKey: "harpoon.commit.checker"
        });
      }
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
  function pushOrca(session, label) {
    if (typeof window === "undefined" || !window.StatusStrip) return;
    var na = session && session.nativeAuto;
    if (!na || na.phase !== "searching") {
      window.StatusStrip.setOrca(false);
      return;
    }
    window.StatusStrip.setOrca(true, na.paused ? "paused" : label || "");
  }
  Session.prototype.stopNativeAuto = function() {
    this.userCancelled = true;
    if (this.nativeAuto && this.nativeAuto.phase === "searching") {
      setNativeSearchLabel(this.nativeAuto, "Stopping\u2026");
      this.updateNativeAutoSearch();
      pushOrca(this, "stopping");
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
    parent.appendChild(banner);
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
  Session.prototype.runNativeAuto = function(codeOverride) {
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
    var proveCode = codeOverride || prep.proveCode || prep.assembledCode;
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
      declKw: declKwOf(this.prep),
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
      pushOrca(self, String(label || "").replace(/[….]+$/, ""));
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
          if (info.code) na.liveCode = info.code;
          if (info.holes) {
            na.liveHoles = info.holes;
            self.syncLiveContext();
          }
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
      if (self._retireOrca) {
        self._retireOrca = false;
        self.userCancelled = false;
        self.render();
        return false;
      }
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
      if (self.manual) self.absorbOrcaResult(r);
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
      pushOrca(self);
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
    untrackSession(this);
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
  function manualRenderSig(session) {
    var na = session.nativeAuto;
    var m = session.manual;
    if (!m) return "no-manual";
    return [
      na ? na.phase : "idle",
      na && na.paused ? "paused" : "live",
      m.phase,
      m.syncing ? "syncing" : "",
      m.syncFailed ? "syncfail" : "",
      m.busy ? "busy" : ""
    ].join("|");
  }
  Session.prototype.derivationNa = function() {
    return this.nativeAuto || this._manualNa || null;
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
  var manualApi = null;
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
      tacticVerb,
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
      appendDeclLabel: displayApi.appendDeclLabel,
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
      ICON_STOP,
      ICON_CHEVRON_LEFT,
      ICON_TAKEOVER
    });
    Session.prototype.refreshNativeAutoGoalDisplay = reelApi.refreshNativeAutoGoalDisplay;
    Session.prototype.clearNativeAutoShell = reelApi.clearNativeAutoShell;
    Session.prototype.syncAutoPauseBtn = reelApi.syncAutoPauseBtn;
    Session.prototype.updateNativeAutoSearch = reelApi.updateNativeAutoSearch;
    Session.prototype.syncLiveContext = reelApi.syncLiveContext;
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
    manualApi = createManual({
      el: function() {
        return el2.apply(null, arguments);
      },
      iconBtn: function() {
        return iconBtn.apply(null, arguments);
      },
      setTip: function() {
        return setTip.apply(null, arguments);
      },
      toast: function() {
        return toast.apply(null, arguments);
      },
      E,
      renderSource: displayApi.renderSource,
      appendAutoGoalHero: displayApi.appendAutoGoalHero,
      appendDeclLabel: displayApi.appendDeclLabel,
      priorGoalBinders: displayApi.priorGoalBinders,
      buildPlaceStrip: displayApi.buildPlaceStrip,
      renderCommitOutcome: displayApi.renderCommitOutcome,
      stageNode: displayApi.stageNode,
      solvedBodyOf: displayApi.solvedBodyOf,
      appendCommittedStepRow: function() {
        return reelApi.appendCommittedStepRow.apply(reelApi, arguments);
      },
      appendAutoSolution: displayApi.appendAutoSolution,
      renderManualSolvedSummary: displayApi.renderManualSolvedSummary,
      tacticVerb,
      setNativeSearchLabel: displayApi.setNativeSearchLabel,
      nativeAutoSearchLabel: displayApi.nativeAutoSearchLabel,
      ICON_UNDO,
      ICON_REDO,
      ICON_ORCA,
      ICON_CHEVRON_DOWN,
      ICON_DECLINE,
      ICON_CHECK,
      ICON_PLAY,
      ICON_PAUSE,
      ICON_POPOUT,
      manualRenderSig
    });
    Session.prototype.startManual = manualApi.startManual;
    Session.prototype.renderManual = manualApi.renderManual;
    Session.prototype.manualGoalType = manualApi.manualGoalType;
    Session.prototype.manualApply = manualApi.manualApply;
    Session.prototype.manualStepBack = manualApi.manualStepBack;
    Session.prototype.manualStepForward = manualApi.manualStepForward;
    Session.prototype.manualFocus = manualApi.manualFocus;
    Session.prototype.sweepCandidates = manualApi.sweepCandidates;
    Session.prototype.cancelSweep = manualApi.cancelSweep;
    Session.prototype.runOrca = manualApi.runOrca;
    Session.prototype.toggleOrcaPause = manualApi.toggleOrcaPause;
    Session.prototype.absorbOrcaResult = manualApi.absorbOrcaResult;
    Session.prototype.syncManualToOrca = manualApi.syncManualToOrca;
    Session.prototype.scrollToDerivation = manualApi.scrollToDerivation;
    Session.prototype.backToManual = manualApi.backToManual;
    Session.prototype.commitManual = manualApi.commitManual;
  }
  __initHarpoonLabPeels();
  Session.prototype.render = function() {
    if (!this.bodyEl) return;
    var self = this;
    var body = this.bodyEl;
    if (this.nativeAuto && this.nativeAuto.phase === "searching" && this._autoSearchBox && body.contains(this._autoSearchBox) && this._renderSig === manualRenderSig(this)) {
      this.updateNativeAutoSearch();
      return;
    }
    var scroller = body;
    while (scroller && scroller !== document.body) {
      var oy = "";
      try {
        oy = globalThis.getComputedStyle(scroller).overflowY;
      } catch (e) {
        oy = "";
      }
      if ((oy === "auto" || oy === "scroll") && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentNode;
    }
    var keepTop = scroller && scroller !== document.body ? scroller.scrollTop : 0;
    this.clearNativeAutoShell();
    body.textContent = "";
    body.classList.remove("is-starting");
    if (keepTop > 0) {
      Promise.resolve().then(function() {
        if (scroller && Math.abs(scroller.scrollTop - keepTop) > 1) scroller.scrollTop = keepTop;
      });
    }
    var m = this.model;
    if (this.manual) {
      this.renderManual(body);
      return;
    }
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
    var loc = ed.locateMember ? ed.locateMember(assembled, decl.name, ctx.fileStart || 0) : null;
    var declStart;
    var declEnd;
    var blockStart;
    var blockEnd;
    if (loc) {
      declStart = loc.from;
      declEnd = loc.to;
      blockStart = loc.blockFrom != null ? loc.blockFrom : loc.from;
      blockEnd = loc.blockTo != null ? loc.blockTo : loc.to;
    } else {
      var re = new RegExp(
        "(^|\\n)\\s*(?:and\\s+(?:rec\\s+)?|(?:rec|proof)\\s+)" + decl.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:"
      );
      var match = re.exec(assembled);
      if (!match) {
        toast("Harpoon: declaration not found in the checkable program.", "error");
        return null;
      }
      declStart = match.index + match[1].length;
      var semi = assembled.indexOf(";", declStart);
      declEnd = semi === -1 ? assembled.length : semi + 1;
      blockStart = declStart;
      blockEnd = declEnd;
    }
    var built = ed.buildProofProgram(assembled, declStart, declEnd);
    if (!built) {
      toast("Harpoon: couldn\u2019t build the proof program.", "error");
      return null;
    }
    var proveCode = ed.proveOrchestrationCode ? ed.proveOrchestrationCode(assembled, decl.name, blockStart, blockEnd, ctx.fileStart) : assembled;
    return {
      built,
      span,
      name: decl.name,
      declKey: decl.kw + ":" + decl.name,
      hit,
      assembledCode: assembled,
      assembledDeclFrom: declStart,
      assembledDeclTo: declEnd,
      assembledBlockFrom: blockStart,
      assembledBlockTo: blockEnd,
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
    var span = api.getMemberSpan ? api.getMemberSpan(hit.from) : api.getDeclSpan ? api.getDeclSpan(hit.from) : null;
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
    var span = ed.memberSpanInText ? ed.memberSpanInText(ctx.fileText, hit.from) : ed.declSpanInText(ctx.fileText, hit.from);
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
    var api = global8.CurrentEditor;
    for (var j = 0; j < hits.length; j++) {
      var hit = hits[j];
      var span = null;
      if (api && api.getMemberSpan) span = api.getMemberSpan(hit.from);
      else if (api && api.getDeclSpan) span = api.getDeclSpan(hit.from);
      else if (ed && ed.getMemberSpan) span = ed.getMemberSpan(hit.from);
      else if (ed && ed.getDeclSpan) span = ed.getDeclSpan(hit.from);
      if (!span) continue;
      var decl = ed.parseDecl(view.state.doc.sliceString(span.from, span.to));
      if (decl && decl.kw + ":" + decl.name === anchor.declKey) return hit;
    }
    return null;
  }
  function openingMode() {
    var persist = global8.Persist;
    if (persist && typeof persist.readStoredHarpoonMode === "function") {
      return persist.readStoredHarpoonMode() === "orca" ? "orca" : "manual";
    }
    return "manual";
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
    var startOrca = openingMode() === "orca";
    session.startManual().then(function(ok) {
      if (ok && startOrca) session.runOrca();
    });
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
    // Test seam: probes mount a Session over a fabricated state to drive the
    // SHIPPED render/click paths rather than a re-implementation of them.
    _Session: Session,
    openFromHole,
    activeSession,
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
        var suiteLabel = cfgBaseLabel(cfgPath);
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
            hit: fileHits[oi]
          });
        }
      }
      if (!dirEntries.length) continue;
      totalCount += dirEntries.length;
      sections.push({
        id: "dir:" + dir,
        label: dir || "/",
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
  function setSuiteTip(host, label) {
    var name = label || "(none)";
    var tips = global10.Tooltips;
    if (tips && typeof tips.setRich === "function") {
      tips.setRich(host, function() {
        var row = el3("span", "harpoon-tip-suite");
        row.appendChild(el3("span", "harpoon-tip-suite-key", "Suite:"));
        row.appendChild(el3("span", "harpoon-tip-suite-name", name));
        return row;
      }, "Suite: " + name);
      return;
    }
    if (tips && typeof tips.set === "function") tips.set(host, "Suite: " + name);
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
    var api = global10.CurrentEditor;
    if (!hit) return null;
    var span = null;
    if (api && api.getMemberSpan) span = api.getMemberSpan(hit.from);
    else if (api && api.getDeclSpan) span = api.getDeclSpan(hit.from);
    else if (ed && ed.getMemberSpan) span = ed.getMemberSpan(hit.from);
    else if (ed && ed.getDeclSpan) span = ed.getDeclSpan(hit.from);
    if (!span) return null;
    var decl = ed && ed.parseDecl ? ed.parseDecl(view.state.doc.sliceString(span.from, span.to)) : null;
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
  function mirrorTierClass(win) {
    var track = trackOf(win);
    win.classList.toggle(
      "harpoon-hole-goal--tiered",
      !!track && track.classList.contains("harpoon-hole-goal--tiered")
    );
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
  var DECL_LINE = /^[ \t]*(rec|proof|and)[ \t]+([^\s:(){}\[\],]+)[ \t]*:/;
  var declTextCache = /* @__PURE__ */ Object.create(null);
  function fileTextFor(fileId) {
    if (fileId in declTextCache) return declTextCache[fileId];
    var P2 = typeof global10.Persist !== "undefined" ? global10.Persist : null;
    var t = null;
    try {
      t = P2 && typeof P2.getFileText === "function" ? P2.getFileText(fileId) : null;
    } catch (_) {
      t = null;
    }
    declTextCache[fileId] = t == null ? null : String(t);
    return declTextCache[fileId];
  }
  function declForEntry(entry) {
    var line = entry && entry.hit && entry.hit.hole && entry.hit.hole.line;
    if (!line) return null;
    var text = fileTextFor(entry.fileId);
    if (!text) return null;
    var lines = text.split(/\r?\n/);
    for (var i = Math.min(line, lines.length) - 1; i >= 0; i -= 1) {
      var m = DECL_LINE.exec(lines[i]);
      if (m) return { kw: m[1], name: m[2] };
    }
    return null;
  }
  function maskOf(win) {
    return win && win.firstElementChild;
  }
  function trackOf(win) {
    var mask = maskOf(win);
    return mask ? mask.firstElementChild : null;
  }
  function readOver(win) {
    var mask = maskOf(win);
    var track = trackOf(win);
    if (!mask || !track || !mask.clientWidth) return -1;
    return Math.max(0, Math.round(track.scrollWidth - mask.clientWidth));
  }
  function applyOver(win, over) {
    if (over < 0) return;
    win.dataset.measured = "1";
    if (over <= 1) {
      if (!win.classList.contains("is-clipped")) return;
      win.classList.remove("is-clipped");
      win.style.removeProperty("--slide");
      win.style.removeProperty("--slide-ms");
      return;
    }
    var slide = "-" + over + "px";
    var ms = Math.min(2800, Math.max(500, Math.round(over * 6))) + "ms";
    if (win.style.getPropertyValue("--slide").trim() === slide && win.style.getPropertyValue("--slide-ms").trim() === ms && win.classList.contains("is-clipped")) return;
    win.classList.add("is-clipped");
    win.style.setProperty("--slide", slide);
    win.style.setProperty("--slide-ms", ms);
  }
  function markClipped(root) {
    if (!root) return;
    var wins = root.querySelectorAll(".harpoon-hole-goal");
    var over = [];
    for (var i = 0; i < wins.length; i++) over.push(readOver(wins[i]));
    for (var j = 0; j < wins.length; j++) applyOver(wins[j], over[j]);
  }
  var clipObs = null;
  var clipRoot = null;
  function scheduleMarkClipped(root) {
    clipRoot = root;
    markClipped(root);
    requestAnimationFrame(function() {
      if (clipRoot !== root || !root.isConnected) return;
      markClipped(root);
      requestAnimationFrame(function() {
        if (clipRoot === root && root.isConnected) markClipped(root);
      });
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function() {
        if (clipRoot === root && root.isConnected) markClipped(root);
      });
    }
    if (typeof ResizeObserver === "undefined") return;
    if (clipObs) clipObs.disconnect();
    clipObs = new ResizeObserver(function() {
      markClipped(root);
    });
    clipObs.observe(root);
    var tracks = root.querySelectorAll(".harpoon-hole-goal-track");
    for (var i = 0; i < tracks.length; i++) clipObs.observe(tracks[i]);
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
    var decl = declForEntry(entry);
    var declEl = el3("span", "harpoon-hole-decl");
    if (decl) {
      declEl.appendChild(el3("span", "harpoon-hole-decl-kw bel-hl-keyword", decl.kw));
      declEl.appendChild(el3("span", "harpoon-hole-decl-name bel-hl-var-def", decl.name));
    } else {
      declEl.classList.add("is-unknown");
      declEl.appendChild(el3("span", "harpoon-hole-decl-name", "top level"));
    }
    head.appendChild(declEl);
    var loc = el3("span", "harpoon-hole-loc");
    var pathLabel = entry.fileBaseName || entry.filePath;
    if (pathLabel) loc.appendChild(el3("span", "harpoon-hole-path", pathLabel));
    loc.appendChild(el3("span", "harpoon-hole-ln", String(hit.hole.line)));
    setSuiteTip(loc, entry.suiteLabel);
    head.appendChild(loc);
    row.appendChild(head);
    row.appendChild(el3("div", "harpoon-panel-hole-rule"));
    var goal = el3("div", "harpoon-hole-goal");
    var goalMask = el3("div", "harpoon-hole-goal-mask");
    var goalInner = el3("div", "harpoon-hole-goal-track");
    goalMask.appendChild(goalInner);
    goal.appendChild(goalMask);
    if (showType) {
      row.dataset.goalState = outOfScope ? goalState === "approximate" ? "approximate" : "cached" : "ready";
      var edLive = E2();
      if (edLive && typeof edLive.mountHoleGoalTier === "function") {
        edLive.mountHoleGoalTier(goalInner, {
          surface: "harpoon-card",
          goalState: "live",
          goal: goalType
        });
      } else {
        renderType2(goalInner, goalType);
      }
    } else if (tiered) {
      row.classList.add("is-pending");
      row.dataset.goalState = goalState;
      mountTieredGoal(goalInner, goalState, goalType);
    } else if (outOfScope) {
      row.classList.add("is-unfocused");
      row.dataset.goalState = "inactive";
      goalInner.appendChild(el3("span", "harpoon-hole-unfocused", "Not computable outside scope"));
    } else {
      row.classList.add("is-pending");
      row.dataset.goalState = "pending";
      mountTieredGoal(goalInner, "pending", null);
    }
    mirrorTierClass(goal);
    row.appendChild(goal);
    row.addEventListener("pointerenter", function() {
      applyOver(goal, readOver(goal));
    });
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
    declTextCache = /* @__PURE__ */ Object.create(null);
    var model = collectProjectSections();
    applyGoalStateToModel(model, view);
    if (opts && opts.certify) maybeCertifyVisibleGoals(model, view);
    var renderKey = modelRenderKey(model);
    if (model.totalCount && renderKey === lastListRenderKey && bodyEl.querySelector(".harpoon-panel-list")) return;
    lastListRenderKey = renderKey;
    if (!model.totalCount) {
      if (clipObs) {
        clipObs.disconnect();
        clipObs = null;
      }
      clipRoot = null;
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
    scheduleMarkClipped(root);
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
    var span = ed.memberSpanInText ? ed.memberSpanInText(text, from) : ed.declSpanInText(text, from);
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
