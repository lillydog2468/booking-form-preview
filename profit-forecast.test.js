const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const forecastApi = require('./profit-forecast.js');

const root = __dirname;

test('a 6-day tour matches the vehicle fuel profits', () => {
  const expected = { 2: 980, 3: 1580, 4: 2180, 5: 2695, 6: 3295, 7: 3895 };
  const perPerson = { 2: 490, 3: 526.67, 4: 545, 5: 539, 6: 549.17, 7: 556.43 };
  Object.keys(expected).forEach(function (key) {
    const people = Number(key);
    const row = forecastApi.forecast({ people: people, days: 6, leaderHalfPrice: false });
    const tesla = people <= 4;
    assert.equal(row.pricePerPerson, 805);
    assert.equal(row.nights, 5);
    assert.equal(row.rooms, people + 1);
    assert.equal(row.revenue, people * 805);
    assert.equal(row.hotel, (people + 1) * 5 * 41);
    assert.equal(row.fuel, tesla ? 15 : 100);
    assert.equal(row.profit, row.revenue - row.hotel - row.fuel);
    assert.equal(row.profit, expected[people]);
    assert.equal(row.profitPerPerson, perPerson[people]);
    assert.equal(row.vehicle, tesla
      ? 'Tesla Model Y + luggage trailer'
      : 'Mercedes Vito');
  });
  const two = forecastApi.forecast({ people: 2, days: 6 });
  assert.equal(two.revenue, 1610);
  assert.equal(two.hotel, 615);
  assert.equal(two.fuel, 15);
  assert.equal(two.profit, 980);
});

test('shorter tours scale weekly fuel by days out of 6 and round up', () => {
  assert.equal(forecastApi.fuelFor(4, 6), 15);
  assert.equal(forecastApi.fuelFor(5, 6), 100);
  assert.equal(forecastApi.fuelFor(4, 5), 13);
  assert.equal(forecastApi.fuelFor(5, 5), 84);
  assert.equal(forecastApi.fuelFor(2, 1), 3);
  assert.equal(forecastApi.fuelFor(4, 3), 8);
  assert.equal(forecastApi.fuelFor(4, 4), 10);
  assert.equal(forecastApi.fuelFor(2, 7), 18);
  assert.equal(forecastApi.fuelFor(7, 7), 117);
});

test('leader half-price and a 5-day tour use the same hotel rule', () => {
  const half = forecastApi.forecast({ people: 2, days: 6, leaderHalfPrice: true });
  assert.equal(half.revenue, 1207.5);
  assert.equal(half.hotel, 615);
  assert.equal(half.fuel, 15);
  assert.equal(half.profit, 577.5);
  assert.equal(half.profitPerPerson, 288.75);

  const five = forecastApi.forecast({ people: 4, days: 5 });
  assert.equal(five.pricePerPerson, 690);
  assert.equal(five.nights, 4);
  assert.equal(five.hotel, 820);
  assert.equal(five.fuel, 13);
  assert.equal(five.profit, 1927);
  assert.equal(five.vehicle, 'Tesla Model Y + luggage trailer');
});

test('a what-if hotel rate and fuel replace the usual figures', () => {
  const row = forecastApi.forecast({ people: 4, days: 6, hotelRate: 50, fuel: 80 });
  assert.equal(row.hotel, 1250);
  assert.equal(row.fuel, 80);
  assert.equal(row.profit, 3220 - 1250 - 80);
});

test('the price book can replace 2027 prices, and a missing night stays listed', () => {
  const book = {
    parkHotelPrice: '41',
    years: {
      2027: {
        dayTrip: '124',
        beading: { 1: '294', 2: '412', 3: '546', 4: '690', 5: '805' }
      }
    }
  };
  const catalogue = forecastApi.catalogueFromBook(book);
  assert.equal(catalogue.hotelRate, 41);
  assert.equal(catalogue.usedBook, true);
  const week = catalogue.lengths.find(function (row) { return row.days === 7; });
  const six = catalogue.lengths.find(function (row) { return row.days === 6; });
  assert.equal(six.price, 805);
  assert.equal(week.price, 925);
  const fromBook = forecastApi.forecast({ people: 4, days: 6, lengths: catalogue.lengths, hotelRate: catalogue.hotelRate });
  assert.equal(fromBook.profit, 2180);
});

test('the page title is exact and the link is only inside More', () => {
  const page = fs.readFileSync(path.join(root, 'profit-forecast.html'), 'utf8');
  assert.match(page, /<title>Profit, size of tour forecast<\/title>/);
  assert.match(page, /<h1>Profit, size of tour forecast<\/h1>/);
  assert.match(page, /<details class="adjust">\s*<summary>Adjust<\/summary>/);
  assert.equal(/<details class="adjust"[^>]*\sopen/.test(page), false);
  assert.ok(page.indexOf('id="people"') < page.indexOf('<details class="adjust">'));
  const fold = page.slice(page.indexOf('<details class="adjust">'), page.indexOf('</details>'));
  assert.match(fold, /This estimate covers the hotel and fuel only\. Meals and entries are not recorded\./);
  assert.match(fold, /id="hotelRate"/);
  assert.match(fold, /id="fuel"/);
  assert.match(page, /AuthGate\.require\(/);
  const js = fs.readFileSync(path.join(root, 'profit-forecast.js'), 'utf8');
  assert.match(js, /\.select\('book'\)/);
  assert.equal(js.includes('.insert('), false);
  assert.equal(js.includes('.update('), false);
  assert.equal(js.includes('.upsert('), false);
  assert.equal(js.includes('.delete('), false);
  assert.equal(js.includes('localStorage'), false);

  const files = fs.readdirSync(root).filter(function (name) { return name.endsWith('.html'); });
  let menus = 0;
  files.forEach(function (name) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    const beforeMenu = html.split('site-more-menu')[0];
    assert.equal(beforeMenu.includes('profit-forecast.html'), false, name + ' links it outside More');
    assert.equal(/class="site-nav-link"[^>]*href="profit-forecast\.html"/.test(html), false, name);
    if (html.includes('site-more-menu')) {
      menus += 1;
      const menu = html.slice(html.indexOf('site-more-menu'));
      assert.match(menu, /href="profit-forecast\.html"[^>]*>Profit, size of tour forecast</);
    }
  });
  assert.equal(menus, 7);
});
