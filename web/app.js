/* The page side of the in-browser board.
 *
 * Owns the worker, the drop zone, the locale file, and what the browser
 * remembers between visits. Hands the board its numbers through
 * window.LEDGER_SOURCE, which the board's own script picks up instead of the
 * local server it would otherwise poll.
 */
(function () {
  const LOCALE_KEY = "ledger_locale";
  const HISTORY_KEY = "ledger_history";
  const $ = (id) => document.getElementById(id);

  const stored = {
    get(key) { try { return localStorage.getItem(key) || ""; } catch (e) { return ""; } },
    set(key, value) {
      try { localStorage.setItem(key, value); return true; }
      catch (e) { note(`Could not remember ${key === HISTORY_KEY ? "history" : "the game text"}: browser storage is full or blocked.`, "warn"); return false; }
    },
  };

  let handlers = null;   // what the board wants told: changed(data), stale(why), lost()
  let lastFile = null;   // the File most recently dropped, for rebuilds after naming
  let pending = new Map();
  let nextId = 1;
  let workerReady = false;

  const worker = new Worker("worker.js", {type: "module"});
  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.kind === "progress") {
      if (msg.stage === "ready") { workerReady = true; status("Ready. Drop a save to begin.", ""); }
      else status(msg.detail, "busy");
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
  worker.onerror = (e) => status(`The worker failed: ${e.message}`, "bad");

  function ask(msg, transfer) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, {resolve, reject});
      worker.postMessage(Object.assign({id}, msg), transfer || []);
    });
  }

  function status(text, tone) {
    const el = $("srcStatus");
    if (!el) return;
    el.textContent = text;
    el.dataset.tone = tone || "";
  }
  function note(text, tone) {
    const el = $("srcNote");
    if (!el) return;
    el.textContent = text;
    el.dataset.tone = tone || "";
    el.hidden = !text;
  }

  async function buildFrom(file) {
    lastFile = file;
    const bytes = await file.arrayBuffer();
    const t = performance.now();
    status(`Reading ${file.name}`, "busy");
    try {
      const data = await ask({
        kind: "build", name: file.name, bytes, mtime: file.lastModified,
        locale: stored.get(LOCALE_KEY), history: stored.get(HISTORY_KEY),
      }, [bytes]);
      const secs = ((performance.now() - t) / 1000).toFixed(1);
      status(`${file.name} · built in ${secs} s`, "");
      if (handlers) { handlers.stale(""); handlers.changed(data); }
      document.body.classList.add("has-board");
    } catch (err) {
      status(`${file.name} could not be read`, "bad");
      note(err.message, "bad");
      if (handlers) handlers.stale(err.message);
    }
  }

  function localeState() {
    const text = stored.get(LOCALE_KEY);
    const el = $("localeState");
    if (!el) return;
    if (text) {
      el.textContent = "Game text loaded";
      el.dataset.tone = "";
    } else {
      el.textContent = "No game text yet: names will be slugs, and recipes and capacities unknown";
      el.dataset.tone = "warn";
    }
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

  window.addEventListener("DOMContentLoaded", () => {
    localeState();
    status("Starting the Python runtime", "busy");

    const zone = $("drop");
    const isSave = (f) => f && /\.hsg$/i.test(f.name);
    const isLocale = (f) => f && /\.json$/i.test(f.name);
    const take = (files) => {
      for (const f of files) {
        if (isSave(f)) buildFrom(f);
        else if (isLocale(f)) takeLocale(f);
        else note(`${f.name} is neither a .hsg save nor en.json.`, "warn");
      }
    };
    ["dragenter", "dragover"].forEach((ev) => document.addEventListener(ev, (e) => {
      e.preventDefault(); zone.classList.add("over");
    }));
    ["dragleave", "drop"].forEach((ev) => document.addEventListener(ev, (e) => {
      e.preventDefault(); zone.classList.remove("over");
    }));
    document.addEventListener("drop", (e) => take(e.dataTransfer.files));
    $("savePick").addEventListener("change", (e) => take(e.target.files));
    // A whole folder: every company keeps its own generated-name folder under
    // the save root and they all look alike, so the page does what the local
    // script does and takes the newest save across all of them. Only that
    // one file is ever read; the rest contribute a name and a date.
    $("folderPick").addEventListener("change", (e) => {
      const saves = [...e.target.files].filter(isSave);
      if (!saves.length) {
        note("No .hsg save in that folder. Pick the folder named Big Ambitions inside SaveGames.", "warn");
        return;
      }
      const newest = saves.reduce((a, b) => (b.lastModified > a.lastModified ? b : a));
      const where = newest.webkitRelativePath || newest.name;
      const when = new Date(newest.lastModified);
      note(`Newest of ${saves.length} saves: ${where}, written ${when.toLocaleString()}.`, "");
      buildFrom(newest);
    });
    $("localePick").addEventListener("change", (e) => take(e.target.files));
    // A hidden folder cannot be browsed to; a copied path pasted into the
    // dialog's File name box opens it. The %USERPROFILE% form is expanded by
    // the dialog itself on Windows.
    document.querySelectorAll("button.copy").forEach((btn) => btn.addEventListener("click", async () => {
      const text = $(btn.dataset.copy).textContent;
      try { await navigator.clipboard.writeText(text); btn.textContent = "copied"; }
      catch (e) { btn.textContent = "select and copy it"; }
      setTimeout(() => { btn.textContent = "copy path"; }, 1800);
    }));
    $("forgetHistory").addEventListener("click", () => {
      try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
      note("History forgotten. The next save starts a fresh record.", "");
    });
  });
})();
