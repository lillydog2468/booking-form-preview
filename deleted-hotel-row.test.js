const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('node:vm');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

function loadPatch() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction('normHotelName'),
    extractFunction('looseHotelName'),
    extractFunction('findPlanHotelIndex'),
    extractFunction('patchHotelsArray'),
  ].join('\n'), ctx);
  return ctx;
}

test('deleting hotel 2 drops it from the plan list instead of keeping it', () => {
  const api = loadPatch();
  const saved = [
    { hotelName: 'Park hotel', role: 'tour', booked: false, paid: '', notes: '' },
    { hotelName: 'Familia', role: 'extra', booked: false, paid: '', notes: 'test' },
  ];
  const stillOnForm = [{ hotelName: 'Park hotel', role: 'tour', booked: false, paid: '' }];
  const next = api.patchHotelsArray(saved, stillOnForm);
  assert.equal(next.length, 1);
  assert.equal(next[0].hotelName, 'Park hotel');
  assert.equal(next.some(row => row.hotelName === 'Familia'), false);
});

test('the booking form does not create a hotel row from the plan on load', () => {
  const load = extractFunction('loadPlanForHotelForm');
  assert.equal(load.includes('addPlanOnlyHotelRows('), false);
  const remove = extractFunction('removeHotelStayRow');
  assert.match(remove, /schedulePlanHotelSave\(tabId\)/);
});
