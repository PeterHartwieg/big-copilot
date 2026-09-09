/* The page side of the in-browser board.
 *
 * Owns the worker, the landing screen, the source row in the board's header,
 * the locale file, and what the browser remembers between visits. Hands the
 * board its numbers through window.LEDGER_SOURCE, which the board's own
 * script picks up instead of the local server it would otherwise poll.
 *
 * One set of controls, two homes. On the landing the status card, the folder
 * button and the rarer controls are laid out in full. When a save loads the
 * landing is hidden and the same elements are moved: the card and Update into
 * the source row under the masthead, everything else into the More menu.
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
  const onBoard = () => document.body.classList.contains("has-board");

  const stored = {
    get(key) { try { return localStorage.getItem(key) || ""; } catch (e) { return ""; } },
    set(key, value) {
      try { localStorage.setItem(key, value); return true; }
      catch (e) { note("warn", `Could not remember ${key === HISTORY_KEY ? "history" : "the game text"}.`, "Browser storage is full or blocked."); return false; }
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
  let lastGood = null;    // the File behind the board on screen
  let dirHandle = null;   // live folder handle, Chromium only
  let busy = false;
  let runtimeReady = false;
  const pending = new Map();
  let nextId = 1;

  // The build stamp on the URL means a deploy is never served a stale worker.
  const worker = new Worker("worker.js?v=" + (window.LEDGER_BUILD || "dev"), {type: "module"});
  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.kind === "progress") {
      if (msg.stage === "ready") { runtimeReady = true; if (!busy) idleState(); }
      else if (!lastFile) state("busy", "Preparing the reader…", msg.detail);
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
  worker.onerror = (e) => state("bad", "The reader failed to start", e.message);

  function ask(msg, transfer) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, {resolve, reject});
      worker.postMessage(Object.assign({id}, msg), transfer || []);
    });
  }

  /* --- the status card and its note ------------------------------------ */
  const fmtTime = (ms) => new Date(ms).toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
  // The game writes "Recover #N.hsg" every five minutes; a player never chose
  // that name, so the card calls it an autosave and leads with the company,
  // which is read from inside the file. The raw file name stays on hover.
  let company = "";
  const isAutosave = (file) => /^recover/i.test(file.name);
  const fileLine = (file, extra) => {
    const when = fmtTime(file.lastModified);
    const base = file.name.replace(/\.hsg$/i, "");
    const what = isAutosave(file)
      ? `autosave from ${when}`
      : base.toLowerCase() === company.toLowerCase()
      ? `saved ${when}`
      : `${base} saved ${when}`;
    $("srcCard").title = file.name;
    return `${company ? company + " · " : ""}${what}${extra ? ` · ${extra}` : ""}`;
  };

  function state(tone, headline, meta) {
    $("srcCard").dataset.tone = tone;
    $("srcStatus").textContent = headline;
    $("srcMeta").textContent = meta || "";
    const btn = $("updateBtn");
    btn.disabled = busy || !(dirHandle || lastFile);
    btn.textContent = !onBoard() && dirHandle && !lastFile ? "Open newest save →" : "Update";
  }
  function idleState() {
    if (lastGood) state("ok", "Up to date", fileLine(lastGood));
    else if (dirHandle) state("remembered", "Folder remembered", "one click opens its newest save");
    else state("ready", "No save loaded", runtimeReady ? "ready to read" : "");
  }
  function note(tone, text, sub, recover) {
    const el = $("srcNote");
    el.hidden = !text;
    el.dataset.tone = tone || "";
    $("noteText").textContent = text || "";
    $("noteSub").textContent = sub || "";
    $("recoverBtn").hidden = !recover;
  }

  /* --- where the controls live ------------------------------------------ */
  function place() {
    const board = onBoard();
    const landing = $("landing");
    if (board) {
      const row = $("sourceRow");
      if (!row.contains($("srcCard"))) {
        row.appendChild($("srcCard"));
        row.appendChild($("boardControls").content.cloneNode(true));
        $("sourceActions").insertBefore($("updateBtn"), $("srcMenu"));
        $("menuSourceSlot").append($("folderBtn"), $("savePickLabel"));
        $("menuChipSlot").appendChild($("localeChip"));
        $("menuHelpSlot").appendChild($("help"));
        $("menuFootSlot").append(...$("footSlot").children);
        $("sourceNote").appendChild($("srcNote"));
        $("folderBtn").textContent = "Choose save folder";
        $("folderBtn").className = "lg-btn";
        $("help").open = false;
        wireMenu();
      }
    } else {
      const ret = !!dirHandle;
      landing.dataset.visit = ret ? "return" : "first";
      $("welcomeTitle").innerHTML = ret ? "Back to your company." : "Your company,<br>at a glance.";
      $("welcomeLede").textContent = ret
        ? "Your save folder is remembered; open its newest save to bring the board up to date."
        : "Turn your Big Ambitions save into a daily board, built in your browser with nothing uploaded.";
      const fb = $("folderBtn");
      if (ret) {
        fb.textContent = "Choose a different folder";
        fb.className = "lg-btn";
        $("entrySecondary").prepend(fb);
        $("entryActions").prepend($("updateBtn"));
      } else {
        fb.innerHTML = 'Choose save folder <span aria-hidden="true">→</span>';
        fb.className = "lg-btn primary large";
        $("entryActions").prepend(fb);
      }
      $("updateBtn").className = "lg-btn primary large";
    }
  }
  function wireMenu() {
    $("menuBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !$("srcMenu").classList.contains("open");
      $("srcMenu").classList.toggle("open", open);
      $("menuBtn").setAttribute("aria-expanded", String(open));
    });
    $("srcMenu").addEventListener("click", (e) => e.stopPropagation());
  }
  function closeMenu() {
    const m = $("srcMenu");
    if (!m) return;
    m.classList.remove("open");
    $("menuBtn").setAttribute("aria-expanded", "false");
  }
  function enterBoard() {
    if (onBoard()) return;
    document.body.classList.add("has-board");
    place();
    window.scrollTo(0, 0);
  }

  /* --- building ----------------------------------------------------------- */
  async function buildFrom(file) {
    if (busy) return;
    busy = true;
    lastFile = file;
    state("busy", "Reading the save…", fileLine(file));
    if (lastGood) note("info", `${fmtTime(lastGood.lastModified)} snapshot still shown below; the board updates when this save is ready.`);
    else note("");
    const t = performance.now();
    try {
      const bytes = await file.arrayBuffer();
      const data = await ask({
        kind: "build", name: file.name, bytes, mtime: file.lastModified,
        locale: stored.get(LOCALE_KEY), history: stored.get(HISTORY_KEY),
      }, [bytes]);
      busy = false;
      lastGood = file;
      company = (data.meta && data.meta.save) || company;
      note("");
      if (handlers) { handlers.stale(""); handlers.changed(data); }
      enterBoard();
      state("ok", "Up to date", fileLine(file, `built in ${((performance.now() - t) / 1000).toFixed(1)} s`));
    } catch (err) {
      busy = false;
      state("bad", "Could not read the save", `${file.name} · attempted ${fmtTime(Date.now())}`);
      const rewritten = err.name === "NotReadableError";
      note("bad",
        rewritten ? "The game has rewritten this file since it was chosen." : err.message,
        lastGood ? `Last good board kept · saved ${fmtTime(lastGood.lastModified)}` : "",
        true);
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
    state("busy", why || "Looking for the newest save", handle.name);
    let files;
    try { files = await scanHandle(handle); }
    catch (err) { state("bad", "Could not read the folder", handle.name); note("bad", err.message, "", true); return; }
    const newest = newestOf(files);
    if (!newest) {
      state("bad", "No save found", handle.name);
      note("warn", "No .hsg save in that folder.", "Choose the folder named Big Ambitions inside SaveGames.", true);
      return;
    }
    if (lastGood && newest.name === lastGood.name && newest.lastModified === lastGood.lastModified) {
      state("ok", "No newer save found", fileLine(newest));
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
      const have = await dirHandle.queryPermission({mode: "read"});
      if (have !== "granted") {
        const asked = await dirHandle.requestPermission({mode: "read"});
        if (asked !== "granted") { state("bad", "Folder access was not granted", dirHandle.name); return; }
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
    chip.querySelector("span").textContent = has ? "Game text loaded" : "Game text: names only";
    chip.title = has
      ? "Recipes and station capacities come from the game's en.json. Click to replace it."
      : "Product and business names are built in. Choose the game's en.json for recipes and station capacities as well.";
    $("asideEyebrow").textContent = has ? "Remembered on this device" : "One-time set-up";
    $("asideText").innerHTML = has
      ? "Recipes and station capacities are ready."
      : "Product and business names are built in. Choose the game's <code>en.json</code> for recipes and station capacities as well.";
    $("asideQuiet").textContent = has
      ? "Click the chip to replace en.json."
      : "Remembered in this browser. Without it the factory and capacity views stay empty.";
    const hint = $("menuChipHint");
    if (hint) hint.textContent = has ? "en.json remembered · click to replace" : "Choose en.json for recipes and capacities";
  }

  async function takeLocale(file) {
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || !("ba:neighborhood_global" in parsed)) {
        note("warn", "That file is not the game's en.json.", "No ba: keys inside.");
        return;
      }
    } catch (e) {
      note("warn", "That file is not JSON.");
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
    state("busy", "Preparing the reader…", "Loading the Python runtime · about 6 MB, cached after the first visit");
    if (!canHandle) $("folderBtn").title = "Choose the folder named Big Ambitions inside SaveGames. In this browser the choice is a snapshot; Update opens the picker again.";

    const take = (files) => {
      const list = [...files];
      const save = newestOf(list);
      const locale = list.find(isLocale);
      if (locale) takeLocale(locale);
      if (save) buildFrom(save);
      else if (!locale) note("warn", "That is neither a .hsg save nor en.json.");
    };

    $("folderBtn").addEventListener("click", pickFolder);
    $("recoverBtn").addEventListener("click", pickFolder);
    $("updateBtn").addEventListener("click", update);
    $("folderPick").addEventListener("change", (e) => take(e.target.files));
    $("savePick").addEventListener("change", (e) => take(e.target.files));
    $("localePick").addEventListener("change", (e) => take(e.target.files));
    $("localeChip").addEventListener("click", () => $("localePick").click());
    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

    // Drop anywhere on the page. The veil says so while a file is over it.
    const veil = $("dropVeil");
    let depth = 0;
    document.addEventListener("dragenter", (e) => { e.preventDefault(); depth++; veil.hidden = false; });
    document.addEventListener("dragover", (e) => { e.preventDefault(); });
    document.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; veil.hidden = true; } });
    document.addEventListener("drop", (e) => { e.preventDefault(); depth = 0; veil.hidden = true; take(e.dataTransfer.files); });

    document.querySelectorAll("button.copy").forEach((btn) => btn.addEventListener("click", async () => {
      const text = $(btn.dataset.copy).textContent;
      try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; }
      catch (e) { btn.textContent = "Select and copy"; }
      setTimeout(() => { btn.textContent = "Copy"; }, 1800);
    }));
    $("forgetHistory").addEventListener("click", () => {
      try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
      note("info", "History forgotten. The next save starts a fresh record.");
    });

    // A folder chosen on an earlier visit: one click brings back its newest
    // save. The browser will not grant folder access without a click.
    if (canHandle) dirHandle = await handles.get("saves");
    place();
    if (runtimeReady || dirHandle) idleState();
    if (dirHandle) note("info", "Your browser may ask for folder access when you open it.");
  });
})();
