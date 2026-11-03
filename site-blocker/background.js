const BLOCKED = chrome.runtime.getURL("blocked.html");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function getState() {
  const { sites = [], passes = {} } = await chrome.storage.local.get(["sites", "passes"]);
  return { sites, passes };
}

function hostMatches(url, site) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    const host = u.hostname.replace(/^www\./, "");
    return host === site || host.endsWith("." + site);
  } catch {
    return false;
  }
}

// Rules are rebuilt from storage every time; calls are queued so they never overlap.
let queue = Promise.resolve();
const applyRules = () => (queue = queue.then(doApply, doApply));

async function doApply() {
  const { sites, passes } = await getState();
  const now = Date.now();
  const blocked = sites.filter((s) => !(passes[s] > now));

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: blocked.map((site, i) => ({
      id: i + 1,
      priority: 1,
      action: {
        type: "redirect",
        // Keep the original address so the popup can send you back after a pass.
        redirect: { regexSubstitution: BLOCKED + "?url=\\0" },
      },
      condition: {
        regexFilter: "^https?://([^/]+\\.)?" + escapeRe(site) + "([:/?#]|$)",
        resourceTypes: ["main_frame"],
      },
    })),
  });

  // Schedule the moment each pass runs out. The timer covers short passes (the
  // service worker is still awake); the alarm covers longer ones.
  for (const [site, until] of Object.entries(passes)) {
    if (until > now) {
      chrome.alarms.create("pass:" + site, { when: until });
      setTimeout(expirePasses, until - now + 50);
    }
  }
}

// Drop finished passes, re-block the site and push any tab still on it back to the blocked page.
async function expirePasses() {
  const { passes } = await getState();
  const now = Date.now();
  const expired = Object.keys(passes).filter((s) => passes[s] <= now);
  if (!expired.length) return;

  for (const s of expired) delete passes[s];
  await chrome.storage.local.set({ passes });
  await applyRules();

  for (const tab of await chrome.tabs.query({})) {
    if (tab.url && expired.some((s) => hostMatches(tab.url, s))) {
      chrome.tabs.update(tab.id, { url: BLOCKED + "?url=" + tab.url });
    }
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "apply") {
    applyRules().then(() => sendResponse(true));
    return true;
  }
});
chrome.alarms.onAlarm.addListener(expirePasses);
chrome.runtime.onInstalled.addListener(applyRules);
chrome.runtime.onStartup.addListener(() => {
  applyRules();
  expirePasses();
});
