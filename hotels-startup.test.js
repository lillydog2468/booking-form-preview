const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const page = require('./test-page').pageSource(path.join(__dirname, 'hotels.html'), 'utf8');

test('hotel startup loads the independent lists together and paints stays before the directory', () => {
  const load = page.slice(page.indexOf('async function fetchHotelSources'), page.indexOf('async function savePlanHotels'));
  assert.match(load, /Promise\.all\(\[/);
  assert.match(load, /from\('members'\)/);
  assert.match(load, /from\('booking_hotels'\)\.select\('booking_id, hotel_id, custom_hotel_name, nights, hotels\(name\)'\)/);
  assert.equal(load.includes("select('*, hotels(name)')"), false);
  assert.equal((load.match(/from\('members'\)/g) || []).length, 1);
  assert.match(load, /from\('hotels'\)/);
  assert.match(load, /from\('planner_places'\)/);
  assert.match(load, /from\('planner_plans'\)/);
  assert.match(load, /beginHotelsPrefetch\(\)/);
  const renderAt = load.indexOf('render();\n      setStatus');
  const directoryAt = load.indexOf('renderHotelsUsed();');
  assert.ok(renderAt > 0 && directoryAt > renderAt);
  assert.match(load.slice(renderAt, directoryAt), /await yieldToBrowser\(\)/);
  assert.match(page, /b\._members = membersById/);
});
