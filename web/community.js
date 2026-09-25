/* Community presence and feature voting for the hosted site only.
 *
 * The local Python build never loads this file. The build adds it (and its
 * stylesheet) after app.js and the parent calls BigCopilotCommunity.start()
 * once enterBoard has placed the controls. The footer carries the vote card in
 * its own markup; this file only reveals it, which is what keeps it off the
 * CLI's dashboard.html. Until start(), or a click on that card, no request is
 * made at all.
 *
 * Presence: once the board is up (a save loaded or the wiki opened), one
 * heartbeat POSTs a random id to /api/community/presence and the response
 * schedules the next one. The id, the schedule and the last count live only
 * in this tab's memory: nothing
 * goes into browser storage (the privacy notice promises that, and a stored
 * id for a counter would need consent under § 25 TDDDG). So every tab counts
 * on its own, and a reload starts a new id while the old one ages out of the
 * ten-minute window. Scheduling runs on this tab's clock: the due time is the
 * local receipt of the response plus its nextHeartbeatIn delay, so server
 * clock skew and countedAt snapshot times never move the schedule. Missed
 * intervals after sleep are not replayed; the next due send happens once.
 *
 * Voting: a native <dialog> fetches the curated feature list only when opened
 * and POSTs one feature id per vote; the reply carries the fresh count, so
 * the list is never re-fetched after voting. Everything is rendered with
 * textContent; no untrusted HTML is ever built.
 */
