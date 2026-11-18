const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const plannerCss = fs.readFileSync(path.join(__dirname, 'tour-planner.css'), 'utf8');

const planner = fs.readFileSync(path.join(__dirname, 'tour-planner.js'), 'utf8');

function extractFunction(name) {
  const start = planner.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  let i = planner.indexOf('{', start);
  let depth = 0;
  for (; i < planner.length; i++) {
    if (planner[i] === '{') depth++;
    else if (planner[i] === '}') {
      depth--;
      if (depth === 0) return planner.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

function loadMaps() {
  const ctx = {};
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'prague-exit.js'), 'utf8'), ctx);
  vm.runInContext([
    extractFunction('escapeHtml'),
    extractFunction('timeToMinutes'),
    extractFunction('compareStopTime'),
    extractFunction('sortDayBlocks'),
    extractFunction('isRealBlock'),
    extractFunction('cleanMapsQuery'),
    extractFunction('routeQueryText'),
    extractFunction('routePointForStop'),
    extractFunction('routePointsForStop'),
    extractFunction('dayRouteStops'),
    extractFunction('orderedHotelPoints'),
    extractFunction('googleMapsDirectionsUrl'),
    extractFunction('pragueHotelPoints'),
    extractFunction('praguePhoneChoices'),
    extractFunction('pragueRoutePoints'),
    extractFunction('pragueMapsForDay'),
    extractFunction('pragueDayHasCombinedRoute'),
    extractFunction('pragueRouteLinkHtml'),
    extractFunction('pragueHotelMapsLink'),
    extractFunction('pragueHotelLinesHtml'),
    extractFunction('pragueChoicesNavHtml'),
  ].join('\n'), ctx);
  return ctx;
}

function directions(url) {
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, 'https://www.google.com/maps/dir/');
  return parsed.searchParams;
}

test('one pick-up opens Google Maps straight to that place', () => {
  const ctx = loadMaps();
  const url = ctx.googleMapsDirectionsUrl(['Na Poříčí 40, Prague']);
  const params = directions(url);
  assert.equal(params.get('destination'), 'Na Poříčí 40, Praha');
  assert.equal(params.get('origin'), null);
  assert.equal(params.get('waypoints'), null);
  assert.equal(params.get('travelmode'), 'driving');
  assert.equal(url.includes('/dir//'), false);
});

test('two and three hotels start at the current location, then each hotel in order', () => {
  const ctx = loadMaps();
  const two = ['Hotel A, Address, Prague', 'Hotel B, Address, Prague'];
  const twoParams = directions(ctx.googleMapsDirectionsUrl(two));
  assert.equal(twoParams.get('origin'), null);
  assert.equal(twoParams.get('waypoints'), 'Hotel A, Address, Praha');
  assert.equal(twoParams.get('destination'), 'Hotel B, Address, Praha');
  assert.equal(twoParams.get('travelmode'), 'driving');
  const slash = ctx.googleMapsDirectionsUrl(['Na Poříčí 40/1, Prague', 'Hotel B, Prague']);
  const slashParams = directions(slash);
  assert.equal(slashParams.get('waypoints'), 'Na Poříčí 40/1, Praha');
  assert.equal(slash.includes('/dir//'), false);
  assert.equal(slash.split('waypoints=')[1].split('&')[0].includes('/'), false);
  const three = ['Hotel A, Address, Prague', 'Hotel B, Address, Prague', 'Hotel C, Address, Prague'];
  const threeParams = directions(ctx.googleMapsDirectionsUrl(three));
  assert.equal(threeParams.get('origin'), null);
  assert.equal(threeParams.get('waypoints'), 'Hotel A, Address, Praha|Hotel B, Address, Praha');
  assert.equal(threeParams.get('destination'), 'Hotel C, Address, Praha');
});

