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

function input(value, source) {
  return { value, dataset: source ? { nameSource: source } : {} };
}

function load() {
  const nodes = new Map();
  const ctx = {
    document: { getElementById(id) { return nodes.get(id) || null; } },
    fieldVal(tabId, key) {
      return String(ctx.document.getElementById('t' + tabId + '_' + key)?.value || '').trim();
    },
    paintEmptyFields() {},
  };
  vm.createContext(ctx);
  vm.runInContext(extractFunction('applyOrganiserName') + '\n' + extractFunction('fillFirstTravellerFromOrganiser'), ctx);
  return { ctx, nodes };
}

test('the group name is not used for the first traveller', () => {
  const src = extractFunction('fillFirstTravellerFromOrganiser');
  assert.equal(src.includes('group_name'), false);
  assert.equal(src.includes('org_first'), true);
  assert.equal(src.includes('org_last'), true);
});

test('a blank first guest takes the organiser first name and surname only', () => {
  const { ctx, nodes } = load();
  const first = input('', '');
  const last = input('', '');
  const secondFirst = input('', '');
  nodes.set('t1_members_list', {
    querySelector() {
      return { querySelector(sel) { return sel === '.member-first' ? first : last; } };
    },
  });
  nodes.set('t1_org_first', { value: 'Gena' });
  nodes.set('t1_org_last', { value: 'DeRemer' });
  nodes.set('t1_group_name', { value: 'Some other tour label' });
  ctx.fillFirstTravellerFromOrganiser('1');
  assert.equal(first.value, 'Gena');
  assert.equal(first.dataset.nameSource, 'organiser');
  assert.equal(last.value, 'DeRemer');
  assert.equal(last.dataset.nameSource, 'organiser');
  assert.equal(secondFirst.value, '');
});

test('a name Keith typed is left alone, and a blank surname still fills', () => {
  const { ctx, nodes } = load();
  const first = input('Tina', 'typed');
  const last = input('', '');
  nodes.set('t1_members_list', {
    querySelector() {
      return { querySelector(sel) { return sel === '.member-first' ? first : last; } };
    },
  });
  nodes.set('t1_org_first', { value: 'Gena' });
  nodes.set('t1_org_last', { value: 'DeRemer' });
  ctx.fillFirstTravellerFromOrganiser('1');
  assert.equal(first.value, 'Tina');
  assert.equal(last.value, 'DeRemer');
  assert.equal(last.dataset.nameSource, 'organiser');
});

test('an organiser copy follows later edits and a typed name does not', () => {
  const { ctx, nodes } = load();
  const first = input('Gena', 'organiser');
  const last = input('Paul', 'typed');
  nodes.set('t1_members_list', {
    querySelector() {
      return { querySelector(sel) { return sel === '.member-first' ? first : last; } };
    },
  });
  nodes.set('t1_org_first', { value: 'Gina' });
  nodes.set('t1_org_last', { value: '' });
  ctx.fillFirstTravellerFromOrganiser('1');
  assert.equal(first.value, 'Gina');
  assert.equal(last.value, 'Paul');
});
