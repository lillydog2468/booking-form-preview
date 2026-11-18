const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, 'place-popup.js'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, 'sql/32_planner_place_contact.sql'), 'utf8');

function load() {
  const ctx = { navigator: { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel' } };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.PlacePopup;
}

test('Lamp glass shows its number even when the method is message', () => {
  const P = load();
  const lamp = {
    id: '14',
    name: 'Lamp glass',
    address: 'Jablonec',
    contact_method: 'message',
    contact_detail: '+420 777 987 070',
    notes: 'dont normaly phone just turn up Martin Rausch',
    pin_lat: 50.72,
    pin_lng: 15.17,
  };
  const html = P.popupHtml(lamp);
  assert.match(html, /href="tel:\+420777987070"/);
  assert.match(html, /href="sms:\+420777987070"/);
  assert.match(html, /Message/);
  assert.match(html, /dont normaly phone just turn up Martin Rausch/);
  assert.equal(html.includes('No phone'), false);
  assert.match(html, /maps\.apple\.com\/\?daddr=50\.72,15\.17/);
  assert.match(html, />Navigate</);
  assert.match(html, /data-add-contact/);
});

test('a saved contact is a separate line, and a blank place says no phone', () => {
  const P = load();
  const saved = P.popupHtml({
    name: 'Haberdashery',
    contact_name: 'Martin Rausch',
    contact_phone: '+420 777 111 222',
  });
  assert.match(saved, /Contact Martin Rausch/);
  assert.match(saved, /href="tel:\+420777111222"/);
  assert.equal(saved.includes('No phone'), false);
  assert.equal(saved.includes('data-add-contact'), false);
  const empty = P.popupHtml({ name: 'Quiet shop', contact_method: 'message', contact_detail: '' });
  assert.match(empty, /No phone/);
  assert.equal(empty.includes('tel:'), false);
  assert.equal(P.popupHtml(null), '');
});

test('a Mac uses Apple Maps and another computer uses Google', () => {
  const P = load();
  const place = { name: 'GB Beads', address: 'Jablonec' };
  assert.match(P.navigateHref(place), /^https:\/\/maps\.apple\.com\/\?daddr=/);
  const google = P.navigateHref(place, { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32' });
  assert.match(google, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
});

test('saving a contact writes only the two new columns', async () => {
  const P = load();
  const calls = [];
  const sb = {
    from(table) {
      return {
        update(payload) {
          return { eq(column, id) { calls.push({ table, payload, column, id }); return Promise.resolve({ error: null, data: [{ client_id: id }] }); } };
        },
      };
    },
  };
  const patch = P.contactPatch('Martin Rausch', '+420 777 111 222');
  const updated = await sb.from('planner_places').update(patch).eq('client_id', '14');
  assert.equal(updated.error, null);
  assert.equal(calls[0].table, 'planner_places');
  assert.deepEqual(Object.keys(calls[0].payload).sort(), ['contact_name', 'contact_phone']);
  assert.equal(calls[0].payload.contact_name, 'Martin Rausch');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS contact_name text/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS contact_phone text/);
  assert.equal(/DROP TABLE/i.test(sql), false);
});
