/* Embedded in the browser shell so the loaded release is the baseline even
 * when the first version check happens after another deployment. */
(() => {
  const loaded = window.LEDGER_RELEASE;
  if (!loaded?.version || !/^https?:$/.test(location.protocol)) return;
  const $ = id => document.getElementById(id);
  const banner = $('releaseBanner');
  if (!banner) return;
  const key = 'ledger_dismissed_release';
  let dismissed = '';
  try { dismissed = sessionStorage.getItem(key) || ''; } catch (_) {}
  let available = '', checking = false, lastCheck = -Infinity;
  const measure = () => document.documentElement.style.setProperty(
    '--release-height', `${banner.hidden ? 0 : banner.getBoundingClientRect().height}px`);
  new ResizeObserver(measure).observe(banner);

  $('releaseDismiss').addEventListener('click', () => {
    dismissed = available;
    try { sessionStorage.setItem(key, dismissed); } catch (_) {}
    banner.hidden = true;
    measure();
  });
  $('releaseReload').addEventListener('click', () => location.reload());

  async function check() {
    // Coalesce focus/visibility events and avoid polling background tabs.
    if (document.hidden || navigator.onLine === false || checking || Date.now() - lastCheck < 15000) return;
    checking = true;
    lastCheck = Date.now();
    try {
      const response = await fetch(new URL('version.json', location.href), {cache: 'no-store'});
      if (!response.ok) return;
      const release = await response.json();
      if (!release || typeof release.version !== 'string' || !/^[a-f0-9]{10}$/.test(release.version)) return;
      if (release.version === loaded.version || release.version === dismissed) {
        banner.hidden = true;
        measure();
        return;
      }
      if (available === release.version && !banner.hidden) return;
      available = release.version;
      const latest = release.latest;
      const previous = loaded.latest;
      const hasChange = latest && typeof latest.title === 'string' && latest.title.trim() &&
        typeof latest.summary === 'string' && typeof latest.date === 'string' && Number.isInteger(latest.pr) &&
        (!previous || latest.date > previous.date ||
          (latest.date === previous.date && latest.pr !== previous.pr) ||
          (latest.pr === previous.pr && (latest.title !== previous.title || latest.summary !== previous.summary)));
      $('releaseDetails').hidden = !hasChange;
      $('releaseDetails').open = false;
      $('releaseTitle').textContent = hasChange ? latest.title : '';
      $('releaseSummary').textContent = hasChange ? latest.summary : '';
      banner.hidden = false;
      $('releaseMessage').textContent = 'Update available';
      measure();
    } catch (_) {
      // Offline, missing manifests and transient deploy failures stay quiet.
    } finally {
      checking = false;
    }
  }
  setInterval(check, 60000);
  window.addEventListener('focus', check);
  window.addEventListener('online', () => { lastCheck = -Infinity; check(); });
  document.addEventListener('visibilitychange', check);
  check();
})();

/* One-time news strip (#newsStrip in build_web.py). Its data-news-id names the
 * announcement: dismissing remembers that id, so a new id shows again. */
(() => {
  const strip = document.getElementById('newsStrip');
  const id = strip?.dataset.newsId;
  if (!id) return;
  const key = 'bc_news_dismissed';
  try { if (localStorage.getItem(key) === id) return; } catch (_) {}
  strip.hidden = false;
  document.getElementById('newsDismiss').addEventListener('click', () => {
    strip.hidden = true;
    try { localStorage.setItem(key, id); } catch (_) {}
  });
})();
