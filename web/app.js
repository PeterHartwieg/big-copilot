/* The page side of the in-browser board.
 *
 * Owns the worker, the landing screen, the source strip in the board's header,
 * the locale file, and what the browser remembers between visits. Hands the
 * board its numbers through window.LEDGER_SOURCE, which the board's own
 * script picks up instead of the local server it would otherwise poll.
 *
 * One set of controls, two homes. On the landing the drop zone, the folder
 * button and the one-file link are laid out in full, with the save-location
 * help and the game-text chip under "Where saves live". When a save loads the
 * same elements are moved: the source strip (led, state, file line, Update)
 * into the row under the masthead, everything else into the strip's More
 * menu, and the landing is dropped. The board's own script then owns the
 * masthead, its sphere and the tooltip layer; the landing has a sphere of
 * its own, wired here, that leaves the dot after the wordmark and rests
 * beside the drop zone.
 *
 * Two ways in. Where the browser has the File System Access API (Chrome,
 * Edge) the folder button takes a live directory handle: Update rescans it
 * for the newest save, and the handle is kept in IndexedDB so the next visit
 * needs one permission click, not the picker. A folder dropped on the page
 * gives the same handle. Elsewhere the folder button is a plain directory
 * input, which is a snapshot: Update reopens the picker.
 *
 * Which save. By default the newest .hsg anywhere under the folder, which is
 * the game's own idea of "continue". The save menu narrows that: to one
 * character's folder (its newest save, so autosaves keep flowing) or to one
 * named file. The game writes a small <name>.hsg.meta beside every save with
 * the character's name and the game day, so the menu can label the folders,
 * whose own names are generated ids. The pick is remembered in localStorage
 * and applied to every later scan: Update, the watcher, the next visit.
 */
