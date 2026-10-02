/* The bug report form, for the hosted site only (docs/bug-report-scope.md).
 *
 * web/app.js loads this file and web/report.css the first time the player
 * clicks Report a bug (the source strip after a failed read, the footer, or
 * Help & feedback on the board), and calls BigCopilotReport.open(context).
 * The local Python build never loads it.
 *
 * What is sent, and where, is decided here and checked again by the Worker
 * (POST /api/report in server/worker.mjs):
 *
 *   - the player's text, the site build (the loaded page's LEDGER_BUILD, never
 *     a fresh version.json), the game build, the browser family and the source
 *     kind go into a public GitHub issue;
 *   - with "Attach technical details" ticked, the error's last line goes into
 *     the issue too, with any path that can name the player masked, and the
 *     whole traceback and three settings (language, theme, platform) go to
 *     private storage; nothing else is read from browser storage;
 *   - with "Attach my save" ticked, the save's bytes as the page read them go
 *     to private storage. Both boxes start unticked on every open.
 *
 * Everything is rendered with textContent; the issue's address is shown only
 * when it is this repository's. Names declared here start br; the whole file is
 * one function, so it adds only window.BigCopilotReport to the page's scope.
 */
(function () {
  "use strict";

  const BR_API = "/api/report";
  const BR_TEXT_MAX = 5000;
  const BR_TRACE_MAX = 100000;
  const BR_THEME_KEY = "ba_dash_theme";  // the footer's Theme (template/board.html)
  const BR_MASK = "<save>";

  /* --- what is sent ---------------------------------------------------------- */

  // The browser family, never the user agent string.
  function brBrowser(nav) {
    const ua = String((nav && nav.userAgent) || "");
    if (/\bEdg(?:e|A|iOS)?\//.test(ua)) return "edge";
    if (/\b(?:Firefox|FxiOS)\//.test(ua)) return "firefox";
    if (/\b(?:Chrome|Chromium|CriOS)\//.test(ua)) return "chrome";
    if (/\bSafari\//.test(ua)) return "safari";
    return "other";
  }

  function brPlatform(nav) {
    const said = String((nav && ((nav.userAgentData && nav.userAgentData.platform) || nav.platform || nav.userAgent)) || "");
    if (/win/i.test(said)) return "windows";
    if (/mac|iphone|ipad|ios/i.test(said)) return "mac";
    if (/linux|android|cros|x11/i.test(said)) return "linux";
    return "other";
  }

  // The settings a report may carry: an allowlist of three, each a fixed word.
  // The history, typed names, searches and the game link's approval are never
  // read here.
  function brSettings(env) {
    let theme = null;
    try { theme = env.storage ? env.storage.getItem(BR_THEME_KEY) : null; } catch (e) { theme = null; }
    const lang = String((env.doc && env.doc.documentElement && env.doc.documentElement.lang) || "");
    return {
      language: /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(lang) ? lang : "en",
      theme: theme === "light" || theme === "dark" ? theme : "auto",
      platform: brPlatform(env.nav),
    };
  }

  // The error's last line is public, so everything in it that can come from
  // the save or name the player is masked first: the save's file name (a game
  // link's is <character>-live.hsg), the company, the worker's /save/ path, a
  // home folder, any quoted value (a KeyError names what it did not find, which
  // can be a name from the save) and any run of hex bytes (the save parser
  // shows the bytes around a fault). The Worker applies the same masks again.
  function brMask(line, names) {
    let out = String(line || "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
    for (const name of names || []) {
      const plain = String(name || "").trim();
      if (plain.length < 3) continue;
      for (const form of new Set([plain, plain.replace(/\.hsg$/i, "")])) {
        if (form.length < 3) continue;
        out = out.replace(new RegExp(form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), BR_MASK);
      }
    }
    return out
      .replace(/\/save\/(?:[^'"`]*?\.hsg\b|[^\s'"`]*)/gi, "/save/" + BR_MASK)
      .replace(/\b[A-Za-z]:[\\/]+Users[\\/]+[^\\/'"`]+/gi, "<home>")
      .replace(/\/(?:Users|home)\/[^/'"`]+/g, "<home>")
      .replace(/^[\s\S]*$/, (all) => brQuotes(all))
      .replace(/\b[0-9a-f]{2}(?:\s+[0-9a-f]{2}){3,}\b/gi, "<bytes>")
      .slice(0, 500);
  }

  // The line the issue shows: the error on screen, unless that is the hex
  // window the save parser adds under its message; then the traceback's last
  // line that says something.
  // browser_build() wraps the parser's message in "(...)", so the window can end
  // in a bracket or a full stop.
  const BR_HEX_LINE = /^[\s([]*[0-9a-f]{2}(?:\s+[0-9a-f]{2})*[\s)\].,]*$/i;
  function brErrorLine(ctx) {
    const said = (text) => String(text || "").split("\n").filter((l) => l.trim() && !BR_HEX_LINE.test(l));
    const own = said(ctx.error);
    const lines = own.length ? own : said(ctx.trace);
    return lines.length ? brMask(lines[lines.length - 1], ctx.names) : "";
  }

  // Every quoted value becomes '…'. Escape-aware (Python writes 'it\'s'), and a
  // quote left open masks the rest of the line: when in doubt, less is shown.
  function brQuotes(line) {
    const marks = "'\"`";
    const marked = line.replace(/[-]/g, "")
      .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, (q) => String.fromCharCode(0xE000 + marks.indexOf(q[0])));
    const open = marked.search(/['"`]/);
    return (open < 0 ? marked : marked.slice(0, open + 1) + "…")
      .replace(/[-]/g, (m) => { const q = marks[m.charCodeAt(0) - 0xE000]; return q + "…" + q; });
  }

  const brBuild = (v) => (Number.isSafeInteger(v) && v > 0 && v < 1000000 ? v : null);
  const brSiteBuild = (v) => (typeof v === "string" && /^[0-9a-f]{10}$/.test(v) ? v : "dev");
  const BR_SOURCES = ["folder", "file", "link", "none"];

  /* The parts of one report, in the order they are sent: [name, value, file
     name]. `choice` is what the form holds: the text, the two boxes, and the
     save's bytes and game build once known. Nothing is attached unless its
     box is ticked. */
  function brParts(ctx, choice, env) {
    const report = {
      // The control characters the Worker would drop go here already: JSON
      // writes each as six bytes, which could push the part past its cap.
      text: String(choice.text || "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, BR_TEXT_MAX),
      siteBuild: brSiteBuild(ctx.siteBuild),
      gameBuild: brBuild(choice.gameBuild),
      browser: brBrowser(env.nav),
      source: BR_SOURCES.includes(ctx.source) ? ctx.source : "none",
    };
    if (choice.details && (ctx.error || ctx.trace)) {
      const masked = brErrorLine(ctx);
      if (masked) report.error = masked;
    }
    const parts = [["report", JSON.stringify(report)]];
    if (choice.details) {
      parts.push(["details", JSON.stringify({
        error: String(ctx.error || ""),
        trace: String(ctx.trace || "").slice(-BR_TRACE_MAX),
        settings: brSettings(env),
      })]);
    }
    if (choice.save && choice.bytes && choice.bytes.byteLength) {
      parts.push(["save", new Blob([choice.bytes], {type: "application/octet-stream"}), "save.hsg"]);
    }
    return parts;
  }

  /* --- the dialog ------------------------------------------------------------- */

  let brDialog = null;
  let brEls = null;
  let brCtx = null;
  let brOpener = null;
  let brBytes = null;   // promise of the save's bytes, or null when none is held
  let brGame = null;    // promise of the game build
  let brKnown = {bytes: undefined, build: undefined};
  let brSent = null;    // {number, url} once this open has filed its issue
  let brBusy = false;
  let brSeq = 0;

  const brEnv = () => ({storage: brStorage(), doc: document, nav: navigator});
  function brStorage() { try { return window.localStorage; } catch (e) { return null; } }

  function brEl(tag, cls, attrs) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
  }

  // The footer's Bugs and feedback link: the Discord support channel, the way
  // out when the API cannot take a report. Read from the page, so this file
  // names no other host.
  function brFeedbackHref() {
    const a = document.querySelector("a[data-sf-feedback]");
    return a ? a.getAttribute("href") : "";
  }

  function brBuildDialog() {
    brDialog = brEl("dialog", "br-dialog", {"aria-labelledby": "brTitle"});
    const form = brEl("form", "br-form", {novalidate: ""});
    const head = brEl("div", "br-head");
    const title = brEl("h2", "", {id: "brTitle"});
    const close = brEl("button", "ibtn br-x", {type: "button"});
    close.textContent = "×";
    close.addEventListener("click", () => brDialog.close());
    head.append(title, close);

    const body = brEl("div", "br-body");
    const intro = brEl("p", "br-intro");
    const err = brEl("p", "br-err");
    const errHead = brEl("span", "br-err-head");
    const errLine = brEl("code", "br-err-line");
    err.append(errHead, errLine);
    const label = brEl("label", "br-label", {for: "brText"});
    const text = brEl("textarea", "br-text", {id: "brText", rows: "6", maxlength: String(BR_TEXT_MAX), "aria-describedby": "brPublic"});
    const pub = brEl("p", "br-public", {id: "brPublic"});
    const box = (id) => {
      const wrap = brEl("div", "br-opt");
      const lab = brEl("label", "br-check");
      const input = brEl("input", "", {type: "checkbox", id, "aria-describedby": id + "Hint"});
      const words = brEl("span", "br-check-words");
      lab.append(input, words);
      const hint = brEl("p", "br-hint", {id: id + "Hint"});
      wrap.append(lab, hint);
      return {wrap, input, words, hint};
    };
    const save = box("brSave");
    const details = box("brDetails");
    const preview = brEl("details", "br-preview");
    const previewHead = brEl("summary");
    const previewBody = brEl("ul", "br-preview-list");
    preview.append(previewHead, previewBody);
    const status = brEl("p", "br-status", {role: "status", "aria-live": "polite"});
    const privacy = brEl("a", "br-privacy", {href: "privacy.html", target: "_blank", rel: "noopener"});
    body.append(intro, err, label, text, pub, save.wrap, details.wrap, preview, status, privacy);

    const foot = brEl("div", "br-foot");
    const cancel = brEl("button", "btn2", {type: "button"});
    cancel.addEventListener("click", () => brDialog.close());
    const send = brEl("button", "btn2 primary", {type: "submit"});
    foot.append(cancel, send);
    form.append(head, body, foot);
    brDialog.append(form);

    form.addEventListener("submit", (event) => { event.preventDefault(); brSend(); });
    save.input.addEventListener("change", brPreview);
    details.input.addEventListener("change", brPreview);
    brDialog.addEventListener("click", (event) => {
      const r = brDialog.getBoundingClientRect();
      if (!brBusy && event.target === brDialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) brDialog.close();
    });
    // Escape waits for a send in flight too.
    brDialog.addEventListener("cancel", (event) => { if (brBusy) event.preventDefault(); });
    brDialog.addEventListener("close", () => {
      if (brOpener && document.contains(brOpener)) brOpener.focus();
      brOpener = null;
      if (!brBusy) brRelease();
    });
    brEls = {title, close, intro, err, errHead, errLine, label, text, pub, save, details, preview, previewHead, previewBody, status, privacy, cancel, send};
    document.body.appendChild(brDialog);
    if (typeof ttOnChange === "function") ttOnChange(() => queueMicrotask(brLabel));
  }

  // The dialog's words, written when it opens and again on a change of language.
  function brLabel() {
    if (!brEls) return;
    const e = brEls;
    e.title.textContent = tt("br.title", "Report a bug");
    e.close.setAttribute("aria-label", tt("br.close", "Close"));
    e.intro.textContent = tt("br.intro", "Tell us what went wrong and what you expected instead. With your save attached, the problem can be reproduced.");
    e.errHead.textContent = tt("br.err.head", "The error on screen:");
    e.label.textContent = tt("br.text.label", "What went wrong?");
    e.text.setAttribute("placeholder", tt("br.text.placeholder", "What you did, what you saw, and what you expected"));
    e.pub.textContent = tt("br.text.public", "This text is published on GitHub, where anyone can read it.");
    e.save.words.textContent = tt("br.save", "Attach my save");
    e.details.words.textContent = tt("br.details", "Attach technical details");
    e.details.hint.textContent = tt("br.details.hint", "The error's last line is published with your text. The full error and your language, theme and system are kept privately for 30 days.");
    e.previewHead.textContent = tt("br.preview", "What is published");
    e.privacy.textContent = tt("br.privacy", "How a bug report is kept and deleted");
    e.cancel.textContent = brSent ? tt("br.close", "Close") : tt("br.cancel", "Cancel");
    e.send.textContent = tt("br.send", "Send report");
    brSaveHint();
    brPreview();
  }

  function brSaveHint() {
    const s = brEls.save;
    const ready = brKnown.bytes;
    s.input.disabled = brBusy || !!brSent || !ready;
    if (!ready) s.input.checked = false;
    s.hint.textContent = ready === undefined ? tt("br.save.wait", "Getting the save ready…")
      : ready ? tt("br.save.hint", "The save is kept privately for 30 days and never published.")
      : tt("br.save.none", "No save is held on this page, so none can be attached.");
  }

  const brSourceWords = (source) => source === "folder" ? tt("br.src.folder", "Save folder")
    : source === "file" ? tt("br.src.file", "One save file")
    : source === "link" ? tt("br.src.link", "Game link")
    : tt("br.src.none", "No save loaded");
  const brBrowserWords = {chrome: "Chrome", edge: "Edge", firefox: "Firefox", safari: "Safari"};

  // The public part, as the issue will show it (the text aside).
  function brPreview() {
    if (!brEls || !brCtx) return;
    const e = brEls;
    const game = brKnown.build === undefined ? tt("br.pv.reading", "reading…") : brKnown.build === null ? tt("br.pv.unknown", "unknown") : String(brKnown.build);
    const browser = brBrowser(navigator);
    const lines = [
      tt("br.pv.site", "Site build: {build}", {build: brSiteBuild(brCtx.siteBuild)}),
      tt("br.pv.game", "Game build: {build}", {build: game}),
      tt("br.pv.browser", "Browser: {name}", {name: brBrowserWords[browser] || tt("br.pv.other", "other")}),
      tt("br.pv.source", "Source: {source}", {source: brSourceWords(brCtx.source)}),
      e.save.input.checked ? tt("br.pv.save.yes", "Save attached: yes, kept privately") : tt("br.pv.save.no", "Save attached: no"),
    ];
    const masked = brCtx.error || brCtx.trace ? brErrorLine(brCtx) : "";
    if (e.details.input.checked && masked) lines.push(tt("br.pv.error", "Error: {line}", {line: masked}));
    e.previewBody.replaceChildren(...lines.map((line) => { const li = brEl("li"); li.textContent = line; return li; }));
  }

  function brStatus(text, link) {
    const s = brEls.status;
    s.textContent = text;
    s.className = "br-status" + (link && link.tone ? " " + link.tone : "");
    if (link && link.href) {
      s.append(" ");
      const a = brEl("a", "", {href: link.href, target: "_blank", rel: "noopener"});
      a.textContent = link.words;
      s.append(a);
    }
  }

  function brLock(on) {
    brBusy = on;
    const e = brEls;
    e.text.disabled = on || !!brSent;
    e.details.input.disabled = on || !!brSent;
    e.send.disabled = on || !!brSent;
    e.send.hidden = !!brSent;
    // A send in flight cannot be called back, so the form stays until it
    // answers: the player then sees the issue it opened, or why not.
    e.cancel.disabled = on;
    e.close.disabled = on;
    brSaveHint();
  }

  function brOpen(ctx, opener) {
    if (!brDialog) brBuildDialog();
    if (typeof brDialog.showModal !== "function") return;
    const seq = ++brSeq;
    brCtx = Object.assign({siteBuild: "dev", source: "none", error: "", trace: "", names: []}, ctx || {});
    brOpener = opener || null;
    brSent = null;
    brBusy = false;
    brKnown = {bytes: undefined, build: undefined};
    const e = brEls;
    e.save.input.checked = false;
    e.details.input.checked = false;
    e.preview.open = false;
    e.err.hidden = !brCtx.error;
    e.errLine.textContent = brCtx.error || "";
    brStatus("");
    brLabel();
    brLock(false);
    brDialog.showModal();
    e.text.focus();
    // The save and its game build arrive on their own: the bytes are quick,
    // the build may need the reader to parse the save again.
    brBytes = Promise.resolve(typeof brCtx.bytes === "function" ? brCtx.bytes() : null).catch(() => null);
    brGame = Promise.resolve(typeof brCtx.gameBuild === "function" ? brCtx.gameBuild() : brCtx.gameBuild).catch(() => null);
    brBytes.then((bytes) => { if (seq === brSeq) { brKnown.bytes = bytes && bytes.byteLength ? bytes : null; brSaveHint(); brPreview(); } });
    brGame.then((build) => { if (seq === brSeq) { brKnown.build = brBuild(build); brPreview(); } });
  }

  // A closed form lets go of the save, the traceback and the pending lookups,
  // so they live no longer than the page's own copy. A send in flight keeps
  // its own snapshot and lets go when it ends.
  function brRelease() {
    brSeq++;
    brCtx = null;
    brBytes = brGame = null;
    brKnown = {bytes: undefined, build: undefined};
  }

  async function brSend() {
    if (brBusy || brSent) return;
    const e = brEls;
    const text = e.text.value.trim();
    if (!text) { brStatus(tt("br.empty", "Describe what went wrong first."), {tone: "bad"}); e.text.focus(); return; }
    const seq = brSeq;
    // What this send is, taken now, so nothing a later open holds can join it.
    const ctx = brCtx, saveOn = e.save.input.checked, detailsOn = e.details.input.checked;
    const bytesSoon = saveOn ? brBytes : null, buildSoon = brGame;
    brLock(true);
    brStatus(tt("br.sending", "Sending…"));
    let res = null;
    try {
      const [bytes, gameBuild] = await Promise.all([bytesSoon, buildSoon]);
      const parts = brParts(ctx, {text, save: saveOn, details: detailsOn, bytes, gameBuild}, brEnv());
      const form = new FormData();
      for (const [name, value, file] of parts) { if (file) form.append(name, value, file); else form.append(name, value); }
      res = await fetch(BR_API, {method: "POST", body: form, cache: "no-store"});
    } catch (err) { res = null; }
    if (seq !== brSeq) return;
    // Closed all the same (a browser lets a second Escape through): nobody is
    // there to read the answer, so the form only lets go.
    if (!brDialog.open) { brLock(false); brRelease(); return; }
    let issue = null;
    if (res && res.status === 201) {
      const data = await res.json().catch(() => null);
      issue = brIssue(data && data.issue);
    }
    if (issue) {
      brSent = issue;
      e.text.value = "";
      brLock(false);
      brLabel();
      brStatus(tt("br.done", "Thank you. The report is on GitHub."), {href: issue.url, words: tt("br.done.link", "Open issue #{n}", {n: issue.number}), tone: "ok"});
      e.cancel.focus();
      return;
    }
    brLock(false);
    const discord = brFeedbackHref();
    const away = discord ? {href: discord, words: tt("br.fail.discord", "Send it to the Discord support channel instead."), tone: "bad"} : {tone: "bad"};
    if (res && res.status === 429) brStatus(tt("br.limited", "Too many reports from this connection. Try again in a minute."), {tone: "bad"});
    else if (res && res.status === 413) brStatus(tt("br.toolarge", "The save is too large to send."), away);
    else brStatus(tt("br.fail", "The report could not be sent."), away);
  }

  // Only an issue of this repository is linked: anything else from the API is
  // treated as a failure.
  function brIssue(raw) {
    if (!raw || !Number.isSafeInteger(raw.number) || raw.number < 1 || typeof raw.url !== "string") return null;
    let url;
    try { url = new URL(raw.url); } catch (e) { return null; }
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.pathname !== "/PeterHartwieg/big-copilot/issues/" + raw.number) return null;
    return {number: raw.number, url: url.href};
  }

  window.BigCopilotReport = {open: brOpen, parts: brParts, mask: brMask, settings: brSettings, browser: brBrowser, issue: brIssue};
})();
