const BLOCKED = chrome.runtime.getURL("blocked.html");
const PASSES = [["5 sec", 5000], ["5 min", 5 * 60000], ["15 min", 15 * 60000]];

const view = document.getElementById("view");
const list = document.getElementById("list");

const hostOf = (url) => {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};
const matches = (host, site) => host === site || host.endsWith("." + site);

// Saves, then waits for the background worker to rebuild the rules.
async function save(data) {
  await chrome.storage.local.set(data);
  await chrome.runtime.sendMessage({ type: "apply" });
}

function el(tag, text, onclick) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (onclick) node.onclick = onclick;
  return node;
}

function line(label, bold) {
  const p = el("p", label);
  if (bold) {
    const b = el("b", bold);
    p.prepend(b, " ");
  }
  return p;
}

async function load() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { sites = [], passes = {} } = await chrome.storage.local.get(["sites", "passes"]);

  // On the blocked page the real address travels in ?url=
  const onBlockedPage = tab?.url?.startsWith(BLOCKED);
  const original = onBlockedPage ? tab.url.split("?url=")[1] || "" : tab?.url || "";
  const host = hostOf(original);
  const site = sites.find((s) => matches(host, s));
  const until = site ? passes[site] || 0 : 0;

  view.replaceChildren();

  if (!host) {
    view.append(line("Nothing to block on this page."));
  } else if (!site) {
    view.append(el("button", `Block ${host}`, async () => {
      await save({ sites: [...sites, host] });
      chrome.tabs.reload(tab.id);
      window.close();
    }));
  } else if (until > Date.now()) {
    const time = new Date(until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    view.append(line(`allowed until ${time}`, site));
    view.append(el("button", "Block again", async () => {
      const { [site]: _, ...rest } = passes;
      await save({ passes: rest });
      if (!onBlockedPage) chrome.tabs.reload(tab.id);
      window.close();
    }));
  } else {
    view.append(line("is blocked. Need it anyway?", site));
    const row = el("div");
    row.className = "row";
    for (const [label, ms] of PASSES) {
      row.append(el("button", label, async () => {
        await save({ passes: { ...passes, [site]: Date.now() + ms } });
        chrome.tabs.update(tab.id, { url: original });
        window.close();
      }));
    }
    view.append(row);
  }

  list.replaceChildren();
  if (!sites.length) {
    const li = el("li", "Nothing yet");
    li.className = "empty";
    list.append(li);
  }
  for (const s of sites) {
    const li = el("li", s);
    li.append(el("button", "×", async () => {
      const { [s]: _, ...rest } = passes;
      await save({ sites: sites.filter((x) => x !== s), passes: rest });
      load();
    }));
    list.append(li);
  }
}

load();
