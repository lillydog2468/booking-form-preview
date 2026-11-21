const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadMatch() {
  const ctx = { console, setTimeout, clearTimeout };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'prague-exit.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'prague-hotel-match.js'), 'utf8'), ctx);
  return ctx;
}

test('a known Prague hotel shows a match and does not ask', () => {
  const ctx = loadMatch();
  const axa = ctx.PragueExit.matchHotel('Hotel AXA');
  assert.equal(axa.source, 'known');
  assert.equal(axa.name, 'Hotel AXA');
  assert.equal(axa.address, 'Na Poříčí 40, Praha 1');
  assert.equal(ctx.PragueHotelMatch.matchedLine(axa), 'Matched: Hotel AXA, Na Poříčí 40, Praha 1');
  assert.equal(ctx.PragueExit.matchHotel('axa').name, 'Hotel AXA');
  const atrium = ctx.PragueExit.matchHotel('Hilton Prague Atrium');
  assert.equal(atrium.name, 'Hilton Prague Atrium');
  assert.equal(atrium.address, 'Pobřežní 1, Praha 8');
  assert.equal(ctx.PragueHotelMatch.matchedLine(atrium), 'Matched: Hilton Prague Atrium, Pobřežní 1, Praha 8');
  assert.equal(ctx.PragueExit.matchHotel('Pension Slunce'), null);
  assert.equal(ctx.PragueHotelMatch.shouldSearchOnInput(), false);
  assert.equal(ctx.PragueHotelMatch.shouldSearchOnBlur(), true);
});

test('a saved planner hotel is known everywhere and its pin wins', () => {
  const ctx = loadMatch();
  const row = {
    client_id: 'place_saved',
    name: 'Pension Slunce',
    nickname: 'Slunce',
    place_type: 'hotel',
    place_types: ['hotel'],
    address: 'Korunni 15, Praha 2',
    pin_lat: 50.07,
    pin_lng: 14.44,
  };
  ctx.PragueExit.rememberHotels([
    row,
    { name: 'Not a hotel', place_type: 'cafe', pin_lat: 1, pin_lng: 2 },
    { name: 'Hotel AXA', place_type: 'hotel', address: 'Saved AXA street', pin_lat: 50.07, pin_lng: 14.44 },
  ]);
  const match = ctx.PragueExit.matchHotel('slunce');
  assert.equal(match.source, 'place');
  assert.equal(match.address, 'Korunni 15, Praha 2');
  assert.equal(ctx.PragueHotelMatch.matchedLine(match), 'Matched: Pension Slunce, Korunni 15, Praha 2');
  assert.equal(ctx.PragueExit.matchHotel('cafe'), null);
  const pin = ctx.PragueExit.coordFor('Hotel AXA');
  assert.equal(pin.lat, 50.07);
  assert.equal(pin.lng, 14.44);
  assert.equal(ctx.PragueExit.coordFor('AXA').lat, 50.07);
  const fresh = loadMatch();
  assert.equal(fresh.PragueExit.coordFor('Hotel AXA').lat, 50.0894);
});

test('unknown hotels ask Nominatim, a tick saves the pin, and none of these saves nothing', async () => {
  const ctx = loadMatch();
  const calls = [];
  ctx.PragueHotelMatch.setFetch(async (url) => {
    calls.push(url);
    return {
      ok: true,
      json: async () => ([
        { display_name: 'One, Prague', lat: '50.01', lon: '14.41' },
        { display_name: 'Two, Prague', lat: '50.02', lon: '14.42' },
        { display_name: 'skip' },
        { display_name: 'Three, Prague', lat: '50.03', lon: '14.43' },
        { display_name: 'Four, Prague', lat: '50.04', lon: '14.44' },
        { display_name: 'Five, Prague', lat: '50.05', lon: '14.45' },
        { display_name: 'Six, Prague', lat: '50.06', lon: '14.46' },
      ]),
    };
  });
  const url = ctx.PragueHotelMatch.nominatimUrl('Pension Slunce');
  assert.match(url, /Pension%20Slunce%2C%20Prague%2C%20Czechia/);
  assert.match(url, /bounded=1/);
  assert.match(url, /viewbox=14\.22,50\.18,14\.71,49\.94/);
  assert.match(url, /accept-language=en/);
  const found = await ctx.PragueHotelMatch.lookup('Pension Slunce');
  assert.equal(found.length, 5);
  assert.equal(found[0].label, 'One, Prague');
  assert.equal(found[4].label, 'Five, Prague');
  const again = await ctx.PragueHotelMatch.lookup('hotel pension slunce');
  assert.equal(calls.length, 1);
  assert.equal(again[0].label, 'One, Prague');

  const none = ctx.PragueHotelMatch.choiceResult('none', 'Pension Slunce', found[0], '2026-11-21T12:00:00.000Z');
  assert.equal(none.save, false);
  assert.equal(none.row, null);
  assert.equal(none.note, 'address not confirmed');

  const inserted = [];
  ctx.PragueHotelMatch.setClient({
    from(table) {
      assert.equal(table, 'planner_places');
      return {
        insert(row) {
          inserted.push(row);
          return { select() { return Promise.resolve({ data: [{ client_id: row.client_id }], error: null }); } };
        },
      };
    },
  });
  const saved = await ctx.PragueHotelMatch.savePlace('pension slunce', found[1]);
  assert.equal(saved.saved, true);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].name, 'Pension Slunce');
  assert.equal(inserted[0].place_type, 'hotel');
  assert.equal(inserted[0].place_types.length, 1);
  assert.equal(inserted[0].place_types[0], 'hotel');
  assert.equal(inserted[0].address, 'Two, Prague');
  assert.equal(inserted[0].pin_lat, 50.02);
  assert.equal(inserted[0].pin_lng, 14.42);
  assert.ok(inserted[0].pin_set_at);
  assert.match(inserted[0].client_id, /^place_/);
  assert.equal(ctx.PragueExit.matchHotel('Pension Slunce').source, 'place');
  assert.equal(ctx.PragueExit.matchHotel('Hotel AXA').source, 'known');
  assert.equal(ctx.PragueHotelMatch.choiceResult('none', 'Somewhere else', found[0]).save, false);
});

