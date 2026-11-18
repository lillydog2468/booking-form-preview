/*
 * Hides the old tour planner when booking-config.js sets HIDE_OLD_PLANNING.
 * planner2.html is left alone. Nothing is deleted.
 */
(function (root) {
  'use strict';

  function oldPlanningHidden() {
    return root.HIDE_OLD_PLANNING === true;
  }

  function onOldPlannerPage() {
    if (typeof location === 'undefined') return false;
    return /tour-planner\.html$/.test(location.pathname || '');
  }

  function install() {
    if (!oldPlanningHidden() || typeof document === 'undefined') return;
    document.documentElement.classList.add('hide-old-planning');
    if (document.getElementById('planning-hide-style')) return;
    var css = [
      'html.hide-old-planning a[href^="tour-planner.html"]:not(.planning-open),',
      'html.hide-old-planning [onclick*="openTourPlanner"]{display:none !important;}',
    ];
    if (onOldPlannerPage()) {
      css.push('html.hide-old-planning body > :not(.planning-hidden-note){display:none !important;}');
      css.push('html.hide-old-planning body.planning-note-ready{margin:0;background:#f4f3f0;color:#1c1b19;font-family:"DM Sans",system-ui,sans-serif;}');
      css.push('.planning-hidden-note{display:block;max-width:32rem;margin:20vh auto;padding:0 20px;font-size:18px;line-height:1.45;}');
      css.push('.planning-hidden-note a{color:#1a3d5c;font-weight:700;}');
    }
    var style = document.createElement('style');
    style.id = 'planning-hide-style';
    style.textContent = css.join('');
    document.head.appendChild(style);
  }

  function showNote(host) {
    if (!host) return;
    host.innerHTML = '<main class="planning-hidden-note"><p>Temporarily hidden, use the <a href="booking-form.html">booking form</a>.</p></main>';
    if (host.classList && host.classList.add) host.classList.add('planning-note-ready');
  }

  root.PlanningHide = {
    oldPlanningHidden: oldPlanningHidden,
    install: install,
    showNote: showNote,
  };

  install();
})(typeof globalThis !== 'undefined' ? globalThis : this);
