const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');

function between(startMark, endMark) {
  const start = html.indexOf(startMark);
  const end = html.indexOf(endMark, start + startMark.length);
  assert.ok(start >= 0 && end > start, 'missing range ' + startMark);
  return html.slice(start, end);
}

test('standard and layout open one form, and every field is still there', () => {
  const form = between('function buildFormHTML(', 'function buildLayoutFormHTML(');
  const alias = between('function buildLayoutFormHTML(', 'function clampYear(');
  assert.match(alias, /return buildFormHTML\(tabId\)/);
  assert.equal(form.includes('function buildLayoutFormHTML'), false);

  const ids = [
    '_org_first', '_org_last', '_org_email', '_members_list', '_depositmade', '_finalpayment',
    '_deposit_paid_date', '_final_payment_date', '_cv_left_to_pay', '_cv_final_payment_due_date',
    '_expenses_list', '_addl_expenses_list', '_cv_totalexpenses',
    '_extra_notes', '_shared_albums_list', '_cv_totalcost', '_cv_totalprofit', '_cv_profit_forecast',
    '_cv_all_tours_profit', '_cv_all_tours_count', '_bookingIdTag', '_fullTag', '_delay_until',
    '_hotels_heading',
  ];
  ids.forEach(id => assert.ok(form.includes(id), 'missing ' + id));
  assert.equal(form.split('id="t${t}_depositmade"').length - 1, 1);
  assert.match(form, /saveBooking\('\$\{t\}', false\)/);
  assert.equal(form.split("saveBooking('${t}', false)").length - 1, 1);
  assert.match(form, /tourFareHTML\(t\)/);
  assert.match(form, /tourKindControlsHTML\(t\)/);
  assert.match(form, /hotelEditorHTML\(t\)/);
  assert.match(form, /bookingCaptureFolds\(t\)/);
  assert.match(form, /yearToursCalendarHTML\(t\)/);
  assert.match(form, /class="layout-form"/);
  assert.match(form, /layout-zoom-controls/);
  assert.match(form, /Leave blank if there is no album/);
  assert.match(form, /even when the words match/);

  assert.equal(html.includes('id="navForm"'), false);
  assert.match(html, /id="navLayout"/);
  assert.match(html, /setFormLayout\('layout'\)/);
  assert.match(html, /layout === 'standard' \? 'standard' : 'layout'/);
  assert.match(html, /panel\.classList\.add\('layout-mode'\)/);
  assert.match(html, /panel\.innerHTML = buildFormHTML\(tabId\)/);
  const nav = html.slice(html.indexOf('class="view-nav"'), html.indexOf('id="navLayout"'));
  assert.equal(/>\s*Form\s*</.test(nav), false);
});

function extractFunction(name) {
  const start = html.indexOf('function ' + name + '(');
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

function loadRoute(search, storedLayout) {
  const store = {};
  if (storedLayout) store.form_layout = storedLayout;
  const ctx = {
    formLayout: 'layout',
    currentView: 'form',
    pendingDeepLinkBookingId: null,
    views: [],
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem(key, value) { store[key] = String(value); },
    },
    document: {
      documentElement: { setAttribute() {} },
      getElementById() { return null; },
    },
    URLSearchParams,
    window: { location: { search: search || '' } },
    applyLayoutSearch() {},
    updateLayoutNav() {},
    rerenderAllTabs() {},
    showView(view) { ctx.views.push(view); ctx.currentView = view; },
    bookingIdFromLocation() { return null; },
  };
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction('applyStoredFormLayout'),
    extractFunction('setFormLayout'),
    extractFunction('applyInitialRouteFromQuery'),
  ].join('\n'), ctx);
  ctx.store = store;
  return ctx;
}

test('an old Form link or a saved Form choice opens Layout', () => {
  const saved = loadRoute('', 'standard');
  saved.applyStoredFormLayout();
  assert.equal(saved.formLayout, 'layout');
  assert.equal(saved.store.form_layout, 'layout');

  const standard = loadRoute('?layout=standard');
  standard.applyInitialRouteFromQuery();
  assert.deepEqual(standard.views, ['form']);
  assert.equal(standard.formLayout, 'layout');

  const table = loadRoute('?layout=standard&view=table');
  table.applyInitialRouteFromQuery();
  assert.deepEqual(table.views, ['table']);
  assert.equal(table.formLayout, 'layout');

  const plain = loadRoute('?view=form');
  plain.setFormLayout('standard');
  plain.applyInitialRouteFromQuery();
  assert.deepEqual(plain.views, ['form']);
  assert.equal(plain.formLayout, 'layout');
});
