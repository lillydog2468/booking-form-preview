const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, 'booking-form.html'), 'utf8');

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

function load() {
  const context = {};
  vm.createContext(context);
  vm.runInContext([
    extractFunction('hotelStayRanges'),
    extractFunction('hotelToneAt'),
    extractFunction('hotelNightIndexByIso'),
    extractFunction('isoPrevDay'),
    extractFunction('hotelDepartureSpillIndex'),
  ].join('\n'), context, { filename: 'hotel-night-colours.js' });
  context.date = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  context.owners = (arrival, departure, nights) => {
    const ranges = vm.runInContext('hotelStayRanges(arrival, departure, nights)', Object.assign(context, {
      arrival: context.date(arrival),
      departure: context.date(departure),
      nights,
    }));
    const owned = vm.runInContext('hotelNightIndexByIso(ranges)', Object.assign(context, { ranges }));
    return Object.assign({}, owned);
  };
  return context;
}

test('four nights then two nights colour different hotels, and checkout morning belongs to the next hotel', () => {
  const ctx = load();
  const owned = ctx.owners('2026-10-05', '2026-10-12', [4, 2]);
  assert.equal(owned['2026-10-05'], 0);
  assert.equal(owned['2026-10-08'], 0);
  assert.equal(owned['2026-10-09'], 1);
  assert.equal(owned['2026-10-10'], 1);
  assert.equal(owned['2026-10-11'], undefined);
  assert.equal(owned['2026-10-12'], undefined);
});

test('the earlier hotel keeps a night when two stays both claim it', () => {
  const ctx = load();
  const owned = vm.runInContext('hotelNightIndexByIso(ranges)', Object.assign(ctx, {
    ranges: [
      { start: ctx.date('2026-10-05'), end: ctx.date('2026-10-10') },
      { start: ctx.date('2026-10-08'), end: ctx.date('2026-10-12') },
    ],
  }));
  const copy = Object.assign({}, owned);
  assert.equal(copy['2026-10-08'], 0);
  assert.equal(copy['2026-10-09'], 0);
  assert.equal(copy['2026-10-10'], 1);
});

test('the departure morning is not an extra hotel night, and the half-day uses the night before', () => {
  const ctx = load();
  const full = ctx.owners('2026-10-05', '2026-10-12', [4, 3]);
  assert.equal(full['2026-10-11'], 1);
  assert.equal(full['2026-10-12'], undefined);
  assert.equal(vm.runInContext('hotelDepartureSpillIndex(owned, "2026-10-12")', Object.assign(ctx, { owned: full })), 1);

  const short = ctx.owners('2026-10-05', '2026-10-12', [4, 2]);
  assert.equal(short['2026-10-11'], undefined);
  assert.equal(vm.runInContext('hotelDepartureSpillIndex(owned, "2026-10-12")', Object.assign(ctx, { owned: short })), null);

  const past = ctx.owners('2026-10-05', '2026-10-12', [4, 4]);
  assert.equal(past['2026-10-12'], 1);
  assert.equal(vm.runInContext('hotelDepartureSpillIndex(owned, "2026-10-12")', Object.assign(ctx, { owned: past })), null);
});

test('each hotel box has its own softer colour, and calendar day cells use it with black numerals', () => {
  const ctx = load();
  const first = vm.runInContext('hotelToneAt(0)', ctx);
  const second = vm.runInContext('hotelToneAt(1)', ctx);
  assert.equal(first.bg, '#8fd0c4');
  assert.equal(second.bg, '#f3c49a');
  assert.notEqual(first.bg, '#2dd4bf');
  assert.notEqual(second.bg, '#fb923c');
  assert.notEqual(first.bg, second.bg);
  assert.notEqual(first.border, second.border);
  assert.notEqual(first.bg, '#e8f2d6');
  assert.match(html, /\.yc-cell\.tour\.hotel-night[\s\S]*background-color:\s*var\(--hotel-night-bg\)/);
  assert.match(html, /\.yc-cell\.tour\.hotel-night[\s\S]*color:\s*#111/);
  assert.match(html, /\.hotel-depart[\s\S]*linear-gradient\(90deg,\s*var\(--hotel-night-bg\)\s*50%/);
  assert.match(html, /\.hotel-depart[\s\S]*color:\s*#111/);
  assert.doesNotMatch(html, /color:\s*var\(--hotel-night-ink\)/);
  assert.match(html, /\.hotel-card\.hotel-tone[\s\S]*var\(--hotel-tone-bg\)/);
  assert.match(html, /Hotel nights use the same colour as each hotel/);
  assert.match(html, /id="t\$\{t\}_hotel_nights_hint"/);
  assert.match(html, /function updateHotelNightsHint\(tabId\)/);
  assert.match(html, /hint\.hidden = !text/);
  assert.match(html, /paintHotelNightsMismatch\(tabId, mismatch\)/);
  assert.match(html, /\.hint\.hotel-nights-mismatch[\s\S]*var\(--danger\)/);
});
