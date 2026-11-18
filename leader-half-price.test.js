const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const vm = require('node:vm');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');
const extrasSrc = fs.readFileSync(path.join(__dirname, 'booking-extras.js'), 'utf8');
const taxSrc = fs.readFileSync(path.join(__dirname, 'tax-summary.js'), 'utf8');
const analytics = fs.readFileSync(path.join(__dirname, 'analytics.html'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, 'sql/23_leader_half_price.sql'), 'utf8');

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

test('leader half price sits beside the day trip tick, not on the organiser name', () => {
  const kind = html.slice(html.indexOf('function tourKindControlsHTML('), html.indexOf('function tourDatesFoldHTML('));
  const day = kind.indexOf('id="t${t}_day_trip"');
  const tick = kind.indexOf('id="t${t}_leader_half_price"');
  assert.ok(day >= 0 && tick > day);
  assert.match(kind, /Leader half price/);
  assert.equal(kind.match(/day-trip-toggle/g).length, 3);
  const form = html.slice(html.indexOf('function buildFormHTML('), html.indexOf('function buildLayoutFormHTML('));
  assert.match(form, /tourKindControlsHTML/);
  assert.doesNotMatch(form, /leader_half_price/);
  const alias = html.slice(html.indexOf('function buildLayoutFormHTML('), html.indexOf('function clampYear('));
  assert.match(alias, /return buildFormHTML\(tabId\)/);
  assert.doesNotMatch(alias, /leader_half_price/);
});

test('ten people at £100 with the leader at half price is £950', () => {
  const ctx = { window: {}, globalThis: {} };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(extrasSrc, ctx);
  assert.equal(ctx.BookingExtras.tourFare(10, 100, true), 950);
  assert.equal(ctx.BookingExtras.tourFare(10, 100, false), 1000);
  assert.equal(ctx.BookingExtras.tourFare(1, 48, false), 48);
  assert.equal(ctx.BookingExtras.tourRevenue({
    no_people: 10,
    price_per_person: 100,
    beading_tour_price: 1000,
    leader_half_price: true,
  }, null), 950);
  assert.equal(ctx.BookingExtras.tourRevenue({
    no_people: 10,
    price_per_person: 100,
    beading_tour_price: 800,
    leader_half_price: true,
  }, null), 800);
  assert.equal(ctx.BookingExtras.tourRevenue({
    no_people: 10,
    price_per_person: 100,
    beading_tour_price: 1000,
    leader_half_price: false,
  }, null), 1000);
  assert.equal(ctx.BookingExtras.leaderHalfDelta({
    no_people: 10,
    price_per_person: 100,
    beading_tour_price: 1000,
    leader_half_price: true,
  }, null), 50);
});

test('a loaded half-price total still follows headcount, and headcount 1 uses the fare', () => {
  const nodes = new Map();
  function field(value, extra) {
    return Object.assign({ value, dataset: {} }, extra || {});
  }
  const ctx = {
    document: { getElementById(id) { return nodes.get(id) || null; } },
    tEl(tabId, key) { return nodes.get('t' + tabId + '_' + key) || null; },
  };
  vm.createContext(ctx);
  vm.runInContext(
    extractFunction('leaderHalfPriceOn') + '\n' +
    extractFunction('tourFareAmount') + '\n' +
    extractFunction('noteLoadedTourPrice'),
    ctx
  );

  const total = field('950.00');
  nodes.set('t1_beading_tour_price', total);
  nodes.set('t1_no_people', field('10'));
  nodes.set('t1_price_per_person', field('100'));
  nodes.set('t1_leader_half_price', { checked: true });
  ctx.noteLoadedTourPrice('1');
  assert.equal(total.dataset.tourPriceSource, 'computed');

  const flat = field('200');
  nodes.set('t1_beading_tour_price', flat);
  nodes.set('t1_no_people', field('1'));
  nodes.set('t1_price_per_person', field('48'));
  nodes.set('t1_leader_half_price', { checked: false });
  ctx.noteLoadedTourPrice('1');
  assert.equal(flat.value, '48.00');
  assert.equal(flat.dataset.tourPriceSource, 'computed');
});

test('save, tax summary and analytics use the halved tour total', () => {
  assert.match(html, /leader_half_price: x\.leaderHalfPrice === true/);
  assert.match(html, /data\.leader_half_price = checkVal\(tabId, 'leader_half_price'\)/);
  assert.match(taxSrc, /applyLeaderHalf/);
  assert.match(taxSrc, /leaderHalfDelta/);
  assert.match(analytics, /function bookingRevenue/);
  assert.match(analytics, /booking-extras\.js/);
  assert.match(sql, /leader_half_price BOOLEAN NOT NULL DEFAULT false/);
  assert.match(sql, /ALTER TABLE bookings ADD COLUMN IF NOT EXISTS leader_half_price/);
});
