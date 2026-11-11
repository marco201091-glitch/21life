(() => {
  const root = document.documentElement;
  const site = document.querySelector('#site');
  if (!site) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 1000px)');
  let reveals;
  let headerObserver;

  function syncMenu() {
    const nav = document.querySelector('#navigation');
    if (nav) nav.inert = mobile.matches && !nav.classList.contains('open');
  }

  function initialize() {
    reveals?.disconnect();
    headerObserver?.disconnect();
    const enabled = !reduced.matches && typeof IntersectionObserver === 'function';
    root.dataset.motion = enabled ? 'on' : 'off';
    document.querySelectorAll('[data-reveal]').forEach(node => node.removeAttribute('data-reveal'));
    syncMenu();
    if (!enabled) return;
    try {
      reveals = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.dataset.reveal = 'shown';
          reveals.unobserve(entry.target);
        }
      }, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });
      const selector = '.section-top, .feature-card, .chapter, .deck-story > div, .cta, .content-section .card, .steps li, .section-panel, #account, .footer-top';
      for (const node of document.querySelectorAll(selector)) {
        // Never hide content already visible on load or restored by Back.
        if (node.getBoundingClientRect().top < innerHeight - 32) continue;
        node.dataset.reveal = 'pending';
        reveals.observe(node);
      }
      const hero = document.querySelector('.hero, .page-hero');
      if (hero) {
        headerObserver = new IntersectionObserver(([entry]) => {
          document.querySelector('header')?.classList.toggle('is-scrolled', !entry.isIntersecting);
        });
        headerObserver.observe(hero);
      }
    } catch {
      reveals?.disconnect();
      headerObserver?.disconnect();
      root.dataset.motion = 'off';
      document.querySelectorAll('[data-reveal]').forEach(node => node.removeAttribute('data-reveal'));
    }
  }

  document.addEventListener('click', syncMenu);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const focusInMenu = document.querySelector('#navigation')?.contains(document.activeElement);
    syncMenu();
    if (mobile.matches && focusInMenu) document.querySelector('[data-menu]')?.focus();
  });
  document.addEventListener('focusin', event => {
    const pending = event.target.closest('[data-reveal="pending"]');
    if (pending) {
      pending.dataset.reveal = 'shown';
      reveals?.unobserve(pending);
    }
  });
  reduced.addEventListener('change', initialize);
  mobile.addEventListener('change', syncMenu);
  new MutationObserver(initialize).observe(site, { childList: true });
  initialize();
})();
