const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const vm = require('node:vm');

const extrasSrc = fs.readFileSync(path.join(__dirname, 'booking-extras.js'), 'utf8');
const formSrc = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');

function loadExtras() {
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(extrasSrc, context);
  return context.window.BookingExtras;
}

test('projected profit follows the form and leaves out an organiser’s hotel', () => {
  const BE = loadExtras();
  const heather = {
    id: 1,
    tour_arrival_date: '2027-04-11',
    no_people: 10,
    price_per_person: 100,
    beading_tour_price: 1000,
    leader_half_price: true,
    fuelcost: 20,
    totalexpenses: 270,
    _expenses: [{ hotel_id: 3, cost: 200 }],
    _additional_expenses: [{ description: 'Coach', cost: 50 }],
  };
  assert.equal(BE.forecastProfit(heather), 680);

  const doris = {
    id: 2,
    tour_arrival_date: '2027-06-01',
    no_people: 1,
    beading_tour_price: 100,
    fuelcost: 20,
    totalexpenses: 450,
    _extras: { organiserBooksHotels: true },
    _expenses: [{ hotel_id: 3, cost: 400 }],
    _additional_expenses: [{ description: 'Coach', cost: 30 }],
  };
  assert.equal(BE.forecastProfit(doris), 50);

  const day = {
    id: 3,
    group_name: 'Beading day trip',
    tour_arrival_date: '2027-08-02',
    departure_date: '2027-08-02',
    no_people: 8,
    beading_tour_price: 85,
    fuelcost: 10,
    totalexpenses: 10,
    _extras: { dayTrip: true },
  };
  assert.equal(BE.forecastProfit(day), 75);

  heather.departure_date = '2027-04-16';
  doris.departure_date = '2027-06-08';
  const year = BE.yearProfitTotal([heather, doris, day], 2027, 2026);
  assert.equal(year.past, false);
  assert.equal(year.amount, 805);
  assert.equal(year.people, 19);
  assert.equal(year.nights, 12);
  assert.equal(year.peopleNights, 57);
  assert.equal(year.label, '2027 projected profit ');

  const twice = BE.yearProfitTotal([heather, heather], 2027, 2026);
  assert.equal(twice.amount, 680);
  assert.equal(twice.people, 10);
  assert.equal(twice.nights, 5);
  assert.equal(twice.peopleNights, 50);
});

test('a past year uses saved profit, and a tour counts in the year it starts', () => {
  const BE = loadExtras();
  const ended = {
    id: 8,
    tour_arrival_date: '2025-05-01',
    departure_date: '2025-05-06',
    beading_tour_price: 500,
    totalexpenses: 100,
    totalprofit: 40,
  };
  const loss = {
    id: 9,
    tour_arrival_date: '2025-09-01',
    totalprofit: -15,
    beading_tour_price: 200,
    totalexpenses: 0,
  };
  const spans = {
    id: 10,
    tour_arrival_date: '2025-12-30',
    departure_date: '2026-01-02',
    totalprofit: 100,
    beading_tour_price: 300,
    totalexpenses: 0,
  };
  const next = {
    id: 11,
    tour_arrival_date: '2026-05-01',
    beading_tour_price: 200,
    totalexpenses: 50,
    totalprofit: 10,
  };
  ended.no_people = 4;
  loss.no_people = 2;
  spans.no_people = 6;
  const past = BE.yearProfitTotal([ended, loss, spans, next], 2025, 2026);
  assert.equal(past.past, true);
  assert.equal(past.amount, 125);
  assert.equal(past.people, 12);
  assert.equal(past.nights, 8);
  assert.equal(past.peopleNights, 38);
  assert.equal(past.label, '2025 profit ');
  const current = BE.yearProfitTotal([ended, loss, spans, next], 2026, 2026);
  assert.equal(current.past, false);
  assert.equal(current.amount, 150);
  assert.equal(current.people, 0);
  assert.equal(current.nights, 0);
  assert.equal(current.peopleNights, 0);
  assert.equal(current.label, '2026 projected profit ');
});

function extrasNotes(headcount) {
  return '<<<BOOKING_EXTRAS_JSON>>>\n' + JSON.stringify({ headcount: String(headcount) }) + '\n<<<END_BOOKING_EXTRAS>>>';
}

test('2027 people and nights come from the text headcount and the tour dates', () => {
  const BE = loadExtras();
  const rows = [
    {
      id: 297,
      no_people: '7',
      people: 99,
      arrival: '2027-01-01',
      departure: '2027-01-09',
      tour_arrival_date: '2027-04-11',
      departure_date: '2027-04-16',
      beading_tour_price: 5232.5,
      totalexpenses: 100,
      extra_notes: extrasNotes(7),
    },
    {
      id: 28,
      no_people: '2',
      people: 40,
      arrival: '2026-01-01',
      tour_arrival_date: '2027-09-06',
      departure_date: '2027-09-10',
      beading_tour_price: 1380,
      totalexpenses: 450,
      extra_notes: extrasNotes(2),
    },
    {
      id: 292,
      no_people: '1',
      tour_arrival_date: '2027-10-02',
      departure_date: '2027-10-10',
      beading_tour_price: 6000,
      totalexpenses: 1750,
      extra_notes: extrasNotes(1),
    },
  ];
  const year = BE.yearProfitTotal(rows, 2027, 2026);
  assert.equal(year.people, 10);
  assert.equal(year.nights, 17);
  assert.equal(year.peopleNights, 51);
  assert.equal(year.amount, 10312.5);

  const notesOnly = {
    id: 301,
    no_people: '',
    tour_arrival_date: '2027-11-01',
    departure_date: '2027-11-04',
    beading_tour_price: 300,
    totalexpenses: 0,
    extra_notes: extrasNotes(4),
  };
  const withNotes = BE.yearProfitTotal(rows.concat(notesOnly), 2027, 2026);
  assert.equal(withNotes.people, 14);
  assert.equal(withNotes.nights, 20);
  assert.equal(withNotes.peopleNights, 63);
  assert.equal(BE.bookingHeadcount(notesOnly), 4);
  assert.equal(BE.bookingNights(rows[0]), 5);
  assert.equal(BE.bookingNights(rows[1]), 4);
  assert.equal(BE.bookingNights(rows[2]), 8);
});

test('the year tours page shows one figure for each open year', () => {
  assert.match(formSrc, /id="yearProfitFigures"/);
  assert.match(formSrc, /\.year-profit-figure\.positive/);
  assert.match(formSrc, /\.year-profit-figure\.negative/);
  assert.match(formSrc, /year-profit-figure \$\{tone\}/);
  assert.match(formSrc, /refreshYearProfitFigures\(\)/);
  assert.match(formSrc, /yearCountPhrase\(fig\.people, 'person', 'people'\)/);
  assert.match(formSrc, /yearCountPhrase\(fig\.nights, 'night', 'nights'\)/);
  assert.match(formSrc, /yearCountPhrase\(fig\.peopleNights, 'people-night', 'people-nights'\)/);
  assert.match(formSrc, /year-profit-main/);
  assert.match(formSrc, /year-profit-extra/);
  assert.match(formSrc, /\.year-profit-figure \{[^}]*flex-wrap: wrap;/);
});
