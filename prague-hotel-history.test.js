const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

require('./prague-exit.js');
require('./prague-hotel-history.js');
require('./prague-hotel-ratings.js');

const H = globalThis.PragueHotelHistory;
const R = globalThis.PragueHotelRatings;

const axaPlace = {
  id: 12,
  name: 'Hotel AXA',
  nickname: 'Axa',
  place_type: 'hotel',
  address: 'Na Poříčí 40, Prague 1',
};
const josefPlace = {
  id: 18,
  name: 'Hotel Josef',
  nickname: 'Josef',
  place_type: 'hotel',
  address: 'Rybná 20, Prague 1',
};
const shop = {
  id: 3,
  name: 'Bead shop',
  nickname: 'axa',
  place_type: 'shop',
  address: 'Not a hotel',
};

function stay(hotel, checkIn, checkOut, note) {
  return { hotel: hotel, check_in: checkIn, check_out: checkOut, note: note || '' };
}

test('hotel keys ignore case, the word hotel, and extra spaces', () => {
  assert.equal(H.hotelKey('Hotel AXA'), 'axa');
  assert.equal(H.hotelKey('  hotel   axa '), 'axa');
  assert.equal(H.hotelKey('HOTEL AXA'), 'axa');
  assert.equal(H.hotelKey('axa'), 'axa');
  assert.equal(H.hotelKey('Parkhotel'), 'parkhotel');
  assert.equal(H.knownSignature('axa'), H.knownSignature('Hotel AXA'));
  assert.equal(H.knownSignature('Hotel Atlantic, Na Poříčí 9'), H.knownSignature('Atlantic'));
  assert.equal(H.nightsBetween('2026-05-02', '2026-05-04'), 2);
  assert.equal(H.nightsBetween('2026-05-04', '2026-05-02'), 0);
  assert.equal(H.nightsBetween('', '2026-05-02'), 0);
});

test('axa, Atlantic and Josef spellings merge, and a shop nickname does not rename the hotel', () => {
  const members = [
    { id: 1, booking_id: 10, first_name: 'Ann', last_name: 'One', prague_stays: [stay('Hotel AXA', '2024-05-01', '2024-05-02')] },
    { id: 2, booking_id: 10, first_name: 'Bea', last_name: 'Two', prague_stays: [stay('axa', '2024-05-01', '2024-05-02')] },
    { id: 3, booking_id: 11, first_name: 'Cara', last_name: 'Three', prague_stays: [stay('  Hotel   Axa ', '2025-06-01', '2025-06-03')] },
    { id: 4, booking_id: 12, first_name: 'Dee', last_name: 'Four', prague_stays: [stay('Hotel Atlantic, Na Poříčí 9, Prague 1', '2023-04-01', '2023-04-02')] },
    { id: 5, booking_id: 13, first_name: 'Eve', last_name: 'Five', prague_stays: [stay('Atlantic', '2022-04-01', '2022-04-02')] },
    { id: 6, booking_id: 14, first_name: 'Fay', last_name: 'Six', prague_stays: [stay('Rybna', '2021-09-01', '2021-09-02')] },
    { id: 7, booking_id: 15, first_name: 'Gia', last_name: 'Seven', prague_stays: [stay('Hotel Josef', '2020-09-01', '2020-09-03')] },
    { id: 8, booking_id: 16, first_name: 'Cancelled', last_name: 'Guest', prague_stays: [stay('Hotel AXA', '2019-01-01', '2019-01-05')] },
    { id: 1, booking_id: 17, first_name: 'Ann', last_name: 'One', prague_stays: [stay('Hotel AXA', '2026-03-01', '2026-03-02', 'quiet')] },
  ];
  const bookings = [
    { id: 10, group_name: 'May group', tour_arrival_date: '2024-05-02', status: '' },
    { id: 11, group_name: 'June group', tour_arrival_date: '2025-06-03', status: 'confirmed' },
    { id: 12, group_name: 'Atlantic long', tour_arrival_date: '2023-04-02', status: '' },
    { id: 13, group_name: 'Atlantic short', tour_arrival_date: '2022-04-02', status: '' },
    { id: 14, group_name: 'Old Josef', tour_arrival_date: '2021-09-02', status: '' },
    { id: 15, group_name: 'Josef again', tour_arrival_date: '2020-09-02', status: '' },
    { id: 16, group_name: 'Called off', tour_arrival_date: '2019-01-02', status: 'Cancelled' },
    { id: 17, group_name: 'Ann returns', tour_arrival_date: '2026-03-02', status: '' },
  ];
  const hotels = H.buildHistory(members, bookings, [axaPlace, josefPlace, shop]);
  const axa = hotels.find(function (hotel) { return hotel.name === 'Hotel AXA'; });
  const atlantic = hotels.find(function (hotel) { return /atlantic/i.test(hotel.name); });
  const josef = hotels.find(function (hotel) { return hotel.name === 'Hotel Josef'; });
  assert.ok(axa);
  assert.equal(axa.guestCount, 3);
  assert.equal(axa.tourCount, 3);
  assert.equal(axa.nights, 1 + 2 + 1);
  assert.equal(axa.lastStayed, '2026-03-02');
  assert.equal(axa.address, 'Na Poříčí 40, Prague 1');
  assert.equal(axa.placeId, 12);
  assert.equal(atlantic.guestCount, 2);
  assert.equal(atlantic.tourCount, 2);
  assert.equal(atlantic.nights, 2);
  assert.equal(josef.name, 'Hotel Josef');
  assert.equal(josef.guestCount, 2);
  assert.equal(josef.tourCount, 2);
  assert.equal(josef.nights, 1 + 2);
  assert.equal(josef.address, 'Rybná 20, Prague 1');
  assert.equal(hotels[0].name, 'Hotel AXA');
  assert.ok(hotels.every(function (hotel) { return hotel.name !== 'Bead shop'; }));
  const may = axa.tours.find(function (tour) { return tour.groupName === 'May group'; });
  assert.deepEqual(may.guests.slice().sort(), ['Ann One', 'Bea Two']);
  assert.equal(may.spans[0].checkIn, '2024-05-01');
  const returning = axa.tours.find(function (tour) { return tour.groupName === 'Ann returns'; });
  assert.deepEqual(returning.spans[0].notes, ['quiet']);
});

