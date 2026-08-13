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

/* Copy button on every code block. The specimen already has a chrome bar to put
   it in; plain <pre> blocks get wrapped in a positioned container. */
(function () {
  var blocks = document.querySelectorAll("main pre");
  if (!blocks.length || !navigator.clipboard) return;

  Array.prototype.forEach.call(blocks, function (pre) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.textContent = "Copy";
    btn.setAttribute("aria-label", "Copy code to clipboard");

    var head = pre.parentNode.querySelector(":scope > .code-head");
    if (head) {
      head.appendChild(btn);
    } else {
      var wrap = document.createElement("div");
      wrap.className = "code-wrap";
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      wrap.appendChild(btn);
    }

    var timer = 0;
    btn.addEventListener("click", function () {
      navigator.clipboard.writeText(pre.textContent).then(
        function () {
          btn.textContent = "Copied";
          btn.classList.add("is-done");
          clearTimeout(timer);
          timer = setTimeout(function () {
            btn.textContent = "Copy";
            btn.classList.remove("is-done");
          }, 1600);
        },
        function () {
          btn.textContent = "Failed";
          clearTimeout(timer);
          timer = setTimeout(function () {
            btn.textContent = "Copy";
          }, 1600);
        }
      );
    });
  });
})();
