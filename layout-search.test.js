const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

function load(formLayout) {
  const store = {};
  const classes = new Set();
  const view = {
    classList: {
      add(name) { classes.add(name); },
      toggle(name, on) {
        if (on) classes.add(name);
        else classes.delete(name);
      },
    },
  };
  const btn = { textContent: '', attrs: {}, setAttribute(key, value) { this.attrs[key] = value; } };
  const context = {
    formLayout: formLayout,
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem(key, value) { store[key] = String(value); },
    },
    document: {
      getElementById(id) {
        if (id === 'formView') return view;
        if (id === 'sidebarSearchToggle') return btn;
        return null;
      },
    },
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('layoutSearchShown'),
    extractFunction('applyLayoutSearch'),
    extractFunction('toggleLayoutSearch'),
  ].join('\n'), context);
  return { context, classes, btn, store };
}

test('the layout search panel starts hidden and the button sits above the bookings list', () => {
  const header = html.indexOf('class="sidebar-header"');
  const button = html.indexOf('id="sidebarSearchToggle"');
  const search = html.indexOf('id="sidebarSearch"');
  const list = html.indexOf('id="recordsList"');
  assert.ok(header > 0 && header < button && button < search && search < list);
  assert.match(html, /onclick="toggleLayoutSearch\(\)">Show search</);
  assert.match(html, /id="sidebarSearch"[\s\S]*class="search-box"[\s\S]*oninput="filterRecords\(this\.value\)"/);
  assert.match(html, /id="sidebarSearchField"/);
  assert.match(html, /#formView\.is-layout\.search-hidden \.sidebar-search \{ display: none; \}/);
  assert.match(html, /\.sidebar-search-toggle \{[\s\S]*min-height: 44px;/);
  assert.match(html, /layout_booking_search/);
});

test('show and hide remember the choice, and the form tab keeps the search', () => {
  const hidden = load('layout');
  hidden.context.applyLayoutSearch();
  assert.equal(hidden.context.layoutSearchShown(), false);
  assert.equal(hidden.classes.has('is-layout'), true);
  assert.equal(hidden.classes.has('search-hidden'), true);
  assert.equal(hidden.btn.textContent, 'Show search');
  assert.equal(hidden.btn.attrs['aria-expanded'], 'false');

  hidden.context.toggleLayoutSearch();
  assert.equal(hidden.store.layout_booking_search, 'shown');
  assert.equal(hidden.classes.has('search-hidden'), false);
  assert.equal(hidden.btn.textContent, 'Hide search');
  assert.equal(hidden.btn.attrs['aria-expanded'], 'true');

  hidden.context.toggleLayoutSearch();
  assert.equal(hidden.store.layout_booking_search, 'hidden');
  assert.equal(hidden.btn.textContent, 'Show search');

  const form = load('standard');
  form.context.applyLayoutSearch();
  assert.equal(form.classes.has('is-layout'), true);
  assert.equal(form.classes.has('search-hidden'), true);
  assert.equal(form.btn.textContent, 'Show search');
});