test('an address is used, otherwise the hotel name plus Prague', () => {
  const ctx = loadMaps();
  assert.equal(ctx.routePointForStop({ id: 'a', type: 'handover', hotelName: 'Hotel Axa', address: 'Na Poříčí 40, Prague' }), 'Na Poříčí 40, Praha');
  assert.equal(ctx.routePointForStop({ id: 'b', type: 'handover', hotelName: 'Hotel Axa' }), 'Hotel Axa, Praha');
  assert.equal(ctx.routePointForStop({ id: 'c', type: 'handover', hotelName: 'Hotel Prague Centre' }), 'Hotel Prague Centre');
  assert.equal(ctx.routeQueryText('', 'U Obecního dvora 7, Prague 1 – Staré Město, 110 00'), 'U Obecního dvora 7, Praha');
  assert.equal(ctx.routeQueryText('', 'Hotel Atlantic, Na Poříčí 9, Prague 1'), 'Hotel Atlantic, Na Poříčí 9, Praha');
  assert.equal(ctx.routePointForStop({ time: '08:00', travelMinutes: 105 }), '');
});

test('day one pick-ups become one Open in Maps link in time order', () => {
  const ctx = loadMaps();
  const day = {
    blocks: [
      { id: 'later', type: 'handover', handoverKind: 'pickup', placeKind: 'hotel', hotelName: 'U Obecního dvora', time: '07:40', title: 'Pick-up · U Obecního dvora' },
      { id: 'sooner', type: 'handover', handoverKind: 'pickup', placeKind: 'hotel', hotelName: 'Hotel Axa', address: 'Na Poříčí 40, Prague', time: '07:10', title: 'Pick-up · Hotel Axa' },
      { id: 'shop', type: 'shop', title: 'Vlad', time: '06:00' },
      { time: '07:00', travelMinutes: 85 },
    ],
  };
  const html = ctx.pragueRouteLinkHtml(day, 'pickup');
  assert.match(html, />Open in Maps \(all hotels\)</);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener"/);
  const href = html.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&');
  assert.match(html, /&amp;destination=/);
  assert.equal(href, ctx.googleMapsDirectionsUrl(['U Obecního dvora, Prague', 'Na Poříčí 40, Prague']));
  assert.equal(ctx.pragueRouteLinkHtml({ blocks: [] }, 'dropoff'), '');
  const combined = {
    blocks: [{
      id: 'combo',
      type: 'handover',
      handoverKind: 'pickup',
      hotelName: 'Hotel Axa',
      address: 'Na Poříčí 40, Prague',
      time: '08:00',
      title: 'Pick-up · 08:00 Hotel Axa · 08:05 U Obecního dvora',
      praguePickups: [
        { hotel: 'Hotel Axa', address: 'Na Poříčí 40, Prague', time: '08:00' },
        { hotel: 'U Obecního dvora', time: '08:05' },
      ],
    }],
  };
  const combinedHref = ctx.pragueRouteLinkHtml(combined, 'pickup').match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&');
  assert.equal(combinedHref, ctx.googleMapsDirectionsUrl(['U Obecního dvora, Prague', 'Na Poříčí 40, Prague']));
  const reversed = {
    blocks: [{
      id: 'combo',
      type: 'handover',
      handoverKind: 'dropoff',
      time: '18:00',
      title: 'Drop-off',
      praguePickups: [
        { hotel: 'Hotel B', address: 'Hotel B, Address, Prague', time: '18:05' },
        { hotel: 'Hotel A', address: 'Hotel A, Address, Prague', time: '18:00' },
      ],
    }],
  };
  const dropHref = ctx.pragueRouteLinkHtml(reversed, 'dropoff').match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&');
  const dropParams = directions(dropHref);
  assert.equal(dropParams.get('origin'), null);
  assert.equal(dropParams.get('waypoints'), 'Hotel A, Address, Praha');
  assert.equal(dropParams.get('destination'), 'Hotel B, Address, Praha');
});

