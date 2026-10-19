function readPersisted() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { id: "", ...DEFAULTS };
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { id: "", ...DEFAULTS };
  }
}

function readPersistedRaw() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function serializeSelection() {
  return serializeSettings(selection);
}

let persistTimer = null;

let persistDirty = false;

let persistWrites = 0;
function writeLocalCache() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(serializeSelection())); } catch {   }
}
async function pushPersisted() {
  try {
    const res = await apiFetch(SETTINGS_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serializeSelection()),
      keepalive: true,
    });

    persistDirty = !res.ok;
  } catch {

    persistDirty = true;
  }
}
function flushPersist() {
  persistTimer = null;
  writeLocalCache();
  pushPersisted();
}
function schedulePersist() {
  if (persistTimer) return;
  if (typeof window === "undefined" || typeof window.setTimeout !== "function") {
    flushPersist();
    return;
  }
  persistTimer = window.setTimeout(flushPersist, 200);
}

function onPageHideFlush() {
  if (persistTimer && typeof window.clearTimeout === "function") {
    window.clearTimeout(persistTimer);
    flushPersist();
  }
}
function onVisibilityResyncPersist() {
  if (!document.hidden && persistDirty && !persistTimer) schedulePersist();
}

function persistSelection() {
  persistWrites++;
  schedulePersist();
}

async function loadPersisted() {
  let hostSettings = null;
  let hostOk = false;

  const writesAtStart = persistWrites;
  try {
    const res = await apiJson(SETTINGS_URL);

    if (res.ok && !res.error) {
      const data = res.data;
      hostSettings = data && data.settings;

      selection.sidebarPresent = !!(data && data.betterSidebar);

      setAdapterFromHost(data && data.adapter);
      hostOk = true;
    }
  } catch {   }

  const stale = persistWrites !== writesAtStart;
  if (hostOk && hostSettings && typeof hostSettings === "object") {

    if (!stale) {
      Object.assign(selection, sanitizeSettings(hostSettings));
      writeLocalCache();
    }
  } else if (hostOk) {

    const parsedLocal = readPersistedRaw();
    if (!stale) Object.assign(selection, parsedLocal ? sanitizeSettings(parsedLocal) : { id: "", ...DEFAULTS });
    if (parsedLocal) pushPersisted();
  } else {

    if (!stale) Object.assign(selection, readPersisted());
  }

  selection.hostLoaded = true;
  applyEffects();
  emit();
}

function cancelPendingPersist() {
  if (persistTimer && typeof window !== "undefined" && typeof window.clearTimeout === "function") {
    window.clearTimeout(persistTimer);
  }
  persistTimer = null;
}
export {
  persistSelection, loadPersisted, flushPersist, onPageHideFlush, onVisibilityResyncPersist,
  cancelPendingPersist, readPersisted,
};
