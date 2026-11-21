const test = require('node:test');
const assert = require('node:assert/strict');

require('./place-plan.js');

const P = globalThis.PlacePlan;

function emptyWeek() {
  return {
    days: [0, 1, 2, 3, 4].map(function (index) {
      return { date: '2027-05-1' + index, blocks: index === 0 ? [{
        id: 'pick', type: 'handover', handoverKind: 'pickup', autoStop: 'prague-pickup', time: '08:00', title: 'Pick-up', durationMinutes: 25,
      }] : [] };
    }),
  };
}

const history = [
  { days: [
    { blocks: [] },
    { blocks: [
      { placeId: 'mat', time: '10:00', type: 'factory', title: 'Matubo' },
      { placeId: 'gb', time: '11:15', type: 'factory', title: 'GB Beads' },
      { placeId: 'lunch', time: '12:45', type: 'restaurant', title: 'Lunch' },
    ] },
  ] },
  { days: [
    { blocks: [] },
    { blocks: [
      { placeId: 'mat', time: '10:15', type: 'factory', title: 'Matubo' },
      { placeId: 'gb', time: '11:30', type: 'factory', title: 'GB Beads' },
      { placeId: 'lunch', time: '13:00', type: 'restaurant', title: 'Lunch' },
    ] },
  ] },
  { days: [
    { blocks: [{ placeId: 'antik', time: '15:00', type: 'shop', title: 'Antik' }] },
  ] },
];

const places = [
  { id: 'gb', name: 'GB Beads', type: 'factory' },
  { id: 'lunch', name: 'Lunch', type: 'restaurant' },
  { id: 'mat', name: 'Matubo', type: 'factory' },
  { id: 'antik', name: 'Antik', type: 'shop' },
  { id: 'tower', name: 'Tower', type: 'viewpoint' },
];

test('tapping a place selects it, and tapping again clears it', () => {
  var ids = P.toggle([], 'kf02');
  ids = P.toggle(ids, 'kf03');
  ids = P.toggle(ids, 'kf02');
  assert.deepEqual(ids, ['kf03']);
  assert.equal(P.selectionCount(ids), 1);
  assert.deepEqual(P.toggle(ids, 'kf03'), []);
});

test('history puts companions on the same day, in their usual order, with lunch at midday', () => {
  const learned = P.learn(history);
  assert.equal(learned.byId.mat.day, 1);
  assert.equal(learned.byId.gb.day, 1);
  assert.ok(learned.byId.mat.time >= 10 * 60 && learned.byId.mat.time <= 10 * 60 + 15);
  assert.ok(learned.byId.lunch.time >= 12 * 60 + 30 && learned.byId.lunch.time <= 13 * 60);
  assert.ok(learned.byId.gb.before.mat >= 1);
  const plan = emptyWeek();
  const result = P.place(plan, places, ['gb', 'lunch', 'mat', 'antik'], history);
  const byId = {};
  result.placed.forEach(function (row) { byId[row.id] = row; });
  assert.equal(result.unplaced.length, 0);
  assert.equal(byId.mat.dayIndex, 1);
  assert.equal(byId.gb.dayIndex, 1);
  assert.equal(byId.lunch.dayIndex, 1);
  assert.equal(byId.antik.dayIndex, 0);
  assert.ok(byId.mat.time < byId.gb.time);
  assert.ok(byId.gb.time < byId.lunch.time);
  assert.ok(byId.lunch.time >= '12:30' && byId.lunch.time <= '13:15');
  assert.equal(plan.days[0].blocks[0].time, '08:00');
  assert.equal(plan.days[0].blocks[0].autoStop, 'prague-pickup');
});

test('places stay inside 9:15 and 4pm, and they do not cover an existing stop', () => {
  const plan = { days: [{ blocks: [
    { id: 'pick', type: 'handover', autoStop: 'prague-pickup', time: '08:00', title: 'Pick-up', durationMinutes: 25 },
    { id: 'busy', placeId: 'old', time: '09:15', type: 'factory', title: 'Busy', durationMinutes: 60 },
  ] }] };
  const early = [{ id: 'early', name: 'Early factory', type: 'factory' }];
  const past = [{ days: [{ blocks: [{ placeId: 'early', time: '08:30', type: 'factory', title: 'Early factory', durationMinutes: 60 }] }] }];
  const result = P.place(plan, early, ['early'], past);
  assert.equal(result.placed.length, 1);
  assert.equal(result.placed[0].time, '10:15');
  const endHour = 10 * 60 + 15 + result.placed[0].duration;
  assert.ok(endHour <= P.DAY_END);
  assert.equal(plan.days[0].blocks[0].time, '08:00');
  assert.equal(plan.days[0].blocks[0].title, 'Pick-up');
  const packed = emptyWeek();
  packed.days.forEach(function (day) {
    day.blocks.push({ id: 'fill', time: '09:15', type: 'museum', title: 'All day', durationMinutes: 16 * 60 - (9 * 60 + 15) });
  });
  const overflow = P.place(packed, [{ id: 'extra', name: 'Extra', type: 'shop' }], ['extra'], []);
  assert.equal(overflow.placed.length, 0);
  assert.equal(overflow.unplaced[0].reason, 'No free time before 4pm');
  assert.match(P.summary(overflow), /Not placed: Extra/);
  const again = P.place(plan, early, ['early'], past);
  assert.equal(again.placed.length, 0);
  assert.equal(again.unplaced[0].reason, 'Already on this week');
  assert.equal(plan.days[0].blocks.filter(function (stop) { return stop.placeId === 'early'; }).length, 1);
});
