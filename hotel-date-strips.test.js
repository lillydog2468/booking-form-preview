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

function loadRanges() {
  const context = { console };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('parseFlexibleDateUTC'),
    extractFunction('parseNightsCount'),
    extractFunction('nightsText'),
    extractFunction('hotelStayRanges'),
    extractFunction('formatHotelStayRange'),
    extractFunction('refreshHotelDateStrips'),
  ].join('\n'), context, { filename: 'hotel-date-strips.js' });
  context.date = (iso) => vm.runInContext('parseFlexibleDateUTC(' + JSON.stringify(iso) + ')', context);
  context.labels = (arrival, departure, nights) => {
    const ranges = vm.runInContext(
      'hotelStayRanges(arrival, departure, nights)',
      Object.assign(context, { arrival: context.date(arrival), departure: context.date(departure), nights })
    );
    return Array.from(ranges).map(range => {
      if (!range) return '';
      return vm.runInContext('formatHotelStayRange(range)', Object.assign(context, { range }));
    });
  };
  return context;
}

test('four nights then two nights chain from check-out, inside a 5–12 Oct tour', () => {
  const ctx = loadRanges();
  assert.deepEqual(ctx.labels('05/10/2026', '12/10/2026', [4, 2]), ['5–9 Oct', '9–11 Oct']);
});

test('one hotel with no nights uses arrival through departure', () => {
  const ctx = loadRanges();
  assert.deepEqual(ctx.labels('05/10/2026', '12/10/2026', [null]), ['5–12 Oct']);
});

test('one hotel with nights uses those nights, not the whole tour', () => {
  const ctx = loadRanges();
  assert.deepEqual(ctx.labels('05/10/2026', '12/10/2026', [4]), ['5–9 Oct']);
});

test('a later hotel stays blank until the earlier nights are known', () => {
  const ctx = loadRanges();
  assert.deepEqual(ctx.labels('05/10/2026', '12/10/2026', [null, 2]), ['', '']);
});

test('the last hotel with blank nights takes the rest of the tour', () => {
  const ctx = loadRanges();
  assert.deepEqual(ctx.labels('05/10/2026', '12/10/2026', [4, null]), ['5–9 Oct', '9–12 Oct']);
});

test('nights that run past departure are still shown', () => {
  const ctx = loadRanges();
  assert.deepEqual(ctx.labels('05/10/2026', '12/10/2026', [10, 2]), ['5–15 Oct', '15–17 Oct']);
});

test('the strip names both months, and both years when the stay crosses a year', () => {
  const ctx = loadRanges();
  assert.deepEqual(ctx.labels('30/09/2026', '12/10/2026', [3]), ['30 Sep – 3 Oct']);
  assert.deepEqual(ctx.labels('30/12/2026', '06/01/2027', [4]), ['30 Dec 2026 – 3 Jan 2027']);
});

test('the strips refresh from the hotel boxes when nights or tour dates change', () => {
  const ctx = loadRanges();
  const strips = [];
  function makeStrip() {
    const strip = { textContent: '', hidden: true };
    strips.push(strip);
    return strip;
  }
  function makeRow(nights) {
    const nightsEl = { value: nights };
    const strip = makeStrip();
    return {
      querySelector(sel) {
        if (sel === '.hotel-date-strip') return strip;
        if (sel === '.hotel-stay-nights') return nightsEl;
        return null;
      },
    };
  }
  const primaryStrip = makeStrip();
  const primaryNights = { value: '4' };
  const rows = [makeRow('2')];
  const nodes = new Map([
    ['t1_primary_hotel_dates', primaryStrip],
    ['t1_other_hotel_nights', primaryNights],
    ['t1_tour_arrival_date', { value: '05/10/2026' }],
    ['t1_departure_date', { value: '12/10/2026' }],
    ['t1_hotel_stays_list', {
      querySelectorAll(sel) {
        return sel === '.hotel-stay-row' ? rows : [];
      },
    }],
  ]);
  ctx.document = { getElementById(id) { return nodes.get(id) || null; } };
  ctx.tEl = (tabId, suffix) => nodes.get('t' + tabId + '_' + suffix) || null;
  ctx.primaryHotelVisible = () => true;
  vm.runInContext('refreshHotelDateStrips("1")', ctx);
  assert.equal(primaryStrip.hidden, false);
  assert.equal(primaryStrip.textContent, '5–9 Oct');
  assert.equal(strips[1].textContent, '9–11 Oct');

  primaryNights.value = '3';
  rows[0].querySelector('.hotel-stay-nights').value = '2 nights';
  vm.runInContext('refreshHotelDateStrips("1")', ctx);
  assert.equal(primaryStrip.textContent, '5–8 Oct');
  assert.equal(strips[1].textContent, '8–10 Oct');

  nodes.get('t1_departure_date').value = '14/10/2026';
  primaryNights.value = '';
  rows.length = 0;
  vm.runInContext('refreshHotelDateStrips("1")', ctx);
  assert.equal(primaryStrip.textContent, '5–14 Oct');
});
