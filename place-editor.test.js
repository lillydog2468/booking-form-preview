const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const editor = fs.readFileSync(path.join(__dirname, 'place-editor.js'), 'utf8');
const stats = fs.readFileSync(path.join(__dirname, 'places-stats.html'), 'utf8');

test('the place editor saves one catalogue row and does not remove it', () => {
  assert.match(editor, /\.from\('planner_places'\)\.update\(patch\)/);
  assert.match(editor, /\.eq\('updated_at', place\.updated_at\)/);
  assert.equal(editor.includes('.delete('), false);
  assert.equal(editor.includes('Remove place'), false);
  assert.match(editor, /data-pe-save/);
  assert.match(editor, /Save and close/);
  assert.match(editor, /function saveAndClose/);
  assert.equal(editor.includes('>Close<'), false);
  assert.match(stats, /data-type-chip/);
  assert.match(stats, /r\.row && r\.row\.notes/);
  assert.match(stats, /applySavedPlace/);
  assert.match(editor, /<details class="pe-history">/);
  assert.match(editor, /<summary>Visit history<\/summary>/);
  assert.equal(editor.includes('<details class="pe-history" open'), false);
  assert.match(editor, /google\.com\/maps/);
  assert.match(stats, /PlaceVisits\.summariseCatalogue/);
  assert.match(stats, /Unmatched plan entries/);
  assert.match(stats, /Often visited, not in the catalogue/);
  assert.match(stats, /Possible catalogue duplicates/);
  assert.match(stats, /PlaceEditor\.open/);
  assert.match(stats, /id="historyToggle"/);
  assert.match(stats, /id="placesHistory" hidden/);
  assert.match(stats, /id="placeList"/);
  assert.match(stats, />Places history</);
  assert.match(stats, /id === '310'/);
});