test('a blocked Nominatim answer is not treated as no addresses', async () => {
  const ctx = loadMatch();
  const calls = [];
  ctx.PragueHotelMatch.setFetch(async (url) => {
    calls.push(url);
    if (url.indexOf('photon.komoot.io') >= 0) {
      return {
        ok: true,
        json: async () => ({
          features: [{
            geometry: { coordinates: [14.4396649, 50.0933467] },
            properties: { name: 'Hilton Prague Atrium', street: 'Pobřežní', housenumber: '1', city: 'Prague', country: 'Czechia' },
          }],
        }),
      };
    }
    return { ok: false, status: 429, json: async () => ({ error: 'blocked' }) };
  });
  const found = await ctx.PragueHotelMatch.lookup('Mystery Inn');
  assert.ok(calls.some(url => /Prague%2C%20Czechia|Prague,\+Czechia/.test(url)));
  assert.ok(calls.some(url => url.indexOf('Praha') >= 0));
  assert.ok(calls.some(url => url.indexOf('photon.komoot.io') >= 0));
  assert.match(found[0].label, /Pobřežní/);
  assert.equal(found[0].lat, 50.0933467);

  ctx.PragueHotelMatch.clearCache();
  ctx.PragueHotelMatch.setFetch(async () => ({ ok: true, json: async () => [] }));
  const empty = await ctx.PragueHotelMatch.search('Nowhere Inn');
  assert.equal(empty.list.length, 0);
  assert.equal(empty.message, 'No matches, try a different spelling');

  ctx.PragueHotelMatch.clearCache();
  ctx.PragueHotelMatch.setFetch(async () => { throw new Error('offline'); });
  const down = await ctx.PragueHotelMatch.search('Offline Inn');
  assert.equal(down.list.length, 0);
  assert.equal(down.message, 'Could not look up addresses. Try again in a moment.');
  const css = fs.readFileSync(path.join(__dirname, 'booking-form.css'), 'utf8');
  assert.match(css, /\.prague-address-ask \{[\s\S]*width: 100%/);
  assert.match(css, /\.prague-address-choice span \{[\s\S]*overflow-wrap: anywhere/);
});

test('each guest confirms alone, and the group tick covers everyone', () => {
  const ctx = loadMatch();
  const alone = ctx.PragueHotelMatch.addressScope(false);
  assert.equal(alone.guest, true);
  assert.equal(alone.shared, false);
  assert.equal(alone.groupEditor, false);
  assert.equal(ctx.PragueHotelMatch.groupLineOpensEditor(false), false);
  const group = ctx.PragueHotelMatch.addressScope(true);
  assert.equal(group.guest, false);
  assert.equal(group.shared, true);
  assert.equal(group.groupEditor, true);
  assert.equal(ctx.PragueHotelMatch.groupLineOpensEditor(true), true);
  assert.equal(ctx.PragueHotelMatch.extraAddressActive('prague-hotel', ''), true);
  assert.equal(ctx.PragueHotelMatch.extraAddressActive('pickup', 'prague_hotel'), true);
  assert.equal(ctx.PragueHotelMatch.extraAddressActive('pickup', 'airport'), false);

  const guestA = ctx.PragueHotelMatch.choiceResult('none', 'Hotel One', null);
  const guestB = ctx.PragueHotelMatch.choiceResult('pick', 'Hotel Two', { label: 'Two street', lat: 50.1, lng: 14.2 }, '2026-11-21T12:00:00.000Z');
  assert.equal(guestA.save, false);
  assert.equal(guestB.save, true);
  assert.equal(guestB.row.name, 'Hotel Two');
  assert.notEqual(guestA.row, guestB.row);

  assert.equal(ctx.PragueHotelMatch.stayAddLabel(0), 'Add a stay');
  assert.equal(ctx.PragueHotelMatch.stayAddLabel(1), 'Add another stay');
  const form = fs.readFileSync(path.join(__dirname, 'booking-form.js'), 'utf8');
  assert.match(form, /guest-prague-affordance/);
  assert.match(form, /toggleGroupPragueEditor/);
  assert.match(form, /ensureSharedPragueBlank/);
  assert.match(form, /prague_stays: shared\.map\(stay => Object\.assign\(\{\}, stay\)\)/);
  assert.match(form, /id="t\$\{t\}_shared_prague_add"/);
});
