const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

require('./place-categories.js');
require('./handover-stops.js');
require('./phone-week.js');

const plannerHtml = fs.readFileSync(path.join(__dirname, 'tour-planner.html'), 'utf8');
const planner = fs.readFileSync(path.join(__dirname, 'tour-planner.js'), 'utf8');
const plannerCss = fs.readFileSync(path.join(__dirname, 'tour-planner.css'), 'utf8');

const note = WeekNote.build({
  groupName: 'Jennifer Lindsay',
  arrivalDate: '2027-05-10',
  departureDate: '2027-05-14',
  guests: [
    { id: 'jennifer', name: 'Jennifer Lindsay' },
    { id: 'gail', name: 'Gail' },
    { id: 'kay', name: 'Kay' },
  ],
  days: [
    {
      date: '2027-05-10',
      blocks: [
        { id: 'hot', type: 'handover', handoverKind: 'pickup', placeKind: 'hotel', time: '08:00', title: 'Pick-up · U Obecního dvora 7', hotelName: 'U Obecního dvora 7', address: 'U Obecního dvora 7, Prague 1', guestIds: ['jennifer', 'gail'] },
        { id: 'air', type: 'handover', handoverKind: 'pickup', placeKind: 'airport', time: '10:30', title: 'Pick-up · Airport', guestIds: ['kay'], address: 'Václav Havel Airport Prague' },
      ],
    },
    { date: '2027-05-14', blocks: [] },
  ],
}, { today: '2027-05-11' });

test('the note title is the year, group and date span', () => {
  assert.equal(note.year, '2027');
  assert.equal(note.group, 'Jennifer Lindsay');
  assert.equal(note.title, '2027 – Jennifer Lindsay – 10 May–14 May');
  assert.equal(note.folder, 'Bananas4Beading/2027/Jennifer Lindsay');
  assert.equal(note.days.length, 5);
  assert.equal(note.days[1].today, true);
  assert.equal(note.days[1].open, true);
  assert.equal(note.days[0].open, false);
});

