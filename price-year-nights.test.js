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

function extractRange(startMark, endMark) {
  const start = html.indexOf(startMark);
  const end = html.indexOf(endMark, start + startMark.length);
  assert.ok(start >= 0 && end > start, 'missing source range ' + startMark);
  return html.slice(start, end);
}

function classList() {
  const classes = new Set();
  return {
    classes,
    add(c) { classes.add(c); },
    remove(...cs) { cs.forEach(c => classes.delete(c)); },
    toggle(c, on) { if (on) classes.add(c); else classes.delete(c); },
    contains(c) { return classes.has(c); },
  };
}

function loadForm() {
  const store = new Map();
  const nodes = new Map();
  const priceYears = [];
  function makeNode(id, extra) {
    const node = Object.assign({
      id,
      value: '',
      dataset: {},
      checked: false,
      hidden: false,
      textContent: '',
      className: '',
      classList: classList(),
      attrs: {},
      children: [],
      setAttribute(name, value) { this.attrs[name] = value; },
      getAttribute(name) { return this.attrs[name]; },
      querySelectorAll(sel) {
        if (sel === '.hotel-stay-nights') return this.children.filter(child => child.className === 'hotel-stay-nights');
        return [];
      },
    }, extra || {});
    if (id) nodes.set(id, node);
    return node;
  }
  const note = makeNode('priceBookYearNote');
  const hint = makeNode('ttab_price_hint');
  const price = makeNode('ttab_price_per_person');
  const arrival = makeNode('ttab_tour_arrival_date');
  const departure = makeNode('ttab_departure_date');
  const dayTrip = makeNode('ttab_day_trip');
  const place = makeNode('ttab_tour_place');
  place.value = 'beading';
  const hotelNights = makeNode('ttab_other_hotel_nights');
  const tourNights = makeNode('ttab_hotel_nights');
  const nightsHint = makeNode('ttab_hotel_nights_hint');
  nightsHint.hidden = true;
  const card = makeNode('ttab_primary_hotel_card');
  card.hidden = false;
  const stays = makeNode('ttab_hotel_stays_list');
  const sidebarYear = makeNode('sidebarYear');
  sidebarYear.value = 'all';
  makeNode('priceBookYears');

  const context = {
    localStorage: {
      getItem(key) { return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { store.set(key, String(value)); },
    },
    document: {
      getElementById(id) { return nodes.get(id) || null; },
      querySelectorAll(sel) {
        if (sel === '#priceBookYears .price-year') return priceYears;
        return [];
      },
    },
    console,
    recalcs: 0,
    priceYears,
    nodes,
    stays,
    card,
  };
  context.recalculateTab = () => { context.recalcs += 1; };
  context.tabIsDayTrip = (tabId) => !!context.document.getElementById('t' + tabId + '_day_trip')?.checked;
  context.primaryHotelVisible = () => !context.card.hidden;
  context.el = (id) => context.document.getElementById(id);
  context.tEl = (tabId, suffix) => context.document.getElementById('t' + tabId + '_' + suffix);
  vm.createContext(context);
  vm.runInContext([
    extractFunction('parseFlexibleDateUTC'),
    extractRange('const PRICE_BOOK_KEY', 'function tabIsDayTrip'),
  ].join('\n'), context, { filename: 'booking-form-price-year.js' });
  context.seed = (book) => store.set('keith_tour_price_book_v1', JSON.stringify(book));
  context.addYearNode = (year) => {
    const node = makeNode('', { attrs: { 'data-year': year } });
    node.getAttribute = (name) => node.attrs[name];
    priceYears.push(node);
    return node;
  };
  return context;
}

const book = {
  years: {
    '2025': { dayTrip: '80', beading: { '3': '505' } },
    '2026': { dayTrip: '90', beading: { '3': '530' } },
  },
};

test('a 2025 arrival uses the 2025 three-night price, not the 2026 price', () => {
  const ctx = loadForm();
  ctx.seed(book);
  ctx.nodes.get('ttab_tour_arrival_date').value = '23/09/2025';
  ctx.nodes.get('ttab_departure_date').value = '26/09/2025';
  vm.runInContext('applySuggestedPrice("tab")', ctx);
  const price = ctx.nodes.get('ttab_price_per_person');
  const hint = ctx.nodes.get('ttab_price_hint');
  assert.equal(price.value, '505');
  assert.equal(price.dataset.priceSource, 'table');
  assert.match(hint.textContent, /2025 list/);
  assert.match(hint.textContent, /2025 beading list/);
  assert.doesNotMatch(hint.textContent, /2026/);
  assert.equal(hint.classList.contains('price-year-warn'), false);
});

test('a typed price is left alone when the year filter disagrees with arrival', () => {
  const ctx = loadForm();
  ctx.seed(book);
  ctx.nodes.get('ttab_tour_arrival_date').value = '23/09/2025';
  ctx.nodes.get('ttab_departure_date').value = '26/09/2025';
  ctx.nodes.get('sidebarYear').value = '2026';
  const price = ctx.nodes.get('ttab_price_per_person');
  price.value = '999';
  price.dataset.priceSource = 'typed';
  vm.runInContext('applySuggestedPrice("tab")', ctx);
  const hint = ctx.nodes.get('ttab_price_hint');
  assert.equal(price.value, '999');
  assert.equal(price.dataset.priceSource, 'typed');
  assert.match(hint.textContent, /The year filter is 2026, but this tour arrives in 2025/);
  assert.match(hint.textContent, /The 2026 price list was not applied/);
  assert.match(hint.textContent, /A price already typed on this booking is left as it is/);
  assert.equal(hint.classList.contains('price-year-warn'), true);
});

test('a blank price uses the arrival year when the year filter disagrees', () => {
  const ctx = loadForm();
  ctx.seed(book);
  ctx.nodes.get('ttab_tour_arrival_date').value = '23/09/2025';
  ctx.nodes.get('ttab_departure_date').value = '26/09/2025';
  ctx.nodes.get('sidebarYear').value = '2026';
  vm.runInContext('applySuggestedPrice("tab")', ctx);
  const price = ctx.nodes.get('ttab_price_per_person');
  const hint = ctx.nodes.get('ttab_price_hint');
  assert.equal(price.value, '505');
  assert.match(hint.textContent, /The 2026 price list was not applied/);
  assert.match(hint.textContent, /2025 beading list/);
  assert.doesNotMatch(hint.textContent, /530/);
});

test('with no arrival date, the year filter chooses the list and today is not used', () => {
  const ctx = loadForm();
  ctx.seed(book);
  ctx.nodes.get('ttab_day_trip').checked = true;
  ctx.nodes.get('sidebarYear').value = '2025';
  vm.runInContext('applySuggestedPrice("tab")', ctx);
  assert.equal(ctx.nodes.get('ttab_price_per_person').value, '80');
  assert.match(ctx.nodes.get('ttab_price_hint').textContent, /2025 tour price list/);

  ctx.nodes.get('sidebarYear').value = 'all';
  ctx.nodes.get('ttab_price_per_person').value = '';
  ctx.nodes.get('ttab_price_per_person').dataset.priceSource = '';
  vm.runInContext('applySuggestedPrice("tab")', ctx);
  assert.equal(ctx.nodes.get('ttab_price_per_person').value, '');
  assert.match(ctx.nodes.get('ttab_price_hint').textContent, /current calendar year is not used/);
});

test('the price book note names the year in use and leaves the other year idle', () => {
  const ctx = loadForm();
  ctx.seed(book);
  const y2025 = ctx.addYearNode('2025');
  const y2026 = ctx.addYearNode('2026');
  ctx.nodes.get('ttab_tour_arrival_date').value = '23/09/2025';
  ctx.nodes.get('ttab_departure_date').value = '26/09/2025';
  vm.runInContext('applySuggestedPrice("tab")', ctx);
  assert.match(ctx.nodes.get('priceBookYearNote').textContent, /uses the 2025 tour price list/);
  assert.equal(y2025.classList.contains('is-active'), true);
  assert.equal(y2026.classList.contains('is-idle'), true);
});

test('blank Hotel nights fill from the dates, and a typed value stays', () => {
  const ctx = loadForm();
  ctx.nodes.get('ttab_tour_arrival_date').value = '23/09/2025';
  ctx.nodes.get('ttab_departure_date').value = '26/09/2025';
  vm.runInContext('suggestBlankHotelNights("tab")', ctx);
  const hotel = ctx.nodes.get('ttab_other_hotel_nights');
  assert.equal(hotel.value, '3');
  assert.equal(hotel.dataset.nightsSource, 'dates');
  assert.equal(hotel.placeholder, 'Suggested: 3 nights');
  assert.equal(ctx.nodes.get('ttab_hotel_nights').value, '');
  assert.equal(ctx.nodes.get('ttab_hotel_nights_hint').hidden, true);

  hotel.value = '2';
  hotel.dataset.nightsSource = 'typed';
  ctx.nodes.get('ttab_departure_date').value = '27/09/2025';
  vm.runInContext('suggestBlankHotelNights("tab")', ctx);
  assert.equal(hotel.value, '2');
});

test('a dates suggestion updates when the departure changes', () => {
  const ctx = loadForm();
  ctx.nodes.get('ttab_tour_arrival_date').value = '23/09/2025';
  ctx.nodes.get('ttab_departure_date').value = '26/09/2025';
  vm.runInContext('suggestBlankHotelNights("tab")', ctx);
  ctx.nodes.get('ttab_departure_date').value = '27/09/2025';
  vm.runInContext('suggestBlankHotelNights("tab")', ctx);
  assert.equal(ctx.nodes.get('ttab_other_hotel_nights').value, '4');
});

test('the only hotel-stay nights box is filled when the main hotel card is hidden', () => {
  const ctx = loadForm();
  ctx.card.hidden = true;
  ctx.nodes.get('ttab_tour_arrival_date').value = '25/05/2025';
  ctx.nodes.get('ttab_departure_date').value = '28/05/2025';
  const stay = {
    value: '',
    dataset: {},
    className: 'hotel-stay-nights',
    classList: classList(),
  };
  ctx.stays.children.push(stay);
  vm.runInContext('suggestBlankHotelNights("tab")', ctx);
  assert.equal(stay.value, '3');
  assert.equal(stay.dataset.nightsSource, 'dates');
  assert.equal(ctx.nodes.get('ttab_hotel_nights').value, '');
  assert.equal(ctx.nodes.get('ttab_other_hotel_nights').value, '');

  stay.value = '1';
  stay.dataset.nightsSource = 'typed';
  ctx.nodes.get('ttab_departure_date').value = '30/05/2025';
  vm.runInContext('suggestBlankHotelNights("tab")', ctx);
  assert.equal(stay.value, '1');
});

test('loaded nights are kept, and a blank Hotel nights box is filled on load', () => {
  const ctx = loadForm();
  ctx.nodes.get('ttab_tour_arrival_date').value = '23/09/2025';
  ctx.nodes.get('ttab_departure_date').value = '26/09/2025';
  ctx.nodes.get('ttab_other_hotel_nights').value = '2 nights';
  vm.runInContext('noteLoadedNights("tab")', ctx);
  assert.equal(ctx.nodes.get('ttab_other_hotel_nights').value, '2 nights');
  assert.equal(ctx.nodes.get('ttab_other_hotel_nights').dataset.nightsSource, 'typed');

  ctx.nodes.get('ttab_other_hotel_nights').value = '';
  ctx.nodes.get('ttab_other_hotel_nights').dataset.nightsSource = '';
  vm.runInContext('noteLoadedNights("tab")', ctx);
  assert.equal(ctx.nodes.get('ttab_other_hotel_nights').value, '3');
});

test('a day trip does not receive hotel nights', () => {
  const ctx = loadForm();
  ctx.nodes.get('ttab_day_trip').checked = true;
  ctx.nodes.get('ttab_tour_arrival_date').value = '23/09/2025';
  ctx.nodes.get('ttab_departure_date').value = '26/09/2025';
  vm.runInContext('suggestBlankHotelNights("tab")', ctx);
  assert.equal(ctx.nodes.get('ttab_other_hotel_nights').value, '');
});

test('several hotels keep what was typed, and a quiet hint shows when the nights do not add up', () => {
  const ctx = loadForm();
  ctx.nodes.get('ttab_tour_arrival_date').value = '23/09/2025';
  ctx.nodes.get('ttab_departure_date').value = '26/09/2025';
  const stay = {
    value: '',
    dataset: {},
    className: 'hotel-stay-nights',
    classList: classList(),
    placeholder: '',
  };
  ctx.stays.children.push(stay);
  vm.runInContext('suggestBlankHotelNights("tab")', ctx);
  const primary = ctx.nodes.get('ttab_other_hotel_nights');
  const hint = ctx.nodes.get('ttab_hotel_nights_hint');
  assert.equal(primary.value, '');
  assert.equal(stay.value, '');
  assert.equal(ctx.nodes.get('ttab_hotel_nights').value, '');
  assert.equal(hint.hidden, false);
  assert.match(hint.textContent, /Their nights should add up to 3 nights/);
  assert.equal(primary.placeholder, 'e.g. 3 nights');

  primary.value = '1';
  primary.dataset.nightsSource = 'typed';
  stay.value = '2';
  stay.dataset.nightsSource = 'typed';
  vm.runInContext('updateHotelNightsHint("tab")', ctx);
  assert.equal(hint.hidden, true);

  stay.value = '1';
  vm.runInContext('suggestBlankHotelNights("tab")', ctx);
  assert.equal(primary.value, '1');
  assert.equal(stay.value, '1');
  assert.equal(hint.hidden, false);
  assert.match(hint.textContent, /add up to 2 nights/);
  assert.match(hint.textContent, /The stay from arrival to departure is 3 nights/);
});
