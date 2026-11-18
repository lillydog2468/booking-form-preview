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
  assert.match(editor, /google\.com\/maps/);
  assert.match(stats, /PlaceVisits\.summariseCatalogue/);
  assert.match(stats, /Unmatched plan entries/);
  assert.match(stats, /Often visited, not in the catalogue/);
  assert.match(stats, /Possible catalogue duplicates/);
  assert.match(stats, /PlaceEditor\.open/);
  assert.match(stats, /id === '310'/);
});
