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
 * A third way in needs no folder at all: the Big Copilot Link mod serves the
 * running game's own save bytes on loopback HTTP, and "Link to the game"
 * points the board at it. The base URL is remembered in localStorage and the
 * bytes are read like any save; see the game-link section below.
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
  let watchChecking = false;
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
    if (landing) landing.classList.toggle("lg-resume", !!(dirHandle || linkUrl));
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
    btn.disabled = !!readerError || !!attempt || busy || !(dirHandle || lastFile || linkUrl);
    const opens = !board && dirHandle && !lastFile;
    btn.textContent = opens ? (pick.dir || pick.name ? "Open chosen save" : "Open newest save") : "Update";
    btn.classList.toggle("primary", opens);
    btn.title = linkUrl ? "Ask the game for its current state" : "Read the newest save from the chosen folder again";
    $("recoverBtn").hidden = !(bad && noted.recover);
    // In linked mode the folder is a way out, not a way back.
    $("recoverBtn").innerHTML = ICON_FOLDER + (linkUrl ? "Choose a folder instead" : "Choose the folder again");
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
      const lb = $("linkBtn");
      fb.className = "lg-btn"; fb.textContent = "Choose save folder";
      if (lb) { lb.className = "lg-btn"; lb.textContent = "Link to the game"; }
      sp.className = "lg-btn lg-pick"; $("savePickText").textContent = "One save file";
      $("menuSourceSlot").append(savePicker, fb, ...(lb ? [lb] : []), sp);
      $("watchBtn").addEventListener("click", toggleWatch);
      syncWatchBtn();
      $("menuChipSlot").appendChild($("localeChip"));
      if ($("saveLocation")) $("help").querySelector(".help-content").prepend($("saveLocation"));
      $("help").open = false;
      $("menuHelpSlot").appendChild($("help"));
      // The project links used to be carried from the landing into this menu and
      // copied into the board's footer. The board has its own full footer now,
      // the Impressum and privacy notice included, so only Forget history, which
      // belongs to the save history rather than to the footer, still moves.
      $("forgetHistory").className = "lg-text";
      $("menuFootSlot").append($("forgetHistory"));
      // The hidden pickers must outlive the landing.
      document.body.append($("folderPick"), $("localePick"));
      wireMenu();
      // The board's own script finds its sphere and wordmark by class; the
      // landing's must not be there to be found first.
      stopLanding();
      $("landing").remove();
    } else {
      const ret = !!dirHandle;
      const lb = $("linkBtn");
      sp.className = "link lg-pick";
      if (ret) {
        // A remembered folder: the strip carries the actions as the design
        // draws them: Open newest save, Change folder, one file. The link
        // rides along, so a folder player can still switch to the game.
        fb.className = "btn2"; fb.textContent = "Change folder";
        if (lb) { lb.className = "btn2"; lb.textContent = "Link to the game"; }
        $("savePickText").textContent = "one file";
        $("srcActions").append(savePicker, fb, sp);
        if (lb) $("srcActions").append(lb);
        $("entryRow").hidden = true;
        // Keep the restore message ahead of the platform-specific folder help.
        if ($("saveLocation")) $("srcSlot").after($("saveLocation"));
      } else {
        fb.className = "btn"; fb.innerHTML = ICON_FOLDER + "Choose the folder";
        $("savePickText").textContent = "or one save file";
        // The link button keeps its place between the two, as the landing
        // lays them out; a page without it (a cached older one) loses only
        // the button, never the row.
        $("entryRow").append(...(lb ? [fb, lb, sp] : [fb, sp]));
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
    window.BigCopilotCommunity?.start();
    window.scrollTo(0, 0);
    if (focusLeaves && document.activeElement === document.body) $("nav").querySelector("a.on").focus();
  }

  /* --- the game link (docs/game-link-api.md) ---------------------------- */
  // The Big Copilot Link mod (Steam Workshop) serves the running game's own
  // save bytes on loopback HTTP; docs/game-link-api.md is the contract. The
  // bytes are a normal .hsg, so once they are here everything is the folder
  // path's: only where they come from is different. One watcher, two sources,
  // in checkFolder(): the folder's scan, or the link's /health.
  const LINK_KEY = "ledger_link";
  const LINK_POLL_MS = 1000;
  let linkUrl = null;     // the mod's base URL while the link is the source
  let lastLinkStamp = ""; // the stamp of the bytes behind the board on screen
  let linkHealth = null;  // the /health body behind those bytes, for the strip
  let linkGone = false;   // the watcher has said the game went away
  let linkNotReady = 0;   // /health answers in a row that were never health, any caller
  let linkPortSaid = false;  // the watcher has said the port no longer answers as the mod
  let linkSpace = null;   // the targetAddressSpace this browser accepted, "" for none
  // Every wait the link takes. Tests swap this rather than sleep.
  let linkWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // The mod's default port. #link=http://127.0.0.1:8323 in the address moves
  // it, for the player running a second install; there is no UI on purpose.
  const LINK_DEFAULT = "http://127.0.0.1:8322";
  function linkBase() {
    const given = /[#&]link=([^&]+)/.exec(location.hash || "");
    if (!given) return LINK_DEFAULT;
    // Only this machine: the bytes are the player's whole company, and a
    // link in a pasted address must never point the page at someone else.
    try {
      const url = new URL(decodeURIComponent(given[1]));
      const host = url.hostname.replace(/^\[|\]$/g, "");
      if (url.protocol === "http:" && (host === "127.0.0.1" || host === "localhost" || host === "::1")) {
        return url.origin;
      }
    } catch (e) {}
    return LINK_DEFAULT;
  }

  async function linkFetch(path, init) {
    // A public page's fetch to loopback is a site permission in Chrome and
    // Edge, and the call has to name the address space: "loopback" from
    // Chrome 145, "local" in the builds before that know it, and a browser
    // that knows neither throws the unknown value back as a TypeError. The
    // spelling that works is remembered, so the player answers the prompt
    // once, not once per call. No credentials, ever.
    const spaces = linkSpace === null ? ["loopback", "local", ""] : [linkSpace];
    for (const space of spaces) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const options = Object.assign({credentials: "omit"}, init, {signal: controller.signal});
      if (space) options.targetAddressSpace = space;
      let res;
      try {
        res = await fetch(linkUrl + path, options);
      } catch (err) {
        clearTimeout(timer);
        // Only an unknown annotation is worth spelling another way; a
        // refused connection, or our own timeout, is an answer about the
        // game and not about this call's options. The name, not instanceof:
        // the error can come from another realm than this script's.
        if (err.name === "TypeError" && space && linkSpace === null) continue;
        throw new Error("The game is not running, or the Big Copilot Link mod is not installed.");
      }
      clearTimeout(timer);
      linkSpace = space;
      linkGone = false;  // the mod answered, whatever it said: the watcher's gone note is over
      return res;
    }
    throw new Error("The game is not running, or the Big Copilot Link mod is not installed.");
  }

  function linkLine(health, extra) {
    const h = health || {};
    // minute is a float in the game; the strip shows a clock, not a fraction.
    const at = `${String(h.hour ?? 0).padStart(2, "0")}:${String(Math.floor(h.minute ?? 0)).padStart(2, "0")}`;
    $("srcStrip").title = linkUrl || "";
    return `${h.company || company} · day ${h.day ?? "?"}, ${at} · game link${extra ? ` · ${extra}` : ""}`;
  }

  function linkDown(gen, err) {
    // The shared bad state: the game is closed, the mod is off, or the
    // browser refused the loopback request. linkUrl stays set, so Update
    // and the watcher keep retrying.
    if (gen !== sourceGen) return;
    finishAttempt(gen);
    state("bad", "Could not reach the game", linkUrl);
    note("bad", err.message, "Start the game with the mod enabled and load a save, then click Update.", true);
  }

  function dropLink() {
    // A folder or a file chosen by hand replaces the link as the source, and
    // that choice is remembered too, so the link must not come back on the
    // next visit. The reverse is not cleared: the folder handle stays in
    // IndexedDB, and choosing it again is one click, not one picker trip.
    linkUrl = null;
    lastLinkStamp = "";
    linkHealth = null;
    linkGone = false;
    linkNotReady = 0;
    linkPortSaid = false;
    try { localStorage.removeItem(LINK_KEY); } catch (e) {}
  }

  async function linkToGame() {
    const gen = supersede();
    linkUrl = linkBase();
    // A board built from a folder or an earlier link is not this link's: the
    // first stamp the mod answers has to be read, whatever it is.
    lastLinkStamp = "";
    linkHealth = null;
    linkGone = false;
    linkNotReady = 0;
    linkPortSaid = false;
    stored.set(LINK_KEY, linkUrl);
    dirHandle = null;  // in memory; the remembered handle stays in IndexedDB
    savePicker.hidden = true;
    closeSavePicker();
    lastEntries = null;
    if (!onBoard()) place();
    await loadFromLink("Linking to the game", gen);
  }

  // The one answer this page makes up, for anything that is not a 200 with a
  // JSON object in it: the mod is there and not ready, or something else is
  // on the port for a moment. Compared by identity, so a foreign service
  // answering a body with the same keys is judged like any other. The same
  // rule as the CLI's: only a health object is judged, and a bounded wait of
  // answers that were never health names the port.
  const NOT_READY = Object.freeze({stamp: "", busy: true});
  async function readHealth() {
    const res = await linkFetch("/health");
    if (res.status !== 200) return NOT_READY;
    let body = null;
    try { body = await res.json(); } catch (e) {}
    if (!(body && typeof body === "object" && !Array.isArray(body))) return NOT_READY;
    // A health answer, from whichever caller: the run of never-health is over.
    linkNotReady = 0;
    linkPortSaid = false;
    return body;
  }
  // False when the mod speaks this page's version; otherwise the bad state
  // is on screen and the caller returns. A not-ready answer is not judged.
  function wrongVersion(health, gen) {
    if (health === NOT_READY || health.schemaVersion === 1) return false;
    finishAttempt(gen);
    if (health.schemaVersion == null) {
      // A JSON object with no version in it is not the mod's health at all.
      state("bad", "That address does not answer as the Big Copilot Link mod", linkUrl);
      note("bad", "It answers, but not with the mod's health. Is another program on that port?", "Check the port in the mod's options, then click Update.", true);
    } else {
      state("bad", "The Big Copilot Link mod and this page do not match", linkUrl);
      note("bad", `The mod speaks version ${health.schemaVersion}; this page needs version 1. Update the mod (or the page) and try again.`, "", true);
    }
    return true;
  }

  async function loadFromLink(why, gen) {
    if (gen === undefined) gen = sourceGen;
    if (!startAttempt(gen)) return;
    note("");
    state("busy", why, linkUrl);
    let health;
    try { health = await readHealth(); }
    catch (err) { linkDown(gen, err); return; }
    if (gen !== sourceGen) return;
    if (wrongVersion(health, gen)) return;
    // The mod serializes on the game's main thread and only while the game
    // is not saving, so a first refresh can take a moment to land.
    if (health.stamp === "" || health.busy) {
      const deadline = Date.now() + 30000;
      // The port is blamed only when nothing it said in the whole wait was
      // health: one real answer, busy or empty, means the mod is there.
      let sawHealth = health !== NOT_READY;
      while (health.stamp === "" || health.busy) {
        state("busy", "Waiting for the game to serialize its state", linkUrl);
        if (Date.now() >= deadline) {
          finishAttempt(gen);
          if (!sawHealth) {
            // Thirty seconds of answers that were never health: not the mod.
            state("bad", "That address does not answer as the Big Copilot Link mod", linkUrl);
            note("bad", "It answers, but never with the mod's health. Is another program on that port?", "Check the port in the mod's options, then click Update.", true);
          } else {
            state("bad", "The game has not produced a save yet", linkUrl);
            note("bad", "The mod has had nothing to serve for 30 seconds. Load a save in the game, then click Update.", "", true);
          }
          return;
        }
        await linkWait(LINK_POLL_MS);
        if (gen !== sourceGen) return;
        try { health = await readHealth(); }
        catch (err) { linkDown(gen, err); return; }
        if (gen !== sourceGen) return;
        if (health !== NOT_READY) sawHealth = true;
        // Judged on every real answer: an incompatible mod that is also busy
        // is refused now, not after thirty seconds of waiting.
        if (wrongVersion(health, gen)) return;
      }
    }
    if (health.stamp === lastLinkStamp && onBoard()) {
      finishAttempt(gen);
      state("ok", "No newer state from the game", linkLine(health));
    } else {
      let res;
      try { res = await linkFetch("/save", {headers: lastLinkStamp ? {"If-None-Match": `"${lastLinkStamp}"`} : {}}); }
      catch (err) { linkDown(gen, err); return; }
      if (gen !== sourceGen) return;
      if (res.status === 304) {  // a newer stamp was announced and then overtaken
        finishAttempt(gen);
        state("ok", "No newer state from the game", linkLine(health));
      } else if (!res.ok) {
        // 503 no_save_yet when the city unloaded between the two calls, or a
        // wrong address answering with anything: the reason, not a parse error.
        let why = `The mod answered ${res.status} for the save.`;
        try { const body = await res.json(); if (body && body.error) why = `The mod answered ${res.status} (${body.error}) for the save.`; } catch (e) {}
        if (gen !== sourceGen) return;
        finishAttempt(gen);
        state("bad", "Could not read the game", linkUrl);
        note("bad", why, "Load a save in the game, then click Update.", true);
        return;
      } else {
        const bytes = await res.arrayBuffer();
        if (gen !== sourceGen) return;
        // linkHealth now, not after the build: the strip's line while the
        // bytes are read should be the day they carry.
        linkHealth = health;
        const file = new File([bytes], `${health.character}-live.hsg`,
          {lastModified: Date.parse(health.refreshedAt) || Date.now()});
        file.linkStamp = res.headers.get("X-Game-Link-Stamp") || health.stamp;
        await buildFrom(file, "", gen);
        if (gen !== sourceGen) return;
        // A build that failed keeps its own reason, and the stamp behind it:
        // the next check reads the same bytes again rather than skipping them.
        if (strip.tone !== "bad") lastLinkStamp = file.linkStamp;
      }
    }
    lastCheck = Date.now();
    armWatch();  // polling /health is also what keeps the mod attached
  }

  const LINK_REFUSE = {
    saving: "The game is saving right now",
    placement: "The game cannot save while you are placing items",
    interior: "The game cannot save while the interior designer is open",
    casino: "The game cannot save on the casino boat",
    other: "The game cannot save right now",
  };

  async function refreshFromGame() {
    // Update in linked mode: ask the mod to serialize now, watch the stamp
    // move, then read. A refusal keeps the board -- the game's own next save
    // brings the bytes anyway.
    const gen = sourceGen;
    if (!startAttempt(gen)) return;  // one Update at a time, like the folder's
    state("busy", "Asking the game for its current state", linkUrl);
    // Throttled (429) covers two cases: a refresh in flight, whose stamp
    // will move on its own, and the quiet window after one, where nothing
    // will. So a throttle is waited out and the request made once more;
    // whatever the second answer is, it is handled like the first, and a
    // second throttle means a refresh really is in flight.
    let before = lastLinkStamp;
    for (let attempt = 0; attempt < 2; attempt++) {
      let res;
      try { res = await linkFetch("/refresh", {method: "POST"}); }
      catch (err) { linkDown(gen, err); return; }
      if (gen !== sourceGen) return;
      if (res.status === 202) {
        try { before = (await res.json()).stamp || lastLinkStamp; } catch (e) {}
        break;
      }
      if (res.status === 409) {
        let reason = "other";
        try { reason = (await res.json()).reason || "other"; } catch (e) {}
        finishAttempt(gen);
        // Only a board the link built says "up to date": a folder board has no
        // game state to name, and its own line is still true.
        if (lastLinkStamp) state("ok", "Up to date", linkLine(linkHealth));
        else idleState();
        note("warn", `${LINK_REFUSE[reason] || LINK_REFUSE.other}. Try Update again in a moment.`);
        return;
      }
      if (res.status === 429) {
        if (attempt === 1) break;  // in flight: the poll below catches its stamp
        let retryAfter = 5;
        try { retryAfter = (await res.json()).retryAfter || 5; } catch (e) {}
        const wait = Math.min(20, Math.max(1, retryAfter));
        state("busy", "The game is already serializing", `${linkUrl} · waiting ${wait} s`);
        await linkWait(wait * 1000);
        if (gen !== sourceGen) return;
        continue;
      }
      // 503 main_thread_unavailable, or anything else: the mod is there but
      // did not take the request. Not "the game is not running".
      finishAttempt(gen);
      if (lastLinkStamp) state("ok", "Up to date", linkLine(linkHealth));
      else idleState();
      note("warn", `The mod did not take the refresh (answered ${res.status}). Try Update again in a moment.`);
      return;
    }
    // The mod serializes at its own pace; its health fields say when the
    // stamp has moved and the bytes are worth fetching.
    // Forty-five seconds for a slow serialize; thirty for answers that were
    // never health, the same bound as the first read's, so a wrong service on
    // the port is named in the same time whichever way the page met it.
    const started = Date.now();
    const deadline = started + 45000;
    let health = null;
    // The refresh was answered by something: the mod is there as surely as
    // one health answer would show. What a 202 does not prove is that health
    // follows, so a run of never-health after it is still bounded at thirty.
    let sawHealth = false;
    while (Date.now() < (sawHealth ? deadline : started + 30000)) {
      try { health = await readHealth(); }
      catch (err) { linkDown(gen, err); return; }
      if (gen !== sourceGen) return;
      if (health !== NOT_READY) sawHealth = true;
      if (wrongVersion(health, gen)) return;
      if (health.stamp && health.stamp !== before && !health.busy) break;
      health = null;
      state("busy", "Waiting for the game to serialize its state", linkUrl);
      await linkWait(LINK_POLL_MS);
      if (gen !== sourceGen) return;
    }
    if (!health) {
      finishAttempt(gen);
      if (!sawHealth) {
        state("bad", "That address does not answer as the Big Copilot Link mod", linkUrl);
        note("bad", "It answers, but never with the mod's health. Is another program on that port?", "Check the port in the mod's options, then click Update.", true);
      } else {
        state("bad", "The game did not finish serializing", linkUrl);
        note("bad", "No new state from the mod in 45 seconds. Try Update again.", "", true);
      }
      return;
    }
    await loadFromLink("Reading the game", gen);
  }

  async function checkLink() {
    // The watcher's link half: a quiet /health, and a build only when the
    // game has moved on. A game that went away is said once, under the
    // board that stays, and the next answer clears it.
    const gen = sourceGen;
    const wasGone = linkGone;  // linkFetch clears it the moment the mod answers
    const wasSaid = linkPortSaid;  // readHealth clears it on a health answer
    let health;
    try { health = await readHealth(); }
    catch (err) {
      if (gen !== sourceGen) return;
      // Whatever was said about the port is replaced by the gone note, and
      // is said again after the game is back if the port is still not the mod.
      linkPortSaid = false;
      if (linkGone || strip.tone !== "ok") return;
      linkGone = true;
      note("warn", "The game is not reachable; the board shows its last state.", "It reconnects on its own when the game is back.");
      return;
    }
    if (gen !== sourceGen) return;
    // The game is back, or the port answers as the mod again: whichever note
    // the watcher left is withdrawn, even when the stamp has not moved.
    if ((wasGone || (wasSaid && health !== NOT_READY)) && strip.tone === "ok") note("");
    lastCheck = Date.now();  // the button's "checked HH:MM", per check, like the folder's
    // The CLI's rule, on the watcher: ten checks in a row that were never
    // health mean the port is held by something else, said once under the
    // board that stays; one health answer counts from zero again.
    if (health === NOT_READY) {
      linkNotReady++;
      if (linkNotReady >= 10 && !linkPortSaid && strip.tone === "ok") {
        linkPortSaid = true;
        note("warn", "That address no longer answers as the Big Copilot Link mod.", "Is another program on that port? Check the port in the mod's options, then click Update.");
      }
      return;
    }
    if (health.schemaVersion !== 1) {
      // A JSON object that is not this page's health: another program on the
      // port, or a mod of another version. Said once, under the board that
      // stays; Update gives the full refusal.
      if (!linkPortSaid && strip.tone === "ok") {
        linkPortSaid = true;
        note("warn", health.schemaVersion == null
          ? "That address no longer answers as the Big Copilot Link mod."
          : `The mod now speaks version ${health.schemaVersion}; this page needs version 1.`,
          "Click Update for the details.");
      }
      return;
    }
    if (document.hidden || busy || attempt) return;
    // Nothing yet, or mid-refresh: nothing to build from. The next tick, or
    // Update, looks again.
    if (!health.stamp || health.busy) return;
    if (health.stamp !== lastLinkStamp) await loadFromLink("Reading the game", gen);
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
    // Linked bytes carry their stamp: the strip names the game's state and
    // not the generated file name.
    const line = (extra) => (file.linkStamp ? linkLine(linkHealth, extra) : fileLine(file, extra));
    note("");
    state("busy", `Reading ${file.name}`, line());
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
      state("ok", "Up to date", line(`built in ${((performance.now() - t) / 1000).toFixed(1)} s`));
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
    dropLink();  // a folder chosen here replaces the game link as the source
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
    if (linkUrl) {
      await refreshFromGame();
      return;
    }
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
    if (document.hidden || watchChecking || busy || attempt || readerError) return;
    // One watcher, two sources. typeof rather than a bare read, so the
    // sliced tests can run this function without the link's names.
    if (typeof linkUrl === "string" && linkUrl) {
      // The same guard as the folder's: a visibility change and the interval
      // must not both start a check of the same stamp.
      watchChecking = true;
      try { await checkLink(); } finally { watchChecking = false; }
      syncWatchBtn();
      return;
    }
    if (!dirHandle) return;
    watchChecking = true;
    const gen = sourceGen, handle = dirHandle;
    try {
      const permission = await handle.queryPermission({mode: "read"});
      if (gen !== sourceGen) return;
      if (permission !== "granted") { stopWatch(); return; }
      const entries = await scanHandle(handle);
      if (gen !== sourceGen || document.hidden) return;
      const moved = await refreshSaveMenu(entries, gen);
      if (gen !== sourceGen || document.hidden) return;
      const {file, dir, fellBack} = chooseFrom(entries);
      lastCheck = Date.now();
      if (file && !onScreen(file, dir)) await buildFrom(file, dir, gen);
      if (gen !== sourceGen) return;
      // A character or save that vanished mid-watch is said, not skipped.
      const msg = fellBack ? `Could not find ${fellBack}; showing the newest save instead.` : moved;
      if (msg && strip.tone !== "bad") note("warn", msg);
    } catch (e) {
      // A folder that vanished or a file mid-write; the next check, or Update, says so.
    } finally {
      watchChecking = false;
    }
    syncWatchBtn();
  }
  function armWatch() {
    if (watching && (dirHandle || linkUrl) && !watchTimer) watchTimer = setInterval(checkFolder, WATCH_MS);
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
    b.hidden = !((canHandle && dirHandle) || linkUrl);
    const on = !!watchTimer;
    b.dataset.on = String(on);
    const at = lastCheck ? new Date(lastCheck).toLocaleTimeString(undefined, {hour: "2-digit", minute: "2-digit"}) : "";
    const what = linkUrl ? "the game" : "the folder";
    b.textContent = on ? `Watching ${what}${at ? " · checked " + at : ""}` : `Watch ${what}`;
    b.title = linkUrl
      ? (on
        ? "Asking the game every 30 seconds whether it has a newer state; the board rebuilds when it has. Click to pause."
        : "Ask the game every 30 seconds for a newer state and rebuild when it has one.")
      : (on
        ? "Checking the folder every 30 seconds; the board rebuilds when the game writes a newer save. Click to pause."
        : "Check the folder every 30 seconds and rebuild on every autosave.");
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
      if (!landingLive) return;
      if (REDUCED) { b.px = 0; b.py = 0; b.sc = 1; b.busy = false; paint(); return; }
      dot.classList.remove("kick"); void dot.offsetWidth; dot.classList.add("kick");
      const t0 = performance.now() + 180, dur = 1500, lift = 140;
      const step = (t) => {
        if (!landingLive) return;
        const p = Math.max(0, Math.min(1, (t - t0) / dur)), e = 1 - Math.pow(1 - p, 3);
        b.px = sx * (1 - e); b.py = sy * (1 - e) - Math.sin(p * Math.PI) * lift; b.sc = s0 + (1 - s0) * e; paint();
        if (p < 1) requestAnimationFrame(step); else { b.busy = false; wake(); }
      };
      requestAnimationFrame(step);
    };
    setTimeout(enter, 400);
    document.addEventListener("mousemove", (e) => {
      if (REDUCED || b.busy || !landingLive || !orb.offsetParent) return;
      const r = orb.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1, k = Math.min(36, d * .1);
      b.tx = dx / d * k; b.ty = dy / d * k;
      orb.style.setProperty("--hx", (34 + dx / d * 20) + "%"); orb.style.setProperty("--hy", (32 + dy / d * 20) + "%");
      wake();
    }, {signal: landingEvents.signal});
    let frame = null;
    const wake = () => {
      if (frame === null && landingLive && !REDUCED && !document.hidden && orb.offsetParent)
        frame = requestAnimationFrame(loop);
    };
    const loop = () => {
      frame = null;
      if (!landingLive || document.hidden || !orb.offsetParent || b.busy) return;
      const moving = Math.abs(b.tx - b.px) > .01 || Math.abs(b.ty - b.py) > .01;
      b.px = moving ? b.px + (b.tx - b.px) * .06 : b.tx;
      b.py = moving ? b.py + (b.ty - b.py) * .06 : b.ty;
      paint();
      if (moving) wake();
    };
    landingEvents.signal.addEventListener("abort", () => cancelAnimationFrame(frame), {once:true});
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { cancelAnimationFrame(frame); frame = null; }
      else wake();
    }, {signal: landingEvents.signal});
    // The resting place moves when the window or the fonts do.
    const relayout = () => { if (landingLive) { measure(); paint(); wake(); } };
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
    // A bookmarked Wiki route can remove the landing immediately. Bind its
    // controls before opening that route so save-source setup can finish too.
    offerWiki(landing);
  }

  // The wiki is the game's own help text; it needs no save at all. The way in
  // is offered under the drop zone, but only by a build that carries the wiki:
  // an offer that opened an empty page would be worse than no offer.
  function offerWiki(landing) {
    const board = window.BigCopilotBoard;
    if (!board || !board.hasWiki || !board.hasWiki()) return;
    const row = document.createElement("p");
    // This row is inserted after the landing's reveal pass has collected its
    // elements, so give it the visible state explicitly.
    row.className = "rv in lg-wiki";
    row.style.cssText = "margin:-14px 0 0;font-size:12.5px;color:var(--ink-3)";
    const link = document.createElement("button");
    link.type = "button";
    link.className = "lg-text";
    link.textContent = "Browse the wiki";
    link.title = "The game's own help, read out of the installed game: businesses, products, furniture, recipes and where to buy them.";
    link.addEventListener("click", openWiki);
    row.append(link, document.createTextNode(" — no save needed"));
    ($("entryRow") || landing).after(row);
    // A wiki link opened cold, or reloaded, is the same request as the button:
    // the wiki needs no save, so it opens without waiting for a click.
    if (wikiHash()) openWiki();
    window.addEventListener("hashchange", () => { if (!onBoard() && wikiHash()) openWiki(); });
  }
  const wikiHash = () => /^#wiki(\/|$)/.test(location.hash);
  function openWiki() {
    const board = window.BigCopilotBoard;
    if (!board || !board.browseWiki || !board.browseWiki()) return;
    // The board paints its own navigation first, so entering finds a page.
    enterBoard();
  }

  /* --- wiring ------------------------------------------------------------ */
  window.addEventListener("DOMContentLoaded", async () => {
    wireSaveLocation();
    localeState();
    startWorker();
    if (!canHandle) {
      // Not always the browser: no browser offers folder access off a secure
      // origin, so a self-hosted copy served over plain http loses it too.
      const why = window.isSecureContext
        ? "In this browser the choice is a snapshot; Update opens the picker again."
        : "Watching a folder takes Chrome or Edge on an HTTPS or localhost address, so here the choice is a snapshot; Update opens the picker again.";
      $("folderBtn").title = "Choose the folder named Big Ambitions inside SaveGames. " + why;
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
      dropLink();       // and a folder or file chosen here replaces the game link
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
    if ($("linkBtn")) $("linkBtn").addEventListener("click", linkToGame);
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
    // A game link chosen on an earlier visit outranks the folder it set
    // aside: choosing a folder forgets the link, so a stored link is always
    // the source picked last. A probe that fails leaves the bad state and
    // its note on screen; Update retries it and the folder button takes over.
    const rememberedLink = stored.get(LINK_KEY);
    if (rememberedLink) {
      linkUrl = rememberedLink;
      place();
      paintStrip();
      await loadFromLink("Opening the game link", resumeGen);
      return;
    }
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
