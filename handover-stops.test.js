const test = require('node:test');
const assert = require('node:assert/strict');

require('./handover-stops.js');
const H = globalThis.HandoverStops;

const guests = [
  { id: 'g1', name: 'Tina' },
  { id: 'g2', name: 'Eileen' },
  { id: 'g3', name: '' },
  { id: 'g4', name: 'Guest' },
  { id: 'g5', name: 'Molly' },
  { id: 'g6', name: 'Paulet' },
  { id: 'g7', name: 'Unnamed guest' },
];

test('only named guests on the tour are choices, in tour order', () => {
  const names = H.namedGuests(guests).map(g => g.name);
  assert.deepEqual(names, ['Tina', 'Eileen', 'Molly', 'Paulet']);
});

test('more than one person can be on the same pick-up, and unknown ids are omitted', () => {
  const names = H.peopleNames(['g6', 'missing', 'g1', 'g4'], guests);
  assert.deepEqual(names, ['Tina', 'Paulet']);
});

test('hotels booked for this group come before other booking hotels', () => {
  const rows = H.orderHotels(
    ['Park hotel', 'Hotel Axa', 'Still to be decided', ''],
    ['Hilton Prague', 'Park hotel', 'Day trip', 'Na Basta']
  );
  assert.deepEqual(rows.map(r => r.group + ':' + r.name), [
    'this:Park hotel',
    'this:Hotel Axa',
    'other:Hilton Prague',
    'other:Na Basta',
  ]);
});

test('a hotel that is not on a booking is not added to the list', () => {
  const rows = H.orderHotels(['Park hotel'], ['Hilton Prague']);
  assert.equal(rows.some(r => r.name === 'Somewhere I typed'), false);
  assert.equal(rows.length, 2);
});

test('one flight arrival is the starting pick-up time, including 9:15 pm', () => {
  const arrivals = H.arrivalTimes([
    { flight_number: 'BA123', arrival_time: '21:15:00' },
  ]);
  assert.equal(arrivals.length, 1);
  assert.equal(arrivals[0].time, '21:15');
  assert.equal(H.clockTalk(arrivals[0].time), '9:15 pm');
  assert.equal(H.airportStartTime(arrivals), '21:15');
});

test('several arrivals are not collapsed into a made-up time', () => {
  const arrivals = H.arrivalTimes([
    { flight_number: 'BA123', arrival_time: '21:15:00' },
    { flight_number: 'EZY456', arrival_time: '14:05:00' },
  ]);
  assert.deepEqual(arrivals.map(a => a.time), ['21:15', '14:05']);
  assert.equal(H.airportStartTime(arrivals), '');
});

test('no arrival time on the booking stays blank', () => {
  assert.deepEqual(H.arrivalTimes([], []), []);
  assert.equal(H.airportStartTime([]), '');
  assert.equal(H.nudgeFrom('', '', -15), '');
});

test('the plan shows a pick-up moved earlier or later, not locked to the flight minute', () => {
  const start = H.airportStartTime(H.arrivalTimes([{ arrival_time: '21:15:00' }]));
  assert.equal(start, '21:15');
  const earlier = H.nudgeFrom(start, start, -15);
  assert.equal(earlier, '21:00');
  const later = H.nudgeFrom(earlier, start, 15);
  assert.equal(later, '21:15');
  const earlierAgain = H.nudgeFrom(earlier, start, -15);
  assert.equal(earlierAgain, '20:45');
  assert.notEqual(earlierAgain, start);
});

test('a stored plan time is kept when it already differs from the flight', () => {
  assert.equal(H.normaliseClock('21:00'), '21:00');
  assert.equal(H.nudgeFrom('21:00', '21:15', 0), '21:00');
});

test('summaries use the hotel, airport, or note and the ticked people', () => {
  assert.equal(H.summary({
    handoverKind: 'pickup',
    placeKind: 'hotel',
    hotelName: 'Park hotel',
    guestIds: ['g1', 'g2'],
  }, guests), 'Pick-up · Park hotel · Tina, Eileen');
  assert.equal(H.summary({
    handoverKind: 'pickup',
    placeKind: 'airport',
    guestIds: ['g5'],
  }, guests), 'Pick-up · Airport, Terminal 1 · Molly');
  assert.equal(H.terminalNumber({ placeKind: 'airport' }), '1');
  assert.equal(H.terminalNumber({ placeKind: 'airport', terminal: '' }), '1');
  assert.equal(H.terminalNumber({ placeKind: 'airport', terminal: '2' }), '2');
  assert.equal(H.terminalNumber({ placeKind: 'hotel', terminal: '2' }), '');
  assert.equal(H.summary({
    handoverKind: 'dropoff',
    placeKind: 'airport',
    terminal: '2',
  }, guests), 'Drop-off · Airport, Terminal 2');
  assert.equal(H.summary({
    handoverKind: 'dropoff',
    placeKind: 'note',
    placeNote: 'Coach stop',
    guestIds: ['g6', 'g1'],
  }, guests), 'Drop-off · Coach stop · Tina, Paulet');
  assert.equal(H.summary({
    handoverKind: 'pickup',
    placeKind: 'note',
    placeNote: '',
    guestIds: [],
  }, guests), 'Pick-up · Place not set');
  assert.equal(H.summary({
    handoverKind: 'dropoff',
    placeKind: 'hotel',
    hotelName: '',
    guestIds: ['nope'],
  }, guests), 'Drop-off · Hotel not set');
});
