const INCIDENTS_KEY = "field-incident-queue:v1";
const SERVER_KEY = "field-incident-server:v1";

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "incident-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

function parse(storage, key, fallback) {
  try { return JSON.parse(storage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}

class QueueEngine {
  constructor({storage = globalThis.localStorage, network = "online"} = {}) {
    this.storage = storage;
    this.network = network;
  }

  incidents() { return parse(this.storage, INCIDENTS_KEY, []); }
  serverRecords() { return parse(this.storage, SERVER_KEY, []); }
  saveIncidents(items) { this.storage.setItem(INCIDENTS_KEY, JSON.stringify(items)); }
  saveServer(items) { this.storage.setItem(SERVER_KEY, JSON.stringify(items)); }
  setNetwork(network) { this.network = network; }

  createIncident(title, severity) {
    const incident = {
      clientId: makeId(),
      title: title.trim(),
      severity,
      createdAt: new Date().toISOString(),
      state: "pending",
      error: ""
    };
    if (!incident.title) throw new Error("A description is required.");
    const items = this.incidents();
    items.unshift(incident);
    this.saveIncidents(items);
    return incident;
  }

  async synchronize() {
    const pending = this.incidents().filter(item => item.state === "pending" || item.state === "failed");
    for (const item of pending) await this.synchronizeOne(item.clientId);
    return this.incidents();
  }

  async synchronizeOne(clientId) {
    const items = this.incidents();
    const index = items.findIndex(item => item.clientId === clientId);
    if (index < 0) return null;
    items[index] = {...items[index], state: "syncing", error: ""};
    this.saveIncidents(items);
    try {
      if (this.network === "offline") throw new Error("No network connection.");
      if (this.network === "failing") throw new Error("Temporary server failure.");
      const server = this.serverRecords();
      const existing = server.find(record => record.clientId === clientId);
      const serverRecord = existing || {...items[index], serverId: "srv-" + clientId};
      if (!existing) { server.push(serverRecord); this.saveServer(server); }
      const latest = this.incidents();
      const latestIndex = latest.findIndex(item => item.clientId === clientId);
      latest[latestIndex] = {...latest[latestIndex], state: "synchronized", serverId: serverRecord.serverId, error: ""};
      this.saveIncidents(latest);
      return latest[latestIndex];
    } catch (error) {
      const latest = this.incidents();
      const latestIndex = latest.findIndex(item => item.clientId === clientId);
      if (latestIndex >= 0) { latest[latestIndex] = {...latest[latestIndex], state: "failed", error: error.message}; this.saveIncidents(latest); }
      return latest[latestIndex];
    }
  }

  reset() { this.storage.removeItem(INCIDENTS_KEY); this.storage.removeItem(SERVER_KEY); }
}

if (typeof window !== "undefined") window.QueueEngine = QueueEngine;

if (typeof document !== "undefined" && document.getElementById("incident-form")) {
  const engine = new QueueEngine({network: localStorage.getItem("field-incident-network") || "online"});
  const form = document.getElementById("incident-form");
  const title = document.getElementById("title");
  const severity = document.getElementById("severity");
  const mode = document.getElementById("network-mode");
  const badge = document.getElementById("connectivity-badge");
  const list = document.getElementById("incident-list");
  const status = document.getElementById("status-banner");

  mode.value = engine.network;
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",""":"&quot;","'":"&#039;"}[char]));
  const formatDate = value => new Date(value).toLocaleString([], {dateStyle:"medium", timeStyle:"short"});

  function updateNetworkUi() {
    badge.textContent = engine.network === "online" ? "Online" : engine.network === "offline" ? "Offline" : "Server failing";
    badge.className = "badge " + engine.network;
    status.textContent = engine.network === "offline" ? "Offline mode: new incidents remain pending on this device." : engine.network === "failing" ? "Failure mode: synchronization will retain incidents and expose a retry." : "Online mode: pending incidents can synchronize now.";
  }

  function render() {
    updateNetworkUi();
    const incidents = engine.incidents();
    if (!incidents.length) { list.innerHTML = '<div class="empty">No incidents yet. Switch to Offline and create one to exercise the queue.</div>'; return; }
    list.innerHTML = incidents.map(item => {
      const canRetry = item.state === "failed" || item.state === "pending";
      return '<article class="incident"><div><h3>' + escapeHtml(item.title) + '</h3><div class="incident-meta"><span class="state ' + item.state + '">' + item.state + '</span><span>' + escapeHtml(item.severity) + '</span><span>' + formatDate(item.createdAt) + '</span><span class="client-id">ID ' + escapeHtml(item.clientId.slice(0, 8)) + '…</span></div>' + (item.error ? '<p class="error">' + escapeHtml(item.error) + '</p>' : '') + '</div><div class="incident-actions">' + (canRetry ? '<button class="button secondary small" data-retry="' + escapeHtml(item.clientId) + '" type="button">Retry sync</button>' : '<span class="state synchronized">✓ durable</span>') + '</div></article>';
    }).join("");
  }

  async function sync() { render(); await engine.synchronize(); render(); }

  mode.addEventListener("change", async event => { engine.setNetwork(event.target.value); localStorage.setItem("field-incident-network", engine.network); render(); if (engine.network === "online") await sync(); });
  document.getElementById("sync-now").addEventListener("click", sync);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    try { engine.createIncident(title.value, severity.value); form.reset(); severity.value = "medium"; render(); if (engine.network === "online") await sync(); }
    catch (error) { status.textContent = error.message; }
  });
  list.addEventListener("click", async event => { const button = event.target.closest("[data-retry]"); if (!button) return; await engine.synchronizeOne(button.dataset.retry); render(); });
  document.getElementById("reset-demo").addEventListener("click", () => { engine.reset(); render(); });
  render();
}
