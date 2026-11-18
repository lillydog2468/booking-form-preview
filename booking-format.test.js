const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const formatSrc = fs.readFileSync(path.join(root, 'booking-format.js'), 'utf8');
const configSrc = fs.readFileSync(path.join(root, 'booking-config.js'), 'utf8');

const DATE_INPUTS = [
  null,
  undefined,
  '',
  ' ',
  '  2027-04-11  ',
  '2027-04-11',
  '2026-05-28',
  '2027-02-31',
  '2027-02-29',
  '2024-02-29',
  '2027-04-11T00:00:00',
  '2027-04-11 extra',
  'not-a-date',
  '2027-4-11',
  '11/04/2027',
  '2027-13-01',
  '2027-00-10',
  '2027-04-00',
  0,
  false,
  true,
  20270411,
  '2027-04-11\n',
  '\t2027-04-11'
];

const MONEY_INPUTS = [0, 10, 10.5, 10.555, -3, null, undefined, '', '12.3', NaN, Infinity, -Infinity, 'nope', '1,200', '0.00'];

const OLD_FORM = `
  const DEFAULT_CURRENCY = 'GBP';
  function normalizeCurrency() { return DEFAULT_CURRENCY; }
  function formatMoney(amount) {
    const n = Number(amount);
    const value = Number.isFinite(n) ? n : 0;
    return new Intl.NumberFormat('en-GB', {
      style: 'currency', currency: 'GBP',
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(value);
  }
  function currencyMarkHTML() {
    return '<span class="currency-fixed" aria-hidden="true">£</span>';
  }
  function parseISODateUTC(iso) {
    if (!iso) return null;
    const m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(String(iso).trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
    return new Date(Date.UTC(y, mo - 1, d));
  }
  function formatDateDMY(iso) {
    const d = parseISODateUTC(iso);
    if (!d) return iso ? String(iso) : '';
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getUTCFullYear());
    return dd + '/' + mm + '/' + yyyy;
  }
`;

const OLD_ANALYTICS = `
  const DEFAULT_CURRENCY = 'GBP';
  function normalizeCurrency() { return DEFAULT_CURRENCY; }
  function formatMoney(amount) {
    const n = Number(amount);
    const value = Number.isFinite(n) ? n : 0;
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  function parseISODateUTC(iso) {
    if (!iso) return null;
    const m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(String(iso).trim());
    if (!m) return null;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  function formatDateDMY(iso) {
    const d = parseISODateUTC(iso);
    if (!d) return iso ? String(iso) : '';
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getUTCFullYear());
    return dd + '/' + mm + '/' + yyyy;
  }
`;

const OLD_HOTELS = `
  function parseISODateUTC(iso) {
    const m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(String(iso || '').trim());
    if (!m) return null;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  function formatDateDMY(iso) {
    const d = parseISODateUTC(iso);
    if (!d) return iso ? String(iso) : '';
    return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
  }
`;

const OLD_PLANNER = `
  function parseISODateUTC(iso) {
    if (!iso) return null;
    const m = /^(\\d{4})-(\\d{2})-(\\d{2})/.exec(String(iso));
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return dt;
  }
  function formatDateDMY(iso) {
    const d = parseISODateUTC(iso);
    if (!d) return iso ? String(iso) : '—';
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getUTCFullYear());
    return dd + '/' + mm + '/' + yyyy;
  }
`;

const OLD_DIRECTORY = `
  function parseISODateUTC(iso) {
    var m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(String(iso || '').trim());
    if (!m) return null;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  function formatDMY(iso) {
    var d = parseISODateUTC(iso);
    if (!d) return '';
    return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
  }
`;

function load(source) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return ctx;
}

const shared = load(formatSrc);

function stamp(ctx, name, value) {
  ctx.__value = value;
  return vm.runInContext(
    '(function () { var d = ' + name + '(__value); return d ? d.getTime() : null; })()',
    ctx
  );
}

function text(ctx, name, value) {
  ctx.__value = value;
  return vm.runInContext(name + '(__value)', ctx);
}

function sameDates(oldCtx, oldName, newName) {
  for (const value of DATE_INPUTS) {
    assert.equal(
      stamp(shared, newName, value),
      stamp(oldCtx, oldName, value),
      newName + ' date ' + JSON.stringify(value)
    );
  }
}

function sameText(oldCtx, oldName, newName) {
  for (const value of DATE_INPUTS) {
    assert.equal(
      text(shared, newName, value),
      text(oldCtx, oldName, value),
      newName + ' text ' + JSON.stringify(value)
    );
  }
}

