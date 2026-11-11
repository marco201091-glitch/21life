// Aggregate only button types; never send the destination, page, or visitor identifier.
(() => {
  if (location.hostname !== '21life.win') return;
  const endpoint = 'https://21life-clicks.21life-stats.workers.dev/click';
  function record(event) {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    let target;
    try { target = new URL(anchor.href); } catch { return; }
    const type = target.origin === 'https://app.21life.win' && target.pathname === '/' ? 'web'
      : target.origin === 'https://github.com' && /^\/marco201091-glitch\/21life\/releases\/download\/v[0-9]+\.[0-9]+\.[0-9]+\/21life-v[0-9]+\.[0-9]+\.[0-9]+\.apk$/.test(target.pathname) ? 'apk' : null;
    if (!type) return;
    try {
      if (!navigator.sendBeacon || !navigator.sendBeacon(endpoint, type)) {
        fetch(endpoint, { method: 'POST', body: type, keepalive: true, credentials: 'omit' }).catch(() => {});
      }
    } catch { /* Navigation must never depend on analytics. */ }
  }
  document.addEventListener('click', record, true);
  document.addEventListener('auxclick', event => { if (event.button === 1) record(event); }, true);
})();
