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
const forecast = read('profit-forecast.html');
const oldPlanner = read('tour-planner.html');
const booking2 = read('booking2.html');
const navJs = read('site-nav.js');
const config = read('booking-config.js');

function navBlock(html) {
  const start = html.indexOf('aria-label="Pages"');
  assert.ok(start > 0);
  return html.slice(start, html.indexOf('</nav>', start));
}

function hasPrimary(html) {
  assert.match(html, /class="[^"]*site-nav/);
  const nav = navBlock(html);
  const bookings = nav.indexOf('>Bookings<');
  const places = nav.indexOf('>Places<');
  const planning = nav.indexOf('>Planning<');
  const hotelsLink = nav.indexOf('>Hotels<');
  const more = nav.indexOf('>More<');
  assert.ok(bookings > 0 && places > bookings && planning > places && hotelsLink > planning && more > hotelsLink);
  assert.match(nav, /href="places-stats\.html"/);
  assert.match(nav, /href="booking2\.html"/);
  assert.match(nav, /href="hotels\.html"/);
  assert.match(nav, /class="site-more-btn/);
  const menu = nav.slice(nav.indexOf('class="site-more-menu"'));
  assert.equal(menu.includes('>Hotels<'), false);
  assert.match(menu, />Analytics</);
  assert.match(menu, />Tax summary</);
  assert.match(menu, />Profit, size of tour forecast</);
  assert.match(menu, /href="profit-forecast\.html"/);
  assert.equal(nav.slice(0, nav.indexOf('site-more-menu')).includes('profit-forecast.html'), false);
  assert.match(menu, />Admin</);
  assert.match(menu, />2027 interest</);
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
  const hotelsLink = form.indexOf('id="navHotels"');
  const moreStart = form.indexOf('class="site-more"');
  assert.ok(hotelsLink > 0 && hotelsLink < moreStart);
  const more = form.slice(moreStart, form.indexOf('class="topbar-actions"'));
  assert.match(more, /id="navAnalytics"/);
  assert.equal(more.includes('id="navHotels"'), false);
  assert.match(more, /id="navPlanner"/);
  assert.equal(form.slice(form.indexOf('class="view-nav"'), form.indexOf('id="navLayout"')).includes('>Analytics<'), false);
});

test('the other pages share Bookings, Places and Planning', () => {
  [analytics, hotels, places, tax, forecast, oldPlanner].forEach(hasPrimary);
  assert.match(forecast, /href="profit-forecast\.html" aria-current="page"/);
  assert.match(forecast, /<h1>Profit, size of tour forecast<\/h1>/);
  assert.match(forecast, /site-more-btn is-current/);
  assert.match(places, /href="places-stats\.html"[^>]*aria-current="page"/);
  assert.match(analytics, /href="analytics\.html"[^>]*aria-current="page"/);
  assert.match(hotels, /id="navHotels" href="hotels\.html" aria-current="page"/);
  assert.equal(hotels.includes('site-more-btn is-current'), false);
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
