/*
 * Shared DD/MM/YYYY and pound formatting.
 *
 * The form, hotels list and analytics accept an exact YYYY-MM-DD day and
 * let an impossible day such as 31 February overflow. The planner also
 * accepts a date prefix and rejects a day that is not on the calendar.
 * Empty planner dates show an em dash. Those differences stay.
 * Amounts are pounds only.
 */
(function (root) {
  'use strict';

  var DEFAULT_CURRENCY = 'GBP';

  function normalizeCurrency() {
    return DEFAULT_CURRENCY;
  }

  function formatMoney(amount) {
    var n = Number(amount);
    var value = Number.isFinite(n) ? n : 0;
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  function currencyMarkHTML() {
    return '<span class="currency-fixed" aria-hidden="true">£</span>';
  }

  function parseISODateUTC(iso) {
    if (!iso) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
    if (!m) return null;
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
    return new Date(Date.UTC(y, mo - 1, d));
  }

  function parseISODateUTCPlanner(iso) {
    if (!iso) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (!m) return null;
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return dt;
  }

  function dmyFromDate(d) {
    var dd = String(d.getUTCDate()).padStart(2, '0');
    var mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    var yyyy = String(d.getUTCFullYear());
    return dd + '/' + mm + '/' + yyyy;
  }

  function formatDateDMY(iso) {
    var d = parseISODateUTC(iso);
    if (!d) return iso ? String(iso) : '';
    return dmyFromDate(d);
  }

  function formatDateDMYPlanner(iso) {
    var d = parseISODateUTCPlanner(iso);
    if (!d) return iso ? String(iso) : '—';
    return dmyFromDate(d);
  }

  function formatDMY(iso) {
    var d = parseISODateUTC(iso);
    if (!d) return '';
    return dmyFromDate(d);
  }

  root.BookingFormat = {
    DEFAULT_CURRENCY: DEFAULT_CURRENCY,
    normalizeCurrency: normalizeCurrency,
    formatMoney: formatMoney,
    currencyMarkHTML: currencyMarkHTML,
    parseISODateUTC: parseISODateUTC,
    parseISODateUTCPlanner: parseISODateUTCPlanner,
    formatDateDMY: formatDateDMY,
    formatDateDMYPlanner: formatDateDMYPlanner,
    formatDMY: formatDMY
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
