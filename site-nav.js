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
}());
