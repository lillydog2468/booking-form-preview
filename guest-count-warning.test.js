const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = __dirname;
const extrasSrc = fs.readFileSync(path.join(root, 'booking-extras.js'), 'utf8');
const formSrc = fs.readFileSync(path.join(root, 'booking-form.html'), 'utf8');

function loadExtras() {
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(extrasSrc, context);
  return context.window.BookingExtras;
}

test('guest payment choices survive a merge', () => {
  const BE = loadExtras();
  const merged = BE.merge({
    payments: { group: true, payer: '1' },
    guests: [
      { firstName: 'Tina', lastName: 'Stone', paidBy: 'self' },
      { firstName: 'Ann', lastName: 'Smith', email: 'a@b.c', paidBy: '0' },
    ],
  });
  assert.equal(merged.payments.group, true);
  assert.equal(merged.payments.payer, '1');
  assert.equal(merged.guests[0].paidBy, '');
  assert.equal(merged.guests[1].paidBy, '0');
  assert.equal(merged.guests[0].personId, '');
  assert.equal(BE.hasContent({ payments: { group: true } }), true);
  assert.equal(BE.hasContent(BE.empty()), false);
  const round = BE.merge(BE.merge({ guests: [{ firstName: 'Ida', lastName: 'Brown', personId: 'p1', paidBy: '2' }] }));
  assert.equal(round.guests[0].personId, 'p1');
  assert.equal(round.guests[0].paidBy, '2');
});

test('guest names that do not match the headcount produce a warning', () => {
  const BE = loadExtras();
  assert.equal(BE.guestCountWarning('', 0), '');
  assert.equal(BE.guestCountWarning('3', 3), '');
  assert.equal(BE.guestCountWarning('1', 1), '');
  assert.match(BE.guestCountWarning('4', 2), /Headcount problem/);
  assert.match(BE.guestCountWarning('4', 2), /headcount is 4/);
  assert.match(BE.guestCountWarning('4', 2), /2 guest names are listed/);
  assert.match(BE.guestCountWarning('2', 1), /1 guest name is listed/);
  assert.match(BE.guestCountWarning('3', 0), /no guest names are listed/);
  assert.match(BE.guestCountWarning('', 2), /headcount is blank/);
  assert.match(BE.guestCountWarning('2', 4), /4 guest names are listed/);
});

test('the booking form shows the warning on the headcount and does not rewrite it', () => {
  const standard = formSrc.indexOf('function buildFormHTML');
  const layout = formSrc.indexOf('function buildLayoutFormHTML');
  const folds = formSrc.indexOf('function bookingCaptureFolds');
  assert.ok(standard > 0 && layout > standard && folds > 0 && folds < standard);

  const standardHtml = formSrc.slice(standard, layout);
  const layoutHtml = formSrc.slice(layout, formSrc.indexOf('function ', layout + 10));
  const foldsHtml = formSrc.slice(folds, standard);

  for (const html of [standardHtml, layoutHtml]) {
    const head = html.indexOf('id="t${t}_no_people"');
    const warn = html.indexOf('id="t${t}_guestWarn" class="headcount-warn"');
    assert.ok(head > 0, 'headcount field missing');
    assert.ok(warn > head, 'warning should follow the headcount field');
  }

  assert.equal(foldsHtml.includes('guestWarn'), false, 'guest warning stays off the rooms fold');
  assert.match(formSrc, /\.headcount-warn \{[\s\S]*var\(--danger\)/);

  const updater = formSrc.slice(formSrc.indexOf('function updateRoomWarning'), formSrc.indexOf('function updateDepositHint'));
  assert.match(updater, /headInput\.classList\.toggle\('headcount-mismatch'/);
  assert.equal(updater.includes('headInput.value'), false);
  assert.equal(updater.includes('no_people\'] ='), false);
  assert.equal(updater.includes('.value ='), false);
});
