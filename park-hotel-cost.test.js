const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

function loadCost() {
  const context = { console };
  vm.createContext(context);
  vm.runInContext([
    'const PARK_HOTEL_PRICE_DEFAULT = "41";',
    extractFunction('cleanStoredPrice'),
    extractFunction('cleanParkHotelPrice'),
    extractFunction('normHotelName'),
    extractFunction('isParkHotelName'),
    extractFunction('parkHotelRoomCount'),
    extractFunction('parkHotelNights'),
    extractFunction('parkHotelMoney'),
    extractFunction('parkHotelCostInputValue'),
    extractFunction('parkHotelCostLine'),
    extractFunction('parkHotelCostDecision'),
    extractFunction('applyOneParkHotelCost'),
  ].join('\n'), context, { filename: 'park-hotel-cost.js' });
  context.decide = (input) => vm.runInContext('parkHotelCostDecision(input)', Object.assign(context, { input }));
  return context;
}

test('five singles plus Keith’s room for four nights at £41 is £984', () => {
  const ctx = loadCost();
  assert.equal(vm.runInContext('parkHotelRoomCount("5", "", "", true, "5")', ctx), 6);
  assert.equal(vm.runInContext('parkHotelRoomCount("", "", "", false, "5")', ctx), 6);
  assert.equal(vm.runInContext('parkHotelRoomCount("5", "", "", false, "5")', ctx), 5);
  assert.equal(vm.runInContext('parkHotelRoomCount("2", "1", "1", true, "8")', ctx), 5);
  const decision = ctx.decide({
    hotelName: 'Park hotel',
    singles: '5',
    twins: '',
    doubles: '',
    keithOn: true,
    headcount: '5',
    nights: '4',
    rate: '41',
    costValue: '',
    costSource: '',
  });
  assert.equal(decision.line, '6 rooms × 4 nights × £41 = £984');
  assert.equal(decision.fill, '984');
  assert.equal(decision.clearAuto, false);
});

test('a typed hotel cost is left alone and the suggestion line still shows', () => {
  const ctx = loadCost();
  const decision = ctx.decide({
    hotelName: 'Park Hotel',
    singles: '5',
    twins: '',
    doubles: '',
    keithOn: true,
    headcount: '5',
    nights: '4',
    rate: '£41',
    costValue: '500',
    costSource: 'typed',
  });
  assert.equal(decision.fill, null);
  assert.equal(decision.line, '6 rooms × 4 nights × £41 = £984');
  assert.equal(decision.clearAuto, false);

  const updated = ctx.decide({
    hotelName: 'Parkhotel Smržovka',
    singles: '5',
    twins: '',
    doubles: '',
    keithOn: true,
    headcount: '5',
    nights: '5',
    rate: '41',
    costValue: '984',
    costSource: 'park',
  });
  assert.equal(updated.fill, '1230');
  assert.equal(updated.line, '6 rooms × 5 nights × £41 = £1230');
});

test('organiser hotels, another hotel, and a missing night do not fill a cost', () => {
  const ctx = loadCost();
  const base = {
    singles: '5', twins: '', doubles: '', keithOn: true, headcount: '5',
    nights: '4', rate: '41', costValue: '', costSource: '',
  };
  assert.equal(ctx.decide(Object.assign({}, base, { organiser: true, hotelName: 'Park hotel' })).line, '');
  assert.equal(ctx.decide(Object.assign({}, base, { organiser: true, hotelName: 'Park hotel' })).clearAuto, true);
  assert.equal(ctx.decide(Object.assign({}, base, { hotelName: 'Na Basta' })).line, '');
  assert.equal(ctx.decide(Object.assign({}, base, { hotelName: 'Grand Hotel, Písek' })).fill, null);
  assert.equal(ctx.decide(Object.assign({}, base, { hotelName: 'Park hotel', nights: '' })).line, '');
  assert.equal(vm.runInContext('isParkHotelName("day trip")', ctx), false);
  assert.equal(vm.runInContext('isParkHotelName("Parkhotel")', ctx), true);
});

test('the suggestion is written onto a blank price and not onto a typed one', () => {
  const ctx = loadCost();
  const price = { value: '', dataset: {} };
  const line = { textContent: '', hidden: true };
  ctx.input = {
    hotelName: 'Park hotel',
    singles: '5', twins: '', doubles: '', keithOn: true, headcount: '5',
    nights: '4', rate: '41', costValue: '', costSource: '',
  };
  ctx.price = price;
  ctx.line = line;
  vm.runInContext('applyOneParkHotelCost(input, price, line)', ctx);
  assert.equal(price.value, '984');
  assert.equal(price.dataset.hotelCostSource, 'park');
  assert.equal(line.textContent, '6 rooms × 4 nights × £41 = £984');
  assert.equal(line.hidden, false);

  price.value = '500';
  price.dataset.hotelCostSource = 'typed';
  ctx.input.costValue = '500';
  ctx.input.costSource = 'typed';
  vm.runInContext('applyOneParkHotelCost(input, price, line)', ctx);
  assert.equal(price.value, '500');
  assert.equal(price.dataset.hotelCostSource, 'typed');
  assert.equal(line.hidden, false);
});

test('the hotel cost line sits with the price and is applied before the expense total', () => {
  assert.match(html, /id="t\$\{t\}_park_hotel_cost"/);
  assert.match(html, /class="hint park-hotel-cost"/);
  const hotelStart = html.indexOf('function hotelEditorHTML(');
  const hotelEnd = html.indexOf('function yearToursCalendarHTML(', hotelStart);
  const hotel = html.slice(hotelStart, hotelEnd);
  const priceAt = hotel.indexOf('id="t${t}_hotel_price"');
  const lineAt = hotel.indexOf('id="t${t}_park_hotel_cost"');
  assert.ok(priceAt > 0 && lineAt > priceAt);
  const recalc = extractFunction('recalculateTab');
  assert.ok(recalc.indexOf('applyParkHotelCosts') >= 0);
  assert.ok(recalc.indexOf('applyParkHotelCosts') < recalc.indexOf('getExpensesTotalCost'));
  assert.match(extractFunction('noteLoadedHotelCosts'), /hotelCostSource = 'typed'/);
  assert.match(html, /id="parkHotelPrice"/);
  assert.match(html, /£ per person per night/);
});
