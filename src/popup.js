/* Popup: shows the current tab's Shabbat status and exposes settings. */
(function () {
  "use strict";
  const L = globalThis.ShabbatLib;
  const DATA = globalThis.SHABBAT_DATA;

  const FIELDS = ["alertSymbol", "minConfidence", "enabled"];

  function updateSymbolPreview() {
    const sel = document.getElementById("alertSymbol");
    const prev = document.getElementById("symbolPreview");
    if (sel && prev) prev.textContent = `${sel.value} שימו לב · האתר סגור בשבת ${sel.value}`;
  }

  function getSettings(cb) {
    chrome.storage.sync.get(L.DEFAULTS, (stored) =>
      cb(Object.assign({}, L.DEFAULTS, stored))
    );
  }

  function loadFields() {
    getSettings((s) => {
      for (const f of FIELDS) {
        const el = document.getElementById(f);
        if (!el) continue;
        if (el.type === "checkbox") el.checked = !!s[f];
        else el.value = s[f];
      }
      updateSymbolPreview();
    });
  }

  function clamp(v, lo, hi) {
    v = Number(v);
    if (!Number.isFinite(v)) return lo;
    return Math.min(hi, Math.max(lo, Math.round(v)));
  }

  function save() {
    const patch = {};
    for (const f of FIELDS) {
      const el = document.getElementById(f);
      if (!el) continue;
      if (el.type === "checkbox") patch[f] = el.checked;
      else if (el.type === "number") {
        patch[f] = clamp(el.value, 0, 120);
        el.value = patch[f];
      } else patch[f] = el.value;
    }
    chrome.storage.sync.set(patch, render);
  }

  function pill(cls, text) {
    const el = document.createElement("span");
    el.className = "pill " + cls;
    el.textContent = text;
    return el;
  }

  function render() {
    getSettings((s) => {
      const win = L.getShabbatWindow(
        new Date(),
        s.candleOffsetMin,
        s.havdalahOffsetMin
      );

      // Header line: is it Shabbat now?
      const nowEl = document.getElementById("shabbat-now");
      nowEl.textContent = win.active
        ? "כעת שבת בישראל"
        : "מסמן אתרים ישראליים שסגורים בשבת";

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        const body = document.getElementById("status-body");
        body.innerHTML = "";

        let host = "";
        try {
          host = new URL(tab.url).hostname;
        } catch (_) {}

        const site = L.matchSite(host, DATA.sites);

        if (!site) {
          const line = document.createElement("div");
          line.className = "status-line";
          line.textContent = host
            ? "האתר הנוכחי אינו ברשימת האתרים שומרי השבת."
            : "אין אתר פעיל.";
          body.appendChild(line);
          const row = document.createElement("div");
          row.className = "pill-row";
          row.appendChild(win.active ? pill("active", "כעת שבת") : pill("none", "לא ברשימה"));
          body.appendChild(row);
          return;
        }

        const strong = L.isStrong(site);

        const name = document.createElement("div");
        name.className = "site-name";
        name.textContent = site.name || site.domain;
        body.appendChild(name);

        const line = document.createElement("div");
        line.className = "status-line";
        line.textContent = L.STATUS_LABEL_HE[site.status] || "שומר שבת";
        body.appendChild(line);

        const row = document.createElement("div");
        row.className = "pill-row";
        row.appendChild(
          strong ? pill("closed", "סגור בשבת") : pill("observant", "מצהיר ששומר שבת")
        );
        if (L.CONFIDENCE_LABEL_HE[site.confidence]) {
          row.appendChild(pill("confidence", L.CONFIDENCE_LABEL_HE[site.confidence]));
        }
        if (win.active) row.appendChild(pill("active", "כעת שבת"));
        body.appendChild(row);

        if (site.evidence_url) {
          const a = document.createElement("a");
          a.className = "evidence";
          a.href = site.evidence_url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = "מקור / עדות";
          if (site.evidence_text) a.title = site.evidence_text;
          body.appendChild(a);
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadFields();
    render();
    for (const f of FIELDS) {
      const el = document.getElementById(f);
      if (el) {
        el.addEventListener("change", save);
        if (f === "alertSymbol") el.addEventListener("input", updateSymbolPreview);
      }
    }
  });
})();
