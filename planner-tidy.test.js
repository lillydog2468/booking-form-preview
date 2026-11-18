const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const form = fs.readFileSync(path.join(__dirname, 'booking-form.js'), 'utf8');
const plannerHtml = fs.readFileSync(path.join(__dirname, 'tour-planner.html'), 'utf8');
const planner = fs.readFileSync(path.join(__dirname, 'tour-planner.js'), 'utf8');

test('the layout keeps Start planning and drops the day-planner banner', () => {
  const fareStart = form.indexOf('function buildFormHTML(');
  const fare = form.slice(fareStart, form.indexOf('\n  function ', fareStart + 10));
  assert.equal(fare.includes('Day planner for this group'), false);
  assert.equal((fare.match(/Start planning/g) || []).length, 1);
});

test('planner nav is one section row and the view controls sit outside the sticky bar', () => {
  assert.match(plannerHtml, /id="plannerNavMount"/);
  assert.match(plannerHtml, /class="planner-options"/);
  const sticky = plannerHtml.slice(plannerHtml.indexOf('<header class="topbar">'), plannerHtml.indexOf('<div class="planner-options">'));
  assert.equal(sticky.includes('id="btnPhoneView"'), false);
  assert.equal(sticky.includes('id="btnTheme"'), false);
  assert.match(planner, /function mountPlannerNav\(/);
  assert.match(plannerHtml, /id="groupDates"/);
});

test('lending is a collapsed name and balance, with repayments still inside', () => {
  const guests = planner.slice(planner.indexOf('function renderGuestLending('), planner.indexOf('function renderLendingSection('));
  assert.match(guests, /class="lent-line"/);
  assert.match(guests, /<p class="lent-name">/);
  const nameBefore = guests.slice(guests.indexOf('<p class="lent-name">'), guests.indexOf('class="lent-line"'));
  assert.equal(nameBefore.includes('data-lent-entry'), false);
  assert.match(guests, /data-lent-owes/);
  assert.match(guests, /data-lent-entry/);
  assert.match(guests, />Enter</);
  assert.match(guests, /data-lent-repay/);
  assert.match(guests, />Paid back</);
  assert.match(guests, /data-lent-history/);
  assert.equal(guests.includes('Daily repayments'), false);
  assert.equal(guests.includes('data-add-repay'), false);
  assert.equal(guests.includes('data-repay-amount'), false);
  assert.equal(guests.includes('data-guest-email'), false);
  assert.equal(guests.includes('Lent (£)'), false);
  const line = guests.slice(guests.indexOf('class="lent-line"'), guests.indexOf('class="lent-history"'));
  assert.equal(line.includes('lent-when'), false);
  assert.equal(line.includes('type="date"'), false);
  assert.equal(line.includes('lent-remove'), false);
});

test('the rough plan can add hotel pick-ups and drop-offs without replacing stops', () => {
  assert.match(planner, /data-add-hotel-handover="pickup"/);
  assert.match(planner, /data-add-hotel-handover="dropoff"/);
  assert.match(planner, /seedMissingHotelHandovers\(\)/);
  assert.match(planner, /function moveStopToDay\(/);
  assert.match(planner, /data-navigate-scheme/);
});
