const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

require('./booking-format.js');
require('./hotel-directory.js');

const html = require('./test-page').pageSource(path.join(__dirname, 'hotels.html'), 'utf8');
const HD = globalThis.HotelDirectory;

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

function loadPlanHelpers() {
  const context = {};
  vm.createContext(context);
  vm.runInContext([
    extractFunction('normName'),
    extractFunction('isPlaceholderHotelName'),
    extractFunction('stayKey'),
    extractFunction('stayBookingId'),
    extractFunction('addStay'),
    extractFunction('bookingIdFromPlanKey'),
    extractFunction('planKeyIsBookingId'),
    extractFunction('loadedBookingHasId'),
    extractFunction('localPlanIsDeviceOnly'),
    extractFunction('removeDevicePlanFromStore'),
  ].join('\n'), context);
  return context;
}

test('deleting a device-only plan removes that key and leaves the rest of the store', () => {
  const context = loadPlanHelpers();
  const catalogue = [{ name: 'Park hotel' }];
  const people = [{ id: 'p1', name: 'Keith' }];
  const store = {
    catalogue,
    people,
    plans: {
      'angela-oz': { groupName: 'Test Angela Oz', tourHotelName: 'Hotel Paris' },
      '88': { groupName: 'Test Angela Oz' },
      'booking:9': { groupName: 'Old booking' },
      '42': { groupName: 'Sharon Harris' },
    },
  };
  const droppedName = context.removeDevicePlanFromStore(store, 'angela-oz');
  assert.equal(droppedName.plans['angela-oz'], undefined);
  assert.equal(droppedName.plans['88'].groupName, 'Test Angela Oz');
  assert.equal(droppedName.plans['booking:9'].groupName, 'Old booking');
  assert.equal(droppedName.plans['42'].groupName, 'Sharon Harris');
  assert.equal(droppedName.catalogue, catalogue);
  assert.equal(droppedName.people, people);
  const droppedNumber = context.removeDevicePlanFromStore(store, '88');
  assert.equal(droppedNumber.plans['88'], undefined);
  assert.equal(droppedNumber.plans['angela-oz'].groupName, 'Test Angela Oz');
  assert.equal(droppedNumber.plans['booking:9'].groupName, 'Old booking');
  assert.equal(droppedNumber.plans['42'].groupName, 'Sharon Harris');
  const droppedPrefixed = context.removeDevicePlanFromStore(store, 'booking:9');
  assert.equal(droppedPrefixed.plans['booking:9'], undefined);
  assert.equal(droppedPrefixed.plans['88'].groupName, 'Test Angela Oz');
  assert.equal(droppedPrefixed.plans['42'].groupName, 'Sharon Harris');
  assert.equal(context.planKeyIsBookingId('booking:9'), true);
  assert.equal(context.planKeyIsBookingId('88'), true);
  assert.equal(context.planKeyIsBookingId('angela-oz'), false);
});

test('a leftover numeric or booking:N key is device-only unless that booking was loaded', () => {
  const context = loadPlanHelpers();
  const bookings = [{ id: 42 }, { id: '9' }];
  assert.equal(context.localPlanIsDeviceOnly('angela-oz', bookings, true), true);
  assert.equal(context.localPlanIsDeviceOnly('88', bookings, true), true);
  assert.equal(context.localPlanIsDeviceOnly('booking:15', bookings, true), true);
  assert.equal(context.localPlanIsDeviceOnly('42', bookings, true), false);
  assert.equal(context.localPlanIsDeviceOnly('booking:9', bookings, true), false);
  assert.equal(context.localPlanIsDeviceOnly('88', [], false), false);
  assert.equal(context.bookingIdFromPlanKey('booking:9'), '9');
  assert.equal(context.bookingIdFromPlanKey('88'), '88');
  assert.equal(context.bookingIdFromPlanKey('angela-oz'), '');

  function stayFor(key) {
    const list = [];
    context.addStay(list, {
      bookingKey: key,
      bookingId: '',
      deviceOnly: true,
      groupName: 'Test Angela Oz',
      hotelName: 'Hotel Paris',
      role: 'tour',
    });
    return list[0];
  }
  ['88', 'booking:9', 'angela-oz'].forEach(key => {
    const stay = stayFor(key);
    assert.equal(stay.deviceOnly, true, key);
    assert.equal(stay.bookingId, '', key);
    assert.equal(stay.bookingKey, key);
  });
  const real = [];
  context.addStay(real, {
    bookingKey: '42',
    deviceOnly: false,
    groupName: 'Sharon Harris',
    hotelName: 'Park hotel',
    role: 'tour',
  });
  assert.equal(real[0].deviceOnly, false);
  assert.equal(real[0].bookingId, '42');
});

