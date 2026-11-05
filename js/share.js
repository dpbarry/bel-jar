(() => {
  // js/frame/routes.mjs
  var g = typeof window !== "undefined" ? window : globalThis;
  var PROJECT_ID = /^p_[0-9a-hjkmnp-tv-z]{26}$/;
  var EDIT_SHORT = /(?:^|\/)edit\/?$/;
  var EDIT_ANY = /(?:^|\/)edit(?:\.html)?\/?$/;
  var PRIVACY_ANY = /(?:^|\/)privacy(?:\.html)?\/?$/;
  var SHARE_PATH = /(?:^|\/)s\/([^/]*)\/?$/;
  var SHARE_PAGE = /(?:^|\/)share(?:\.html)?\/?$/;
  var SHARE_ID = /^[A-Za-z0-9_-]{22}$/;
  function short() {
    if (g.BELJAR_DEPLOYED) return true;
    const path = g.location && typeof g.location.pathname === "string" ? g.location.pathname : "";
    return EDIT_SHORT.test(path) || SHARE_PATH.test(path);
  }
  function query(pairs) {
    const parts = [];
    for (const [k, v] of pairs) if (v) parts.push(k + "=" + encodeURIComponent(v));
    return parts.length ? "?" + parts.join("&") : "";
  }
  function startsOnLast() {
    const S = g.Settings;
    try {
      return !!S && typeof S.get === "function" && S.get("startPage") === "last";
    } catch (_) {
      return false;
    }
  }
  function homeUrl(opts) {
    const base = short() ? "/" : "index.html";
    if (opts && opts.open) return base + query([["open", opts.open]]);
    if (opts && opts.copy) return base + query([["copy", opts.copy]]);
    return base + (startsOnLast() ? "?home" : "");
  }
  function editUrl(pid) {
    return (short() ? "/edit" : "edit.html") + query([["p", pid]]);
  }
  function privacyUrl() {
    return short() ? "/privacy" : "privacy.html";
  }
  function shareUrl(id, absolute) {
    const rel = short() ? "/s/" + encodeURIComponent(id) : "share.html" + query([["s", id]]);
    if (!absolute) return rel;
    try {
      return new URL(rel, g.location && g.location.href ? g.location.href : "https://beljar.deanbarry.com/").href;
    } catch (_) {
      return rel;
    }
  }
  function signInUrl(loc) {
    const l = loc || g.location;
    const back = l ? String(l.pathname || "/") + String(l.search || "") : "/";
    return "/api/auth/github/start" + query([["return", back]]);
  }
  function pageOf(loc) {
    const p = String(loc && loc.pathname || "");
    if (EDIT_ANY.test(p)) return "edit";
    if (SHARE_PATH.test(p) || SHARE_PAGE.test(p)) return "share";
    return PRIVACY_ANY.test(p) ? "privacy" : "home";
  }
  function projectParam(loc, name2) {
    const pairs = String(loc && loc.search || "").replace(/^\?/, "").split("&");
    for (const pair2 of pairs) {
      const eq = pair2.indexOf("=");
      if (eq === -1 || pair2.slice(0, eq) !== name2) continue;
      let v = pair2.slice(eq + 1);
      try {
        v = decodeURIComponent(v);
      } catch (_) {
        return null;
      }
      return PROJECT_ID.test(v) ? v : null;
    }
    return null;
  }
  function projectOf(loc) {
    return pageOf(loc) === "edit" ? projectParam(loc, "p") : null;
  }
  function param(loc, name2) {
    for (const pair2 of String(loc && loc.search || "").replace(/^\?/, "").split("&")) {
      const eq = pair2.indexOf("=");
      if (eq === -1 || pair2.slice(0, eq) !== name2) continue;
      try {
        return decodeURIComponent(pair2.slice(eq + 1));
      } catch (_) {
        return null;
      }
    }
    return null;
  }
  function shareOf(loc) {
    if (pageOf(loc) !== "share") return null;
    const m = SHARE_PATH.exec(String(loc.pathname || ""));
    let id = m ? m[1] : param(loc, "s");
    if (m) {
      try {
        id = decodeURIComponent(id);
      } catch (_) {
        return null;
      }
    }
    return id && SHARE_ID.test(id) ? id : null;
  }
  function copyOf(loc) {
    if (pageOf(loc) !== "home") return null;
    const id = param(loc, "copy");
    return id && SHARE_ID.test(id) ? id : null;
  }
  function pendingOf(loc) {
    return pageOf(loc) === "home" ? projectParam(loc, "open") : null;
  }
  var ISSUES_URL = "https://github.com/dpbarry/bel-jar/issues";
  var CONTACT_EMAIL = "dean.barry@mail.mcgill.ca";
  var CONTACT_URL = "mailto:" + CONTACT_EMAIL;
  function reportIssue() {
    if (typeof g.open === "function") g.open(ISSUES_URL, "_blank", "noopener");
  }
  function go(url, opts) {
    if (!g.location) return;
    if (opts && opts.replace) g.location.replace(url);
    else g.location.assign(url);
  }
  function settle(url) {
    const h = g.history;
    const l = g.location;
    if (!h || !l || typeof h.replaceState !== "function") return false;
    h.replaceState(h.state, "", url + String(l.hash || ""));
    return true;
  }
  function nameProject(pid) {
    const l = g.location;
    if (!l || pageOf(l) !== "edit" || projectOf(l) === pid) return false;
    return settle(editUrl(pid));
  }
  var Routes = {
    PROJECT_ID,
    SHARE_ID,
    ISSUES_URL,
    CONTACT_URL,
    homeUrl,
    editUrl,
    privacyUrl,
    shareUrl,
    signInUrl,
    pageOf,
    projectOf,
    pendingOf,
    shareOf,
    copyOf,
    go,
    settle,
    nameProject,
    reportIssue
  };
  g.Routes = Routes;

  // js/ui/when.mjs
  function midnightOf(ms) {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }
  function daysAgo(ms, now) {
    const today = new Date(now);
    if (ms >= midnightOf(now)) return 0;
    return ms >= new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).getTime() ? 1 : 2;
  }
  function dayWords(ms, now = Date.now()) {
    const ago = daysAgo(ms, now);
    if (ago === 0) return "Today";
    if (ago === 1) return "Yesterday";
    const at = new Date(ms);
    const opts = at.getFullYear() === new Date(now).getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" };
    return at.toLocaleDateString([], opts);
  }
  function clockTime(ms, seconds = false) {
    const opts = seconds ? { hour: "numeric", minute: "2-digit", second: "2-digit" } : { hour: "numeric", minute: "2-digit" };
    return new Date(ms).toLocaleTimeString([], opts);
  }
  function whenWords(ms, now = Date.now()) {
    const ago = daysAgo(ms, now);
    const time = clockTime(ms);
    if (ago === 0) return "today at " + time;
    if (ago === 1) return "yesterday at " + time;
    return "on " + dayWords(ms, now) + " at " + time;
  }

  // node_modules/@lezer/common/dist/index.js
  var DefaultBufferLength = 1024;
  var nextPropID = 0;
  var Range = class {
    constructor(from, to) {
      this.from = from;
      this.to = to;
    }
  };
  var NodeProp = class {
    /**
    Create a new node prop type.
    */
    constructor(config = {}) {
      this.id = nextPropID++;
      this.perNode = !!config.perNode;
      this.deserialize = config.deserialize || (() => {
        throw new Error("This node type doesn't define a deserialize function");
      });
      this.combine = config.combine || null;
    }
    /**
    This is meant to be used with
    [`NodeSet.extend`](#common.NodeSet.extend) or
    [`LRParser.configure`](#lr.ParserConfig.props) to compute
    prop values for each node type in the set. Takes a [match
    object](#common.NodeType^match) or function that returns undefined
    if the node type doesn't get this prop, and the prop's value if
    it does.
    */
    add(match) {
      if (this.perNode)
        throw new RangeError("Can't add per-node props to node types");
      if (typeof match != "function")
        match = NodeType.match(match);
      return (type) => {
        let result = match(type);
        return result === void 0 ? null : [this, result];
      };
    }
  };
  NodeProp.closedBy = new NodeProp({ deserialize: (str) => str.split(" ") });
  NodeProp.openedBy = new NodeProp({ deserialize: (str) => str.split(" ") });
  NodeProp.group = new NodeProp({ deserialize: (str) => str.split(" ") });
  NodeProp.isolate = new NodeProp({ deserialize: (value) => {
    if (value && value != "rtl" && value != "ltr" && value != "auto")
      throw new RangeError("Invalid value for isolate: " + value);
    return value || "auto";
  } });
  NodeProp.contextHash = new NodeProp({ perNode: true });
  NodeProp.lookAhead = new NodeProp({ perNode: true });
  NodeProp.mounted = new NodeProp({ perNode: true });
  var MountedTree = class {
    constructor(tree, overlay, parser2, bracketed = false) {
      this.tree = tree;
      this.overlay = overlay;
      this.parser = parser2;
      this.bracketed = bracketed;
    }
    /**
    @internal
    */
    static get(tree) {
      return tree && tree.props && tree.props[NodeProp.mounted.id];
    }
  };
  var noProps = /* @__PURE__ */ Object.create(null);
  var NodeType = class _NodeType {
    /**
    @internal
    */
    constructor(name2, props, id, flags = 0) {
      this.name = name2;
      this.props = props;
      this.id = id;
      this.flags = flags;
    }
    /**
    Define a node type.
    */
    static define(spec) {
      let props = spec.props && spec.props.length ? /* @__PURE__ */ Object.create(null) : noProps;
      let flags = (spec.top ? 1 : 0) | (spec.skipped ? 2 : 0) | (spec.error ? 4 : 0) | (spec.name == null ? 8 : 0);
      let type = new _NodeType(spec.name || "", props, spec.id, flags);
      if (spec.props)
        for (let src of spec.props) {
          if (!Array.isArray(src))
            src = src(type);
          if (src) {
            if (src[0].perNode)
              throw new RangeError("Can't store a per-node prop on a node type");
            props[src[0].id] = src[1];
          }
        }
      return type;
    }
    /**
    Retrieves a node prop for this type. Will return `undefined` if
    the prop isn't present on this node.
    */
    prop(prop) {
      return this.props[prop.id];
    }
    /**
    True when this is the top node of a grammar.
    */
    get isTop() {
      return (this.flags & 1) > 0;
    }
    /**
    True when this node is produced by a skip rule.
    */
    get isSkipped() {
      return (this.flags & 2) > 0;
    }
    /**
    Indicates whether this is an error node.
    */
    get isError() {
      return (this.flags & 4) > 0;
    }
    /**
    When true, this node type doesn't correspond to a user-declared
    named node, for example because it is used to cache repetition.
    */
    get isAnonymous() {
      return (this.flags & 8) > 0;
    }
    /**
    Returns true when this node's name or one of its
    [groups](#common.NodeProp^group) matches the given string.
    */
    is(name2) {
      if (typeof name2 == "string") {
        if (this.name == name2)
          return true;
        let group = this.prop(NodeProp.group);
        return group ? group.indexOf(name2) > -1 : false;
      }
      return this.id == name2;
    }
    /**
    Create a function from node types to arbitrary values by
    specifying an object whose property names are node or
    [group](#common.NodeProp^group) names. Often useful with
    [`NodeProp.add`](#common.NodeProp.add). You can put multiple
    names, separated by spaces, in a single property name to map
    multiple node names to a single value.
    */
    static match(map) {
      let direct = /* @__PURE__ */ Object.create(null);
      for (let prop in map)
        for (let name2 of prop.split(" "))
          direct[name2] = map[prop];
      return (node) => {
        for (let groups = node.prop(NodeProp.group), i = -1; i < (groups ? groups.length : 0); i++) {
          let found = direct[i < 0 ? node.name : groups[i]];
          if (found)
            return found;
        }
      };
    }
  };
  NodeType.none = new NodeType(
    "",
    /* @__PURE__ */ Object.create(null),
    0,
    8
    /* NodeFlag.Anonymous */
  );
  var NodeSet = class _NodeSet {
    /**
    Create a set with the given types. The `id` property of each
    type should correspond to its position within the array.
    */
    constructor(types) {
      this.types = types;
      for (let i = 0; i < types.length; i++)
        if (types[i].id != i)
          throw new RangeError("Node type ids should correspond to array positions when creating a node set");
    }
    /**
    Create a copy of this set with some node properties added. The
    arguments to this method can be created with
    [`NodeProp.add`](#common.NodeProp.add).
    */
    extend(...props) {
      let newTypes = [];
      for (let type of this.types) {
        let newProps = null;
        for (let source of props) {
          let add = source(type);
          if (add) {
            if (!newProps)
              newProps = Object.assign({}, type.props);
            let value = add[1], prop = add[0];
            if (prop.combine && prop.id in newProps)
              value = prop.combine(newProps[prop.id], value);
            newProps[prop.id] = value;
          }
        }
        newTypes.push(newProps ? new NodeType(type.name, newProps, type.id, type.flags) : type);
      }
      return new _NodeSet(newTypes);
    }
  };
  var CachedNode = /* @__PURE__ */ new WeakMap();
  var CachedInnerNode = /* @__PURE__ */ new WeakMap();
  var IterMode;
  (function(IterMode2) {
    IterMode2[IterMode2["ExcludeBuffers"] = 1] = "ExcludeBuffers";
    IterMode2[IterMode2["IncludeAnonymous"] = 2] = "IncludeAnonymous";
    IterMode2[IterMode2["IgnoreMounts"] = 4] = "IgnoreMounts";
    IterMode2[IterMode2["IgnoreOverlays"] = 8] = "IgnoreOverlays";
    IterMode2[IterMode2["EnterBracketed"] = 16] = "EnterBracketed";
  })(IterMode || (IterMode = {}));
  var Tree = class _Tree {
    /**
    Construct a new tree. See also [`Tree.build`](#common.Tree^build).
    */
    constructor(type, children, positions, length, props) {
      this.type = type;
      this.children = children;
      this.positions = positions;
      this.length = length;
      this.props = null;
      if (props && props.length) {
        this.props = /* @__PURE__ */ Object.create(null);
        for (let [prop, value] of props)
          this.props[typeof prop == "number" ? prop : prop.id] = value;
      }
    }
    /**
    @internal
    */
    toString() {
      let mounted = MountedTree.get(this);
      if (mounted && !mounted.overlay)
        return mounted.tree.toString();
      let children = "";
      for (let ch of this.children) {
        let str = ch.toString();
        if (str) {
          if (children)
            children += ",";
          children += str;
        }
      }
      return !this.type.name ? children : (/\W/.test(this.type.name) && !this.type.isError ? JSON.stringify(this.type.name) : this.type.name) + (children.length ? "(" + children + ")" : "");
    }
    /**
    Get a [tree cursor](#common.TreeCursor) positioned at the top of
    the tree. Mode can be used to [control](#common.IterMode) which
    nodes the cursor visits.
    */
    cursor(mode = 0) {
      return new TreeCursor(this.topNode, mode);
    }
    /**
    Get a [tree cursor](#common.TreeCursor) pointing into this tree
    at the given position and side (see
    [`moveTo`](#common.TreeCursor.moveTo).
    */
    cursorAt(pos, side = 0, mode = 0) {
      let scope = CachedNode.get(this) || this.topNode;
      let cursor = new TreeCursor(scope);
      cursor.moveTo(pos, side);
      CachedNode.set(this, cursor._tree);
      return cursor;
    }
    /**
    Get a [syntax node](#common.SyntaxNode) object for the top of the
    tree.
    */
    get topNode() {
      return new TreeNode(this, 0, 0, null);
    }
    /**
    Get the [syntax node](#common.SyntaxNode) at the given position.
    If `side` is -1, this will move into nodes that end at the
    position. If 1, it'll move into nodes that start at the
    position. With 0, it'll only enter nodes that cover the position
    from both sides.
    
    Note that this will not enter
    [overlays](#common.MountedTree.overlay), and you often want
    [`resolveInner`](#common.Tree.resolveInner) instead.
    */
    resolve(pos, side = 0) {
      let node = resolveNode(CachedNode.get(this) || this.topNode, pos, side, false);
      CachedNode.set(this, node);
      return node;
    }
    /**
    Like [`resolve`](#common.Tree.resolve), but will enter
    [overlaid](#common.MountedTree.overlay) nodes, producing a syntax node
    pointing into the innermost overlaid tree at the given position
    (with parent links going through all parent structure, including
    the host trees).
    */
    resolveInner(pos, side = 0) {
      let node = resolveNode(CachedInnerNode.get(this) || this.topNode, pos, side, true);
      CachedInnerNode.set(this, node);
      return node;
    }
    /**
    In some situations, it can be useful to iterate through all
    nodes around a position, including those in overlays that don't
    directly cover the position. This method gives you an iterator
    that will produce all nodes, from small to big, around the given
    position.
    */
    resolveStack(pos, side = 0) {
      return stackIterator(this, pos, side);
    }
    /**
    Iterate over the tree and its children, calling `enter` for any
    node that touches the `from`/`to` region (if given) before
    running over such a node's children, and `leave` (if given) when
    leaving the node. When `enter` returns `false`, that node will
    not have its children iterated over (or `leave` called).
    */
    iterate(spec) {
      let { enter, leave, from = 0, to = this.length } = spec;
      let mode = spec.mode || 0, anon = (mode & IterMode.IncludeAnonymous) > 0;
      for (let c = this.cursor(mode | IterMode.IncludeAnonymous); ; ) {
        let entered = false;
        if (c.from <= to && c.to >= from && (!anon && c.type.isAnonymous || enter(c) !== false)) {
          if (c.firstChild())
            continue;
          entered = true;
        }
        for (; ; ) {
          if (entered && leave && (anon || !c.type.isAnonymous))
            leave(c);
          if (c.nextSibling())
            break;
          if (!c.parent())
            return;
          entered = true;
        }
      }
    }
    /**
    Get the value of the given [node prop](#common.NodeProp) for this
    node. Works with both per-node and per-type props.
    */
    prop(prop) {
      return !prop.perNode ? this.type.prop(prop) : this.props ? this.props[prop.id] : void 0;
    }
    /**
    Returns the node's [per-node props](#common.NodeProp.perNode) in a
    format that can be passed to the [`Tree`](#common.Tree)
    constructor.
    */
    get propValues() {
      let result = [];
      if (this.props)
        for (let id in this.props)
          result.push([+id, this.props[id]]);
      return result;
    }
    /**
    Balance the direct children of this tree, producing a copy of
    which may have children grouped into subtrees with type
    [`NodeType.none`](#common.NodeType^none).
    */
    balance(config = {}) {
      return this.children.length <= 8 ? this : balanceRange(NodeType.none, this.children, this.positions, 0, this.children.length, 0, this.length, (children, positions, length) => new _Tree(this.type, children, positions, length, this.propValues), config.makeTree || ((children, positions, length) => new _Tree(NodeType.none, children, positions, length)));
    }
    /**
    Build a tree from a postfix-ordered buffer of node information,
    or a cursor over such a buffer.
    */
    static build(data) {
      return buildTree(data);
    }
  };
  Tree.empty = new Tree(NodeType.none, [], [], 0);
  var FlatBufferCursor = class _FlatBufferCursor {
    constructor(buffer, index) {
      this.buffer = buffer;
      this.index = index;
    }
    get id() {
      return this.buffer[this.index - 4];
    }
    get start() {
      return this.buffer[this.index - 3];
    }
    get end() {
      return this.buffer[this.index - 2];
    }
    get size() {
      return this.buffer[this.index - 1];
    }
    get pos() {
      return this.index;
    }
    next() {
      this.index -= 4;
    }
    fork() {
      return new _FlatBufferCursor(this.buffer, this.index);
    }
  };
  var TreeBuffer = class _TreeBuffer {
    /**
    Create a tree buffer.
    */
    constructor(buffer, length, set) {
      this.buffer = buffer;
      this.length = length;
      this.set = set;
    }
    /**
    @internal
    */
    get type() {
      return NodeType.none;
    }
    /**
    @internal
    */
    toString() {
      let result = [];
      for (let index = 0; index < this.buffer.length; ) {
        result.push(this.childString(index));
        index = this.buffer[index + 3];
      }
      return result.join(",");
    }
    /**
    @internal
    */
    childString(index) {
      let id = this.buffer[index], endIndex = this.buffer[index + 3];
      let type = this.set.types[id], result = type.name;
      if (/\W/.test(result) && !type.isError)
        result = JSON.stringify(result);
      index += 4;
      if (endIndex == index)
        return result;
      let children = [];
      while (index < endIndex) {
        children.push(this.childString(index));
        index = this.buffer[index + 3];
      }
      return result + "(" + children.join(",") + ")";
    }
    /**
    @internal
    */
    findChild(startIndex, endIndex, dir, pos, side) {
      let { buffer } = this, pick = -1;
      for (let i = startIndex; i != endIndex; i = buffer[i + 3]) {
        if (checkSide(side, pos, buffer[i + 1], buffer[i + 2])) {
          pick = i;
          if (dir > 0)
            break;
        }
      }
      return pick;
    }
    /**
    @internal
    */
    slice(startI, endI, from) {
      let b = this.buffer;
      let copy = new Uint16Array(endI - startI), len = 0;
      for (let i = startI, j = 0; i < endI; ) {
        copy[j++] = b[i++];
        copy[j++] = b[i++] - from;
        let to = copy[j++] = b[i++] - from;
        copy[j++] = b[i++] - startI;
        len = Math.max(len, to);
      }
      return new _TreeBuffer(copy, len, this.set);
    }
  };
  function checkSide(side, pos, from, to) {
    switch (side) {
      case -2:
        return from < pos;
      case -1:
        return to >= pos && from < pos;
      case 0:
        return from < pos && to > pos;
      case 1:
        return from <= pos && to > pos;
      case 2:
        return to > pos;
      case 4:
        return true;
    }
  }
  function resolveNode(node, pos, side, overlays) {
    var _a;
    while (node.from == node.to || (side < 1 ? node.from >= pos : node.from > pos) || (side > -1 ? node.to <= pos : node.to < pos)) {
      let parent = !overlays && node instanceof TreeNode && node.index < 0 ? null : node.parent;
      if (!parent)
        return node;
      node = parent;
    }
    let mode = overlays ? 0 : IterMode.IgnoreOverlays;
    if (overlays)
      for (let scan = node, parent = scan.parent; parent; scan = parent, parent = scan.parent) {
        if (scan instanceof TreeNode && scan.index < 0 && ((_a = parent.enter(pos, side, mode)) === null || _a === void 0 ? void 0 : _a.from) != scan.from)
          node = parent;
      }
    for (; ; ) {
      let inner = node.enter(pos, side, mode);
      if (!inner)
        return node;
      node = inner;
    }
  }
  var BaseNode = class {
    cursor(mode = 0) {
      return new TreeCursor(this, mode);
    }
    getChild(type, before = null, after = null) {
      let r = getChildren(this, type, before, after);
      return r.length ? r[0] : null;
    }
    getChildren(type, before = null, after = null) {
      return getChildren(this, type, before, after);
    }
    resolve(pos, side = 0) {
      return resolveNode(this, pos, side, false);
    }
    resolveInner(pos, side = 0) {
      return resolveNode(this, pos, side, true);
    }
    matchContext(context) {
      return matchNodeContext(this.parent, context);
    }
    enterUnfinishedNodesBefore(pos) {
      let scan = this.childBefore(pos), node = this;
      while (scan) {
        let last = scan.lastChild;
        if (!last || last.to != scan.to)
          break;
        if (last.type.isError && last.from == last.to) {
          node = scan;
          scan = last.prevSibling;
        } else {
          scan = last;
        }
      }
      return node;
    }
    get node() {
      return this;
    }
    get next() {
      return this.parent;
    }
  };
  var TreeNode = class _TreeNode extends BaseNode {
    constructor(_tree, from, index, _parent) {
      super();
      this._tree = _tree;
      this.from = from;
      this.index = index;
      this._parent = _parent;
    }
    get type() {
      return this._tree.type;
    }
    get name() {
      return this._tree.type.name;
    }
    get to() {
      return this.from + this._tree.length;
    }
    nextChild(i, dir, pos, side, mode = 0) {
      for (let parent = this; ; ) {
        for (let { children, positions } = parent._tree, e = dir > 0 ? children.length : -1; i != e; i += dir) {
          let next = children[i], start2 = positions[i] + parent.from, mounted;
          if (!(mode & IterMode.EnterBracketed && next instanceof Tree && (mounted = MountedTree.get(next)) && !mounted.overlay && mounted.bracketed && pos >= start2 && pos <= start2 + next.length) && !checkSide(side, pos, start2, start2 + next.length))
            continue;
          if (next instanceof TreeBuffer) {
            if (mode & IterMode.ExcludeBuffers)
              continue;
            let index = next.findChild(0, next.buffer.length, dir, pos - start2, side);
            if (index > -1)
              return new BufferNode(new BufferContext(parent, next, i, start2), null, index);
          } else if (mode & IterMode.IncludeAnonymous || (!next.type.isAnonymous || hasChild(next))) {
            let mounted2;
            if (!(mode & IterMode.IgnoreMounts) && (mounted2 = MountedTree.get(next)) && !mounted2.overlay)
              return new _TreeNode(mounted2.tree, start2, i, parent);
            let inner = new _TreeNode(next, start2, i, parent);
            return mode & IterMode.IncludeAnonymous || !inner.type.isAnonymous ? inner : inner.nextChild(dir < 0 ? next.children.length - 1 : 0, dir, pos, side, mode);
          }
        }
        if (mode & IterMode.IncludeAnonymous || !parent.type.isAnonymous)
          return null;
        if (parent.index >= 0)
          i = parent.index + dir;
        else
          i = dir < 0 ? -1 : parent._parent._tree.children.length;
        parent = parent._parent;
        if (!parent)
          return null;
      }
    }
    get firstChild() {
      return this.nextChild(
        0,
        1,
        0,
        4
        /* Side.DontCare */
      );
    }
    get lastChild() {
      return this.nextChild(
        this._tree.children.length - 1,
        -1,
        0,
        4
        /* Side.DontCare */
      );
    }
    childAfter(pos) {
      return this.nextChild(
        0,
        1,
        pos,
        2
        /* Side.After */
      );
    }
    childBefore(pos) {
      return this.nextChild(
        this._tree.children.length - 1,
        -1,
        pos,
        -2
        /* Side.Before */
      );
    }
    prop(prop) {
      return this._tree.prop(prop);
    }
    enter(pos, side, mode = 0) {
      let mounted;
      if (!(mode & IterMode.IgnoreOverlays) && (mounted = MountedTree.get(this._tree)) && mounted.overlay) {
        let rPos = pos - this.from, enterBracketed = mode & IterMode.EnterBracketed && mounted.bracketed;
        for (let { from, to } of mounted.overlay) {
          if ((side > 0 || enterBracketed ? from <= rPos : from < rPos) && (side < 0 || enterBracketed ? to >= rPos : to > rPos))
            return new _TreeNode(mounted.tree, mounted.overlay[0].from + this.from, -1, this);
        }
      }
      return this.nextChild(0, 1, pos, side, mode);
    }
    nextSignificantParent() {
      let val = this;
      while (val.type.isAnonymous && val._parent)
        val = val._parent;
      return val;
    }
    get parent() {
      return this._parent ? this._parent.nextSignificantParent() : null;
    }
    get nextSibling() {
      return this._parent && this.index >= 0 ? this._parent.nextChild(
        this.index + 1,
        1,
        0,
        4
        /* Side.DontCare */
      ) : null;
    }
    get prevSibling() {
      return this._parent && this.index >= 0 ? this._parent.nextChild(
        this.index - 1,
        -1,
        0,
        4
        /* Side.DontCare */
      ) : null;
    }
    get tree() {
      return this._tree;
    }
    toTree() {
      return this._tree;
    }
    /**
    @internal
    */
    toString() {
      return this._tree.toString();
    }
  };
  function getChildren(node, type, before, after) {
    let cur = node.cursor(), result = [];
    if (!cur.firstChild())
      return result;
    if (before != null)
      for (let found = false; !found; ) {
        found = cur.type.is(before);
        if (!cur.nextSibling())
          return result;
      }
    for (; ; ) {
      if (after != null && cur.type.is(after))
        return result;
      if (cur.type.is(type))
        result.push(cur.node);
      if (!cur.nextSibling())
        return after == null ? result : [];
    }
  }
  function matchNodeContext(node, context, i = context.length - 1) {
    for (let p = node; i >= 0; p = p.parent) {
      if (!p)
        return false;
      if (!p.type.isAnonymous) {
        if (context[i] && context[i] != p.name)
          return false;
        i--;
      }
    }
    return true;
  }
  var BufferContext = class {
    constructor(parent, buffer, index, start2) {
      this.parent = parent;
      this.buffer = buffer;
      this.index = index;
      this.start = start2;
    }
  };
  var BufferNode = class _BufferNode extends BaseNode {
    get name() {
      return this.type.name;
    }
    get from() {
      return this.context.start + this.context.buffer.buffer[this.index + 1];
    }
    get to() {
      return this.context.start + this.context.buffer.buffer[this.index + 2];
    }
    constructor(context, _parent, index) {
      super();
      this.context = context;
      this._parent = _parent;
      this.index = index;
      this.type = context.buffer.set.types[context.buffer.buffer[index]];
    }
    child(dir, pos, side) {
      let { buffer } = this.context;
      let index = buffer.findChild(this.index + 4, buffer.buffer[this.index + 3], dir, pos - this.context.start, side);
      return index < 0 ? null : new _BufferNode(this.context, this, index);
    }
    get firstChild() {
      return this.child(
        1,
        0,
        4
        /* Side.DontCare */
      );
    }
    get lastChild() {
      return this.child(
        -1,
        0,
        4
        /* Side.DontCare */
      );
    }
    childAfter(pos) {
      return this.child(
        1,
        pos,
        2
        /* Side.After */
      );
    }
    childBefore(pos) {
      return this.child(
        -1,
        pos,
        -2
        /* Side.Before */
      );
    }
    prop(prop) {
      return this.type.prop(prop);
    }
    enter(pos, side, mode = 0) {
      if (mode & IterMode.ExcludeBuffers)
        return null;
      let { buffer } = this.context;
      let index = buffer.findChild(this.index + 4, buffer.buffer[this.index + 3], side > 0 ? 1 : -1, pos - this.context.start, side);
      return index < 0 ? null : new _BufferNode(this.context, this, index);
    }
    get parent() {
      return this._parent || this.context.parent.nextSignificantParent();
    }
    externalSibling(dir) {
      return this._parent ? null : this.context.parent.nextChild(
        this.context.index + dir,
        dir,
        0,
        4
        /* Side.DontCare */
      );
    }
    get nextSibling() {
      let { buffer } = this.context;
      let after = buffer.buffer[this.index + 3];
      if (after < (this._parent ? buffer.buffer[this._parent.index + 3] : buffer.buffer.length))
        return new _BufferNode(this.context, this._parent, after);
      return this.externalSibling(1);
    }
    get prevSibling() {
      let { buffer } = this.context;
      let parentStart = this._parent ? this._parent.index + 4 : 0;
      if (this.index == parentStart)
        return this.externalSibling(-1);
      return new _BufferNode(this.context, this._parent, buffer.findChild(
        parentStart,
        this.index,
        -1,
        0,
        4
        /* Side.DontCare */
      ));
    }
    get tree() {
      return null;
    }
    toTree() {
      let children = [], positions = [];
      let { buffer } = this.context;
      let startI = this.index + 4, endI = buffer.buffer[this.index + 3];
      if (endI > startI) {
        let from = buffer.buffer[this.index + 1];
        children.push(buffer.slice(startI, endI, from));
        positions.push(0);
      }
      return new Tree(this.type, children, positions, this.to - this.from);
    }
    /**
    @internal
    */
    toString() {
      return this.context.buffer.childString(this.index);
    }
  };
  function iterStack(heads) {
    if (!heads.length)
      return null;
    let pick = 0, picked = heads[0];
    for (let i = 1; i < heads.length; i++) {
      let node = heads[i];
      if (node.from > picked.from || node.to < picked.to) {
        picked = node;
        pick = i;
      }
    }
    let next = picked instanceof TreeNode && picked.index < 0 ? null : picked.parent;
    let newHeads = heads.slice();
    if (next)
      newHeads[pick] = next;
    else
      newHeads.splice(pick, 1);
    return new StackIterator(newHeads, picked);
  }
  var StackIterator = class {
    constructor(heads, node) {
      this.heads = heads;
      this.node = node;
    }
    get next() {
      return iterStack(this.heads);
    }
  };
  function stackIterator(tree, pos, side) {
    let inner = tree.resolveInner(pos, side), layers = null;
    for (let scan = inner instanceof TreeNode ? inner : inner.context.parent; scan; scan = scan.parent) {
      if (scan.index < 0) {
        let parent = scan.parent;
        (layers || (layers = [inner])).push(parent.resolve(pos, side));
        scan = parent;
      } else {
        let mount = MountedTree.get(scan.tree);
        if (mount && mount.overlay && mount.overlay[0].from <= pos && mount.overlay[mount.overlay.length - 1].to >= pos) {
          let root = new TreeNode(mount.tree, mount.overlay[0].from + scan.from, -1, scan);
          (layers || (layers = [inner])).push(resolveNode(root, pos, side, false));
        }
      }
    }
    return layers ? iterStack(layers) : inner;
  }
  var TreeCursor = class {
    /**
    Shorthand for `.type.name`.
    */
    get name() {
      return this.type.name;
    }
    /**
    @internal
    */
    constructor(node, mode = 0) {
      this.buffer = null;
      this.stack = [];
      this.index = 0;
      this.bufferNode = null;
      this.mode = mode & ~IterMode.EnterBracketed;
      if (node instanceof TreeNode) {
        this.yieldNode(node);
      } else {
        this._tree = node.context.parent;
        this.buffer = node.context;
        for (let n = node._parent; n; n = n._parent)
          this.stack.unshift(n.index);
        this.bufferNode = node;
        this.yieldBuf(node.index);
      }
    }
    yieldNode(node) {
      if (!node)
        return false;
      this._tree = node;
      this.type = node.type;
      this.from = node.from;
      this.to = node.to;
      return true;
    }
    yieldBuf(index, type) {
      this.index = index;
      let { start: start2, buffer } = this.buffer;
      this.type = type || buffer.set.types[buffer.buffer[index]];
      this.from = start2 + buffer.buffer[index + 1];
      this.to = start2 + buffer.buffer[index + 2];
      return true;
    }
    /**
    @internal
    */
    yield(node) {
      if (!node)
        return false;
      if (node instanceof TreeNode) {
        this.buffer = null;
        return this.yieldNode(node);
      }
      this.buffer = node.context;
      return this.yieldBuf(node.index, node.type);
    }
    /**
    @internal
    */
    toString() {
      return this.buffer ? this.buffer.buffer.childString(this.index) : this._tree.toString();
    }
    /**
    @internal
    */
    enterChild(dir, pos, side) {
      if (!this.buffer)
        return this.yield(this._tree.nextChild(dir < 0 ? this._tree._tree.children.length - 1 : 0, dir, pos, side, this.mode));
      let { buffer } = this.buffer;
      let index = buffer.findChild(this.index + 4, buffer.buffer[this.index + 3], dir, pos - this.buffer.start, side);
      if (index < 0)
        return false;
      this.stack.push(this.index);
      return this.yieldBuf(index);
    }
    /**
    Move the cursor to this node's first child. When this returns
    false, the node has no child, and the cursor has not been moved.
    */
    firstChild() {
      return this.enterChild(
        1,
        0,
        4
        /* Side.DontCare */
      );
    }
    /**
    Move the cursor to this node's last child.
    */
    lastChild() {
      return this.enterChild(
        -1,
        0,
        4
        /* Side.DontCare */
      );
    }
    /**
    Move the cursor to the first child that ends after `pos`.
    */
    childAfter(pos) {
      return this.enterChild(
        1,
        pos,
        2
        /* Side.After */
      );
    }
    /**
    Move to the last child that starts before `pos`.
    */
    childBefore(pos) {
      return this.enterChild(
        -1,
        pos,
        -2
        /* Side.Before */
      );
    }
    /**
    Move the cursor to the child around `pos`. If side is -1 the
    child may end at that position, when 1 it may start there. This
    will also enter [overlaid](#common.MountedTree.overlay)
    [mounted](#common.NodeProp^mounted) trees unless `overlays` is
    set to false.
    */
    enter(pos, side, mode = this.mode) {
      if (!this.buffer)
        return this.yield(this._tree.enter(pos, side, mode));
      return mode & IterMode.ExcludeBuffers ? false : this.enterChild(1, pos, side);
    }
    /**
    Move to the node's parent node, if this isn't the top node.
    */
    parent() {
      if (!this.buffer)
        return this.yieldNode(this.mode & IterMode.IncludeAnonymous ? this._tree._parent : this._tree.parent);
      if (this.stack.length)
        return this.yieldBuf(this.stack.pop());
      let parent = this.mode & IterMode.IncludeAnonymous ? this.buffer.parent : this.buffer.parent.nextSignificantParent();
      this.buffer = null;
      return this.yieldNode(parent);
    }
    /**
    @internal
    */
    sibling(dir) {
      if (!this.buffer)
        return !this._tree._parent ? false : this.yield(this._tree.index < 0 ? null : this._tree._parent.nextChild(this._tree.index + dir, dir, 0, 4, this.mode));
      let { buffer } = this.buffer, d = this.stack.length - 1;
      if (dir < 0) {
        let parentStart = d < 0 ? 0 : this.stack[d] + 4;
        if (this.index != parentStart)
          return this.yieldBuf(buffer.findChild(
            parentStart,
            this.index,
            -1,
            0,
            4
            /* Side.DontCare */
          ));
      } else {
        let after = buffer.buffer[this.index + 3];
        if (after < (d < 0 ? buffer.buffer.length : buffer.buffer[this.stack[d] + 3]))
          return this.yieldBuf(after);
      }
      return d < 0 ? this.yield(this.buffer.parent.nextChild(this.buffer.index + dir, dir, 0, 4, this.mode)) : false;
    }
    /**
    Move to this node's next sibling, if any.
    */
    nextSibling() {
      return this.sibling(1);
    }
    /**
    Move to this node's previous sibling, if any.
    */
    prevSibling() {
      return this.sibling(-1);
    }
    atLastNode(dir) {
      let index, parent, { buffer } = this;
      if (buffer) {
        if (dir > 0) {
          if (this.index < buffer.buffer.buffer.length)
            return false;
        } else {
          for (let i = 0; i < this.index; i++)
            if (buffer.buffer.buffer[i + 3] < this.index)
              return false;
        }
        ({ index, parent } = buffer);
      } else {
        ({ index, _parent: parent } = this._tree);
      }
      for (; parent; { index, _parent: parent } = parent) {
        if (index > -1)
          for (let i = index + dir, e = dir < 0 ? -1 : parent._tree.children.length; i != e; i += dir) {
            let child = parent._tree.children[i];
            if (this.mode & IterMode.IncludeAnonymous || child instanceof TreeBuffer || !child.type.isAnonymous || hasChild(child))
              return false;
          }
      }
      return true;
    }
    move(dir, enter) {
      if (enter && this.enterChild(
        dir,
        0,
        4
        /* Side.DontCare */
      ))
        return true;
      for (; ; ) {
        if (this.sibling(dir))
          return true;
        if (this.atLastNode(dir) || !this.parent())
          return false;
      }
    }
    /**
    Move to the next node in a
    [pre-order](https://en.wikipedia.org/wiki/Tree_traversal#Pre-order,_NLR)
    traversal, going from a node to its first child or, if the
    current node is empty or `enter` is false, its next sibling or
    the next sibling of the first parent node that has one.
    */
    next(enter = true) {
      return this.move(1, enter);
    }
    /**
    Move to the next node in a last-to-first pre-order traversal. A
    node is followed by its last child or, if it has none, its
    previous sibling or the previous sibling of the first parent
    node that has one.
    */
    prev(enter = true) {
      return this.move(-1, enter);
    }
    /**
    Move the cursor to the innermost node that covers `pos`. If
    `side` is -1, it will enter nodes that end at `pos`. If it is 1,
    it will enter nodes that start at `pos`.
    */
    moveTo(pos, side = 0) {
      while (this.from == this.to || (side < 1 ? this.from >= pos : this.from > pos) || (side > -1 ? this.to <= pos : this.to < pos))
        if (!this.parent())
          break;
      while (this.enterChild(1, pos, side)) {
      }
      return this;
    }
    /**
    Get a [syntax node](#common.SyntaxNode) at the cursor's current
    position.
    */
    get node() {
      if (!this.buffer)
        return this._tree;
      let cache = this.bufferNode, result = null, depth = 0;
      if (cache && cache.context == this.buffer) {
        scan: for (let index = this.index, d = this.stack.length; d >= 0; ) {
          for (let c = cache; c; c = c._parent)
            if (c.index == index) {
              if (index == this.index)
                return c;
              result = c;
              depth = d + 1;
              break scan;
            }
          index = this.stack[--d];
        }
      }
      for (let i = depth; i < this.stack.length; i++)
        result = new BufferNode(this.buffer, result, this.stack[i]);
      return this.bufferNode = new BufferNode(this.buffer, result, this.index);
    }
    /**
    Get the [tree](#common.Tree) that represents the current node, if
    any. Will return null when the node is in a [tree
    buffer](#common.TreeBuffer).
    */
    get tree() {
      return this.buffer ? null : this._tree._tree;
    }
    /**
    Iterate over the current node and all its descendants, calling
    `enter` when entering a node and `leave`, if given, when leaving
    one. When `enter` returns `false`, any children of that node are
    skipped, and `leave` isn't called for it.
    */
    iterate(enter, leave) {
      for (let depth = 0; ; ) {
        let mustLeave = false;
        if (this.type.isAnonymous || enter(this) !== false) {
          if (this.firstChild()) {
            depth++;
            continue;
          }
          if (!this.type.isAnonymous)
            mustLeave = true;
        }
        for (; ; ) {
          if (mustLeave && leave)
            leave(this);
          mustLeave = this.type.isAnonymous;
          if (!depth)
            return;
          if (this.nextSibling())
            break;
          this.parent();
          depth--;
          mustLeave = true;
        }
      }
    }
    /**
    Test whether the current node matches a given context—a sequence
    of direct parent node names. Empty strings in the context array
    are treated as wildcards.
    */
    matchContext(context) {
      if (!this.buffer)
        return matchNodeContext(this.node.parent, context);
      let { buffer } = this.buffer, { types } = buffer.set;
      for (let i = context.length - 1, d = this.stack.length - 1; i >= 0; d--) {
        if (d < 0)
          return matchNodeContext(this._tree, context, i);
        let type = types[buffer.buffer[this.stack[d]]];
        if (!type.isAnonymous) {
          if (context[i] && context[i] != type.name)
            return false;
          i--;
        }
      }
      return true;
    }
  };
  function hasChild(tree) {
    return tree.children.some((ch) => ch instanceof TreeBuffer || !ch.type.isAnonymous || hasChild(ch));
  }
  function buildTree(data) {
    var _a;
    let { buffer, nodeSet, maxBufferLength = DefaultBufferLength, reused = [], minRepeatType = nodeSet.types.length } = data;
    let cursor = Array.isArray(buffer) ? new FlatBufferCursor(buffer, buffer.length) : buffer;
    let types = nodeSet.types;
    let contextHash = 0, lookAhead = 0;
    function takeNode(parentStart, minPos, children2, positions2, inRepeat, depth) {
      let { id, start: start2, end, size } = cursor;
      let lookAheadAtStart = lookAhead, contextAtStart = contextHash;
      if (size < 0) {
        cursor.next();
        if (size == -1) {
          let node2 = reused[id];
          children2.push(node2);
          positions2.push(start2 - parentStart);
          return;
        } else if (size == -3) {
          contextHash = id;
          return;
        } else if (size == -4) {
          lookAhead = id;
          return;
        } else {
          throw new RangeError(`Unrecognized record size: ${size}`);
        }
      }
      let type = types[id], node, buffer2;
      let startPos = start2 - parentStart;
      if (end - start2 <= maxBufferLength && (buffer2 = findBufferSize(cursor.pos - minPos, inRepeat))) {
        let data2 = new Uint16Array(buffer2.size - buffer2.skip);
        let endPos = cursor.pos - buffer2.size, index = data2.length;
        while (cursor.pos > endPos)
          index = copyToBuffer(buffer2.start, data2, index);
        node = new TreeBuffer(data2, end - buffer2.start, nodeSet);
        startPos = buffer2.start - parentStart;
      } else {
        let endPos = cursor.pos - size;
        cursor.next();
        let localChildren = [], localPositions = [];
        let localInRepeat = id >= minRepeatType ? id : -1;
        let lastGroup = 0, lastEnd = end;
        while (cursor.pos > endPos) {
          if (localInRepeat >= 0 && cursor.id == localInRepeat && cursor.size >= 0) {
            if (cursor.end <= lastEnd - maxBufferLength) {
              makeRepeatLeaf(localChildren, localPositions, start2, lastGroup, cursor.end, lastEnd, localInRepeat, lookAheadAtStart, contextAtStart);
              lastGroup = localChildren.length;
              lastEnd = cursor.end;
            }
            cursor.next();
          } else if (depth > 2500) {
            takeFlatNode(start2, endPos, localChildren, localPositions);
          } else {
            takeNode(start2, endPos, localChildren, localPositions, localInRepeat, depth + 1);
          }
        }
        if (localInRepeat >= 0 && lastGroup > 0 && lastGroup < localChildren.length)
          makeRepeatLeaf(localChildren, localPositions, start2, lastGroup, start2, lastEnd, localInRepeat, lookAheadAtStart, contextAtStart);
        localChildren.reverse();
        localPositions.reverse();
        if (localInRepeat > -1 && lastGroup > 0) {
          let make = makeBalanced(type, contextAtStart);
          node = balanceRange(type, localChildren, localPositions, 0, localChildren.length, 0, end - start2, make, make);
        } else {
          node = makeTree(type, localChildren, localPositions, end - start2, lookAheadAtStart - end, contextAtStart);
        }
      }
      children2.push(node);
      positions2.push(startPos);
    }
    function takeFlatNode(parentStart, minPos, children2, positions2) {
      let nodes = [];
      let nodeCount = 0, stopAt = -1;
      while (cursor.pos > minPos) {
        let { id, start: start2, end, size } = cursor;
        if (size > 4) {
          cursor.next();
        } else if (stopAt > -1 && start2 < stopAt) {
          break;
        } else {
          if (stopAt < 0)
            stopAt = end - maxBufferLength;
          nodes.push(id, start2, end);
          nodeCount++;
          cursor.next();
        }
      }
      if (nodeCount) {
        let buffer2 = new Uint16Array(nodeCount * 4);
        let start2 = nodes[nodes.length - 2];
        for (let i = nodes.length - 3, j = 0; i >= 0; i -= 3) {
          buffer2[j++] = nodes[i];
          buffer2[j++] = nodes[i + 1] - start2;
          buffer2[j++] = nodes[i + 2] - start2;
          buffer2[j++] = j;
        }
        children2.push(new TreeBuffer(buffer2, nodes[2] - start2, nodeSet));
        positions2.push(start2 - parentStart);
      }
    }
    function makeBalanced(type, contextHash2) {
      return (children2, positions2, length2) => {
        let lookAhead2 = 0, lastI = children2.length - 1, last, lookAheadProp;
        if (lastI >= 0 && (last = children2[lastI]) instanceof Tree) {
          if (!lastI && last.type == type && last.length == length2)
            return last;
          if (lookAheadProp = last.prop(NodeProp.lookAhead))
            lookAhead2 = positions2[lastI] + last.length + lookAheadProp;
        }
        return makeTree(type, children2, positions2, length2, lookAhead2, contextHash2);
      };
    }
    function makeRepeatLeaf(children2, positions2, base, i, from, to, type, lookAhead2, contextHash2) {
      let localChildren = [], localPositions = [];
      while (children2.length > i) {
        localChildren.push(children2.pop());
        localPositions.push(positions2.pop() + base - from);
      }
      children2.push(makeTree(nodeSet.types[type], localChildren, localPositions, to - from, lookAhead2 - to, contextHash2));
      positions2.push(from - base);
    }
    function makeTree(type, children2, positions2, length2, lookAhead2, contextHash2, props) {
      if (contextHash2) {
        let pair2 = [NodeProp.contextHash, contextHash2];
        props = props ? [pair2].concat(props) : [pair2];
      }
      if (lookAhead2 > 25) {
        let pair2 = [NodeProp.lookAhead, lookAhead2];
        props = props ? [pair2].concat(props) : [pair2];
      }
      return new Tree(type, children2, positions2, length2, props);
    }
    function findBufferSize(maxSize, inRepeat) {
      let fork = cursor.fork();
      let size = 0, start2 = 0, skip = 0, minStart = fork.end - maxBufferLength;
      let result = { size: 0, start: 0, skip: 0 };
      scan: for (let minPos = fork.pos - maxSize; fork.pos > minPos; ) {
        let nodeSize2 = fork.size;
        if (fork.id == inRepeat && nodeSize2 >= 0) {
          result.size = size;
          result.start = start2;
          result.skip = skip;
          skip += 4;
          size += 4;
          fork.next();
          continue;
        }
        let startPos = fork.pos - nodeSize2;
        if (nodeSize2 < 0 || startPos < minPos || fork.start < minStart)
          break;
        let localSkipped = fork.id >= minRepeatType ? 4 : 0;
        let nodeStart = fork.start;
        fork.next();
        while (fork.pos > startPos) {
          if (fork.size < 0) {
            if (fork.size == -3 || fork.size == -4)
              localSkipped += 4;
            else
              break scan;
          } else if (fork.id >= minRepeatType) {
            localSkipped += 4;
          }
          fork.next();
        }
        start2 = nodeStart;
        size += nodeSize2;
        skip += localSkipped;
      }
      if (inRepeat < 0 || size == maxSize) {
        result.size = size;
        result.start = start2;
        result.skip = skip;
      }
      return result.size > 4 ? result : void 0;
    }
    function copyToBuffer(bufferStart, buffer2, index) {
      let { id, start: start2, end, size } = cursor;
      cursor.next();
      if (size >= 0 && id < minRepeatType) {
        let startIndex = index;
        if (size > 4) {
          let endPos = cursor.pos - (size - 4);
          while (cursor.pos > endPos)
            index = copyToBuffer(bufferStart, buffer2, index);
        }
        buffer2[--index] = startIndex;
        buffer2[--index] = end - bufferStart;
        buffer2[--index] = start2 - bufferStart;
        buffer2[--index] = id;
      } else if (size == -3) {
        contextHash = id;
      } else if (size == -4) {
        lookAhead = id;
      }
      return index;
    }
    let children = [], positions = [];
    while (cursor.pos > 0)
      takeNode(data.start || 0, data.bufferStart || 0, children, positions, -1, 0);
    let length = (_a = data.length) !== null && _a !== void 0 ? _a : children.length ? positions[0] + children[0].length : 0;
    return new Tree(types[data.topID], children.reverse(), positions.reverse(), length);
  }
  var nodeSizeCache = /* @__PURE__ */ new WeakMap();
  function nodeSize(balanceType, node) {
    if (!balanceType.isAnonymous || node instanceof TreeBuffer || node.type != balanceType)
      return 1;
    let size = nodeSizeCache.get(node);
    if (size == null) {
      size = 1;
      for (let child of node.children) {
        if (child.type != balanceType || !(child instanceof Tree)) {
          size = 1;
          break;
        }
        size += nodeSize(balanceType, child);
      }
      nodeSizeCache.set(node, size);
    }
    return size;
  }
  function balanceRange(balanceType, children, positions, from, to, start2, length, mkTop, mkTree) {
    let total = 0;
    for (let i = from; i < to; i++)
      total += nodeSize(balanceType, children[i]);
    let maxChild = Math.ceil(
      total * 1.5 / 8
      /* Balance.BranchFactor */
    );
    let localChildren = [], localPositions = [];
    function divide(children2, positions2, from2, to2, offset) {
      for (let i = from2; i < to2; ) {
        let groupFrom = i, groupStart = positions2[i], groupSize = nodeSize(balanceType, children2[i]);
        i++;
        for (; i < to2; i++) {
          let nextSize = nodeSize(balanceType, children2[i]);
          if (groupSize + nextSize >= maxChild)
            break;
          groupSize += nextSize;
        }
        if (i == groupFrom + 1) {
          if (groupSize > maxChild) {
            let only = children2[groupFrom];
            divide(only.children, only.positions, 0, only.children.length, positions2[groupFrom] + offset);
            continue;
          }
          localChildren.push(children2[groupFrom]);
        } else {
          let length2 = positions2[i - 1] + children2[i - 1].length - groupStart;
          localChildren.push(balanceRange(balanceType, children2, positions2, groupFrom, i, groupStart, length2, null, mkTree));
        }
        localPositions.push(groupStart + offset - start2);
      }
    }
    divide(children, positions, from, to, 0);
    return (mkTop || mkTree)(localChildren, localPositions, length);
  }
  var Parser = class {
    /**
    Start a parse, returning a [partial parse](#common.PartialParse)
    object. [`fragments`](#common.TreeFragment) can be passed in to
    make the parse incremental.
    
    By default, the entire input is parsed. You can pass `ranges`,
    which should be a sorted array of non-empty, non-overlapping
    ranges, to parse only those ranges. The tree returned in that
    case will start at `ranges[0].from`.
    */
    startParse(input, fragments, ranges) {
      if (typeof input == "string")
        input = new StringInput(input);
      ranges = !ranges ? [new Range(0, input.length)] : ranges.length ? ranges.map((r) => new Range(r.from, r.to)) : [new Range(0, 0)];
      return this.createParse(input, fragments || [], ranges);
    }
    /**
    Run a full parse, returning the resulting tree.
    */
    parse(input, fragments, ranges) {
      let parse2 = this.startParse(input, fragments, ranges);
      for (; ; ) {
        let done = parse2.advance();
        if (done)
          return done;
      }
    }
  };
  var StringInput = class {
    constructor(string2) {
      this.string = string2;
    }
    get length() {
      return this.string.length;
    }
    chunk(from) {
      return this.string.slice(from);
    }
    get lineChunks() {
      return false;
    }
    read(from, to) {
      return this.string.slice(from, to);
    }
  };
  var stoppedInner = new NodeProp({ perNode: true });

  // node_modules/@lezer/highlight/dist/index.js
  var nextTagID = 0;
  var Tag = class _Tag {
    /**
    @internal
    */
    constructor(name2, set, base, modified) {
      this.name = name2;
      this.set = set;
      this.base = base;
      this.modified = modified;
      this.id = nextTagID++;
    }
    toString() {
      let { name: name2 } = this;
      for (let mod of this.modified)
        if (mod.name)
          name2 = `${mod.name}(${name2})`;
      return name2;
    }
    static define(nameOrParent, parent) {
      let name2 = typeof nameOrParent == "string" ? nameOrParent : "?";
      if (nameOrParent instanceof _Tag)
        parent = nameOrParent;
      if (parent === null || parent === void 0 ? void 0 : parent.base)
        throw new Error("Can not derive from a modified tag");
      let tag = new _Tag(name2, [], null, []);
      tag.set.push(tag);
      if (parent)
        for (let t2 of parent.set)
          tag.set.push(t2);
      return tag;
    }
    /**
    Define a tag _modifier_, which is a function that, given a tag,
    will return a tag that is a subtag of the original. Applying the
    same modifier to a twice tag will return the same value (`m1(t1)
    == m1(t1)`) and applying multiple modifiers will, regardless or
    order, produce the same tag (`m1(m2(t1)) == m2(m1(t1))`).
    
    When multiple modifiers are applied to a given base tag, each
    smaller set of modifiers is registered as a parent, so that for
    example `m1(m2(m3(t1)))` is a subtype of `m1(m2(t1))`,
    `m1(m3(t1)`, and so on.
    */
    static defineModifier(name2) {
      let mod = new Modifier(name2);
      return (tag) => {
        if (tag.modified.indexOf(mod) > -1)
          return tag;
        return Modifier.get(tag.base || tag, tag.modified.concat(mod).sort((a, b) => a.id - b.id));
      };
    }
  };
  var nextModifierID = 0;
  var Modifier = class _Modifier {
    constructor(name2) {
      this.name = name2;
      this.instances = [];
      this.id = nextModifierID++;
    }
    static get(base, mods) {
      if (!mods.length)
        return base;
      let exists = mods[0].instances.find((t2) => t2.base == base && sameArray(mods, t2.modified));
      if (exists)
        return exists;
      let set = [], tag = new Tag(base.name, set, base, mods);
      for (let m of mods)
        m.instances.push(tag);
      let configs = powerSet(mods);
      for (let parent of base.set)
        if (!parent.modified.length)
          for (let config of configs)
            set.push(_Modifier.get(parent, config));
      return tag;
    }
  };
  function sameArray(a, b) {
    return a.length == b.length && a.every((x, i) => x == b[i]);
  }
  function powerSet(array) {
    let sets = [[]];
    for (let i = 0; i < array.length; i++) {
      for (let j = 0, e = sets.length; j < e; j++) {
        sets.push(sets[j].concat(array[i]));
      }
    }
    return sets.sort((a, b) => b.length - a.length);
  }
  function styleTags(spec) {
    let byName = /* @__PURE__ */ Object.create(null);
    for (let prop in spec) {
      let tags2 = spec[prop];
      if (!Array.isArray(tags2))
        tags2 = [tags2];
      for (let part of prop.split(" "))
        if (part) {
          let pieces = [], mode = 2, rest = part;
          for (let pos = 0; ; ) {
            if (rest == "..." && pos > 0 && pos + 3 == part.length) {
              mode = 1;
              break;
            }
            let m = /^"(?:[^"\\]|\\.)*?"|[^\/!]+/.exec(rest);
            if (!m)
              throw new RangeError("Invalid path: " + part);
            pieces.push(m[0] == "*" ? "" : m[0][0] == '"' ? JSON.parse(m[0]) : m[0]);
            pos += m[0].length;
            if (pos == part.length)
              break;
            let next = part[pos++];
            if (pos == part.length && next == "!") {
              mode = 0;
              break;
            }
            if (next != "/")
              throw new RangeError("Invalid path: " + part);
            rest = part.slice(pos);
          }
          let last = pieces.length - 1, inner = pieces[last];
          if (!inner)
            throw new RangeError("Invalid path: " + part);
          let rule = new Rule(tags2, mode, last > 0 ? pieces.slice(0, last) : null);
          byName[inner] = rule.sort(byName[inner]);
        }
    }
    return ruleNodeProp.add(byName);
  }
  var ruleNodeProp = new NodeProp({
    combine(a, b) {
      let cur, root, take;
      while (a || b) {
        if (!a || b && a.depth >= b.depth) {
          take = b;
          b = b.next;
        } else {
          take = a;
          a = a.next;
        }
        if (cur && cur.mode == take.mode && !take.context && !cur.context)
          continue;
        let copy = new Rule(take.tags, take.mode, take.context);
        if (cur)
          cur.next = copy;
        else
          root = copy;
        cur = copy;
      }
      return root;
    }
  });
  var Rule = class {
    constructor(tags2, mode, context, next) {
      this.tags = tags2;
      this.mode = mode;
      this.context = context;
      this.next = next;
    }
    get opaque() {
      return this.mode == 0;
    }
    get inherit() {
      return this.mode == 1;
    }
    sort(other) {
      if (!other || other.depth < this.depth) {
        this.next = other;
        return this;
      }
      other.next = this.sort(other.next);
      return other;
    }
    get depth() {
      return this.context ? this.context.length : 0;
    }
  };
  Rule.empty = new Rule([], 2, null);
  function tagHighlighter(tags2, options) {
    let map = /* @__PURE__ */ Object.create(null);
    for (let style of tags2) {
      if (!Array.isArray(style.tag))
        map[style.tag.id] = style.class;
      else
        for (let tag of style.tag)
          map[tag.id] = style.class;
    }
    let { scope, all = null } = options || {};
    return {
      style: (tags3) => {
        let cls = all;
        for (let tag of tags3) {
          for (let sub of tag.set) {
            let tagClass = map[sub.id];
            if (tagClass) {
              cls = cls ? cls + " " + tagClass : tagClass;
              break;
            }
          }
        }
        return cls;
      },
      scope
    };
  }
  function highlightTags(highlighters, tags2) {
    let result = null;
    for (let highlighter of highlighters) {
      let value = highlighter.style(tags2);
      if (value)
        result = result ? result + " " + value : value;
    }
    return result;
  }
  function highlightTree(tree, highlighter, putStyle, from = 0, to = tree.length) {
    let builder = new HighlightBuilder(from, Array.isArray(highlighter) ? highlighter : [highlighter], putStyle);
    builder.highlightRange(tree.cursor(), from, to, "", builder.highlighters);
    builder.flush(to);
  }
  var HighlightBuilder = class {
    constructor(at, highlighters, span) {
      this.at = at;
      this.highlighters = highlighters;
      this.span = span;
      this.class = "";
    }
    startSpan(at, cls) {
      if (cls != this.class) {
        this.flush(at);
        if (at > this.at)
          this.at = at;
        this.class = cls;
      }
    }
    flush(to) {
      if (to > this.at && this.class)
        this.span(this.at, to, this.class);
    }
    highlightRange(cursor, from, to, inheritedClass, highlighters) {
      let { type, from: start2, to: end } = cursor;
      if (start2 >= to || end <= from)
        return;
      if (type.isTop)
        highlighters = this.highlighters.filter((h) => !h.scope || h.scope(type));
      let cls = inheritedClass;
      let rule = getStyleTags(cursor) || Rule.empty;
      let tagCls = highlightTags(highlighters, rule.tags);
      if (tagCls) {
        if (cls)
          cls += " ";
        cls += tagCls;
        if (rule.mode == 1)
          inheritedClass += (inheritedClass ? " " : "") + tagCls;
      }
      this.startSpan(Math.max(from, start2), cls);
      if (rule.opaque)
        return;
      let mounted = cursor.tree && cursor.tree.prop(NodeProp.mounted);
      if (mounted && mounted.overlay) {
        let inner = cursor.node.enter(mounted.overlay[0].from + start2, 1);
        let innerHighlighters = this.highlighters.filter((h) => !h.scope || h.scope(mounted.tree.type));
        let hasChild3 = cursor.firstChild();
        for (let i = 0, pos = start2; ; i++) {
          let next = i < mounted.overlay.length ? mounted.overlay[i] : null;
          let nextPos = next ? next.from + start2 : end;
          let rangeFrom = Math.max(from, pos), rangeTo = Math.min(to, nextPos);
          if (rangeFrom < rangeTo && hasChild3) {
            while (cursor.from < rangeTo) {
              this.highlightRange(cursor, rangeFrom, rangeTo, inheritedClass, highlighters);
              this.startSpan(Math.min(rangeTo, cursor.to), cls);
              if (cursor.to >= nextPos || !cursor.nextSibling())
                break;
            }
          }
          if (!next || nextPos > to)
            break;
          pos = next.to + start2;
          if (pos > from) {
            this.highlightRange(inner.cursor(), Math.max(from, next.from + start2), Math.min(to, pos), "", innerHighlighters);
            this.startSpan(Math.min(to, pos), cls);
          }
        }
        if (hasChild3)
          cursor.parent();
      } else if (cursor.firstChild()) {
        if (mounted)
          inheritedClass = "";
        do {
          if (cursor.to <= from)
            continue;
          if (cursor.from >= to)
            break;
          this.highlightRange(cursor, from, to, inheritedClass, highlighters);
          this.startSpan(Math.min(to, cursor.to), cls);
        } while (cursor.nextSibling());
        cursor.parent();
      }
    }
  };
  function getStyleTags(node) {
    let rule = node.type.prop(ruleNodeProp);
    while (rule && rule.context && !node.matchContext(rule.context))
      rule = rule.next;
    return rule || null;
  }
  var t = Tag.define;
  var comment = t();
  var name = t();
  var typeName = t(name);
  var propertyName = t(name);
  var literal = t();
  var string = t(literal);
  var number = t(literal);
  var content = t();
  var heading = t(content);
  var keyword = t();
  var operator = t();
  var punctuation = t();
  var bracket = t(punctuation);
  var meta = t();
  var tags = {
    /**
    A comment.
    */
    comment,
    /**
    A line [comment](#highlight.tags.comment).
    */
    lineComment: t(comment),
    /**
    A block [comment](#highlight.tags.comment).
    */
    blockComment: t(comment),
    /**
    A documentation [comment](#highlight.tags.comment).
    */
    docComment: t(comment),
    /**
    Any kind of identifier.
    */
    name,
    /**
    The [name](#highlight.tags.name) of a variable.
    */
    variableName: t(name),
    /**
    A type [name](#highlight.tags.name).
    */
    typeName,
    /**
    A tag name (subtag of [`typeName`](#highlight.tags.typeName)).
    */
    tagName: t(typeName),
    /**
    A property or field [name](#highlight.tags.name).
    */
    propertyName,
    /**
    An attribute name (subtag of [`propertyName`](#highlight.tags.propertyName)).
    */
    attributeName: t(propertyName),
    /**
    The [name](#highlight.tags.name) of a class.
    */
    className: t(name),
    /**
    A label [name](#highlight.tags.name).
    */
    labelName: t(name),
    /**
    A namespace [name](#highlight.tags.name).
    */
    namespace: t(name),
    /**
    The [name](#highlight.tags.name) of a macro.
    */
    macroName: t(name),
    /**
    A literal value.
    */
    literal,
    /**
    A string [literal](#highlight.tags.literal).
    */
    string,
    /**
    A documentation [string](#highlight.tags.string).
    */
    docString: t(string),
    /**
    A character literal (subtag of [string](#highlight.tags.string)).
    */
    character: t(string),
    /**
    An attribute value (subtag of [string](#highlight.tags.string)).
    */
    attributeValue: t(string),
    /**
    A number [literal](#highlight.tags.literal).
    */
    number,
    /**
    An integer [number](#highlight.tags.number) literal.
    */
    integer: t(number),
    /**
    A floating-point [number](#highlight.tags.number) literal.
    */
    float: t(number),
    /**
    A boolean [literal](#highlight.tags.literal).
    */
    bool: t(literal),
    /**
    Regular expression [literal](#highlight.tags.literal).
    */
    regexp: t(literal),
    /**
    An escape [literal](#highlight.tags.literal), for example a
    backslash escape in a string.
    */
    escape: t(literal),
    /**
    A color [literal](#highlight.tags.literal).
    */
    color: t(literal),
    /**
    A URL [literal](#highlight.tags.literal).
    */
    url: t(literal),
    /**
    A language keyword.
    */
    keyword,
    /**
    The [keyword](#highlight.tags.keyword) for the self or this
    object.
    */
    self: t(keyword),
    /**
    The [keyword](#highlight.tags.keyword) for null.
    */
    null: t(keyword),
    /**
    A [keyword](#highlight.tags.keyword) denoting some atomic value.
    */
    atom: t(keyword),
    /**
    A [keyword](#highlight.tags.keyword) that represents a unit.
    */
    unit: t(keyword),
    /**
    A modifier [keyword](#highlight.tags.keyword).
    */
    modifier: t(keyword),
    /**
    A [keyword](#highlight.tags.keyword) that acts as an operator.
    */
    operatorKeyword: t(keyword),
    /**
    A control-flow related [keyword](#highlight.tags.keyword).
    */
    controlKeyword: t(keyword),
    /**
    A [keyword](#highlight.tags.keyword) that defines something.
    */
    definitionKeyword: t(keyword),
    /**
    A [keyword](#highlight.tags.keyword) related to defining or
    interfacing with modules.
    */
    moduleKeyword: t(keyword),
    /**
    An operator.
    */
    operator,
    /**
    An [operator](#highlight.tags.operator) that dereferences something.
    */
    derefOperator: t(operator),
    /**
    Arithmetic-related [operator](#highlight.tags.operator).
    */
    arithmeticOperator: t(operator),
    /**
    Logical [operator](#highlight.tags.operator).
    */
    logicOperator: t(operator),
    /**
    Bit [operator](#highlight.tags.operator).
    */
    bitwiseOperator: t(operator),
    /**
    Comparison [operator](#highlight.tags.operator).
    */
    compareOperator: t(operator),
    /**
    [Operator](#highlight.tags.operator) that updates its operand.
    */
    updateOperator: t(operator),
    /**
    [Operator](#highlight.tags.operator) that defines something.
    */
    definitionOperator: t(operator),
    /**
    Type-related [operator](#highlight.tags.operator).
    */
    typeOperator: t(operator),
    /**
    Control-flow [operator](#highlight.tags.operator).
    */
    controlOperator: t(operator),
    /**
    Program or markup punctuation.
    */
    punctuation,
    /**
    [Punctuation](#highlight.tags.punctuation) that separates
    things.
    */
    separator: t(punctuation),
    /**
    Bracket-style [punctuation](#highlight.tags.punctuation).
    */
    bracket,
    /**
    Angle [brackets](#highlight.tags.bracket) (usually `<` and `>`
    tokens).
    */
    angleBracket: t(bracket),
    /**
    Square [brackets](#highlight.tags.bracket) (usually `[` and `]`
    tokens).
    */
    squareBracket: t(bracket),
    /**
    Parentheses (usually `(` and `)` tokens). Subtag of
    [bracket](#highlight.tags.bracket).
    */
    paren: t(bracket),
    /**
    Braces (usually `{` and `}` tokens). Subtag of
    [bracket](#highlight.tags.bracket).
    */
    brace: t(bracket),
    /**
    Content, for example plain text in XML or markup documents.
    */
    content,
    /**
    [Content](#highlight.tags.content) that represents a heading.
    */
    heading,
    /**
    A level 1 [heading](#highlight.tags.heading).
    */
    heading1: t(heading),
    /**
    A level 2 [heading](#highlight.tags.heading).
    */
    heading2: t(heading),
    /**
    A level 3 [heading](#highlight.tags.heading).
    */
    heading3: t(heading),
    /**
    A level 4 [heading](#highlight.tags.heading).
    */
    heading4: t(heading),
    /**
    A level 5 [heading](#highlight.tags.heading).
    */
    heading5: t(heading),
    /**
    A level 6 [heading](#highlight.tags.heading).
    */
    heading6: t(heading),
    /**
    A prose [content](#highlight.tags.content) separator (such as a horizontal rule).
    */
    contentSeparator: t(content),
    /**
    [Content](#highlight.tags.content) that represents a list.
    */
    list: t(content),
    /**
    [Content](#highlight.tags.content) that represents a quote.
    */
    quote: t(content),
    /**
    [Content](#highlight.tags.content) that is emphasized.
    */
    emphasis: t(content),
    /**
    [Content](#highlight.tags.content) that is styled strong.
    */
    strong: t(content),
    /**
    [Content](#highlight.tags.content) that is part of a link.
    */
    link: t(content),
    /**
    [Content](#highlight.tags.content) that is styled as code or
    monospace.
    */
    monospace: t(content),
    /**
    [Content](#highlight.tags.content) that has a strike-through
    style.
    */
    strikethrough: t(content),
    /**
    Inserted text in a change-tracking format.
    */
    inserted: t(),
    /**
    Deleted text.
    */
    deleted: t(),
    /**
    Changed text.
    */
    changed: t(),
    /**
    An invalid or unsyntactic element.
    */
    invalid: t(),
    /**
    Metadata or meta-instruction.
    */
    meta,
    /**
    [Metadata](#highlight.tags.meta) that applies to the entire
    document.
    */
    documentMeta: t(meta),
    /**
    [Metadata](#highlight.tags.meta) that annotates or adds
    attributes to a given syntactic element.
    */
    annotation: t(meta),
    /**
    Processing instruction or preprocessor directive. Subtag of
    [meta](#highlight.tags.meta).
    */
    processingInstruction: t(meta),
    /**
    [Modifier](#highlight.Tag^defineModifier) that indicates that a
    given element is being defined. Expected to be used with the
    various [name](#highlight.tags.name) tags.
    */
    definition: Tag.defineModifier("definition"),
    /**
    [Modifier](#highlight.Tag^defineModifier) that indicates that
    something is constant. Mostly expected to be used with
    [variable names](#highlight.tags.variableName).
    */
    constant: Tag.defineModifier("constant"),
    /**
    [Modifier](#highlight.Tag^defineModifier) used to indicate that
    a [variable](#highlight.tags.variableName) or [property
    name](#highlight.tags.propertyName) is being called or defined
    as a function.
    */
    function: Tag.defineModifier("function"),
    /**
    [Modifier](#highlight.Tag^defineModifier) that can be applied to
    [names](#highlight.tags.name) to indicate that they belong to
    the language's standard environment.
    */
    standard: Tag.defineModifier("standard"),
    /**
    [Modifier](#highlight.Tag^defineModifier) that indicates a given
    [names](#highlight.tags.name) is local to some scope.
    */
    local: Tag.defineModifier("local"),
    /**
    A generic variant [modifier](#highlight.Tag^defineModifier) that
    can be used to tag language-specific alternative variants of
    some common tag. It is recommended for themes to define special
    forms of at least the [string](#highlight.tags.string) and
    [variable name](#highlight.tags.variableName) tags, since those
    come up a lot.
    */
    special: Tag.defineModifier("special")
  };
  for (let name2 in tags) {
    let val = tags[name2];
    if (val instanceof Tag)
      val.name = name2;
  }
  var classHighlighter = tagHighlighter([
    { tag: tags.link, class: "tok-link" },
    { tag: tags.heading, class: "tok-heading" },
    { tag: tags.emphasis, class: "tok-emphasis" },
    { tag: tags.strong, class: "tok-strong" },
    { tag: tags.keyword, class: "tok-keyword" },
    { tag: tags.atom, class: "tok-atom" },
    { tag: tags.bool, class: "tok-bool" },
    { tag: tags.url, class: "tok-url" },
    { tag: tags.labelName, class: "tok-labelName" },
    { tag: tags.inserted, class: "tok-inserted" },
    { tag: tags.deleted, class: "tok-deleted" },
    { tag: tags.literal, class: "tok-literal" },
    { tag: tags.string, class: "tok-string" },
    { tag: tags.number, class: "tok-number" },
    { tag: [tags.regexp, tags.escape, tags.special(tags.string)], class: "tok-string2" },
    { tag: tags.variableName, class: "tok-variableName" },
    { tag: tags.local(tags.variableName), class: "tok-variableName tok-local" },
    { tag: tags.definition(tags.variableName), class: "tok-variableName tok-definition" },
    { tag: tags.special(tags.variableName), class: "tok-variableName2" },
    { tag: tags.definition(tags.propertyName), class: "tok-propertyName tok-definition" },
    { tag: tags.typeName, class: "tok-typeName" },
    { tag: tags.namespace, class: "tok-namespace" },
    { tag: tags.className, class: "tok-className" },
    { tag: tags.macroName, class: "tok-macroName" },
    { tag: tags.propertyName, class: "tok-propertyName" },
    { tag: tags.operator, class: "tok-operator" },
    { tag: tags.comment, class: "tok-comment" },
    { tag: tags.meta, class: "tok-meta" },
    { tag: tags.invalid, class: "tok-invalid" },
    { tag: tags.punctuation, class: "tok-punctuation" }
  ]);

  // node_modules/@lezer/lr/dist/index.js
  var Stack = class _Stack {
    /**
    @internal
    */
    constructor(p, stack, state, reducePos, pos, score, buffer, bufferBase, curContext, lookAhead = 0, parent) {
      this.p = p;
      this.stack = stack;
      this.state = state;
      this.reducePos = reducePos;
      this.pos = pos;
      this.score = score;
      this.buffer = buffer;
      this.bufferBase = bufferBase;
      this.curContext = curContext;
      this.lookAhead = lookAhead;
      this.parent = parent;
    }
    /**
    @internal
    */
    toString() {
      return `[${this.stack.filter((_, i) => i % 3 == 0).concat(this.state)}]@${this.pos}${this.score ? "!" + this.score : ""}`;
    }
    // Start an empty stack
    /**
    @internal
    */
    static start(p, state, pos = 0) {
      let cx = p.parser.context;
      return new _Stack(p, [], state, pos, pos, 0, [], 0, cx ? new StackContext(cx, cx.start) : null, 0, null);
    }
    /**
    The stack's current [context](#lr.ContextTracker) value, if
    any. Its type will depend on the context tracker's type
    parameter, or it will be `null` if there is no context
    tracker.
    */
    get context() {
      return this.curContext ? this.curContext.context : null;
    }
    // Push a state onto the stack, tracking its start position as well
    // as the buffer base at that point.
    /**
    @internal
    */
    pushState(state, start2) {
      this.stack.push(this.state, start2, this.bufferBase + this.buffer.length);
      this.state = state;
    }
    // Apply a reduce action
    /**
    @internal
    */
    reduce(action) {
      var _a;
      let depth = action >> 19, type = action & 65535;
      let { parser: parser2 } = this.p;
      let lookaheadRecord = this.reducePos < this.pos - 25 && this.setLookAhead(this.pos);
      let dPrec = parser2.dynamicPrecedence(type);
      if (dPrec)
        this.score += dPrec;
      if (depth == 0) {
        if (type < parser2.minRepeatTerm && this.reducePos < this.pos)
          this.reducePos = this.pos;
        this.pushState(parser2.getGoto(this.state, type, true), this.reducePos);
        if (type < parser2.minRepeatTerm)
          this.storeNode(type, this.reducePos, this.reducePos, lookaheadRecord ? 8 : 4, true);
        this.reduceContext(type, this.reducePos);
        return;
      }
      let base = this.stack.length - (depth - 1) * 3 - (action & 262144 ? 6 : 0);
      let start2 = base ? this.stack[base - 2] : this.p.ranges[0].from;
      if (type < parser2.minRepeatTerm && start2 == this.reducePos && this.reducePos < this.pos)
        this.reducePos = this.pos;
      let size = this.reducePos - start2;
      if (size >= 2e3 && !((_a = this.p.parser.nodeSet.types[type]) === null || _a === void 0 ? void 0 : _a.isAnonymous)) {
        if (start2 == this.p.lastBigReductionStart) {
          this.p.bigReductionCount++;
          this.p.lastBigReductionSize = size;
        } else if (this.p.lastBigReductionSize < size) {
          this.p.bigReductionCount = 1;
          this.p.lastBigReductionStart = start2;
          this.p.lastBigReductionSize = size;
        }
      }
      let bufferBase = base ? this.stack[base - 1] : 0, count = this.bufferBase + this.buffer.length - bufferBase;
      if (type < parser2.minRepeatTerm || action & 131072) {
        let pos = parser2.stateFlag(
          this.state,
          1
          /* StateFlag.Skipped */
        ) ? this.pos : this.reducePos;
        this.storeNode(type, start2, pos, count + 4, true);
      }
      if (action & 262144) {
        this.state = this.stack[base];
      } else {
        let baseStateID = this.stack[base - 3];
        this.state = parser2.getGoto(baseStateID, type, true);
      }
      while (this.stack.length > base)
        this.stack.pop();
      this.reduceContext(type, start2);
    }
    // Shift a value into the buffer
    /**
    @internal
    */
    storeNode(term, start2, end, size = 4, mustSink = false) {
      if (term == 0 && (!this.stack.length || this.stack[this.stack.length - 1] < this.buffer.length + this.bufferBase)) {
        let top = this.buffer.length;
        if (top > 0 && this.buffer[top - 4] == 0 && this.buffer[top - 1] > -1) {
          if (start2 == end)
            return;
          if (this.buffer[top - 2] >= start2) {
            this.buffer[top - 2] = end;
            return;
          }
        }
      }
      if (!mustSink || this.pos == end) {
        this.buffer.push(term, start2, end, size);
      } else {
        let index = this.buffer.length;
        if (index > 0 && (this.buffer[index - 4] != 0 || this.buffer[index - 1] < 0)) {
          let mustMove = false;
          for (let scan = index; scan > 0 && this.buffer[scan - 2] > end; scan -= 4) {
            if (this.buffer[scan - 1] >= 0) {
              mustMove = true;
              break;
            }
          }
          if (mustMove)
            while (index > 0 && this.buffer[index - 2] > end) {
              this.buffer[index] = this.buffer[index - 4];
              this.buffer[index + 1] = this.buffer[index - 3];
              this.buffer[index + 2] = this.buffer[index - 2];
              this.buffer[index + 3] = this.buffer[index - 1];
              index -= 4;
              if (size > 4)
                size -= 4;
            }
        }
        this.buffer[index] = term;
        this.buffer[index + 1] = start2;
        this.buffer[index + 2] = end;
        this.buffer[index + 3] = size;
      }
    }
    // Apply a shift action
    /**
    @internal
    */
    shift(action, type, start2, end) {
      if (action & 131072) {
        this.pushState(action & 65535, this.pos);
      } else if ((action & 262144) == 0) {
        let nextState = action, { parser: parser2 } = this.p;
        this.pos = end;
        let skipped = parser2.stateFlag(
          nextState,
          1
          /* StateFlag.Skipped */
        );
        if (!skipped && (end > start2 || type <= parser2.maxNode))
          this.reducePos = end;
        this.pushState(nextState, skipped ? start2 : Math.min(start2, this.reducePos));
        this.shiftContext(type, start2);
        if (type <= parser2.maxNode)
          this.buffer.push(type, start2, end, 4);
      } else {
        this.pos = end;
        this.shiftContext(type, start2);
        if (type <= this.p.parser.maxNode)
          this.buffer.push(type, start2, end, 4);
      }
    }
    // Apply an action
    /**
    @internal
    */
    apply(action, next, nextStart, nextEnd) {
      if (action & 65536)
        this.reduce(action);
      else
        this.shift(action, next, nextStart, nextEnd);
    }
    // Add a prebuilt (reused) node into the buffer.
    /**
    @internal
    */
    useNode(value, next) {
      let index = this.p.reused.length - 1;
      if (index < 0 || this.p.reused[index] != value) {
        this.p.reused.push(value);
        index++;
      }
      let start2 = this.pos;
      this.reducePos = this.pos = start2 + value.length;
      this.pushState(next, start2);
      this.buffer.push(
        index,
        start2,
        this.reducePos,
        -1
        /* size == -1 means this is a reused value */
      );
      if (this.curContext)
        this.updateContext(this.curContext.tracker.reuse(this.curContext.context, value, this, this.p.stream.reset(this.pos - value.length)));
    }
    // Split the stack. Due to the buffer sharing and the fact
    // that `this.stack` tends to stay quite shallow, this isn't very
    // expensive.
    /**
    @internal
    */
    split() {
      let parent = this;
      let off = parent.buffer.length;
      if (off && parent.buffer[off - 4] == 0)
        off -= 4;
      while (off > 0 && parent.buffer[off - 2] > parent.reducePos)
        off -= 4;
      let buffer = parent.buffer.slice(off), base = parent.bufferBase + off;
      while (parent && base == parent.bufferBase)
        parent = parent.parent;
      return new _Stack(this.p, this.stack.slice(), this.state, this.reducePos, this.pos, this.score, buffer, base, this.curContext, this.lookAhead, parent);
    }
    // Try to recover from an error by 'deleting' (ignoring) one token.
    /**
    @internal
    */
    recoverByDelete(next, nextEnd) {
      let isNode = next <= this.p.parser.maxNode;
      if (isNode)
        this.storeNode(next, this.pos, nextEnd, 4);
      this.storeNode(0, this.pos, nextEnd, isNode ? 8 : 4);
      this.pos = this.reducePos = nextEnd;
      this.score -= 190;
    }
    /**
    Check if the given term would be able to be shifted (optionally
    after some reductions) on this stack. This can be useful for
    external tokenizers that want to make sure they only provide a
    given token when it applies.
    */
    canShift(term) {
      for (let sim = new SimulatedStack(this); ; ) {
        let action = this.p.parser.stateSlot(
          sim.state,
          4
          /* ParseState.DefaultReduce */
        ) || this.p.parser.hasAction(sim.state, term);
        if (action == 0)
          return false;
        if ((action & 65536) == 0)
          return true;
        sim.reduce(action);
      }
    }
    // Apply up to Recover.MaxNext recovery actions that conceptually
    // inserts some missing token or rule.
    /**
    @internal
    */
    recoverByInsert(next) {
      if (this.stack.length >= 300)
        return [];
      let nextStates = this.p.parser.nextStates(this.state);
      if (nextStates.length > 4 << 1 || this.stack.length >= 120) {
        let best = [];
        for (let i = 0, s; i < nextStates.length; i += 2) {
          if ((s = nextStates[i + 1]) != this.state && this.p.parser.hasAction(s, next))
            best.push(nextStates[i], s);
        }
        if (this.stack.length < 120)
          for (let i = 0; best.length < 4 << 1 && i < nextStates.length; i += 2) {
            let s = nextStates[i + 1];
            if (!best.some((v, i2) => i2 & 1 && v == s))
              best.push(nextStates[i], s);
          }
        nextStates = best;
      }
      let result = [];
      for (let i = 0; i < nextStates.length && result.length < 4; i += 2) {
        let s = nextStates[i + 1];
        if (s == this.state)
          continue;
        let stack = this.split();
        stack.pushState(s, this.pos);
        stack.storeNode(0, stack.pos, stack.pos, 4, true);
        stack.shiftContext(nextStates[i], this.pos);
        stack.reducePos = this.pos;
        stack.score -= 200;
        result.push(stack);
      }
      return result;
    }
    // Force a reduce, if possible. Return false if that can't
    // be done.
    /**
    @internal
    */
    forceReduce() {
      let { parser: parser2 } = this.p;
      let reduce = parser2.stateSlot(
        this.state,
        5
        /* ParseState.ForcedReduce */
      );
      if ((reduce & 65536) == 0)
        return false;
      if (!parser2.validAction(this.state, reduce)) {
        let depth = reduce >> 19, term = reduce & 65535;
        let target = this.stack.length - depth * 3;
        if (target < 0 || parser2.getGoto(this.stack[target], term, false) < 0) {
          let backup = this.findForcedReduction();
          if (backup == null)
            return false;
          reduce = backup;
        }
        this.storeNode(0, this.pos, this.pos, 4, true);
        this.score -= 100;
      }
      this.reducePos = this.pos;
      this.reduce(reduce);
      return true;
    }
    /**
    Try to scan through the automaton to find some kind of reduction
    that can be applied. Used when the regular ForcedReduce field
    isn't a valid action. @internal
    */
    findForcedReduction() {
      let { parser: parser2 } = this.p, seen = [];
      let explore = (state, depth) => {
        if (seen.includes(state))
          return;
        seen.push(state);
        return parser2.allActions(state, (action) => {
          if (action & (262144 | 131072)) ;
          else if (action & 65536) {
            let rDepth = (action >> 19) - depth;
            if (rDepth > 1) {
              let term = action & 65535, target = this.stack.length - rDepth * 3;
              if (target >= 0 && parser2.getGoto(this.stack[target], term, false) >= 0)
                return rDepth << 19 | 65536 | term;
            }
          } else {
            let found = explore(action, depth + 1);
            if (found != null)
              return found;
          }
        });
      };
      return explore(this.state, 0);
    }
    /**
    @internal
    */
    forceAll() {
      while (!this.p.parser.stateFlag(
        this.state,
        2
        /* StateFlag.Accepting */
      )) {
        if (!this.forceReduce()) {
          this.storeNode(0, this.pos, this.pos, 4, true);
          break;
        }
      }
      return this;
    }
    /**
    Check whether this state has no further actions (assumed to be a direct descendant of the
    top state, since any other states must be able to continue
    somehow). @internal
    */
    get deadEnd() {
      if (this.stack.length != 3)
        return false;
      let { parser: parser2 } = this.p;
      return parser2.data[parser2.stateSlot(
        this.state,
        1
        /* ParseState.Actions */
      )] == 65535 && !parser2.stateSlot(
        this.state,
        4
        /* ParseState.DefaultReduce */
      );
    }
    /**
    Restart the stack (put it back in its start state). Only safe
    when this.stack.length == 3 (state is directly below the top
    state). @internal
    */
    restart() {
      this.storeNode(0, this.pos, this.pos, 4, true);
      this.state = this.stack[0];
      this.stack.length = 0;
    }
    /**
    @internal
    */
    sameState(other) {
      if (this.state != other.state || this.stack.length != other.stack.length)
        return false;
      for (let i = 0; i < this.stack.length; i += 3)
        if (this.stack[i] != other.stack[i])
          return false;
      return true;
    }
    /**
    Get the parser used by this stack.
    */
    get parser() {
      return this.p.parser;
    }
    /**
    Test whether a given dialect (by numeric ID, as exported from
    the terms file) is enabled.
    */
    dialectEnabled(dialectID) {
      return this.p.parser.dialect.flags[dialectID];
    }
    shiftContext(term, start2) {
      if (this.curContext)
        this.updateContext(this.curContext.tracker.shift(this.curContext.context, term, this, this.p.stream.reset(start2)));
    }
    reduceContext(term, start2) {
      if (this.curContext)
        this.updateContext(this.curContext.tracker.reduce(this.curContext.context, term, this, this.p.stream.reset(start2)));
    }
    /**
    @internal
    */
    emitContext() {
      let last = this.buffer.length - 1;
      if (last < 0 || this.buffer[last] != -3)
        this.buffer.push(this.curContext.hash, this.pos, this.pos, -3);
    }
    /**
    @internal
    */
    emitLookAhead() {
      let last = this.buffer.length - 1;
      if (last < 0 || this.buffer[last] != -4)
        this.buffer.push(this.lookAhead, this.pos, this.pos, -4);
    }
    updateContext(context) {
      if (context != this.curContext.context) {
        let newCx = new StackContext(this.curContext.tracker, context);
        if (newCx.hash != this.curContext.hash)
          this.emitContext();
        this.curContext = newCx;
      }
    }
    /**
    @internal
    */
    setLookAhead(lookAhead) {
      if (lookAhead <= this.lookAhead)
        return false;
      this.emitLookAhead();
      this.lookAhead = lookAhead;
      return true;
    }
    /**
    @internal
    */
    close() {
      if (this.curContext && this.curContext.tracker.strict)
        this.emitContext();
      if (this.lookAhead > 0)
        this.emitLookAhead();
    }
  };
  var StackContext = class {
    constructor(tracker, context) {
      this.tracker = tracker;
      this.context = context;
      this.hash = tracker.strict ? tracker.hash(context) : 0;
    }
  };
  var SimulatedStack = class {
    constructor(start2) {
      this.start = start2;
      this.state = start2.state;
      this.stack = start2.stack;
      this.base = this.stack.length;
    }
    reduce(action) {
      let term = action & 65535, depth = action >> 19;
      if (depth == 0) {
        if (this.stack == this.start.stack)
          this.stack = this.stack.slice();
        this.stack.push(this.state, 0, 0);
        this.base += 3;
      } else {
        this.base -= (depth - 1) * 3;
      }
      let goto = this.start.p.parser.getGoto(this.stack[this.base - 3], term, true);
      this.state = goto;
    }
  };
  var StackBufferCursor = class _StackBufferCursor {
    constructor(stack, pos, index) {
      this.stack = stack;
      this.pos = pos;
      this.index = index;
      this.buffer = stack.buffer;
      if (this.index == 0)
        this.maybeNext();
    }
    static create(stack, pos = stack.bufferBase + stack.buffer.length) {
      return new _StackBufferCursor(stack, pos, pos - stack.bufferBase);
    }
    maybeNext() {
      let next = this.stack.parent;
      if (next != null) {
        this.index = this.stack.bufferBase - next.bufferBase;
        this.stack = next;
        this.buffer = next.buffer;
      }
    }
    get id() {
      return this.buffer[this.index - 4];
    }
    get start() {
      return this.buffer[this.index - 3];
    }
    get end() {
      return this.buffer[this.index - 2];
    }
    get size() {
      return this.buffer[this.index - 1];
    }
    next() {
      this.index -= 4;
      this.pos -= 4;
      if (this.index == 0)
        this.maybeNext();
    }
    fork() {
      return new _StackBufferCursor(this.stack, this.pos, this.index);
    }
  };
  function decodeArray(input, Type = Uint16Array) {
    if (typeof input != "string")
      return input;
    let array = null;
    for (let pos = 0, out = 0; pos < input.length; ) {
      let value = 0;
      for (; ; ) {
        let next = input.charCodeAt(pos++), stop = false;
        if (next == 126) {
          value = 65535;
          break;
        }
        if (next >= 92)
          next--;
        if (next >= 34)
          next--;
        let digit = next - 32;
        if (digit >= 46) {
          digit -= 46;
          stop = true;
        }
        value += digit;
        if (stop)
          break;
        value *= 46;
      }
      if (array)
        array[out++] = value;
      else
        array = new Type(value);
    }
    return array;
  }
  var CachedToken = class {
    constructor() {
      this.start = -1;
      this.value = -1;
      this.end = -1;
      this.extended = -1;
      this.lookAhead = 0;
      this.mask = 0;
      this.context = 0;
    }
  };
  var nullToken = new CachedToken();
  var InputStream = class {
    /**
    @internal
    */
    constructor(input, ranges) {
      this.input = input;
      this.ranges = ranges;
      this.chunk = "";
      this.chunkOff = 0;
      this.chunk2 = "";
      this.chunk2Pos = 0;
      this.next = -1;
      this.token = nullToken;
      this.rangeIndex = 0;
      this.pos = this.chunkPos = ranges[0].from;
      this.range = ranges[0];
      this.end = ranges[ranges.length - 1].to;
      this.readNext();
    }
    /**
    @internal
    */
    resolveOffset(offset, assoc) {
      let range = this.range, index = this.rangeIndex;
      let pos = this.pos + offset;
      while (pos < range.from) {
        if (!index)
          return null;
        let next = this.ranges[--index];
        pos -= range.from - next.to;
        range = next;
      }
      while (assoc < 0 ? pos > range.to : pos >= range.to) {
        if (index == this.ranges.length - 1)
          return null;
        let next = this.ranges[++index];
        pos += next.from - range.to;
        range = next;
      }
      return pos;
    }
    /**
    @internal
    */
    clipPos(pos) {
      if (pos >= this.range.from && pos < this.range.to)
        return pos;
      for (let range of this.ranges)
        if (range.to > pos)
          return Math.max(pos, range.from);
      return this.end;
    }
    /**
    Look at a code unit near the stream position. `.peek(0)` equals
    `.next`, `.peek(-1)` gives you the previous character, and so
    on.
    
    Note that looking around during tokenizing creates dependencies
    on potentially far-away content, which may reduce the
    effectiveness incremental parsing—when looking forward—or even
    cause invalid reparses when looking backward more than 25 code
    units, since the library does not track lookbehind.
    */
    peek(offset) {
      let idx = this.chunkOff + offset, pos, result;
      if (idx >= 0 && idx < this.chunk.length) {
        pos = this.pos + offset;
        result = this.chunk.charCodeAt(idx);
      } else {
        let resolved = this.resolveOffset(offset, 1);
        if (resolved == null)
          return -1;
        pos = resolved;
        if (pos >= this.chunk2Pos && pos < this.chunk2Pos + this.chunk2.length) {
          result = this.chunk2.charCodeAt(pos - this.chunk2Pos);
        } else {
          let i = this.rangeIndex, range = this.range;
          while (range.to <= pos)
            range = this.ranges[++i];
          this.chunk2 = this.input.chunk(this.chunk2Pos = pos);
          if (pos + this.chunk2.length > range.to)
            this.chunk2 = this.chunk2.slice(0, range.to - pos);
          result = this.chunk2.charCodeAt(0);
        }
      }
      if (pos >= this.token.lookAhead)
        this.token.lookAhead = pos + 1;
      return result;
    }
    /**
    Accept a token. By default, the end of the token is set to the
    current stream position, but you can pass an offset (relative to
    the stream position) to change that.
    */
    acceptToken(token, endOffset = 0) {
      let end = endOffset ? this.resolveOffset(endOffset, -1) : this.pos;
      if (end == null || end < this.token.start)
        throw new RangeError("Token end out of bounds");
      this.token.value = token;
      this.token.end = end;
    }
    /**
    Accept a token ending at a specific given position.
    */
    acceptTokenTo(token, endPos) {
      this.token.value = token;
      this.token.end = endPos;
    }
    getChunk() {
      if (this.pos >= this.chunk2Pos && this.pos < this.chunk2Pos + this.chunk2.length) {
        let { chunk, chunkPos } = this;
        this.chunk = this.chunk2;
        this.chunkPos = this.chunk2Pos;
        this.chunk2 = chunk;
        this.chunk2Pos = chunkPos;
        this.chunkOff = this.pos - this.chunkPos;
      } else {
        this.chunk2 = this.chunk;
        this.chunk2Pos = this.chunkPos;
        let nextChunk = this.input.chunk(this.pos);
        let end = this.pos + nextChunk.length;
        this.chunk = end > this.range.to ? nextChunk.slice(0, this.range.to - this.pos) : nextChunk;
        this.chunkPos = this.pos;
        this.chunkOff = 0;
      }
    }
    readNext() {
      if (this.chunkOff >= this.chunk.length) {
        this.getChunk();
        if (this.chunkOff == this.chunk.length)
          return this.next = -1;
      }
      return this.next = this.chunk.charCodeAt(this.chunkOff);
    }
    /**
    Move the stream forward N (defaults to 1) code units. Returns
    the new value of [`next`](#lr.InputStream.next).
    */
    advance(n = 1) {
      this.chunkOff += n;
      while (this.pos + n >= this.range.to) {
        if (this.rangeIndex == this.ranges.length - 1)
          return this.setDone();
        n -= this.range.to - this.pos;
        this.range = this.ranges[++this.rangeIndex];
        this.pos = this.range.from;
      }
      this.pos += n;
      if (this.pos >= this.token.lookAhead)
        this.token.lookAhead = this.pos + 1;
      return this.readNext();
    }
    setDone() {
      this.pos = this.chunkPos = this.end;
      this.range = this.ranges[this.rangeIndex = this.ranges.length - 1];
      this.chunk = "";
      return this.next = -1;
    }
    /**
    @internal
    */
    reset(pos, token) {
      if (token) {
        this.token = token;
        token.start = pos;
        token.lookAhead = pos + 1;
        token.value = token.extended = -1;
      } else {
        this.token = nullToken;
      }
      if (this.pos != pos) {
        this.pos = pos;
        if (pos == this.end) {
          this.setDone();
          return this;
        }
        while (pos < this.range.from)
          this.range = this.ranges[--this.rangeIndex];
        while (pos >= this.range.to)
          this.range = this.ranges[++this.rangeIndex];
        if (pos >= this.chunkPos && pos < this.chunkPos + this.chunk.length) {
          this.chunkOff = pos - this.chunkPos;
        } else {
          this.chunk = "";
          this.chunkOff = 0;
        }
        this.readNext();
      }
      return this;
    }
    /**
    @internal
    */
    read(from, to) {
      if (from >= this.chunkPos && to <= this.chunkPos + this.chunk.length)
        return this.chunk.slice(from - this.chunkPos, to - this.chunkPos);
      if (from >= this.chunk2Pos && to <= this.chunk2Pos + this.chunk2.length)
        return this.chunk2.slice(from - this.chunk2Pos, to - this.chunk2Pos);
      if (from >= this.range.from && to <= this.range.to)
        return this.input.read(from, to);
      let result = "";
      for (let r of this.ranges) {
        if (r.from >= to)
          break;
        if (r.to > from)
          result += this.input.read(Math.max(r.from, from), Math.min(r.to, to));
      }
      return result;
    }
  };
  var TokenGroup = class {
    constructor(data, id) {
      this.data = data;
      this.id = id;
    }
    token(input, stack) {
      let { parser: parser2 } = stack.p;
      readToken(this.data, input, stack, this.id, parser2.data, parser2.tokenPrecTable);
    }
  };
  TokenGroup.prototype.contextual = TokenGroup.prototype.fallback = TokenGroup.prototype.extend = false;
  var LocalTokenGroup = class {
    constructor(data, precTable, elseToken) {
      this.precTable = precTable;
      this.elseToken = elseToken;
      this.data = typeof data == "string" ? decodeArray(data) : data;
    }
    token(input, stack) {
      let start2 = input.pos, skipped = 0;
      for (; ; ) {
        let atEof = input.next < 0, nextPos = input.resolveOffset(1, 1);
        readToken(this.data, input, stack, 0, this.data, this.precTable);
        if (input.token.value > -1)
          break;
        if (this.elseToken == null)
          return;
        if (!atEof)
          skipped++;
        if (nextPos == null)
          break;
        input.reset(nextPos, input.token);
      }
      if (skipped) {
        input.reset(start2, input.token);
        input.acceptToken(this.elseToken, skipped);
      }
    }
  };
  LocalTokenGroup.prototype.contextual = TokenGroup.prototype.fallback = TokenGroup.prototype.extend = false;
  var ExternalTokenizer = class {
    /**
    Create a tokenizer. The first argument is the function that,
    given an input stream, scans for the types of tokens it
    recognizes at the stream's position, and calls
    [`acceptToken`](#lr.InputStream.acceptToken) when it finds
    one.
    */
    constructor(token, options = {}) {
      this.token = token;
      this.contextual = !!options.contextual;
      this.fallback = !!options.fallback;
      this.extend = !!options.extend;
    }
  };
  function readToken(data, input, stack, group, precTable, precOffset) {
    let state = 0, groupMask = 1 << group, { dialect } = stack.p.parser;
    scan: for (; ; ) {
      if ((groupMask & data[state]) == 0)
        break;
      let accEnd = data[state + 1];
      for (let i = state + 3; i < accEnd; i += 2)
        if ((data[i + 1] & groupMask) > 0) {
          let term = data[i];
          if (dialect.allows(term) && (input.token.value == -1 || input.token.value == term || overrides(term, input.token.value, precTable, precOffset))) {
            input.acceptToken(term);
            break;
          }
        }
      let next = input.next, low = 0, high = data[state + 2];
      if (input.next < 0 && high > low && data[accEnd + high * 3 - 3] == 65535) {
        state = data[accEnd + high * 3 - 1];
        continue scan;
      }
      for (; low < high; ) {
        let mid = low + high >> 1;
        let index = accEnd + mid + (mid << 1);
        let from = data[index], to = data[index + 1] || 65536;
        if (next < from)
          high = mid;
        else if (next >= to)
          low = mid + 1;
        else {
          state = data[index + 2];
          input.advance();
          continue scan;
        }
      }
      break;
    }
  }
  function findOffset(data, start2, term) {
    for (let i = start2, next; (next = data[i]) != 65535; i++)
      if (next == term)
        return i - start2;
    return -1;
  }
  function overrides(token, prev, tableData, tableOffset) {
    let iPrev = findOffset(tableData, tableOffset, prev);
    return iPrev < 0 || findOffset(tableData, tableOffset, token) < iPrev;
  }
  var verbose = typeof process != "undefined" && process.env && /\bparse\b/.test(process.env.LOG);
  var stackIDs = null;
  function cutAt(tree, pos, side) {
    let cursor = tree.cursor(IterMode.IncludeAnonymous);
    cursor.moveTo(pos);
    for (; ; ) {
      if (!(side < 0 ? cursor.childBefore(pos) : cursor.childAfter(pos)))
        for (; ; ) {
          if ((side < 0 ? cursor.to < pos : cursor.from > pos) && !cursor.type.isError)
            return side < 0 ? Math.max(0, Math.min(
              cursor.to - 1,
              pos - 25
              /* Lookahead.Margin */
            )) : Math.min(tree.length, Math.max(
              cursor.from + 1,
              pos + 25
              /* Lookahead.Margin */
            ));
          if (side < 0 ? cursor.prevSibling() : cursor.nextSibling())
            break;
          if (!cursor.parent())
            return side < 0 ? 0 : tree.length;
        }
    }
  }
  var FragmentCursor = class {
    constructor(fragments, nodeSet) {
      this.fragments = fragments;
      this.nodeSet = nodeSet;
      this.i = 0;
      this.fragment = null;
      this.safeFrom = -1;
      this.safeTo = -1;
      this.trees = [];
      this.start = [];
      this.index = [];
      this.nextFragment();
    }
    nextFragment() {
      let fr = this.fragment = this.i == this.fragments.length ? null : this.fragments[this.i++];
      if (fr) {
        this.safeFrom = fr.openStart ? cutAt(fr.tree, fr.from + fr.offset, 1) - fr.offset : fr.from;
        this.safeTo = fr.openEnd ? cutAt(fr.tree, fr.to + fr.offset, -1) - fr.offset : fr.to;
        while (this.trees.length) {
          this.trees.pop();
          this.start.pop();
          this.index.pop();
        }
        this.trees.push(fr.tree);
        this.start.push(-fr.offset);
        this.index.push(0);
        this.nextStart = this.safeFrom;
      } else {
        this.nextStart = 1e9;
      }
    }
    // `pos` must be >= any previously given `pos` for this cursor
    nodeAt(pos) {
      if (pos < this.nextStart)
        return null;
      while (this.fragment && this.safeTo <= pos)
        this.nextFragment();
      if (!this.fragment)
        return null;
      for (; ; ) {
        let last = this.trees.length - 1;
        if (last < 0) {
          this.nextFragment();
          return null;
        }
        let top = this.trees[last], index = this.index[last];
        if (index == top.children.length) {
          this.trees.pop();
          this.start.pop();
          this.index.pop();
          continue;
        }
        let next = top.children[index];
        let start2 = this.start[last] + top.positions[index];
        if (start2 > pos) {
          this.nextStart = start2;
          return null;
        }
        if (next instanceof Tree) {
          if (start2 == pos) {
            if (start2 < this.safeFrom)
              return null;
            let end = start2 + next.length;
            if (end <= this.safeTo) {
              let lookAhead = next.prop(NodeProp.lookAhead);
              if (!lookAhead || end + lookAhead < this.fragment.to)
                return next;
            }
          }
          this.index[last]++;
          if (start2 + next.length >= Math.max(this.safeFrom, pos)) {
            this.trees.push(next);
            this.start.push(start2);
            this.index.push(0);
          }
        } else {
          this.index[last]++;
          this.nextStart = start2 + next.length;
        }
      }
    }
  };
  var TokenCache = class {
    constructor(parser2, stream) {
      this.stream = stream;
      this.tokens = [];
      this.mainToken = null;
      this.actions = [];
      this.tokens = parser2.tokenizers.map((_) => new CachedToken());
    }
    getActions(stack) {
      let actionIndex = 0;
      let main = null;
      let { parser: parser2 } = stack.p, { tokenizers } = parser2;
      let mask = parser2.stateSlot(
        stack.state,
        3
        /* ParseState.TokenizerMask */
      );
      let context = stack.curContext ? stack.curContext.hash : 0;
      let lookAhead = 0;
      for (let i = 0; i < tokenizers.length; i++) {
        if ((1 << i & mask) == 0)
          continue;
        let tokenizer = tokenizers[i], token = this.tokens[i];
        if (main && !tokenizer.fallback)
          continue;
        if (tokenizer.contextual || token.start != stack.pos || token.mask != mask || token.context != context) {
          this.updateCachedToken(token, tokenizer, stack);
          token.mask = mask;
          token.context = context;
        }
        if (token.lookAhead > token.end + 25)
          lookAhead = Math.max(token.lookAhead, lookAhead);
        if (token.value != 0) {
          let startIndex = actionIndex;
          if (token.extended > -1)
            actionIndex = this.addActions(stack, token.extended, token.end, actionIndex);
          actionIndex = this.addActions(stack, token.value, token.end, actionIndex);
          if (!tokenizer.extend) {
            main = token;
            if (actionIndex > startIndex)
              break;
          }
        }
      }
      while (this.actions.length > actionIndex)
        this.actions.pop();
      if (lookAhead)
        stack.setLookAhead(lookAhead);
      if (!main && stack.pos == this.stream.end) {
        main = new CachedToken();
        main.value = stack.p.parser.eofTerm;
        main.start = main.end = stack.pos;
        actionIndex = this.addActions(stack, main.value, main.end, actionIndex);
      }
      this.mainToken = main;
      return this.actions;
    }
    getMainToken(stack) {
      if (this.mainToken)
        return this.mainToken;
      let main = new CachedToken(), { pos, p } = stack;
      main.start = pos;
      main.end = Math.min(pos + 1, p.stream.end);
      main.value = pos == p.stream.end ? p.parser.eofTerm : 0;
      return main;
    }
    updateCachedToken(token, tokenizer, stack) {
      let start2 = this.stream.clipPos(stack.pos);
      tokenizer.token(this.stream.reset(start2, token), stack);
      if (token.value > -1) {
        let { parser: parser2 } = stack.p;
        for (let i = 0; i < parser2.specialized.length; i++)
          if (parser2.specialized[i] == token.value) {
            let result = parser2.specializers[i](this.stream.read(token.start, token.end), stack);
            if (result >= 0 && stack.p.parser.dialect.allows(result >> 1)) {
              if ((result & 1) == 0)
                token.value = result >> 1;
              else
                token.extended = result >> 1;
              break;
            }
          }
      } else {
        token.value = 0;
        token.end = this.stream.clipPos(start2 + 1);
      }
    }
    putAction(action, token, end, index) {
      for (let i = 0; i < index; i += 3)
        if (this.actions[i] == action)
          return index;
      this.actions[index++] = action;
      this.actions[index++] = token;
      this.actions[index++] = end;
      return index;
    }
    addActions(stack, token, end, index) {
      let { state } = stack, { parser: parser2 } = stack.p, { data } = parser2;
      for (let set = 0; set < 2; set++) {
        for (let i = parser2.stateSlot(
          state,
          set ? 2 : 1
          /* ParseState.Actions */
        ); ; i += 3) {
          if (data[i] == 65535) {
            if (data[i + 1] == 1) {
              i = pair(data, i + 2);
            } else {
              if (index == 0 && data[i + 1] == 2)
                index = this.putAction(pair(data, i + 2), token, end, index);
              break;
            }
          }
          if (data[i] == token)
            index = this.putAction(pair(data, i + 1), token, end, index);
        }
      }
      return index;
    }
  };
  var Parse = class {
    constructor(parser2, input, fragments, ranges) {
      this.parser = parser2;
      this.input = input;
      this.ranges = ranges;
      this.recovering = 0;
      this.nextStackID = 9812;
      this.minStackPos = 0;
      this.reused = [];
      this.stoppedAt = null;
      this.lastBigReductionStart = -1;
      this.lastBigReductionSize = 0;
      this.bigReductionCount = 0;
      this.stream = new InputStream(input, ranges);
      this.tokens = new TokenCache(parser2, this.stream);
      this.topTerm = parser2.top[1];
      let { from } = ranges[0];
      this.stacks = [Stack.start(this, parser2.top[0], from)];
      this.fragments = fragments.length && this.stream.end - from > parser2.bufferLength * 4 ? new FragmentCursor(fragments, parser2.nodeSet) : null;
    }
    get parsedPos() {
      return this.minStackPos;
    }
    // Move the parser forward. This will process all parse stacks at
    // `this.pos` and try to advance them to a further position. If no
    // stack for such a position is found, it'll start error-recovery.
    //
    // When the parse is finished, this will return a syntax tree. When
    // not, it returns `null`.
    advance() {
      let stacks = this.stacks, pos = this.minStackPos;
      let newStacks = this.stacks = [];
      let stopped, stoppedTokens;
      if (this.bigReductionCount > 300 && stacks.length == 1) {
        let [s] = stacks;
        while (s.forceReduce() && s.stack.length && s.stack[s.stack.length - 2] >= this.lastBigReductionStart) {
        }
        this.bigReductionCount = this.lastBigReductionSize = 0;
      }
      for (let i = 0; i < stacks.length; i++) {
        let stack = stacks[i];
        for (; ; ) {
          this.tokens.mainToken = null;
          if (stack.pos > pos) {
            newStacks.push(stack);
          } else if (this.advanceStack(stack, newStacks, stacks)) {
            continue;
          } else {
            if (!stopped) {
              stopped = [];
              stoppedTokens = [];
            }
            stopped.push(stack);
            let tok = this.tokens.getMainToken(stack);
            stoppedTokens.push(tok.value, tok.end);
          }
          break;
        }
      }
      if (!newStacks.length) {
        let finished = stopped && findFinished(stopped);
        if (finished) {
          if (verbose)
            console.log("Finish with " + this.stackID(finished));
          return this.stackToTree(finished);
        }
        if (this.parser.strict) {
          if (verbose && stopped)
            console.log("Stuck with token " + (this.tokens.mainToken ? this.parser.getName(this.tokens.mainToken.value) : "none"));
          throw new SyntaxError("No parse at " + pos);
        }
        if (!this.recovering)
          this.recovering = 5;
      }
      if (this.recovering && stopped) {
        let finished = this.stoppedAt != null && stopped[0].pos > this.stoppedAt ? stopped[0] : this.runRecovery(stopped, stoppedTokens, newStacks);
        if (finished) {
          if (verbose)
            console.log("Force-finish " + this.stackID(finished));
          return this.stackToTree(finished.forceAll());
        }
      }
      if (this.recovering) {
        let maxRemaining = this.recovering == 1 ? 1 : this.recovering * 3;
        if (newStacks.length > maxRemaining) {
          newStacks.sort((a, b) => b.score - a.score);
          while (newStacks.length > maxRemaining)
            newStacks.pop();
        }
        if (newStacks.some((s) => s.reducePos > pos))
          this.recovering--;
      } else if (newStacks.length > 1) {
        outer: for (let i = 0; i < newStacks.length - 1; i++) {
          let stack = newStacks[i];
          for (let j = i + 1; j < newStacks.length; j++) {
            let other = newStacks[j];
            if (stack.sameState(other) || stack.buffer.length > 500 && other.buffer.length > 500) {
              if ((stack.score - other.score || stack.buffer.length - other.buffer.length) > 0) {
                newStacks.splice(j--, 1);
              } else {
                newStacks.splice(i--, 1);
                continue outer;
              }
            }
          }
        }
        if (newStacks.length > 12) {
          newStacks.sort((a, b) => b.score - a.score);
          newStacks.splice(
            12,
            newStacks.length - 12
            /* Rec.MaxStackCount */
          );
        }
      }
      this.minStackPos = newStacks[0].pos;
      for (let i = 1; i < newStacks.length; i++)
        if (newStacks[i].pos < this.minStackPos)
          this.minStackPos = newStacks[i].pos;
      return null;
    }
    stopAt(pos) {
      if (this.stoppedAt != null && this.stoppedAt < pos)
        throw new RangeError("Can't move stoppedAt forward");
      this.stoppedAt = pos;
    }
    // Returns an updated version of the given stack, or null if the
    // stack can't advance normally. When `split` and `stacks` are
    // given, stacks split off by ambiguous operations will be pushed to
    // `split`, or added to `stacks` if they move `pos` forward.
    advanceStack(stack, stacks, split) {
      let start2 = stack.pos, { parser: parser2 } = this;
      let base = verbose ? this.stackID(stack) + " -> " : "";
      if (this.stoppedAt != null && start2 > this.stoppedAt)
        return stack.forceReduce() ? stack : null;
      if (this.fragments) {
        let strictCx = stack.curContext && stack.curContext.tracker.strict, cxHash = strictCx ? stack.curContext.hash : 0;
        for (let cached = this.fragments.nodeAt(start2); cached; ) {
          let match = this.parser.nodeSet.types[cached.type.id] == cached.type ? parser2.getGoto(stack.state, cached.type.id) : -1;
          if (match > -1 && cached.length && (!strictCx || (cached.prop(NodeProp.contextHash) || 0) == cxHash)) {
            stack.useNode(cached, match);
            if (verbose)
              console.log(base + this.stackID(stack) + ` (via reuse of ${parser2.getName(cached.type.id)})`);
            return true;
          }
          if (!(cached instanceof Tree) || cached.children.length == 0 || cached.positions[0] > 0)
            break;
          let inner = cached.children[0];
          if (inner instanceof Tree && cached.positions[0] == 0)
            cached = inner;
          else
            break;
        }
      }
      let defaultReduce = parser2.stateSlot(
        stack.state,
        4
        /* ParseState.DefaultReduce */
      );
      if (defaultReduce > 0) {
        stack.reduce(defaultReduce);
        if (verbose)
          console.log(base + this.stackID(stack) + ` (via always-reduce ${parser2.getName(
            defaultReduce & 65535
            /* Action.ValueMask */
          )})`);
        return true;
      }
      if (stack.stack.length >= 8400) {
        while (stack.stack.length > 6e3 && stack.forceReduce()) {
        }
      }
      let actions = this.tokens.getActions(stack);
      for (let i = 0; i < actions.length; ) {
        let action = actions[i++], term = actions[i++], end = actions[i++];
        let last = i == actions.length || !split;
        let localStack = last ? stack : stack.split();
        let main = this.tokens.mainToken;
        localStack.apply(action, term, main ? main.start : localStack.pos, end);
        if (verbose)
          console.log(base + this.stackID(localStack) + ` (via ${(action & 65536) == 0 ? "shift" : `reduce of ${parser2.getName(
            action & 65535
            /* Action.ValueMask */
          )}`} for ${parser2.getName(term)} @ ${start2}${localStack == stack ? "" : ", split"})`);
        if (last)
          return true;
        else if (localStack.pos > start2)
          stacks.push(localStack);
        else
          split.push(localStack);
      }
      return false;
    }
    // Advance a given stack forward as far as it will go. Returns the
    // (possibly updated) stack if it got stuck, or null if it moved
    // forward and was given to `pushStackDedup`.
    advanceFully(stack, newStacks) {
      let pos = stack.pos;
      for (; ; ) {
        if (!this.advanceStack(stack, null, null))
          return false;
        if (stack.pos > pos) {
          pushStackDedup(stack, newStacks);
          return true;
        }
      }
    }
    runRecovery(stacks, tokens, newStacks) {
      let finished = null, restarted = false;
      for (let i = 0; i < stacks.length; i++) {
        let stack = stacks[i], token = tokens[i << 1], tokenEnd = tokens[(i << 1) + 1];
        let base = verbose ? this.stackID(stack) + " -> " : "";
        if (stack.deadEnd) {
          if (restarted)
            continue;
          restarted = true;
          stack.restart();
          if (verbose)
            console.log(base + this.stackID(stack) + " (restarted)");
          let done = this.advanceFully(stack, newStacks);
          if (done)
            continue;
        }
        let force = stack.split(), forceBase = base;
        for (let j = 0; j < 10 && force.forceReduce(); j++) {
          if (verbose)
            console.log(forceBase + this.stackID(force) + " (via force-reduce)");
          let done = this.advanceFully(force, newStacks);
          if (done)
            break;
          if (verbose)
            forceBase = this.stackID(force) + " -> ";
        }
        for (let insert of stack.recoverByInsert(token)) {
          if (verbose)
            console.log(base + this.stackID(insert) + " (via recover-insert)");
          this.advanceFully(insert, newStacks);
        }
        if (this.stream.end > stack.pos) {
          if (tokenEnd == stack.pos) {
            tokenEnd++;
            token = 0;
          }
          stack.recoverByDelete(token, tokenEnd);
          if (verbose)
            console.log(base + this.stackID(stack) + ` (via recover-delete ${this.parser.getName(token)})`);
          pushStackDedup(stack, newStacks);
        } else if (!finished || finished.score < force.score) {
          finished = force;
        }
      }
      return finished;
    }
    // Convert the stack's buffer to a syntax tree.
    stackToTree(stack) {
      stack.close();
      return Tree.build({
        buffer: StackBufferCursor.create(stack),
        nodeSet: this.parser.nodeSet,
        topID: this.topTerm,
        maxBufferLength: this.parser.bufferLength,
        reused: this.reused,
        start: this.ranges[0].from,
        length: stack.pos - this.ranges[0].from,
        minRepeatType: this.parser.minRepeatTerm
      });
    }
    stackID(stack) {
      let id = (stackIDs || (stackIDs = /* @__PURE__ */ new WeakMap())).get(stack);
      if (!id)
        stackIDs.set(stack, id = String.fromCodePoint(this.nextStackID++));
      return id + stack;
    }
  };
  function pushStackDedup(stack, newStacks) {
    for (let i = 0; i < newStacks.length; i++) {
      let other = newStacks[i];
      if (other.pos == stack.pos && other.sameState(stack)) {
        if (newStacks[i].score < stack.score)
          newStacks[i] = stack;
        return;
      }
    }
    newStacks.push(stack);
  }
  var Dialect = class {
    constructor(source, flags, disabled) {
      this.source = source;
      this.flags = flags;
      this.disabled = disabled;
    }
    allows(term) {
      return !this.disabled || this.disabled[term] == 0;
    }
  };
  var LRParser = class _LRParser extends Parser {
    /**
    @internal
    */
    constructor(spec) {
      super();
      this.wrappers = [];
      if (spec.version != 14)
        throw new RangeError(`Parser version (${spec.version}) doesn't match runtime version (${14})`);
      let nodeNames = spec.nodeNames.split(" ");
      this.minRepeatTerm = nodeNames.length;
      for (let i = 0; i < spec.repeatNodeCount; i++)
        nodeNames.push("");
      let topTerms = Object.keys(spec.topRules).map((r) => spec.topRules[r][1]);
      let nodeProps = [];
      for (let i = 0; i < nodeNames.length; i++)
        nodeProps.push([]);
      function setProp(nodeID, prop, value) {
        nodeProps[nodeID].push([prop, prop.deserialize(String(value))]);
      }
      if (spec.nodeProps)
        for (let propSpec of spec.nodeProps) {
          let prop = propSpec[0];
          if (typeof prop == "string")
            prop = NodeProp[prop];
          for (let i = 1; i < propSpec.length; ) {
            let next = propSpec[i++];
            if (next >= 0) {
              setProp(next, prop, propSpec[i++]);
            } else {
              let value = propSpec[i + -next];
              for (let j = -next; j > 0; j--)
                setProp(propSpec[i++], prop, value);
              i++;
            }
          }
        }
      this.nodeSet = new NodeSet(nodeNames.map((name2, i) => NodeType.define({
        name: i >= this.minRepeatTerm ? void 0 : name2,
        id: i,
        props: nodeProps[i],
        top: topTerms.indexOf(i) > -1,
        error: i == 0,
        skipped: spec.skippedNodes && spec.skippedNodes.indexOf(i) > -1
      })));
      if (spec.propSources)
        this.nodeSet = this.nodeSet.extend(...spec.propSources);
      this.strict = false;
      this.bufferLength = DefaultBufferLength;
      let tokenArray = decodeArray(spec.tokenData);
      this.context = spec.context;
      this.specializerSpecs = spec.specialized || [];
      this.specialized = new Uint16Array(this.specializerSpecs.length);
      for (let i = 0; i < this.specializerSpecs.length; i++)
        this.specialized[i] = this.specializerSpecs[i].term;
      this.specializers = this.specializerSpecs.map(getSpecializer);
      this.states = decodeArray(spec.states, Uint32Array);
      this.data = decodeArray(spec.stateData);
      this.goto = decodeArray(spec.goto);
      this.maxTerm = spec.maxTerm;
      this.tokenizers = spec.tokenizers.map((value) => typeof value == "number" ? new TokenGroup(tokenArray, value) : value);
      this.topRules = spec.topRules;
      this.dialects = spec.dialects || {};
      this.dynamicPrecedences = spec.dynamicPrecedences || null;
      this.tokenPrecTable = spec.tokenPrec;
      this.termNames = spec.termNames || null;
      this.maxNode = this.nodeSet.types.length - 1;
      this.dialect = this.parseDialect();
      this.top = this.topRules[Object.keys(this.topRules)[0]];
    }
    createParse(input, fragments, ranges) {
      let parse2 = new Parse(this, input, fragments, ranges);
      for (let w of this.wrappers)
        parse2 = w(parse2, input, fragments, ranges);
      return parse2;
    }
    /**
    Get a goto table entry @internal
    */
    getGoto(state, term, loose = false) {
      let table = this.goto;
      if (term >= table[0])
        return -1;
      for (let pos = table[term + 1]; ; ) {
        let groupTag = table[pos++], last = groupTag & 1;
        let target = table[pos++];
        if (last && loose)
          return target;
        for (let end = pos + (groupTag >> 1); pos < end; pos++)
          if (table[pos] == state)
            return target;
        if (last)
          return -1;
      }
    }
    /**
    Check if this state has an action for a given terminal @internal
    */
    hasAction(state, terminal) {
      let data = this.data;
      for (let set = 0; set < 2; set++) {
        for (let i = this.stateSlot(
          state,
          set ? 2 : 1
          /* ParseState.Actions */
        ), next; ; i += 3) {
          if ((next = data[i]) == 65535) {
            if (data[i + 1] == 1)
              next = data[i = pair(data, i + 2)];
            else if (data[i + 1] == 2)
              return pair(data, i + 2);
            else
              break;
          }
          if (next == terminal || next == 0)
            return pair(data, i + 1);
        }
      }
      return 0;
    }
    /**
    @internal
    */
    stateSlot(state, slot) {
      return this.states[state * 6 + slot];
    }
    /**
    @internal
    */
    stateFlag(state, flag) {
      return (this.stateSlot(
        state,
        0
        /* ParseState.Flags */
      ) & flag) > 0;
    }
    /**
    @internal
    */
    validAction(state, action) {
      return !!this.allActions(state, (a) => a == action ? true : null);
    }
    /**
    @internal
    */
    allActions(state, action) {
      let deflt = this.stateSlot(
        state,
        4
        /* ParseState.DefaultReduce */
      );
      let result = deflt ? action(deflt) : void 0;
      for (let i = this.stateSlot(
        state,
        1
        /* ParseState.Actions */
      ); result == null; i += 3) {
        if (this.data[i] == 65535) {
          if (this.data[i + 1] == 1)
            i = pair(this.data, i + 2);
          else
            break;
        }
        result = action(pair(this.data, i + 1));
      }
      return result;
    }
    /**
    Get the states that can follow this one through shift actions or
    goto jumps. @internal
    */
    nextStates(state) {
      let result = [];
      for (let i = this.stateSlot(
        state,
        1
        /* ParseState.Actions */
      ); ; i += 3) {
        if (this.data[i] == 65535) {
          if (this.data[i + 1] == 1)
            i = pair(this.data, i + 2);
          else
            break;
        }
        if ((this.data[i + 2] & 65536 >> 16) == 0) {
          let value = this.data[i + 1];
          if (!result.some((v, i2) => i2 & 1 && v == value))
            result.push(this.data[i], value);
        }
      }
      return result;
    }
    /**
    Configure the parser. Returns a new parser instance that has the
    given settings modified. Settings not provided in `config` are
    kept from the original parser.
    */
    configure(config) {
      let copy = Object.assign(Object.create(_LRParser.prototype), this);
      if (config.props)
        copy.nodeSet = this.nodeSet.extend(...config.props);
      if (config.top) {
        let info = this.topRules[config.top];
        if (!info)
          throw new RangeError(`Invalid top rule name ${config.top}`);
        copy.top = info;
      }
      if (config.tokenizers)
        copy.tokenizers = this.tokenizers.map((t2) => {
          let found = config.tokenizers.find((r) => r.from == t2);
          return found ? found.to : t2;
        });
      if (config.specializers) {
        copy.specializers = this.specializers.slice();
        copy.specializerSpecs = this.specializerSpecs.map((s, i) => {
          let found = config.specializers.find((r) => r.from == s.external);
          if (!found)
            return s;
          let spec = Object.assign(Object.assign({}, s), { external: found.to });
          copy.specializers[i] = getSpecializer(spec);
          return spec;
        });
      }
      if (config.contextTracker)
        copy.context = config.contextTracker;
      if (config.dialect)
        copy.dialect = this.parseDialect(config.dialect);
      if (config.strict != null)
        copy.strict = config.strict;
      if (config.wrap)
        copy.wrappers = copy.wrappers.concat(config.wrap);
      if (config.bufferLength != null)
        copy.bufferLength = config.bufferLength;
      return copy;
    }
    /**
    Tells you whether any [parse wrappers](#lr.ParserConfig.wrap)
    are registered for this parser.
    */
    hasWrappers() {
      return this.wrappers.length > 0;
    }
    /**
    Returns the name associated with a given term. This will only
    work for all terms when the parser was generated with the
    `--names` option. By default, only the names of tagged terms are
    stored.
    */
    getName(term) {
      return this.termNames ? this.termNames[term] : String(term <= this.maxNode && this.nodeSet.types[term].name || term);
    }
    /**
    The eof term id is always allocated directly after the node
    types. @internal
    */
    get eofTerm() {
      return this.maxNode + 1;
    }
    /**
    The type of top node produced by the parser.
    */
    get topNode() {
      return this.nodeSet.types[this.top[1]];
    }
    /**
    @internal
    */
    dynamicPrecedence(term) {
      let prec = this.dynamicPrecedences;
      return prec == null ? 0 : prec[term] || 0;
    }
    /**
    @internal
    */
    parseDialect(dialect) {
      let values = Object.keys(this.dialects), flags = values.map(() => false);
      if (dialect)
        for (let part of dialect.split(" ")) {
          let id = values.indexOf(part);
          if (id >= 0)
            flags[id] = true;
        }
      let disabled = null;
      for (let i = 0; i < values.length; i++)
        if (!flags[i]) {
          for (let j = this.dialects[values[i]], id; (id = this.data[j++]) != 65535; )
            (disabled || (disabled = new Uint8Array(this.maxTerm + 1)))[id] = 1;
        }
      return new Dialect(dialect, flags, disabled);
    }
    /**
    Used by the output of the parser generator. Not available to
    user code. @hide
    */
    static deserialize(spec) {
      return new _LRParser(spec);
    }
  };
  function pair(data, off) {
    return data[off] | data[off + 1] << 16;
  }
  function findFinished(stacks) {
    let best = null;
    for (let stack of stacks) {
      let stopped = stack.p.stoppedAt;
      if ((stack.pos == stack.p.stream.end || stopped != null && stack.pos > stopped) && stack.p.parser.stateFlag(
        stack.state,
        2
        /* StateFlag.Accepting */
      ) && (!best || best.score < stack.score))
        best = stack;
    }
    return best;
  }
  function getSpecializer(spec) {
    if (spec.external) {
      let mask = spec.extend ? 1 : 0;
      return (value, stack) => spec.external(value, stack) << 1 | mask;
    }
    return spec.get;
  }

  // js/editor-src/beluga-parser.terms.js
  var BlockComment = 1;
  var ParameterSubstArg = 2;
  var ProofScript = 3;
  var NamedProjection = 4;
  var DottedIdent = 5;

  // js/editor-src/beluga-tokens.mjs
  var RESERVED = /* @__PURE__ */ new Set([
    46,
    44,
    58,
    59,
    37,
    124,
    34,
    92,
    40,
    41,
    91,
    93,
    123,
    125,
    60,
    62,
    8866
  ]);
  function isIdentContinue(ch) {
    return ch > 32 && ch !== 127 && !RESERVED.has(ch);
  }
  function isIdentStart(ch) {
    return isIdentContinue(ch) && !(ch >= 48 && ch <= 57) && ch !== 35 && ch !== 36;
  }
  var namedProjection = new ExternalTokenizer((input, stack) => {
    if (input.peek(0) !== 46) return;
    if (!isIdentStart(input.peek(1))) return;
    if (!stack.canShift(NamedProjection)) return;
    let i = 2;
    while (isIdentContinue(input.peek(i))) i += 1;
    input.acceptToken(NamedProjection, i);
  }, { contextual: true });
  var dottedIdent = new ExternalTokenizer((input, stack) => {
    if (input.peek(0) !== 46) return;
    if (!isIdentStart(input.peek(1))) return;
    if (stack.canShift(NamedProjection)) return;
    if (!stack.canShift(DottedIdent)) return;
    let i = 2;
    while (isIdentContinue(input.peek(i))) i += 1;
    input.acceptToken(DottedIdent, i);
  }, { contextual: true });
  var blockComment = new ExternalTokenizer((input) => {
    if (input.peek(0) !== 37 || input.peek(1) !== 123) return;
    let depth = 0;
    let i = 0;
    for (; ; ) {
      const c = input.peek(i);
      if (c < 0) break;
      if (c === 37 && input.peek(i + 1) === 123) {
        depth += 1;
        i += 2;
        continue;
      }
      if (c === 125 && input.peek(i + 1) === 37) {
        i += 2;
        depth -= 1;
        if (depth === 0) break;
        continue;
      }
      i += 1;
    }
    input.acceptToken(BlockComment, i);
  });
  function identLength(input) {
    const first = input.next;
    if (first < 0) return 0;
    const isUpper = first >= 65 && first <= 90;
    if (!isUpper && !isIdentStart(first)) return 0;
    let len = 1;
    while (isIdentContinue(input.peek(len))) len += 1;
    return len;
  }
  var parameterSubst = new ExternalTokenizer((input) => {
    const len = identLength(input);
    if (!len) return;
    if (input.peek(len) !== 91) return;
    if (input.peek(len + 1) !== 46 || input.peek(len + 2) !== 46) return;
    let end = len + 3;
    while (true) {
      const ch = input.peek(end);
      if (ch < 0) return;
      if (ch === 93) break;
      end += 1;
    }
    input.acceptToken(ParameterSubstArg, end + 1);
  }, { contextual: true });
  var proofScript = new ExternalTokenizer((input) => {
    let depth = 0;
    let len = 0;
    for (; ; ) {
      const ch = input.peek(len);
      if (ch < 0) break;
      if (ch === 123 || ch === 91 || ch === 40) depth += 1;
      else if (ch === 125 || ch === 93 || ch === 41) {
        if (depth === 0) break;
        depth -= 1;
      } else if (ch === 59 && depth === 0) break;
      len += 1;
    }
    if (len > 0) input.acceptToken(ProofScript, len);
  });

  // js/editor-src/beluga-parser.js
  var spec_UpperIdentifier = { __proto__: null, LF: 488, FN: 535 };
  var spec_LowerIdentifier = { __proto__: null, type: 490, _: 494, datatype: 497, and: 500, schema: 502, some: 504, block: 506, inductive: 508, ctype: 512, prop: 514, stratified: 516, coinductive: 518, typedef: 520, rec: 522, total: 524, trust: 526, fn: 528, fun: 530, mlam: 532, case: 536, of: 538, let: 540, in: 542, if: 544, then: 546, else: 548, impossible: 550, proof: 552, module: 554, struct: 556, end: 558, none: 561, left: 563, right: 565 };
  var parser = LRParser.deserialize({
    version: 14,
    states: "#%hQ]QqOOOOQP'#Cf'#CfO!|QqO'#CeO#UQqO'#CeOOQP'#Di'#DiO#ZQqO'#DhOOQP'#Do'#DoO#cQqO'#DnOOQP'#Dz'#DzOOQP'#Eq'#EqOOQP'#Er'#ErO#hQqO'#DyO#hQqO'#EuO#hQqO'#EvOOQP'#Ex'#ExO#pQqO'#EwOOQP'#Ez'#EzOOQP'#Fv'#FvO#xQqO'#EyO#}QqO'#GPOOQP'#GR'#GRO#hQqO'#GQOOQP'#GT'#GTO$SQqO'#GSO$XQqO'#GWO$XQqO'#GZO$XQqO'#G]O$XQqO'#G`O$XQqO'#GfO$XQqO'#GhO$aQqO'#GjO$lQqO'#GlO&fQqO'#GnOOQP'#Gp'#GpOOQP'#Gr'#GrO(`QqO'#GtOOQP'#Cd'#CdOOQP'#Gx'#GxQ]QqOOO(hQqO,59PO(pQqO,59PO)[QqO,5:SO)dQqO,5:YOOQP'#Hu'#HuO)iQqO'#D{O)nQqO,5:eO)vQqO,5;aO*OQqO'#EsO*TQqO,5;bO*]QqO,5;cO*bQqO'#E{O*gQqO,5;eO*oQqO,5<kO*wQqO,5<lO*|QqO,5<nO+RQ!RO'#GYO+mQqO,5<rO+rQqO,5<uO+zQqO,5<wO,SQqO,5<zO,eQqO,5=QO,mQqO,5=SOOQP'#Gc'#GcOOQP'#Gd'#GdOOQP'#Ge'#GeOOQP'#Gb'#GbO,uQqO,5=UOOQP,5=W,5=WOOQP,5=Y,5=YOOQP'#Gv'#GvO(`QqO,5=`OOQP-E:v-E:vO(pQqO1G.kO,zQqO1G/nOOQR'#Ck'#CkO.yQ!RO'#CnO/QQ!ZO'#CnOOQa'#DQ'#DQO/[QqO'#DOO/gQqO'#DROOQP'#Cn'#CnO/rQqO'#CnOOQP'#Cm'#CmO1OQqO'#ClO1xQqO1G.kO2ZQqO'#ClOOQP'#Cj'#CjO2cQqO1G.kO(pQqO1G/nO2hQqO1G/tO2rQqO,5:gOOQP'#Dm'#DmO3dQqO'#EpOOQP'#HW'#HWO3uQqO1G0POOQP1G0P1G0PO3}QqO1G0{OOQP1G0{1G0{O2rQqO,5;_O4VQqO1G0|OOQP1G0|1G0|O2rQqO1G0}O4_QqO,5;gO4yQqO'#GOOOQP'#Hf'#HfO5RQqO1G1POOQP1G1P1G1PO5ZQqO1G2VO4_QqO1G2VO4_QqO1G2WO6_QqO1G2YOOQa'#Gy'#GyO6dQ!RO,5<tOOQP1G2^1G2^O7OQqO1G2aOOQP'#G_'#G_O7TQqO1G2cOOQP1G2f1G2fO7`QqO1G2fO7eQqO1G2fOOQP1G2l1G2lO7sQqO1G2lOOQP1G2n1G2nO7xQqO1G2nOOQP1G2p1G2pO7}QqO1G2zO8XQqO7+$VO8jQqO7+$VO8rQqO'#DlO8wQqO'#HoO9SQqO'#HoO9[QqO7+%YO:hQ!RO,59ZO<rQqO'#CsOOQP,59Y,59YOOQX'#Hl'#HlOOQX'#Gz'#GzO>QQyO,59YO?xQyO,59jOOQP,59j,59jOAsQqO,59mOOQP,59m,59mOBjQqO,59YO2ZQqO'#ClOCOQ!RO'#C}ODrQ!ZO'#C}OD|QqO'#DVOOQP'#C}'#C}OD|QqO'#C}OEkQqO'#D^OD|QqO'#D[OOQP,59X,59XOOQP,59W,59WOOQP'#D`'#D`O(pQqO,59WOOQP7+$V7+$VOOQP'#Df'#DfOEpQqO,59WO1{QqO'#CjO8mQqO7+%YOEuQqO'#DqOOQP'#Ds'#DsOFZQqO'#DrOOQP'#Dv'#DvOF`QqO'#DuO2kQqO'#DqOOQP'#Dq'#DqOFhQqO'#DpOFpQqO7+%`OGsQ!RO'#EROOQP'#D}'#D}OOQP'#EO'#EOOHsQ!cO'#ESOIUQqO'#E[OIZQqO'#EbOOQP'#ER'#EROI`QqO'#EROOQP'#EQ'#EQOJ]QqO'#EPOKuQqO<<I]OLWQqO'#EPOOQP'#D|'#D|OLfQqO1G0ROOQP,5;[,5;[O#hQqO,5;[O#hQqO,5;[OOQP-E;U-E;UOOQP7+%k7+%kOOQP7+&g7+&gOLkQqO1G0yOOQP7+&h7+&hOLpQqO7+&iOI`QqO'#EROLuQqO1G1ROLWQqO'#EPOOQP,5<j,5<jO#xQqO,5<jOOQP-E;d-E;dOOQP7+&k7+&kONWQ!RO'#FWON_Q!cO'#EjO5ZQqO'#F[ONfQ!RO'#FWOOQP'#FW'#FWOOQP'#FV'#FVO! XQqO'#FUOOQP'#F^'#F^O! {QqO'#F]OOQa'#Fd'#FdO!!rQ!RO'#FcOOQP'#Fm'#FmOOQP'#Fn'#FnO!!yQqO'#FlOOQP'#Fq'#FqO5ZQqO'#FpO!!ZQqO'#FuOOQP'#Fy'#FyO5ZQqO'#FxOOQP'#F}'#F}ONmQqO'#F|OOQP'#FU'#FUO!#[QqO7+'qO!#dQqO7+'qO!#kQqO7+'rOOQP'#GU'#GUO!#rQqO7+'tOOQa-E:w-E:wOOQP7+'{7+'{OOQP7+'}7+'}O!#yQqO7+'}OOQP7+(Q7+(QO!$OQqO7+(QOOQP7+(W7+(WOOQP7+(Y7+(YO!%XQ!RO'#CnO!%`Q!ZO'#CnO!%jQqO7+(fO/rQqO7+(fOOQP<<Gq<<GqO,zQqO<<HtO/rQqO,5:WO9SQqO'#G}O!%{QqO,5>ZO!%{QqO,5>ZO!&WQqO'#HOO!&`QqO<<HtOOQP<<Ht<<HtOOQP'#Cu'#CuOOQP'#C|'#C|O!&hQqO'#C{OOQP'#C{'#C{OOQP'#Cz'#CzO!'kQqO'#CtOOQP,59_,59_O!'sQqO,59_OOQX-E:x-E:xO!)SQyO1G/UOOQP1G/U1G/UOOQP1G/X1G/XOOQP1G.t1G.tO/rQqO1G.tO/rQqO,59WO!)yQqO,59WOOQP,59i,59iO!+YQyO,59iO!+yQqO,59qO!,RQqO,59iO!,ZQqO,59xOOQP,59v,59vO!,`QqO1G.rOOQP1G.p1G.pO/rQqO1G.rO!,qQqO,5:^O!,|QqO'#DwO!-RQqO,5:aO!-^QqO,5:aO!-cQqO,5:]OOQP,5:],5:]O2hQqO'#HSO!-wQqO,5:[OOQP<<Hz<<HzO!.PQ!cO'#EUOOQP'#EU'#EUOOQP'#EW'#EWO!.yQ!cO'#ETO!/QQ!cO'#ETOOQP'#EX'#EXO/rQqO,5:nO!/XQ!cO,5:nO!/aQ!cO,5:vOHsQ!cO,5:|O!/kQ!RO'#ERO!/uQ!RO'#ERO!/|QqO'#DOO!0[QqO'#DRO!0jQqO'#ElO!0oQqO'#ElO!0tQqO,5:mO!0{QqO,5:kON_Q!cO'#EjO4_QqO'#EROOQP'#En'#EnOOQP,5:l,5:lO2rQqO,5:kO4_QqO,5:kO!1QQqO'#ElO!1VQqO'#ElO!1_QqO,5:kO!1dQqO7+%mOOQP1G0v1G0vO!1oQqO7+&eO4_QqO<<JTO!1}QqO,5:kO4_QqO,5:kO!2SQqO7+&mO!2ZQqO,5:kOOQP1G2U1G2UOOQc,5;U,5;UO!2`Q!cO,5;UOD|QqO,5;uO!2kQqO,5;vOOQa'#FY'#FYOOQP,5;s,5;sOOQP,5;q,5;qOOQP'#F_'#F_O!2vQqO,5;wO!3[QqO,5;wOLWQqO'#FfOOQa'#H_'#H_O!!WQ!RO'#FeO!3mQqO'#FiOOQa'#Fh'#FhOOQa'#Fg'#FgO!4RQ!RO'#FeO!4cQqO,5;}O!!WQ!RO,5;}OOQP'#Fo'#FoO!5TQqO,5<WO!5oQqO,5<WO!5yQqO,5<[O!!ZQqO,5<aOOQP'#Fk'#FkO!6RQqO'#FjO!6iQqO,5<aO!6qQqO,5<dO!6yQqO,5<hO4_QqO,5;pOOQP<<K]<<K]O5ZQqO<<K]O!7mQuO<<K^OOQP'#GV'#GVO!7rQqO<<K`O!#rQqO<<K`OOQP<<Ki<<KiOOQP<<Kl<<KlOOQP,5=c,5=cOOQP<<LQ<<LQO!7wQqO<<LQO!8YQqOAN>`O!8bQqO1G/rOOQP,5=i,5=iOOQP-E:{-E:{O!8yQqO1G3uO!9UQqO,5=jOOQP-E:|-E:|OOQPAN>`AN>`OOQP,59h,59hOOQP,59g,59gOD|QqO'#G{O!9^QqO,59`OOQP1G.y1G.yOOQP7+$p7+$pO!9fQqO7+$`O!9wQqO1G.rO/rQqO1G.rOOQP1G/T1G/TOD|QqO'#G|O!:hQqO1G/]OOQP1G/]1G/]O/rQqO1G/TOOQP1G/d1G/dO!:pQqO7+$^O!;RQqO'#DtOOQP1G/x1G/xO!;WQqO1G/xO/rQqO,5:cO!-^QqO'#HQO!;]QqO1G/{O!;hQqO1G/{OOQP,5=n,5=nOOQP-E;Q-E;QO!;pQ!cO,5:aO!<mQqO,5:rO!<tQqO,5:oO!<tQqO'#HTO!=PQ!cO,5:oO!=eQqO1G0YO/rQqO1G0YOOQP'#E^'#E^OOQP'#E]'#E]O;zQqO1G0bO!=vQ!cO1G0bO2kQqO1G0hO!/XQ!cO1G0hO!>UQqO,5;WO4_QqO,5;WO!>ZQqO,5;WO!>cQqO,5;WOOQP1G0X1G0XO!>nQqO1G0VO!2`Q!cO,5;UOOQP1G0S1G0SOOQP1G0V1G0VO!?OQqO'#EoO!?TQqO<<IXO#hQqO<<IXO!?`QqO'#EtO#hQqO'#EtO!?eQqO<<JPO!?pQqO<<JPO!?{QqOAN?oO!@SQqO1G0VO!@dQqO1G0VO!AgQqO'#E|O!AoQqO<<JXO5ZQqO<<JXOOQc1G0p1G0pOD|QqO1G1aO!AzQqO1G1aO!BPQ!RO1G1bO5ZQqO'#H[O!C^QqO1G1bO! {QqO1G1cOOQP'#F`'#F`OOQP'#H^'#H^OOQP-E;[-E;[O5ZQqO1G1cO!CfQqO,5<QOOQa-E;]-E;]O!4RQ!RO,5<PO!CkQqO,5<TOOQa'#Ha'#HaO!CvQ!RO'#HaO!4RQ!RO,5<PO5ZQqO,5<PO!!WQ!RO'#HbO!C}QqO1G1iO!C}QqO1G1iO!!yQqO1G1rOOQP'#Hd'#HdOOQP-E;b-E;bO5ZQqO1G1rOOQP'#Fr'#FrO!DoQqO1G1vO!DyQqO1G1{OOQP,5<V,5<VO4_QqO,5<UO5ZQqO1G1{OOQP'#Fz'#FzO5ZQqO1G2OO!ERQqO1G1[O!EuQqOAN@wO!E}QqOAN@xOOQPAN@zAN@zO!FSQqOAN@zOOQPANAlANAlO!FXQqOG23zOOQPG23zG23zO,zQqO1G3UO(pQqO1G3UOOQP,5=g,5=gOOQP-E:y-E:yOOQP<<Gz<<GzO!FaQqO7+$^OOQP,5=h,5=hOOQP-E:z-E:zOOQP7+$w7+$wO!FrQqO7+$oO!GTQqO<<GxO/rQqO,5:`OOQP7+%d7+%dO!GvQqO1G/}OOQP,5=l,5=lOOQP-E;O-E;OO!-^QqO'#HRO!HTQqO7+%gOOQP7+%g7+%gO!H]Q!cO1G/{O!JRQ!sO'#CnO!JYQ!{O'#CnO!JdQ!cO'#ClO!KQQ!cO1G0^OOQP1G0^1G0^O!KrQ!cO'#EVOOQP'#EV'#EVO!LZQ!cO1G0ZOOQP,5=o,5=oOOQP-E;R-E;ROOQR7+%t7+%tO!LoQqO7+%tOOQP'#Ea'#EaO!MQQqO7+%|O;zQqO7+%|O!MVQqO'#EcO!MhQqO'#EdOOQP'#Ec'#EcO!MpQqO7+&SO2kQqO7+&SOOQP1G0r1G0rO!MuQqO1G0rO2rQqO7+%qOOQP7+%n7+%nO4_QqO,5;ZO#hQqO'#HVO!NPQqOAN>sO!NPQqOAN>sO4_QqO,5;`O!N[QqO,5;`O!?pQqO'#HXO!NaQqOAN?kO!NaQqOAN?kOOQPG25ZG25ZO!NlQqO7+%qO4_QqO7+%qOOQP'#FO'#FOOOQP'#FT'#FTO# oQqO,5;hO#!TQqO,5;hO#!YQqOAN?sO#!eQqO7+&{OOQa7+&{7+&{OOQP7+&y7+&yO#!jQqO,5=vOOQP-E;Y-E;YOOQP7+&|7+&|O#!uQqO7+&}O##QQqO7+&}OOQa1G1l1G1lO!4RQ!RO1G1kO5ZQqO1G1kO!3mQqO'#H`O##rQqO1G1oOOQa1G1o1G1oOOQa,5={,5={OOQa-E;_-E;_O##zQqO1G1kOOQP,5=|,5=|OOQP-E;`-E;`O#$lQqO7+'TO#%^QqO7+'^O#%iQqO7+'^O#&ZQqO'#FsO!!ZQqO'#FtO#&lQqO'#FtO#&wQqO'#FsO!!ZQqO'#FsOOQP7+'b7+'bO5ZQqO7+'gO#'iQqO1G1pO#(PQqO7+'gO#(XQqO7+'jOOQPG26cG26cOOQPG26dG26dOOQPG26fG26fOOQPLD)fLD)fOOQP7+(p7+(pO#(aQqO7+(pO#(fQqO<<GxOOQP<<HZ<<HZO#(vQqOAN=dO(pQqOAN=dOOQPAN=bAN=bO#)XQqO1G/zOOQP,5=m,5=mOOQP-E;P-E;POOQP<<IR<<IRO#)mQ!cO1G/}O#*QQ!sO,59ZO#*bQ!kO,59YO#*rQ!kO,59jO#+SQ!cO,59mO#+dQ!sO'#C}O#,wQ!{O'#C}O#-RQ!cO7+%uOOQR<<I`<<I`OOQc<<Ih<<IhO#-gQqO<<IhO#-lQqO'#EeO#-qQqO,5;OO#-yQqO,5;OOOQR<<In<<InO#.OQqO<<InOOQP<<IY<<IYO#.TQqO1G0uOOQP,5=q,5=qOOQP-E;T-E;TO#.bQqOG24_O#.mQqO1G0zO4_QqO1G0zOOQP,5=s,5=sOOQP-E;V-E;VO#.tQqOG25VO#/PQqO<<I]O#0SQqO'#FROOQP'#FP'#FPO#0bQqO'#FPO#0jQqO'#FPO#0uQqO1G1SOOQP1G1S1G1SOOQa<<Jg<<JgO! {QqO'#H]O#!uQqO<<JiO5ZQqO<<JiO5ZQqO7+'VO#0zQqO7+'VO#1lQqO,5=zOOQP-E;^-E;^OOQa7+'Z7+'ZO!!yQqO'#HcO#%^QqO<<JxO5ZQqO<<JxOOQP,5<_,5<_O#&lQqO,5<`O5ZQqO,5<`O!!ZQqO'#HeO#1wQqO,5<_O#1wQqO,5<_O#(PQqO<<KROOQP'#Fw'#FwO5ZQqO<<KROOQP'#F{'#F{O5ZQqO<<KUO,zQqO<<L[O#2iQqOAN=dO/rQqOAN=dO#3YQqOG23OOOQPG22|G22|O#3kQqO'#HPO#3sQqO7+%fO#3{Q!kO1G/UO#4]Q!kO,59iO#5[Q!cO'#C{O#6OQ!cO1G.rOOQcAN?SAN?SO#6pQqO,5;PO#-yQqO'#HUO#7[QqO1G0jO#7dQqO1G0jOOQRAN?YAN?YO4_QqO7+&fO#7lQqO7+&fOOQP'#FS'#FSO#7sQqO,5;mOOQP,5;k,5;kOOQP'#HZ'#HZO#8UQqO,5;kOOQP7+&n7+&nOOQP,5=w,5=wOOQP-E;Z-E;ZO5ZQqOAN@TO#8dQqOAN@TO#9UQqO<<JqOOQP,5=},5=}OOQP-E;a-E;aO5ZQqOAN@dO#9vQqOAN@dO5ZQqO1G1zO#:hQqO1G1zOOQP,5>P,5>POOQP-E;c-E;cO#;YQqO1G1yO5ZQqOAN@mO#;zQqOAN@mO#<lQqOAN@pOOQPANAvANAvO#=^QqOG23OO#=}QqO,5=kOOQP-E:}-E:}OOQR'#Eh'#EhO#>SQqO'#EhOOQR'#Eg'#EgO#?PQsO'#EfO#@XQqO1G0kOLWQqO'#EfOOQP,5=p,5=pOOQP-E;S-E;SO#@fQqO7+&UOOQP7+&U7+&UO#@nQqO<<JQO#@{QqO<<JQOOQP'#HY'#HYO#AQQqO1G1XOOQP1G1X1G1XOOQP-E;X-E;XO#AcQqO1G1VO#AkQqOG25oO#B]QqOG26OO#B}QqO7+'fO#CoQqOG26XO/rQqO1G3VO#EbQsO'#EhO#DaQsO'#EhO#EiQqO,5;SO#EpQqO,5;QO#6pQqO'#EhOOQR'#Ei'#EiOOQR,5;R,5;RO#6pQqO,5;QO#6pQqO,5;QO#EuQqO,5;QOOQP<<Ip<<IpO4_QqOAN?lOOQP-E;W-E;WOOQP7+&s7+&sOOQP7+&q7+&qO#EzQqO7+(qO#F`Q!cOAN=dOOQR1G0n1G0nO#GQQqO1G0lO#GbQqO1G0lOOQP1G0l1G0lO#GoQqOG25WO#G|Q!cOG23OO#HnQqO7+&WO#6pQqO7+&WO#H{QqO<<IrO#IYQqO'#DOO#IeQqO'#DRO#4mQqO'#D[O#IpQqO'#DuO!<UQqO,59WO!<UQqO,5:cO#IxQqO<<GxO!<UQqOAN=dO#JYQqO'#DwO#J_QqO'#HQO#JdQqO7+$^O/rQqO1G.rO#JuQqO,59WO2ZQqO'#Cl",
    stateData: "#Kv~O&]OSUOSPOS~OZRO[RO${hO%OiO%QjO%TkO%ZlO%]mO%_nO%aoO%cpO%eqO%grO%isO&^PO&bSO&eUO&hWO&lXO&mYO&n^O&o`O&xaO'OdO'PfO~OZwO[wO~O]xO~OZyO[yO~O[zO~OZ{O[{O~OZ!RO[!RO~O[!SO~O[!UO~OZ!WO~OZ!XO[!XO~O'S!`O'T!aO'U!bO~O!P!eOZ%`X[%`X${%`X%O%`X%Q%`X%T%`X%Z%`X%]%`X%_%`X%a%`X%c%`X%e%`X%g%`X%i%`X&Z%`X&^%`X&b%`X&e%`X&h%`X&l%`X&m%`X&n%`X&o%`X&x%`X'O%`X'P%`X'R%`X~O!P!fOZ%bX[%bX${%bX%O%bX%Q%bX%T%bX%Z%bX%]%bX%_%bX%a%bX%c%bX%e%bX%g%bX%i%bX&Z%bX&^%bX&b%bX&e%bX&h%bX&l%bX&m%bX&n%bX&o%bX&x%bX'O%bX'P%bX'R%bX~O#_!gO#t!gO~O]!jO!^!kO~OZ!mO[!nOs!pOv!qO|!sO!X!wO&_!lO&a!oO~O]!zO!^!kO~O!^!{O~O]!|O~Oz#RO&d!}O~Oz#TO&d!}O~O]#UO~Oz#WO&d!}O~O]#XO~O]#YO~Oz#^O&d!}O~O]#`O!^#_O~O]#aO~O!^#bO~OT#cO!P$|XZ$|X[$|X#t$|X'S$|X'T$|X'U$|X~O!P#eO~OZ#fO[#fO~OZ#gO[#gO~O!P#iO#t#kO'S!`O'T!aO'U!bO~O!P#lO#t#mO~O!P#nO#t#oO~O!P#pO~OZ#tO[#tO!_#vOz&cP&d&cP~OT#cOZbX[bXsbXvbXxbX{bX|bX!PbX!RbX!TbX!UbX!VbX!WbX&abX]bX}bXzbX!lbX!_bX&dbX!ZbXebXmbX~Of#yO~P-]OS#{Od#{O~P-]OZ$QO[$OO&a!oO~OZ$QO[$QO&a!oO~OZ!mO[!nOs!pOv!qO|!sO!X$TO&a!oO~Ox$WO{$XO|$YO!R$ZO&a!oO!T`X!U`X!V`X!W`Xe`Xm`X~OZ$UO[$VOs!pOv!qO!P`X]`X}`Xz`X!l`X!_`X&d`X!Z`X~P0ZO!P$aO!T$_O!U$_O!V$_O!W$_O~OZ$bO[$bO~O!P$aO~O&f$gO&g$iO~P/rOZ$oO[$oOf$rOs$tOv$sO|$vO!X$zO&_!lO&j$pO&k$qO~OZ{O[{O&hWO&lXO&mYO~Oz%RO&d!}O~Oz%SO&d!}O~Oz%UO&d!}O~OZ$oO[$oOf$rOs$tOv$sO|%WO!X%YO&_!lO~O[!SO&o`O~Oz%^O&d!}O~OZ%_O[%_Of%`Os$tOv$sO{%cO|%aO&a!oO&r%fO&s%hO&t%jO&u%kO&v%mO&xaO&z%pO&}%rO~O'Q%xO~OT#cO!P$|aZ$|a[$|a#t$|a'S$|a'T$|a'U$|a~O!P%{O~OZ#gO[#gO!P%|O~O!P&OO~O!P&OO'S!`O'T!aO'U!bO~O!P&QO~O!P&RO~OZ&SO[&TO~P/xO!P&WO!T$_O!U$_O!V$_O!W$_O~O!P&WO!^&XO~O]&YO~O!_&ZOz&cX&d&cX~OZ#tO[#tO~Oz&`O&d!}O~OT#cOZca[cascavcaxca{ca|ca!Rca!Tca!Uca!Vca!Wca&acaecamca~O!Pca]ca}cazca!lcafca#_ca&_ca!^cawca&wca&{ca!_ca&dca!Zca&yca&|ca#aca$Tca$Uca~P9dOZ$UO[$VOj&aOk&aOl&aOs!pOv!qOx$WO{$XO|$YO!R$ZO&a!oO~Oe&gO~P;zOS#{Od#{OZba[basbavbaxba{ba|ba!Rba!Tba!Uba!Vba!Wba&abaebamba~O!Pba]ba}bazba!lba!_ba&dba!Zba~P<yOS#{Od#{Of#yOZra[rasravraxra{ra|ra!Rra!Tra!Ura!Vra!Wra&araeramra~O!Pra]ra}razra!lrawra$Tra$Ura!_ra&dra!Zra~P>nOf#yOZua[uasuavuaxua{ua|ua!Rua!Tua!Uua!Vua!Wua&auaeuamua~O!Pua]ua}uazua!luawua$Tua$Uua!_ua&dua!Zua~P@oO]&nO}&mO!T$_O!U$_O!V$_O!W$_O~OT#cOf#yOZqX[qXsqXvqXxqX{qX|qX!PqX!RqX!TqX!UqX!VqX!WqX&aqXeqXmqX]qX}qXwqXzqX!lqX!_qX&dqX!ZqX~OS#{Od#{O~PCOOZ$UO[$VOs!pOv!qOx$WO{$XO|$YO!R$ZO&a!oO~O[&uO~O]&yO~O!T$_O!U$_O!V$_O!W$_Oz!eX!l!eX~Of&zO~O[&{O|&}O~O!l'QOz!dX~Oz'SO~OT#cOZ!uX[!uXf!uXs!uXv!uX|!uX!T!uX!U!uX!V!uX!W!uX#_!uX&_!uX}!uX~O!^!uXz!uX]!uX!Z!uXm!uX&w!uX&{!uX!_!uX&d!uX#a!uX$T!uX$U!uX&y!uX&|!uX~PFuO['TO!|'YO!}'YO&a!oO&g$iO~Of']O~Of'^O~OZ'_O['`Of$rOs'aOv'bO|%WO!X%YO&_!lO~OZ$oO[$oOs$tOv$sO&_!lO~Of'gO|'hO!T!sX!U!sX!V!sX!W!sX#_!sX!^!sX}!sXz!sX]!sX!Z!sXm!sX&w!sX&{!sX!_!sX&d!sX#a!sX$T!sX$U!sX&y!sX&|!sX~PIzO!T$_O!U$_O!V$_O!W$_O#_'lO~OZ'nO['mOs!pOv!qO~O!^'pO~O!^'rO~O!^'sO~O!^'vO~PKuOZ#zX[#zX]#zXf#zXs#zXv#zXz#zX{#zX|#zX&a#zXm#zX}#zX&w#zX&{#zX&d#zX!_#zX&y#zX&|#zX~OT#cO~PL|Oe'yO~PHsOT'}O~PL|OZ%_O[%_Of%`Os$tOv$sO{%cO|%aO&a!oO~O]#xXz#xXm#xX}#xX&w#xX&{#xX&d#xX!_#xX&y#xX&|#xX~PNmOZ(QO[(QO&a!oO~OT'}OZ(XO[(XOf%`Ov$sO|(WO!X(TO&a!oO~O!_(]O~P!!WOZ(^O[(^Os!pOv!qO&a!oO~O](hOz(iO~O!^(jO~PKuO!^(kO~PKuO'R(lO~P]O!P(oO~O!P(pO~OT#cO](qOZbX[bXsbXvbXxbX{bX|bX!PbX!RbX!TbX!UbX!VbX!WbX&abX~Of#yO~P!$TOS#{Od#{O~P!$TO!P(rO!T$_O!U$_O!V$_O!W$_O~O!_&ZOz&ca&d&ca~OZ(yO[(yO~Oz({O&d!}O~OeoXmoXwoXzoX]oX}oX!PoX!ToX!UoX!VoX!WoX!loX!_oX&doX!ZoX~PD|Om)OOehX~Oe)QO~OS#{Od#{Of#yOZri[risrivrixri{ri|ri!Rri!Tri!Uri!Vri!Wri&arierimri~O!Pri]ri}rizri!lriwri$Tri$Uri!_ri&dri!Zri~P!'xO])UO~OS#{Od#{Of#yOZqa[qasqavqaxqa{qa|qa!Rqa!Tqa!Uqa!Vqa!Wqa&aqaeqamqa~O!Pqa]qa}qawqazqa!lqa!_qa&dqa!Zqa~P!*OOw)YOz)WO~O])ZO})VO~O!P)[O~O!T$_O!U$_O!V$_O!W$_O!P`i~OZ)^O[)^Oe)_O~O])aO~Om)bOz!ia!l!ia~O[&{O~O!T$_O!U$_O!V$_O!W$_Oz!ea!l!ea~O!l'QOz!da~O])hOm!xX!|!xX!}!xXe!xX#R!xX#S!xX~O!|!wX!}!wXe!wX#R!wX#S!wX~Om)iO~P!.hOm)jO~P!.hO!|'YO!}'YO~O#R)nO#S)nO~PHsO])uO#a)tO~PFuO])uO~PFuOZ$QO[$OOf'^O&a!oO~OZ$QO[$QOf']O&a!oO~O])vO~O])wO~O})xO~PKuO})yO~O])uO~O])uO#a)tO~O!Z)yO~OZ{O[{O!_*PO~OZ{O[{O|*RO!_*TO~O}*VO~O#q*XO~P5ZO!Z*VO~Oe*[O!|'YO!}'YO~O](hOm*`O}*_O~Om*bOZ&QX[&QX$T&QX$U&QX&a&QX~OZ(QO[(QO$T*cO$U*cO&a!oO~OZ(XO[(XOf%`Ov$sO|(WO&a!oO~OT'}Om*lO$T*cO$U*cO~P!3mO!_*oO]$Vaz$Vam$Va}$Va&w$Va&{$Va&d$Va&y$Va&|$Va~Om*rOZ&WX[&WXs&WXv&WX$T&WX$U&WX&a&WX~O$T*cO$U*cO~P!!yO](hO&w*vO~O]$^X!^$^Xm$^X}$^X$T$^X$U$^X~P!3mO]*zO!^*{O~O](hO&{*|O~O]$paz$pam$pa}$pa&w$pa&{$pa&d$pa!_$pa&y$pa&|$pa~PNmOR+QO~Oz+RO~O!P+TO!T$_O!U$_O!V$_O!W$_O~Oz+VO&d!}O~O!T$_O!U$_O!V$_O!W$_Oz!`i!_!`i&d!`i~O!_&ZOz&ci&d&ci~O]+XO!^+WO~Om)OOeha~O}+[O!T$_O!U$_O!V$_O!W$_O~O]`i}`iz`i!l`i!_`i&d`i!Z`ie`im`i~P!,`Ow+`Oz)WO~O!T$_O!U$_O!V$_O!W$_O!Z+bO~O]+cO~Oe+dO~Om)bOz!ii!l!ii~Om+hO}+jO~Om0}O!|!ia!}!iae!ia#R!ia#S!ia~OZ+lO[+mOs0tOv0uO|!sO!X1RO&a!oO~O&g$iO~P!<UO[+qO&a!oO&g$iO~Om)jO!|!wa!}!wae!wa#R!wa#S!wa~Oe+vO!T$_O!U$_O!V$_O!W$_O~O!|'YO!}'YO#R)nO#S)nO~Of$rO~Of$rOs$tO~Of$rOs$tOv$sO~O!T$_O!U$_O!V$_O!W$_O~P2rO],UO~O!_,VOz!oy&d!oy~O],YO~O!_,[Oz#gy&d#gy~OZ{O[{O|*RO~Oz,_O~PKuO!T$_O!U$_O!V$_O!W$_O~P4_O!^!si}!siz!si]!si!Z!sim!si&w!si&{!si!_!si&d!si#a!si$T!si$U!si&y!si&|!si~PKuO&p,bO&q,cO~O](hOz#oy&d#oy~Oe,hO~OT'}OZ$Oi[$Oi]$Oif$Ois$Oiv$Oiz$Oi{$Oi|$Oi&a$Oim$Oi}$Oi&w$Oi&{$Oi&d$Oi!_$Oi&y$Oi&|$Oi~Om*`O},lO~O!Z,oO~O]*zOm,rO},tO~OT'}O~P!3mO!_*oO]$Viz$Vim$Vi}$Vi&w$Vi&{$Vi&d$Vi&y$Vi&|$Vi~O!X,}O!_-RO~P!3mO]*zO!^-TO~O]#xiz#xim#xi}#xi&w#xi&{#xi&d#xi!_#xi&y#xi&|#xi~PKuO](hOz-XO~Oz-YO~Oz-ZO~Oz-[O&d!}O~O!T$_O!U$_O!V$_O!W$_O!Z-_O~O}-`O!T$_O!U$_O!V$_O!W$_O~O!T$_O!U$_O!V$_O!W$_O~P(pO!T$_O!U$_O!V$_O!W$_Om!ki~Oz!ki!l!ki}!ki~P!GeOm+hO}-gO~Om0}O!|!ii!}!iie!ii#R!ii#S!ii~OT#cOZbX[bXmbXsbXvbXxbX{bX|bX!RbX!TbX!UbX!VbX!WbX!|bX!}bX&abXebX#RbX#SbX~Of#yO~P!HqOS#{Od#{O~P!HqOZ-mO[-nOs0tOv0uO!|`X!}`X#R`X#S`X~P0ZO!T$_O!U$_O!V$_O!W$_Om!zi!|!zi!}!zie!zi#R!zi#S!zi~O])hOm!yX!|!yX!}!yXe!yX#R!yX#S!yX~Om)jO!|!wi!}!wie!wi#R!wi#S!wi~Oe-pO!T$_O!U$_O!V$_O!W$_O~Oe-qO~O!T$_O!U$_O!V$_O!W$_Oe#VX~O[-sO|-uO~Oe-vO~O}#`i!Z#`i~PKuO!_,VOz!o!R&d!o!R~O].OO~O!_,[Oz#g!R&d#g!R~O!^!sq}!sqz!sq]!sq!Z!sqm!sq&w!sq&{!sq!_!sq&d!sq#a!sq$T!sq$U!sq&y!sq&|!sq~PKuOZ.VO[.VO|.TO!X.WO#q.YO#t.UO~O#q.YO~O](hOz#o!R&d#o!R~Oe.ZO~O](hOm&Oa}&Oa~Om.[O$T*cO$U*cO~O](hOz$Pqm$Pq}$Pq&w$Pq&{$Pq&d$Pq!_$Pq&y$Pq&|$Pq~Om,rO}.cO~O](hOz$Xi!_$Xim$Xi}$Xi&w$Xi&{$Xi&d$Xi&y$Xi&|$Xi~O!_*oO]$Vqz$Vqm$Vq}$Vq&w$Vq&{$Vq&d$Vq&y$Vq&|$Vq~Om.dO$T*cO$U*cO~O](hOz$`qm$`q}$`q&w$`q&{$`q&d$`q!_$`q&y$`q&|$`q~OZ'nO['mOs!pOv!qO!Z.gO~O]*zO$T*cO$U*cO~O!_.jO]$gXz$gXm$gX}$gX&w$gX&{$gX&d$gX&y$gX&|$gX~O]$^i!^$^im$^i}$^i$T$^i$U$^i~PKuO](hO&y.nO~O](hO&|.pO~O!^.rO~O!T$_O!U$_O!V$_O!W$_O~P/rO!T$_O!U$_O!V$_O!W$_O!P`!R~Om.wO!T$_O!U$_O!V$_O!W$_Oe!hi~O!|!ki!}!kie!ki#R!ki#S!ki~P!GeO!|ca!}ca#Rca#Sca~P9dO!|ba!}ba#Rba#Sba~P<yO!|ra!}ra#Rra#Sra~P>nO!|ua!}ua#Rua#Sua~P@oOT#cOf#yOZqX[qXmqXsqXvqXxqX{qX|qX!RqX!TqX!UqX!VqX!WqX!|qX!}qX&aqXeqX#RqX#SqX~OS#{Od#{O~P#+dOm)jO!|!wq!}!wqe!wq#R!wq#S!wq~Oe.}O~O]/OO~Om/POe#Wa~O[-sO~Oe/SO~Oz#ci!_#ci&d#ci~PKuO!_,VOz!o!Z&d!o!Z~O#a/TO~PKuO!_,[Oz#g!Z&d#g!Z~O!^!sy}!syz!sy]!sy!Z!sym!sy&w!sy&{!sy!_!sy&d!sy#a!sy$T!sy$U!sy&y!sy&|!sy~PKuOZ/VO[/VO#t/VO&a!oO~O|.TO#q#sX~OZ/YO[/YO#t/YO~O#q/[O~O](hOz$Xq!_$Xqm$Xq}$Xq&w$Xq&{$Xq&d$Xq&y$Xq&|$Xq~O]*zOm&Sa}&Sa~O!_.jO]$gaz$gam$ga}$ga&w$ga&{$ga&d$ga&y$ga&|$ga~O]`!R}`!Rz`!R!l`!R!_`!R&d`!R!Z`!Re`!Rm`!R~P#(vO!T$_O!U$_O!V$_O!W$_O!P`!Z~OZ/pO[/pO~Om.wOe!hq~O!|ri!}ri#Rri#Sri~P!'xO!|qa!}qa#Rqa#Sqa~P!*OOZ-mO[-nOs0tOv0uOx$WO{$XO|$YO!R$ZO&a!oO~OmoX!ToX!UoX!VoX!WoX!|oX!}oXeoX#RoX#SoX~P#4mO!T$_O!U$_O!V$_O!W$_Om`i!|`i!}`ie`i#R`i#S`i~OZ/rO[/rOf$rOs$tOv$sO|/sO!X/wO&_!lO~Om/POe#Wi~Om/PO}/{O~O}/}O~PKuOZ/VO[/VO}0QO#t/VO&a!oO~OZ/YO[/YO!Z0SO#t/YO~O](hOz$P!Rm$P!R}$P!R&w$P!R&{$P!R&d$P!R!_$P!R&y$P!R&|$P!R~O](hOz$Xy!_$Xym$Xy}$Xy&w$Xy&{$Xy&d$Xy&y$Xy&|$Xy~O](hOz$`!Rm$`!R}$`!R&w$`!R&{$`!R&d$`!R!_$`!R&y$`!R&|$`!R~O](hOz$hi!_$him$hi}$hi&w$hi&{$hi&d$hi&y$hi&|$hi~O!_.jO]$giz$gim$gi}$gi&w$gi&{$gi&d$gi&y$gi&|$gi~O](hOz$i!Rm$i!R}$i!R&w$i!R&{$i!R&d$i!R!_$i!R&y$i!R&|$i!R~O](hOz$l!Rm$l!R}$l!R&w$l!R&{$l!R&d$l!R!_$l!R&y$l!R&|$l!R~O]`!Z}`!Zz`!Z!l`!Z!_`!Z&d`!Z!Z`!Ze`!Zm`!Z~P#3YO]0XO~OZ0YO[0ZOf$rOs'aOv'bO|/sO!X/wO&_!lO~OZ/rO[/rOs$tOv$sO&_!lO~OQ0_Of'gO|0^Oe#YXm#YX!T#YX!U#YX!V#YX!W#YX#_#YX}#YX~P#>nO!T$_O!U$_O!V$_O!W$_O#_0bO~Oe#Xim#Xi}#Xi~P#?vOm/PO}0dO~Oz#hy!_#hy&d#hy~PKuO#a0eO~OZ/VO[/VO}0gO#t/VO&a!oO~O|.TO#q#si~O](hOz$P!Zm$P!Z}$P!Z&w$P!Z&{$P!Z&d$P!Z!_$P!Z&y$P!Z&|$P!Z~O](hOz$`!Zm$`!Z}$`!Z&w$`!Z&{$`!Z&d$`!Z!_$`!Z&y$`!Z&|$`!Z~O](hOz$hq!_$hqm$hq}$hq&w$hq&{$hq&d$hq&y$hq&|$hq~O](hOz$i!Zm$i!Z}$i!Z&w$i!Z&{$i!Z&d$i!Z!_$i!Z&y$i!Z&|$i!Z~O])uOQ#[XZ#[X[#[Xf#[Xs#[Xv#[X|#[X}#[X!T#[X!U#[X!V#[X!W#[X#_#[X&_#[X~O#a)tO~P#DaO}0kO~P#?vO}0lO~O!Z0lO~O!T$_O!U$_O!V$_O!W$_Oe%sqm%sq~O!T$_O!U$_O!V$_O!W$_Om`!R!|`!R!}`!Re`!R#R`!R#S`!R~O!T$_O!U$_O!V$_O!W$_O~P#6pOe#Yim#Yi}#Yi~P#?vOz#h!Z!_#h!Z&d#h!Z~PKuO!T$_O!U$_O!V$_O!W$_Om`!Z!|`!Z!}`!Ze`!Z#R`!Z#S`!Z~Oe#Yqm#Yq}#Yq~P#?vOe#Yym#Yy}#Yy~P#?vOZ-lO[-kO&a!oO~OZ-lO[-lO&a!oO~O[0|O|&}O~O!T$_O!U$_O!V$_O!W$_O~P!<UO]0yO~O[0|O~O!T$_O!U$_O!V$_O!W$_O!Z0zO~O]1PO~OU%e%g%c%T%Z%]%_%Q%O%a${%i#R#S!T!U!V$T$U#akl!|!W!}d#t{j!l#_!^#q[Zxw!P&]#a~",
    goto: "!3r&jPPPPPPPP&k&q&wPPP&}'d(e*i+a,VPPP.j/V/^PPPP/c/k0U0e0zP2c5fPPP6}PPPP7`P7uP8YPPPPP:PP&q:YPP:`:l&q;O;U;X;_;c;g;j;}<bP&q<r<{=X=k=k=s?S?o@_A[AkArAxBTPPBmDlDrPPDvD|FhFnFrF{G`GiGuGxPISPIjImIvJOJXJbJh&q&q&qJq&qJwKQKZPK^KaPKdKmKtKwMfNU-zNv! X-z!!]!!x!#e!#qPP!!]!$e!%Q!%Z!%g!%x! w!&b!&v!!]!'Q!'Q!'m!!]!'y!(f!(i!(l!!]!(u!)h!!]!)n!*Z!*^!!]!*a!*|&q&q!+Q&q!+W!+^!+a&qP!+g&qP&qP!+y&qP!,P!,Y!,Y!,Y&qP&qP&qP&qP&qP&qP&qP&qP!,_!,e!,h!,r!-^!-y!.P!.V!.a!.k!.q!.{!/R!/X!/c!/m!/w!0V!0a!0g!0m!0s!0y!1P!1c!1i!1s!1}!2T!2Z!2ePPPPP!2kPP!2zPPPPP!3WXuOv%y(nXtOv%y(nXQOv%y(nQ!yxQ#s!jQ$e!zQ&x$`Q-^+XQ-c+bR.v-b^!xx!j!z$`+X+b-b!U$u!|#U#X#Y#`#a$v$x%W'h'k'l's'u(h)u)y*V*z,S,U,Y,a.O/T0ea/r/O/s/u0^0a0b0l0rQ!vxQ#r!jQ$S!sS$d!z+XS$f!{'QQ&U#qQ&w$`Q'O$kQ(s&VQ(u&YQ)S&nQ)T&oQ)]&yQ)l'ZQ+])UQ+a)ZQ+e)aQ+o)hQ+w)mS+{)r,PQ-a+bQ-d+cQ-h0yQ.s-_Q.u-bQ.|0xQ/o.tQ0i0XQ0j0zQ0p0{R1O1P![!ux!j!s!z!{#q$`$k&V&Y&n&o&y'Q'Z)U)Z)a)m)r+X+b+c,P-_-b.t0X1PZ+n)h0x0y0z0{!g!tx!j!s!z!{#q$`$k&V&Y&n&o&y'Q'Z)U)Z)a)h)m)r+X+b+c,P-_-b.t0X0x0y0z0{1P!f!rx!j!s!z!{#q$`$k&V&Y&n&o&y'Q'Z)U)Z)a)h)m)r+X+b+c,P-_-b.t0X0x0y0z0{1Pn$X!u#y$W$Y$[&c'{)O)W)p*]+n+z.{0v!U$u!|#U#X#Y#`#a$v$x%W'h'k'l's'u(h)u)y*V*z,S,U,Y,a.O/T0e!Z%c#_%a%e%n%q%s'v(g(j*Z*`*f*n*u*{*},q-T.^._.f.i.o.q/_/d/f/kU#z!m&S+lS&k$O-kS&l$Q-lW&q$U$V-m-nS)R&j.yT)V&r.zQ&h#yT+x)p+zV&f#y)p+zU&f#y)p+zR+Y)OW&e#y)O)p+zQ&s$WQ&t$YS&v$[0vQ*^'{Q+^)WR,g*]d&c#y$W$Y$['{)O)W)p*]+zR.{0vS$]!u+nf&b#y$W$Y$['{)O)W)p*]+z0vT(|&c.{!f!rx!j!s!z!{#q$`$k&V&Y&n&o&y'Q'Z)U)Z)a)h)m)r+X+b+c,P-_-b.t0X0x0y0z0{1Pn$X!u#y$W$Y$[&c'{)O)W)p*]+n+z.{0v`'c$v$z%W%Y(T,}/s/wX(^%l(`*r.d!f!rx!j!s!z!{#q$`$k&V&Y&n&o&y'Q'Z)U)Z)a)h)m)r+X+b+c,P-_-b.t0X0x0y0z0{1PU$P!p'a0tU$R!q'b0un$X!u#y$W$Y$[&c'{)O)W)p*]+n+z.{0v!Y%c#_%a%e%n%q%s'v(g(j*Z*`*f*n*u*{*},q-T.^._.f.i.o.q/_/d/f/kY'U$r%`']'^'gW(Q%g(S*b.[t(X%i%o(V(W(Z(](b(d*i*l*m*o*w,p,r-O-R.jW(^%l(`*r.dS+r)i)jV/V.T/W0P!f!rx!j!s!z!{#q$`$k&V&Y&n&o&y'Q'Z)U)Z)a)h)m)r+X+b+c,P-_-b.t0X0x0y0z0{1Pn$X!u#y$W$Y$[&c'{)O)W)p*]+n+z.{0v`'d$v$z%W%Y(T,}/s/wX(^%l(`*r.do$X!u#y$W$Y$[&c'{)O)W)p*]+n+z.{0vS$^!u+nf&d#y$W$Y$['{)O)W)p*]+z0vT(}&c.{h$[!u#y$W$Y$[&c'{)O)W)p*]+zV0v+n.{0v[$`!v#r$d&w-a.ux&o$S$f&U'O(s(u)S)T)])l+]+a+e+w+{-d.s/o0i1OQ'k$yp'u%X%v%w'e*U*W+O,R,`-U-y-}.S/U/|0oQ,S)yQ,a*VQ-b+bQ.t-_Y0a/v0[0m0q0sQ0r0lY0x+o-h.|0j0pR0{0zQ$c!wQ&p$TR1Q1RXTOv%y(nW#u!k&X+W.rQ&]#vR(v&Z[#O}!O!Q#Q#S#VS#Z!T#]X&^#w&_(t+UXVOv%y(nR$n!{Q$m!{R)e'QT$k!{'QT$h!{'QR)`&zS$l!{'QQ'P$k^'V$r%`']'^'g)i)jR+p)hU$j!{$k'QS+|)r,Pa0w$r%`']'^'g)h)i)jQ&|$jQ)d&}Q)g0wS+f)b0}R-e+hWZOv%y(nR%O#OQ}ZQ!O[Q$}#OR'q%OQ$|!|Q%T#UQ%V#XQ){'kQ,T)yR-x,S]${!|#U#X'k)y,S[$y!|#U#X'k)y,SQ%X#YQ%v#`Q%w#aU'e$v%W'hQ)|'lQ*U'sQ*W'uQ+O(hQ,R)uQ,`*VQ-U*zQ-y,UQ-},YQ.S,aQ/U.OQ/|/TR0o0e!T$x!|#U#X#Y#`#a$v%W'h'k'l's'u(h)u)y*V*z,S,U,Y,a.O/T0e!S$w!|#U#X#Y#`#a$v%W'h'k'l's'u(h)u)y*V*z,S,U,Y,a.O/T0eR'i$x!U$u!|#U#X#Y#`#a$v$x%W'h'k'l's'u(h)u)y*V*z,S,U,Y,a.O/T0eU,Q)t)v)wa/r/O/s/u0^0a0b0l0rQ'[$rQ'z%`Q)q']Q)s'^R)z'gZ'W$r%`']'^'gQ+s)iR+t)jY'X$r%`']'^'gT+r)i)jS'Z$r'gQ'{%`S)m'[)zS)o'])qQ)r'^Q*]'zR,P)s!U$u!|#U#X#Y#`#a$v$x%W'h'k'l's'u(h)u)y*V*z,S,U,Y,a.O/T0e!Y%c#_%a%e%n%q%s'v(g(j*Z*`*f*n*u*{*},q-T.^._.f.i.o.q/_/d/f/kt(X%i%o(V(W(Z(](b(d*i*l*m*o*w,p,r-O-R.jQ,Q)wa/r/O/s/u0^0a0b0l0rQ)p']R+z)qT)o'])qQ+y)pR-r+z!U$u!|#U#X#Y#`#a$v$x%W'h'k'l's'u(h)u)y*V*z,S,U,Y,a.O/T0e!Y%c#_%a%e%n%q%s'v(g(j*Z*`*f*n*u*{*},q-T.^._.f.i.o.q/_/d/f/kS,Q)v)wa/r/O/s/u0^0a0b0l0rQ,O)rR-w,PT+})r,PQ-t+|Q/R-uR/x/PQ/v/OS0[/s0^Q0m0aQ0n0bQ0q0lR0s0r_/u/O/s0^0a0b0l0r^/t/O/s0^0a0b0l0rR0_/uR0`/u!Y%c#_%a%e%n%q%s'v(g(j*Z*`*f*n*u*{*},q-T.^._.f.i.o.q/_/d/f/kQ'i$xt(X%i%o(V(W(Z(](b(d*i*l*m*o*w,p,r-O-R.jR0_/uQ'f$vQ'o$zQ't%WQ'w%YS*g(T,}Q0]/sR0c/wR'j$xQ*O'pQ,X*PR-z,V]#P}!O!Q#Q#S#VW[Ov%y(nR%O#OW]Ov%y(nR%P#OQ!Q]R'q%PQ*S'rQ,^*TR.P,[X_Ov%y(nWbOv%y(nR%[#ZQ!TbQ%Z#ZR'x%[R*Z'vR,d*XR.X,dQ.U,dQ/X.VR0h0SQ/W.TT0O/W0PR,e*XQ%u#_Q'|%aQ(a%nQ(f%qQ*Y'vQ+P(jQ,f*ZQ,j*`Q,n*fQ,w*nQ,|*uQ-V*{Q-W*}Q.`,qQ.m-TQ/`.^Q/a._Q/e.fQ/g.iQ/l.oQ/m.qQ0T/_Q0U/dQ0V/fR0W/k!S%e#_%a%n%q'v(j*Z*`*f*n*u*{*},q-T.^._.f.i.o.q/_/d/f/kR(g%s!U%d#_%a%n%q%s'v(j*Z*`*f*n*u*{*},q-T.^._.f.i.o.q/_/d/f/kT(P%e(gQ(O%bb(Y%i(V(Z(]*i*l*m*o,pR,i*_!Y%b#_%a%e%n%q%s'v(g(j*Z*`*f*n*u*{*},q-T.^._.f.i.o.q/_/d/f/ku(X%i%o(V(W(Z(](b(d*i*l*m*o*w,p,r-O-R.j!T%t#_%a%n%q'v(j*Z*`*f*n*u*{*},q-T.^._.f.i.o.q/_/d/f/k!T%g#_%a%n%q'v(j*Z*`*f*n*u*{*},q-T.^._.f.i.o.q/_/d/f/kQ(R%gQ*d(SQ,m*bR/].[Q*f(SQ*n(ZQ*u(`S,q*i*mQ.^,mQ._,pQ.f,{Q.i-PQ/_.]Q/d.eR/f.h!T%i#_%a%n%q'v(j*Z*`*f*n*u*{*},q-T.^._.f.i.o.q/_/d/f/kQ([%iQ*q(]R,x*oe(U%i%o(V(](b*o*w-O-R.jU(Z%i(]*oQ*i(VW*k(Z*i*m,pR,u*lb(Y%i(V(Z(]*i*l*m*o,p`(c%o(W(b*w,r-O-R.jR*y(dQ(e%oQ*j(WQ*x(bU-P*w-R.jQ.a,rR.h-Oa(d%o(W(b*w,r-O-R.j!T%l#_%a%n%q'v(j*Z*`*f*n*u*{*},q-T.^._.f.i.o.q/_/d/f/kQ(_%lQ*s(`Q,{*rR/b.d!T%n#_%a%n%q'v(j*Z*`*f*n*u*{*},q-T.^._.f.i.o.q/_/d/f/kR*w(aR-S*wQ-Q*wQ.l-RR/h.jWcOv%y(n!T%o#_%a%n%q'v(j*Z*`*f*n*u*{*},q-T.^._.f.i.o.q/_/d/f/kQ.o-VR/k.m!T%q#_%a%n%q'v(j*Z*`*f*n*u*{*},q-T.^._.f.i.o.q/_/d/f/kR*}(fR.q-W!T%s#_%a%n%q'v(j*Z*`*f*n*u*{*},q-T.^._.f.i.o.q/_/d/f/kT#[!T#]XeOv%y(nXgOv%y(nR%y#bQ(m%yR+S(nQ!YhQ!ZiQ![jQ!]kQ!^lR!_mQ#h![R%}#hQ!dnQ#j!]R&P#kV!cn!]#kQ!hsR#q!hR&V#qQvOS!iv(nR(n%yQ#d!Xd#x!m!n$U$V$o%_&S&T'_'`U%z#d#x-iX-i+l+m-m-nS#}!n&T[&i#}&j&r-j.y.zQ&j$OQ&r$VQ-j+mQ.y-kR.z-nQ)P&fR+Z)PQ)X&sR+_)XQ&[#uS(w&[(xR(x&]Q&_#wS(z&_+UR+U(tQ.x-dR/q.xQ)c&|S+g)c+kR+k)gQ+i)dR-f+iQ'R$mR)f'RQ)k'XS+u)k-oR-o+sQ/Q-tS/y/Q/zR/z/RQ,W*OS-{,W-|R-|,XQ#Q}Q#S!OQ#V!QV%Q#Q#S#VQ,]*SS.Q,].RR.R,^Q0P/WR0f0PQ/Z.WR0R/ZQ*a'|R,k*aQ.],mR/^.]Q(S%gR*e(SU(V%i(]*oQ(b%oU*h(V(b-OV-O*w-R.jQ,s*jR.b,sQ*m(ZQ,p*iT,v*m,pQ*p([S,y*p,zR,z*qQ.e,{R/c.eQ(`%lR*t(`Q.k-QS/i.k/jR/j.lQ#]!TR%]#]k#|!n#}$O$V&T&j&r+m-j-k-n.y.zQ#w!kQ(t&XQ-]+WR/n.rW|Z[#O%OS!P]%PQ!VeU)}'p*P,VU*Q'r*T,[R,Z*R",
    nodeNames: "\u26A0 BlockComment ParameterSubstArg ProofScript NamedProjection DottedIdent LineComment Program Declaration LFDeclaration LFKeyword UpperIdentifier LowerIdentifier : LFKind TypeKeyword LFType LFAppType LFAtomicType QualifiedConstant ProjectionTail ] [ Substitution SubstBody SubstHead ^ .. \u2026 , SubstElem LFTerm LFAppTerm LFAtomicTerm ParameterVariable # UnderscoreHole SubstitutionVariable $ > < Tuple ; Hole ( ) LFLambda . LFLambdaBinder \\ ArrowOp -> <- \u2190 \u2192 { PiBinder } LFDatatypeDeclaration DatatypeKeyword = | LFConstructor AndKeyword SchemaDeclaration SchemaKeyword SchemaBody SchemaElement SchemaSomeBlock SomeKeyword SchemaSomeBindings LFBlock BlockKeyword LFBlockField + InductiveDeclaration InductiveKeyword InductiveBody CompKind CTypeKeyword PropKeyword CompType CompAppType CompAtomicType ContextualType ContextPart ContextHead ContextTailEntry ContextEntry Turnstile |- \u22A2 SubstitutionType SubstTurnstile TurnstileHash |-# \u22A2# SubstBracketBody ParameterType ParameterTypeBody ParameterBlock ParameterBlockField ParameterFieldType ParameterFieldAppType ParameterFieldAtom ParameterFieldTypeArg ContextApplication * CompTypeBinder :: CompTypeArg CompConstructor DatatypeContinuation StratifiedKeyword CoinductiveKeyword CoinductiveBody CompDestructor StratifiedDeclaration CoinductiveDeclaration TypedefDeclaration TypedefKeyword RecDeclaration RecKeyword RecBody TotalityAnnotation / TotalKeyword TotalityMeasure Number TotalityCall TotalityArg TrustKeyword Expression AppExpression AtomicExpression DestructorApp Observation ContextualObject TupleOrParenExpression FnExpression FnKeyword FnParam FatArrow => \u21D2 CofunctionExpression FunKeyword CofunctionBranch QuantifiedBinder Copattern AtomicPattern TupleOrParenPattern Pattern AppPattern MLamExpression MLamKeyword FNKeyword MLamParam CaseExpression CaseKeyword OfKeyword CaseBody CaseBranch LetExpression LetKeyword InKeyword IfExpression IfKeyword ThenKeyword ElseKeyword ImpossibleExpression ImpossibleKeyword RecContinuation LetDeclaration ProofDeclaration ProofKeyword ModuleDeclaration ModuleKeyword StructKeyword EndKeyword OpenPragma --open PragmaName AbbrevPragma --abbrev NamePragma --name NamePreferred InfixPragma --infix Associativity NoneKeyword LeftKeyword RightKeyword PrefixPragma --prefix PostfixPragma --postfix AssocPragma --assoc NotPragma --not NoStrengthenPragma --nostrengthen CoveragePragma --coverage WarnCoveragePragma --warncoverage QueryPragma --query QueryBound QueryLabel",
    maxTerm: 282,
    nodeProps: [
      ["openedBy", 21, "[", 39, "<", 45, "(", 57, "{"],
      ["closedBy", 22, "]", 40, ">", 44, ")", 55, "}"]
    ],
    skippedNodes: [0, 1, 6],
    repeatNodeCount: 29,
    tokenData: "$/y~R!`X^%Tpq%Tqr%xst'itu'nuv'svx%xxy(|yz)Rz{)W{|*s|},`}!O,e!O!P#Lg!P!Q#MP!Q![#Nl![!]#Nt!]!^$ R!^!_$ W!_!`$ e!`!a$#Y!a!b$#_!b!c%x!c!}$%O!}#O$&o#O#P$&t#P#Q$&y#Q#R$'O#R#o%x#o#p$(k#p#q$(p#q#r$)V#r#s%x#t#y%x#y#z%T#z$f%x$f$g%T$g#BY%x#BY#BZ%T#BZ$IS%x$IS$I_%T$I_$Iz%x$Iz$I{$)[$I{$I|%x$I|$JO%T$JO$JT%x$JT$JU%T$JU$KV%x$KV$KW%T$KW%#t%x%#t%#u$*w%#u%#v%x%#v%#w$,d%#w%%Y%x%%Y%%Z$.P%%Z%)r%x%)r%)s$/l%)s&FU%x&FU&FV%T&FV;'S%x;'S;=`'c<%lO%x~%YY&]~X^%Tpq%T#y#z%T$f$g%T#BY#BZ%T$IS$I_%T$I|$JO%T$JT$JU%T$KV$KW%T&FU&FV%T~%}f[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~'fP;=`<%l%x~'nOs~~'sOv~~'vWOY(`YZ(wZu(`uv(`v#o(`#p;'S(`;'S;=`(q<%lO(`~(eSU~OY(`Z;'S(`;'S;=`(q<%lO(`~(tP;=`<%l(`~(|OU~~)RO|~~)WO}~~)_f#_~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~*zf!l~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~,eOm~~,jg[~qr%xsu%xvx%xz|%x}!O.R!P![%x!_!`%x!`!a#Lb!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~.Ws[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#T%x#T#U0e#U#V%x#V#WAV#W#]%x#]#^Ne#^#b%x#b#c!(r#c#d!Ce#d#e!JR#e#f#0T#f#k%x#k#l#8b#l#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~0jj[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#U%x#U#V2[#V#g%x#g#h:i#h#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~2ah[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#U%x#U#V3{#V#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~4Qh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#f%x#f#g5l#g#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~5qh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#X%x#X#Y7]#Y#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~7bh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#j%x#j#k8|#k#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~9Tf%O~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~:nh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#g%x#g#h<Y#h#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~<_h[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#c%x#c#d=y#d#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~>Oh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#V%x#V#W?j#W#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~?qf%_~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~A[h[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#c%x#c#dBv#d#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~B{h[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#j%x#j#kDg#k#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~Dlh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#X%x#X#YFW#Y#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~F]h[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#f%x#f#gGw#g#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~G|h[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#T%x#T#UIh#U#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~Imh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#Z%x#Z#[KX#[#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~K^h[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#X%x#X#YLx#Y#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~MPf%e~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~Njh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#b%x#b#c!!U#c#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!!Zh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#Y%x#Y#Z!#u#Z#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!#zh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#]%x#]#^!%f#^#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!%kh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#l%x#l#m!'V#m#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!'^f%T~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!(wj[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#T%x#T#U!*i#U#c%x#c#d!/f#d#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!*nh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#a%x#a#b!,Y#b#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!,_h[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#X%x#X#Y!-y#Y#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!.Qf%Q~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!/ki[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#g%x#g#h!1Y#h#i!Ax#i#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!1_h[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#h%x#h#i!2y#i#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!3Oh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#f%x#f#g!4j#g#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!4oh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#X%x#X#Y!6Z#Y#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!6`h[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#b%x#b#c!7z#c#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!8Ph[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#Z%x#Z#[!9k#[#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!9ph[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#h%x#h#i!;[#i#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!;ah[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#[%x#[#]!<{#]#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!=Qh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#X%x#X#Y!>l#Y#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!>qh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#b%x#b#c!@]#c#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!@df%c~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!BPf%a~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!Cjh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#d%x#d#e!EU#e#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!EZh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#X%x#X#Y!Fu#Y#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!Fzh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#b%x#b#c!Hf#c#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!Hmf${~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!JWj[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#c%x#c#d!Kx#d#f%x#f#g#'v#g#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!K}h[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#g%x#g#h!Mi#h#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~!Mnh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#h%x#h#i# Y#i#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~# _h[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#Y%x#Y#Z#!y#Z#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~##Oh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#]%x#]#^#$j#^#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#$oh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#l%x#l#m#&Z#m#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#&bf%]~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#'{h[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#X%x#X#Y#)g#Y#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#)lh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#Y%x#Y#Z#+W#Z#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#+]h[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#]%x#]#^#,w#^#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#,|h[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#l%x#l#m#.h#m#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#.of%Z~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#0Yh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#i%x#i#j#1t#j#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#1yh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#X%x#X#Y#3e#Y#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#3jh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#f%x#f#g#5U#g#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#5Zh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#m%x#m#n#6u#n#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#6|f%i~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#8gh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#T%x#T#U#:R#U#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#:Wh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#f%x#f#g#;r#g#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#;wh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#b%x#b#c#=c#c#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#=hh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#V%x#V#W#?S#W#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#?Xh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#c%x#c#d#@s#d#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#@xh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#j%x#j#k#Bd#k#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#Bih[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#X%x#X#Y#DT#Y#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#DYh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#f%x#f#g#Et#g#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#Eyh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#T%x#T#U#Ge#U#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#Gjh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#Z%x#Z#[#IU#[#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#IZh[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#X%x#X#Y#Ju#Y#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#J|f%g~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#LgO!T~~#LlQ!P~!O!P#Lr!Q![#Lw~#LwOk~~#L|Pd~!Q![#Lw~#MWf#q~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~#NqP#t~!Q![#Nl~#NyP]~![!]#N|~$ RO#a~~$ WOz~~$ ]Px~}!O$ `~$ eO!U~~$ lg!^~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!`!a$#T!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~$#YO$T~~$#_Ow~~$#df{~qr$#_su$#_vx$#_z|$#_}!O$#_!P![$#_!_!`$#_!a!}$#_#Q#o$#_#r#s$#_#t#y$#_#z$f$#_$g#BY$#_#BZ$IS$#_$I_$I|$#_$JO$JT$#_$JU$KV$#_$KW%)r$#_%)s&FU$#_&FV;'S$#_;'S;=`$$x<%lO$#_~$${P;=`<%l$#_~$%TfZ~qr$%Osu$%Ovx$%Oz|$%O}!O$%O!P![$%O!_!`$%O!a!}$%O#Q#o$%O#r#s$%O#t#y$%O#z$f$%O$g#BY$%O#BZ$IS$%O$I_$I|$%O$JO$JT$%O$JU$KV$%O$KW%)r$%O%)s&FU$%O&FV;'S$%O;'S;=`$&i<%lO$%O~$&lP;=`<%l$%O~$&tOf~~$&yO!R~~$'OOe~~$'Vfj~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~$(pO!X~R$(uP!_P}!O$(xQ$(}P!|Qst$)QQ$)VO#RQ~$)[O!Z~~$)cfl~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~$+Of!V~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~$,kf!W~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~$.Wf$U~[~qr%xsu%xvx%xz|%x}!O%x!P![%x!_!`%x!a!}%x#Q#o%x#r#s%x#t#y%x#z$f%x$g#BY%x#BZ$IS%x$I_$I|%x$JO$JT%x$JU$KV%x$KW%)r%x%)s&FU%x&FV;'S%x;'S;=`'c<%lO%x~$/qP!}~st$/t~$/yO#S~",
    tokenizers: [blockComment, parameterSubst, proofScript, namedProjection, dottedIdent, 0, 1],
    topRules: { "Program": [0, 7] },
    specialized: [{ term: 11, get: (value) => spec_UpperIdentifier[value] || -1 }, { term: 12, get: (value) => spec_LowerIdentifier[value] || -1 }],
    tokenPrec: 6160
  });

  // js/editor-src/highlight-tags.mjs
  var holeTag = Tag.define();
  var belugaHighlight = styleTags({
    type: tags.keyword,
    ctype: tags.keyword,
    schema: tags.keyword,
    some: tags.keyword,
    block: tags.keyword,
    inductive: tags.keyword,
    stratified: tags.keyword,
    typedef: tags.keyword,
    rec: tags.keyword,
    fn: tags.keyword,
    mlam: tags.keyword,
    case: tags.keyword,
    of: tags.keyword,
    let: tags.keyword,
    in: tags.keyword,
    if: tags.keyword,
    then: tags.keyword,
    else: tags.keyword,
    impossible: tags.keyword,
    module: tags.keyword,
    struct: tags.keyword,
    end: tags.keyword,
    and: tags.keyword,
    none: tags.keyword,
    left: tags.keyword,
    right: tags.keyword,
    datatype: tags.keyword,
    LFKeyword: tags.keyword,
    FNKeyword: tags.keyword,
    TypeKeyword: tags.keyword,
    DatatypeKeyword: tags.keyword,
    SchemaKeyword: tags.keyword,
    SomeKeyword: tags.keyword,
    BlockKeyword: tags.keyword,
    InductiveKeyword: tags.keyword,
    CTypeKeyword: tags.keyword,
    AndKeyword: tags.keyword,
    StratifiedKeyword: tags.keyword,
    TypedefKeyword: tags.keyword,
    RecKeyword: tags.keyword,
    FnKeyword: tags.keyword,
    MLamKeyword: tags.keyword,
    CaseKeyword: tags.keyword,
    OfKeyword: tags.keyword,
    LetKeyword: tags.keyword,
    InKeyword: tags.keyword,
    IfKeyword: tags.keyword,
    ThenKeyword: tags.keyword,
    ElseKeyword: tags.keyword,
    ImpossibleKeyword: tags.keyword,
    ModuleKeyword: tags.keyword,
    StructKeyword: tags.keyword,
    EndKeyword: tags.keyword,
    NoneKeyword: tags.keyword,
    LeftKeyword: tags.keyword,
    RightKeyword: tags.keyword,
    FunKeyword: tags.keyword,
    CoinductiveKeyword: tags.keyword,
    PropKeyword: tags.keyword,
    ProofKeyword: tags.keyword,
    ByKeyword: tags.keyword,
    AsKeyword: tags.keyword,
    SufficesKeyword: tags.keyword,
    ToshowKeyword: tags.keyword,
    TrustKeyword: tags.keyword,
    TotalKeyword: tags.keyword,
    "--coverage --warncoverage --nostrengthen --infix --prefix --postfix --assoc    --name --abbrev --not --open --query": tags.meta,
    "Associativity/...": tags.modifier,
    "QueryBound!": tags.number,
    // Pragma arguments (opaque so generic ident rules do not win).
    "NamePragma/PragmaName/LowerIdentifier!": tags.propertyName,
    "NamePragma/PragmaName/UpperIdentifier!": tags.propertyName,
    "NamePragma/PragmaName/DottedIdent!": tags.propertyName,
    "NamePragma/NamePreferred/UpperIdentifier!": tags.modifier,
    "NamePragma/NamePreferred/LowerIdentifier!": tags.modifier,
    "OpenPragma/PragmaName/UpperIdentifier!": tags.namespace,
    "OpenPragma/PragmaName/LowerIdentifier!": tags.namespace,
    "OpenPragma/PragmaName/DottedIdent!": tags.namespace,
    "AbbrevPragma/PragmaName/UpperIdentifier!": tags.namespace,
    "AbbrevPragma/PragmaName/LowerIdentifier!": tags.namespace,
    "AbbrevPragma/PragmaName/DottedIdent!": tags.namespace,
    "AbbrevPragma/UpperIdentifier!": tags.namespace,
    "AbbrevPragma/LowerIdentifier!": tags.namespace,
    "InfixPragma/PragmaName/LowerIdentifier!": tags.function(tags.variableName),
    "InfixPragma/PragmaName/UpperIdentifier!": tags.function(tags.variableName),
    "InfixPragma/PragmaName/DottedIdent!": tags.function(tags.variableName),
    "InfixPragma/Number!": tags.number,
    "PrefixPragma/PragmaName/LowerIdentifier!": tags.function(tags.variableName),
    "PrefixPragma/PragmaName/UpperIdentifier!": tags.function(tags.variableName),
    "PrefixPragma/PragmaName/DottedIdent!": tags.function(tags.variableName),
    "PrefixPragma/Number!": tags.number,
    "PostfixPragma/PragmaName/LowerIdentifier!": tags.function(tags.variableName),
    "PostfixPragma/PragmaName/UpperIdentifier!": tags.function(tags.variableName),
    "PostfixPragma/PragmaName/DottedIdent!": tags.function(tags.variableName),
    "PostfixPragma/Number!": tags.number,
    "QueryLabel/UpperIdentifier!": tags.propertyName,
    "QueryLabel/LowerIdentifier!": tags.propertyName,
    "QueryPragma/QueryBound!": tags.number,
    "Observation/DottedIdent": tags.typeName,
    DottedIdent: tags.variableName,
    "NotPragma!": tags.meta,
    "NoStrengthenPragma!": tags.meta,
    "CoveragePragma!": tags.meta,
    "WarnCoveragePragma!": tags.meta,
    "LFDeclaration/LowerIdentifier": tags.variableName,
    "LFDatatypeDeclaration/LowerIdentifier": tags.definition(tags.typeName),
    "LFConstructor/LowerIdentifier": tags.definition(tags.function(tags.variableName)),
    "SchemaDeclaration/LowerIdentifier": tags.definition(tags.typeName),
    "TypedefDeclaration/LowerIdentifier": tags.definition(tags.typeName),
    "TypedefDeclaration/UpperIdentifier": tags.definition(tags.typeName),
    "InductiveBody/UpperIdentifier": tags.definition(tags.typeName),
    "InductiveBody/LowerIdentifier": tags.definition(tags.typeName),
    "CoinductiveBody/UpperIdentifier": tags.definition(tags.typeName),
    "CoinductiveBody/LowerIdentifier": tags.definition(tags.typeName),
    "CompConstructor/UpperIdentifier": tags.definition(tags.function(tags.variableName)),
    "CompConstructor/LowerIdentifier": tags.definition(tags.function(tags.variableName)),
    "CompDestructor/UpperIdentifier": tags.definition(tags.function(tags.variableName)),
    "CompDestructor/LowerIdentifier": tags.definition(tags.function(tags.variableName)),
    "RecBody/LowerIdentifier": tags.definition(tags.variableName),
    "ProofDeclaration/LowerIdentifier": tags.definition(tags.variableName),
    "ProofDeclaration/UpperIdentifier": tags.definition(tags.variableName),
    "LetDeclaration/LowerIdentifier": tags.definition(tags.variableName),
    "ModuleDeclaration/UpperIdentifier": tags.definition(tags.namespace),
    "FnParam/LowerIdentifier": tags.definition(tags.local(tags.variableName)),
    "MLamParam/LowerIdentifier": tags.definition(tags.local(tags.variableName)),
    "MLamParam/UpperIdentifier": tags.definition(tags.local(tags.typeName)),
    "LFLambdaBinder/LowerIdentifier": tags.definition(tags.local(tags.variableName)),
    "LFBlockField/LowerIdentifier": tags.definition(tags.local(tags.variableName)),
    "ContextEntry/LowerIdentifier": tags.definition(tags.local(tags.variableName)),
    "ContextHead/LowerIdentifier": tags.definition(tags.local(tags.variableName)),
    "SchemaSomeBindings/LowerIdentifier": tags.definition(tags.local(tags.variableName)),
    "CompTypeBinder/LowerIdentifier": tags.definition(tags.local(tags.variableName)),
    "CompTypeBinder/UpperIdentifier": tags.definition(tags.local(tags.typeName)),
    "PiBinder/LowerIdentifier": tags.definition(tags.local(tags.variableName)),
    "PiBinder/UpperIdentifier": tags.definition(tags.local(tags.typeName)),
    "LFAtomicTerm/LowerIdentifier": tags.function(tags.variableName),
    "LFAtomicTerm/UpperIdentifier": tags.special(tags.variableName),
    "LFAtomicType/UpperIdentifier": tags.special(tags.typeName),
    "LFAtomicType/LowerIdentifier": tags.typeName,
    "CompAtomicType/UpperIdentifier": tags.typeName,
    "CompAtomicType/LowerIdentifier": tags.typeName,
    "AtomicExpression/UpperIdentifier": tags.function(tags.variableName),
    "AtomicExpression/LowerIdentifier": tags.function(tags.variableName),
    "AtomicPattern/UpperIdentifier": tags.definition(tags.local(tags.typeName)),
    "AtomicPattern/LowerIdentifier": tags.function(tags.variableName),
    "ParameterVariable!": tags.special(tags.variableName),
    "SubstitutionVariable!": tags.special(tags.typeName),
    "MLamParam/ParameterVariable!": tags.definition(tags.special(tags.variableName)),
    "MLamParam/SubstitutionVariable!": tags.definition(tags.special(tags.typeName)),
    "CompTypeBinder/ParameterVariable!": tags.definition(tags.special(tags.variableName)),
    "CompTypeBinder/SubstitutionVariable!": tags.definition(tags.special(tags.typeName)),
    LowerIdentifier: tags.variableName,
    UpperIdentifier: tags.typeName,
    Number: tags.number,
    Hole: holeTag,
    UnderscoreHole: tags.atom,
    LineComment: tags.lineComment,
    BlockComment: tags.blockComment,
    ":": tags.separator,
    "|": tags.separator,
    ";": tags.separator,
    ".": tags.separator,
    ",": tags.separator,
    "=": tags.separator,
    "::": tags.separator,
    "+": tags.separator,
    '"/"': tags.punctuation,
    "\\": tags.punctuation,
    '"*"': tags.typeOperator,
    "( )": tags.paren,
    "[ ]": tags.squareBracket,
    "{ }": tags.brace,
    "< >": tags.angleBracket,
    NamedProjection: tags.propertyName,
    ParameterSubstArg: tags.special(tags.variableName),
    "Turnstile!": tags.controlKeyword,
    "TurnstileHash!": tags.controlKeyword,
    "ArrowOp!": tags.typeOperator,
    "FatArrow!": tags.typeOperator,
    "SubstHead!": tags.operator,
    "ProjectionTail!": tags.propertyName,
    "Observation/LowerIdentifier!": tags.propertyName,
    "Observation/UpperIdentifier!": tags.propertyName,
    "SubstitutionType/$": tags.operator,
    "ParameterType/#": tags.operator
  });
  var SOURCE_HIGHLIGHTER = tagHighlighter([
    { tag: holeTag, class: "jar-hl-hole" },
    { tag: tags.keyword, class: "jar-hl-keyword" },
    { tag: tags.controlKeyword, class: "jar-hl-control" },
    { tag: tags.typeOperator, class: "jar-hl-arrow" },
    { tag: tags.operator, class: "jar-hl-op" },
    { tag: tags.definitionOperator, class: "jar-hl-op" },
    { tag: tags.arithmeticOperator, class: "jar-hl-op" },
    { tag: tags.special(tags.typeName), class: "jar-hl-metatype" },
    { tag: tags.special(tags.variableName), class: "jar-hl-meta" },
    { tag: tags.definition(tags.special(tags.typeName)), class: "jar-hl-metatype" },
    { tag: tags.definition(tags.special(tags.variableName)), class: "jar-hl-meta" },
    { tag: tags.definition(tags.typeName), class: "jar-hl-type-def" },
    { tag: tags.definition(tags.variableName), class: "jar-hl-var-def" },
    { tag: tags.definition(tags.function(tags.variableName)), class: "jar-hl-ctor" },
    { tag: tags.definition(tags.local(tags.variableName)), class: "jar-hl-local" },
    { tag: tags.definition(tags.local(tags.typeName)), class: "jar-hl-meta" },
    { tag: tags.function(tags.variableName), class: "jar-hl-ctor" },
    { tag: tags.local(tags.variableName), class: "jar-hl-local" },
    { tag: tags.local(tags.typeName), class: "jar-hl-local" },
    { tag: tags.typeName, class: "jar-hl-type" },
    { tag: tags.variableName, class: "jar-hl-var" },
    { tag: tags.namespace, class: "jar-hl-prop" },
    { tag: tags.number, class: "jar-hl-number" },
    { tag: tags.atom, class: "jar-hl-atom" },
    { tag: tags.propertyName, class: "jar-hl-prop" },
    { tag: tags.meta, class: "jar-hl-meta-pragma" },
    { tag: tags.modifier, class: "jar-hl-meta-pragma" },
    { tag: [tags.lineComment, tags.blockComment], class: "jar-hl-comment" },
    {
      tag: [tags.punctuation, tags.paren, tags.squareBracket, tags.brace, tags.angleBracket, tags.separator],
      class: "jar-hl-punct"
    }
  ]);

  // js/share/share-render.mjs
  var beluga = parser.configure({ props: [belugaHighlight] });
  function isBeluga(path) {
    return /\.(bel|lf)$/i.test(String(path || ""));
  }
  function parse(text) {
    try {
      return beluga.parse(String(text));
    } catch (_) {
      return null;
    }
  }
  function lineStarts(text) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
    return starts;
  }
  function lineAt(starts, pos) {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = lo + hi + 1 >> 1;
      if (starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  }
  function highlightRuns(text, tree) {
    const src = String(text);
    if (!tree) return src ? [{ text: src, cls: "" }] : [];
    const out = [];
    let at = 0;
    highlightTree(tree, SOURCE_HIGHLIGHTER, (from, to, cls) => {
      if (to <= from || from < at) return;
      if (from > at) out.push({ text: src.slice(at, from), cls: "" });
      out.push({ text: src.slice(from, to), cls });
      at = to;
    });
    if (at < src.length) out.push({ text: src.slice(at), cls: "" });
    return out;
  }
  function runsByLine(runs) {
    const lines = [[]];
    for (const r of runs) {
      const parts = r.text.split("\n");
      parts.forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part) lines[lines.length - 1].push({ text: part, cls: r.cls });
      });
    }
    return lines;
  }
  function childText(text, node, names) {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (names.includes(c.name)) return text.slice(c.from, c.to);
      if (c.name === "datatypeName" || c.name === "DatatypeName") {
        const inner = childText(text, c, names);
        if (inner) return inner;
      }
    }
    return null;
  }
  function hasChild2(node, name2) {
    for (let c = node.firstChild; c; c = c.nextSibling) if (c.name === name2) return true;
    return false;
  }
  function outline(text, tree) {
    const src = String(text);
    const items = [];
    const holes = [];
    if (!tree) return { items, holes };
    const starts = lineStarts(src);
    const open = [];
    tree.iterate({
      enter(n) {
        if (n.name === "RecBody" || n.name === "ProofDeclaration") {
          const node = n.node;
          const name2 = childText(src, node, ["LowerIdentifier", "UpperIdentifier"]);
          if (name2) {
            const item = {
              kind: n.name === "RecBody" ? "rec" : "proof",
              name: name2,
              line: lineAt(starts, n.from),
              total: n.name === "RecBody" && hasChild2(node, "TotalityAnnotation"),
              holes: 0,
              to: n.to
            };
            items.push(item);
            open.push(item);
          }
        } else if (n.name === "Hole") {
          holes.push({ name: src.slice(n.from, n.to), line: lineAt(starts, n.from) });
          for (const item of open) if (n.from < item.to) item.holes += 1;
        } else if (n.name === "ProofScript") {
          const script = src.slice(n.from, n.to);
          for (const m of script.matchAll(/(^|[^\w'?])(\?[A-Za-z0-9_']*)/g)) {
            const at = n.from + m.index + m[1].length;
            holes.push({ name: m[2], line: lineAt(starts, at) });
            for (const item of open) if (at < item.to) item.holes += 1;
          }
        }
      },
      leave(n) {
        if (open.length && open[open.length - 1].to === n.to && (n.name === "RecBody" || n.name === "ProofDeclaration")) open.pop();
      }
    });
    return { items: items.map(({ to, ...rest }) => rest), holes };
  }
  function holesWords(n) {
    if (!n) return "";
    return n === 1 ? "1 hole" : n + " holes";
  }

  // js/share/share-fetch.mjs
  var g2 = typeof window !== "undefined" ? window : globalThis;
  async function fetchShare(id, doFetch = (...a) => g2.fetch(...a)) {
    if (!id) return { why: "gone" };
    let res;
    try {
      res = await doFetch("/api/share/" + encodeURIComponent(id), { cache: "no-store", credentials: "omit" });
    } catch (_) {
      return { why: "network" };
    }
    if (res.status === 404) return { why: "gone" };
    if (res.status === 413) return { why: "too-large" };
    if (res.status !== 200) return { why: "network" };
    try {
      const view = await res.json();
      if (!view || !Array.isArray(view.files)) return { why: "network" };
      return { view };
    } catch (_) {
      return { why: "network" };
    }
  }

  // js/share/share-page.mjs
  var g3 = typeof window !== "undefined" ? window : globalThis;
  function noteWords(why) {
    if (why === "gone") return "This link no longer works. Whoever shared it may have revoked it, or deleted the project.";
    if (why === "too-large") return "This project is too big to show here. Ask whoever shared it for a download.";
    if (why === "empty") return "This project has no files yet.";
    return "Couldn\u2019t load this project. Check the connection and try again.";
  }
  function metaWords(view, now = Date.now()) {
    const parts = [];
    if (view.by) parts.push("Shared by @" + view.by);
    if (view.updatedAt) parts.push((view.follows ? "Updated " : "Version saved ") + whenWords(view.updatedAt, now));
    return parts.join(" \xB7 ");
  }
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function chooseFile(files, hash) {
    let want = "";
    try {
      want = decodeURIComponent(String(hash || "").replace(/^#/, ""));
    } catch (_) {
      want = "";
    }
    const named = files.find((f) => f.path === want);
    if (named) return named.path;
    const bel = files.find((f) => isBeluga(f.path));
    return (bel || files[0] || {}).path || null;
  }
  function drawCode(box, file) {
    const text = String(file.text || "").replace(/\r\n?/g, "\n");
    const tree = isBeluga(file.path) ? parse(text) : null;
    const lines = runsByLine(highlightRuns(text, tree));
    const pre = el("pre", "share-lines" + (tree ? "" : " is-plain"));
    lines.forEach((runs, i) => {
      const line = el("div", "share-line");
      line.dataset.line = String(i + 1);
      line.appendChild(el("span", "share-line__n", String(i + 1)));
      const code = el("span", "share-line__text");
      for (const r of runs) code.appendChild(r.cls ? el("span", r.cls, r.text) : document.createTextNode(r.text));
      if (!runs.length) code.appendChild(document.createTextNode("\u200B"));
      line.appendChild(code);
      pre.appendChild(line);
    });
    box.replaceChildren(pre);
    box.scrollTop = 0;
    box.scrollLeft = 0;
    return tree ? outline(text, tree) : { items: [], holes: [] };
  }
  function goToLine(box, n) {
    const line = box.querySelector('.share-line[data-line="' + n + '"]');
    if (!line) return;
    for (const was of box.querySelectorAll(".share-line.is-target")) was.classList.remove("is-target");
    line.classList.add("is-target");
    line.scrollIntoView({ block: "center" });
  }
  function drawOutline(box, codeBox, o) {
    box.replaceChildren();
    if (!o.items.length && !o.holes.length) return;
    const head = el("h2", "share-outline__head", "Outline");
    if (o.holes.length) head.appendChild(el("span", "share-outline__holes", holesWords(o.holes.length) + " open"));
    box.appendChild(head);
    const list = el("ul", "share-outline__list");
    for (const item of o.items) {
      const li = el("li");
      const btn = el("button", "share-outline__item");
      btn.type = "button";
      btn.appendChild(el("span", "share-outline__name", item.name));
      if (item.holes) btn.appendChild(el("span", "share-outline__count", holesWords(item.holes)));
      btn.addEventListener("click", () => goToLine(codeBox, item.line));
      li.appendChild(btn);
      list.appendChild(li);
    }
    box.appendChild(list);
  }
  function fileGroups(files) {
    const groups = /* @__PURE__ */ new Map([["", []]]);
    for (const f of files) {
      const slash = f.path.lastIndexOf("/");
      const dir = slash > 0 ? f.path.slice(0, slash) : "";
      if (!groups.has(dir)) groups.set(dir, []);
      groups.get(dir).push(f);
    }
    return [...groups].filter(([, fs]) => fs.length).map(([dir, fs]) => ({ dir, files: fs }));
  }
  function fileButton(f, current, choose) {
    const li = el("li");
    const btn = el("button", "share-file");
    btn.type = "button";
    btn.dataset.path = f.path;
    btn.setAttribute("aria-current", f.path === current ? "true" : "false");
    btn.appendChild(el("span", "share-file__name", f.path.slice(f.path.lastIndexOf("/") + 1)));
    btn.addEventListener("click", () => choose(f.path));
    li.appendChild(btn);
    return li;
  }
  function drawFiles(list, files, current, choose) {
    list.replaceChildren();
    for (const group of fileGroups(files)) {
      if (!group.dir) {
        for (const f of group.files) list.appendChild(fileButton(f, current, choose));
        continue;
      }
      const li = el("li", "share-folder");
      li.appendChild(el("span", "share-folder__name", group.dir + "/"));
      const inner = el("ul", "share-files share-files--in");
      inner.setAttribute("aria-label", group.dir);
      for (const f of group.files) inner.appendChild(fileButton(f, current, choose));
      li.appendChild(inner);
      list.appendChild(li);
    }
  }
  function say(why, retry) {
    const note = document.getElementById("share-note");
    document.getElementById("share-body").hidden = true;
    document.getElementById("share-note-text").textContent = noteWords(why);
    const link = document.getElementById("share-note-link");
    link.href = Routes.homeUrl();
    link.textContent = why === "network" ? "Try again" : "Go to BelJar";
    link.onclick = why === "network" ? (e) => {
      e.preventDefault();
      retry();
    } : null;
    note.hidden = false;
    document.body.dataset.state = why;
  }
  function show(id, view) {
    const files = view.files;
    document.title = view.name ? view.name + " \xB7 BelJar" : "BelJar";
    document.getElementById("share-name").textContent = view.name || "Untitled project";
    document.getElementById("share-meta").textContent = metaWords(view);
    const open = document.getElementById("share-open");
    open.hidden = false;
    open.onclick = () => Routes.go(Routes.homeUrl({ copy: id }));
    if (!files.length) {
      say("empty");
      return;
    }
    document.getElementById("share-note").hidden = true;
    const body = document.getElementById("share-body");
    const list = document.getElementById("share-files");
    const codeBox = document.getElementById("share-code");
    const outlineBox = document.getElementById("share-outline");
    body.hidden = false;
    document.body.dataset.state = "shown";
    let current = null;
    function choose(path, fromHash) {
      const f = files.find((x) => x.path === path);
      if (!f) return;
      current = path;
      drawFiles(list, files, current, choose);
      drawOutline(outlineBox, codeBox, drawCode(codeBox, f));
      codeBox.setAttribute("aria-label", f.path);
      if (!fromHash && g3.history && typeof g3.history.replaceState === "function") {
        g3.history.replaceState(g3.history.state, "", "#" + encodeURIComponent(path).replace(/%2F/g, "/"));
      }
    }
    choose(chooseFile(files, g3.location.hash), true);
    g3.addEventListener("hashchange", () => {
      const p = chooseFile(files, g3.location.hash);
      if (p && p !== current) choose(p, true);
    });
  }
  async function start() {
    const home = document.getElementById("share-home");
    if (home) home.href = Routes.homeUrl();
    const id = Routes.shareOf(g3.location);
    const load = async () => {
      document.body.dataset.state = "loading";
      const got = await fetchShare(id);
      if (got.view) show(id, got.view);
      else say(got.why, load);
    };
    await load();
  }

  // js/share.mjs
  start();
})();
