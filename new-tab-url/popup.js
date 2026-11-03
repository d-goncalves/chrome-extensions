const input = document.getElementById("url");
const status = document.getElementById("status");

function say(text, error) {
  status.textContent = text;
  status.className = error ? "error" : "";
}

// Accepts "example.com" as well as a full address.
function normalise(raw) {
  const text = raw.trim();
  if (!text) return "";
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : "https://" + text);
    return /^https?:$/.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

chrome.storage.sync.get("url").then(({ url }) => {
  input.value = url || "";
  if (!url) input.focus();
});

document.getElementById("form").onsubmit = async (e) => {
  e.preventDefault();
  const url = normalise(input.value);
  if (url === null) return say("Enter a valid http or https address.", true);
  await chrome.storage.sync.set({ url });
  if (url) localStorage.setItem("url", url);
  else localStorage.removeItem("url");
  input.value = url;
  say(url ? "Saved. New tabs open this page." : "Cleared.");
};