test('the same guest on two tours counts once, and shared dates are one span of nights', () => {
  const members = [
    { id: 1, booking_id: 1, first_name: 'Ann', last_name: 'One', prague_stays: [stay('Hotel AXA', '2024-05-01', '2024-05-03')] },
    { id: 1, booking_id: 2, first_name: 'Ann', last_name: 'One', prague_stays: [stay('axa', '2025-05-01', '2025-05-02')] },
    { id: 2, booking_id: 1, first_name: 'Bea', last_name: 'Two', prague_stays: [stay('Hotel Axa', '2024-05-01', '2024-05-03')] },
  ];
  const bookings = [
    { id: 1, group_name: 'First', tour_arrival_date: '2024-05-03', status: '' },
    { id: 2, group_name: 'Second', tour_arrival_date: '2025-05-02', status: '' },
  ];
  const hotel = H.buildHistory(members, bookings, [])[0];
  assert.equal(hotel.guestCount, 2);
  assert.equal(hotel.tourCount, 2);
  assert.equal(hotel.nights, 2 + 1);
});

test('day trip and blank hotel names are left out', () => {
  const members = [
    { id: 1, booking_id: 1, first_name: 'Ann', last_name: 'One', prague_stays: [stay('day trip', '2024-05-01', '2024-05-02'), stay('Hotel', '', ''), { hotel: '' }] },
  ];
  const bookings = [{ id: 1, group_name: 'Day', tour_arrival_date: '2024-05-02', status: '' }];
  assert.deepEqual(H.buildHistory(members, bookings, []), []);
});

