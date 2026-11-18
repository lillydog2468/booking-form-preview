const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = __dirname;
function read(name) { return fs.readFileSync(path.join(root, name), 'utf8'); }

const form = read('booking-form.html');
const analytics = read('analytics.html');
const hotels = read('hotels.html');
const places = read('places-stats.html');
const tax = read('tax-summary.html');
const oldPlanner = read('tour-planner.html');
const booking2 = read('booking2.html');
const navJs = read('site-nav.js');
const config = read('booking-config.js');

function hasPrimary(html) {
  assert.match(html, /class="[^"]*site-nav/);
  assert.match(html, />Bookings</);
  assert.match(html, /href="places-stats\.html"/);
  assert.match(html, />Places</);
  assert.match(html, /href="booking2\.html"/);
  assert.match(html, />Planning</);
  assert.match(html, /class="site-more-btn/);
  assert.match(html, />More</);
  assert.match(html, /href="analytics\.html"/);
  assert.match(html, /href="hotels\.html"/);
  assert.match(html, /href="tax-summary\.html"/);
  assert.match(html, /src="site-nav\.js"/);
}

test('the booking form keeps its own tabs and puts other pages under More', () => {
  const layout = form.indexOf('id="navLayout"');
  const table = form.indexOf('id="navTable"');
  const year = form.indexOf('id="navYearTours"');
  const analyticsId = form.indexOf('id="navAnalytics"');
  assert.ok(layout > 0 && table > layout && year > table && analyticsId > year);
  assert.match(form, /id="navInterest" href="interest-2027.html" title="2027 interest" style="display:none;text-decoration:none;"/);
  assert.match(form, /href="tour-planner\.html"/);
  hasPrimary(form);
  const more = form.slice(form.indexOf('class="site-more"'), form.indexOf('class="topbar-actions"'));
  assert.match(more, /id="navAnalytics"/);
  assert.match(more, /id="navHotels"/);
  assert.match(more, /id="navPlanner"/);
  assert.equal(form.slice(form.indexOf('class="view-nav"'), form.indexOf('id="navLayout"')).includes('>Analytics<'), false);
});

test('the other pages share Bookings, Places and Planning', () => {
  [analytics, hotels, places, tax, oldPlanner].forEach(hasPrimary);
  assert.match(places, /href="places-stats\.html"[^>]*aria-current="page"/);
  assert.match(analytics, /href="analytics\.html"[^>]*aria-current="page"/);
  assert.match(hotels, /href="hotels\.html"[^>]*aria-current="page"/);
  assert.match(tax, /id="interestNav" hidden/);
  assert.match(tax, /class="view-nav site-nav"/);
});

test('More opens from a tap, and booking2 can return to the form', () => {
  assert.match(navJs, /addEventListener\('click'/);
  assert.equal(navJs.includes('mouseenter'), false);
  assert.equal(navJs.includes('mouseover'), false);
  assert.match(navJs, /aria-expanded/);
  assert.match(booking2, /class="b2-back-link" href="booking-form\.html"/);
  assert.match(booking2.slice(0, booking2.indexOf('id="b2Title"')), /Back to bookings/);
  assert.match(config, /root\.HIDE_OLD_PLANNING = false/);
});
