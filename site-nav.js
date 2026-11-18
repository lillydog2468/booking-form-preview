/*
 * Opens the compact More menu by tap or click. It does not use hover,
 * so a finger on iPad can open and close it.
 */
(function () {
  'use strict';

  function menus() {
    return Array.prototype.slice.call(document.querySelectorAll('.site-more'));
  }

  function setOpen(wrap, open) {
    var btn = wrap.querySelector('.site-more-btn');
    var menu = wrap.querySelector('.site-more-menu');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (menu) menu.hidden = !open;
  }

  function closeAll(except) {
    menus().forEach(function (wrap) {
      if (wrap !== except) setOpen(wrap, false);
    });
  }

  document.addEventListener('click', function (event) {
    var btn = event.target.closest && event.target.closest('.site-more-btn');
    if (btn) {
      event.preventDefault();
      var wrap = btn.closest('.site-more');
      var open = btn.getAttribute('aria-expanded') === 'true';
      closeAll(wrap);
      setOpen(wrap, !open);
      return;
    }
    if (!event.target.closest || !event.target.closest('.site-more-menu')) closeAll(null);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeAll(null);
  });

  // 2027 interest stays in More, and is shown once an admin session is known.
  function revealInterest() {
    var links = document.querySelectorAll('.site-more-menu a[href="interest-2027.html"]');
    Array.prototype.forEach.call(links, function (link) {
      link.hidden = false;
      link.style.display = '';
    });
  }

  function watchInterest() {
    if (!window.AuthGate || !window.BOOKING_SUPABASE_URL || !window.BOOKING_SUPABASE_ANON_KEY) return;
    var sb;
    try { sb = AuthGate.createClient(BOOKING_SUPABASE_URL, BOOKING_SUPABASE_ANON_KEY); }
    catch (_) { return; }
    sb.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (!session || !session.user) return null;
      return sb.from('profiles').select('role, status').eq('id', session.user.id).maybeSingle();
    }).then(function (res) {
      var profile = res && res.data;
      if (profile && profile.status !== 'disabled' && profile.role === 'admin') revealInterest();
    }).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchInterest);
  else watchInterest();
}());
