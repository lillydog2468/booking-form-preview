const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('./prague-exit.js');
require('./rough-week.js');
require('./planner2-model.js');

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