(function () {
  const LOCALE_KEY = "ledger_locale";
  const HISTORY_KEY = "ledger_history";
  const DB = "ledger";
  const STORE = "handles";
  const $ = (id) => document.getElementById(id);
  const PICK_KEY = "ledger_pick";
  const isSave = (f) => f && /\.hsg$/i.test(f.name);
  const isMeta = (f) => f && /\.hsg\.meta$/i.test(f.name);
  const isLocale = (f) => f && /\.json$/i.test(f.name);
  const canHandle = typeof window.showDirectoryPicker === "function";
  const onBoard = () => document.body.classList.contains("has-board");
  const REDUCED = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const ICON_FOLDER = '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>';

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
  let lastGoodDir = "";   // and the character folder it was found in
  let sourceGen = 0;      // bumps when a different folder or file set comes in
  let lastGoodSource = 0; // the sourceGen the board on screen came from
  let dirHandle = null;   // live folder handle, Chromium only
  let lastEntries = null; // {file, dir} for every save and sidecar last seen
  let busy = false;
  let runtimeReady = false;
  // Watching the folder: Chromium only, and only after this visit's
  // permission click, since the browser lets a page read a folder only
  // after a click. The preference survives; the timer does not.
  let watching = stored.get("ledger_watch") !== "off";
  let watchTimer = null;
  let lastCheck = null;
  const WATCH_MS = 30000;
  const pending = new Map();
  let nextId = 1;

  // The build stamp on the URL means a deploy is never served a stale worker.
  const worker = new Worker("worker.js?v=" + (window.LEDGER_BUILD || "dev"), {type: "module"});
  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.kind === "progress") {
      if (msg.stage === "ready") { runtimeReady = true; if (!busy) idleState(); }
      // A remembered folder keeps its own line while the runtime loads.
      else if (!lastFile && !dirHandle) state("busy", "Preparing the reader…", msg.detail);
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

  /* --- the source strip and its note ------------------------------------ */
  const fmtTime = (ms) => new Date(ms).toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
  // The game writes "Recover #N.hsg" every five minutes; a player never chose
  // that name, so the strip calls it an autosave and leads with the company,
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
    $("srcStrip").title = file.name;
    return `${company ? company + " · " : ""}${what}${extra ? ` · ${extra}` : ""}`;
  };

  // The strip is painted from these: a tone (ok, busy, bad, remembered,
  // ready), a headline, a mono file line; and a note, which in the bad tone
  // is folded into the strip itself (headline: reason, sub as the file line,
  // the recovery button first) and otherwise is a quiet line under it.
  const strip = {tone: "ready", head: "", meta: ""};
  const noted = {tone: "", text: "", sub: "", recover: false};

  function paintStrip() {
    const board = onBoard();
    const bad = strip.tone === "bad";
    const led = $("srcLed");
    led.className = "led" + (strip.tone === "busy" ? " busy" : bad ? " err" : strip.tone === "ok" ? "" : " lg-dim");
    const st = $("srcStatus");
    st.className = bad ? "err" : "";
    st.textContent = bad && noted.text ? `${strip.head}: ${noted.text.replace(/\.$/, "")}` : strip.head;
    $("srcProg").hidden = strip.tone !== "busy";
    let meta = bad && noted.sub ? noted.sub
      : strip.tone === "busy" && lastGood ? "last good board stays on screen"
      : strip.meta;
    if (watchTimer && strip.tone === "ok") meta += " · watching";
    $("srcMeta").textContent = meta;
    const btn = $("updateBtn");
    btn.disabled = busy || !(dirHandle || lastFile);
    const opens = !board && dirHandle && !lastFile;
    btn.textContent = opens ? (pick.dir || pick.name ? "Open chosen save" : "Open newest save") : "Update";
    btn.classList.toggle("primary", opens);
    $("recoverBtn").hidden = !(bad && noted.recover);
    // On the landing the strip only shows when it has something to say: a
    // remembered folder, a save being read, a folder that would not read.
    const quietLoad = strip.tone === "busy" && !lastFile && !dirHandle;
    $("srcStrip").hidden = !board && (strip.tone === "ready" || quietLoad);
    const n = $("srcNote");
    const showNote = !!noted.text && !bad;
    n.hidden = !showNote;
    n.className = "quiet lg-note" + (noted.tone === "warn" ? " warn" : "");
    n.textContent = showNote ? [noted.text, noted.sub].filter(Boolean).join(" ") : "";
  }
  function state(tone, headline, meta) {
    strip.tone = tone; strip.head = headline; strip.meta = meta || "";
    paintStrip();
  }
  function idleState() {
    if (lastGood) state("ok", "Up to date", fileLine(lastGood));
    else if (dirHandle) state("remembered", "Folder remembered", dirHandle.name);
    else state("ready", "No save loaded", runtimeReady ? "ready to read" : "");
  }
  function note(tone, text, sub, recover) {
    noted.tone = tone || ""; noted.text = text || ""; noted.sub = sub || ""; noted.recover = !!recover;
    paintStrip();
  }

  /* --- where the controls live ------------------------------------------ */
  function place() {
    const fb = $("folderBtn"), sp = $("savePickLabel");
    if (onBoard()) {
      const row = $("sourceRow");
      if (row.contains($("srcStrip"))) return;
      row.appendChild($("srcStrip"));
      $("sourceNote").appendChild($("srcNote"));
      $("srcActions").appendChild($("boardControls").content.cloneNode(true));
      fb.className = "lg-btn"; fb.textContent = "Choose save folder";
      sp.className = "lg-btn lg-pick"; $("savePickText").textContent = "One save file";
      $("menuSourceSlot").append(saveSel, fb, sp);
      $("watchBtn").addEventListener("click", toggleWatch);
      syncWatchBtn();
      $("menuChipSlot").appendChild($("localeChip"));
      $("help").open = false;
      $("menuHelpSlot").appendChild($("help"));
      const links = [...$("footSlot").querySelectorAll("a")];
      links.forEach((a) => { a.className = a.id === "sourceLink" ? "lg-text" : "lg-btn"; });
      $("forgetHistory").className = "lg-text";
      $("menuFootSlot").append(...links, $("forgetHistory"));
      // The two project links also live in the board's own footer. Links
      // carry no handlers, so copies are safe.
      const foot = $("footerLinks");
      [$("issueLink"), $("donateLink")].forEach((a) => {
        const c = a.cloneNode(true); c.removeAttribute("id"); c.className = "lg-footlink"; foot.appendChild(c);
      });
      // The hidden pickers must outlive the landing.
      document.body.append($("folderPick"), $("localePick"));
      wireMenu();
      // The board's own script finds its sphere and wordmark by class; the
      // landing's must not be there to be found first.
      stopLanding();
      $("landing").remove();
    } else {
      const ret = !!dirHandle;
      sp.className = "link lg-pick";
      if (ret) {
        // A remembered folder: the strip carries the actions as the design
        // draws them: Open newest save, Change folder, one file.
        fb.className = "btn2"; fb.textContent = "Change folder";
        $("savePickText").textContent = "one file";
        $("srcActions").append(saveSel, fb, sp);
        $("entryRow").hidden = true;
      } else {
        fb.className = "btn"; fb.innerHTML = ICON_FOLDER + "Choose the folder";
        $("savePickText").textContent = "or one save file";
        $("entryRow").append(fb, sp);
        $("srcActions").prepend(saveSel);
        $("entryRow").hidden = false;
      }
    }
  }
  function wireMenu() {
    $("menuBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !$("srcMenu").classList.contains("open");
      $("srcMenu").classList.toggle("open", open);
      $("menuBtn").setAttribute("aria-expanded", String(open));
      if (typeof window.hideTip === "function") window.hideTip();
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
  async function buildFrom(file, dir, gen) {
    // A build asked for while one runs is not lost: the latest request, a
    // pick, a folder or a file dropped by hand, runs once this build ends.
    if (busy) { queued = () => buildFrom(file, dir, gen); return; }
    busy = true;
    if (gen === undefined) gen = sourceGen;  // the source this file came from
    lastFile = file;
    note("");
    state("busy", `Reading ${file.name}`, fileLine(file));
    const t = performance.now();
    try {
      const bytes = await file.arrayBuffer();
      const data = await ask({
        kind: "build", name: file.name, bytes, mtime: file.lastModified,
        locale: stored.get(LOCALE_KEY), history: stored.get(HISTORY_KEY),
      }, [bytes]);
      busy = false;
      lastGood = file;
      lastGoodDir = dir || "";
      lastGoodSource = gen;
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
        rewritten ? "the game has rewritten this file since it was chosen" : err.message,
        lastGood ? `Last good board kept · saved ${fmtTime(lastGood.lastModified)}` : "",
        true);
      if (handlers) handlers.stale(err.message);
    }
    const next = queued;
    queued = null;
    if (next) next();
  }
  // The save on screen, by name, time, folder and source: two characters
  // can hold equally named saves written at the same moment (copies), so the
  // folder counts, and two chosen folders can both put a save at "." so the
  // source counts. After a failed build lastFile is the file that failed,
  // not the board, and the board's save must be read again to put the
  // worker right.
  const onScreen = (file, dir) => !!lastGood && lastFile === lastGood && lastGoodSource === sourceGen
    && file.name === lastGood.name && file.lastModified === lastGood.lastModified && (dir || "") === lastGoodDir;

  /* --- finding the save to read ------------------------------------- */
  // Every save and sidecar is carried as {file, dir}: dir is the character
  // folder's name relative to the chosen folder, "." for files at its top
  // (a player who picks a character folder itself lands there). "" is kept
  // for the pick that means any folder.
  function newestOf(files) {
    const saves = files.filter(isSave);
    if (!saves.length) return null;
    return saves.reduce((a, b) => (b.lastModified > a.lastModified ? b : a));
  }
  // Files from an <input> or a drop know their folder through
  // webkitRelativePath: "<picked folder>/<character>/<file>".
  function entriesOf(files) {
    return files.filter((f) => isSave(f) || isMeta(f) || isLocale(f)).map((f) => {
      const parts = (f.webkitRelativePath || "").split("/");
      return {file: f, dir: parts.length > 2 ? parts.slice(1, -1).join("/") : "."};
    });
  }

  async function scanHandle(handle) {
    const entries = [];
    async function walk(dir, depth, rel) {
      for await (const entry of dir.values()) {
        if (entry.kind === "directory") { if (depth < 3) await walk(entry, depth + 1, rel ? `${rel}/${entry.name}` : entry.name); }
        else if (isSave(entry) || isMeta(entry)) entries.push({file: await entry.getFile(), dir: rel || "."});
      }
    }
    await walk(handle, 0, "");
    return entries;
  }

  // The pick: {dir, name}. Empty dir means any folder; empty name means the
  // newest save within whatever dir allows.
  let pick = {dir: "", name: ""};
  try { pick = Object.assign(pick, JSON.parse(stored.get(PICK_KEY) || "{}")); } catch (e) {}
  const pickKey = (dir, name) => `${dir}|${name}`;
  function setPick(dir, name) {
    pick = {dir: dir || "", name: name || ""};
    try { localStorage.setItem(PICK_KEY, JSON.stringify(pick)); } catch (e) {}
    paintStrip();
  }

  // Applies the pick to a scan. Returns {file, fellBack}: fellBack names what
  // was asked for when it is no longer there and the newest stands in.
  function chooseFrom(entries) {
    let saves = entries.filter((e) => isSave(e.file));
    if (!saves.length) return {file: null, dir: "", fellBack: ""};
    let fellBack = "";
    if (pick.dir) {
      const inDir = saves.filter((e) => e.dir === pick.dir);
      if (inDir.length) saves = inDir;
      else fellBack = "the chosen character's folder";
    }
    if (pick.name && !fellBack) {
      const named = saves.find((e) => e.file.name === pick.name);
      if (named) return {file: named.file, dir: named.dir, fellBack: ""};
      fellBack = `the save named ${pick.name.replace(/\.hsg$/i, "")}`;
    }
    const best = saves.reduce((a, b) => (b.file.lastModified > a.file.lastModified ? b : a));
    return {file: best.file, dir: best.dir, fellBack};
  }

  // The save menu. Groups are character folders, labelled from the sidecars;
  // inside each, the newest-of entry first and then every save, newest first.
  const saveSel = document.createElement("select");
  saveSel.id = "saveSel";
  saveSel.className = "lg-sel";
  saveSel.title = "Which save the board reads. The newest anywhere follows whatever you play; a character keeps to that folder; a named save stays on that file.";
  saveSel.setAttribute("aria-label", "Which save to read");
  saveSel.hidden = true;
  const metaCache = new Map();  // "dir/name@mtime" -> {character, day, autosave}
  async function readMeta(e) {
    const key = `${e.dir}/${e.file.name}@${e.file.lastModified}`;
    if (metaCache.has(key)) return metaCache.get(key);
    let info = null;
    try {
      const m = JSON.parse(await e.file.text());
      const who = m.characterData || m.playerCustomizationData || {};
      info = {character: (who.name || "").trim(), day: m.day, autosave: !!m.isRecoverSave};
    } catch (err) {}
    metaCache.set(key, info);
    return info;
  }
  const saveLabel = (name, info) => {
    const base = name.replace(/\.hsg$/i, "");
    const auto = info ? info.autosave : /^recover/i.test(base);
    const what = auto ? "Autosave " + base.replace(/^recover\s*#?/i, "") : base;
    const day = info && info.day != null ? ` · day ${info.day}` : "";
    return `${what}${day}`;
  };
  async function catalogueOf(entries) {
    const groups = new Map();
    for (const e of entries) {
      if (!groups.has(e.dir)) groups.set(e.dir, {dir: e.dir, character: "", saves: [], newest: 0});
      const g = groups.get(e.dir);
      if (isSave(e.file)) { g.saves.push(e); g.newest = Math.max(g.newest, e.file.lastModified); }
    }
    for (const g of groups.values()) {
      if (!g.saves.length) { groups.delete(g.dir); continue; }
      g.saves.sort((a, b) => b.file.lastModified - a.file.lastModified);
      for (const s of g.saves) {
        const meta = entries.find((e) => e.dir === g.dir && e.file.name === s.file.name + ".meta");
        s.info = meta ? await readMeta(meta) : null;
        if (!g.character && s.info && s.info.character) g.character = s.info.character;
      }
      if (!g.character) {
        const m = g.saves.map((s) => /^New (.+?) Save Game/i.exec(s.file.name)).find(Boolean);
        g.character = m ? m[1].trim() : (g.dir || "this folder");
      }
    }
    return [...groups.values()].sort((a, b) => b.newest - a.newest);
  }
  // Rebuilds the menu from a scan. Returns a sentence when the remembered
  // pick is no longer there (a save deleted or renamed, a folder gone) and
  // says what the pick moved to; the pick itself is moved so the menu and
  // the rule agree.
  async function refreshSaveMenu(entries, gen) {
    const groups = await catalogueOf(entries);
    // Sidecars read for a source that has since been replaced change nothing.
    if (gen !== undefined && gen !== sourceGen) return "";
    lastEntries = entries;
    // The pick is checked against what is there, whether or not the menu
    // shows (it hides for a lone save), so a stale pick never lingers.
    let moved = "";
    const home = groups.find((g) => g.dir === pick.dir);
    const pool = home ? home.saves : groups.flatMap((g) => g.saves);
    if (pick.dir && !home) {
      moved = "Could not find the chosen character's folder; following the newest save anywhere instead.";
      setPick("", "");
    } else if (pick.name && !pool.some((s) => s.file.name === pick.name)) {
      const was = `the save named ${pick.name.replace(/\.hsg$/i, "")}`;
      if (home) { moved = `Could not find ${was}; following ${home.character}'s newest save instead.`; setPick(pick.dir, ""); }
      else { moved = `Could not find ${was}; following the newest save anywhere instead.`; setPick("", ""); }
    }
    const total = groups.reduce((n, g) => n + g.saves.length, 0);
    saveSel.hidden = total < 2;
    if (saveSel.hidden) return moved;
    saveSel.textContent = "";
    const opt = (parent, value, text) => { const o = document.createElement("option"); o.value = value; o.textContent = text; parent.appendChild(o); return o; };
    opt(saveSel, pickKey("", ""), "Newest save anywhere");
    for (const g of groups) {
      const og = document.createElement("optgroup");
      og.label = g.character;
      if (g.saves.length > 1) opt(og, pickKey(g.dir, ""), `${g.character} · newest`);
      for (const s of g.saves) opt(og, pickKey(g.dir, s.file.name), `${saveLabel(s.file.name, s.info)} · ${fmtTime(s.file.lastModified)}`);
      saveSel.appendChild(og);
    }
    saveSel.value = pickKey(pick.dir, pick.name);
    // A character down to one save has no "newest" entry; its one save
    // stands for the folder in the menu, the pick stays the folder.
    if (saveSel.selectedIndex < 0 && home && !pick.name) saveSel.value = pickKey(home.dir, home.saves[0].file.name);
    // Nothing in the menu stands for the pick: the rule follows the menu.
    if (saveSel.selectedIndex < 0) { setPick("", ""); saveSel.value = pickKey("", ""); }
    return moved;
  }
  // Whatever was asked for while a build ran; the latest request wins.
  let queued = null;
  async function applyPick() {
    if (busy) { queued = applyPick; return; }
    if (dirHandle) await loadFromHandle(dirHandle, "Opening the chosen save");
    else if (lastEntries) await loadFromEntries(lastEntries);
  }
  saveSel.addEventListener("change", () => {
    const [dir, name] = saveSel.value.split("|");
    setPick(dir, name);
    applyPick();
  });

  async function loadFromEntries(entries, label, moved, gen) {
    const {file, dir, fellBack} = chooseFrom(entries);
    if (!file) {
      state("bad", "No save found", label || "");
      note("bad", "no .hsg save in that folder", "Choose the folder named Big Ambitions inside SaveGames", true);
      return false;
    }
    if (onScreen(file, dir)) {
      state("ok", "No newer save found", fileLine(file));
    } else {
      await buildFrom(file, dir, gen);
    }
    // A build that failed keeps its own reason; the move is only worth
    // saying under a board that shows.
    if (strip.tone !== "bad") {
      if (fellBack) note("warn", `Could not find ${fellBack}; showing the newest save instead.`);
      else note(moved ? "warn" : "", moved);
    }
    return true;
  }

  async function loadFromHandle(handle, why) {
    note("");
    state("busy", why || "Looking for the save to read", handle.name);
    // A scan that ends after another source was chosen is thrown away, so
    // a slow folder never overwrites a newer one.
    const gen = sourceGen;
    let entries;
    try { entries = await scanHandle(handle); }
    catch (err) { state("bad", "Could not read the folder", handle.name); note("bad", err.message, "", true); return; }
    if (gen !== sourceGen) return;
    const moved = await refreshSaveMenu(entries, gen);
    if (gen !== sourceGen) return;
    if (!(await loadFromEntries(entries, handle.name, moved, gen))) return;
    lastCheck = Date.now();
    armWatch();  // the folder is readable now, so watching can begin
  }

  async function takeHandle(handle, why) {
    if (handle !== dirHandle) sourceGen++;
    dirHandle = handle;
    handles.set("saves", handle);
    if (!onBoard()) place();
    await loadFromHandle(handle, why);
  }

  async function pickFolder() {
    if (canHandle) {
      let handle;
      try {
        handle = await window.showDirectoryPicker({id: "ba-saves", mode: "read"});
      } catch (e) { return; }  // the picker was dismissed
      await takeHandle(handle, "Looking through the folder");
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
        if (asked !== "granted") { state("bad", "Folder access was not granted", dirHandle.name); note("bad", "", "", true); return; }
      }
      await loadFromHandle(dirHandle, "Checking for a newer save");
    } else if (canHandle) {
      await pickFolder();
    } else {
      // A file input is a snapshot, so the only honest update is a new pick.
      $("folderPick").click();
    }
  }

  /* --- watching the folder ---------------------------------------------- */
  async function checkFolder() {
    if (!dirHandle || busy) return;
    try {
      if (await dirHandle.queryPermission({mode: "read"}) !== "granted") { stopWatch(); return; }
      const gen = sourceGen;
      const entries = await scanHandle(dirHandle);
      if (gen !== sourceGen) return;
      const moved = await refreshSaveMenu(entries, gen);
      if (gen !== sourceGen) return;
      const {file, dir, fellBack} = chooseFrom(entries);
      lastCheck = Date.now();
      if (file && !onScreen(file, dir)) await buildFrom(file, dir, gen);
      // A character or save that vanished mid-watch is said, not skipped.
      const msg = fellBack ? `Could not find ${fellBack}; showing the newest save instead.` : moved;
      if (msg && strip.tone !== "bad") note("warn", msg);
    } catch (e) {
      // A folder that vanished or a file mid-write; the next check, or Update, says so.
    }
    syncWatchBtn();
  }
  function armWatch() {
    if (watching && dirHandle && !watchTimer) watchTimer = setInterval(checkFolder, WATCH_MS);
    syncWatchBtn();
  }
  function stopWatch() {
    clearInterval(watchTimer);
    watchTimer = null;
    syncWatchBtn();
  }
  function syncWatchBtn() {
    paintStrip();
    const b = $("watchBtn");
    if (!b) return;
    b.hidden = !(canHandle && dirHandle);
    const on = !!watchTimer;
    b.dataset.on = String(on);
    const at = lastCheck ? new Date(lastCheck).toLocaleTimeString(undefined, {hour: "2-digit", minute: "2-digit"}) : "";
    b.textContent = on ? `Watching the folder${at ? " · checked " + at : ""}` : "Watch the folder";
    b.title = on
      ? "Checking the folder every 30 seconds; the board rebuilds when the game writes a newer save. Click to pause."
      : "Check the folder every 30 seconds and rebuild on every autosave.";
  }
  async function toggleWatch() {
    if (watchTimer) {
      watching = false;
      try { localStorage.setItem("ledger_watch", "off"); } catch (e) {}
      stopWatch();
      return;
    }
    watching = true;
    try { localStorage.setItem("ledger_watch", "on"); } catch (e) {}
    await update();  // the permission click, the newest save, and then the timer
  }

  /* --- the game's text ----------------------------------------------- */
  function localeState() {
    const has = !!stored.get(LOCALE_KEY);
    const chip = $("localeChip");
    // The page ships the text it needs; a player's own en.json only matters
    // when the game has moved on from the build the page was made against.
    chip.dataset.state = "ok";
    chip.querySelector("span").textContent = has ? "Game text: your en.json" : "Game text built in";
    chip.title = has
      ? "Your own en.json is remembered in this browser and wins over the built-in text. Click to replace it."
      : "Names, recipes and station capacities come with the page. If your game is newer, click to choose its en.json.";
    $("asideEyebrow").textContent = has ? "Game text · remembered on this device" : "Game text";
    $("asideText").innerHTML = has
      ? "Your own <code>en.json</code> is in use, ahead of the text built into the page."
      : "Names, recipes and station capacities come with the page.";
    $("asideQuiet").textContent = has
      ? "Click the chip to replace it."
      : "If your game is newer, click the chip and choose its en.json; it is remembered in this browser and wins over the built-in text.";
    const hint = $("menuChipHint");
    if (hint) hint.textContent = has ? "your en.json is remembered · click to replace" : "built in · choose en.json only if your game is newer";
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

  /* --- the landing: reveal, the drop zone, the sphere ------------------ */
  // The landing's document and window listeners hang off this controller,
  // so dropping the landing drops them too rather than leaving handlers
  // that hold its removed nodes for the life of the page.
  let landingLive = true;
  const landingEvents = new AbortController();
  function stopLanding() { landingLive = false; landingEvents.abort(); }

  // The sphere is the dot grown up. It leaves the dot after the wordmark,
  // arcs over and rests beside the drop zone, watches the pointer and
  // squishes when clicked. The board's own sphere, on the masthead, is the
  // template's; this one is the landing's and dies with it.
  function wireSphere() {
    const landing = $("landing"), orb = $("lgOrb"), dot = $("lgDot"), drop = $("drop");
    if (!landing || !orb || !dot || !drop) return;
    if (!drop.getBoundingClientRect().width) { setTimeout(wireSphere, 200); return; }
    const size = 360;
    const core = orb.querySelector("i"), seam = orb.querySelector("u");
    let p0, rest, top;
    const measure = () => {
      p0 = landing.getBoundingClientRect();
      const d = drop.getBoundingClientRect();
      rest = d.right - p0.left + 48;
      top = d.top - p0.top + d.height / 2 - size / 2;
      orb.style.width = orb.style.height = size + "px";
      orb.style.left = rest + "px"; orb.style.top = top + "px";
    };
    measure();
    const d0 = dot.getBoundingClientRect();
    const sx = d0.left - p0.left + d0.width / 2 - (rest + size / 2);
    const sy = d0.top - p0.top + d0.height / 2 - (top + size / 2);
    const s0 = d0.width / size;
    const b = {px: sx, py: sy, sc: s0, tx: 0, ty: 0, busy: true};
    const paint = () => {
      orb.style.transform = `translate(${b.px.toFixed(1)}px,${b.py.toFixed(1)}px) scale(${b.sc.toFixed(3)})`;
      seam.style.transform = `rotate(${((b.px - sx) / (Math.PI * size) * 360).toFixed(1)}deg)`;
    };
    const squish = () => [core, seam].forEach((el) => { el.classList.remove("squish"); void el.offsetWidth; el.classList.add("squish"); });
    const ring = () => {
      const r = orb.getBoundingClientRect(), i = document.createElement("i");
      i.className = "ring";
      i.style.left = (r.left + window.scrollX) + "px"; i.style.top = (r.top + window.scrollY) + "px";
      i.style.width = r.width + "px"; i.style.height = r.height + "px";
      document.body.appendChild(i); setTimeout(() => i.remove(), 900);
    };
    orb.addEventListener("click", () => { squish(); ring(); });
    paint(); orb.classList.add("live");
    const enter = () => {
      if (REDUCED) { b.px = 0; b.py = 0; b.sc = 1; b.busy = false; paint(); return; }
      dot.classList.remove("kick"); void dot.offsetWidth; dot.classList.add("kick");
      const t0 = performance.now() + 180, dur = 1500, lift = 140;
      const step = (t) => {
        const p = Math.max(0, Math.min(1, (t - t0) / dur)), e = 1 - Math.pow(1 - p, 3);
        b.px = sx * (1 - e); b.py = sy * (1 - e) - Math.sin(p * Math.PI) * lift; b.sc = s0 + (1 - s0) * e; paint();
        if (p < 1) requestAnimationFrame(step); else b.busy = false;
      };
      requestAnimationFrame(step);
    };
    setTimeout(enter, 400);
    document.addEventListener("mousemove", (e) => {
      if (b.busy || !landingLive) return;
      const r = orb.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1, k = Math.min(36, d * .1);
      b.tx = dx / d * k; b.ty = dy / d * k;
      orb.style.setProperty("--hx", (34 + dx / d * 20) + "%"); orb.style.setProperty("--hy", (32 + dy / d * 20) + "%");
    }, {signal: landingEvents.signal});
    const loop = () => {
      if (!landingLive) return;
      if (!b.busy) { b.px += (b.tx - b.px) * .06; b.py += (b.ty - b.py) * .06; paint(); }
      requestAnimationFrame(loop);
    };
    loop();
    // The resting place moves when the window or the fonts do.
    const relayout = () => { if (landingLive) { measure(); paint(); } };
    window.addEventListener("resize", relayout, {signal: landingEvents.signal});
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  }

  // The green dot is a coin: click it and it pays out. The board wires its
  // own dot the same way; this is the landing's.
  function wireCoin() {
    const dot = $("lgDot");
    if (!dot) return;
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      dot.classList.remove("spin"); void dot.offsetWidth; dot.classList.add("spin");
      if (REDUCED) return;
      const r = dot.getBoundingClientRect();
      for (let i = 0; i < 14; i++) {
        const c = document.createElement("i"); c.className = "coin";
        const a = (Math.random() * Math.PI) - Math.PI, d = 60 + Math.random() * 120;
        c.style.left = (r.left + window.scrollX + 1) + "px"; c.style.top = (r.top + window.scrollY + 1) + "px";
        c.style.setProperty("--dx", Math.cos(a) * d + "px"); c.style.setProperty("--dy", (Math.abs(Math.sin(a)) * d + 140) + "px");
        c.style.animationDelay = (Math.random() * .12) + "s";
        document.body.appendChild(c); setTimeout(() => c.remove(), 1400);
      }
    });
  }

  function wireLanding() {
    const landing = $("landing");
    if (!landing) return;
    // Sections arrive: the landing's pieces slide in, staggered, once. The
    // delay is dropped after the arrival, or the drop zone's tilt would lag
    // behind the pointer by it.
    const rv = [...landing.querySelectorAll(".rv")];
    requestAnimationFrame(() => rv.forEach((el, i) => {
      el.style.transitionDelay = (i * 70) + "ms"; el.classList.add("in");
      setTimeout(() => { el.style.transitionDelay = ""; }, 600 + i * 70);
    }));
    // The drop zone tilts toward the pointer, opens on hover (CSS) and on a
    // drag over the page, and is the folder button by another route.
    const drop = $("drop");
    drop.addEventListener("mousemove", (e) => {
      if (REDUCED) return;
      const r = drop.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      drop.style.setProperty("--ry", (x * 10) + "deg"); drop.style.setProperty("--rx", (-y * 8) + "deg");
    });
    drop.addEventListener("mouseleave", () => { drop.style.setProperty("--ry", "0deg"); drop.style.setProperty("--rx", "0deg"); });
    drop.addEventListener("click", pickFolder);
    drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickFolder(); } });
    $("helpLink").addEventListener("click", (e) => { e.preventDefault(); $("help").open = !$("help").open; });
    wireCoin();
    wireSphere();
  }

  /* --- wiring ------------------------------------------------------------ */
  window.addEventListener("DOMContentLoaded", async () => {
    localeState();
    state("busy", "Preparing the reader…", "Loading the Python runtime · about 6 MB, cached after the first visit");
    if (!canHandle) {
      $("folderBtn").title = "Choose the folder named Big Ambitions inside SaveGames. In this browser the choice is a snapshot; Update opens the picker again.";
      $("drop").title = $("folderBtn").title;
    }

    // Entries from a folder (an <input webkitdirectory>, or a folder walked
    // from a drop) feed the menu and the pick. Files chosen by hand are
    // read as they are: no rule applies, and the menu, which described some
    // other folder, is put away unless a live folder handle still backs it.
    // gen: the request's generation when the caller took it before its own
    // asynchronous work (a dropped folder's walk); otherwise a new one.
    const takeEntries = async (entries, fromFolder, gen) => {
      const locale = entries.find((e) => isLocale(e.file));
      if (locale) takeLocale(locale.file);
      const wanted = entries.filter((e) => isSave(e.file) || isMeta(e.file));
      const saves = wanted.filter((e) => isSave(e.file));
      if (!saves.length) { if (!locale) note("warn", "That is neither a .hsg save nor en.json."); return; }
      if (gen === undefined) gen = ++sourceGen;  // a new set of files, whatever its shape
      else if (gen !== sourceGen) return;        // superseded during the walk
      if (fromFolder) {
        const moved = await refreshSaveMenu(wanted, gen);
        if (gen !== sourceGen) return;  // superseded while the sidecars were read
        await loadFromEntries(wanted, "", moved, gen);
      } else {
        if (!dirHandle) { saveSel.hidden = true; lastEntries = null; }
        buildFrom(newestOf(saves.map((e) => e.file)), "", gen);
      }
    };
    const take = (files) => {
      const list = [...files];
      takeEntries(entriesOf(list), list.some((f) => f.webkitRelativePath));
    };
    // A dropped folder: Chromium hands over the same live handle the picker
    // would, so it is remembered and watched like one; elsewhere the folder
    // is walked once for its files, a snapshot like the directory input.
    // Files from a walk carry no webkitRelativePath, so the walk keeps the
    // folder itself: "." for the dropped folder, a name for each one inside.
    const walkEntry = (entry, depth, out, rel) => new Promise((resolve) => {
      if (entry.isFile) { entry.file((f) => { out.push({file: f, dir: rel || "."}); resolve(); }, resolve); return; }
      if (!entry.isDirectory || depth > 3) { resolve(); return; }
      const below = depth === 0 ? "" : rel ? `${rel}/${entry.name}` : entry.name;
      const reader = entry.createReader();
      const batch = () => reader.readEntries(async (entries) => {
        if (!entries.length) { resolve(); return; }
        for (const en of entries) await walkEntry(en, depth + 1, out, below);
        batch();
      }, resolve);
      batch();
    });
    const takeDrop = async (dt) => {
      const items = [...(dt.items || [])].filter((it) => it.kind === "file");
      // Handles and entries must be asked for inside the event, before the
      // transfer is cleared; the waiting can happen after.
      const asked = items.map((it) => typeof it.getAsFileSystemHandle === "function" ? it.getAsFileSystemHandle().catch(() => null) : null);
      const entries = items.map((it) => typeof it.webkitGetAsEntry === "function" ? it.webkitGetAsEntry() : null);
      const files = [...dt.files];
      const dirs = (await Promise.all(asked)).filter((h) => h && h.kind === "directory");
      if (dirs.length && canHandle) { await takeHandle(dirs[0], "Looking through the folder"); return; }
      const dirEntries = entries.filter((en) => en && en.isDirectory);
      if (dirEntries.length) {
        const gen = ++sourceGen;  // taken now: the walk can take seconds
        const out = [];
        for (const en of dirEntries) await walkEntry(en, 0, out, "");
        if (gen !== sourceGen) return;
        // dt.files may list the folder's own files again; the walk has those
        // with their folders, so only files the walk did not see are added.
        const seen = new Set(out.map((e) => `${e.file.name}@${e.file.lastModified}`));
        const loose = files.filter((f) => (isSave(f) || isLocale(f)) && !seen.has(`${f.name}@${f.lastModified}`)).map((f) => ({file: f, dir: "."}));
        takeEntries(out.concat(loose), true, gen);
        return;
      }
      take(files);
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
    // Back from the game: check at once rather than waiting out the interval.
    document.addEventListener("visibilitychange", () => { if (!document.hidden && watchTimer) checkFolder(); });

    // Drop anywhere on the page. On the landing the drop zone opens its
    // folder while a file is over the page.
    const over = (on) => { const d = $("drop"); if (d) d.classList.toggle("lg-over", on); };
    let depth = 0;
    document.addEventListener("dragenter", (e) => { e.preventDefault(); depth++; over(true); });
    document.addEventListener("dragover", (e) => { e.preventDefault(); });
    document.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; over(false); } });
    document.addEventListener("drop", (e) => { e.preventDefault(); depth = 0; over(false); takeDrop(e.dataTransfer); });

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
    if (dirHandle) note("info", `One click opens its ${pick.dir || pick.name ? "chosen" : "newest"} save; your browser may ask for folder access first.`);
    wireLanding();
  });
})();
