/* The board's Python, run inside the browser.
 *
 * Boots Pyodide once, copies the two Python files into its virtual filesystem,
 * and then answers two kinds of message from the page:
 *   build  - here is a save (bytes, name, modification time), the locale text
 *            and the history text: parse it and send back the data and the
 *            updated history, both as JSON strings
 *   name   - the player named a factory line: record it and rebuild from the
 *            save already on hand, against the history this worker already
 *            holds (names asked for together each keep theirs)
 *   forget - the player forgot the history: drop the copy held here too
 * Nothing here talks to the network except the one-time runtime download,
 * which comes from this site: Pyodide's core files are served from
 * web/pyodide/ rather than a CDN, so no visitor's IP address reaches a third
 * party (the privacy notice relies on that). Updating Pyodide means adding the
 * new version's folder there; docs/architecture.md lists the files.
 */
const PYODIDE_VERSION = "314.0.6";
const PYODIDE_URL = new URL(`pyodide/v${PYODIDE_VERSION}/`, self.location.href).href;

const SAVE_DIR = "/save";
const DATA_DIR = "/data";
const HISTORY = `${DATA_DIR}/market_history.json`;
const LOCALE = `${DATA_DIR}/en.json`;
const NAMES = `${DATA_DIR}/gametext.json`;  // game text shipped with the page
const BUILDINGS = `${DATA_DIR}/ba_buildings.json`;  // the fixed city map
const CURVES = `${DATA_DIR}/ba_demand_curves.json`;  // the game's arrival curves
const PRICES = `${DATA_DIR}/ba_item_prices.json`;  // furniture and material prices
const RULES = `${DATA_DIR}/ba_store_rules.json`;  // what a store sells and needs

let py = null;
let lastSave = null; // {name, mtime} of the save currently in the filesystem
let localeText = null; // the locale text last written, to skip rewrites
let queue = Promise.resolve(); // rebuilds run one at a time, like the watcher

const say = (stage, detail) => postMessage({kind: "progress", stage, detail: detail || ""});

const ready = (async () => {
  say("runtime", "Loading the Python runtime (about 6 MB the first time)");
  // The page passes its build stamp on this worker's URL; the Python files
  // are fetched with the same stamp so a deploy never mixes old and new.
  const stamp = new URL(self.location.href).searchParams.get("v") || "dev";
  // A stamped URL never changes content (web/_headers caches /py/* for a year),
  // so the browser may keep it; an unstamped dev build always refetches.
  const cache = stamp === "dev" ? "no-store" : "default";
  // Runtime and board files are independent. Start every download now and
  // consume response bodies before joining, instead of paying seven network
  // round trips after the runtime finishes. Promise.all observes both branches
  // immediately, including a download that fails while WebAssembly starts.
  const [runtime, files] = await Promise.all([
    (async () => {
      // A module worker: some embedders refuse a classic importScripts but
      // allow a dynamic import, and every current browser supports this form.
      const {loadPyodide} = await import(PYODIDE_URL + "pyodide.mjs");
      const runtime = await loadPyodide({indexURL: PYODIDE_URL});
      // The page times inactivity, so report completed work before the join.
      say("code", "Loading the board's code");
      return runtime;
    })(),
    (async () => {
      const code = ["ba_save.py", "ba_dashboard.py"].map(async file => {
        const res = await fetch(`py/${file}?v=${stamp}`, {cache});
        if (!res.ok) throw new Error(`could not load ${file}: ${res.status}`);
        return [`/${file}`, await res.text()];
      });
      // An optional table's HTTP failure keeps the existing Python fallback.
      const optional = async (path, response) => {
        const res = await response;
        return res.ok ? [path, await res.text()] : null;
      };
      return Promise.all([
        ...code,
        optional(NAMES, fetch(`py/gametext.json?v=${stamp}`, {cache})),
        optional(BUILDINGS, fetch(`py/ba_buildings.json?v=${stamp}`, {cache})),
        optional(CURVES, fetch(`py/ba_demand_curves.json?v=${stamp}`, {cache})),
        optional(PRICES, fetch(`py/ba_item_prices.json?v=${stamp}`, {cache})),
        optional(RULES, fetch(`py/ba_store_rules.json?v=${stamp}`, {cache})),
      ].map(async task => {
        const file = await task;
        // Each consumed body (or optional HTTP fallback) is real progress,
        // even when runtime startup or another download is still pending.
        say("code", "Loading the board's code");
        return file;
      }));
    })(),
  ]);
  py = runtime;
  say("code", "Loading the board's code");
  py.FS.mkdir(SAVE_DIR);
  py.FS.mkdir(DATA_DIR);
  // The data tables are optional: the board falls back to the name prefix
  // without the city map, states no arrival ceiling without the curves, and
  // prices furniture at what the save says was paid without the price table,
  // and plans no new store without the store rules.
  for (const file of files) {
    if (file) py.FS.writeFile(file[0], file[1]);
  }
  await py.runPythonAsync(`
import sys
sys.path.insert(0, "/")
import ba_save, ba_dashboard
`);
  say("ready", "");
})();
// Report startup failures even before a save request is queued. The build path
// still observes the rejected promise and returns its normal failed response.
ready.catch(err => postMessage({kind: "startup-failed", error: String(err.message || err)}));

