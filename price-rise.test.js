const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, 'booking-form.html'), 'utf8');

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

function extractRange(startMark, endMark) {
  const start = html.indexOf(startMark);
  const end = html.indexOf(endMark, start + startMark.length);
  assert.ok(start >= 0 && end > start, 'missing price-rise source range');
  return html.slice(start, end);
}

function loadPriceRise() {
  const store = new Map();
  const inputs = {};
  function makeInput(id) {
    const input = { id, value: '' };
    inputs[id] = input;
    return input;
  }
  const elements = {
    priceBookYears: { innerHTML: '' },
    priceRiseFrom: makeInput('priceRiseFrom'),
    priceRiseTo: makeInput('priceRiseTo'),
    priceRisePct: makeInput('priceRisePct'),
    toastContainer: { appendChild() {} },
  };
  const toasts = [];
  const context = {
    localStorage: {
      getItem(key) { return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { store.set(key, String(value)); },
    },
    document: {
      getElementById(id) { return elements[id] || null; },
      createElement() { return { remove() {} }; },
    },
    setTimeout() { return 0; },
    refreshPricesOnOpenTabs() {},
    console,
    toasts,
    inputs,
  };
  context.toast = function toast(msg, type) { toasts.push({ msg, type }); };
  vm.createContext(context);
  const source = [
    extractFunction('el'),
    extractFunction('escapeHtml'),
    extractFunction('escapeAttr'),
    extractRange('const PRICE_BOOK_KEY', 'function onPriceBookInput'),
  ].join('\n');
  vm.runInContext(source, context, { filename: 'booking-form-price-rise.js' });
  context.readBook = () => JSON.parse(store.get('keith_tour_price_book_v1'));
  context.seed = (book) => store.set('keith_tour_price_book_v1', JSON.stringify(book));
  return context;
}

test('a percentage rise rounds up to the next whole pound and keeps an exact pound', () => {
  const ctx = loadPriceRise();
  const risen = (amount, pct) => vm.runInContext('risenPrice(' + JSON.stringify(String(amount)) + ',' + JSON.stringify(String(pct)) + ')', ctx);

  assert.equal(risen('100', '3'), '103');
  assert.equal(risen('101', '3'), '105');
  assert.equal(risen('100', '4.01'), '105');
  assert.equal(risen('104.01', '0'), '105');
  assert.equal(risen('103', '0'), '103');
  assert.equal(risen('100.00', '3'), '103');
  assert.equal(risen('250.40', '3'), '258');
  assert.equal(risen('200', '1.5'), '203');
  assert.equal(risen('0', '3'), '0');
  assert.match(risen('101', '3'), /^\d+$/);
});

test('only prices copied by the rise change, and each of those is a whole pound', () => {
  const ctx = loadPriceRise();
  ctx.seed({
    years: {
      '2025': { dayTrip: '99.50', beading: { '4': '80.25' } },
      '2026': { dayTrip: '100', beading: { '4': '101', '6': '250.40', '2': '' } },
      '2027': { dayTrip: '90.10', beading: { '7': '180.25', '4': '1.00' } },
    },
  });
  ctx.inputs.priceRiseFrom.value = '2026';
  ctx.inputs.priceRiseTo.value = '2027';
  ctx.inputs.priceRisePct.value = '3';
  vm.runInContext('applyPriceRise()', ctx);

  const book = ctx.readBook();
  assert.deepEqual(book.years['2025'], { dayTrip: '99.50', beading: { '4': '80.25' } });
  assert.deepEqual(book.years['2026'], { dayTrip: '100', beading: { '4': '101', '6': '250.40', '2': '' } });
  assert.equal(book.years['2027'].dayTrip, '103');
  assert.equal(book.years['2027'].beading['4'], '105');
  assert.equal(book.years['2027'].beading['6'], '258');
  assert.equal(book.years['2027'].beading['7'], '180.25');
  assert.equal(book.years['2027'].beading['2'], undefined);
  assert.equal(ctx.toasts.at(-1).type, 'success');
  assert.match(ctx.toasts.at(-1).msg, /rounded up to the next whole pound/);
});

test('tour prices sit under hotels, not above the booking tabs', () => {
  const mainStart = html.indexOf('<div class="main-area">');
  const tabBar = html.indexOf('id="tabBar"', mainStart);
  assert.ok(mainStart >= 0 && tabBar > mainStart);
  assert.equal(html.slice(mainStart, tabBar).includes('id="priceBook"'), false);
  assert.match(html, /<div id="priceBookPark" hidden>/);
  const hotelStart = html.indexOf('function hotelEditorHTML(');
  const hotelEnd = html.indexOf('function buildFormHTML(', hotelStart);
  assert.match(html.slice(hotelStart, hotelEnd), /id="t\$\{t\}_price_book_slot"/);
  assert.match(extractFunction('risenPrice'), /Math\.ceil\(raised\)/);
});

test('the price list moves into the open booking’s hotels slot and back again', () => {
  const nodes = new Map();
  function makeEl(id) {
    const node = {
      id,
      parentElement: null,
      children: [],
      appendChild(child) {
        if (child.parentElement) {
          const parent = child.parentElement;
          parent.children = parent.children.filter((item) => item !== child);
        }
        child.parentElement = node;
        node.children.push(child);
        return child;
      },
      contains(other) {
        if (other === node) return true;
        return node.children.some((child) => child === other || child.contains(other));
      },
    };
    nodes.set(id, node);
    return node;
  }
  const park = makeEl('priceBookPark');
  const book = makeEl('priceBook');
  park.appendChild(book);
  const slot = makeEl('ttab1_price_book_slot');
  const context = {
    document: {
      getElementById(id) { return nodes.get(id) || null; },
    },
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('el'),
    extractFunction('tEl'),
    extractFunction('parkPriceBook'),
    extractFunction('dockPriceBook'),
  ].join('\n'), context);

  vm.runInContext('dockPriceBook("tab1")', context);
  assert.equal(book.parentElement, slot);
  assert.equal(park.contains(book), false);

  vm.runInContext('dockPriceBook(null)', context);
  assert.equal(book.parentElement, park);
  assert.equal(slot.contains(book), false);
});

test('an empty source price is not copied, so the destination price stays as it was', () => {
  const ctx = loadPriceRise();
  ctx.seed({
    years: {
      '2026': { dayTrip: '', beading: { '4': '100' } },
      '2027': { dayTrip: '77.40', beading: { '4': '1.50', '9': '50.50' } },
    },
  });
  ctx.inputs.priceRiseFrom.value = '2026';
  ctx.inputs.priceRiseTo.value = '2027';
  ctx.inputs.priceRisePct.value = '3';
  vm.runInContext('applyPriceRise()', ctx);

  const next = ctx.readBook().years['2027'];
  assert.equal(next.dayTrip, '77.40');
  assert.equal(next.beading['4'], '103');
  assert.equal(next.beading['9'], '50.50');
});
