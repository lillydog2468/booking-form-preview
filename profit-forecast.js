/*
 * 2027 group-size profit forecast for Keith's bead tours.
 * revenue = people × list price (or people − 0.5 when the leader pays half).
 * rooms = one single per person, plus Keith's room.
 * hotel = rooms × nights × the Park hotel rate.
 * fuel is per vehicle per week: £15 for the Tesla Model Y (2–4 people),
 * £100 for the Mercedes Vito (5–7). A 6-day tour uses the full week.
 * Any other length is weekly × days / 6, rounded up to a whole pound.
 * A typed what-if fuel figure replaces that amount. It is not saved.
 * profit = revenue − hotel − fuel.
 * Nothing here is stored. A price-book read, when signed in, is select-only.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ProfitForecast = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LENGTHS = [
    { key: 'day', days: 1, nights: 0, label: 'Day trip', price: 124 },
    { key: '2d1n', days: 2, nights: 1, label: '2 days, 1 night', price: 294 },
    { key: '3d2n', days: 3, nights: 2, label: '3 days, 2 nights', price: 412 },
    { key: '4d3n', days: 4, nights: 3, label: '4 days, 3 nights', price: 546 },
    { key: '5d4n', days: 5, nights: 4, label: '5 days, 4 nights', price: 690 },
    { key: '6d5n', days: 6, nights: 5, label: '6 days, 5 nights', price: 805 },
    { key: '7d6n', days: 7, nights: 6, label: '7 days, 6 nights', price: 925 }
  ];

  var USUAL_HOTEL_RATE = 41;
  var PEOPLE_MIN = 2;
  var PEOPLE_MAX = 7;

  function roundMoney(n) {
    var value = Number(n);
    if (!Number.isFinite(value)) return 0;
    var sign = value < 0 ? -1 : 1;
    var cents = Math.floor(Math.abs(value) * 100 + 0.5 + 1e-8);
    return sign * cents / 100;
  }

  function priceNumber(value) {
    if (value == null) return null;
    var s = String(value).trim().replace(/,/g, '').replace(/^£\s*/, '');
    if (!s || !/^\d+(\.\d+)?$/.test(s)) return null;
    var n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  var WEEK_DAYS = 6;
  var TESLA_FUEL_PER_WEEK = 15;
  var VITO_FUEL_PER_WEEK = 100;

  function weeklyFuel(people) {
    var n = Number(people);
    if (n >= 5 && n <= 7) return VITO_FUEL_PER_WEEK;
    return TESLA_FUEL_PER_WEEK;
  }

  function fuelFor(people, days) {
    var length = Number(days);
    if (!Number.isFinite(length) || length <= 0) length = WEEK_DAYS;
    var amount = weeklyFuel(people) * length;
    return Math.floor((amount + WEEK_DAYS - 1) / WEEK_DAYS);
  }

  function vehicleFor(people) {
    var n = Number(people);
    if (n >= 2 && n <= 4) return 'Tesla Model Y + luggage trailer';
    if (n >= 5 && n <= 7) return 'Mercedes Vito';
    return '';
  }

  function copyLengths() {
    return LENGTHS.map(function (row) {
      return { key: row.key, days: row.days, nights: row.nights, label: row.label, price: row.price };
    });
  }

  function findLength(lengths, days) {
    var list = lengths && lengths.length ? lengths : LENGTHS;
    for (var i = 0; i < list.length; i++) {
      if (list[i].days === Number(days)) return list[i];
    }
    return null;
  }

  /*
   * Read 2027 list prices and the Park hotel rate out of a tour_price_book
   * document. Missing fields stay on the hard-coded 2027 list.
   */
  function catalogueFromBook(book) {
    var lengths = copyLengths();
    var hotelRate = USUAL_HOTEL_RATE;
    var usedBook = false;
    if (book && typeof book === 'object') {
      var park = priceNumber(book.parkHotelPrice);
      if (park != null) {
        hotelRate = park;
        usedBook = true;
      }
      var year = book.years && book.years['2027'];
      if (year && typeof year === 'object') {
        var day = priceNumber(year.dayTrip);
        if (day != null) {
          lengths[0].price = day;
          usedBook = true;
        }
        var beading = year.beading && typeof year.beading === 'object' ? year.beading : {};
        lengths.forEach(function (row) {
          if (row.nights < 1) return;
          var price = priceNumber(beading[String(row.nights)]);
          if (price != null) {
            row.price = price;
            usedBook = true;
          }
        });
      }
    }
    return { lengths: lengths, hotelRate: hotelRate, usedBook: usedBook };
  }

  function forecast(options) {
    var opts = options || {};
    var people = Number(opts.people);
    var lengths = opts.lengths && opts.lengths.length ? opts.lengths : LENGTHS;
    var length = findLength(lengths, opts.days);
    if (!length) throw new Error('Unknown tour length');
    var price = opts.pricePerPerson == null ? length.price : Number(opts.pricePerPerson);
    var leader = !!opts.leaderHalfPrice;
    var payers = leader ? people - 0.5 : people;
    var revenue = roundMoney(payers * price);
    var keithRooms = opts.keithOwnRoom === false ? 0 : 1;
    var rooms = people + keithRooms;
    var hotelRate = opts.hotelRate == null ? USUAL_HOTEL_RATE : Number(opts.hotelRate);
    if (!Number.isFinite(hotelRate) || hotelRate < 0) hotelRate = 0;
    var hotel = roundMoney(rooms * length.nights * hotelRate);
    var fuel = opts.fuel == null ? fuelFor(people, length.days) : Number(opts.fuel);
    if (!Number.isFinite(fuel) || fuel < 0) fuel = 0;
    fuel = roundMoney(fuel);
    var profit = roundMoney(revenue - hotel - fuel);
    var profitPerPerson = people ? roundMoney(profit / people) : 0;
    return {
      people: people,
      days: length.days,
      nights: length.nights,
      label: length.label,
      pricePerPerson: price,
      leaderHalfPrice: leader,
      revenue: revenue,
      guestRooms: people,
      keithRooms: keithRooms,
      rooms: rooms,
      hotelRate: hotelRate,
      hotel: hotel,
      fuel: fuel,
      profit: profit,
      profitPerPerson: profitPerPerson,
      vehicle: vehicleFor(people)
    };
  }

  function formatPounds(amount) {
    var n = roundMoney(amount);
    var whole = Math.abs(n - Math.round(n)) < 0.001;
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2
    }).format(n);
  }

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function chartSvg(rows, currentPeople) {
    var width = 360;
    var rowH = 28;
    var head = 22;
    var gap = 16;
    var labelW = 18;
    var valueW = 78;
    var barMax = width - 16 - labelW - valueW;
    var blockH = head + rows.length * rowH;
    var height = blockH * 2 + gap;
    var parts = [];
    parts.push('<svg class="forecast-chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Profit and profit per person for groups of 2 to 7">');
    function block(title, key, y0) {
      var max = 0;
      rows.forEach(function (row) { if (row[key] > max) max = row[key]; });
      if (max <= 0) max = 1;
      parts.push('<text class="chart-title" x="8" y="' + (y0 + 14) + '">' + escapeXml(title) + '</text>');
      rows.forEach(function (row, i) {
        var y = y0 + head + i * rowH;
        var current = row.people === currentPeople;
        var barW = Math.max(2, Math.round((Math.max(row[key], 0) / max) * barMax));
        if (current) {
          parts.push('<rect class="chart-current" x="4" y="' + y + '" width="' + (width - 8) + '" height="' + (rowH - 4) + '" rx="6"></rect>');
        }
        parts.push('<text class="chart-size" x="8" y="' + (y + 16) + '">' + row.people + '</text>');
        parts.push('<rect class="chart-bar' + (current ? ' is-current' : '') + '" x="' + (8 + labelW) + '" y="' + (y + 5) + '" width="' + barW + '" height="14" rx="4"></rect>');
        parts.push('<text class="chart-value" x="' + (width - 8) + '" y="' + (y + 16) + '" text-anchor="end">' + escapeXml(formatPounds(row[key])) + '</text>');
      });
    }
    block('Profit', 'profit', 0);
    block('Profit per person', 'profitPerPerson', blockH + gap);
    parts.push('</svg>');
    return parts.join('');
  }

  function roomPhrase(row) {
    var guests = row.guestRooms === 1 ? '1 single' : row.guestRooms + ' singles';
    if (row.keithRooms) return row.rooms + ' rooms (' + guests + ' and Keith\u2019s room)';
    return row.rooms + (row.rooms === 1 ? ' room' : ' rooms') + ' (' + guests + ')';
  }

  function hotelPhrase(row) {
    if (!row.nights) return 'No nights, so the hotel cost is \u00a30';
    return row.rooms + ' \u00d7 ' + row.nights + (row.nights === 1 ? ' night' : ' nights') + ' \u00d7 ' + formatPounds(row.hotelRate);
  }

  function bind(doc) {
    var people = doc.getElementById('people');
    var peopleOut = doc.getElementById('peopleOut');
    var length = doc.getElementById('length');
    var leader = doc.getElementById('leader');
    var hotelInput = doc.getElementById('hotelRate');
    var fuelInput = doc.getElementById('fuel');
    var reset = doc.getElementById('resetCosts');
    var source = doc.getElementById('priceSource');
    var chart = doc.getElementById('chart');
    var fuelTouched = false;
    var hotelTouched = false;
    var state = catalogueFromBook(null);

    function fillLengths() {
      var selected = length.value || '6';
      length.innerHTML = '';
      state.lengths.forEach(function (row) {
        var opt = doc.createElement('option');
        opt.value = String(row.days);
        opt.textContent = row.label + ' \u2014 ' + formatPounds(row.price) + ' a person';
        if (String(row.days) === selected) opt.selected = true;
        length.appendChild(opt);
      });
    }

    function fuelLine(row, touched) {
      var weekly = formatPounds(weeklyFuel(row.people));
      var vehicle = row.vehicle || 'Vehicle';
      if (touched) return vehicle + '. Typed in for this what-if. Not saved.';
      if (row.days === WEEK_DAYS) return vehicle + '. ' + weekly + ' for the week.';
      var dayWord = row.days === 1 ? 'day' : 'days';
      return vehicle + '. ' + weekly + ' a week, scaled to ' + row.days + ' ' + dayWord + '.';
    }

    function currentFuel() {
      if (!fuelTouched) return fuelFor(Number(people.value), Number(length.value));
      var n = Number(fuelInput.value);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }

    function currentHotel() {
      var n = Number(hotelInput.value);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }

    function paint() {
      var count = Number(people.value);
      peopleOut.textContent = String(count);
      people.setAttribute('aria-valuenow', String(count));
      people.setAttribute('aria-valuetext', count + ' people');
      var days = Number(length.value);
      if (!fuelTouched) fuelInput.value = String(fuelFor(count, days));
      var hotelRate = currentHotel();
      var fuelNow = currentFuel();
      var row = forecast({
        people: count,
        days: days,
        leaderHalfPrice: leader.checked,
        hotelRate: hotelRate,
        fuel: fuelNow,
        lengths: state.lengths
      });
      var series = [];
      for (var n = PEOPLE_MIN; n <= PEOPLE_MAX; n++) {
        series.push(forecast({
          people: n,
          days: days,
          leaderHalfPrice: leader.checked,
          hotelRate: hotelRate,
          fuel: fuelTouched ? fuelNow : fuelFor(n, days),
          lengths: state.lengths
        }));
      }
      doc.getElementById('revenue').textContent = formatPounds(row.revenue);
      doc.getElementById('revenueDetail').textContent = leader.checked
        ? (row.people + ' people, one at half price, \u00d7 ' + formatPounds(row.pricePerPerson))
        : (row.people + ' \u00d7 ' + formatPounds(row.pricePerPerson));
      doc.getElementById('rooms').textContent = String(row.rooms);
      doc.getElementById('roomsDetail').textContent = roomPhrase(row);
      doc.getElementById('hotel').textContent = formatPounds(row.hotel);
      doc.getElementById('hotelDetail').textContent = hotelPhrase(row);
      doc.getElementById('fuelOut').textContent = formatPounds(row.fuel);
      doc.getElementById('fuelDetail').textContent = fuelLine(row, fuelTouched);
      doc.getElementById('profit').textContent = formatPounds(row.profit);
      doc.getElementById('profitEach').textContent = formatPounds(row.profitPerPerson);
      doc.getElementById('vehicle').textContent = row.vehicle;
      doc.getElementById('vehicleDetail').textContent = row.people <= 4
        ? 'Up to 4 guests, plus Keith'
        : '5 to 7 guests, plus Keith';
      chart.innerHTML = chartSvg(series, count);
    }

    people.addEventListener('input', paint);
    length.addEventListener('change', paint);
    leader.addEventListener('change', paint);
    hotelInput.addEventListener('input', function () {
      hotelTouched = true;
      paint();
    });
    fuelInput.addEventListener('input', function () {
      fuelTouched = true;
      paint();
    });
    reset.addEventListener('click', function () {
      fuelTouched = false;
      hotelTouched = false;
      hotelInput.value = String(state.hotelRate);
      fuelInput.value = String(fuelFor(Number(people.value), Number(length.value) || WEEK_DAYS));
      paint();
    });

    fillLengths();
    hotelInput.value = String(state.hotelRate);
    fuelInput.value = String(fuelFor(Number(people.value), Number(length.value) || WEEK_DAYS));
    paint();

    function applyBook(book) {
      state = catalogueFromBook(book);
      fillLengths();
      if (!hotelTouched) hotelInput.value = String(state.hotelRate);
      if (source) {
        source.textContent = state.usedBook
          ? '2027 prices read from the price book. What-if figures stay on this screen.'
          : '2027 list prices. What-if figures stay on this screen.';
      }
      paint();
    }

    if (source) source.textContent = '2027 list prices. What-if figures stay on this screen.';

    function loadBook(client) {
      if (!client || !client.from) return Promise.resolve(null);
      return client.from('tour_price_book').select('book').eq('id', 'main').maybeSingle().then(function (res) {
        if (!res || res.error || !res.data || !res.data.book) {
          applyBook(null);
          return null;
        }
        applyBook(res.data.book);
        return res.data.book;
      }).catch(function () {
        applyBook(null);
        return null;
      });
    }

    return { paint: paint, applyBook: applyBook, loadBook: loadBook };
  }

  return {
    LENGTHS: LENGTHS,
    USUAL_HOTEL_RATE: USUAL_HOTEL_RATE,
    fuelFor: fuelFor,
    vehicleFor: vehicleFor,
    roundMoney: roundMoney,
    formatPounds: formatPounds,
    forecast: forecast,
    catalogueFromBook: catalogueFromBook,
    chartSvg: chartSvg,
    bind: bind
  };
});
