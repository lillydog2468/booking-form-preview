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

test('a postgres array string is read the same way as a list', () => {
  const types = PC.placeCategories({
    place_type: 'viewpoint',
    place_types: '{restaurant,viewpoint}',
  });
  assert.deepEqual(types, ['viewpoint', 'restaurant']);
});
