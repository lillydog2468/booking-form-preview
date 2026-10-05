/**
 * Tax summary figures for one row per tour.
 * Costs, profit and total cost come from totalexpenses, totalprofit and
 * totalcost when those columns are filled in. They are worked out from the
 * parts only when the column is blank, and the row says so.
 * Currency flags use the *_currency columns. Nothing is converted.
 *
 * bookings.status is used when that column is present on the row.
 * Otherwise taxSummaryExclusion falls back to BUILTIN_BOOKING_STATUS.
 * This page reads the bookings table. Planner-only plans are not part of the tax figures.
 */
(function (root) {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function str(v) {
    return v == null ? '' : String(v);
  }

  function numOrNull(v) {
    if (v == null) return null;
    if (typeof v === 'string' && v.trim() === '') return null;
    var n = typeof v === 'number' ? v : Number(str(v).trim());
    return Number.isFinite(n) ? n : null;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function isoDate(y, m, d) {
    return String(y) + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  function dateParts(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(iso).trim());
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), iso: m[1] + '-' + m[2] + '-' + m[3] };
  }

  /** Every recorded amount is shown and totalled in pounds. The number is not converted. */
  function currencyCode() {
    return 'GBP';
  }

  function formatDMY(iso) {
    var p = dateParts(iso);
    if (!p) return '';
    return String(p.d).padStart(2, '0') + '/' + String(p.m).padStart(2, '0') + '/' + p.y;
  }

  function formatPretty(iso) {
    var p = dateParts(iso);
    if (!p) return '';
    return p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y;
  }

  function formatAmount(amount) {
    var n = Number(amount);
    if (!Number.isFinite(n)) return 'missing';
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(n);
  }

  function extrasOf(booking) {
    if (!root.BookingExtras) return null;
    var split = root.BookingExtras.splitNotesAndExtras(booking && booking.extra_notes);
    return split && split.extras ? split.extras : null;
  }

  function organiserName(booking, extras) {
    var fromExtras = root.BookingExtras ? root.BookingExtras.organiserFullName(extras) : '';
    if (fromExtras) return fromExtras;
    var first = str(booking && booking.organiser_first_name).trim();
    var last = str(booking && booking.organiser_last_name).trim();
    return [first, last].filter(Boolean).join(' ');
  }

  function arrivalIso(booking) {
    var p = dateParts(booking && booking.tour_arrival_date);
    return p ? p.iso : '';
  }

  function departureIso(booking) {
    var p = dateParts(booking && booking.departure_date);
    return p ? p.iso : '';
  }

  /**
   * Used when bookings.status is missing or blank.
   * Companions 254 and 255 belong to 253, 260 to 259, 263 to 262.
   */
  var BUILTIN_BOOKING_STATUS = {
    137: 'cancelled',
    141: 'cancelled',
    138: 'unconfirmed',
    139: 'unconfirmed',
    165: 'duplicate',
    205: 'duplicate',
    207: 'duplicate',
    243: 'duplicate',
    254: 'companion',
    255: 'companion',
    260: 'companion',
    263: 'companion'
  };
  var COMPANION_PARENT = { 254: 253, 255: 253, 260: 259, 263: 262 };
  var KNOWN_STATUS = { cancelled: 1, unconfirmed: 1, duplicate: 1, companion: 1 };

  function columnStatus(booking) {
    if (!booking || !Object.prototype.hasOwnProperty.call(booking, 'status')) return '';
    var value = str(booking.status).trim().toLowerCase();
    return KNOWN_STATUS[value] ? value : '';
  }

  /**
   * One place that decides cancelled, unconfirmed, duplicate and companion.
   * A filled-in bookings.status wins. Otherwise the built-in id list is used.
   * Returns { role, hide, grey, reason, parentId }.
   */
  function taxSummaryExclusion(booking) {
    var fromColumn = columnStatus(booking);
    var idNum = Number(booking && booking.id);
    var status = fromColumn || BUILTIN_BOOKING_STATUS[idNum] || '';
    if (status === 'cancelled') return { role: 'cancelled', hide: true, grey: false, reason: 'cancelled', parentId: null };
    if (status === 'duplicate') return { role: 'duplicate', hide: true, grey: false, reason: 'duplicate', parentId: null };
    if (status === 'unconfirmed') return { role: 'unconfirmed', hide: false, grey: true, reason: 'unconfirmed', parentId: null };
    if (status === 'companion') {
      return { role: 'companion', hide: false, grey: true, reason: 'companion', parentId: COMPANION_PARENT[idNum] || null };
    }
    return { role: 'include', hide: false, grey: false, reason: '', parentId: null };
  }

  function mostRecentCompleteTaxYear(today) {
    var y = today.getFullYear();
    var m = today.getMonth() + 1;
    var d = today.getDate();
    var endYear = (m < 4 || (m === 4 && d <= 5)) ? y - 1 : y;
    var start = isoDate(endYear - 1, 4, 6);
    var end = isoDate(endYear, 4, 5);
    return { mode: 'tax', start: start, end: end, label: formatPretty(start) + ' – ' + formatPretty(end) };
  }

  function mostRecentCompleteCalendarYear(today) {
    var y = today.getFullYear() - 1;
    var start = isoDate(y, 1, 1);
    var end = isoDate(y, 12, 31);
    return { mode: 'calendar', start: start, end: end, label: formatPretty(start) + ' – ' + formatPretty(end) };
  }

  function taxYearContaining(iso) {
    var p = dateParts(iso);
    if (!p) return null;
    var endYear = (p.m > 4 || (p.m === 4 && p.d >= 6)) ? p.y + 1 : p.y;
    var start = isoDate(endYear - 1, 4, 6);
    var end = isoDate(endYear, 4, 5);
    return { mode: 'tax', start: start, end: end, label: formatPretty(start) + ' – ' + formatPretty(end) };
  }

  function calendarYearContaining(iso) {
    var p = dateParts(iso);
    if (!p) return null;
    var start = isoDate(p.y, 1, 1);
    var end = isoDate(p.y, 12, 31);
    return { mode: 'calendar', start: start, end: end, label: formatPretty(start) + ' – ' + formatPretty(end) };
  }

  function currentTaxYear(today) {
    return taxYearContaining(isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate()));
  }

  function currentCalendarYear(today) {
    return calendarYearContaining(isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate()));
  }

  function periodOptions(mode, bookings, today) {
    var map = {};
    function add(period) {
      if (!period) return;
      map[period.start + '|' + period.end] = period;
    }
    (bookings || []).forEach(function (b) {
      var iso = arrivalIso(b);
      if (!iso) return;
      add(mode === 'calendar' ? calendarYearContaining(iso) : taxYearContaining(iso));
    });
    if (mode === 'calendar') {
      add(mostRecentCompleteCalendarYear(today));
      add(currentCalendarYear(today));
    } else {
      add(mostRecentCompleteTaxYear(today));
      add(currentTaxYear(today));
    }
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      return a.start < b.start ? 1 : a.start > b.start ? -1 : 0;
    });
  }

  function defaultPeriod(mode, today) {
    return mode === 'calendar' ? mostRecentCompleteCalendarYear(today) : mostRecentCompleteTaxYear(today);
  }

  function recordedAmount(value, currency) {
    var n = numOrNull(value);
    if (n == null) return { state: 'missing' };
    return { state: 'recorded', amount: round2(n), currency: currencyCode(currency) };
  }

  function sumExpenseBucket(rows) {
    if (!rows.length) return { state: 'missing' };
    var byCur = {};
    for (var i = 0; i < rows.length; i++) {
      var n = numOrNull(rows[i].cost);
      if (n == null) return { state: 'missing' };
      var cur = currencyCode(rows[i].currency);
      byCur[cur] = round2((byCur[cur] || 0) + n);
    }
    var curs = Object.keys(byCur);
    if (curs.length === 1) {
      return { state: 'recorded', amount: byCur[curs[0]], currency: curs[0] };
    }
    return {
      state: 'mixed',
      parts: curs.map(function (c) { return { amount: byCur[c], currency: c }; })
    };
  }

  function isHotelExpense(row) {
    if (!row) return false;
    if (row.hotel_id != null && str(row.hotel_id).trim() !== '') return true;
    return str(row.custom_hotel_name).trim() !== '';
  }

  function isOtherExpense(row) {
    return !isHotelExpense(row) && str(row.description).trim() !== '';
  }

  function incomeOf(booking, extras) {
    var total = numOrNull(booking.beading_tour_price);
    if (total != null) {
      return { state: 'recorded', amount: round2(total), currency: currencyCode(booking.beading_tour_price_currency), source: 'total' };
    }
    var price = numOrNull(booking.price_per_person);
    var people = numOrNull(booking.no_people);
    if (price != null && people != null) {
      return { state: 'recorded', amount: round2(price * people), currency: currencyCode(booking.price_per_person_currency), source: 'price × people' };
    }
    var money = extras && extras.money ? extras.money : null;
    var notesTotal = numOrNull(money && money.total);
    if (notesTotal != null) {
      return { state: 'recorded', amount: round2(notesTotal), currency: 'GBP', source: 'notes total' };
    }
    var notesPrice = numOrNull(money && money.pricePerPerson);
    var head = numOrNull(extras && extras.headcount);
    if (head == null) head = people;
    if (notesPrice != null && head != null) {
      return { state: 'recorded', amount: round2(notesPrice * head), currency: 'GBP', source: 'notes price × people' };
    }
    return { state: 'missing' };
  }

  function depositOf(booking, extras) {
    var recorded = numOrNull(booking.depositmade);
    if (recorded != null) {
      return { state: 'recorded', amount: round2(recorded), currency: currencyCode(booking.depositmade_currency) };
    }
    var fromNotes = numOrNull(extras && extras.money && extras.money.depositAmount);
    if (fromNotes != null) return { state: 'recorded', amount: round2(fromNotes), currency: 'GBP' };
    return { state: 'missing' };
  }

  function leftToPayOf(booking, extras) {
    var price = numOrNull(booking.beading_tour_price);
    var deposit = numOrNull(booking.depositmade);
    var finalPay = numOrNull(booking.finalpayment);
    var stored = numOrNull(booking.left_to_pay);
    if (price == null && deposit == null && finalPay == null) {
      var fromNotes = numOrNull(extras && extras.money && extras.money.balance);
      if (fromNotes == null) return { state: 'missing' };
      return { state: 'recorded', amount: round2(fromNotes), currency: 'GBP' };
    }
    if (stored == null) return { state: 'missing' };
    var curs = [];
    if (price != null) curs.push(currencyCode(booking.beading_tour_price_currency));
    if (deposit != null) curs.push(currencyCode(booking.depositmade_currency));
    if (finalPay != null) curs.push(currencyCode(booking.finalpayment_currency));
    var distinct = curs.filter(function (c, i) { return curs.indexOf(c) === i; });
    if (distinct.length > 1) return { state: 'mixed' };
    return { state: 'recorded', amount: round2(stored), currency: distinct[0] || 'GBP' };
  }

  function noteCurrencies() {
    return [];
  }

  var CURRENCY_PAIRS = [
    ['price_per_person', 'price_per_person_currency'],
    ['beading_tour_price', 'beading_tour_price_currency'],
    ['fuelcost', 'fuelcost_currency'],
    ['depositmade', 'depositmade_currency'],
    ['finalpayment', 'finalpayment_currency']
  ];

  function distinct(list) {
    return list.filter(function (c, i) { return list.indexOf(c) === i; });
  }

  /** Amounts are always treated as pounds. The stored number is left as it is. */
  function recordedCurrencyCodes(booking, expenseRows) {
    var codes = [];
    CURRENCY_PAIRS.forEach(function (pair) {
      if (numOrNull(booking[pair[0]]) == null) return;
      codes.push(currencyCode(booking[pair[1]]));
    });
    (expenseRows || []).forEach(function (row) {
      if (numOrNull(row.cost) == null) return;
      codes.push(currencyCode(row.currency));
    });
    return distinct(codes);
  }

  function singleCurrency(codes) {
    if (!codes.length) return 'GBP';
    if (codes.length === 1) return codes[0];
    return 'mixed';
  }

  function foreignFlags(codes) {
    return codes.filter(function (c) { return c && c !== 'GBP'; });
  }

  function hasNonZeroMoney(booking, expenseRows) {
    var fields = ['price_per_person', 'beading_tour_price', 'fuelcost', 'depositmade', 'finalpayment', 'left_to_pay', 'totalexpenses', 'totalprofit', 'totalcost'];
    for (var i = 0; i < fields.length; i++) {
      var n = numOrNull(booking[fields[i]]);
      if (n != null && n !== 0) return true;
    }
    return (expenseRows || []).some(function (row) {
      var cost = numOrNull(row.cost);
      return cost != null && cost !== 0;
    });
  }

  function partsCosts(booking, expenseRows) {
    var fuel = recordedAmount(booking.fuelcost, booking.fuelcost_currency);
    var hotels = sumExpenseBucket((expenseRows || []).filter(isHotelExpense));
    var other = sumExpenseBucket((expenseRows || []).filter(isOtherExpense));
    var buckets = [fuel, hotels, other];
    var base = { fuel: fuel, hotels: hotels, other: other, source: 'parts' };
    if (buckets.every(function (b) { return b.state === 'missing'; })) {
      base.state = 'missing';
      return base;
    }
    if (buckets.some(function (b) { return b.state !== 'recorded'; })) {
      base.state = 'incomplete';
      return base;
    }
    var codes = distinct(buckets.map(function (b) { return b.currency; }));
    if (codes.length > 1) {
      base.state = 'mixed';
      base.currency = 'mixed';
      return base;
    }
    base.state = 'recorded';
    base.amount = round2(fuel.amount + hotels.amount + other.amount);
    base.currency = codes[0];
    return base;
  }

  function costsOf(booking, expenseRows) {
    var stored = numOrNull(booking.totalexpenses);
    if (stored != null) {
      var currency = singleCurrency(recordedCurrencyCodes(booking, expenseRows));
      return {
        state: 'recorded',
        amount: round2(stored),
        currency: currency,
        source: 'stored',
        fuel: recordedAmount(booking.fuelcost, booking.fuelcost_currency),
        hotels: sumExpenseBucket((expenseRows || []).filter(isHotelExpense)),
        other: sumExpenseBucket((expenseRows || []).filter(isOtherExpense))
      };
    }
    return partsCosts(booking, expenseRows);
  }

  function profitOf(booking, costs, expenseRows) {
    var stored = numOrNull(booking.totalprofit);
    if (stored != null) {
      return {
        state: 'recorded',
        amount: round2(stored),
        currency: singleCurrency(recordedCurrencyCodes(booking, expenseRows)),
        source: 'stored'
      };
    }
    if (!costs || costs.state !== 'recorded' || !costs.currency || costs.currency === 'mixed') {
      return { state: 'incomplete', source: 'parts' };
    }
    var deposit = numOrNull(booking.depositmade);
    var finalPay = numOrNull(booking.finalpayment);
    if (deposit == null && finalPay == null) return { state: 'incomplete', source: 'parts' };
    var payCodes = [];
    if (deposit != null) payCodes.push(currencyCode(booking.depositmade_currency));
    if (finalPay != null) payCodes.push(currencyCode(booking.finalpayment_currency));
    var payCurrency = singleCurrency(distinct(payCodes));
    if (payCurrency === 'mixed' || payCurrency !== costs.currency) {
      return { state: 'incomplete', source: 'parts' };
    }
    var payments = (deposit == null ? 0 : deposit) + (finalPay == null ? 0 : finalPay);
    return {
      state: 'recorded',
      amount: round2(payments - costs.amount),
      currency: costs.currency,
      source: 'parts'
    };
  }

  function totalCostOf(booking, income, costs, expenseRows) {
    var stored = numOrNull(booking.totalcost);
    if (stored != null) {
      return {
        state: 'recorded',
        amount: round2(stored),
        currency: singleCurrency(recordedCurrencyCodes(booking, expenseRows)),
        source: 'stored'
      };
    }
    if (income && costs && income.state === 'recorded' && costs.state === 'recorded' && income.currency && income.currency === costs.currency && income.currency !== 'mixed') {
      return {
        state: 'recorded',
        amount: round2(income.amount + costs.amount),
        currency: income.currency,
        source: 'parts'
      };
    }
    return { state: 'missing', source: 'parts' };
  }

  function datesLabel(booking) {
    var a = arrivalIso(booking);
    var d = departureIso(booking);
    if (a && d && d !== a) return formatDMY(a) + ' – ' + formatDMY(d);
    if (a) return formatDMY(a);
    return 'missing';
  }

  function rowFrom(booking, extras, expenseRows, decision) {
    var costs = costsOf(booking, expenseRows);
    var income = incomeOf(booking, extras);
    var profit = profitOf(booking, costs, expenseRows);
    var totalCost = totalCostOf(booking, income, costs, expenseRows);
    var ownMoney = hasNonZeroMoney(booking, expenseRows);
    var includeInTotals = decision.role === 'unconfirmed'
      ? false
      : decision.role === 'companion'
        ? ownMoney
        : true;
    var row = {
      id: booking.id,
      role: decision.role,
      grey: !!decision.grey,
      parentId: decision.parentId,
      includeInTotals: includeInTotals,
      companionMoney: decision.role === 'companion' && ownMoney,
      datesLabel: datesLabel(booking),
      organiser: organiserName(booking, extras),
      group: str(booking.group_name).trim(),
      income: income,
      deposit: depositOf(booking, extras),
      leftToPay: leftToPayOf(booking, extras),
      costs: costs,
      fuel: costs.fuel || { state: 'missing' },
      hotels: costs.hotels || { state: 'missing' },
      other: costs.other || { state: 'missing' },
      profit: profit,
      totalCost: totalCost,
      flags: foreignFlags(recordedCurrencyCodes(booking, expenseRows)),
      noteFlags: noteCurrencies(extras)
    };
    return row;
  }

  function emptyMoney() {
    return {
      income: 0,
      fuel: 0,
      hotels: 0,
      other: 0,
      costs: 0,
      profit: 0,
      profitTours: 0,
      deposits: 0,
      left: 0,
      hasIncome: false,
      hasCosts: false,
      hasAny: false
    };
  }

  function addPart(bag, currency, field, amount) {
    if (!bag[currency]) bag[currency] = emptyMoney();
    bag[currency][field] = round2(bag[currency][field] + amount);
    if (field === 'income') bag[currency].hasIncome = true;
    if (field === 'costs') bag[currency].hasCosts = true;
    bag[currency].hasAny = true;
  }

  function addFigure(bag, figure, field) {
    if (!figure || figure.state !== 'recorded') return false;
    if (!figure.currency || figure.currency === 'mixed') return false;
    addPart(bag, figure.currency, field, figure.amount);
    return true;
  }

  function totalsFrom(rows) {
    var by = {};
    var incomeMissing = 0;
    var costsMissing = 0;
    var mixedMoney = 0;
    var profitIncomplete = 0;
    var included = 0;
    rows.forEach(function (row) {
      if (!row.includeInTotals) return;
      included += 1;
      if (row.income && row.income.state === 'recorded' && row.income.currency !== 'mixed') addFigure(by, row.income, 'income');
      else incomeMissing += 1;
      if (row.costs && row.costs.state === 'recorded' && row.costs.currency && row.costs.currency !== 'mixed') addFigure(by, row.costs, 'costs');
      else if (row.costs && row.costs.currency === 'mixed') mixedMoney += 1;
      else costsMissing += 1;
      if (row.deposit && row.deposit.state === 'recorded' && row.deposit.currency && row.deposit.currency !== 'mixed') {
        addPart(by, row.deposit.currency, 'deposits', row.deposit.amount);
      }
      if (row.leftToPay && row.leftToPay.state === 'recorded' && row.leftToPay.currency && row.leftToPay.currency !== 'mixed') {
        addPart(by, row.leftToPay.currency, 'left', row.leftToPay.amount);
      }
      if (row.profit && row.profit.state === 'recorded' && row.profit.currency && row.profit.currency !== 'mixed' && addFigure(by, row.profit, 'profit')) {
        by[row.profit.currency].profitTours += 1;
      } else profitIncomplete += 1;
    });
    return {
      byCurrency: by,
      incomeMissing: incomeMissing,
      costsMissing: costsMissing,
      mixedMoney: mixedMoney,
      profitIncomplete: profitIncomplete,
      tourCount: rows.length,
      includedCount: included
    };
  }

  function buildTaxSummary(bookings, expenses, period) {
    var list = Array.isArray(bookings) ? bookings : [];
    var exps = Array.isArray(expenses) ? expenses : [];
    var byBooking = {};
    exps.forEach(function (e) {
      var id = str(e.booking_id);
      if (!byBooking[id]) byBooking[id] = [];
      byBooking[id].push(e);
    });

    var excluded = [];
    var visible = [];
    var byId = {};
    list.forEach(function (booking) { byId[str(booking.id)] = booking; });
    list.forEach(function (booking) {
      var extras = extrasOf(booking);
      var decision = taxSummaryExclusion(booking);
      if (decision.hide) {
        excluded.push({
          id: booking.id,
          name: str(booking.group_name).trim(),
          reason: decision.reason
        });
        return;
      }
      visible.push({ booking: booking, extras: extras, decision: decision });
    });

    var missingArrival = visible.filter(function (x) { return !arrivalIso(x.booking); }).length;
    var start = period.start;
    var end = period.end;
    var inPeriod = visible.filter(function (x) {
      var iso = arrivalIso(x.booking);
      return iso && iso >= start && iso <= end;
    });
    inPeriod.sort(function (a, b) {
      var da = arrivalIso(a.booking);
      var db = arrivalIso(b.booking);
      if (da < db) return -1;
      if (da > db) return 1;
      return Number(a.booking.id) - Number(b.booking.id);
    });

    var inPeriodIds = {};
    inPeriod.forEach(function (x) { inPeriodIds[str(x.booking.id)] = x; });
    var seen = {};
    var ordered = [];
    function take(item) {
      var id = str(item.booking.id);
      if (seen[id]) return;
      seen[id] = true;
      ordered.push(item);
      inPeriod.forEach(function (other) {
        if (other.decision.parentId != null && str(other.decision.parentId) === id) take(other);
      });
    }
    inPeriod.forEach(function (item) {
      var parentId = item.decision.parentId;
      if (item.decision.role === 'companion' && parentId != null && inPeriodIds[str(parentId)]) return;
      take(item);
    });

    var reasonCounts = {};
    excluded.forEach(function (e) {
      reasonCounts[e.reason] = (reasonCounts[e.reason] || 0) + 1;
    });
    excluded.sort(function (a, b) { return Number(a.id) - Number(b.id); });

    var rows = ordered.map(function (x) {
      var row = rowFrom(x.booking, x.extras, byBooking[str(x.booking.id)] || [], x.decision);
      if (row.parentId != null) {
        var parent = byId[str(row.parentId)];
        row.parentLabel = parent && str(parent.group_name).trim()
          ? str(parent.group_name).trim()
          : ('booking ' + row.parentId);
      }
      return row;
    });

    return {
      rows: rows,
      totals: totalsFrom(rows),
      excludedRows: excluded,
      excludedCount: excluded.length,
      excludedByReason: reasonCounts,
      missingArrival: missingArrival,
      period: period
    };
  }

  function bucketCsv(bucket) {
    if (!bucket || bucket.state === 'missing') return { amount: 'missing', currency: '' };
    if (bucket.state === 'mixed') {
      return {
        amount: bucket.parts.map(function (p) { return p.amount.toFixed(2); }).join('; '),
        currency: bucket.parts.map(function (p) { return p.currency; }).join('; ')
      };
    }
    if (bucket.state === 'incomplete') return { amount: 'incomplete', currency: '' };
    return { amount: Number(bucket.amount).toFixed(2), currency: bucket.currency || '' };
  }

  function csvCell(value) {
    var s = value == null ? '' : String(value);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function csvForSummary(summary) {
    var headers = [
      'Tour dates', 'Organiser', 'Group', 'Status',
      'Income', 'Income currency',
      'Deposit', 'Deposit currency',
      'Left to pay', 'Left to pay currency',
      'Costs', 'Costs currency', 'Costs source',
      'Profit', 'Profit currency', 'Profit source',
      'Total cost', 'Total cost currency', 'Total cost source',
      'In totals', 'Currency flag', 'Currency note', 'Row note'
    ];
    var lines = [headers.map(csvCell).join(',')];
    (summary.rows || []).forEach(function (row) {
      var income = bucketCsv(row.income);
      var deposit = bucketCsv(row.deposit);
      var left = row.leftToPay && row.leftToPay.state === 'mixed'
        ? { amount: 'mixed', currency: '' }
        : bucketCsv(row.leftToPay);
      var costs = bucketCsv(row.costs);
      var profit = row.profit && row.profit.state === 'recorded'
        ? { amount: Number(row.profit.amount).toFixed(2), currency: row.profit.currency === 'mixed' ? 'mixed' : row.profit.currency }
        : { amount: 'incomplete', currency: '' };
      var totalCost = bucketCsv(row.totalCost);
      var notes = [];
      if (row.costs && row.costs.source === 'parts' && row.costs.state === 'recorded') notes.push('Costs worked out from fuel, hotels and other costs.');
      if (row.profit && row.profit.source === 'parts' && row.profit.state === 'recorded') notes.push('Profit worked out from recorded payments minus expenses.');
      if (row.totalCost && row.totalCost.source === 'parts' && row.totalCost.state === 'recorded') notes.push('Total cost worked out from the tour price plus expenses.');
      if (row.companionMoney) notes.push('check: companion with own money');
      var cells = [
        row.datesLabel,
        row.organiser || 'missing',
        row.group || 'missing',
        row.role === 'include' ? '' : row.role,
        income.amount, income.currency,
        deposit.amount, deposit.currency,
        left.amount, left.currency,
        costs.amount, costs.currency, row.costs && row.costs.source || '',
        profit.amount, profit.currency, row.profit && row.profit.source || '',
        totalCost.amount, totalCost.currency, row.totalCost && row.totalCost.source || '',
        row.includeInTotals ? 'yes' : 'no',
        (row.flags || []).join(' '),
        (row.noteFlags || []).join(' '),
        notes.join(' ')
      ];
      lines.push(cells.map(csvCell).join(','));
    });

    lines.push('');
    lines.push(['Totals', summary.period ? summary.period.label : ''].map(csvCell).join(','));
    var currencies = Object.keys(summary.totals.byCurrency);
    if (currencies.indexOf('GBP') === -1) currencies.unshift('GBP');
    currencies.forEach(function (cur) {
      var bag = summary.totals.byCurrency[cur] || emptyMoney();
      var profitStatus = summary.totals.profitIncomplete ? 'incomplete' : 'complete';
      lines.push([
        'Total ' + cur,
        '', '', '',
        bag.hasIncome ? bag.income.toFixed(2) : '',
        cur,
        bag.hasAny ? bag.deposits.toFixed(2) : '',
        cur,
        bag.hasAny ? bag.left.toFixed(2) : '',
        cur,
        bag.hasCosts ? bag.costs.toFixed(2) : '',
        cur,
        'stored or worked out',
        bag.profitTours ? bag.profit.toFixed(2) : '',
        cur,
        profitStatus,
        '', '', '',
        '', '', '', ''
      ].map(csvCell).join(','));
    });
    lines.push('');
    lines.push(['Excluded rows', 'Id', 'Name', 'Reason'].map(csvCell).join(','));
    (summary.excludedRows || []).forEach(function (row) {
      lines.push(['', row.id, row.name || 'missing', row.reason].map(csvCell).join(','));
    });
    return lines.join('\r\n');
  }

  function exclusionCountLabel(summary) {
    var n = summary.excludedCount || 0;
    var noun = n === 1 ? 'booking' : 'bookings';
    var reasons = summary.excludedByReason || {};
    var parts = Object.keys(reasons).sort().map(function (reason) {
      return reasons[reason] + ' ' + reason;
    });
    if (!parts.length) return 'Excluded bookings: 0';
    return 'Excluded bookings: ' + n + ' ' + noun + ' (' + parts.join(', ') + ')';
  }

  root.TaxSummary = {
    BUILTIN_BOOKING_STATUS: BUILTIN_BOOKING_STATUS,
    COMPANION_PARENT: COMPANION_PARENT,
    taxSummaryExclusion: taxSummaryExclusion,
    mostRecentCompleteTaxYear: mostRecentCompleteTaxYear,
    mostRecentCompleteCalendarYear: mostRecentCompleteCalendarYear,
    periodOptions: periodOptions,
    defaultPeriod: defaultPeriod,
    buildTaxSummary: buildTaxSummary,
    csvForSummary: csvForSummary,
    formatAmount: formatAmount,
    formatDMY: formatDMY,
    exclusionCountLabel: exclusionCountLabel,
    currencyCode: currencyCode
  };
})(typeof window !== 'undefined' ? window : globalThis);
