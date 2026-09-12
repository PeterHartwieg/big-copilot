/* The board's Python, run inside the browser.
 *
 * Boots Pyodide once, copies the two Python files into its virtual filesystem,
 * and then answers two kinds of message from the page:
 *   build  - here is a save (bytes, name, modification time), the locale text
 *            and the history text: parse it and send back the data and the
 *            updated history, both as JSON strings
 *   name   - the player named a factory line: record it and rebuild from the
 *            save already on hand
 * Nothing here talks to the network except the one-time runtime download.
 */
const PYODIDE_VERSION = "314.0.6";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

const SAVE_DIR = "/save";
const DATA_DIR = "/data";
const HISTORY = `${DATA_DIR}/market_history.json`;
const LOCALE = `${DATA_DIR}/en.json`;
const NAMES = `${DATA_DIR}/gametext.json`;  // game text shipped with the page
const BUILDINGS = `${DATA_DIR}/ba_buildings.json`;  // the fixed city map

let py = null;
let lastSave = null; // {name, mtime} of the save currently in the filesystem
let localeStamp = null; // length of the locale text last written, to skip rewrites
let queue = Promise.resolve(); // rebuilds run one at a time, like the watcher

const say = (stage, detail) => postMessage({kind: "progress", stage, detail: detail || ""});

const ready = (async () => {
  say("runtime", "Loading the Python runtime (about 6 MB the first time)");
  // A module worker: some embedders refuse a classic cross-origin importScripts
  // but allow a dynamic import, and every current browser supports this form.
  const {loadPyodide} = await import(PYODIDE_URL + "pyodide.mjs");
  py = await loadPyodide({indexURL: PYODIDE_URL});
  say("code", "Loading the board's code");
  // The page passes its build stamp on this worker's URL; the Python files
  // are fetched with the same stamp so a deploy never mixes old and new.
  const stamp = new URL(self.location.href).searchParams.get("v") || "dev";
  for (const file of ["ba_save.py", "ba_dashboard.py"]) {
    const res = await fetch(`py/${file}?v=${stamp}`, {cache: "no-store"});
    if (!res.ok) throw new Error(`could not load ${file}: ${res.status}`);
    py.FS.writeFile(`/${file}`, await res.text());
  }
  py.FS.mkdir(SAVE_DIR);
  py.FS.mkdir(DATA_DIR);
  const names = await fetch(`py/gametext.json?v=${stamp}`, {cache: "no-store"});
  if (names.ok) py.FS.writeFile(NAMES, await names.text());
  const buildings = await fetch(`py/ba_buildings.json?v=${stamp}`, {cache: "no-store"});
  if (buildings.ok) py.FS.writeFile(BUILDINGS, await buildings.text());
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

function readText(path) {
  try { return py.FS.readFile(path, {encoding: "utf8"}); } catch (e) { return ""; }
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
        if (msg.locale != null && msg.locale.length !== localeStamp) {
          writeText(LOCALE, msg.locale);
          localeStamp = msg.locale.length;
        }
        writeText(HISTORY, msg.history);
        const path = placeSave(msg.name, msg.bytes, msg.mtime);
        say("build", `Reading ${msg.name}`);
        const t = performance.now();
        const data = build(path);
        postMessage({kind: "built", id: msg.id, data, history: readText(HISTORY),
                     ms: Math.round(performance.now() - t)});
      } else if (msg.kind === "name") {
        if (!lastSave) throw new Error("no save loaded yet");
        writeText(HISTORY, msg.history);
        // JSON.stringify writes JavaScript's null, which Python does not know.
        const pySlug = msg.slug == null ? "None" : JSON.stringify(msg.slug);
        py.runPython(`ba_dashboard.browser_name(${JSON.stringify(HISTORY)}, ${JSON.stringify(msg.rid)}, ${pySlug})`);
        const data = build(`${SAVE_DIR}/${lastSave.name}`);
        postMessage({kind: "built", id: msg.id, data, history: readText(HISTORY), ms: 0});
      }
    } catch (err) {
      // Pyodide hands back a whole traceback; the last line is the sentence
      // that matters, minus the exception class in front of it.
      const lines = String(err && err.message || err).trim().split(String.fromCharCode(10));
      const last = lines[lines.length - 1].replace(/^[\w.]+(Error|Exception): /, "");
      postMessage({kind: "failed", id: msg.id, error: last});
    }
  });
};
