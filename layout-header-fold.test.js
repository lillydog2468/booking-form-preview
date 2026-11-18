const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'));
const css = fs.readFileSync(path.join(__dirname, 'booking-form.css'), 'utf8');

function extractFunction(name) {
  const marker = 'function ' + name + '(';
  let start = html.indexOf(marker);
  assert.ok(start >= 0, 'missing ' + name);
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

function headerSource() {
  const start = html.indexOf('function buildFormHTML(');
  const end = html.indexOf('function buildLayoutFormHTML(');
  return html.slice(start, end);
}

test('the layout header keeps every action and starts as name and year only', () => {
  const form = headerSource();
  assert.match(form, /class="tab-panel-header\$\{layoutHeaderCollapsed\(\) \? ' is-collapsed' : ''\}"/);
  assert.match(form, /class="form-header-fold"/);
  assert.match(form, /onclick="toggleLayoutHeader\(\)"/);
  assert.match(form, /id="t\$\{t\}_formTitle"/);
  assert.match(form, /id="t\$\{t\}_yearBadge"/);
  const header = form.slice(form.indexOf('tab-panel-header'), form.indexOf('id="t${t}_bookingLink"'));
  assert.match(header, />Start planning</);
  assert.match(header, /\n\s+Delete\n/);
  assert.match(header, /\n\s+Save\n/);
  assert.match(form, /fitLayoutZoom\('\$\{t\}'\)/);
  assert.match(form, /changeLayoutZoom\(-0\.05\)/);
  assert.match(form, /changeLayoutZoom\(0\.05\)/);
  assert.match(form, /class="zoom-range"/);

  const hidden = css.slice(css.indexOf('.tab-panel-header.is-collapsed .form-header-actions'), css.indexOf('.tab-panel.layout-mode .layout-zoom-controls'));
  assert.match(hidden, /display:\s*none !important/);
  assert.match(hidden, /\.booking-id-tag/);
  assert.match(hidden, /\.cancelled-tag/);
  assert.match(hidden, /\.tour-full-badge/);
  assert.match(hidden, /\.delay-until/);
  assert.equal(hidden.includes('year-tint-badge'), false);
  assert.match(css, /\.tab-panel-header\.year-band \{[^}]*padding:\s*4px 8px/);
  assert.match(css, /\.tab-panel-header\.is-collapsed h2 \{[^}]*font-size:\s*14px/);
  assert.match(css, /\.tab-panel\.layout-mode \.zoom-range \{[^}]*width:\s*72px/);
});

test('the header toggle reveals and hides the actions', () => {
  const store = {};
  const caret = { textContent: '▸' };
  const button = {
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    querySelector(sel) { return sel === '.form-header-caret' ? caret : null; },
  };
  const header = {
    classes: new Set(['tab-panel-header', 'is-collapsed']),
    classList: {
      toggle(name, on) {
        if (on) header.classes.add(name);
        else header.classes.delete(name);
      },
    },
    querySelector(sel) { return sel === '.form-header-fold' ? button : null; },
  };
  const ctx = {
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem(key, value) { store[key] = String(value); },
    },
    document: {
      querySelectorAll(sel) { return sel === '.tab-panel-header' ? [header] : []; },
    },
  };
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction('layoutHeaderCollapsed'),
    extractFunction('applyLayoutHeaderFold'),
    extractFunction('toggleLayoutHeader'),
  ].join('\n'), ctx);

  assert.equal(ctx.layoutHeaderCollapsed(), true);
  ctx.toggleLayoutHeader();
  assert.equal(header.classes.has('is-collapsed'), false);
  assert.equal(button.attrs['aria-expanded'], 'true');
  assert.equal(button.attrs['aria-label'], 'Hide booking actions');
  assert.equal(caret.textContent, '▾');
  assert.equal(store.layout_header_open, '1');

  ctx.toggleLayoutHeader();
  assert.equal(header.classes.has('is-collapsed'), true);
  assert.equal(button.attrs['aria-expanded'], 'false');
  assert.equal(button.attrs['aria-label'], 'Show booking actions');
  assert.equal(caret.textContent, '▸');
  assert.equal(store.layout_header_open, '0');
});
