const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');

const GUEST_COLOURS = ['#f3eefb', '#fde8ef', '#e7f3fc', '#e8f4ec', '#f8f1e3', '#f6e8f4'];
const HOTEL_COLOURS = ['#6cd0bc', '#f0a878', '#c598eb', '#6eb2ed', '#f090c0', '#edcf6e', '#e98078', '#4ec6e6'];
const CALENDAR_GREY = ['#e5e7eb', '#eef0f3', '#f3f4f6', '#d1d5db'];

test('each guest position has a soft colour, and the colour repeats after six', () => {
  assert.match(html, /row\.dataset\.guestTone = String\(i % 6\)/);
  assert.match(html, /data-guest-tone="\$\{escapeAttr\(guest\.row\.dataset\.guestTone/);
  GUEST_COLOURS.forEach((colour, i) => {
    assert.match(html, new RegExp('data-guest-tone="' + i + '".*' + colour));
  });
  assert.equal(new Set(GUEST_COLOURS).size, GUEST_COLOURS.length);
  HOTEL_COLOURS.concat(CALENDAR_GREY).forEach(colour => {
    assert.equal(GUEST_COLOURS.includes(colour), false, colour);
  });
});

test('the guest row, payment row and hotel chip share the tint, with dark text', () => {
  assert.match(html, /className = 'member-row guest-tone'/);
  assert.match(html, /\.member-row\[data-guest-tone\][\s\S]*background: var\(--guest-tint\)/);
  assert.match(html, /\.member-row\[data-guest-tone\][\s\S]*border-left: 4px solid var\(--guest-edge\)/);
  assert.match(html, /\.hotel-who-guest\[data-guest-tone\][\s\S]*background: var\(--guest-tint\)/);
  assert.match(html, /\.member-row\[data-guest-tone\] \{[\s\S]*color: #1a1d26/);
  assert.match(html, /\.hotel-who-guest \{[\s\S]*color: #1a1d26/);
  const phoneAt = html.indexOf('.hotel-who-guest { min-height: 44px; }');
  assert.ok(phoneAt > html.lastIndexOf('@media (max-width: 600px)'));
  const phone = html.slice(html.lastIndexOf('@media (max-width: 600px)'), phoneAt + 80);
  assert.match(phone, /\.member-row\[data-guest-tone\]/);
  assert.match(phone, /\.hotel-who-guest \{ min-height: 44px/);
});
