const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
    { id: 'g1', name: 'Jennifer Lindsay', prague_stays: [{ hotel: 'U Obecního dvora 7', check_in: '', check_out: '' }] },
    { id: 'g2', name: 'Kay Enk', departure_date: plan.departureDate, prague_stays: [{ hotel: 'Hotel Atlantic', check_in: '2027-05-09', check_out: '2027-05-10' }] },
  ];
  assert.equal(R.hasEnds(plan), true);
  const added = R.addEnds(plan, people);
  assert.ok(added.pickups >= 1);
  assert.ok(added.dropoffs >= 1);
  const pickup = plan.days[0].blocks.find(function (stop) { return stop.autoStop === 'prague-pickup'; });
  assert.equal(pickup.time, '08:00');
  assert.equal(pickup.praguePickups[0].time, '08:00');
  const last = plan.days[plan.days.length - 1];
  const drop = last.blocks.find(function (stop) { return stop.autoStop === 'prague-dropoff' || stop.autoStop === 'airport-dropoff'; });
  assert.equal(drop.time, '18:00');
  assert.ok(last.blocks.some(function (stop) { return stop.placeId === 'kf01' || stop.autoStop; }));
});
