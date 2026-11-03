// Redirect from a local copy right away; chrome.storage.sync is async and slow.
const cached = localStorage.getItem("url");
if (cached) location.replace(cached);

// The synced value is the source of truth (it may come from another machine).
chrome.storage.sync.get("url").then(({ url }) => {
  if (url) localStorage.setItem("url", url);
  else localStorage.removeItem("url");

  if (!url) document.body.classList.add("empty");
  else if (url !== cached) location.replace(url);
});
