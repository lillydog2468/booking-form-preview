const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'));
const css = fs.readFileSync(path.join(__dirname, 'booking-form.css'), 'utf8');
const form = fs.readFileSync(path.join(__dirname, 'booking-form.js'), 'utf8');

function extractFunction(name) {
  const marker = 'function ' + name + '(';
  const start = html.indexOf(marker);
  assert.ok(start >= 0, 'missing ' + name);
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

test('the booking link under the layout header is one short line and keeps every planner link', () => {
  const fareStart = form.indexOf('function buildFormHTML(');
  const fare = form.slice(fareStart, form.indexOf('\n  function ', fareStart + 10));
  assert.match(fare, /booking-link\$\{bookingLinkCollapsed\(\) \? ' is-collapsed' : ''\}/);
  assert.equal(fare.includes('Day planner for this group'), false);

  const refresh = form.slice(form.indexOf('function refreshBookingLink('), form.indexOf('function resetTab('));
  assert.match(refresh, /class="booking-link-planner"/);
  assert.match(refresh, /title="Open a tour planner for this booking"/);
  assert.match(refresh, />Day planner</);
  assert.match(refresh, /plannerLinkHref\(tabId\)/);
  assert.match(refresh, /plannerLinkHref\(tabId, 'people'\)/);
  assert.match(refresh, /plannerLinkHref\(tabId, 'hotels', link\.year\)/);
  assert.match(refresh, /plannerLinkHref\(tabId, 'places'\)/);
  assert.match(refresh, /hotels\.html/);
  assert.match(refresh, /booking-link-group/);
  assert.match(refresh, /booking-link-org/);
  assert.match(refresh, /booking-link-dates/);
  assert.match(refresh, /booking-link-guests/);
  assert.match(refresh, /class="booking-link-extra"/);
  assert.match(refresh, /No hotel room to book/);
  assert.match(refresh, /Organiser arranges hotels/);

  assert.match(css, /\.booking-link \{[^}]*padding:\s*2px 8px/);
  assert.match(css, /\.booking-link \{[^}]*min-height:\s*26px/);
  assert.match(css, /\.booking-link \{[^}]*background:\s*#dbeafe/);
  assert.match(css, /\.booking-link\.is-collapsed \.booking-link-extra \{[^}]*display:\s*none/);
  assert.match(css, /a\.booking-link-planner \{[^}]*min-height:\s*22px/);
  const hidden = css.slice(css.indexOf('.booking-link.is-collapsed .booking-link-extra'), css.indexOf('a.booking-link-pill'));
  assert.equal(hidden.includes('booking-link-guests'), false);
  assert.equal(hidden.includes('booking-link-dates'), false);
  assert.equal(hidden.includes('booking-link-planner'), false);
});

test('the booking link toggle keeps the names and dates and reveals the other links', () => {
  const store = {};
  const fields = {
    group_name: 'Angela Clark Boutique week 1',
    org_first: 'Angela',
    org_last: 'Clark',
    tour_arrival_date: '02/06/2026',
    departure_date: '06/06/2026',
  };
  const box = {
    classes: new Set(['booking-link']),
    classList: {
      toggle(name, on) {
        if (on) box.classes.add(name);
        else box.classes.delete(name);
      },
    },
    innerHTML: '',
  };
  const caret = { textContent: '' };
  const button = {
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    querySelector(sel) { return sel === '.booking-link-caret' ? caret : null; },
  };
  box.querySelector = (sel) => (sel === '.booking-link-fold' ? button : null);
  const link = {
    people: ['Ada Lovelace', 'Beatrice Smith', 'Cara Jones'],
    hotel: 'Park Hotel',
    places: ['Jablonec nad Nisou', 'Prague'],
    year: '2026',
    dayTrip: false,
    organiserBooksHotels: false,
    roomsLabel: '2 doubles',
  };
  const ctx = {
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem(key, value) { store[key] = String(value); },
    },
    document: {
      getElementById(id) { return id === 'ttab_bookingLink' ? box : null; },
      querySelectorAll(sel) { return sel === '.booking-link' ? [box] : []; },
    },
    tabs: new Map([['tab', { bookingId: 310 }]]),
    allHotels: [],
    fieldVal(tabId, key) { return fields[key] || ''; },
    tEl() { return null; },
    toStorageISO(value) { return value; },
    collectBookingExtras() { return {}; },
    getMembersData() { return []; },
    renderPairStats() {},
    BookingExtras: { bookingLink() { return link; } },
    URLSearchParams,
    encodeURIComponent,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction('escapeHtml'),
    extractFunction('escapeAttr'),
    extractFunction('openBookingId'),
    extractFunction('plannerLinkHref'),
    extractFunction('bookingLinkCollapsed'),
    extractFunction('applyBookingLinkFold'),
    extractFunction('toggleBookingLink'),
    extractFunction('refreshBookingLink'),
  ].join('\n'), ctx);

  ctx.refreshBookingLink('tab');
  assert.equal(box.classes.has('is-collapsed'), true);
  assert.match(box.innerHTML, /href="tour-planner\.html\?booking=310"/);
  assert.match(box.innerHTML, /title="Open a tour planner for this booking"/);
  assert.match(box.innerHTML, />Day planner</);
  assert.match(box.innerHTML, /Group<\/span> Angela Clark Boutique week 1/);
  assert.match(box.innerHTML, /Organiser<\/span> Angela Clark/);
  assert.match(box.innerHTML, /Dates<\/span> 02\/06\/2026 – 06\/06\/2026/);
  assert.match(box.innerHTML, /href="tour-planner\.html\?booking=310&amp;tab=people"/);
  assert.match(box.innerHTML, /Guests<\/span> Ada Lovelace, Beatrice Smith, Cara Jones/);
  assert.match(box.innerHTML, /href="tour-planner\.html\?booking=310&amp;tab=hotels&amp;year=2026"/);
  assert.match(box.innerHTML, /Hotel<\/span> Park Hotel/);
  assert.match(box.innerHTML, /href="tour-planner\.html\?booking=310&amp;tab=places"/);
  assert.match(box.innerHTML, /Place<\/span> Jablonec nad Nisou, Prague/);
  assert.match(box.innerHTML, /Year<\/span> 2026/);
  assert.match(box.innerHTML, /href="hotels\.html\?year=2026"/);
  assert.match(box.innerHTML, /Rooms<\/span> 2 doubles/);

  ctx.toggleBookingLink();
  assert.equal(box.classes.has('is-collapsed'), false);
  assert.equal(button.attrs['aria-expanded'], 'true');
  assert.equal(button.attrs['aria-label'], 'Hide hotel, place, year and rooms');
  assert.equal(caret.textContent, '▾');
  assert.equal(store.booking_link_open, '1');
  assert.match(box.innerHTML, /href="tour-planner\.html\?booking=310"/);

  ctx.toggleBookingLink();
  assert.equal(box.classes.has('is-collapsed'), true);
  assert.equal(button.attrs['aria-expanded'], 'false');
  assert.equal(caret.textContent, '▸');
  assert.equal(store.booking_link_open, '0');
});
