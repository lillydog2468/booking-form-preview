const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const gateSrc = fs.readFileSync(path.join(root, 'auth-gate.js'), 'utf8');

function loadGate(extra) {
  const store = Object.assign({
    length: 0,
    key() { return null; },
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  }, extra && extra.storage);
  const context = {
    localStorage: store,
    navigator: { onLine: extra && extra.onLine === false ? false : true },
    history: { replaceState() {} },
    location: { origin: 'https://bookingkeith.netlify.app', pathname: '/booking-form.html', hash: '', search: '', href: 'https://bookingkeith.netlify.app/booking-form.html' },
    document: {
      getElementById() { return null; },
      createElement() {
        return { id: '', textContent: '', appendChild() {} };
      },
      head: { appendChild() {} },
      body: { appendChild() {} },
    },
    setTimeout,
    clearTimeout,
    URL,
    Promise,
    Proxy,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(gateSrc, context, { filename: 'auth-gate.js' });
  return context;
}

test('the sign-in gate keeps the session and can reset a password', () => {
  assert.match(gateSrc, /persistSession:\s*true/);
  assert.match(gateSrc, /autoRefreshToken:\s*true/);
  assert.match(gateSrc, /storage:\s*window\.localStorage/);
  assert.match(gateSrc, /resetPasswordForEmail/);
  assert.match(gateSrc, /updateUser\(\{\s*password\s*\}\)/);
  assert.match(gateSrc, /Forgot password\?/);
  assert.match(gateSrc, /Choose a new password/);
  assert.match(gateSrc, /navigator\.onLine === false && hasStoredSession\(\)/);
});

test('local mode does not call the database', async () => {
  const ctx = loadGate();
  const calls = [];
  const sb = {
    from(table) { calls.push(table); return { select() { return this; } }; },
    auth: {},
  };
  ctx.AuthGate.useLocalData(sb);
  const res = await sb.from('bookings').select('*').eq('id', 1);
  assert.deepEqual(calls, []);
  assert.equal(res.error.code, 'OFFLINE');
  assert.equal(res.data, null);
});

test('a saved sign-in while offline opens local mode and does not ask the database', async () => {
  const ctx = loadGate({
    onLine: false,
    storage: {
      length: 1,
      key() { return 'sb-ojulhplswtcmheonsnlv-auth-token'; },
    },
  });
  let fromCalls = 0;
  const sb = {
    from() { fromCalls += 1; return ctx.AuthGate.useLocalData ? null : null; },
    auth: {
      onAuthStateChange() {},
      getSession() { throw new Error('should not read the session from the network'); },
    },
  };
  const session = await ctx.AuthGate.require(sb, { title: 'Booking form' });
  assert.equal(session, null);
  assert.equal(fromCalls, 0);
});

test('every page that reads the shared tables signs in before it loads', () => {
  const pages = [
    'booking-form.html',
    'tour-planner.html',
    'hotels.html',
    'analytics.html',
    'admin.html',
    'places-stats.html',
    'tax-summary.html',
  ];
  for (const name of pages) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    assert.match(html, /src="auth-gate\.js"/, name);
    assert.match(html, /AuthGate\.createClient\(/, name);
    assert.match(html, /AuthGate\.require\(/, name);
  }
  const booking = fs.readFileSync(path.join(root, 'booking-form.html'), 'utf8');
  assert.doesNotMatch(booking, /function checkExistingSession/);
  assert.match(booking, /if \(!cloudReady\)/);
  const planner = fs.readFileSync(path.join(root, 'tour-planner.html'), 'utf8');
  assert.match(planner, /if \(!session\) AuthGate\.useLocalData\(sb\)/);
  assert.equal(planner.includes('\n  init();\n'), false);
});
