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

const obecni = 'U Obecního dvora 7, Prague 1 – Staré Město, 110 00';
const booking310 = [
  { id: 'jennifer', name: 'Jennifer', prague_stays: [{ hotel: obecni }] },
  { id: 'gail', name: 'Gail', prague_stays: [{ hotel: obecni }] },
  { id: 'kay', name: 'Kay', prague_stays: [], arrival_flight: 'KL1353' },
  { id: 'ned', name: 'Ned', prague_stays: [] },
];
const tourDates = { arrival: '2027-05-10', departure: '2027-05-14' };

test('booking 310 picks Jennifer and Gail up from one hotel and leaves Kay out', () => {
  const pickup = H.hotelHandoverStops(booking310, Object.assign({ kind: 'pickup' }, tourDates));
  const dropoff = H.hotelHandoverStops(booking310, Object.assign({ kind: 'dropoff' }, tourDates));
  assert.equal(pickup.length, 1);
  assert.equal(dropoff.length, 1);
  assert.equal(pickup[0].hotelName, obecni);
  assert.equal(pickup[0].address, obecni);
  assert.deepEqual(pickup[0].guestIds, ['jennifer', 'gail']);
  assert.deepEqual(dropoff[0].guestNames, ['Jennifer', 'Gail']);
  assert.equal(pickup[0].guestIds.includes('kay'), false);
  assert.equal(H.googleMapsSearchUrl(obecni), 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(obecni));
  assert.equal(H.appleMapsSearchUrl(obecni).indexOf('https://maps.apple.com/?q='), 0);
});

test('pick-up uses the night before arrival and drop-off uses the departure night', () => {
  const guest = [{
    id: 'ada',
    name: 'Ada',
    prague_stays: [
      { hotel: 'Early hotel', check_in: '2027-05-01', check_out: '2027-05-08' },
      { hotel: 'Arrival hotel', check_in: '2027-05-09', check_out: '2027-05-12' },
      { hotel: 'Last hotel', check_in: '2027-05-14', check_out: '2027-05-16' },
    ],
  }];
  const pickup = H.hotelHandoverStops(guest, Object.assign({ kind: 'pickup' }, tourDates));
  const dropoff = H.hotelHandoverStops(guest, Object.assign({ kind: 'dropoff' }, tourDates));
  assert.equal(H.shiftIso('2027-05-10', -1), '2027-05-09');
  assert.equal(pickup[0].hotelName, 'Arrival hotel');
  assert.equal(dropoff[0].hotelName, 'Last hotel');
});

test('one shared Prague hotel is a single stop for the whole group', () => {
  const shared = [{ hotel: 'Hotel Axa', check_in: '2027-05-09', check_out: '2027-05-15' }];
  const people = [
    { id: 'a', name: 'Ann', prague_stays: [] },
    { id: 'b', name: 'Bea', prague_stays: [] },
    { id: 'c', name: 'Cara', prague_stays: shared },
  ];
  const stops = H.hotelHandoverStops(people, Object.assign({ kind: 'pickup', samePrague: true, sharedStays: shared }, tourDates));
  assert.equal(stops.length, 1);
  assert.deepEqual(stops[0].guestIds, ['a', 'b', 'c']);
  assert.equal(stops[0].hotelName, 'Hotel Axa');
});

test('adding hotel stops leaves an edited stop and an airport stop alone', () => {
  const proposals = H.hotelHandoverStops(booking310, Object.assign({ kind: 'pickup' }, tourDates));
  const airport = { type: 'handover', handoverKind: 'pickup', placeKind: 'airport', hotelName: '', guestIds: ['kay'], time: '10:30', title: 'Pick-up · Airport' };
  const edited = { type: 'handover', handoverKind: 'pickup', placeKind: 'hotel', hotelName: obecni, guestIds: ['jennifer'], time: '07:40', notes: 'Keith edited this' };
  const added = H.hotelStopsToAdd([airport], proposals);
  assert.equal(added.length, 1);
  assert.equal(added[0].hotelName, obecni);
  const again = H.hotelStopsToAdd([airport, edited], proposals);
  assert.equal(again.length, 0);
  assert.equal(edited.time, '07:40');
  assert.equal(edited.notes, 'Keith edited this');
  assert.deepEqual(edited.guestIds, ['jennifer']);
  assert.equal(airport.time, '10:30');
});

