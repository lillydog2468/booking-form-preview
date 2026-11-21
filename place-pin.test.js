const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

require('./prague-exit.js');
require('./handover-stops.js');
require('./place-pin.js');

const P = PlacePin;
const sql = fs.readFileSync(path.join(__dirname, 'sql/28_planner_place_pins.sql'), 'utf8');
const planner = fs.readFileSync(path.join(__dirname, 'tour-planner.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'tour-planner.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'tour-planner.html'), 'utf8');

function memory() {
  const bag = {};
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : null; },
    setItem(key, value) { bag[key] = String(value); },
  };
}

test('a saved pin, a map link, typed coordinates, then Jablonec', () => {
  P.resetForTests();
  const pinned = { id: 'kf01', address: 'Koperovy', pinLat: 50.70123, pinLng: 15.20123 };
  assert.deepEqual(P.centreForPlace(pinned), { lat: 50.70123, lng: 15.20123, source: 'pin' });
  assert.equal(P.needsLookup(pinned), false);

  const apple = { id: 'a', address: 'https://maps.apple.com/?ll=50.70123,15.20123&q=Factory' };
  assert.deepEqual(P.centreForPlace(apple), { lat: 50.70123, lng: 15.20123, source: 'address' });
  assert.equal(P.needsLookup(apple), false);

  const typed = { id: 'b', address: '50.7 N, 15.2 E' };
  assert.deepEqual(P.centreForPlace(typed), { lat: 50.7, lng: 15.2, source: 'address' });

  const google = { id: 'c', address: 'https://www.google.com/maps/place/Factory/@50.11,15.22,17z' };
  assert.equal(P.centreForPlace(google).source, 'address');
  assert.equal(P.centreForPlace(google).lat, 50.11);

  const shortLink = { id: 'd', address: 'https://maps.apple/p/abcd1234' };
  assert.equal(P.centreForPlace(shortLink).source, 'jablonec');
  assert.equal(P.needsLookup(shortLink), false);
  assert.equal(P.centreForPlace(shortLink).lat, P.JABLONEC.lat);

  const typedAddress = { id: 'e', address: 'Koberovy 94' };
  assert.equal(P.centreForPlace(typedAddress).source, 'jablonec');
  assert.equal(P.needsLookup(typedAddress), true);
  typedAddress.geocodeLat = 50.625;
  typedAddress.geocodeLng = 15.221;
  typedAddress.geocodeQuery = 'Koberovy 94';
  assert.equal(P.centreForPlace(typedAddress).source, 'geocode');
  assert.equal(P.needsLookup(typedAddress), false);
  assert.equal(P.zoomFor(P.centreForPlace(pinned)), 16);
  assert.equal(P.zoomFor(P.centreForPlace({ address: '' })), 13);
});

test('axa, hotel axa and Hotel AXA sit on Na Poříčí 40, ahead of a cached geocode', async () => {
  P.resetForTests();
  ['axa', 'hotel axa', 'Hotel AXA'].forEach(function (name) {
    const found = P.resolveHotel(name, { geocodeLat: 50.0510146, geocodeLng: 14.4360697, geocodeQuery: 'axa, Czech Republic' });
    assert.equal(found.address, 'Na Poříčí 40, Praha 1');
    assert.equal(found.source, 'known');
    assert.ok(Math.abs(found.lat - 50.0898903) < 0.0001);
    assert.ok(Math.abs(found.lng - 14.435736) < 0.0001);
  });
  const stale = {
    name: 'Hotel AXA',
    address: '50.0894,14.4392',
    geocodeLat: 50.0510146,
    geocodeLng: 14.4360697,
    geocodeQuery: '50.0894,14.4392',
  };
  const centre = P.centreForPlace(stale);
  assert.equal(centre.source, 'known');
  assert.ok(Math.abs(centre.lng - 14.435736) < 0.0001);
  const pinned = P.resolveHotel('axa', {
    places: [{ name: 'Hotel AXA', nickname: 'axa', address: 'Na Příkopě 12, Praha 1', pinLat: 50.085, pinLng: 14.426 }],
    geocodeLat: 50.051, geocodeLng: 14.436,
  });
  assert.equal(pinned.source, 'pin');
  assert.equal(pinned.lat, 50.085);
  assert.equal(pinned.address, 'Na Příkopě 12, Praha 1');
  let called = false;
  const looked = await P.geocodeHotel('axa', { fetch: function () { called = true; return Promise.resolve({ ok: false }); } });
  assert.equal(called, false);
  assert.equal(looked.address, 'Na Poříčí 40, Praha 1');
  P.setGeocodeGap(0);
  const fetch = function (url) {
    assert.match(decodeURIComponent(url), /Pension Rosa, Prague, Czechia/);
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve([{ lat: '50.08', lon: '14.42' }]); } });
  };
  const other = await P.geocodeHotel('Pension Rosa', { fetch: fetch });
  assert.deepEqual(other, { lat: 50.08, lng: 14.42 });
  P.resetForTests();
});