test('ratings sort popular hotels by average, then by guest count', () => {
  const hotels = H.buildHistory([
    { id: 1, booking_id: 1, first_name: 'Ann', last_name: 'A', prague_stays: [stay('Hotel AXA', '2024-05-01', '2024-05-02')] },
    { id: 2, booking_id: 1, first_name: 'Bea', last_name: 'B', prague_stays: [stay('axa', '2024-05-01', '2024-05-02')] },
    { id: 3, booking_id: 1, first_name: 'Cara', last_name: 'C', prague_stays: [stay('Hotel AXA', '2024-05-01', '2024-05-02')] },
    { id: 4, booking_id: 2, first_name: 'Dee', last_name: 'D', prague_stays: [stay('Atlantic', '2024-06-01', '2024-06-02')] },
    { id: 5, booking_id: 3, first_name: 'Eve', last_name: 'E', prague_stays: [stay('Hotel Josef', '2024-07-01', '2024-07-02')] },
  ], [
    { id: 1, group_name: 'Axa week', tour_arrival_date: '2024-05-02', status: '' },
    { id: 2, group_name: 'Atlantic week', tour_arrival_date: '2024-06-02', status: '' },
    { id: 3, group_name: 'Josef week', tour_arrival_date: '2024-07-02', status: '' },
  ], [axaPlace]);
  const attached = H.attachRatings(hotels, [
    { id: 1, hotel_name: 'axa', stars: 5, note: 'Best sleep', created_at: '2026-01-02' },
    { id: 2, hotel_name: 'Hotel AXA', stars: 3, note: '', created_at: '2026-01-01', place_id: 12 },
    { id: 3, hotel_name: 'Hotel Atlantic', stars: 4, note: 'Fine', created_at: '2026-02-01' },
    { id: 4, hotel_name: 'Somewhere new', stars: 5, note: 'Try it', created_at: '2026-03-01' },
  ]);
  const axa = attached.hotels.find(function (hotel) { return hotel.name === 'Hotel AXA'; });
  assert.equal(axa.ratingCount, 2);
  assert.equal(axa.average, 4);
  const popular = H.popularHotels(attached.hotels.concat(attached.extras));
  assert.deepEqual(popular.map(function (hotel) { return hotel.name; }), ['Somewhere new', 'Hotel AXA', 'Atlantic']);
  assert.equal(popular[0].guestCount, 0);
  assert.equal(popular[1].guestCount, 3);
  assert.equal(popular[2].guestCount, 1);
  const html = H.suggestionsHtml(attached.hotels.concat(attached.extras));
  assert.match(html, /Popular with past guests/);
  assert.match(html, /data-hotel-name="Hotel AXA"/);
  assert.match(html, /Na Poříčí 40, Prague 1/);
  assert.match(html, /4 stars/);
  assert.equal(H.popularHotels(attached.hotels.concat(attached.extras), 2).length, 2);
});

test('choosing a suggestion writes the hotel and calls a known-match hook when one is present', () => {
  const seen = [];
  globalThis.showKnownHotelMatch = function (input) { seen.push(input.value); };
  globalThis.PragueHotelMatch = { watch: function (input) { seen.push('watch:' + input.value); } };
  const fired = [];
  const input = {
    value: '',
    dispatchEvent: function (event) { fired.push(event.type); },
  };
  const result = H.fillHotelInput(input, 'Hotel AXA');
  assert.equal(result.value, 'Hotel AXA');
  assert.deepEqual(fired, ['input', 'change']);
  assert.deepEqual(seen, ['watch:Hotel AXA', 'Hotel AXA']);
  delete globalThis.showKnownHotelMatch;
  delete globalThis.PragueHotelMatch;
  H.fillHotelInput(input, 'Atlantic');
  assert.equal(input.value, 'Atlantic');
});

