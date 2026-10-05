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

function between(startMark, endMark) {
  const start = html.indexOf(startMark);
  const end = html.indexOf(endMark, start + startMark.length);
  assert.ok(start >= 0 && end > start, 'missing range ' + startMark);
  return html.slice(start, end);
}

test('tour fare sits as price per person, then headcount, then beading tour price', () => {
  const fare = between('function tourFareHTML(', 'function fuelCostFieldHTML(');
  const person = fare.indexOf('id="t${t}_price_per_person"');
  const head = fare.indexOf('id="t${t}_no_people"');
  const beading = fare.indexOf('id="t${t}_beading_tour_price"');
  assert.ok(person > 0 && head > person && beading > head);
  const fareCss = between('.tour-fare-block {', '.hotel-card {');
  assert.match(fareCss, /flex-wrap:\s*wrap/);
  assert.match(fareCss, /min-height:\s*28px/);
  const name = fare.indexOf('id="t${t}_group_name"');
  assert.ok(name > 0 && name < person, 'group name sits on the fare row before the price');
  const layout = between('function buildLayoutFormHTML(', 'function clampYear(');
  const standard = between('function buildFormHTML(', 'function buildLayoutFormHTML(');
  assert.ok(layout.indexOf('${tourFareHTML(t)}') < layout.indexOf('id="t${t}_org_first"'));
  assert.ok(standard.indexOf('${tourFareHTML(t)}') < standard.indexOf('id="t${t}_org_first"'));
  const hotel = between('function hotelEditorHTML(', 'function yearToursCalendarHTML(');
  assert.equal(hotel.includes('price_per_person'), false);
  assert.equal(hotel.includes('beading_tour_price'), false);
  assert.equal(hotel.includes('>Booked'), false);
  assert.match(hotel, /id="t\$\{t\}_primary_hotel_num"/);
  assert.match(hotel, /id="t\$\{t\}_main_hotel_booked" hidden/);
});

test('Na Baště is the same hotel as Na Basta, and slots number straight through', () => {
  const nodes = new Map();
  const document = {
    getElementById(id) { return nodes.get(id) || null; },
  };
  function row(label) {
    const num = { textContent: label };
    return {
      className: 'hotel-stay-row',
      querySelector(sel) { return sel === '.hotel-stay-num' ? num : null; },
      querySelectorAll() { return []; },
    };
  }
  const stays = [];
  const list = {
    querySelectorAll(sel) {
      return sel === '.hotel-stay-row' ? stays.slice() : [];
    },
  };
  const card = { hidden: false };
  const select = { value: '1', selectedOptions: [{ textContent: 'Na Basta' }] };
  nodes.set('t1_primary_hotel_num', { textContent: '' });
  nodes.set('t1_hotel_stays_list', list);
  nodes.set('t1_primary_hotel_card', card);
  nodes.set('t1_what_hotel', select);
  stays.push(row('1'), row('2'), row('3'));

  const ctx = {
    document,
    hotelNameById(id) { return String(id) === '1' ? 'Na Basta' : ''; },
  };
  vm.createContext(ctx);
  const source = [
    extractFunction('tEl'),
    extractFunction('normHotelName'),
    extractFunction('looseHotelName'),
    extractFunction('selectedHotelName'),
    extractFunction('primaryShownHotelName'),
    extractFunction('primaryHotelVisible'),
    extractFunction('renumberHotelStayRows'),
    extractFunction('formHotelAlreadyShown'),
    extractFunction('hotelStayRowName'),
  ].join('\n');
  vm.runInContext(source, ctx);

  assert.equal(ctx.normHotelName('Na Baště'), ctx.normHotelName('Na Basta'));
  assert.equal(ctx.normHotelName('La Basta'), 'na basta');
  assert.equal(ctx.normHotelName('Hotel Na Baště'), 'na basta');
  assert.notEqual(ctx.normHotelName('Hotel Karolina'), 'na basta');
  assert.equal(ctx.formHotelAlreadyShown('1', 'Na Baště'), true);
  assert.equal(ctx.formHotelAlreadyShown('1', 'La Basta'), true);
  assert.equal(ctx.formHotelAlreadyShown('1', 'Prague Airport Hotel'), false);

  ctx.renumberHotelStayRows('1');
  assert.equal(nodes.get('t1_primary_hotel_num').textContent, 'Hotel 1');
  assert.deepEqual(stays.map(item => item.querySelector('.hotel-stay-num').textContent), ['Hotel 2', 'Hotel 3', 'Hotel 4']);

  card.hidden = true;
  ctx.renumberHotelStayRows('1');
  assert.deepEqual(stays.map(item => item.querySelector('.hotel-stay-num').textContent), ['Hotel 1', 'Hotel 2', 'Hotel 3']);

  select.selectedOptions = [{ textContent: '' }];
  card.hidden = false;
  assert.equal(ctx.formHotelAlreadyShown('1', 'Na Baště'), true);
});
