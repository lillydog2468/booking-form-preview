const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('node:vm');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');

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

function flush() {
  return new Promise(resolve => setImmediate(resolve));
}

function loadGate() {
  const buttons = new Map();
  const ctx = {
    bookingSaveFlights: new Map(),
    tabs: new Map([
      ['1', { bookingId: 315 }],
      ['2', { bookingId: 316 }],
    ]),
    tEl(tabId, suffix) { return buttons.get(tabId + ':' + suffix) || null; },
    buttons,
  };
  buttons.set('1:saveBtn', { disabled: false, attributes: {} });
  buttons.set('2:saveBtn', { disabled: false, attributes: {} });
  ctx.tEl = function (tabId, suffix) {
    const btn = buttons.get(tabId + ':' + suffix);
    if (!btn) return null;
    btn.setAttribute = (name, value) => { btn.attributes[name] = value; };
    btn.removeAttribute = (name) => { delete btn.attributes[name]; };
    return btn;
  };
  vm.createContext(ctx);
  vm.runInContext(
    extractFunction('bookingSaveKey') + '\n' +
    extractFunction('setBookingSaveBusy') + '\n' +
    extractFunction('startBookingSave'),
    ctx
  );
  return ctx;
}

test('the save button is the one control that starts a save', () => {
  const form = html.slice(html.indexOf('function buildFormHTML('), html.indexOf('function buildLayoutFormHTML('));
  assert.match(form, /id="t\$\{t\}_saveBtn"/);
  assert.match(form, /saveBooking\('\$\{t\}', false\)/);
  const save = extractFunction('saveBooking');
  assert.match(save, /if \(!flightPass\) return startBookingSave\(tabId, silent\)/);
  assert.match(extractFunction('scheduleTabAutoSave'), /saveBooking\(tabId, true\)/);
});

test('a second save for the same booking waits, then runs once after the first', async () => {
  const ctx = loadGate();
  const events = [];
  let release = null;
  ctx.saveBooking = async function (tabId, silent, flightPass) {
    if (!flightPass) return ctx.startBookingSave(tabId, silent);
    events.push('delete ' + tabId);
    await new Promise(resolve => { release = resolve; });
    events.push('insert ' + tabId);
  };

  const first = ctx.startBookingSave('1', false);
  await flush();
  assert.deepEqual(events, ['delete 1']);
  assert.equal(ctx.buttons.get('1:saveBtn').disabled, true);
  assert.equal(ctx.buttons.get('1:saveBtn').attributes['aria-busy'], 'true');

  const second = ctx.startBookingSave('1', false);
  const third = ctx.startBookingSave('1', true);
  assert.equal(second, first);
  assert.equal(third, first);
  assert.deepEqual(events, ['delete 1']);

  release();
  await flush();
  assert.deepEqual(events, ['delete 1', 'insert 1', 'delete 1']);
  release();
  await first;
  assert.deepEqual(events, ['delete 1', 'insert 1', 'delete 1', 'insert 1']);
  assert.equal(ctx.buttons.get('1:saveBtn').disabled, false);
  assert.equal(ctx.buttons.get('1:saveBtn').attributes['aria-busy'], undefined);
  assert.equal(ctx.bookingSaveFlights.size, 0);
});

test('two different bookings can save at the same time', async () => {
  const ctx = loadGate();
  const events = [];
  const waiting = [];
  ctx.saveBooking = async function (tabId, silent, flightPass) {
    if (!flightPass) return ctx.startBookingSave(tabId, silent);
    events.push('delete ' + tabId);
    await new Promise(resolve => waiting.push(resolve));
    events.push('insert ' + tabId);
  };

  const a = ctx.startBookingSave('1', false);
  const b = ctx.startBookingSave('2', false);
  await flush();
  assert.deepEqual(events, ['delete 1', 'delete 2']);
  assert.equal(ctx.buttons.get('1:saveBtn').disabled, true);
  assert.equal(ctx.buttons.get('2:saveBtn').disabled, true);
  waiting.forEach(resolve => resolve());
  await Promise.all([a, b]);
  assert.deepEqual(events, ['delete 1', 'delete 2', 'insert 1', 'insert 2']);
  assert.equal(ctx.buttons.get('1:saveBtn').disabled, false);
  assert.equal(ctx.buttons.get('2:saveBtn').disabled, false);
});
