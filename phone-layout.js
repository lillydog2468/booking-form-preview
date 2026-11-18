/*
 * A phone is a narrow window, or a touch screen whose shorter side is a phone.
 * An iPad stays wide: its shorter side is larger than a phone.
 */
(function (root) {
  'use strict';

  function isPhone(width, height, coarse, touchPoints) {
    var w = Number(width) || 0;
    var h = Number(height) || 0;
    var shortSide = Math.min(w, h || w);
    if (w > 0 && w <= 600) return true;
    if ((coarse || (Number(touchPoints) || 0) > 0) && shortSide > 0 && shortSide <= 500) return true;
    return false;
  }

  function readNow() {
    var coarse = false;
    try { coarse = root.matchMedia('(pointer: coarse)').matches; } catch (err) { coarse = false; }
    var touch = root.navigator ? root.navigator.maxTouchPoints : 0;
    return isPhone(root.innerWidth, root.innerHeight, coarse, touch);
  }

  function apply() {
    if (!root.document) return false;
    var phone = readNow();
    root.document.documentElement.classList.toggle('is-phone', phone);
    return phone;
  }

  root.PhoneLayout = { isPhone: isPhone, apply: apply };
  if (root.document) {
    apply();
    root.addEventListener('resize', apply);
    root.addEventListener('orientationchange', apply);
  }
})(typeof window !== 'undefined' ? window : globalThis);
