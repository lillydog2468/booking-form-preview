const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');

function extract(name) {
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

function loadFocus() {
  const ctx = {
    tabs: new Map(),
    values: {},
  };
  ctx.tEl = (tabId, field) => ({ value: ctx.values[field] || '' });
  ctx.tabs.set('tab1', {});
  vm.createContext(ctx);
  vm.runInContext([
    'function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }',
    extract('clampYear'),
    extract('parseFlexibleDateUTC'),
    extract('utcStartOfToday'),
    extract('focusCalendarOnArrival'),
    extract('monthsMaskForRangeInYearUTC'),
  ].join('\n'), ctx);
  return ctx;
}

test('the calendar opens on the arrival month, or today when there is no date', () => {
  const ctx = loadFocus();
  ctx.values.tour_arrival_date = '10/05/2027';
  ctx.utcStartOfToday = () => new Date(Date.UTC(2026, 9, 30));
  vm.runInContext('focusCalendarOnArrival("tab1")', ctx);
  const opened = ctx.tabs.get('tab1');
  assert.equal(opened.calendarYear, 2027);
  assert.equal(opened.calendarMonthsMask, 1 << 4);
  assert.equal(opened.calendarMonthsPinned, true);

  ctx.values.tour_arrival_date = '';
  vm.runInContext('utcStartOfToday = () => new Date(Date.UTC(2026, 9, 30)); focusCalendarOnArrival("tab1")', ctx);
  const blank = ctx.tabs.get('tab1');
  assert.equal(blank.calendarYear, 2026);
  assert.equal(blank.calendarMonthsMask, 1 << 9);
});

test('a tour that crosses two months still opens on the arrival month, and both months earn a dot', () => {
  const ctx = loadFocus();
  const mask = vm.runInContext(
    'monthsMaskForRangeInYearUTC({ start: new Date(Date.UTC(2027, 4, 10)), end: new Date(Date.UTC(2027, 5, 2)) }, 2027)',
    ctx
  );
  assert.equal(mask & (1 << 4), 1 << 4);
  assert.equal(mask & (1 << 5), 1 << 5);
  assert.equal(mask & (1 << 3), 0);
  ctx.values.tour_arrival_date = '10/05/2027';
  vm.runInContext('focusCalendarOnArrival("tab1")', ctx);
  assert.equal(ctx.tabs.get('tab1').calendarMonthsMask, 1 << 4);
});

test('opening a booking and editing the arrival date jump the calendar, and a later redraw does not', () => {
  const open = html.slice(html.indexOf('function openNewTab('), html.indexOf('function closeTab('));
  const focusAt = open.lastIndexOf('focusCalendarOnArrival(tabId)');
  const showAt = open.lastIndexOf('switchToTab(tabId)');
  assert.ok(focusAt > 0 && showAt > focusAt);

  const input = html.slice(html.indexOf("changedId.endsWith('_tour_arrival_date')"), html.indexOf("changedId.endsWith('_departure_date')"));
  assert.match(input, /focusCalendarOnArrival\(tabId\)/);

  const render = extract('renderYearCalendar');
  assert.match(render, /if \(tabData && !tabData\.calendarMonthsPinned\)/);
  assert.match(render, /savedCalendarMonths\(\)/);
  const sync = extract('syncTabCalendarMonthFilterUI');
  assert.match(sync, /tour-month-dot/);
  assert.match(sync, /monthsMaskForRangeInYearUTC\(range, getTabCalendarYear\(tabId\)\)/);
  assert.match(html, /class="tour-month-dot"/);
  assert.match(html, /\.tour-month-dot \{[^}]*background: #c2410c;/);
  assert.match(html, /\.tour-month-dot \{[^}]*box-shadow: 0 0 0 1\.5px #fff;/);
});

test('other tours keep a small circle, in solid violet, and this booking’s marks stay as they were', () => {
  const light = html.slice(html.indexOf('.yc-dot {'), html.indexOf('[data-theme="dark"] .yc-dot'));
  const dark = html.slice(html.indexOf('[data-theme="dark"] .yc-dot'), html.indexOf('button.yc-cell {'));
  assert.match(light, /background: #7c3aed;/);
  assert.match(light, /color: #fff;/);
  assert.match(light, /border-radius: 999px;/);
  assert.match(light, /width: 14px;/);
  assert.match(dark, /background: #7c3aed;/);
  assert.match(dark, /color: #fff;/);
  assert.doesNotMatch(light, /rgba\(0,0,0,\.12\)/);
  assert.doesNotMatch(dark, /rgba\(255,255,255,\.14\)/);
  assert.match(html, /\.yc-cell\.tour \{[^}]*background: rgba\(79,70,229,\.14\);/);
  assert.match(html, /background: var\(--hotel-night-bg\);/);
  assert.match(html, /\.tour-month-dot \{[^}]*background: #c2410c;/);
  const layout = extract('renderYearCalendar');
  assert.match(layout, /class="yc-dot"/);
  assert.match(layout, /otherCount/);
  const yearTours = extract('yearTourMonthGridHTML');
  assert.match(yearTours, /class="yc-dot"/);
});