function writeText(path, text) {
  if (text) py.FS.writeFile(path, text);
  else { try { py.FS.unlink(path); } catch (e) {} }
}

// The history file as text, or null when there is none to hand back: the
// page then keeps what it has stored.
function heldHistory() {
  try { return py.FS.readFile(HISTORY, {encoding: "utf8"}); } catch (e) { return null; }
}

function placeSave(name, bytes, mtime) {
  if (lastSave) { try { py.FS.unlink(`${SAVE_DIR}/${lastSave.name}`); } catch (e) {} }
  const path = `${SAVE_DIR}/${name}`;
  py.FS.writeFile(path, new Uint8Array(bytes));
  // The board's "saved" stamp reads the file's modification time. Emscripten's
  // utime takes milliseconds, the same unit the browser's File gives.
  py.FS.utime(path, mtime, mtime);
  lastSave = {name, mtime};
  return path;
}

function build(path) {
  // A JSON string crosses the worker boundary cheaply; a proxy would not.
  return py.runPython(`ba_dashboard.browser_build(${JSON.stringify(path)}, ${JSON.stringify(LOCALE)}, ${JSON.stringify(HISTORY)}, ${JSON.stringify(NAMES)})`);
}

onmessage = (e) => {
  const msg = e.data;
  queue = queue.then(async () => {
    try {
      await ready;
      if (msg.kind === "build") {
        // Compared whole: a replacement of the same length is still new.
        if (msg.locale != null && msg.locale !== localeText) {
          writeText(LOCALE, msg.locale);
          localeText = msg.locale;
        }
        writeText(HISTORY, msg.history);
        const path = placeSave(msg.name, msg.bytes, msg.mtime);
        say("build", `Reading ${msg.name}`);
        const t = performance.now();
        const data = build(path);
        // A damaged copy Python set aside (.bad) is dropped by the page too
        // (""), so the next build starts a fresh record, as the CLI does.
        const history = heldHistory();
        const setAside = history === null && py.FS.analyzePath(HISTORY + ".bad").exists;
        if (setAside) py.FS.unlink(HISTORY + ".bad");  // said once, not on every build
        postMessage({kind: "built", id: msg.id, data, history: setAside ? "" : history,
                     ms: Math.round(performance.now() - t)});
      } else if (msg.kind === "name") {
        if (!lastSave) throw new Error("no save loaded yet");
        // The history is the page's only on a build. A name adds to the one
        // held here, which the last build or name wrote: two names asked for
        // together would otherwise each start from the page's copy from before
        // either, and the second would drop the first.
        // JSON.stringify writes JavaScript's null, which Python does not know.
        const pySlug = msg.slug == null ? "None" : JSON.stringify(msg.slug);
        py.runPython(`ba_dashboard.browser_name(${JSON.stringify(HISTORY)}, ${JSON.stringify(msg.rid)}, ${pySlug})`);
        const data = build(`${SAVE_DIR}/${lastSave.name}`);
        postMessage({kind: "built", id: msg.id, data, history: heldHistory(), ms: 0});
      } else if (msg.kind === "forget") {
        writeText(HISTORY, "");
      }
    } catch (err) {
      // Pyodide hands back a whole traceback; the last line is the sentence
      // that matters, minus the exception class in front of it.
      const whole = String(err && err.message || err).trim();
      console.error(whole);  // the whole traceback, for a report from the console
      const lines = whole.split(String.fromCharCode(10));
      const last = lines[lines.length - 1].replace(/^[\w.]+(Error|Exception): /, "");
      postMessage({kind: "failed", id: msg.id, error: last});
    }
  });
};
