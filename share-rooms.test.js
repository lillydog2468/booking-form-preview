const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const vm = require('node:vm');

const root = __dirname;
const extrasSrc = fs.readFileSync(path.join(root, 'booking-extras.js'), 'utf8');
const formSrc = require('./test-page').pageSource(path.join(root, 'booking-form.html'), 'utf8');

function loadExtras() {
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(extrasSrc, context);
  return context.window.BookingExtras;
}

test('a shared room is stored on both guests and defaults to a double', () => {
  const BE = loadExtras();
  const merged = BE.merge({
    guests: [
      { firstName: 'Heather', lastName: 'Kingsley', personId: 'p1', sharesWith: 'p2' },
      { firstName: 'John', lastName: 'Kingsley', personId: 'p2', sharesWith: 'p1', roomType: 'double' },
      { firstName: 'Pat', lastName: 'Lee', personId: 'p3' },
    ],
  });
  assert.equal(merged.guests[0].sharesWith, 'p2');
  assert.equal(merged.guests[0].roomType, 'double');
  assert.equal(merged.guests[1].sharesWith, 'p1');
  assert.equal(merged.guests[1].roomType, 'double');
  assert.equal(merged.guests[2].sharesWith, '');
  assert.equal(merged.guests[2].roomType, '');
  const round = BE.merge(merged);
  assert.equal(round.guests[1].roomType, 'double');
  assert.equal(BE.hasContent(merged), true);
});

test('mutual pairs become doubles or twins and everyone else is a single', () => {
  const BE = loadExtras();
  const couple = BE.shareRoomPlan([
    { personId: 'a', sharesWith: 'b', roomType: 'double', named: true },
    { personId: 'b', sharesWith: 'a', roomType: 'double', named: true },
  ]);
  assert.equal(couple.singles, 0);
  assert.equal(couple.doubles, 1);
  assert.equal(couple.twins, 0);
  assert.equal(couple.pairs, 1);

  const twin = BE.shareRoomPlan([
    { personId: 'a', sharesWith: 'b', roomType: 'twin', named: true },
    { personId: 'b', sharesWith: 'a', roomType: 'twin', named: true },
    { personId: 'c', sharesWith: '', roomType: '', named: true },
  ]);
  assert.equal(twin.singles, 1);
  assert.equal(twin.doubles, 0);
  assert.equal(twin.twins, 1);
  assert.equal(twin.pairs, 1);

  const oneSided = BE.shareRoomPlan([
    { personId: 'a', sharesWith: 'b', roomType: 'double', named: true },
    { personId: 'b', sharesWith: '', roomType: '', named: true },
  ]);
  assert.equal(oneSided.singles, 2);
  assert.equal(oneSided.doubles, 0);
  assert.equal(oneSided.twins, 0);
  assert.equal(oneSided.pairs, 0);
  assert.equal(BE.shareRoomHint(couple), 'Pairings suggest 0 singles, 1 double, 0 twins.');
  assert.equal(BE.shareRoomHint(oneSided), '');
});

test('each guest row has a Share with control', () => {
  const row = formSrc.slice(formSrc.indexOf('function addMemberRow('), formSrc.indexOf('function applyOrganiserName('));
  assert.match(row, /class="member-share-btn"/);
  assert.match(row, /Share with/);
  assert.match(row, /class="member-share-tag"/);
  assert.match(row, /data-type="double"/);
  assert.match(row, /data-type="twin"/);
  assert.match(formSrc, /Room: shared with /);
  assert.match(formSrc, /id="t\$\{t\}_roomShareHint"/);
  assert.match(formSrc, /sharesWith: m\.sharesWith/);
});
