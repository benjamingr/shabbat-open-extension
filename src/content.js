/*
 * Content script: injected only on domains listed in the dataset (see the
 * generated match patterns in manifest.json). Decides whether to show the
 * "closed on Shabbat" banner for the current site.
 */
(async function () {
  "use strict";

  const L = globalThis.ShabbatLib;
  const DATA = globalThis.SHABBAT_DATA;
  if (!L || !DATA) return;

  const site = L.matchSite(location.hostname, DATA.sites);
  if (!site) return; // shouldn't happen given match patterns, but be safe

  const settings = await getSettings();
  if (!settings.enabled) return;
  if (!L.meetsConfidence(site, settings.minConfidence)) return;

  const win = L.getShabbatWindow(
    new Date(),
    settings.candleOffsetMin,
    settings.havdalahOffsetMin
  );

  // The banner always shows on a listed site — the alert is most useful
  // *before* Shabbat (during Shabbat, the site being closed is self-evident).

  // Respect a per-tab dismissal for this host.
  const dismissKey =
    "shabbatClosedDismissed:" + L.normalizeHost(location.hostname);
  try {
    if (sessionStorage.getItem(dismissKey) === "1") return;
  } catch (_) {
    /* sessionStorage can be blocked; ignore */
  }

  renderBanner();

  function renderBanner() {
    if (document.getElementById("shabbat-closed-banner")) return;

    const strong = L.isStrong(site);

    const el = document.createElement("div");
    el.id = "shabbat-closed-banner";
    el.dir = "rtl";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.className = "shabbat-closed-banner" + (win.active ? " is-active" : "");

    const sym = settings.alertSymbol || "⚠️";

    // Text block
    const text = document.createElement("div");
    text.className = "scb-text";

    const headline = document.createElement("div");
    headline.className = "scb-headline";
    const msg = strong ? "האתר סגור בשבת" : "האתר שומר שבת";
    headline.textContent = `${sym} שימו לב · ${msg} ${sym}`;

    const sub = document.createElement("div");
    sub.className = "scb-sub";
    const bits = [L.STATUS_LABEL_HE[site.status] || "שומר שבת"];
    if (!win.active && win.start) {
      bits.push("כניסת שבת הקרובה " + L.formatTimeIL(win.start));
    }
    sub.textContent = bits.join(" · ");

    text.appendChild(headline);
    text.appendChild(sub);

    const spacer = document.createElement("div");
    spacer.className = "scb-spacer";

    // Actions
    const actions = document.createElement("div");
    actions.className = "scb-actions";

    if (site.evidence_url) {
      const link = document.createElement("a");
      link.className = "scb-link";
      link.href = site.evidence_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "מקור";
      if (site.evidence_text) link.title = site.evidence_text;
      actions.appendChild(link);
    }

    const close = document.createElement("button");
    close.type = "button";
    close.className = "scb-close";
    close.setAttribute("aria-label", "סגירת ההודעה עד סוף הגלישה");
    close.textContent = "✕";
    close.addEventListener("click", dismiss);
    actions.appendChild(close);

    el.append(text, spacer, actions);
    (document.body || document.documentElement).appendChild(el);

    // Push the page down so the banner doesn't cover the site's own header.
    applyOffset(el);

    function dismiss() {
      try {
        sessionStorage.setItem(dismissKey, "1");
      } catch (_) {}
      clearOffset();
      el.remove();
    }
  }

  // Keep a top offset on <html> equal to the banner's height, tracking wraps
  // and viewport changes via ResizeObserver.
  let ro = null;
  function applyOffset(el) {
    const root = document.documentElement;
    const prev = root.style.getPropertyValue("padding-top");
    root.dataset.scbPrevPad = prev;
    const sync = () => {
      root.style.setProperty(
        "padding-top",
        el.offsetHeight + "px",
        "important"
      );
    };
    sync();
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(sync);
      ro.observe(el);
    } else {
      window.addEventListener("resize", sync);
    }
  }
  function clearOffset() {
    const root = document.documentElement;
    if (ro) {
      ro.disconnect();
      ro = null;
    }
    const prev = root.dataset.scbPrevPad || "";
    if (prev) root.style.setProperty("padding-top", prev);
    else root.style.removeProperty("padding-top");
    delete root.dataset.scbPrevPad;
  }

  function getSettings() {
    return new Promise((resolve) => {
      const defaults = L.DEFAULTS;
      try {
        chrome.storage.sync.get(defaults, (stored) => {
          if (chrome.runtime.lastError) resolve(defaults);
          else resolve(Object.assign({}, defaults, stored));
        });
      } catch (_) {
        resolve(defaults);
      }
    });
  }
})();
