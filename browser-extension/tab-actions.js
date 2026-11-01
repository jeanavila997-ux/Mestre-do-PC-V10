/**
 * Ações de abas no perfil do navegador (precisa da permissão "tabs").
 * Usado pelo popup e pelo service worker.
 */

function isJunkUrl(url = "") {
  return /^(about:blank|chrome:\/\/newtab|edge:\/\/newtab|chrome:\/\/new-tab-page|edge:\/\/new-tab-page)/i.test(url)
    || url === "";
}

function normalizeUrl(url = "") {
  try {
    const u = new URL(url);
    u.hash = "";
    if (u.pathname === "/") u.pathname = "";
    return u.toString();
  } catch {
    return url;
  }
}

export async function listTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.map((tab) => ({
    id: tab.id,
    title: tab.title || "(sem título)",
    url: tab.url || "",
    discarded: Boolean(tab.discarded),
    pinned: Boolean(tab.pinned),
    active: Boolean(tab.active),
    audible: Boolean(tab.audible),
  }));
}

export async function summarizeMemory() {
  const tabs = await listTabs();
  const byHost = new Map();
  for (const tab of tabs) {
    let host = "(interno)";
    try { host = new URL(tab.url).host || host; } catch { /* ignore */ }
    byHost.set(host, (byHost.get(host) || 0) + 1);
  }
  const top = [...byHost.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return {
    total: tabs.length,
    discarded: tabs.filter((t) => t.discarded).length,
    pinned: tabs.filter((t) => t.pinned).length,
    audible: tabs.filter((t) => t.audible).length,
    topHosts: top,
  };
}

export async function closeJunkTabs() {
  const tabs = await chrome.tabs.query({});
  const closable = tabs.filter((tab) => !tab.pinned && !tab.active && isJunkUrl(tab.url || ""));
  const ids = closable.map((t) => t.id).filter((id) => Number.isInteger(id));
  if (ids.length) await chrome.tabs.remove(ids);
  return { closed: ids.length, remaining: tabs.length - ids.length };
}

export async function closeDuplicateTabs() {
  const tabs = await chrome.tabs.query({});
  const seen = new Set();
  const ids = [];
  for (const tab of tabs) {
    if (tab.pinned || tab.active) continue;
    const key = normalizeUrl(tab.url || "");
    if (!key) continue;
    if (seen.has(key)) ids.push(tab.id);
    else seen.add(key);
  }
  const valid = ids.filter((id) => Number.isInteger(id));
  if (valid.length) await chrome.tabs.remove(valid);
  return { closed: valid.length };
}

export async function discardInactiveTabs() {
  const tabs = await chrome.tabs.query({});
  let discarded = 0;
  for (const tab of tabs) {
    if (tab.pinned || tab.active || tab.audible || tab.discarded) continue;
    if (!Number.isInteger(tab.id)) continue;
    try {
      await chrome.tabs.discard(tab.id);
      discarded += 1;
    } catch {
      /* algumas abas internas não aceitam discard */
    }
  }
  return { discarded };
}

export async function openSpeedtest() {
  await chrome.tabs.create({ url: "https://fast.com" });
  await chrome.tabs.create({ url: "https://speed.cloudflare.com" });
}

export async function openDiscardsPage() {
  const url = "edge://discards/";
  try {
    await chrome.tabs.create({ url });
  } catch {
    await chrome.tabs.create({ url: "chrome://discards/" });
  }
}
