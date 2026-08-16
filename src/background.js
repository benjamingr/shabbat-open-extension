/*
 * Service worker: tags each tab with a toolbar badge indicating whether the
 * site is a Shabbat-observant Israeli site, and colors it differently while it
 * is actually Shabbat in Israel.
 */
importScripts(
  chrome.runtime.getURL("data/sites.js"),
  chrome.runtime.getURL("src/lib.js")
);

const L = globalThis.ShabbatLib;
const DATA = globalThis.SHABBAT_DATA;

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(L.DEFAULTS, (stored) => {
      resolve(Object.assign({}, L.DEFAULTS, stored));
    });
  });
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (_) {
    return "";
  }
}

async function updateBadge(tabId, url) {
  const site = url ? L.matchSite(hostFromUrl(url), DATA.sites) : null;

  if (!site) {
    chrome.action.setBadgeText({ tabId, text: "" });
    return;
  }

  const settings = await getSettings();
  const win = L.getShabbatWindow(
    new Date(),
    settings.candleOffsetMin,
    settings.havdalahOffsetMin
  );

  const strong = L.isStrong(site);
  chrome.action.setBadgeText({ tabId, text: "●" });
  chrome.action.setBadgeBackgroundColor({
    tabId,
    color: win.active ? "#c9a227" : strong ? "#2f7d4f" : "#8a8a8a",
  });

  const statusHe = L.STATUS_LABEL_HE[site.status] || "שומר שבת";
  const title = win.active
    ? `${site.name} — ${statusHe}\nכעת שבת בישראל`
    : `${site.name} — ${statusHe}`;
  chrome.action.setTitle({ tabId, title });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    updateBadge(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (!chrome.runtime.lastError && tab) updateBadge(tabId, tab.url);
  });
});

// Re-tag the active tab when settings change (e.g. offsets adjusted).
chrome.storage.onChanged.addListener(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) updateBadge(tabs[0].id, tabs[0].url);
  });
});
