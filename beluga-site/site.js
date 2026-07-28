(function () {
  var toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll(".site-nav a[href^='#']")
  );
  var sections = navLinks
    .map(function (a) {
      return document.querySelector(a.getAttribute("href"));
    })
    .filter(Boolean);

  function syncThemeLabel() {
    var dark = document.documentElement.dataset.theme === "dark";
    toggle.setAttribute(
      "aria-label",
      dark ? "Switch to light theme" : "Switch to dark theme"
    );
  }
  syncThemeLabel();

  toggle.addEventListener("click", function () {
    var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("beluga-theme", next);
    } catch (e) {}
    syncThemeLabel();
  });

  function setCurrent(id) {
    navLinks.forEach(function (a) {
      if (a.getAttribute("href") === "#" + id) {
        a.setAttribute("aria-current", "true");
      } else {
        a.removeAttribute("aria-current");
      }
    });
    if (id && location.hash !== "#" + id) {
      history.replaceState(null, "", "#" + id);
    }
  }

  navLinks.forEach(function (a) {
    a.addEventListener("click", function () {
      var id = (a.getAttribute("href") || "").slice(1);
      if (id) setCurrent(id);
    });
  });

  if (!("IntersectionObserver" in window) || !sections.length) return;

  var ratios = Object.create(null);
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        ratios[entry.target.id] = entry.isIntersecting ? entry.intersectionRatio : 0;
      });
      var best = null;
      var bestRatio = 0;
      sections.forEach(function (s) {
        var r = ratios[s.id] || 0;
        if (r > bestRatio) {
          bestRatio = r;
          best = s.id;
        }
      });
      if (best) setCurrent(best);
    },
    { rootMargin: "-20% 0px -70% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
  );
  sections.forEach(function (s) {
    ratios[s.id] = 0;
    observer.observe(s);
  });
})();

(function () {
  var links = document.querySelectorAll("a[data-tip]");
  if (!links.length) return;

  var tip = document.createElement("div");
  tip.className = "cs-tip";
  tip.id = "cs-tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.appendChild(tip);

  var OFFSET_X = 12;
  var OFFSET_Y = 14;
  var PAD = 8;
  var active = null;
  var follow = false;
  var mx = 0;
  var my = 0;
  var raf = 0;
  var fine =
    window.matchMedia &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  function place(x, y) {
    tip.hidden = false;
    tip.classList.add("is-on");
    var w = tip.offsetWidth;
    var h = tip.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var left = x + OFFSET_X;
    var top = y + OFFSET_Y;
    if (left + w + PAD > vw) left = x - w - OFFSET_X;
    if (top + h + PAD > vh) top = y - h - OFFSET_Y;
    if (left < PAD) left = PAD;
    if (top < PAD) top = PAD;
    tip.style.transform = "translate3d(" + left + "px," + top + "px,0)";
  }

  function placeNear(el) {
    var r = el.getBoundingClientRect();
    place(r.left, r.bottom);
  }

  function scheduleFollow() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      if (follow && active) place(mx, my);
    });
  }

  function show(el, mode) {
    var text = el.getAttribute("data-tip");
    if (!text) return;
    active = el;
    tip.textContent = text;
    el.setAttribute("aria-describedby", "cs-tip");
    if (mode === "pointer") {
      follow = true;
      place(mx, my);
    } else {
      follow = false;
      placeNear(el);
    }
  }

  function hide(el) {
    if (el && el !== active) return;
    if (active) active.removeAttribute("aria-describedby");
    active = null;
    follow = false;
    tip.classList.remove("is-on");
    tip.hidden = true;
    tip.textContent = "";
  }

  Array.prototype.forEach.call(links, function (a) {
    if (fine) {
      a.addEventListener("pointerenter", function (e) {
        mx = e.clientX;
        my = e.clientY;
        show(a, "pointer");
      });
      a.addEventListener("pointermove", function (e) {
        mx = e.clientX;
        my = e.clientY;
        if (follow && active === a) scheduleFollow();
      });
      a.addEventListener("pointerleave", function () {
        hide(a);
      });
    }
    a.addEventListener("focus", function () {
      show(a, "focus");
    });
    a.addEventListener("blur", function () {
      hide(a);
    });
  });
})();
