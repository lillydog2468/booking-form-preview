const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const src = fs.readFileSync(path.join(root, 'admin-users.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const gate = fs.readFileSync(path.join(root, 'auth-gate.js'), 'utf8');

function load() {
  const ctx = {};
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.AdminUsers;
}

function stub() {
  const calls = [];
  return {
    calls: calls,
    from(table) {
      return {
        update(payload) {
          return { eq(column, id) { calls.push({ op: 'update', table, payload, column, id }); return { error: null }; } };
        },
        delete() {
          return { eq(column, id) { calls.push({ op: 'delete', table, column, id }); return { error: null }; } };
        },
      };
    },
  };
}

const self = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';

test('user buttons carry a quoted id and do not paste it into onclick', () => {
  const A = load();
  const html = A.userRowsHtml([
    { id: other, email: 'a@example.com', role: 'user', status: 'active', created_at: '' },
  ]);
  assert.match(html, /data-user-id="22222222-2222-2222-2222-222222222222"/);
  assert.match(html, /data-user-action="status"/);
  assert.match(html, /data-user-action="role"/);
  assert.match(html, /data-user-action="remove"/);
  assert.equal(html.includes('onclick='), false);
  assert.match(admin, /data-user-action/);
  assert.equal(admin.includes('onclick="toggleUserStatus('), false);
  assert.equal(admin.includes("from('hotels')"), false);
  assert.equal(admin.includes('id="sectionHotels"'), false);
  assert.equal(admin.includes('id="statHotels"'), false);
  assert.equal(admin.includes('>Hotels<'), false);
});

test('ids match as strings, and you cannot lock yourself out or remove the last admin', () => {
  const A = load();
  assert.equal(A.sameId(other, other), true);
  assert.equal(A.sameId(12, '12'), true);
  assert.equal(A.sameId(other, self), false);
  const users = [
    { id: self, email: 'me@example.com', role: 'admin', status: 'active' },
    { id: other, email: 'them@example.com', role: 'admin', status: 'active' },
  ];
  assert.equal(A.guard(users, self, self, 'disable').ok, false);
  assert.equal(A.guard(users, self, self, 'demote').ok, false);
  assert.equal(A.guard(users, self, self, 'remove').ok, false);
  assert.equal(A.guard(users, other, self, 'demote').ok, true);
  const only = [users[0]];
  assert.equal(A.guard(only, self, 'someone-else', 'disable').ok, false);
  assert.match(A.guard(only, self, 'someone-else', 'remove').message, /active admin/);
  const copy = A.confirmCopy(users[1], 'remove');
  assert.match(copy.message, /access to the booking form/);
  assert.match(copy.message, /sign-in still exists/);
});

test('status, role and remove talk to profiles with a string id', async () => {
  const A = load();
  const sb = stub();
  await A.setStatus(sb, other, 'disabled');
  await A.setRole(sb, other, 'user');
  await A.removeProfile(sb, other);
  assert.deepEqual(sb.calls.map(call => call.op), ['update', 'update', 'delete']);
  sb.calls.forEach(call => {
    assert.equal(call.table, 'profiles');
    assert.equal(call.id, other);
    assert.equal(typeof call.id, 'string');
  });
  assert.equal(sb.calls[0].payload.status, 'disabled');
  assert.equal(sb.calls[1].payload.role, 'user');
});

test('a disabled profile is signed out and told so', () => {
  assert.match(gate, /profile\.status === 'disabled'/);
  assert.match(gate, /auth\.signOut\(\)/);
  assert.match(gate, /Your account has been disabled\./);
  assert.match(gate, /__accountDisabled/);
});