test('Navigate prefers a stop pin, then the linked place pin, then the address', () => {
  const place = { id: 'kf01', address: 'Koperovy', pinLat: 50.70123, pinLng: 15.20123, pinSetAt: '2026-11-02T12:00:00.000Z' };
  const stop = { placeId: 'kf01', address: 'Koperovy', title: 'Rudkovsky' };
  assert.equal(P.navigationQuery(stop, place, stop.address), '50.70123,15.20123');
  stop.pinLat = 50.5;
  stop.pinLng = 15.1;
  assert.equal(P.navigationQuery(stop, place, stop.address), '50.5,15.1');
  assert.equal(P.navigationQuery({ address: 'U Obecního dvora 7' }, null, 'U Obecního dvora 7'), 'U Obecního dvora 7');
  assert.equal(P.pinStatusText(place), 'Pin saved · 50.70123, 15.20123');
  assert.equal(P.pinStatusText({ address: 'Koberovy' }), '');
});

test('a cloud row without pin columns keeps the device pin until this device clears it', () => {
  P.resetForTests();
  const box = memory();
  const place = { id: 'kf01', address: 'Koperovy' };
  P.writePin(place, 50.70123, 15.20123, '2026-11-02T12:00:00.000Z');
  P.rememberDevicePin(place, box);
  const loaded = { id: 'kf01', address: 'Koperovy' };
  P.applyRowPin(loaded, { client_id: 'kf01', name: 'Rudkovsky' }, box);
  assert.equal(P.readPin(loaded).lat, '50.70123');
  const kept = { id: 'kf01' };
  P.applyRowPin(kept, { pin_lat: null, pin_lng: null, pin_set_at: null }, box);
  assert.equal(P.readPin(kept).lat, '50.70123');
  assert.equal(kept.pinNeedsUpload, true);
  kept.pinLat = null;
  kept.pinLng = null;
  kept.pinSetAt = '';
  P.rememberDevicePin(kept, box);
  const cleared = { id: 'kf01' };
  P.applyRowPin(cleared, { pin_lat: null, pin_lng: null, pin_set_at: null }, box);
  assert.equal(P.readPin(cleared), null);
  assert.equal(cleared.pinNeedsUpload, false);
});

test('a missing pin column is left out and the rest of the place still saves', async () => {
  P.resetForTests();
  const row = P.attachPinColumns({ name: 'Rudkovsky', address: 'Koperovy' }, { pinLat: 50.7, pinLng: 15.2, pinSetAt: '2026-11-02T12:00:00.000Z' });
  assert.equal(row.pin_lat, 50.7);
  assert.equal(row.name, 'Rudkovsky');
  const writes = [];
  const missing = { code: 'PGRST204', message: "Could not find the 'pin_lat' column of 'planner_places' in the schema cache" };
  const result = await P.writeWithoutMissingPinColumns(row, function (sent) {
    writes.push(sent);
    if (Object.prototype.hasOwnProperty.call(sent, 'pin_lat')) return { data: null, error: missing };
    return { data: [{ client_id: 'kf01' }], error: null };
  });
  assert.equal(writes.length, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(writes[1], 'pin_lat'), false);
  assert.equal(writes[1].name, 'Rudkovsky');
  assert.equal(writes[1].address, 'Koperovy');
  assert.equal(result.error, null);
  assert.equal(P.columnsAreAbsent(), true);
  assert.deepEqual(P.pinPatch({ pinLat: null }, { pinLat: 50.7, pinLng: 15.2 }), {});
  P.resetForTests();
  assert.deepEqual(
    P.pinPatch({ pinLat: null, pinLng: null, pinSetAt: '' }, { pinLat: 50.7, pinLng: 15.2, pinSetAt: '2026-11-02T12:00:00.000Z' }),
    { pin_lat: 50.7, pin_lng: 15.2, pin_set_at: '2026-11-02T12:00:00.000Z' }
  );
});