test('rating writes check stars and only delete after confirm', async () => {
  const store = [];
  let nextId = 1;
  function chain(start) {
    const state = Object.assign({ op: 'select', filters: [], patch: null, payload: null }, start);
    const api = {
      select: function () { return api; },
      insert: function (row) { state.op = 'insert'; state.payload = row; return api; },
      update: function (patch) { state.op = 'update'; state.patch = patch; return api; },
      delete: function () { state.op = 'delete'; return api; },
      eq: function (column, value) { state.filters.push([column, value]); return api; },
      order: function () { return api; },
      range: function () { return api; },
      then: function (resolve, reject) {
        try { resolve({ data: finish(state), error: null }); }
        catch (err) { if (reject) reject(err); else throw err; }
      },
    };
    return api;
  }
  function finish(state) {
    if (state.op === 'insert') {
      const row = Object.assign({ id: nextId++, created_at: '2026-11-21T00:00:00Z', updated_at: '2026-11-21T00:00:00Z' }, state.payload);
      store.push(row);
      return [row];
    }
    if (state.op === 'update') {
      const id = state.filters[0][1];
      const row = store.find(function (item) { return item.id === id; });
      Object.assign(row, state.patch);
      return [row];
    }
    if (state.op === 'delete') {
      const id = state.filters[0][1];
      const index = store.findIndex(function (item) { return item.id === id; });
      store.splice(index, 1);
      return null;
    }
    return store.slice().sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
  }
  const sb = { from: function () { return chain(); } };
  await assert.rejects(function () { return R.create(sb, { hotel_name: 'Hotel AXA', stars: 0 }); }, /1 to 5/);
  await assert.rejects(function () { return R.create(sb, { hotel_name: '  ', stars: 4 }); }, /hotel name/i);
  assert.equal(store.length, 0);
  const created = await R.create(sb, { hotel_name: ' Hotel AXA ', stars: '4', note: '  Quiet  ', booking_id: '10', member_id: '', place_id: 12 });
  assert.equal(created.hotel_name, 'Hotel AXA');
  assert.equal(created.stars, 4);
  assert.equal(created.note, 'Quiet');
  assert.equal(created.booking_id, 10);
  assert.equal(created.member_id, null);
  assert.equal(created.place_id, 12);
  const updated = await R.update(sb, created.id, { hotel_name: 'Hotel AXA', stars: 5, note: 'Better' });
  assert.equal(updated.stars, 5);
  assert.ok(updated.updated_at);
  const kept = await R.list(sb);
  assert.equal(kept.length, 1);
  const declined = await H.commitDelete(sb, created.id, function () { return false; });
  assert.equal(declined.deleted, false);
  assert.equal(store.length, 1);
  let asked = '';
  const removed = await H.commitDelete(sb, created.id, function (message) { asked = message; return true; });
  assert.equal(asked, 'Delete this rating?');
  assert.equal(removed.deleted, true);
  assert.equal(store.length, 0);
});

test('the migration file records the applied hotel_ratings table and is not run by the app', () => {
  const sql = fs.readFileSync(path.join(__dirname, 'sql', '33_hotel_ratings.sql'), 'utf8');
  assert.match(sql, /APPLIED/);
  assert.match(sql, /Do not run this file again/);
  assert.match(sql, /hotel_name\s+text NOT NULL/);
  assert.match(sql, /stars\s+smallint NOT NULL CHECK \(stars >= 1 AND stars <= 5\)/);
  assert.match(sql, /updated_at\s+timestamptz NOT NULL DEFAULT now\(\)/);
  assert.match(sql, /REFERENCES public\.planner_places\(id\) ON DELETE SET NULL/);
  assert.match(sql, /REFERENCES public\.bookings\(id\) ON DELETE SET NULL/);
  assert.match(sql, /hotel_ratings_auth_all/);
  assert.match(sql, /TO authenticated/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.hotel_ratings FROM PUBLIC, anon/);
  assert.match(sql, /GRANT ALL ON TABLE public\.hotel_ratings TO authenticated, service_role/);
  assert.match(sql, /GRANT USAGE, SELECT, UPDATE ON SEQUENCE public\.hotel_ratings_id_seq TO authenticated, service_role/);
  const app = fs.readFileSync(path.join(__dirname, 'prague-hotel-history.js'), 'utf8')
    + fs.readFileSync(path.join(__dirname, 'prague-hotel-ratings.js'), 'utf8');
  assert.equal(app.includes('33_hotel_ratings'), false);
  assert.match(fs.readFileSync(path.join(__dirname, 'hotels.html'), 'utf8'), /id="pragueHistory"/);
  assert.match(fs.readFileSync(path.join(__dirname, 'booking-form.js'), 'utf8'), /attachSuggestions/);
  assert.match(fs.readFileSync(path.join(__dirname, 'places-stats.html'), 'utf8'), /pragueHotelsPanel/);
});
