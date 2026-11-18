const test = require('node:test');
const assert = require('node:assert/strict');

require('./place-categories.js');

const PC = globalThis.PlaceCategories;

test('a single stored place_type still reads as that one category', () => {
  const types = PC.placeCategories({ place_type: 'hotel', place_types: null });
  assert.deepEqual(types, ['hotel']);
  assert.equal(PC.primaryCategory({ type: 'factory' }), 'factory');
  assert.equal(PC.placeHasCategory({ type: 'factory' }, 'hotel'), false);
  assert.equal(PC.placeHasCategory({ type: 'hotel' }, 'hotel'), true);
});

test('two categories round-trip and keep the original primary first', () => {
  const stored = {
    place_type: 'factory',
    place_types: ['factory', 'experience'],
  };
  assert.deepEqual(PC.placeCategories(stored), ['factory', 'experience']);
  assert.equal(PC.primaryCategory(stored), 'factory');
  assert.equal(PC.placeHasCategory(stored, 'factory'), true);
  assert.equal(PC.placeHasCategory(stored, 'experience'), true);
  assert.equal(PC.placeHasCategory(stored, 'hotel'), false);
  assert.equal(PC.categoriesLabel(stored), 'Factory · Experience');
});

test('adding a second category does not move the stored primary', () => {
  const next = PC.placeCategories(['experience', 'factory'], 'factory');
  assert.deepEqual(next, ['factory', 'experience']);
  const viewpointFood = PC.placeCategories(['restaurant', 'viewpoint'], 'viewpoint');
  assert.deepEqual(viewpointFood, ['viewpoint', 'restaurant']);
  assert.equal(PC.placeHasCategory({ types: viewpointFood }, 'hotel'), false);
  assert.equal(PC.foodCategory({ types: viewpointFood }), true);
  assert.equal(PC.foodCategory({ types: ['viewpoint'] }), false);
  assert.equal(PC.foodCategory({ type: 'snack' }), true);
});

test('a stop cue uses the stored category, then the name, then a pin', () => {
  assert.equal(PC.stopCue({ type: 'factory', name: 'Rutkovsky' }).label, 'Factory');
  assert.equal(PC.stopCue({ type: 'factory', name: 'Rutkovsky' }).emoji, '🏭');
  assert.equal(PC.stopCue({ type: 'museum', name: 'Museum of glass' }).id, 'museum');
  assert.equal(PC.stopCue({ title: 'Glass works' }).id, 'glass');
  assert.equal(PC.stopCue({ title: 'Antik shop beads' }).label, 'Bead shop');
  assert.equal(PC.stopCue({ title: 'Lunch at Na Bašta' }).label, 'Lunch');
  assert.equal(PC.stopCue({ type: 'handover', handoverKind: 'dropoff', hotelName: 'Hotel Axa' }).label, 'Drop-off');
  assert.equal(PC.stopCue({ type: 'handover', placeKind: 'airport', title: 'Airport pick-up' }).label, 'Airport');
  assert.equal(PC.stopCue({ type: 'travel', title: 'Drive to the beading area' }).label, 'Travel');
  assert.equal(PC.stopCue({ title: 'Somewhere unnamed' }).emoji, '📍');
  assert.equal(PC.STOP_CUES.some(function (cue) { return cue.id === 'hotel'; }), true);
});

test('new category labels stay British and do not replace the old ones', () => {
  const ids = PC.CATALOGUE_TYPES.map(t => t.id);
  assert.deepEqual(ids, [
    'hotel', 'factory', 'shop', 'antique', 'restaurant', 'snack',
    'experience', 'museum', 'school', 'viewpoint', 'other',
  ]);
  assert.equal(PC.singularLabel('antique'), 'Antique');
  assert.equal(PC.singularLabel('snack'), 'Snack');
  assert.equal(PC.singularLabel('viewpoint'), 'Viewpoint');
  assert.equal(PC.groupLabel('factory'), 'Factories');
  assert.equal(PC.groupLabel('hotel'), 'Hotels');
  assert.equal(PC.singularLabel('hotel'), 'Hotel');
  const snack = PC.CATALOGUE_TYPES.find(t => t.id === 'snack');
  assert.match(snack.hint, /supermarket or a bakery/i);
  assert.match(snack.hint, /not a restaurant/i);
});

test('each stop kind has its own soft colour', () => {
  const names = ['airport', 'pickup', 'dropoff', 'hotel', 'factory', 'shop', 'museum', 'restaurant', 'other'];
  const washes = names.map(function (id) { return PC.paletteFor(id).wash; });
  assert.equal(new Set(washes).size, names.length);
  assert.equal(PC.stopCue({ type: 'handover', placeKind: 'airport' }).tone, 'airport');
  assert.equal(PC.stopCue({ type: 'handover', handoverKind: 'pickup' }).tone, 'pickup');
  assert.notEqual(PC.paletteFor('airport').stripe, PC.paletteFor('pickup').stripe);
  const css = PC.paletteCss();
  assert.match(css, /stop-tone-museum\{background:#fbf6e6/);
  assert.match(css, /stop-tone-factory\{background:#f1eefc/);
  assert.match(css, /\.type-shop\{color:#1c3a6e;background:#dce8fb/);
  assert.match(css, /stop-tone-hotel\{background:#3a2e18/);
});

test('a postgres array string is read the same way as a list', () => {
  const types = PC.placeCategories({
    place_type: 'viewpoint',
    place_types: '{restaurant,viewpoint}',
  });
  assert.deepEqual(types, ['viewpoint', 'restaurant']);
});