test('booking 310 all-hotels link starts at the current location then both hotels', () => {
  const ctx = loadMaps();
  const obecni = 'U Obecního dvora 7, Prague 1 – Staré Město, 110 00';
  const atlantic = 'Hotel Atlantic, Na Poříčí 9, Prague 1';
  const day = {
    blocks: [{
      id: 'combo',
      type: 'handover',
      handoverKind: 'pickup',
      autoStop: 'prague-pickup',
      time: '08:00',
      hotelName: obecni,
      address: '',
      praguePickups: [
        { time: '08:00', hotel: obecni, address: '' },
        { time: '08:05', hotel: atlantic, address: '' },
      ],
    }],
  };
  const html = ctx.pragueRouteLinkHtml(day, 'pickup');
  const attr = html.match(/href="([^"]+)"/)[1];
  assert.equal(attr.includes('&destination='), false);
  const href = attr.replace(/&amp;/g, '&');
  const params = directions(href);
  assert.equal(params.get('origin'), null);
  assert.equal(params.get('waypoints'), 'U Obecního dvora 7, Praha');
  assert.equal(params.get('destination'), 'Hotel Atlantic, Na Poříčí 9, Praha');
  assert.equal(params.get('travelmode'), 'driving');
  assert.notEqual(href, ctx.googleMapsDirectionsUrl([obecni]));
  const lines = ctx.pragueHotelLinesHtml(day.blocks[0]);
  const individual = [...lines.matchAll(/href="([^"]+)"/g)].map(match => match[1].replace(/&amp;/g, '&'));
  assert.equal(individual.length, 2);
  individual.forEach(url => {
    const one = directions(url);
    assert.equal(one.get('origin'), null);
    assert.equal(one.get('waypoints'), null);
    assert.ok(one.get('destination'));
  });
  assert.equal(individual[0], ctx.googleMapsDirectionsUrl([obecni]));
  assert.equal(individual[1], ctx.googleMapsDirectionsUrl([atlantic]));
  assert.equal(individual.includes(href), false);
  const choice = ctx.praguePhoneChoices(day, 'pickup');
  assert.equal(choice.both, href);
  assert.equal(choice.all, href);
  assert.equal(choice.each.map(row => row.label).join('|'), 'U Obecního dvora 7, Praha|Hotel Atlantic, Na Poříčí 9, Praha');
  assert.equal(choice.each[0].href, individual[0]);
  assert.equal(choice.each[1].href, individual[1]);
  const josef = 'Hotel Josef, Rybná 20, Prague';
  day.blocks[0].praguePickups.push({ time: '08:10', hotel: josef, address: '' });
  const three = ctx.praguePhoneChoices(day, 'pickup');
  const bothParams = directions(three.both);
  const allParams = directions(three.all);
  assert.equal(bothParams.get('waypoints'), 'U Obecního dvora 7, Praha');
  assert.equal(bothParams.get('destination'), 'Hotel Atlantic, Na Poříčí 9, Praha');
  assert.equal(allParams.get('waypoints'), 'U Obecního dvora 7, Praha|Hotel Josef, Rybná 20, Praha');
  assert.equal(allParams.get('destination'), 'Hotel Atlantic, Na Poříčí 9, Praha');
  assert.equal(three.each.length, 3);
  assert.equal(new URL(three.each[2].href).searchParams.get('destination'), 'Hotel Josef, Rybná 20, Praha');
  assert.equal(new URL(three.each[2].href).searchParams.get('waypoints'), null);
});

test('the rough Prague pick-up block starts closed and keeps every navigation choice', () => {
  const ctx = loadMaps();
  const day = {
    blocks: [{
      id: 'combo',
      type: 'handover',
      handoverKind: 'pickup',
      autoStop: 'prague-pickup',
      time: '08:00',
      praguePickups: [
        { time: '08:00', hotel: 'U Obecního dvora 7, Prague 1' },
        { time: '08:05', hotel: 'Hotel Atlantic, Na Poříčí 9, Prague 1' },
      ],
    }],
  };
  const html = ctx.pragueChoicesNavHtml(day);
  assert.match(html, /<details class="prague-nav-fold">/);
  assert.equal(/<details[^>]*\sopen[\s>]/.test(html), false);
  assert.match(html, /Prague pick-up/);
  assert.match(html, /class="prague-nav-fold-place"/);
  assert.match(html, />Navigate to both</);
  assert.match(html, />Navigate to all hotels</);
  assert.match(html, /Navigate to each hotel separately/);
  assert.match(html, /data-phone-nav="both"/);
  assert.match(html, /data-phone-nav="all"/);
  assert.match(html, /data-phone-nav="one"/);
  assert.match(html, />U Obecního dvora 7, Praha</);
  assert.match(html, />Hotel Atlantic, Na Poříčí 9, Praha</);
  assert.match(plannerCss, /\.prague-nav-fold-summary \{[^}]*font-size:\s*12px/);
  assert.match(plannerCss, /\.rough-day \.prague-nav-fold \.phone-hotel-nav-link \{[^}]*font-size:\s*12px/);
  assert.match(plannerCss, /\.phone-week \.phone-hotel-nav-link \{[^}]*font-size:\s*16px/);
});
