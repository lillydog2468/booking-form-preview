/*
 * Emoji grid for a place icon. Not a datalist: Safari shows an empty
 * suggestion box on a plain text field, so this is buttons only.
 */
(function (root) {
  'use strict';

  var GROUPS = [
    { id: 'craft', label: 'Glass, beads and crafts', icons: ['💎', '📿', '🧵', '✂️', '🪡', '🎨', '🔮', '🔥', '⚙️', '🔘', '🏭', '🏢', '🏰', '🏛️', '🏺', '💫', '⭐'] },
    { id: 'food', label: 'Food and drink', icons: ['🍽️', '🥐', '☕', '🍺', '🍷', '🍰', '🍞', '🥗', '🍜', '🍵', '🧀', '🍫', '🍎'] },
    { id: 'sights', label: 'Sights and nature', icons: ['🏔️', '🌲', '🌸', '🌊', '⛰️', '🏞️', '🌅', '🗼', '🗿', '🌳', '🌻', '☀️'] },
    { id: 'shops', label: 'Shops', icons: ['🛍️', '🏪', '👜', '💍', '🛒', '💄', '🪞', '🎀'] },
    { id: 'travel', label: 'Transport', icons: ['🚌', '🚗', '🚕', '🚂', '✈️', '🚲', '🚢'] },
    { id: 'stay', label: 'Hotels', icons: ['🏨', '🛏️', '🛎️', '🔑', '🧳'] },
  ];

  function allIcons() {
    var list = [];
    GROUPS.forEach(function (group) {
      group.icons.forEach(function (icon) { list.push(icon); });
    });
    return list;
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function ensureStyle() {
    if (typeof document === 'undefined' || !document.getElementById || document.getElementById('icon-picker-style')) return;
    var style = document.createElement('style');
    style.id = 'icon-picker-style';
    style.textContent = '.icon-current{display:inline-flex;align-items:center;gap:10px;margin:8px 0;border:1px solid #e2ddd4;background:#fff;border-radius:12px;padding:8px 14px;font:700 15px/1.2 inherit;cursor:pointer;touch-action:manipulation;}'
      + '.icon-current-glyph{font-size:40px;line-height:1;}'
      + '.icon-panel{margin:0 0 10px;padding:8px;border:1px solid #e6e1d8;border-radius:12px;background:#fff;}'
      + '.icon-group-label{margin:8px 0 4px;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#6e695f;}'
      + '.icon-grid{display:flex;flex-wrap:wrap;gap:4px;}'
      + '.icon-choice{width:42px;height:42px;font-size:24px;line-height:1;border:1px solid #eeeae3;border-radius:8px;background:#fff;cursor:pointer;}'
      + '.icon-panel-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;}'
      + '.icon-type{display:flex;flex-direction:column;gap:4px;margin-top:8px;font-size:12px;font-weight:700;}'
      + '.icon-type input{font-size:22px;padding:6px 8px;}'
      + '.icon-mac{margin:8px 0 0;font-size:12px;color:#6e695f;}';
    document.head.appendChild(style);
  }

  function html(options) {
    ensureStyle();
    var opts = options || {};
    var attr = opts.inputAttr || 'data-icon-value';
    var named = opts.inputId != null ? (attr + '="' + esc(opts.inputId) + '"') : (attr + '=""');
    var current = String(opts.value || '');
    var groups = GROUPS.map(function (group) {
      var buttons = group.icons.map(function (icon) {
        return '<button type="button" class="icon-choice" data-icon-choice="' + icon + '" aria-label="' + icon + '">' + icon + '</button>';
      }).join('');
      return '<p class="icon-group-label">' + esc(group.label) + '</p><div class="icon-grid" role="group" aria-label="' + esc(group.label) + '">' + buttons + '</div>';
    }).join('');
    return '<div class="icon-picker" data-icon-picker>'
      + '<button type="button" class="icon-current" data-icon-open aria-expanded="false">'
      + '<span class="icon-current-glyph" data-icon-glyph>' + (current ? esc(current) : '✦') + '</span>'
      + ' Change icon</button>'
      + '<div class="icon-panel" data-icon-panel hidden>'
      + groups
      + '<div class="icon-panel-actions">'
      + '<button type="button" data-icon-type>Type your own</button>'
      + '<button type="button" data-icon-clear>Use category icon</button>'
      + '</div>'
      + '<label class="icon-type" data-icon-typebox hidden>Type your own'
      + '<input type="text" ' + named + ' value="' + esc(current) + '" maxlength="8" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Emoji">'
      + '</label>'
      + '<p class="icon-mac">On a Mac, Ctrl+Cmd+Space opens the emoji keyboard.</p>'
      + '</div></div>';
  }

  function setValue(picker, value) {
    var input = picker.querySelector('input');
    var glyph = picker.querySelector('[data-icon-glyph]');
    var next = String(value || '');
    if (input) input.value = next;
    if (glyph) glyph.textContent = next || '✦';
    if (input) {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function bind(root) {
    ensureStyle();
    var scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope || !scope.querySelectorAll) return;
    scope.querySelectorAll('[data-icon-picker]').forEach(function (picker) {
      if (picker.getAttribute('data-icon-bound') === '1') return;
      picker.setAttribute('data-icon-bound', '1');
      var panel = picker.querySelector('[data-icon-panel]');
      var open = picker.querySelector('[data-icon-open]');
      var typeBox = picker.querySelector('[data-icon-typebox]');
      if (open) {
        open.addEventListener('click', function () {
          if (!panel) return;
          var show = panel.hidden;
          panel.hidden = !show;
          open.setAttribute('aria-expanded', show ? 'true' : 'false');
        });
      }
      picker.querySelectorAll('[data-icon-choice]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          setValue(picker, btn.getAttribute('data-icon-choice') || btn.textContent);
          if (panel) panel.hidden = true;
          if (open) open.setAttribute('aria-expanded', 'false');
        });
      });
      var clear = picker.querySelector('[data-icon-clear]');
      if (clear) {
        clear.addEventListener('click', function () {
          setValue(picker, '');
          if (panel) panel.hidden = true;
        });
      }
      var typeBtn = picker.querySelector('[data-icon-type]');
      if (typeBtn && typeBox) {
        typeBtn.addEventListener('click', function () {
          typeBox.hidden = false;
          var input = typeBox.querySelector('input');
          if (input) input.focus();
        });
      }
    });
  }

  root.IconPicker = { GROUPS: GROUPS, allIcons: allIcons, html: html, bind: bind, setValue: setValue };
})(typeof window !== 'undefined' ? window : globalThis);