test('phone navigation uses Apple directions and a moved stop keeps its time and people', () => {
  const urls = H.appleDirectionsUrl(obecni);
  assert.equal(urls.scheme, 'maps://?daddr=' + encodeURIComponent(obecni) + '&dirflg=d');
  assert.equal(urls.https, 'https://maps.apple.com/?daddr=' + encodeURIComponent(obecni) + '&dirflg=d');
  const moved = H.relocateStop([
    { date: '2027-05-10', blocks: [{ id: 'hotel', time: '08:15', guestIds: ['jennifer', 'gail'], title: 'Pick-up' }] },
    { date: '2027-05-11', blocks: [{ id: 'shop', time: '11:00', guestIds: [] }] },
  ], 'hotel', 1, 'shop');
  assert.equal(moved[0].blocks.length, 0);
  assert.equal(moved[1].blocks[0].id, 'hotel');
  assert.equal(moved[1].blocks[0].time, '08:15');
  assert.deepEqual(moved[1].blocks[0].guestIds, ['jennifer', 'gail']);
  assert.equal(moved[1].blocks[1].id, 'shop');
});

test('navigate uses exact coordinates from a pin, a typed pair, or the pasted link itself', () => {
  const point = 'maps://?daddr=50.70123,15.20123&dirflg=d';
  const https = 'https://maps.apple.com/?daddr=50.70123,15.20123&dirflg=d';
  const applePin = 'https://maps.apple.com/?ll=50.70123,15.20123&q=Glass%20factory';
  const fromLl = H.appleDirectionsUrl(applePin);
  assert.equal(fromLl.scheme, point);
  assert.equal(fromLl.https, https);
  assert.equal(H.appleDirectionsUrl('https://maps.apple.com/place?coordinate=50.70123,15.20123').https, https);
  assert.equal(H.appleDirectionsUrl('https://maps.apple.com/?sll=50.70123,15.20123').scheme, point);
  assert.equal(H.appleDirectionsUrl('https://maps.apple.com/?q=50.70123,15.20123').https, https);
  assert.equal(H.appleDirectionsUrl('https://maps.apple.com/?center=50.70123%2C15.20123').https, https);

  const shortLink = 'https://maps.apple/p/abcd1234';
  const opened = H.resolveMapTarget(shortLink);
  assert.equal(opened.mode, 'open');
  assert.equal(opened.https, shortLink);
  assert.equal(opened.apple, shortLink);
  assert.equal(opened.google, shortLink);
  assert.equal(opened.label, 'Pinned location');

  const googlePin = 'https://www.google.com/maps/place/Factory/@50.70123,15.20123,17z';
  assert.equal(H.appleDirectionsUrl(googlePin).https, https);
  assert.equal(H.googleMapsSearchUrl(googlePin), 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent('50.70123,15.20123'));
  const googleQuery = 'https://www.google.com/maps?q=50.70123,15.20123';
  assert.equal(H.appleDirectionsUrl(googleQuery).scheme, point);
  const googleShare = 'https://maps.app.goo.gl/abcDEF';
  assert.equal(H.resolveMapTarget(googleShare).https, googleShare);
  assert.equal(H.appleMapsSearchUrl(googleShare), googleShare);

  assert.equal(H.appleDirectionsUrl('50.7 , 15.2').https, 'https://maps.apple.com/?daddr=50.7,15.2&dirflg=d');
  assert.equal(H.appleDirectionsUrl('50.70123,15.20123').scheme, point);
  assert.equal(H.appleDirectionsUrl('50.7 N, 15.2 E').https, 'https://maps.apple.com/?daddr=50.7,15.2&dirflg=d');
  assert.equal(H.appleDirectionsUrl('50.7 S, 15.2 W').https, 'https://maps.apple.com/?daddr=-50.7,-15.2&dirflg=d');

  assert.equal(H.appleDirectionsUrl(obecni).https, 'https://maps.apple.com/?daddr=' + encodeURIComponent(obecni) + '&dirflg=d');
  assert.equal(H.googleMapsSearchUrl(obecni), 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(obecni));
  assert.equal(H.mapFieldLabel(applePin), 'Pinned location');
  assert.equal(H.mapFieldLabel(shortLink), 'Pinned location');
  assert.equal(H.mapFieldLabel(obecni), obecni);
  assert.equal(H.mapFieldLabel('50.7 , 15.2'), '50.7 , 15.2');
});