test('a device-only stay is labelled and has no booking link, on the list and under Hotels used', () => {
  assert.match(html, /Saved on this device only — no booking/);
  assert.match(html, /Delete this test plan/);
  assert.match(html, /class="btn btn-danger"/);
  assert.match(html, /window\.confirm\('Delete “' \+ name \+ '”\? This plan is saved on this device only\.'\)/);
  assert.match(html, /const deviceOnly = localPlanIsDeviceOnly\(key, bookings, live\)/);
  assert.match(html, /bookingId: deviceOnly \? '' : matchedBookingId/);
  assert.match(html, /if \(!id \|\| !localPlanIsDeviceOnly\(id, loadedBookings, bookingListLoaded\)\) return/);
  assert.equal(html.includes('if (!id || planKeyIsBookingId(id)) return'), false);
  const render = extractFunction('render');
  assert.match(render, /const deviceOnly = !!s\.deviceOnly;/);
  assert.doesNotMatch(render, /deviceOnly && !stayBookingId/);
  assert.match(render, /deviceOnly \? '' : `<a href="\$\{esc\(bookingHref\(s\)\)\}">Open booking<\/a>`/);

  const device = HD.renderDirectoryHtml(HD.buildDirectory({
    stays: [{
      key: 'angela|tour|hotel paris',
      hotelName: 'Hotel Paris',
      role: 'tour',
      groupName: 'Test Angela Oz',
      bookingKey: 'angela-oz',
      bookingId: '',
      deviceOnly: true,
      arrivalDate: '2027-06-01',
      departureDate: '2027-06-05',
    }],
  }), '');
  assert.match(device, /Saved on this device only — no booking/);
  assert.match(device, /data-delete-plan="angela-oz"/);
  assert.match(device, /Delete this test plan/);
  assert.match(device, /btn-danger/);
  assert.doesNotMatch(device, /Open booking/);

  const real = HD.renderDirectoryHtml(HD.buildDirectory({
    stays: [{
      key: '42|tour|park hotel',
      hotelName: 'Park hotel',
      role: 'tour',
      groupName: 'Sharon Harris',
      bookingKey: '42',
      bookingId: '42',
      deviceOnly: false,
      arrivalDate: '2026-10-01',
      departureDate: '2026-10-05',
    }],
  }), '');
  assert.match(real, /Open booking/);
  assert.doesNotMatch(real, /Delete this test plan/);
  assert.doesNotMatch(real, /Saved on this device only/);

  ['88', 'booking:9'].forEach(key => {
    const orphan = HD.renderDirectoryHtml(HD.buildDirectory({
      stays: [{
        key: key + '|tour|hotel paris',
        hotelName: 'Hotel Paris',
        role: 'tour',
        groupName: 'Test Angela Oz',
        bookingKey: key,
        bookingId: key === '88' ? '88' : '',
        deviceOnly: true,
        arrivalDate: '2027-06-01',
        departureDate: '2027-06-05',
      }],
    }), '');
    assert.match(orphan, /Saved on this device only — no booking/);
    assert.match(orphan, new RegExp('data-delete-plan="' + key + '"'));
    assert.match(orphan, /Delete this test plan/);
    assert.doesNotMatch(orphan, /Open booking/);
  });
});