test('address lookup runs one at a time and remembers the answer', async () => {
  P.resetForTests();
  P.setGeocodeGap(0);
  let calls = 0;
  let releaseFirst;
  const fetch = (url) => {
    calls += 1;
    assert.match(url, /nominatim\.openstreetmap\.org\/search/);
    assert.match(url, /Czech%20Republic|Czech\+Republic|Czech Republic/);
    if (calls === 1) {
      return new Promise(resolve => {
        releaseFirst = () => resolve({
          ok: true,
          json: () => Promise.resolve([{ lat: '50.625', lon: '15.221' }]),
        });
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([{ lat: '50.7', lon: '15.2' }]),
    });
  };
  const first = P.geocodeAddress('Koberovy 94', { fetch });
  const second = P.geocodeAddress('Jablonec nad Nisou', { fetch });
  const repeat = P.geocodeAddress('Koberovy 94', { fetch });
  assert.equal(calls, 1);
  releaseFirst();
  const point = await first;
  assert.deepEqual(point, { lat: 50.625, lng: 15.221 });
  await new Promise(resolve => setTimeout(resolve, 20));
  const other = await second;
  assert.deepEqual(other, { lat: 50.7, lng: 15.2 });
  assert.equal(calls, 2);
  const again = await repeat;
  assert.deepEqual(again, point);
  assert.equal(calls, 2);
  P.resetForTests();
});

test('the Places map is compact, lazy, and the pin columns are only in the migration', () => {
  assert.match(sql, /ALTER TABLE planner_places ADD COLUMN IF NOT EXISTS pin_lat DOUBLE PRECISION/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS pin_lng DOUBLE PRECISION/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMPTZ/);
  assert.equal(sql.includes('CREATE TABLE'), false);
  assert.match(html, /src="place-pin\.js"/);
  assert.match(planner, /leaflet@1\.9\.4\/dist\/leaflet\.js/);
  assert.match(planner, /sha256-20nQCchB9co0qIjJZRGuk2\/Z9VM\+kNiyxNV1lvTlZBo=/);
  assert.match(planner, /sha256-p4NxAoJBhIIN\+hmNHrzRCf9tD\/miZyoHS5obTRR9BMY=/);
  assert.match(planner, /data-place-map-canvas/);
  assert.match(planner, /IntersectionObserver/);
  assert.match(planner, /writeWithoutMissingPinColumns/);
  assert.match(planner, /navigationAddressForStop/);
  assert.match(css, /\.place-pin-frame \{[^}]*aspect-ratio:\s*4\s*\/\s*3/);
  assert.match(css, /\.place-pin-frame \{[^}]*max-width:\s*min\(640px,\s*100%\)/);
  assert.match(css, /@media \(max-width:\s*1024px\) \{[^}]*\.place-pin-frame \{[^}]*aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(css, /\.place-pin-canvas \{[^}]*height:\s*100%/);
  assert.match(planner, /tile\.openstreetmap\.org/);
  assert.match(planner, /OpenStreetMap/);
  assert.match(planner, /Nominatim/);
  const mapInit = planner.slice(planner.indexOf('function initPlaceLeaflet'), planner.indexOf('function mountShownPlaceMap'));
  assert.match(mapInit, /map\.invalidateSize\(\)/);
  assert.match(mapInit, /new ResizeObserver\(fitMap\)/);
  assert.match(mapInit, /map\.on\('click', \(event\) => dropPin\(event && event\.latlng\)\)/);
  assert.match(mapInit, /marker\.on\('dragend', \(\) => dropPin\(marker\.getLatLng\(\)\)\)/);
  assert.match(mapInit, /moved = true/);
  assert.match(mapInit, /marker\.setLatLng\(latlng\)/);
  assert.match(mapInit, /PlacePin\.writePin\(place, latlng\.lat, latlng\.lng\)/);
  assert.match(mapInit, /showPinSaved\(place\)/);
  assert.match(mapInit, /scheduleAutoSave\(\{ placeId: place\.id \}\)/);
  assert.equal(planner.includes('Drag the pin to the exact spot.'), false);
  assert.equal((planner.match(/Tap the map or drag the pin to the exact spot\./g) || []).length, 3);
});

test('Open in Apple Maps uses a saved pin, and a pasted link still follows Navigate', () => {
  P.resetForTests();
  const rutkovsky = {
    id: 'kf01',
    name: 'Rutkovsky',
    address: 'Koperovy',
    pinLat: 50.624624,
    pinLng: 15.227501,
  };
  assert.equal(
    P.openInAppleMapsHref('Rutkovsky', rutkovsky.address, rutkovsky),
    'https://maps.apple.com/?ll=50.624624,15.227501&q=Rutkovsky'
  );
  assert.equal(
    P.openInAppleMapsHref('Glass factory', 'https://maps.apple.com/?ll=50.70123,15.20123&q=Factory', { name: 'Glass factory', address: 'https://maps.apple.com/?ll=50.70123,15.20123&q=Factory' }),
    'https://maps.apple.com/?daddr=50.70123,15.20123&dirflg=d'
  );
  assert.equal(
    P.openInAppleMapsHref('Somewhere', '50.7 , 15.2', { name: 'Somewhere', address: '50.7 , 15.2' }),
    'https://maps.apple.com/?daddr=50.7,15.2&dirflg=d'
  );
  assert.equal(P.openInAppleMapsHref('Rutkovsky', 'Koperovy', { name: 'Rutkovsky', address: 'Koperovy' }), '');
  const shortLink = 'https://maps.apple/p/abcd1234';
  assert.equal(P.openInAppleMapsHref('Rutkovsky', shortLink, { address: shortLink }), shortLink);

  const mapInit = planner.slice(planner.indexOf('function initPlaceLeaflet'), planner.indexOf('function mountShownPlaceMap'));
  assert.match(mapInit, /updatePlaceMapsLink\(place\.id\)/);
  assert.match(planner, /mapsButtonHtml\(p\.name, p\.address, 'Open in Apple Maps', p\)/);
  assert.match(planner, /tourHotelMapsButtonHtml\(p\.name, p\.address \|\| knownTourHotelAddress\(p\.name\), 'Open in Apple Maps', '', p\)/);
  assert.match(planner, /mapsButtonHtml\(placeName \|\| name, address, label \|\| 'Open in Apple Maps', place\)/);
});