test('shared dates match the old form, analytics, hotels and directory helpers', () => {
  const form = load(OLD_FORM);
  const analytics = load(OLD_ANALYTICS);
  const hotels = load(OLD_HOTELS);
  const directory = load(OLD_DIRECTORY);
  sameDates(form, 'parseISODateUTC', 'BookingFormat.parseISODateUTC');
  sameText(form, 'formatDateDMY', 'BookingFormat.formatDateDMY');
  sameDates(analytics, 'parseISODateUTC', 'BookingFormat.parseISODateUTC');
  sameText(analytics, 'formatDateDMY', 'BookingFormat.formatDateDMY');
  sameDates(hotels, 'parseISODateUTC', 'BookingFormat.parseISODateUTC');
  sameText(hotels, 'formatDateDMY', 'BookingFormat.formatDateDMY');
  sameDates(directory, 'parseISODateUTC', 'BookingFormat.parseISODateUTC');
  sameText(directory, 'formatDMY', 'BookingFormat.formatDMY');
});

test('shared planner dates match the old planner helpers, including the em dash', () => {
  const planner = load(OLD_PLANNER);
  sameDates(planner, 'parseISODateUTC', 'BookingFormat.parseISODateUTCPlanner');
  sameText(planner, 'formatDateDMY', 'BookingFormat.formatDateDMYPlanner');
  assert.equal(text(shared, 'BookingFormat.formatDateDMYPlanner', ''), '—');
  assert.equal(text(shared, 'BookingFormat.formatDateDMY', ''), '');
  assert.equal(text(shared, 'BookingFormat.formatDateDMY', '2027-02-31'), '03/03/2027');
  assert.equal(text(shared, 'BookingFormat.formatDateDMYPlanner', '2027-02-31'), '2027-02-31');
  assert.equal(text(shared, 'BookingFormat.formatDateDMYPlanner', '2027-04-11T00:00:00'), '11/04/2027');
  assert.equal(text(shared, 'BookingFormat.formatDateDMY', '2027-04-11T00:00:00'), '2027-04-11T00:00:00');
});

test('shared pounds match the old form and analytics formatters', () => {
  const form = load(OLD_FORM);
  const analytics = load(OLD_ANALYTICS);
  for (const value of MONEY_INPUTS) {
    assert.equal(text(shared, 'BookingFormat.formatMoney', value), text(form, 'formatMoney', value), 'form ' + String(value));
    assert.equal(text(shared, 'BookingFormat.formatMoney', value), text(analytics, 'formatMoney', value), 'analytics ' + String(value));
    form.__value = value;
    analytics.__value = value;
    shared.__value = value;
    assert.equal(
      vm.runInContext('formatMoney(__value, "EUR")', form),
      vm.runInContext('BookingFormat.formatMoney(__value)', shared)
    );
  }
  for (const value of ['EUR', 'USD', 'GBP', '', null, undefined]) {
    form.__value = value;
    analytics.__value = value;
    assert.equal(vm.runInContext('normalizeCurrency(__value)', form), 'GBP');
    assert.equal(vm.runInContext('normalizeCurrency(__value)', analytics), text(shared, 'BookingFormat.normalizeCurrency', value));
  }
  assert.equal(text(shared, 'BookingFormat.currencyMarkHTML', null), text(form, 'currencyMarkHTML', null));
  assert.equal(shared.BookingFormat.DEFAULT_CURRENCY, 'GBP');
});

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  let i = source.indexOf('{', start);
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

function pageRunner(html, names) {
  const ctx = load(formatSrc);
  vm.runInContext(names.map(name => extractFunction(html, name)).join('\n'), ctx);
  return ctx;
}

