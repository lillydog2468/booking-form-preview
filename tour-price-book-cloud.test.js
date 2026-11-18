const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, 'sql/25_tour_price_book.sql'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

function loadMerge() {
  const context = {};
  vm.createContext(context);
  vm.runInContext([
    extractFunction('cleanStoredPrice'),
    extractFunction('cleanParkHotelPrice'),
    extractFunction('emptyPriceBook'),
    extractFunction('normalisePriceBook'),
    extractFunction('mergePriceBookYears'),
  ].join('\n'), context);
  return context.mergePriceBookYears;
}

test('the shared price book table is granted and seeded without replacing an existing row', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.tour_price_book/);
  assert.match(sql, /id\s+TEXT PRIMARY KEY DEFAULT 'main'/);
  assert.match(sql, /book\s+JSONB NOT NULL/);
  assert.match(sql, /updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FOR SELECT[\s\S]*TO authenticated[\s\S]*USING \(true\)/);
  assert.match(sql, /FOR INSERT[\s\S]*TO authenticated[\s\S]*WITH CHECK \(true\)/);
  assert.match(sql, /FOR UPDATE[\s\S]*TO authenticated[\s\S]*USING \(true\)[\s\S]*WITH CHECK \(true\)/);
  assert.match(sql, /GRANT SELECT ON TABLE public\.tour_price_book TO anon/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.tour_price_book TO authenticated, service_role/);
  assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
  assert.match(sql, /"dayTrip": "120"/);
  assert.match(sql, /"1": "285"/);
  assert.match(sql, /"2": "400"/);
  assert.match(sql, /"3": "530"/);
  assert.match(sql, /"4": "670"/);
  assert.match(sql, /"5": "800"/);
  assert.match(sql, /"dayTrip": "124"/);
  assert.match(sql, /"1": "294"/);
  assert.match(sql, /"2": "412"/);
  assert.match(sql, /"3": "546"/);
  assert.match(sql, /"4": "690"/);
  assert.match(sql, /"5": "805"/);
  assert.match(sql, /"parkHotelPrice": "41"/);
});

test('a browser year is added and a year already on the server is left as it is', () => {
  const merge = loadMerge();
  const remote = {
    years: {
      '2026': { dayTrip: '120', beading: { '3': '530' } },
      '2027': { dayTrip: '124', beading: { '5': '805' } },
    },
    parkHotelPrice: '41',
  };
  const local = {
    years: {
      '2026': { dayTrip: '99', beading: { '3': '1', '9': '999' } },
      '2028': { dayTrip: '130', beading: { '2': '450' } },
    },
    parkHotelPrice: '55',
  };
  const merged = merge(remote, local);
  assert.equal(merged.changed, true);
  assert.equal(merged.book.years['2026'].dayTrip, '120');
  assert.equal(merged.book.years['2026'].beading['3'], '530');
  assert.equal(merged.book.years['2026'].beading['9'], undefined);
  assert.equal(merged.book.years['2027'].dayTrip, '124');
  assert.equal(merged.book.years['2028'].dayTrip, '130');
  assert.equal(merged.book.years['2028'].beading['2'], '450');
  assert.equal(merged.book.parkHotelPrice, '41');
});

test('an empty server price is filled from this browser, and a failed read is not a save', () => {
  const merge = loadMerge();
  const filled = merge(
    { years: { '2026': { dayTrip: '120', beading: {} } }, parkHotelPrice: '' },
    { years: {}, parkHotelPrice: '55' }
  );
  assert.equal(filled.changed, true);
  assert.equal(filled.book.parkHotelPrice, '55');
  assert.equal(filled.book.years['2026'].dayTrip, '120');
  const same = merge(
    { years: { '2026': { dayTrip: '120', beading: { '1': 285 } } }, parkHotelPrice: 41 },
    { years: { '2026': { dayTrip: '120', beading: { '1': '285' } } }, parkHotelPrice: '41' }
  );
  assert.equal(same.changed, false);
  assert.equal(same.book.years['2026'].beading['1'], '285');
  assert.match(html, /function loadSharedPriceBook\(/);
  assert.match(html, /from\('tour_price_book'\)\.select\('book'\)/);
  assert.match(html, /priceBookCloudLoaded = false/);
  assert.match(html, /if \(merged\.changed\) await savePriceBookToCloud\(\)/);
  assert.match(html, /schedulePriceBookCloudSave\(\)/);
  assert.match(html, /setTimeout\(function \(\) \{[\s\S]*savePriceBookToCloud\(\)/);
  assert.match(html, /localStorage\.setItem\(PRICE_BOOK_KEY/);
  assert.match(html, /openEditor\(session\.user\.email, role\);\s*loadSharedPriceBook\(\)/);
  assert.match(html, /keith_tour_price_book_v1/);
});
