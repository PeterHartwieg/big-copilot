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
 * reopens automatically if access is still granted, or needs one permission
 * click, not the picker. A folder dropped on the page
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

  // This only chooses help text. File access still uses feature detection.
  function savePlatform(nav) {
    const platform = nav.userAgentData?.platform || nav.platform || "";
    const ua = nav.userAgent || "";
    if (/Android|iPhone|iPad|iPod/i.test(platform + " " + ua) ||
        (/Mac/i.test(platform) && nav.maxTouchPoints > 1)) return "other";
    if (/Win/i.test(platform)) return "windows";
    if (/Mac/i.test(platform)) return "mac";
    if (!platform && /Windows/i.test(ua)) return "windows";
    if (!platform && /Macintosh|Mac OS X/i.test(ua)) return "mac";
    return "other";
  }

  function showSaveLocation(platform) {
    const paths = {
      windows: String.raw`%USERPROFILE%\AppData\LocalLow\Hovgaard Games\Big Ambitions\SaveGames\Big Ambitions`,
      mac: "~/Library/Application Support/com.Hovgaard-Games.Big-Ambitions/SaveGames/Big Ambitions/",
    };
    $("savePath").textContent = paths[platform] || "";
    $("savePathRow").hidden = !paths[platform];
    $("savePathCopy").textContent = "Copy";
    $("saveLocationHint").textContent = platform === "windows"
      ? 'Paste this into the folder picker’s File name box and press Enter.'
      : platform === "mac"
        ? "In the folder picker, press Cmd+Shift+G and paste this path (Steam native)."
        : "Select Windows or macOS to find a save on your game computer, or choose a .hsg file you already have. Other installations may store saves elsewhere.";
    $("localeWindows").hidden = platform !== "windows";
    $("localeOther").hidden = platform === "windows";
  }

  function wireSaveLocation() {
    const select = $("savePlatform");
    // A cached older page may load the newest script during a deployment.
    if (!select) return;
    const remembered = stored.get("ledger_save_platform");
    select.value = ["windows", "mac", "other"].includes(remembered) ? remembered : savePlatform(navigator);
    showSaveLocation(select.value);
    $("saveLocationHint").setAttribute("aria-live", "polite");
    select.addEventListener("change", () => {
      showSaveLocation(select.value);
      try { localStorage.setItem("ledger_save_platform", select.value); } catch (e) {}
    });
  }

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
  let lastFileGen = -1;
  let lastGood = null;    // the File behind the board on screen
  let lastGoodDir = "";   // and the character folder it was found in
  let sourceGen = 0;      // bumps when a different folder or file set comes in
  let lastGoodSource = 0; // the sourceGen the board on screen came from
  let dirHandle = null;   // live folder handle, Chromium only
  let lastEntries = null; // {file, dir} for every save and sidecar last seen
  let busy = false;
  let runtimeReady = false;
  // Watching the folder: Chromium only, once read access is granted.
  // The preference survives; the timer does not.
  let watching = stored.get("ledger_watch") !== "off";
  let watchTimer = null;
  let lastCheck = null;
  const WATCH_MS = 30000;
  const pending = new Map();
  let nextId = 1;
  let attempt = null;
  let readerError = null;
  let worker = null;
  const LOAD_TIMEOUT_MS = 120000;

  function finishAttempt(gen) {
    if (attempt && attempt.gen === gen) {
      clearTimeout(attempt.timer);
      attempt = null;
    }
  }
  function startAttempt(gen, restoring = false) {
    if (gen !== sourceGen || readerError) return false;
    if (!attempt) {
      attempt = {gen, restoring, timer: setTimeout(() => {
        failReader(new Error("Loading timed out. Reload the app to try again."));
      }, LOAD_TIMEOUT_MS)};
    }
    if (restoring) attempt.restoring = true;
    return true;
  }
  // Cancel ownership, not the worker's computation. Its late replies are ignored.
  function supersede() {
    finishAttempt(sourceGen);
    sourceGen++;
    busy = false;
    queued = null;
    for (const p of pending.values()) p.reject(new Error("Save selection changed"));
    pending.clear();
    stopWatch();
    return sourceGen;
  }
  function failReader(err) {
    readerError = err;
    supersede();
    if (worker) worker.terminate();
    note("");
    state("bad", "The reader could not finish loading", err.message);
    if (handlers) handlers.stale(err.message);
  }

  // The build stamp on the URL means a deploy is never served a stale worker.
  function startWorker() {
    try { worker = new Worker("worker.js?v=" + (window.LEDGER_BUILD || "dev"), {type: "module"}); }
    catch (err) { failReader(err); return; }
    worker.onmessage = (e) => {
      const msg = e.data;
      if (readerError) return;
      if (!msg || typeof msg.kind !== "string") { failReader(new Error("Invalid reader response.")); return; }
      if (msg.kind === "startup-failed") { failReader(new Error(msg.error)); return; }
      if (msg.kind === "progress") {
        if (msg.stage === "ready") {
          runtimeReady = true;
          if (!attempt && strip.tone === "ready") idleState();
        }
        return;
      }
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      try {
        if (p.gen !== sourceGen) throw new Error("Save selection changed");
        if (msg.kind !== "built") throw new Error(msg.error || "Invalid reader response");
        const data = JSON.parse(msg.data);
        if (!data || typeof data !== "object") throw new Error("Invalid reader response");
        if (typeof msg.history === "string") stored.set(HISTORY_KEY, msg.history);
        p.resolve(data);
      } catch (err) {
        p.reject(err);
      }
    };
    worker.onerror = (e) => { e.preventDefault(); failReader(new Error(e.message || "The reader stopped unexpectedly.")); };
    worker.onmessageerror = () => failReader(new Error("The reader returned an unreadable response."));
  }

  function ask(msg, transfer, gen = sourceGen) {
    return new Promise((resolve, reject) => {
      if (readerError || gen !== sourceGen) { reject(readerError || new Error("Save selection changed")); return; }
      const id = nextId++;
      pending.set(id, {resolve, reject, gen});
      try { worker.postMessage(Object.assign({id}, msg), transfer || []); }
      catch (err) { pending.delete(id); reject(err); }
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
    const restoring = !board && attempt && attempt.restoring && strip.tone === "busy";
    const landing = $("landing");
    if (landing) landing.classList.toggle("lg-resume", !!dirHandle);
    const led = $("srcLed");
    led.className = "led" + (strip.tone === "busy" ? " busy" : bad ? " err" : strip.tone === "ok" ? "" : " lg-dim");
    const st = $("srcStatus");
    st.className = bad ? "err" : "";
    st.textContent = restoring ? "Loading your previous save…"
      : bad && noted.text ? `${strip.head}: ${noted.text.replace(/\.$/, "")}` : strip.head;
    $("srcProg").hidden = strip.tone !== "busy";
    let meta = bad && noted.sub ? noted.sub
      : strip.tone === "busy" && lastGood ? "last good board stays on screen"
      : strip.meta;
    if (watchTimer && strip.tone === "ok") meta += " · watching";
    $("srcMeta").textContent = restoring ? "" : meta;
    const btn = $("updateBtn");
    btn.disabled = !!readerError || !!attempt || busy || !(dirHandle || lastFile);
    const opens = !board && dirHandle && !lastFile;
    btn.textContent = opens ? (pick.dir || pick.name ? "Open chosen save" : "Open newest save") : "Update";
    btn.classList.toggle("primary", opens);
    $("recoverBtn").hidden = !(bad && noted.recover);
    $("reloadBtn").hidden = !readerError;
    // On the landing the strip only shows when it has something to say: a
    // remembered folder, a save being read, a folder that would not read.
    const quietLoad = strip.tone === "busy" && !lastFile && !dirHandle && !attempt;
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
    if (readerError || attempt) return;
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
      $("menuSourceSlot").append(savePicker, fb, sp);
      $("watchBtn").addEventListener("click", toggleWatch);
      syncWatchBtn();
      $("menuChipSlot").appendChild($("localeChip"));
      if ($("saveLocation")) $("help").querySelector(".help-content").prepend($("saveLocation"));
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
        $("srcActions").append(savePicker, fb, sp);
        $("entryRow").hidden = true;
        // Keep the restore message ahead of the platform-specific folder help.
        if ($("saveLocation")) $("srcSlot").after($("saveLocation"));
      } else {
        fb.className = "btn"; fb.innerHTML = ICON_FOLDER + "Choose the folder";
        $("savePickText").textContent = "or one save file";
        $("entryRow").append(fb, sp);
        $("srcActions").prepend(savePicker);
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
      if (!open) closeSavePicker();
      if (typeof window.hideTip === "function") window.hideTip();
    });
    $("srcMenu").addEventListener("click", (e) => e.stopPropagation());
  }
  function closeMenu() {
    const m = $("srcMenu");
    if (!m) return;
    closeSavePicker();
    m.classList.remove("open");
    $("menuBtn").setAttribute("aria-expanded", "false");
  }
  function enterBoard() {
    if (onBoard()) return;
    const focusLeaves = $("landing").contains(document.activeElement);
    document.body.classList.add("has-board");
    place();
    window.scrollTo(0, 0);
    if (focusLeaves && document.activeElement === document.body) $("nav").querySelector("a.on").focus();
  }

  /* --- building ----------------------------------------------------------- */
  async function buildFrom(file, dir, gen) {
    if (gen === undefined) gen = sourceGen;
    if (!startAttempt(gen)) return;
    // A build asked for while one runs is not lost: the latest request, a
    // pick, a folder or a file dropped by hand, runs once this build ends.
    if (busy) { queued = () => buildFrom(file, dir, gen); return; }
    busy = true;
    lastFile = file;
    lastFileGen = gen;
    note("");
    state("busy", `Reading ${file.name}`, fileLine(file));
    const t = performance.now();
    try {
      const bytes = await file.arrayBuffer();
      if (gen !== sourceGen) return;
      const data = await ask({
        kind: "build", name: file.name, bytes, mtime: file.lastModified,
        locale: stored.get(LOCALE_KEY), history: stored.get(HISTORY_KEY),
      }, [bytes], gen);
      if (gen !== sourceGen) return;
      busy = false;
      finishAttempt(gen);
      lastGood = file;
      lastGoodDir = dir || "";
      lastGoodSource = gen;
      company = (data.meta && data.meta.save) || company;
      note("");
      if (handlers) { handlers.stale(""); handlers.changed(data); }
      enterBoard();
      state("ok", "Up to date", fileLine(file, `built in ${((performance.now() - t) / 1000).toFixed(1)} s`));
    } catch (err) {
      if (gen !== sourceGen) return;
      busy = false;
      finishAttempt(gen);
      state("bad", "Could not read the save", `${file.name} · attempted ${fmtTime(Date.now())}`);
      const rewritten = err.name === "NotReadableError";
      note("bad",
        rewritten ? "the game has rewritten this file since it was chosen" : err.message,
        [lastGood ? `Last good board kept · saved ${fmtTime(lastGood.lastModified)}` : "",
         dirHandle && watching && !watchTimer ? "Automatic updates are paused. Click Update to retry." : ""].filter(Boolean).join(" · "),
        true);
      if (handlers) handlers.stale(err.message);
    }
    if (gen !== sourceGen) return;
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
  // Keep the selection model separate from the themed, keyboard-accessible UI.
  saveSel.hidden = true;
  const savePicker = document.createElement("div");
  savePicker.className = "save-picker";
  savePicker.hidden = true;
  savePicker.innerHTML = `<button type="button" class="save-trigger" aria-label="Which save to read" aria-haspopup="listbox" aria-expanded="false" aria-controls="saveOptions">
    ${ICON_FOLDER}<span class="save-current">Newest save anywhere</span><svg class="save-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
    </button><div id="saveOptions" class="save-options" role="listbox" aria-label="Saves" hidden></div>`;
  savePicker.prepend(saveSel);
  const saveTrigger = savePicker.querySelector("button");
  const saveOptions = savePicker.querySelector(".save-options");
  saveTrigger.querySelector("svg").setAttribute("aria-hidden", "true");
  const optionRows = () => [...saveOptions.querySelectorAll('[role="option"]')];
  function closeSavePicker(focus = false) {
    saveOptions.hidden = true;
    saveTrigger.setAttribute("aria-expanded", "false");
    if (focus) saveTrigger.focus();
  }
  function focusSaveOption(row) {
    if (!row) return;
    row.focus({preventScroll: true});
    row.scrollIntoView({block: "nearest"});
  }
  function openSavePicker() {
    saveOptions.hidden = false;
    saveTrigger.setAttribute("aria-expanded", "true");
    focusSaveOption(saveOptions.querySelector('[aria-selected="true"]') || optionRows()[0]);
  }
  function paintSavePicker() {
    const focusedValue = saveOptions.contains(document.activeElement) ? document.activeElement.dataset.value : null;
    const selected = saveSel.selectedOptions[0];
    const label = selected?.dataset.current || selected?.textContent || "Newest save anywhere";
    saveTrigger.querySelector(".save-current").textContent = label;
    saveTrigger.setAttribute("aria-label", `Which save to read: ${label}`);
    saveTrigger.title = label;
    saveOptions.replaceChildren();
    function addOption(option, host) {
      const row = document.createElement("div");
      row.className = "save-option";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(option.selected));
      row.tabIndex = -1;
      row.dataset.value = option.value;
      const title = document.createElement("span");
      title.className = "save-option-title";
      title.textContent = option.dataset.title;
      const detail = document.createElement("span");
      detail.className = "save-option-meta";
      detail.textContent = option.dataset.detail;
      row.append(title, detail);
      host.appendChild(row);
    }
    [...saveSel.children].forEach((child, index) => {
      if (child.tagName === "OPTION") { addOption(child, saveOptions); return; }
      const group = document.createElement("div");
      group.className = "save-group";
      group.setAttribute("role", "group");
      const heading = document.createElement("div");
      heading.className = "save-group-label";
      heading.id = `saveGroup${index}`;
      heading.textContent = child.label;
      group.setAttribute("aria-labelledby", heading.id);
      group.appendChild(heading);
      [...child.children].forEach(option => addOption(option, group));
      saveOptions.appendChild(group);
    });
    if (focusedValue !== null) focusSaveOption(optionRows().find(row => row.dataset.value === focusedValue) || saveOptions.querySelector('[aria-selected="true"]'));
  }
  function chooseSaveOption(row) {
    if (!row) return;
    saveSel.value = row.dataset.value;
    closeSavePicker(true);
    saveSel.dispatchEvent(new Event("change"));
  }
  saveTrigger.addEventListener("click", () => saveOptions.hidden ? openSavePicker() : closeSavePicker(true));
  saveTrigger.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); openSavePicker(); }
  });
  saveOptions.addEventListener("click", e => chooseSaveOption(e.target.closest('[role="option"]')));
  let saveSearch = "", saveSearchAt = 0;
  saveOptions.addEventListener("keydown", e => {
    const rows = optionRows(), index = rows.indexOf(document.activeElement);
    let next;
    if (e.key === "ArrowDown") next = rows[Math.min(index + 1, rows.length - 1)];
    else if (e.key === "ArrowUp") next = rows[Math.max(index - 1, 0)];
    else if (e.key === "Home") next = rows[0];
    else if (e.key === "End") next = rows[rows.length - 1];
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); chooseSaveOption(rows[index]); return; }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeSavePicker(true); return; }
    else if (e.key === "Tab") {
      // Restore the trigger's place in the tab order before the browser advances.
      closeSavePicker(true); return;
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      saveSearch = (now - saveSearchAt < 700 ? saveSearch : "") + e.key.toLowerCase();
      saveSearchAt = now;
      next = rows.find(row => row.querySelector(".save-option-title").textContent.toLowerCase().startsWith(saveSearch));
    }
    if (next) { e.preventDefault(); focusSaveOption(next); }
  });
  document.addEventListener("click", e => { if (!savePicker.contains(e.target)) closeSavePicker(); });
  savePicker.addEventListener("focusout", e => {
    // Pointer-driven focus changes run microtasks before the next focus event.
    // Use the destination when available; defer only for rows replaced by a scan.
    if (e.relatedTarget) {
      if (!savePicker.contains(e.relatedTarget)) closeSavePicker();
      return;
    }
    queueMicrotask(() => { if (!savePicker.contains(document.activeElement)) closeSavePicker(); });
  });
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
    savePicker.hidden = total < 2;
    if (savePicker.hidden) { closeSavePicker(); return moved; }
    saveSel.textContent = "";
    const opt = (parent, value, title, detail, current = title) => {
      const o = document.createElement("option");
      o.value = value; o.textContent = `${title} · ${detail}`;
      Object.assign(o.dataset, {title, detail, current});
      parent.appendChild(o);
    };
    opt(saveSel, pickKey("", ""), "Newest save anywhere", "Follow the latest across all characters");
    for (const g of groups) {
      const og = document.createElement("optgroup");
      og.label = g.character;
      if (g.saves.length > 1) opt(og, pickKey(g.dir, ""), "Newest for this character", "Follow new saves in this folder", `${g.character} · newest`);
      for (const s of g.saves) {
        const title = saveLabel(s.file.name, s.info && {...s.info, day: null});
        const detail = [s.info?.day != null ? `Day ${s.info.day}` : "", fmtTime(s.file.lastModified)].filter(Boolean).join(" · ");
        opt(og, pickKey(g.dir, s.file.name), title, detail, `${g.character} · ${title}`);
      }
      saveSel.appendChild(og);
    }
    saveSel.value = pickKey(pick.dir, pick.name);
    // A character down to one save has no "newest" entry; its one save
    // stands for the folder in the menu, the pick stays the folder.
    if (saveSel.selectedIndex < 0 && home && !pick.name) saveSel.value = pickKey(home.dir, home.saves[0].file.name);
    // Nothing in the menu stands for the pick: the rule follows the menu.
    if (saveSel.selectedIndex < 0) { setPick("", ""); saveSel.value = pickKey("", ""); }
    paintSavePicker();
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
    supersede();
    setPick(dir, name);
    paintSavePicker();
    applyPick();
  });

  async function loadFromEntries(entries, label, moved, gen = sourceGen) {
    if (gen !== sourceGen || readerError) return false;
    const {file, dir, fellBack} = chooseFrom(entries);
    if (!file) {
      finishAttempt(gen);
      state("bad", "No save found", label || "");
      note("bad", "no .hsg save in that folder", "Choose the folder named Big Ambitions inside SaveGames", true);
      return false;
    }
    if (onScreen(file, dir)) {
      finishAttempt(gen);
      state("ok", "No newer save found", fileLine(file));
    } else {
      await buildFrom(file, dir, gen);
    }
    if (gen !== sourceGen) return false;
    // A build that failed keeps its own reason; the move is only worth
    // saying under a board that shows.
    if (strip.tone !== "bad") {
      if (fellBack) note("warn", `Could not find ${fellBack}; showing the newest save instead.`);
      else note(moved ? "warn" : "", moved);
    }
    return strip.tone !== "bad";
  }

  async function loadFromHandle(handle, why) {
    const gen = sourceGen;
    if (!startAttempt(gen)) return;
    note("");
    state("busy", why || "Looking for the save to read", handle.name);
    // A scan that ends after another source was chosen is thrown away, so
    // a slow folder never overwrites a newer one.
    let entries;
    try { entries = await scanHandle(handle); }
    catch (err) {
      if (gen !== sourceGen) return;
      finishAttempt(gen);
      state("bad", "Could not read the folder", handle.name);
      note("bad", err.message, "", true);
      return;
    }
    if (gen !== sourceGen) return;
    const moved = await refreshSaveMenu(entries, gen);
    if (gen !== sourceGen) return;
    if (!(await loadFromEntries(entries, handle.name, moved, gen))) return;
    if (gen !== sourceGen) return;
    lastCheck = Date.now();
    armWatch();  // the folder is readable now, so watching can begin
  }

  async function takeHandle(handle, why, gen) {
    if (gen === undefined) gen = supersede();
    if (gen !== sourceGen) return;
    dirHandle = handle;
    handles.set("saves", handle);
    if (!onBoard()) place();
    await loadFromHandle(handle, why);
  }

  async function pickFolder() {
    if (canHandle) {
      const gen = sourceGen;
      let handle;
      try {
        handle = await window.showDirectoryPicker({id: "ba-saves", mode: "read"});
      } catch (e) { return; }  // the picker was dismissed
      if (gen !== sourceGen) return;
      await takeHandle(handle, "Looking through the folder");
    } else {
      $("folderPick").click();
    }
  }

  async function update() {
    if (busy || attempt || readerError) return;
    if (dirHandle) {
      const handle = dirHandle, gen = sourceGen;
      try {
        // Request from this explicit click, before awaiting unrelated work.
        const asked = await handle.requestPermission({mode: "read"});
        if (gen !== sourceGen || handle !== dirHandle) return;
        if (asked !== "granted") { state("bad", "Folder access was not granted", handle.name); note("bad", "", "", true); return; }
      } catch (err) {
        if (gen !== sourceGen) return;
        state("bad", "Could not access the folder", handle.name);
        note("bad", err.message, "Choose the folder again to restore access.", true);
        return;
      }
      if (!onBoard()) startAttempt(gen, true);
      await loadFromHandle(handle, "Checking for a newer save");
    } else if (canHandle) {
      await pickFolder();
    } else {
      // A file input is a snapshot, so the only honest update is a new pick.
      $("folderPick").click();
    }
  }

  /* --- watching the folder ---------------------------------------------- */
  async function checkFolder() {
    if (!dirHandle || busy || attempt || readerError) return;
    const gen = sourceGen, handle = dirHandle;
    try {
      const permission = await handle.queryPermission({mode: "read"});
      if (gen !== sourceGen) return;
      if (permission !== "granted") { stopWatch(); return; }
      const entries = await scanHandle(handle);
      if (gen !== sourceGen) return;
      const moved = await refreshSaveMenu(entries, gen);
      if (gen !== sourceGen) return;
      const {file, dir, fellBack} = chooseFrom(entries);
      lastCheck = Date.now();
      if (file && !onScreen(file, dir)) await buildFrom(file, dir, gen);
      if (gen !== sourceGen) return;
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

  async function takeLocale(file, rebuild = true) {
    const gen = sourceGen;
    let text;
    try {
      text = await file.text();
      if (gen !== sourceGen) return;
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || !("ba:neighborhood_global" in parsed)) {
        note("warn", "That file is not the game's en.json.", "No ba: keys inside.");
        return;
      }
    } catch (e) {
      if (gen !== sourceGen) return;
      note("warn", "That file is not JSON.");
      return;
    }
    if (stored.set(LOCALE_KEY, text)) note("");
    localeState();
    if (rebuild && lastFile && lastFileGen === gen) buildFrom(lastFile);
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
    wireSaveLocation();
    localeState();
    startWorker();
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
      const wanted = entries.filter((e) => isSave(e.file) || isMeta(e.file));
      const saves = wanted.filter((e) => isSave(e.file));
      if (!saves.length) {
        if (locale) takeLocale(locale.file);
        if (gen !== undefined && gen === sourceGen) {
          finishAttempt(gen);
          state("bad", "No save found");
          note("bad", "No .hsg save in that folder.", "Choose another folder or a save file.", true);
        } else if (!locale) note("warn", "That is neither a .hsg save nor en.json.");
        return;
      }
      if (gen === undefined) gen = supersede();  // a new set of files, whatever its shape
      else if (gen !== sourceGen) return;        // superseded during the walk
      dirHandle = null; // A manual file/snapshot must not be replaced by the old watcher.
      if (!onBoard()) place();
      if (!startAttempt(gen)) return;
      state("busy", "Opening the selected save…");
      if (locale) await takeLocale(locale.file, false);
      if (gen !== sourceGen) return;
      if (fromFolder) {
        const moved = await refreshSaveMenu(wanted, gen);
        if (gen !== sourceGen) return;  // superseded while the sidecars were read
        await loadFromEntries(wanted, "", moved, gen);
      } else {
        if (!dirHandle) { savePicker.hidden = true; closeSavePicker(); lastEntries = null; }
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
      if (!items.length && !files.length) return;
      if (files.length && files.every(isLocale) && !entries.some(en => en && en.isDirectory)) { take(files); return; }
      const gen = supersede(); // Own the drop before resolving its directory handle.
      if (!startAttempt(gen)) return;
      note("");
      state("busy", "Opening the selected save…");
      const dirs = (await Promise.all(asked)).filter((h) => h && h.kind === "directory");
      if (gen !== sourceGen) return;
      if (dirs.length && canHandle) { await takeHandle(dirs[0], "Looking through the folder", gen); return; }
      const dirEntries = entries.filter((en) => en && en.isDirectory);
      if (dirEntries.length) {
        startAttempt(gen);
        state("busy", "Looking through the folder");
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
      takeEntries(entriesOf(files), files.some((f) => f.webkitRelativePath), gen);
    };

    $("folderBtn").addEventListener("click", pickFolder);
    $("recoverBtn").addEventListener("click", pickFolder);
    $("reloadBtn").addEventListener("click", () => location.reload());
    $("savePickLabel").addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("savePick").click(); }
    });
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

    // A folder chosen on an earlier visit: resume when access is still
    // granted. Requesting fresh access stays in the Update click handler.
    const resumeGen = sourceGen;
    wireLanding();
    if (!startAttempt(resumeGen)) return;
    state("busy", "Checking for a previous save…");
    const rememberedHandle = canHandle ? await handles.get("saves") : null;
    if (resumeGen !== sourceGen) return;
    dirHandle = rememberedHandle;
    place();
    paintStrip();
    if (rememberedHandle) {
      let permission;
      try { permission = await rememberedHandle.queryPermission({mode: "read"}); }
      catch (e) {
        if (resumeGen !== sourceGen) return;
        finishAttempt(resumeGen);
        state("bad", "Could not check folder access", rememberedHandle.name);
        note("bad", e.message, "Open the save or choose the folder again.", true);
        return;
      }
      if (resumeGen !== sourceGen || dirHandle !== rememberedHandle) return;
      if (permission === "granted") {
        startAttempt(resumeGen, true);
        await loadFromHandle(rememberedHandle, "Opening the remembered save");
        return;
      }
      finishAttempt(resumeGen);
      idleState();
      note("info", "Allow folder access to reopen your save.");
    } else {
      finishAttempt(resumeGen);
      idleState();
    }
  });
})();