test('a stop keeps its time, guests and Apple Maps link', () => {
  const pickup = note.days[0].stops[0];
  assert.equal(pickup.time, '08:00');
  assert.deepEqual(pickup.guests, ['Jennifer Lindsay', 'Gail']);
  assert.equal(pickup.cue.emoji, '🚐');
  assert.equal(pickup.map, 'https://maps.apple.com/?daddr=' + encodeURIComponent('U Obecního dvora 7, Prague 1') + '&dirflg=d');
  assert.equal(note.days[0].stops[1].cue.label, 'Airport');
  assert.match(note.text, /Monday 10 May/);
  assert.match(note.text, /Wednesday 12 May/);
  assert.match(note.text, /Nothing on this day/);
  assert.match(note.html, /<h1>2027 – Jennifer Lindsay – 10 May–14 May<\/h1>/);
  assert.match(note.html, /href="https:\/\/maps\.apple\.com\/\?daddr=/);
});

test('a pasted map pin navigates to its coordinates and shows a short label', () => {
  const pin = 'https://maps.apple.com/?ll=50.70123,15.20123&q=Factory';
  const built = WeekNote.build({
    groupName: 'Pin',
    arrivalDate: '2027-05-10',
    departureDate: '2027-05-10',
    days: [{ date: '2027-05-10', blocks: [{ time: '09:00', title: pin, address: pin, type: 'factory' }] }],
  });
  assert.equal(built.days[0].stops[0].place, 'Pinned location');
  assert.equal(built.days[0].stops[0].map, 'https://maps.apple.com/?daddr=50.70123,15.20123&dirflg=d');
  assert.equal(built.days[0].stops[0].scheme, 'maps://?daddr=50.70123,15.20123&dirflg=d');
  const share = WeekNote.build({
    groupName: 'Share',
    arrivalDate: '2027-05-10',
    departureDate: '2027-05-10',
    days: [{ date: '2027-05-10', blocks: [{ time: '09:00', address: 'https://maps.apple/p/abcd1234', type: 'other' }] }],
  });
  assert.equal(share.days[0].stops[0].place, 'Pinned location');
  assert.equal(share.days[0].stops[0].map, 'https://maps.apple/p/abcd1234');
});

test('a linked place pin is where Navigate goes', () => {
  require('./place-pin.js');
  const built = WeekNote.build({
    groupName: 'Pin',
    arrivalDate: '2027-05-10',
    departureDate: '2027-05-10',
    days: [{
      date: '2027-05-10',
      blocks: [{ time: '09:00', title: 'Rudkovsky', address: 'Koperovy', placeId: 'kf01', type: 'factory' }],
    }],
  }, {
    places: [{ id: 'kf01', name: 'Rudkovsky', address: 'Koperovy', pinLat: 50.70123, pinLng: 15.20123 }],
  });
  assert.equal(built.days[0].stops[0].map, 'https://maps.apple.com/?daddr=50.70123,15.20123&dirflg=d');
  assert.equal(built.days[0].stops[0].scheme, 'maps://?daddr=50.70123,15.20123&dirflg=d');
  const ownPin = WeekNote.build({
    groupName: 'Pin',
    arrivalDate: '2027-05-10',
    departureDate: '2027-05-10',
    days: [{
      date: '2027-05-10',
      blocks: [{ time: '09:00', title: 'Rudkovsky', address: 'Koperovy', placeId: 'kf01', pinLat: 50.5, pinLng: 15.1, type: 'factory' }],
    }],
  }, {
    places: [{ id: 'kf01', address: 'Koperovy', pinLat: 50.70123, pinLng: 15.20123 }],
  });
  assert.equal(ownPin.days[0].stops[0].map, 'https://maps.apple.com/?daddr=50.5,15.1&dirflg=d');
});

test('the phone week offers both, all, and each hotel from the shared builder', () => {
  const both = 'https://www.google.com/maps/dir/?api=1&destination=Hotel%20Atlantic&waypoints=U%20Obecn%C3%ADho&travelmode=driving';
  const all = 'https://www.google.com/maps/dir/?api=1&destination=Hotel%20Josef&waypoints=U%20Obecn%C3%ADho%7CHotel%20Atlantic&travelmode=driving';
  const one = 'https://www.google.com/maps/dir/?api=1&destination=U%20Obecn%C3%ADho&travelmode=driving';
  const two = 'https://www.google.com/maps/dir/?api=1&destination=Hotel%20Atlantic&travelmode=driving';
  global.PragueRoute = {
    phoneChoices: function (day, kind) {
      const stop = (day.blocks || []).find(block => block && block.praguePickups && block.praguePickups.length > 1);
      if (kind !== 'pickup' || !stop) return null;
      return {
        both: both,
        all: all,
        each: [
          { label: 'U Obecního dvora 7, Praha', href: one },
          { label: 'Hotel Atlantic, Na Poříčí 9, Praha', href: two },
        ],
      };
    },
  };
  const html = WeekNote.render({
    groupName: 'Booking 310',
    arrivalDate: '2027-05-10',
    departureDate: '2027-05-14',
    days: [{
      date: '2027-05-10',
      blocks: [{
        id: 'combo',
        type: 'handover',
        handoverKind: 'pickup',
        time: '08:00',
        title: 'Pick-up',
        praguePickups: [
          { time: '08:00', hotel: 'U Obecního dvora 7, Praha' },
          { time: '08:05', hotel: 'Hotel Atlantic, Na Poříčí 9, Praha' },
        ],
      }],
    }],
  }, { today: '2027-05-10' });
  delete global.PragueRoute;
  assert.match(html, />Navigate to both</);
  assert.match(html, />Navigate to all hotels</);
  assert.match(html, /Navigate to each hotel separately/);
  assert.match(html, />U Obecního dvora 7, Praha</);
  assert.match(html, />Hotel Atlantic, Na Poříčí 9, Praha</);
  assert.equal(html.includes('Open in Maps (all hotels)'), false);
  assert.match(html, /data-phone-nav="both"/);
  assert.match(html, /data-phone-nav="one"/);
  assert.match(planner, /phoneChoices:\s*praguePhoneChoices/);
  assert.match(planner, /directionsUrl:\s*googleMapsDirectionsUrl/);
  assert.match(planner, /Open in Maps \(all hotels\)/);
  const rough = planner.slice(planner.indexOf('function renderRoughDayLane('), planner.indexOf('function renderRoughPlanPanel('));
  assert.match(rough, /pragueChoicesNavHtml\(day\)/);
  assert.equal(rough.includes('Open in Maps (all hotels)'), false);
  assert.equal(rough.includes('routeLinkBeforeStop'), false);
  assert.equal(rough.includes('pragueCardAllHotelsHtml'), false);
});

test('the phone page is read-only and marks today', () => {
  const html = WeekNote.render({
    groupName: 'Jennifer Lindsay',
    arrivalDate: '2027-05-10',
    departureDate: '2027-05-10',
    days: [{ date: '2027-05-10', blocks: [{ time: '09:00', title: 'Museum', type: 'museum' }] }],
  }, { today: '2027-05-10' });
  assert.match(html, /id="btnSendWeekToNotes"/);
  assert.match(html, /class="phone-week-day is-today" open/);
  assert.match(html, /Museum/);
  assert.match(html, /stop-tone-museum/);
  assert.match(html, /type-museum/);
  assert.equal(html.includes('data-stop-title'), false);
  assert.equal(html.includes('Add hotel'), false);
});

test('the phone week group title returns to the same booking', () => {
  const sticky = plannerHtml.slice(plannerHtml.indexOf('<header class="topbar">'), plannerHtml.indexOf('<div class="planner-options">'));
  assert.equal(sticky.includes('btnPhoneWeekBack'), false);
  assert.equal(sticky.includes('Back to planner'), false);
  assert.match(sticky, /id="groupHeading"/);
  const leave = planner.slice(planner.indexOf('function leavePhoneWeek('), planner.indexOf('function markPhoneHeading('));
  assert.match(leave, /url\.searchParams\.delete\('view'\)/);
  assert.match(leave, /url\.searchParams\.set\('booking', String\(state\.bookingKey\)\)/);
  assert.match(leave, /history\.replaceState\(\{\}, '', url\)/);
  assert.match(planner, /getElementById\('groupHeading'\)\?\.addEventListener\('click'/);
  assert.match(planner, /if \(state\.phoneWeek\) leavePhoneWeek\(\)/);
  assert.match(plannerCss, /body\.phone-week \.group-heading\.is-phone-back::before \{[\s\S]*content: '‹'/);
});