(function () {
  "use strict";

  const API = "/api/community";
  // Where earlier versions kept the presence id; init() removes it.
  const LEGACY_STORE_KEY = "ba_community_state";
  const MIN_DUE_MS = 1000, MAX_DUE_MS = 300000;  // the server's heartbeat window, respected locally
  const JITTER_MS = 5000;
  const RETRY_MIN_MS = 60000, RETRY_MAX_MS = 900000;  // failed-fetch backoff, Retry-After honoured
  const STALE_MS = 600000;  // a count older than this reads as unavailable

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }

  /* --- this tab's heartbeat schedule ------------------------------------- */

  const browserId = uuid();  // new on every page load, never stored
  const presence = {count: null, receivedAt: null, nextDue: 0, failures: 0};
  let started = false;
  let timer = null;
  let inFlight = false;

  function arm(delay) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, clamp(delay, 0, 2147483647));
  }

  /* Sends when due, otherwise waits for the due time. While a request is out
     its response re-arms the timer, so a wake event cannot send a second one. */
  function tick() {
    if (!started || inFlight) return;
    const wait = presence.nextDue - Date.now();
    if (wait > 0) { arm(wait); return; }
    sendPresence().catch(() => { inFlight = false; arm(RETRY_MIN_MS); });
  }

  async function sendPresence() {
    inFlight = true;
    let ok = false, count = 0, nextIn = 300, retryAfterMs = 0;
    try {
      const res = await fetch(API + "/presence", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({browserId}),
      });
      if (res.ok) {
        const parsed = parsePresence(await res.json().catch(() => null));
        if (parsed) { ok = true; count = parsed.count; nextIn = parsed.nextIn; }
      } else {
        const after = Number(res.headers.get("retry-after"));
        if (Number.isFinite(after) && after >= 0) retryAfterMs = after * 1000;
      }
    } catch (e) { /* offline or blocked: the backoff below retries */ }
    inFlight = false;
    settle(ok, count, nextIn, retryAfterMs);
  }

  function parsePresence(data) {
    if (!data || typeof data !== "object") return null;
    const count = data.count;
    if (!Number.isInteger(count) || count < 0) return null;
    const nextIn = Number(data.nextHeartbeatIn);
    return {count, nextIn: Number.isFinite(nextIn) ? clamp(Math.floor(nextIn), 1, 300) : 300};
  }

  /* The footer's vote card ships hidden in the markup and this file reveals it,
     so the dashboard.html the CLI writes, which never loads this file, does not
     offer a vote that cannot be cast.

     It cannot wait for the API to answer first: the landing makes no request at
     all until the reader asks for one, and that silence is a promise the privacy
     notice makes. So the card appears as soon as this file runs, and goes away
     again only once a second heartbeat has failed without either ever having
     answered, which is what a copy served from anywhere but bigcopilot.com looks
     like. One failure is a blip, and so is any number of them once something has
     answered: those leave the card alone. */
  function syncVoteCard(available) {
    document.querySelectorAll("[data-vote-card]").forEach((card) => { card.hidden = !available; });
  }

  // Its own flag, not presence.receivedAt: that one is cleared by every failure,
  // so two dropped beats in a row would have read as "this copy has no API" on a
  // site that had been answering all along.
  let everAnswered = false;

  function settle(ok, count, nextIn, retryAfterMs) {
    const now = Date.now();
    if (ok) {
      everAnswered = true;
      syncVoteCard(true);
      presence.count = count;
      presence.receivedAt = now;  // display staleness runs on local receipt time
      presence.failures = 0;
      // nextHeartbeatIn is a delay, not an epoch: due = receipt + delay.
      presence.nextDue = now + clamp(nextIn * 1000, MIN_DUE_MS, MAX_DUE_MS) + Math.random() * JITTER_MS;
    } else {
      // Two failures, and nothing has ever answered: no API behind this copy.
      // One failure is a blip, and the first beat goes out at enterBoard(), the
      // busiest moment of the page; hiding on it would pull a card the reader
      // can already see, for the whole minute the backoff waits. A copy that
      // has answered before keeps its card through any number of failures.
      if (!everAnswered && presence.failures >= 1) syncVoteCard(false);
      presence.count = null;
      presence.receivedAt = null;
      presence.failures++;
      const backoff = Math.min(RETRY_MIN_MS * Math.pow(2, presence.failures - 1), RETRY_MAX_MS);
      presence.nextDue = now + clamp(retryAfterMs || backoff, RETRY_MIN_MS, RETRY_MAX_MS) + Math.random() * JITTER_MS;
    }
    arm(presence.nextDue - now);
    paintOnline();
  }

  /* --- the online indicator (the masthead's live status) ------------------ */

  let staleTimer = null;

  /* The count takes over the em beside the green dot, where the source label
     ("In browser") sits. The masthead is rebuilt on every render, so #live is
     looked up on each paint, and drawMast() and markStale() call back in after
     their own writes. A save-refresh warning (Stale, Not live) owns the line
     while it stands: paintOnline returns and leaves it alone. */
  function paintOnline() {
    if (staleTimer) { clearTimeout(staleTimer); staleTimer = null; }
    const live = document.querySelector("#live");
    if (!live || live.classList.contains("stale") || live.classList.contains("off")) return;
    const em = live.querySelector("em");
    if (!em) return;
    live.classList.add("community-online");
    const at = presence.receivedAt || 0;
    if (typeof presence.count === "number" && at && Date.now() - at < STALE_MS) {
      live.classList.remove("community-unavailable");
      em.textContent = tt("comm.online", "{n} online", {n: presence.count});
      live.title = tt("comm.online.tip", "Open dashboard tabs in the last {minutes} minutes. Approximate count; updates every five minutes.", {minutes: 10});
      // One chained timeout flips the line when the count expires; the next
      // heartbeat normally replaces it long before that.
      staleTimer = setTimeout(() => { staleTimer = null; paintOnline(); }, at + STALE_MS - Date.now() + 1000);
    } else {
      live.classList.add("community-unavailable");
      em.textContent = tt("comm.online.none", "Online count unavailable");
      live.removeAttribute("title");
    }
  }

  /* Focus, a page restore, the network coming back or the tab being seen
     again all re-check the schedule: a due heartbeat sends, anything else
     just re-arms the timer. */
  function onWake() { tick(); }

  /* --- the voting dialog --------------------------------------------------- */

  let dialog = null, statusEl = null, cardsEl = null;
  let rows = [];
  let loadSeq = 0;   // bumped per open; a late reply from an older open is dropped
  let opener = null;
  const voteBusy = new Set();
  const pendingVotes = new Set();

  function parseFeature(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = typeof raw.id === "string" && raw.id ? raw.id : null;
    if (!id) return null;
    const votes = Number(raw.votes);
    return {
      id,
      title: typeof raw.title === "string" ? raw.title : id,
      description: typeof raw.description === "string" ? raw.description : "",
      votes: Number.isFinite(votes) && votes >= 0 ? Math.floor(votes) : 0,
      voted: raw.voted === true,
    };
  }

  function setStatus(text) { statusEl.textContent = text; }

  function errorState(message) {
    statusEl.textContent = message + " ";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn2 community-retry";
    retry.textContent = tt("comm.retry", "Retry");
    retry.addEventListener("click", loadFeatures);
    statusEl.appendChild(retry);
  }

  // The dialog's own words, written when it is built and again when the UI
  // language changes.
  let dialogText = null;
  function labelDialog() {
    if (!dialogText) return;
    dialogText.title.textContent = tt("comm.title", "Vote on upcoming features");
    dialogText.intro.textContent = tt("comm.intro", "Help choose what comes next. One vote per IP address for each feature. People sharing a connection may share a vote; votes are advisory.");
    dialogText.close.textContent = tt("comm.close", "Close");
    dialogText.privacy.textContent = tt("comm.privacy", "The online count sends a random ID that is new on every page load. Votes use a protected hash of your IP address. Your save and company data stay on your computer.");
  }

  function buildDialog() {
    dialog = document.createElement("dialog");
    dialog.className = "community-dialog";
    dialog.setAttribute("aria-labelledby", "communityTitle");
    dialog.setAttribute("aria-describedby", "communityIntro");
    const head = document.createElement("div");
    head.className = "community-head";
    const heading = document.createElement("div");
    const title = document.createElement("h2");
    title.id = "communityTitle";
    const intro = document.createElement("p");
    intro.id = "communityIntro";
    heading.append(title, intro);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "btn2";
    close.setAttribute("autofocus", "");
    close.addEventListener("click", () => dialog.close());
    head.append(heading, close);
    const body = document.createElement("div");
    body.className = "community-body";
    statusEl = document.createElement("p");
    statusEl.className = "community-status";
    statusEl.setAttribute("role", "status");
    statusEl.setAttribute("aria-live", "polite");
    cardsEl = document.createElement("div");
    cardsEl.className = "community-cards";
    cardsEl.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-feature-id]");
      if (button && !button.disabled) {
        const pending = vote(button.dataset.featureId);
        pendingVotes.add(pending);
        pending.finally(() => pendingVotes.delete(pending));
      }
    });
    const privacy = document.createElement("p");
    privacy.className = "community-privacy";
    dialogText = {title, intro, close, privacy};
    labelDialog();
    body.append(statusEl, cardsEl, privacy);
    dialog.append(head, body);
    // Backdrop click, taken the way the changelog dialog takes it.
    dialog.addEventListener("click", (event) => {
      const box = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
    });
    // Escape closes through the dialog's own cancel path; either close returns focus.
    dialog.addEventListener("close", () => {
      if (opener && document.contains(opener)) opener.focus();
      opener = null;
    });
    document.body.appendChild(dialog);
  }

  function openDialog(from) {
    if (!dialog || typeof dialog.showModal !== "function") return;
    opener = from || null;
    dialog.showModal();
    dialog.scrollTop = 0;
    if (typeof featureDiscovery !== "undefined") featureDiscovery.visit("community-voting");
    loadFeatures();  // every open is a fresh read
  }

  async function loadFeatures() {
    const seq = ++loadSeq;
    setStatus(tt("comm.loading", "Loading features…"));
    cardsEl.replaceChildren();
    let list = null;
    try {
      // Reopening during a vote waits for its result before the on-open read.
      await Promise.allSettled([...pendingVotes]);
      if (seq !== loadSeq || !dialog.open) return;
      const res = await fetch(API + "/features", {cache: "no-store"});
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json().catch(() => null);
      list = data && Array.isArray(data.features) ? data.features.map(parseFeature).filter(Boolean) : null;
    } catch (e) { list = null; }
    if (seq !== loadSeq || !dialog.open) return;
    if (list === null) return errorState(tt("comm.error", "Could not load the features."));
    if (!list.length) { setStatus(tt("comm.empty", "No features are open for voting right now.")); return; }
    setStatus("");
    renderCards(list);
  }

  function renderCards(list) {
    rows = list.map((feature) => {
      const card = document.createElement("div");
      card.className = "community-card";
      const top = document.createElement("div");
      top.className = "community-card-top";
      const heading = document.createElement("h3");
      heading.textContent = feature.title;
      const votes = document.createElement("span");
      votes.className = "community-votes";
      top.append(heading, votes);
      const detail = document.createElement("p");
      detail.textContent = feature.description;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn2 community-vote";
      button.dataset.featureId = feature.id;
      card.append(top, detail, button);
      cardsEl.appendChild(card);
      const row = Object.assign({}, feature, {button, votesEl: votes});
      paintRow(row);
      return row;
    });
  }

  function paintRow(row) {
    row.votesEl.textContent = tt("comm.votes", {one: "{n} vote", other: "{n} votes"}, {n: row.votes});
    row.button.textContent = row.voted ? tt("comm.voted", "Voted") : tt("comm.vote", "Vote");
    row.button.disabled = row.voted;
    row.button.title = row.voted ? tt("comm.voted.title", "One vote per connection for each feature") : "";
  }

  async function vote(featureId) {
    const row = rows.find((r) => r.id === featureId);
    if (!row || row.voted || voteBusy.has(featureId)) return;
    voteBusy.add(featureId);
    row.button.disabled = true;
    row.button.textContent = tt("comm.voting", "Voting…");
    const seq = loadSeq;
    try {
      const res = await fetch(API + "/vote", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({featureId}),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json().catch(() => null);
      const feature = parseFeature(data && data.feature);
      // The reply carries the fresh count, so the whole list is not re-fetched.
      if (!feature || feature.id !== featureId) throw new Error("Invalid vote response");
      if (seq === loadSeq && dialog.open) {
        row.votes = feature.votes;
        row.voted = feature.voted;
        paintRow(row);
        setStatus("");
      }
    } catch (e) {
      if (seq === loadSeq && dialog.open) setStatus(tt("comm.vote.error", "Could not record that vote."));
    }
    voteBusy.delete(featureId);
    if (seq === loadSeq && dialog.open && !row.voted) {
      row.button.disabled = false;
      row.button.textContent = tt("comm.vote", "Vote");
    }
  }

  /* --- entry points ---------------------------------------------------------- */

  function start() {
    if (started) return;
    started = true;
    paintOnline();  // repaints the shared count into whatever masthead is up
    if (typeof featureDiscovery !== "undefined") featureDiscovery.refresh();
    tick();  // the first heartbeat of this page load
  }

  function init() {
    // Earlier versions stored the presence id; drop it from returning browsers.
    try { localStorage.removeItem(LEGACY_STORE_KEY); } catch (e) {}
    syncVoteCard(true);
    buildDialog();
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-community-open]");
      if (button) openDialog(button);
    });
    window.addEventListener("focus", onWake);
    window.addEventListener("pageshow", onWake);
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    if (typeof featureDiscovery !== "undefined") featureDiscovery.refresh();
    else document.querySelectorAll('[data-new-feature="community-voting"]').forEach((badge) => { badge.hidden = false; });
    if (document.body.classList.contains("has-board")) start();
    // A change of UI language: the dialog's words, the open list's buttons and
    // the online line are written again.
    // After the board's listener has set the number locale the count is written in.
    if (typeof ttOnChange === "function") ttOnChange(() => queueMicrotask(() => {
      labelDialog();
      if (dialog && dialog.open) rows.forEach((row) => { if (!voteBusy.has(row.id)) paintRow(row); });
      paintOnline();
    }));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.BigCopilotCommunity = {start, paintOnline};
})();