test('the pages call the shared helpers and still match the old output', () => {
  const formHtml = require('./test-page').pageSource(path.join(root, 'booking-form.html'), 'utf8');
  const analyticsHtml = fs.readFileSync(path.join(root, 'analytics.html'), 'utf8');
  const hotelsHtml = require('./test-page').pageSource(path.join(root, 'hotels.html'), 'utf8');
  const plannerHtml = require('./test-page').pageSource(path.join(root, 'tour-planner.html'), 'utf8');
  const directory = fs.readFileSync(path.join(root, 'hotel-directory.js'), 'utf8');

  for (const html of [formHtml, analyticsHtml, hotelsHtml, plannerHtml]) {
    assert.match(html, /src="booking-format\.js"/);
  }
  assert.match(directory, /BookingFormat\.parseISODateUTC/);
  assert.match(directory, /BookingFormat\.formatDMY/);
  assert.match(extractFunction(formHtml, 'formatMoney'), /BookingFormat\.formatMoney/);
  assert.match(extractFunction(formHtml, 'parseISODateUTC'), /BookingFormat\.parseISODateUTC\(iso\)/);
  assert.match(extractFunction(plannerHtml, 'parseISODateUTC'), /parseISODateUTCPlanner/);
  assert.match(extractFunction(plannerHtml, 'formatDateDMY'), /formatDateDMYPlanner/);

  const formPage = pageRunner(formHtml, ['normalizeCurrency', 'formatMoney', 'currencyMarkHTML', 'parseISODateUTC', 'formatDateDMY']);
  const analyticsPage = pageRunner(analyticsHtml, ['normalizeCurrency', 'formatMoney', 'parseISODateUTC', 'formatDateDMY']);
  const hotelsPage = pageRunner(hotelsHtml, ['parseISODateUTC', 'formatDateDMY']);
  const plannerPage = pageRunner(plannerHtml, ['parseISODateUTC', 'formatDateDMY']);
  const oldForm = load(OLD_FORM);
  const oldAnalytics = load(OLD_ANALYTICS);
  const oldHotels = load(OLD_HOTELS);
  const oldPlanner = load(OLD_PLANNER);

  for (const value of DATE_INPUTS) {
    assert.equal(stamp(formPage, 'parseISODateUTC', value), stamp(oldForm, 'parseISODateUTC', value));
    assert.equal(text(formPage, 'formatDateDMY', value), text(oldForm, 'formatDateDMY', value));
    assert.equal(stamp(analyticsPage, 'parseISODateUTC', value), stamp(oldAnalytics, 'parseISODateUTC', value));
    assert.equal(text(analyticsPage, 'formatDateDMY', value), text(oldAnalytics, 'formatDateDMY', value));
    assert.equal(stamp(hotelsPage, 'parseISODateUTC', value), stamp(oldHotels, 'parseISODateUTC', value));
    assert.equal(text(hotelsPage, 'formatDateDMY', value), text(oldHotels, 'formatDateDMY', value));
    assert.equal(stamp(plannerPage, 'parseISODateUTC', value), stamp(oldPlanner, 'parseISODateUTC', value));
    assert.equal(text(plannerPage, 'formatDateDMY', value), text(oldPlanner, 'formatDateDMY', value));
  }
  for (const value of MONEY_INPUTS) {
    assert.equal(text(formPage, 'formatMoney', value), text(oldForm, 'formatMoney', value));
    assert.equal(text(analyticsPage, 'formatMoney', value), text(oldAnalytics, 'formatMoney', value));
  }
});

test('the public Supabase URL and key live in one config file', () => {
  const config = load(configSrc);
  const url = config.BOOKING_SUPABASE_URL;
  const key = config.BOOKING_SUPABASE_ANON_KEY;
  assert.equal(url, 'https://ojulhplswtcmheonsnlv.supabase.co');
  assert.match(key, /^eyJ/);
  const pages = [
    'booking-form.html',
    'tour-planner.html',
    'hotels.html',
    'analytics.html',
    'admin.html',
    'places-stats.html',
    'tax-summary.html',
    'interest-2027.html'
  ];
  for (const name of pages) {
    const html = require('./test-page').pageSource(path.join(root, name));
    assert.match(html, /src="booking-config\.js"/, name);
    assert.match(html, /const SUPABASE_URL = BOOKING_SUPABASE_URL/, name);
    assert.match(html, /const SUPABASE_ANON_KEY = BOOKING_SUPABASE_ANON_KEY/, name);
    assert.match(html, /AuthGate\.createClient\(SUPABASE_URL, SUPABASE_ANON_KEY\)/, name);
    assert.equal(html.includes(url), false, name + ' still has the URL');
    assert.equal(html.includes(key), false, name + ' still has the key');
  }
  const htmlFiles = fs.readdirSync(root).filter(name => name.endsWith('.html'));
  assert.equal(htmlFiles.length, pages.length + 1);
  for (const name of htmlFiles) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    assert.equal(html.includes(key), false, name);
  }
});

test('the planner menu no longer says WIP, and the tax page uses the site header', () => {
  for (const name of ['booking-form.html', 'analytics.html']) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    assert.equal(html.includes('>WIP<'), false, name);
    assert.match(html, /href="tour-planner\.html"/);
  }
  const tax = fs.readFileSync(path.join(root, 'tax-summary.html'), 'utf8');
  assert.match(tax, /DM Sans/);
  assert.equal(tax.includes('Georgia'), false);
  assert.match(tax, /class="view-nav"/);
  assert.match(tax, /id="interestNav" hidden/);
  assert.match(tax, /interestNav\.hidden = false/);
});
