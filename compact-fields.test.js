const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');

test('short fields are sized to their content and long notes stay wide', () => {
  assert.match(html, /\.grid,\s*\.grid-2,\s*\.grid-3,\s*\.grid-4,\s*\.grid-5 \{\s*display: flex;\s*flex-wrap: wrap;/);
  assert.match(html, /\.field input\[type="number"\][\s\S]*?width: calc\(8ch \+ 1\.5em\)/);
  assert.match(html, /\.member-row > input\.member-first[\s\S]*?width: calc\(12ch \+ 1\.4em\)/);
  assert.match(html, /\.date-field-row input\.date-dmy \{\s*width: calc\(10ch \+ 1\.2em\)/);
  assert.match(html, /\.field textarea \{ resize: vertical; min-height: 64px; width: 100%; \}/);
  assert.match(html, /\.field:has\(textarea\)/);
  const phone = html.slice(html.lastIndexOf('@media (max-width: 600px)'), html.indexOf('@media (max-width: 380px)'));
  assert.match(phone, /display: flex;\s*flex-wrap: wrap;/);
  assert.match(phone, /min-height: 44px/);
  assert.match(phone, /\.member-row > input\.member-first/);
});
