const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('./prague-exit.js');
require('./rough-week.js');
require('./planner2-model.js');
require('./booking-extras.js');

const R = globalThis.RoughWeek;
const planner = fs.readFileSync(path.join(__dirname, 'tour-planner.js'), 'utf8');

test('the rough week uses the old planner place slots and the day pattern', () => {
  const body = planner.slice(planner.indexOf('function roughWeekPlaceSlots'), planner.indexOf('function buildRoughDayBlocks'));
  const ours = JSON.stringify(R.SLOTS);
  R.SLOTS.day1.concat(...R.SLOTS.later).forEach(function (slot) {
    assert.match(body, new RegExp(slot.ref.ids[0]));
    assert.equal(R.slotTime(slot.time) >= '09:15' && R.slotTime(slot.time) <= '16:00', true);
    assert.match(ours, new RegExp(slot.ref.ids[0]));
  });
  assert.equal(R.slotTime('08:30'), '09:15');
  assert.equal(R.slotTime('17:30'), null);
});

test('an empty week is suggested as before, and an existing plan asks before replan or delete', () => {
  const empty = { groupName: 'Sharon Harris', days: [{ date: '2027-05-10', blocks: [] }, { date: '2027-05-11', blocks: [] }] };
  assert.equal(R.hasPlan(empty), false);
  assert.equal(R.suggestAction(empty), 'suggest');
  const places = [{ id: 'kf01', name: 'Rutkovsky', type: 'factory' }];
  const suggested = R.applySuggestChoice(empty, places, 'suggest', false);
  assert.equal(suggested.action, 'suggest');
  assert.ok(empty.days[0].blocks.length > 0);
  const kept = empty.days[0].blocks.map(function (stop) { return stop.title; });

  const planned = globalThis.Planner2.samplePlan();
  planned.groupName = 'Jennifer Lindsay';
  const before = planned.days[1].blocks.map(function (stop) { return stop.id; });
  assert.equal(R.suggestAction(planned), 'menu');
  assert.equal(R.applySuggestChoice(planned, places, 'cancel', true).action, 'cancel');
  assert.deepEqual(planned.days[1].blocks.map(function (stop) { return stop.id; }), before);
  assert.equal(R.applySuggestChoice(planned, places, 'replan', false).action, 'replan-ask');
  assert.deepEqual(planned.days[1].blocks.map(function (stop) { return stop.id; }), before);
  assert.match(R.replanMessage(planned), /Replan the week for Jennifer Lindsay\? This replaces the stops already on the plan\./);
  const replanned = R.applySuggestChoice(planned, places, 'replan', true);
  assert.equal(replanned.action, 'replan');
  assert.notDeepEqual(planned.days[1].blocks.map(function (stop) { return stop.id; }), before);
  assert.equal(R.applySuggestChoice(planned, places, 'delete', false).action, 'delete-ask');
  assert.ok(R.hasPlan(planned));
  assert.match(R.deleteMessage(planned), /Delete all planned stops for Jennifer Lindsay\? This can't be undone\./);
  const removed = R.applySuggestChoice(planned, places, 'delete', true);
  assert.equal(removed.action, 'delete');
  assert.ok(removed.removed > 0);
  assert.equal(R.hasPlan(planned), false);
  assert.ok(planned.days.every(function (day) { return day.blocks.length === 0; }));
  assert.deepEqual(empty.days[0].blocks.map(function (stop) { return stop.title; }), kept);
});

test('booking 297 falls back to the Prague hotel on the booking when guests have no stay', () => {
  const notes = '<<<BOOKING_EXTRAS_JSON>>>\n' + JSON.stringify({
    travel: { pickupPoint: 'prague_hotel', pickupPlace: 'axa', pickupTime: '08:00' },
    extraStays: { pragueNights: '1', pragueHotel: 'hotel axa' },
    samePrague: true,
  }) + '\n<<<END_BOOKING_EXTRAS>>>';
  const extras = globalThis.BookingExtras.splitNotesAndExtras(notes).extras;
  assert.equal(extras.travel.pickupPlace, 'axa');
  assert.equal(extras.samePrague, true);
  const axa = globalThis.PragueExit.placeFor('axa');
  const named = globalThis.PragueExit.placeFor('hotel axa');
  const titled = globalThis.PragueExit.placeFor('Hotel AXA');
  assert.equal(axa.address, 'Na Poříčí 40, Praha 1');
  assert.equal(named.address, axa.address);
  assert.equal(titled.address, axa.address);
  assert.equal(axa.street, 'Na Poříčí');
  assert.equal(axa.lat, named.lat);
  assert.ok(Math.abs(axa.lng - 14.435736) < 0.0001);
  assert.equal(R.resolveHotelPoint('axa', []), 'Na Poříčí 40, Praha 1');
  assert.equal(R.resolveHotelPoint('hotel axa', []), axa.address);
  assert.equal(R.resolveHotelPoint('Hotel AXA', []), axa.address);
  const pinned = R.resolveHotelPoint('axa', [
    { name: 'Hotel Axa', address: 'Na Poříčí 40, Prague 1', pinLat: 50.091, pinLng: 14.44 },
  ]);
  assert.equal(pinned, '50.091,14.44');
  const plan = globalThis.Planner2.emptyPlanFromBooking({
    id: 297,
    group_name: 'Heather Kingsley Heath',
    tour_arrival_date: '2027-04-11',
    departure_date: '2027-04-16',
  });
  const people = [{ id: 1, first_name: 'Heather', last_name: 'Kingsley Heath', prague_stays: null }];
  const added = R.addEnds(plan, people, extras, []);
  assert.equal(added.pickups, 1);
  assert.equal(added.dropoffs, 1);
  const pickup = plan.days[0].blocks[0];
  assert.equal(pickup.time, '08:00');
  assert.equal(pickup.hotelName, 'axa');
  assert.match(pickup.title, /Heather Kingsley Heath/);
  assert.equal(pickup.address, 'Na Poříčí 40, Praha 1');
  assert.equal(pickup.praguePickups[0].address, pickup.address);
  const rows = globalThis.Planner2.pickupRows(plan.days[0]);
  assert.equal(rows[0].point, pickup.address);
  assert.equal(rows[0].label, 'axa');
  const guestPlan = globalThis.Planner2.emptyPlanFromBooking({
    id: 297, group_name: 'Heather Kingsley Heath', tour_arrival_date: '2027-04-11', departure_date: '2027-04-16',
  });
  R.addEnds(guestPlan, [{
    first_name: 'Heather', last_name: 'Kingsley Heath',
    prague_stays: [{ hotel: 'U Obecního dvora', check_in: '', check_out: '' }],
  }], extras, []);
  assert.equal(guestPlan.days[0].blocks[0].hotelName, 'U Obecního dvora');
  const shared = globalThis.Planner2.emptyPlanFromBooking({
    id: 20, group_name: 'Shared stay', tour_arrival_date: '2027-06-01', departure_date: '2027-06-06',
  });
  R.addEnds(shared, [{ first_name: 'Ann', last_name: 'Guest', prague_stays: null }], {
    samePrague: true,
    travel: { pickupPoint: '', pickupPlace: '', pickupTime: '' },
    extraStays: { pragueHotel: 'Hotel Josef' },
  }, []);
  assert.equal(shared.days[0].blocks[0].hotelName, 'Hotel Josef');
  assert.equal(shared.days[0].blocks[0].time, '08:00');
  assert.match(shared.days[shared.days.length - 1].blocks[0].title, /Hotel Josef/);
});

test('suggest fills quiet days and Prague ends keep other stops', () => {
  const plan = globalThis.Planner2.samplePlan();
  const before = plan.days[1].blocks.length;
  const quiet = { date: '2027-05-15', blocks: [] };
  plan.days.push(quiet);
  const places = [
    { id: 'kf01', name: 'Rutkovsky', type: 'factory' },
    { id: 'km01', name: 'Glass and jewellery museum in Jablonec', type: 'museum' },
  ];
  const busy = R.busyDays(plan);
  assert.ok(busy.indexOf(1) >= 0);
  const skipped = R.apply(plan, places, { replaceBusy: false });
  assert.ok(skipped.skipped >= 1);
  assert.equal(plan.days[1].blocks.length, before);
  const people = [
    { id: 'g1', name: 'Jennifer Lindsay', prague_stays: [{ hotel: 'U Obecního dvora 7, Prague 1', check_in: '', check_out: '' }] },
    { id: 'g2', name: 'Gail DeLuca', prague_stays: [{ hotel: 'U Obecního dvora 7, Prague 1', check_in: '', check_out: '' }] },
    { id: 'g3', name: 'Kay Enk', prague_stays: [{ hotel: 'Hotel Atlantic, Na Poříčí 9, Prague 1', check_in: '2027-05-09', check_out: '2027-05-10' }] },
    { id: 'g4', name: 'Maggie Cox', prague_stays: [{ hotel: 'Hotel Atlantic, Na Poříčí 9, Prague 1', check_in: '2027-05-09', check_out: '2027-05-10' }] },
  ];
  assert.equal(R.hasEnds(plan), true);
  const added = R.addEnds(plan, people);
  assert.equal(added.pickups, 2);
  assert.equal(added.dropoffs, 2);
  const pickup = plan.days[0].blocks.find(function (stop) { return stop.autoStop === 'prague-pickup'; });
  assert.equal(pickup.time, '08:00');
  assert.equal(pickup.praguePickups[0].time, '08:00');
  assert.match(pickup.praguePickups[0].hotel, /Obecního/);
  assert.equal(pickup.praguePickups[1].time, '08:05');
  assert.match(pickup.praguePickups[1].hotel, /Atlantic/);
  const last = plan.days[plan.days.length - 1];
  const drops = last.blocks.filter(function (stop) { return stop.autoStop === 'prague-dropoff'; });
  assert.equal(drops.length, 2);
  assert.equal(drops[0].time, '18:00');
  assert.match(drops[0].hotelName, /Atlantic/);
  assert.match(drops[0].title, /Kay Enk and Maggie Cox/);
  assert.equal(drops[1].time, '18:05');
  assert.match(drops[1].hotelName, /Obecního/);
  assert.match(drops[1].title, /Jennifer Lindsay and Gail DeLuca/);
  const links = globalThis.Planner2.dropoffRows(plan);
  assert.equal(links.hotels.length, 2);
  assert.match(links.hotels[0].label, /Kay Enk/);
  assert.match(links.hotels[1].label, /Jennifer Lindsay/);
});
