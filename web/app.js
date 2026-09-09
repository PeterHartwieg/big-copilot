/* The page side of the in-browser board.
 *
 * Owns the worker, the source bar at the top, the locale file, and what the
 * browser remembers between visits. Hands the board its numbers through
 * window.LEDGER_SOURCE, which the board's own script picks up instead of the
 * local server it would otherwise poll.
 *
 * Two ways in. Where the browser has the File System Access API (Chrome,
 * Edge) the folder button takes a live directory handle: Update rescans it
 * for the newest save, and the handle is kept in IndexedDB so the next visit
 * needs one permission click, not the picker. Elsewhere the folder button is
 * a plain directory input, which is a snapshot: Update reopens the picker.
 */
(function () {
  const LOCALE_KEY = "ledger_locale";
  const HISTORY_KEY = "ledger_history";
  const DB = "ledger";
  const STORE = "handles";
  const $ = (id) => document.getElementById(id);
  const isSave = (f) => f && /\.hsg$/i.test(f.name);
  const isLocale = (f) => f && /\.json$/i.test(f.name);
  const canHandle = typeof window.showDirectoryPicker === "function";

  const stored = {
    get(key) { try { return localStorage.getItem(key) || ""; } catch (e) { return ""; } },
    set(key, value) {
      try { localStorage.setItem(key, value); return true; }
      catch (e) { note(`Could not remember ${key === HISTORY_KEY ? "history" : "the game text"}: browser storage is full or blocked.`, "warn"); return false; }
    },
  };

  /* A directory handle survives a reload only through IndexedDB. */
  const handles = {
    open() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async get(key) {
      try {
        const db = await this.open();
        return await new Promise((resolve, reject) => {
          const req = db.transaction(STORE).objectStore(STORE).get(key);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
        });
      } catch (e) { return null; }
    },
    async set(key, value) {
      try {
        const db = await this.open();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put(value, key);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      } catch (e) {}
    },
  };

  let handlers = null;    // what the board wants told: changed(data), stale(why), lost()
  let lastFile = null;    // the File most recently built, for rebuilds after naming
  let dirHandle = null;   // live folder handle, Chromium only
  let busy = false;
  const pending = new Map();
  let nextId = 1;

  const worker = new Worker("worker.js", {type: "module"});
  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.kind === "progress") {
      if (msg.stage === "ready") setStatus("ready", "Ready");
      else setStatus("busy", msg.detail);
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.kind === "built") {
      stored.set(HISTORY_KEY, msg.history);
      p.resolve(JSON.parse(msg.data));
    } else {
      p.reject(new Error(msg.error));
    }
  };
  worker.onerror = (e) => setStatus("bad", `The worker failed: ${e.message}`);

  function ask(msg, transfer) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, {resolve, reject});
      worker.postMessage(Object.assign({id}, msg), transfer || []);
    });
  }

  /* --- the source card ---------------------------------------------- */
  const fmtTime = (ms) => new Date(ms).toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

  function setStatus(tone, text) {
    $("srcCard").dataset.tone = tone;
    $("srcStatus").textContent = text;
    const btn = $("updateBtn");
    btn.disabled = busy || !(dirHandle || lastFile);
    btn.textContent = document.body.classList.contains("has-board") || !dirHandle || lastFile
      ? "Update" : "Open newest save";
  }
  function setSource(file, secs) {
    $("srcFile").textContent = file ? file.name : "No save loaded";
    $("srcMeta").textContent = file
      ? `saved ${fmtTime(file.lastModified)}${secs ? ` · built in ${secs} s` : ""}`
      : "";
  }
  function closeMenu() {
    $("srcMenu").classList.remove("open");
    $("menuBtn").setAttribute("aria-expanded", "false");
  }
  function note(text, tone) {
    const el = $("srcNote");
    el.textContent = text;
    el.dataset.tone = tone || "";
    el.hidden = !text;
  }

  async function buildFrom(file) {
    if (busy) return;
    busy = true;
    lastFile = file;
    setSource(file, null);
    setStatus("busy", `Reading ${file.name}`);
    const t = performance.now();
    try {
      const bytes = await file.arrayBuffer();
      const data = await ask({
        kind: "build", name: file.name, bytes, mtime: file.lastModified,
        locale: stored.get(LOCALE_KEY), history: stored.get(HISTORY_KEY),
      }, [bytes]);
      busy = false;
      setSource(file, ((performance.now() - t) / 1000).toFixed(1));
      setStatus("ok", "Up to date");
      note("");
      if (handlers) { handlers.stale(""); handlers.changed(data); }
      if (!document.body.classList.contains("has-board")) {
        document.body.classList.add("has-board");
        closeMenu();
        window.scrollTo(0, 0);
      }
      $("updateBtn").textContent = "Update";
    } catch (err) {
      busy = false;
      setStatus("bad", "Could not read the save");
      note(err.name === "NotReadableError"
        ? "The game has rewritten this file since it was chosen. Choose the folder again."
        : err.message, "bad");
      if (handlers) handlers.stale(err.message);
    }
  }

  /* --- finding the newest save --------------------------------------- */
  function newestOf(files) {
    const saves = files.filter(isSave);
    if (!saves.length) return null;
    return saves.reduce((a, b) => (b.lastModified > a.lastModified ? b : a));
  }

  async function scanHandle(handle) {
    const files = [];
    async function walk(dir, depth) {
      for await (const entry of dir.values()) {
        if (entry.kind === "directory") { if (depth < 3) await walk(entry, depth + 1); }
        else if (isSave(entry)) files.push(await entry.getFile());
      }
    }
    await walk(handle, 0);
    return files;
  }

  async function loadFromHandle(handle, why) {
    setStatus("busy", why || "Looking for the newest save");
    const files = await scanHandle(handle);
    const newest = newestOf(files);
    if (!newest) {
      setStatus("bad", "No save found");
      note("No .hsg save in that folder. Choose the folder named Big Ambitions inside SaveGames.", "warn");
      return;
    }
    if (lastFile && newest.name === lastFile.name && newest.lastModified === lastFile.lastModified) {
      setStatus("ok", `No newer save than ${newest.name}`);
      return;
    }
    await buildFrom(newest);
  }

  async function pickFolder() {
    if (canHandle) {
      let handle;
      try {
        handle = await window.showDirectoryPicker({id: "ba-saves", mode: "read"});
      } catch (e) { return; }  // the picker was dismissed
      dirHandle = handle;
      handles.set("saves", handle);
      await loadFromHandle(handle, "Looking through the folder");
    } else {
      $("folderPick").click();
    }
  }

  async function update() {
    if (busy) return;
    if (dirHandle) {
      const state = await dirHandle.queryPermission({mode: "read"});
      if (state !== "granted") {
        const asked = await dirHandle.requestPermission({mode: "read"});
        if (asked !== "granted") { setStatus("bad", "Folder access was not granted"); return; }
      }
      await loadFromHandle(dirHandle, "Checking for a newer save");
    } else if (canHandle) {
      await pickFolder();
    } else {
      // A file input is a snapshot, so the only honest update is a new pick.
      $("folderPick").click();
    }
  }

  /* --- the game's text ----------------------------------------------- */
  function localeState() {
    const has = !!stored.get(LOCALE_KEY);
    const chip = $("localeChip");
    chip.dataset.state = has ? "ok" : "missing";
    chip.querySelector("span").textContent = has ? "Game text loaded" : "Game text missing";
    chip.title = has
      ? "Product names, recipes and station capacities come from the game's en.json. Click to replace it."
      : "Pick the game's en.json so product names, recipes and station capacities are known. Without it names are slugs.";
  }

  async function takeLocale(file) {
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || !("ba:neighborhood_global" in parsed)) {
        note("That file is not the game's en.json (no ba: keys inside).", "warn");
        return;
      }
    } catch (e) {
      note("That file is not JSON.", "warn");
      return;
    }
    if (stored.set(LOCALE_KEY, text)) note("");
    localeState();
    if (lastFile) buildFrom(lastFile);
  }

  /* --- what the board asks for ----------------------------------------- */
  window.LEDGER_SOURCE = {
    label: "In browser",
    data: async () => {
      if (!lastFile) throw new Error("no save yet");
      const bytes = await lastFile.arrayBuffer();
      return ask({kind: "build", name: lastFile.name, bytes, mtime: lastFile.lastModified,
                  locale: stored.get(LOCALE_KEY), history: stored.get(HISTORY_KEY)}, [bytes]);
    },
    // Resolves to the rebuilt data; the board swaps it in itself.
    name: (rid, slug) => ask({kind: "name", rid, slug: slug || null, history: stored.get(HISTORY_KEY)}),
    watch: (h) => { handlers = h; },
  };

  /* --- wiring ------------------------------------------------------------ */
  window.addEventListener("DOMContentLoaded", async () => {
    localeState();
    setSource(null);
    setStatus("busy", "Starting the Python runtime");
    if (!canHandle) $("folderBtn").title = "Pick the folder named Big Ambitions inside SaveGames. In this browser the choice is a snapshot; Update opens the picker again.";

    const take = (files) => {
      const list = [...files];
      const save = newestOf(list);
      const locale = list.find(isLocale);
      if (locale) takeLocale(locale);
      if (save) {
        const n = list.filter(isSave).length;
        if (n > 1) note(`Newest of ${n} saves: ${save.webkitRelativePath || save.name}.`, "");
        buildFrom(save);
      } else if (!locale) {
        note("That is neither a .hsg save nor en.json.", "warn");
      }
    };

    $("folderBtn").addEventListener("click", pickFolder);
    $("menuBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = $("srcMenu");
      const open = !menu.classList.contains("open");
      menu.classList.toggle("open", open);
      $("menuBtn").setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (e) => { if (!$("srcMenu").contains(e.target)) closeMenu(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
    $("updateBtn").addEventListener("click", update);
    $("folderPick").addEventListener("change", (e) => take(e.target.files));
    $("savePick").addEventListener("change", (e) => take(e.target.files));
    $("localePick").addEventListener("change", (e) => take(e.target.files));
    $("localeChip").addEventListener("click", () => $("localePick").click());

    // Drop anywhere on the page. The veil says so while a file is over it.
    const veil = $("dropVeil");
    let depth = 0;
    document.addEventListener("dragenter", (e) => { e.preventDefault(); depth++; veil.hidden = false; });
    document.addEventListener("dragover", (e) => { e.preventDefault(); });
    document.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; veil.hidden = true; } });
    document.addEventListener("drop", (e) => { e.preventDefault(); depth = 0; veil.hidden = true; take(e.dataTransfer.files); });

    document.querySelectorAll("button.copy").forEach((btn) => btn.addEventListener("click", async () => {
      const text = $(btn.dataset.copy).textContent;
      try { await navigator.clipboard.writeText(text); btn.textContent = "copied"; }
      catch (e) { btn.textContent = "select and copy it"; }
      setTimeout(() => { btn.textContent = "copy"; }, 1800);
    }));
    $("forgetHistory").addEventListener("click", () => {
      try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
      note("History forgotten. The next save starts a fresh record.", "");
    });

    // A folder chosen on an earlier visit: Update brings it back with one
    // permission click. The browser will not grant it without a click.
    if (canHandle) {
      const kept = await handles.get("saves");
      if (kept) {
        dirHandle = kept;
        $("srcFile").textContent = "Folder remembered";
        $("srcMeta").textContent = "one click brings back the newest save";
        setStatus("ready", "Ready");
      }
    }
  });
})();
