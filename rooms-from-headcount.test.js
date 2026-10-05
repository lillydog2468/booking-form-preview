const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
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

function load() {
  const nodes = new Map();
  function make(id, extra) {
    const node = Object.assign({ id, value: '', checked: false, dataset: {} }, extra || {});
    nodes.set(id, node);
    return node;
  }
  const context = {
    nodes,
    make,
    tEl(tabId, key) { return nodes.get('t' + tabId + '_' + key) || null; },
    fieldVal(tabId, key) { return String((context.tEl(tabId, key) && context.tEl(tabId, key).value) || '').trim(); },
    tabIsDayTrip(tabId) { return !!(context.tEl(tabId, 'day_trip') && context.tEl(tabId, 'day_trip').checked); },
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction('roomCountBlank'),
    extractFunction('headcountPeople'),
    extractFunction('markRoomsTyped'),
    extractFunction('suggestRoomsFromHeadcount'),
    extractFunction('savedKeithRoomOff'),
    extractFunction('noteLoadedRooms'),
  ].join('\n'), context, { filename: 'rooms-from-headcount.js' });
  context.fresh = () => {
    nodes.clear();
    make('t1_no_people');
    make('t1_rooms_singles');
    make('t1_rooms_twins');
    make('t1_rooms_doubles');
    make('t1_rooms_keith', { checked: true });
    make('t1_day_trip');
  };
  return context;
}

test('five people set five singles and keep Keith’s own room on', () => {
  const ctx = load();
  ctx.fresh();
  ctx.nodes.get('t1_no_people').value = '5';
  ctx.nodes.get('t1_rooms_keith').checked = false;
  vm.runInContext('suggestRoomsFromHeadcount("1")', ctx);
  assert.equal(ctx.nodes.get('t1_rooms_singles').value, '5');
  assert.equal(ctx.nodes.get('t1_rooms_keith').checked, true);
  assert.equal(ctx.nodes.get('t1_rooms_twins').value, '');
  assert.equal(ctx.nodes.get('t1_rooms_doubles').value, '');
  assert.equal(ctx.nodes.get('t1_rooms_singles').dataset.roomsSource, 'headcount');
});

test('a later headcount updates the auto singles until the rooms are edited', () => {
  const ctx = load();
  ctx.fresh();
  ctx.nodes.get('t1_no_people').value = '5';
  vm.runInContext('suggestRoomsFromHeadcount("1")', ctx);
  ctx.nodes.get('t1_no_people').value = '7';
  vm.runInContext('suggestRoomsFromHeadcount("1")', ctx);
  assert.equal(ctx.nodes.get('t1_rooms_singles').value, '7');
  assert.equal(ctx.nodes.get('t1_rooms_keith').checked, true);

  ctx.nodes.get('t1_rooms_singles').value = '2';
  vm.runInContext('markRoomsTyped("1")', ctx);
  ctx.nodes.get('t1_no_people').value = '9';
  vm.runInContext('suggestRoomsFromHeadcount("1")', ctx);
  assert.equal(ctx.nodes.get('t1_rooms_singles').value, '2');
  assert.equal(ctx.nodes.get('t1_rooms_singles').dataset.roomsSource, 'typed');
});

test('unticking Keith’s room stops the auto-fill', () => {
  const ctx = load();
  ctx.fresh();
  ctx.nodes.get('t1_rooms_keith').checked = false;
  vm.runInContext('markRoomsTyped("1")', ctx);
  ctx.nodes.get('t1_no_people').value = '5';
  vm.runInContext('suggestRoomsFromHeadcount("1")', ctx);
  assert.equal(ctx.nodes.get('t1_rooms_singles').value, '');
  assert.equal(ctx.nodes.get('t1_rooms_keith').checked, false);
});

test('twins already filled are left alone', () => {
  const ctx = load();
  ctx.fresh();
  ctx.nodes.get('t1_rooms_twins').value = '2';
  ctx.nodes.get('t1_no_people').value = '5';
  vm.runInContext('suggestRoomsFromHeadcount("1")', ctx);
  assert.equal(ctx.nodes.get('t1_rooms_singles').value, '');
  assert.equal(ctx.nodes.get('t1_rooms_twins').value, '2');
  assert.equal(ctx.nodes.get('t1_rooms_singles').dataset.roomsSource, 'typed');
});

test('clearing the headcount clears singles that came from it', () => {
  const ctx = load();
  ctx.fresh();
  ctx.nodes.get('t1_no_people').value = '5';
  vm.runInContext('suggestRoomsFromHeadcount("1")', ctx);
  ctx.nodes.get('t1_no_people').value = '';
  vm.runInContext('suggestRoomsFromHeadcount("1")', ctx);
  assert.equal(ctx.nodes.get('t1_rooms_singles').value, '');
  assert.equal(ctx.nodes.get('t1_rooms_singles').dataset.roomsSource, '');
  assert.equal(ctx.nodes.get('t1_rooms_keith').checked, true);
});

test('a day trip does not receive rooms from the headcount', () => {
  const ctx = load();
  ctx.fresh();
  ctx.nodes.get('t1_day_trip').checked = true;
  ctx.nodes.get('t1_no_people').value = '5';
  vm.runInContext('suggestRoomsFromHeadcount("1")', ctx);
  assert.equal(ctx.nodes.get('t1_rooms_singles').value, '');
});

test('a saved room plan or Keith’s room turned off is not replaced on load', () => {
  const ctx = load();
  ctx.fresh();
  ctx.nodes.get('t1_no_people').value = '5';
  ctx.nodes.get('t1_rooms_singles').value = '3';
  vm.runInContext('noteLoadedRooms("1", { rooms: { singles: "3", keithRoom: true } }, null)', ctx);
  assert.equal(ctx.nodes.get('t1_rooms_singles').value, '3');
  assert.equal(ctx.nodes.get('t1_rooms_singles').dataset.roomsSource, 'typed');

  ctx.fresh();
  ctx.nodes.get('t1_no_people').value = '5';
  ctx.nodes.get('t1_rooms_keith').checked = true;
  vm.runInContext('noteLoadedRooms("1", { rooms: { keithRoom: false } }, false)', ctx);
  assert.equal(ctx.nodes.get('t1_rooms_singles').value, '');
  assert.equal(ctx.nodes.get('t1_rooms_keith').checked, false);
  assert.equal(ctx.nodes.get('t1_rooms_singles').dataset.roomsSource, 'typed');
});

test('a saved headcount with empty rooms fills singles and Keith’s room', () => {
  const ctx = load();
  ctx.fresh();
  ctx.nodes.get('t1_no_people').value = '5';
  vm.runInContext('noteLoadedRooms("1", null, null)', ctx);
  assert.equal(ctx.nodes.get('t1_rooms_singles').value, '5');
  assert.equal(ctx.nodes.get('t1_rooms_keith').checked, true);
  assert.equal(ctx.nodes.get('t1_rooms_singles').dataset.roomsSource, 'headcount');
});
