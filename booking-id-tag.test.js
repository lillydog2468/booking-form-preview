const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');

function sliceFn(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  const next = html.indexOf('\n  function ', start + 1);
  return html.slice(start, next > start ? next : start + 900);
}

test('saved bookings show a muted #id beside the title and in the list', () => {
  const standard = html.indexOf('function buildFormHTML(');
  const layout = html.indexOf('function buildLayoutFormHTML(');
  assert.ok(standard >= 0 && layout > standard);
  const formHead = html.slice(standard, layout);
  assert.match(formHead, /id="t\$\{t\}_bookingIdTag" hidden/);
  assert.match(html.slice(layout, html.indexOf('function clampYear(')), /return buildFormHTML\(tabId\)/);

  const label = sliceFn('bookingIdLabel');
  assert.match(label, /return '#' \+ Math\.trunc\(n\)/);
  assert.match(label, /n <= 0\) return ''/);

  const sync = sliceFn('syncBookingIdTag');
  assert.match(sync, /tag\.hidden = !label/);
  assert.match(sliceFn('syncTabHeader'), /syncBookingIdTag\(tabId\)/);
  assert.match(sliceFn('populateTab'), /syncBookingIdTag\(tabId\)/);
  assert.match(sliceFn('resetTab'), /syncBookingIdTag\(tabId\)/);

  const list = sliceFn('renderRecords');
  assert.match(list, /bookingIdLabel\(r\.id\)/);
  assert.match(list, /class="booking-id-tag"/);
  assert.match(html, /\.booking-id-tag \{[^}]*color: var\(--text-secondary\)/);
});
